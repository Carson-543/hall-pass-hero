import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useCurrentPeriod } from '@/hooks/useCurrentPeriod';
import { ClassManagementDialog } from '@/components/teacher/ClassManagementDialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StudentHistoryDialog } from '@/components/teacher/StudentHistoryDialog';
import { useOrganization } from '@/contexts/OrganizationContext';

// Components
import { PeriodDisplay } from '@/components/PeriodDisplay';
import { TeacherHeader } from '@/components/teacher/TeacherHeader';
import { TeacherControls } from '@/components/teacher/TeacherControls';
import { RequestQueue } from '@/components/teacher/RequestQueue';
import { ActivePassList } from '@/components/teacher/ActivePassList';
import { RosterGrid } from '@/components/teacher/RosterGrid';
import { GlassCard } from '@/components/ui/glass-card';
import { PageTransition, StaggerContainer, StaggerItem } from '@/components/ui/page-transition';

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
  is_queue_autonomous?: boolean;
  max_concurrent_bathroom?: number;
}

interface PendingPass {
  id: string;
  student_id: string;
  class_id: string;
  destination: string;
  status: 'pending' | 'approved' | 'denied' | 'pending_return' | 'returned';
  requested_at: string;
  approved_at?: string;
  student_name: string;
  is_quota_exceeded?: boolean;
}

interface ActivePass {
  id: string;
  student_id: string;
  class_id: string;
  destination: string;
  status: 'pending' | 'approved' | 'denied' | 'pending_return' | 'returned';
  requested_at: string;
  approved_at?: string;
  student_name: string;
}

interface FreezeStatus {
  id: string;
  freeze_type: string;
  ends_at: string | null;
  is_active: boolean;
}

interface Settings {
  max_concurrent_bathroom: number;
}

