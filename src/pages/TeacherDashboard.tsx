import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { ClassManagementDialog } from '@/components/teacher/ClassManagementDialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { differenceInSeconds } from 'date-fns';

// New Components
import { TeacherHeader } from '@/components/teacher/TeacherHeader';
import { TeacherControls } from '@/components/teacher/TeacherControls';
import { RequestQueue } from '@/components/teacher/RequestQueue';
import { ActivePassList } from '@/components/teacher/ActivePassList';
import { RosterGrid } from '@/components/teacher/RosterGrid';
import { TeacherSettings } from '@/components/teacher/TeacherSettings';

// --- Interfaces ---
interface Student {
  id: string;
  name: string;
  email: string;
}

interface ClassInfo {
  id: string;
  name: string;
  period_order: number;
  join_code: string;
  max_concurrent_bathroom?: number;
  is_queue_autonomous?: boolean;
}

interface Pass {
  id: string;
  student_id: string;
  class_id: string;
  destination: string;
  status: 'pending' | 'approved' | 'active' | 'returned' | 'denied';
  created_at: string;
  approved_at?: string;
  profiles: { full_name: string };
  is_quota_exceeded?: boolean;
}

interface FreezeStatus {
  id: string;
  freeze_type: 'bathroom' | 'all';
  frozen_until: string | null;
}

interface Settings {
  max_concurrent_bathroom: number;
}