export const TeacherDashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { organizationId } = useOrganization();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<{ id: string; full_name: string; email?: string } | null>(null);
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [students, setStudents] = useState<Student[]>([]);
  const [pendingPasses, setPendingPasses] = useState<PendingPass[]>([]);
  const [activePasses, setActivePasses] = useState<ActivePass[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [activeFreeze, setActiveFreeze] = useState<FreezeStatus | null>(null);
  const [isFreezeLoading, setIsFreezeLoading] = useState(false);
  const [freezeType, setFreezeType] = useState<'bathroom' | 'all'>('bathroom');
  const [timerMinutes, setTimerMinutes] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [selectedStudentForHistory, setSelectedStudentForHistory] = useState<Student | null>(null);

  const currentClass = classes.find(c => c.id === selectedClassId);

  const { currentPeriod } = useCurrentPeriod();

  useEffect(() => {
    checkUser();
  }, []);

  const checkUser = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate('/auth'); return; }

      const { data: profileData } = await supabase
        .from('profiles')
        .select('id, full_name')
        .eq('id', user.id)
        .single();

      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .single();

      if (!profileData || !roleData || roleData.role !== 'teacher') {
        navigate('/');
        return;
      }

      setProfile({ ...profileData, email: user.email });

      const { data: membership } = await supabase
        .from('organization_memberships')
        .select('organization_id')
        .eq('user_id', user.id)
        .single();

      if (membership?.organization_id) {
        const { data: orgData } = await supabase
          .from('organization_settings')
          .select('max_concurrent_bathroom')
          .eq('organization_id', membership.organization_id)
          .single();
        if (orgData) setSettings(orgData);
      }

      await fetchClasses(user.id);
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
    const { data } = await supabase
      .from('classes')
      .select('id, name, period_order, join_code, is_queue_autonomous')
      .eq('teacher_id', uid)
      .order('period_order');
    if (data && data.length > 0) {
      if (organizationId) {
        const withoutOrg = data.filter(c => !(c as any).organization_id);
        if (withoutOrg.length > 0) {
          await supabase
            .from('classes')
            .update({ organization_id: organizationId })
            .in('id', withoutOrg.map(c => c.id));
        }
      }
      setClasses(data);
    }
  }, [profile, organizationId]);

  useEffect(() => {
    if (classes.length > 0 && !selectedClassId) {
      if (currentPeriod) {
        const matchingClass = classes.find(c => c.period_order === currentPeriod.period_order);
        if (matchingClass) {
          setSelectedClassId(matchingClass.id);
          return;
        }
      }
      setSelectedClassId(classes[0].id);
    }
  }, [classes, currentPeriod, selectedClassId]);

  const signOut = async () => { await supabase.auth.signOut(); navigate('/auth'); };

  const fetchFreezeStatus = useCallback(async (classId: string) => {
    if (!classId) return;
    const { data } = await supabase
      .from('pass_freezes')
      .select('id, freeze_type, ends_at, is_active')
      .eq('class_id', classId)
      .eq('is_active', true)
      .maybeSingle();

    if (data && data.ends_at && new Date(data.ends_at) < new Date()) {
      await supabase.from('pass_freezes').update({ is_active: false }).eq('id', data.id);
      setActiveFreeze(null);
    } else {
      setActiveFreeze(data);
    }
  }, []);

  const handleFreeze = async () => {
    if (!selectedClassId || !profile?.id) return;
    setIsFreezeLoading(true);
    let endsAt = null;
    if (timerMinutes) {
      const date = new Date();
      date.setMinutes(date.getMinutes() + parseInt(timerMinutes));
      endsAt = date.toISOString();
    }

    const { error } = await supabase.from('pass_freezes').upsert({
      class_id: selectedClassId,
      teacher_id: profile.id,
      freeze_type: freezeType,
      ends_at: endsAt,
      is_active: true
    }, {
      onConflict: 'class_id'
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
    const { error } = await supabase
      .from('pass_freezes')
      .update({ is_active: false })
      .eq('id', activeFreeze.id);
    if (error) toast({ title: "Error", description: "Failed to unfreeze", variant: "destructive" });
    else {
      toast({ title: "Queue Unfrozen", description: "Pass requests resume." });
      setActiveFreeze(null);
    }
    setIsFreezeLoading(false);
  };

  const isValidUUID = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

  const fetchStudents = async () => {
    if (!selectedClassId || !isValidUUID(selectedClassId)) return;
    const { data: enrollments } = await supabase
      .from('class_enrollments')
      .select('student_id')
      .eq('class_id', selectedClassId);
    if (!enrollments || enrollments.length === 0) {
      setStudents([]);
      return;
    }
    const studentIds = enrollments.map(e => e.student_id);
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', studentIds);
    if (profiles) {
      setStudents(profiles.map(p => ({ id: p.id, name: p.full_name, email: '' })));
    }
  };

  const handleToggleAutoQueue = async (newMaxConcurrent?: number) => {
    if (!selectedClassId || !currentClass) return;
    const newValue = !currentClass.is_queue_autonomous;
    const updates: any = { is_queue_autonomous: newValue };
    if (newValue && newMaxConcurrent) updates.max_concurrent_bathroom = newMaxConcurrent;
    const { error } = await supabase.from('classes').update(updates).eq('id', selectedClassId);
    if (error) toast({ title: "Error", description: "Failed to update queue setting", variant: "destructive" });
    else {
      toast({ title: newValue ? "Auto-Queue Enabled" : "Auto-Queue Disabled" });
      setClasses(prev => prev.map(c => c.id === selectedClassId ? { ...c, ...updates } : c));
    }
  };

  const handleDeleteClass = async (classId: string) => {
    const { error } = await supabase.from('classes').delete().eq('id', classId);
    if (error) {
      toast({ title: "Error", description: "Failed to delete class", variant: "destructive" });
    } else {
      toast({ title: "Class Deleted", description: "The class and all its data have been removed." });
      const updatedClasses = classes.filter(c => c.id !== classId);
      setClasses(updatedClasses);
      if (updatedClasses.length > 0) {
        setSelectedClassId(updatedClasses[0].id);
      } else {
        setSelectedClassId('');
      }
    }
  };

  const fetchPasses = async () => {
    if (!selectedClassId) return;
    const { data: passes, error: passError } = await supabase
      .from('passes')
      .select(`
        id, 
        student_id, 
        class_id, 
        destination, 
        status, 
        requested_at, 
        approved_at,
        profiles!passes_student_id_fkey (full_name)
      `)
      .eq('class_id', selectedClassId)
      .in('status', ['pending', 'approved', 'pending_return'])
      .order('requested_at', { ascending: true });

    if (passError) return;
    if (passes) {
      setPendingPasses(passes.filter(p => p.status === 'pending').map((p: any) => ({
        ...p,
        student_name: p.profiles?.full_name || 'Unknown',
        is_quota_exceeded: false
      })) as PendingPass[]);

      setActivePasses(passes.filter(p => ['approved', 'pending_return'].includes(p.status)).map((p: any) => ({
        ...p,
        student_name: p.profiles?.full_name || 'Unknown'
      })) as ActivePass[]);
    }
  };

  useEffect(() => {
    if (selectedClassId) {
      const channelName = `teacher-dashboard-${selectedClassId}-v3`;
      const channel = supabase.channel(channelName)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'passes', filter: `class_id=eq.${selectedClassId}` }, () => fetchPasses())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'pass_freezes', filter: `class_id=eq.${selectedClassId}` }, () => fetchFreezeStatus(selectedClassId))
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'classes', filter: `id=eq.${selectedClassId}` }, payload => setClasses(prev => prev.map(c => c.id === payload.new.id ? { ...c, ...payload.new } : c)))
        .subscribe();
      fetchStudents();
      fetchPasses();
      fetchFreezeStatus(selectedClassId);
      return () => { supabase.removeChannel(channel); };
    }
  }, [selectedClassId, fetchFreezeStatus]);

  const handleApprove = async (passId: string) => {
    const { error } = await supabase.from('passes').update({ status: 'approved', approved_at: new Date().toISOString() }).eq('id', passId);
    if (error) toast({ title: "Error", description: "Failed to approve pass", variant: "destructive" });
    else toast({ title: "Pass Approved" });
    fetchPasses();
  };

  const handleDeny = async (passId: string) => {
    const { error } = await supabase.from('passes').update({ status: 'denied', denied_at: new Date().toISOString() }).eq('id', passId);
    if (error) toast({ title: "Error", description: "Failed to deny pass", variant: "destructive" });
    else toast({ title: "Pass Denied" });
    fetchPasses();
  };

  const checkAndAdvanceQueue = async (classId: string, currentActivePasses: ActivePass[], currentPendingPasses: PendingPass[]) => {
    if (!currentClass?.is_queue_autonomous || !classId) return;
    const limit = currentClass.max_concurrent_bathroom ?? settings?.max_concurrent_bathroom ?? 2;
    const restroomActiveCount = currentActivePasses.filter(p => p.destination === 'Restroom').length;
    if (restroomActiveCount < limit && currentPendingPasses.length > 0) {
      const nextPass = currentPendingPasses.find(p => p.destination === 'Restroom');
      if (nextPass) {
        const { error: approveError } = await supabase.from('passes').update({ status: 'approved', approved_at: new Date().toISOString() }).eq('id', nextPass.id);
        if (!approveError) toast({ title: "Auto-Approved", description: `${nextPass.student_name} is next!` });
      }
    }
  };

  const handleCheckIn = async (passId: string) => {
    const { error } = await supabase.from('passes').update({ status: 'returned', returned_at: new Date().toISOString() }).eq('id', passId);
    if (error) { toast({ title: "Error", description: "Failed to return pass", variant: "destructive" }); return; }
    toast({ title: "Welcome Back!", description: "Student checked in." });
    const updatedActivePasses = activePasses.filter(p => p.id !== passId);
    checkAndAdvanceQueue(selectedClassId, updatedActivePasses, pendingPasses);
    fetchPasses();
  };

  const handleRemoveStudent = async (student: Student) => {
    if (!confirm(`Remove ${student.name} from class?`)) return;
    const { error } = await supabase.from('class_enrollments').delete().eq('class_id', selectedClassId).eq('student_id', student.id);
    if (error) toast({ title: "Error", variant: "destructive" });
    else { toast({ title: "Student Removed" }); fetchStudents(); }
  };

  const handleViewHistory = (student: Student) => {
    setSelectedStudentForHistory(student);
    setHistoryDialogOpen(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-950">
        <motion.div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center" animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}>
          <div className="w-8 h-8 border-3 border-white border-t-transparent rounded-full animate-spin" />
        </motion.div>
      </div>
    );
  }

  const maxConcurrent = settings?.max_concurrent_bathroom ?? 2;

  return (
    <PageTransition className="min-h-screen bg-slate-950 text-slate-100 selection:bg-blue-500/30">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <motion.div
          className="absolute -top-1/4 -right-1/4 w-[80%] h-[80%] rounded-full bg-blue-600/15 blur-[100px]"
          style={{ willChange: "transform" }}
          animate={{ x: [0, 20, 0], y: [0, -10, 0] }}
          transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
        />
        <motion.div
          className="absolute -bottom-1/4 -left-1/4 w-[70%] h-[70%] rounded-full bg-blue-400/5 blur-[80px]"
          style={{ willChange: "transform" }}
          animate={{ x: [0, -20, 0], y: [0, 15, 0] }}
          transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
        />
      </div>

      <div className="relative p-4 sm:p-6 pb-24 max-w-7xl mx-auto z-10">
        <TeacherHeader signOut={signOut} />
        <div className="mb-6">
          <PeriodDisplay />
        </div>

        <StaggerContainer className="space-y-6">
          <StaggerItem>
            <GlassCard className="p-6 bg-slate-900/60 border-2 border-white/10 shadow-xl">
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
                maxConcurrent={maxConcurrent}
                onToggleAutoQueue={handleToggleAutoQueue}
                onDeleteClass={handleDeleteClass}
              />
            </GlassCard>
          </StaggerItem>

          <StaggerItem>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <GlassCard className="p-6 bg-slate-900/60 border-2 border-white/10 shadow-xl">
                <RequestQueue
                  pendingPasses={pendingPasses.map(p => ({
                    ...p,
                    is_quota_exceeded: activePasses.filter(ap => ap.destination === 'Restroom').length >= maxConcurrent && p.destination === 'Restroom'
                  }))}
                  onApprove={handleApprove}
                  onDeny={handleDeny}
                />
              </GlassCard>

              <GlassCard className="p-6 bg-slate-900/60 border-2 border-white/10 shadow-xl">
                <ActivePassList
                  activePasses={activePasses}
                  onCheckIn={handleCheckIn}
                />
              </GlassCard>
            </div>
          </StaggerItem>

          {selectedClassId && (
            <StaggerItem>
              <GlassCard className="p-6 bg-slate-900/60 border-2 border-white/10 shadow-xl">
                <RosterGrid
                  students={students}
                  currentClass={currentClass}
                  searchQuery={searchQuery}
                  setSearchQuery={setSearchQuery}
                  onViewHistory={handleViewHistory}
                  onRemoveStudent={handleRemoveStudent}
                />
              </GlassCard>
            </StaggerItem>
          )}
        </StaggerContainer>

        <ClassManagementDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          userId={profile?.id || ''}
          organizationId={organizationId}
          editingClass={null}
          onSaved={() => { fetchClasses(profile?.id); toast({ title: "Class Saved" }); }}
        />

        <StudentHistoryDialog
          open={historyDialogOpen}
          onOpenChange={setHistoryDialogOpen}
          studentId={selectedStudentForHistory?.id || null}
          studentName={selectedStudentForHistory?.name || null}
        />
      </div>
    </PageTransition>
  );
};

export default TeacherDashboard;