export const TeacherDashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<{ id: string, full_name: string, role: string, email?: string } | null>(null);
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [students, setStudents] = useState<Student[]>([]);
  const [pendingPasses, setPendingPasses] = useState<Pass[]>([]);
  const [activePasses, setActivePasses] = useState<Pass[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [activeFreeze, setActiveFreeze] = useState<FreezeStatus | null>(null);
  const [isFreezeLoading, setIsFreezeLoading] = useState(false);
  const [freezeType, setFreezeType] = useState<'bathroom' | 'all'>('bathroom');
  const [timerMinutes, setTimerMinutes] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false); // Class Management Dialog

  // --- Auth & Initial Data ---
  useEffect(() => {
    checkUser();
  }, []);

  useEffect(() => {
    if (selectedClassId) {
      // Set up real-time subscription for passes
      const channel = supabase
        .channel('public:passes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'passes', filter: `class_id=eq.${selectedClassId}` }, () => {
          fetchPasses();
        })
        .subscribe();

      // Set up real-time subscription for freeze status
      const freezeChannel = supabase
        .channel('public:class_freezes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'class_freezes', filter: `class_id=eq.${selectedClassId}` }, () => {
          fetchFreezeStatus(selectedClassId);
        })
        .subscribe();

      // Set up real-time subscription for class updates (auto queue)
      const classChannel = supabase
        .channel('public:classes')
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'classes', filter: `id=eq.${selectedClassId}` }, (payload) => {
          setClasses(prev => prev.map(c => c.id === payload.new.id ? { ...c, ...payload.new } : c));
        })
        .subscribe();


      fetchStudents();
      fetchPasses();
      fetchFreezeStatus(selectedClassId);

      return () => {
        supabase.removeChannel(channel);
        supabase.removeChannel(freezeChannel);
        supabase.removeChannel(classChannel);
      };
    }
  }, [selectedClassId]);

  const checkUser = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate('/auth'); return; }

      const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      if (!profile || profile.role !== 'teacher') { navigate('/'); return; }

      setProfile({ ...profile, email: user.email });
      const userId = user.id;

      // Fetch Global Settings
      const { data: membership } = await supabase.from('organization_memberships').select('organization_id').eq('user_id', userId).single();

      if (membership?.organization_id) {
        const { data: orgData } = await supabase
          .from('organization_settings')
          .select('max_concurrent_bathroom, organization_id')
          .eq('organization_id', membership.organization_id)
          .single();
        if (orgData) setSettings(orgData);
      }

      await fetchClasses(userId);
    } catch (error) {
      console.error("Error checking user:", error);
      toast({ title: "Error loading dashboard", description: "Please refresh the page.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const fetchClasses = useCallback(async (userId?: string) => {
    const uid = userId || profile?.id;
    if (!uid) return;
    const { data } = await supabase.from('classes').select('id, name, period_order, join_code, max_concurrent_bathroom, is_queue_autonomous').eq('teacher_id', uid).order('period_order');
    if (data && data.length > 0) {
      setClasses(data);
      if (!selectedClassId) setSelectedClassId(data[0].id);
    }
  }, [profile, selectedClassId]);

  // --- Actions ---
  const signOut = async () => { await supabase.auth.signOut(); navigate('/login'); };

  const fetchFreezeStatus = useCallback(async (classId: string) => {
    if (!classId) return;
    const { data } = await supabase.from('class_freezes').select('*').eq('class_id', classId).is('ended_at', null).maybeSingle();

    // Check if expired
    if (data && data.frozen_until && new Date(data.frozen_until) < new Date()) {
      setActiveFreeze(null);
    } else {
      setActiveFreeze(data);
    }
  }, []);

  const handleFreeze = async () => {
    if (!selectedClassId) return;
    setIsFreezeLoading(true);
    let frozenUntil = null;
    if (timerMinutes) {
      const date = new Date();
      date.setMinutes(date.getMinutes() + parseInt(timerMinutes));
      frozenUntil = date.toISOString();
    }

    const { error } = await supabase.from('class_freezes').insert({
      class_id: selectedClassId,
      freeze_type: freezeType,
      frozen_until: frozenUntil
    });

    if (error) toast({ title: "Error", description: "Failed to freeze queue", variant: "destructive" });
    else {
      toast({ title: "Queue Frozen", description: "Students cannot request passes." });
      setTimerMinutes('');
      fetchFreezeStatus(selectedClassId);
    }
    setIsFreezeLoading(false);
  };

  const handleUnfreeze = async () => {
    if (!activeFreeze) return;
    setIsFreezeLoading(true);
    const { error } = await supabase.from('class_freezes').update({ ended_at: new Date().toISOString() }).eq('id', activeFreeze.id);
    if (error) toast({ title: "Error", description: "Failed to unfreeze", variant: "destructive" });
    else {
      toast({ title: "Queue Unfrozen", description: "Pass requests resume." });
      setActiveFreeze(null);
    }
    setIsFreezeLoading(false);
  };

  // --- Logic ---
  const toggleAutoQueue = async () => {
    if (!selectedClassId) return;
    const currentStatus = classes.find(c => c.id === selectedClassId)?.is_queue_autonomous;
    const newStatus = !currentStatus;

    const { error } = await supabase
      .from('classes')
      .update({ is_queue_autonomous: newStatus })
      .eq('id', selectedClassId);

    if (error) {
      toast({ title: "Error", description: "Failed to update queue settings", variant: "destructive" });
    } else {
      toast({
        title: newStatus ? "Autonomous Queue Enabled" : "Autonomous Queue Disabled",
        description: newStatus ? "Students will be automatically approved based on capacity." : "Manual approval required."
      });
      // Class update will come via realtime subscription
    }
  };

  const fetchStudents = async () => {
    if (!selectedClassId) return;
    const { data } = await supabase
      .from('class_students')
      .select('profiles:student_id(id, full_name, email)')
      .eq('class_id', selectedClassId);
    if (data) setStudents(data.map((d: any) => ({ id: d.profiles.id, name: d.profiles.full_name, email: d.profiles.email })));
  };

  const fetchPasses = async () => {
    if (!selectedClassId) return;
    const { data } = await supabase
      .from('passes')
      .select('*, profiles:student_id(full_name)')
      .eq('class_id', selectedClassId)
      .in('status', ['pending', 'approved', 'active'])
      .order('created_at', { ascending: true }); // Oldest first for queue

    if (data) {
      setPendingPasses(data.filter((p: any) => p.status === 'pending').map((p: any) => ({ ...p, student_name: p.profiles.full_name })));
      setActivePasses(data.filter((p: any) => ['approved', 'active'].includes(p.status)).map((p: any) => ({ ...p, student_name: p.profiles.full_name })));
    }
  };

  const handleApprove = async (passId: string, override: boolean = false) => {
    if (!override) {
      // Double check limits? (Logic is mostly server side / verify visually)
    }
    const { error } = await supabase.from('passes').update({ status: 'approved', approved_at: new Date().toISOString() }).eq('id', passId);
    if (error) toast({ title: "Error", description: "Failed to approve pass", variant: "destructive" });
    else toast({ title: "Pass Approved" });
    fetchPasses();
  };

  const handleDeny = async (passId: string) => {
    const { error } = await supabase.from('passes').update({ status: 'denied', ended_at: new Date().toISOString() }).eq('id', passId);
    if (error) toast({ title: "Error", description: "Failed to deny pass", variant: "destructive" });
    else toast({ title: "Pass Denied" });
    fetchPasses();
  };

  const handleCheckIn = async (passId: string) => {
    const end = new Date().toISOString();
    const pass = activePasses.find(p => p.id === passId);
    const duration = pass?.approved_at ? differenceInSeconds(new Date(end), new Date(pass.approved_at)) : 0;

    const { error } = await supabase.from('passes').update({ status: 'returned', ended_at: end, duration_seconds: duration }).eq('id', passId);
    if (error) toast({ title: "Error", description: "Failed to return pass", variant: "destructive" });
    else toast({ title: "Welcome Back!", description: "Student checked in." });
    fetchPasses();
  };

  const handleRemoveStudent = async (student: Student) => {
    // Implement remove logic
    if (!confirm(`Remove ${student.name} from class?`)) return;
    const { error } = await supabase.from('class_students').delete().eq('class_id', selectedClassId).eq('student_id', student.id);
    if (error) toast({ title: "Error", variant: "destructive" });
    else { toast({ title: "Student Removed" }); fetchStudents(); }
  };

  const handleViewHistory = (student: Student) => {
    // Placeholder
    toast({ title: "History feature coming soon", description: `Viewing history for ${student.name}` });
  };


  if (loading) return <div className="flex items-center justify-center h-screen"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div></div>;

  const currentClass = classes.find(c => c.id === selectedClassId);
  const maxConcurrent = currentClass?.max_concurrent_bathroom ?? settings?.max_concurrent_bathroom ?? 2;

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6 pb-24 max-w-7xl mx-auto">
      <TeacherHeader signOut={signOut} />

      <Tabs defaultValue="dashboard" className="space-y-6">
        <TabsList className="grid w-full max-w-sm grid-cols-2 ml-0">
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          {/* Controls Section */}
          <TeacherControls
            classes={classes}
            selectedClassId={selectedClassId}
            onClassChange={setSelectedClassId}
            onAddClass={() => setDialogOpen(true)}
            activeFreeze={activeFreeze}
            freezeType={freezeType}
            onFreezeTypeChange={setFreezeType}
            timerMinutes={timerMinutes}
            onTimerChange={setTimerMinutes}
            isFreezeLoading={isFreezeLoading}
            onFreeze={handleFreeze}
            onUnfreeze={handleUnfreeze}
            currentClass={currentClass}
            onToggleAutoQueue={toggleAutoQueue}
            maxConcurrent={maxConcurrent}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left Column: Requests */}
            <RequestQueue
              pendingPasses={pendingPasses.map(p => ({
                ...p,
                is_quota_exceeded: activePasses.filter(ap => ap.destination === 'Restroom').length >= maxConcurrent && p.destination === 'Restroom'
              }))}
              onApprove={handleApprove}
              onDeny={handleDeny}
            />

            {/* Right Column: Active */}
            <ActivePassList
              activePasses={activePasses}
              onCheckIn={handleCheckIn}
            />
          </div>

          {/* Roster Section */}
          {selectedClassId && (
            <RosterGrid
              students={students}
              currentClass={currentClass}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              onViewHistory={handleViewHistory}
              onRemoveStudent={handleRemoveStudent}
            />
          )}
        </TabsContent>

        <TabsContent value="settings" className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          <TeacherSettings userEmail={profile?.email} />
        </TabsContent>
      </Tabs>

      <ClassManagementDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        userId={profile?.id || ''}
        editingClass={null}
        onSaved={() => { fetchClasses(profile?.id); toast({ title: "Class Saved" }); }}
      />
    </div>
  );
};
export default TeacherDashboard;
