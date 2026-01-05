import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { ClassManagementDialog } from '@/components/teacher/ClassManagementDialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

// Components
import { TeacherHeader } from '@/components/teacher/TeacherHeader';
import { TeacherControls } from '@/components/teacher/TeacherControls';
import { RequestQueue } from '@/components/teacher/RequestQueue';
import { ActivePassList } from '@/components/teacher/ActivePassList';
import { RosterGrid } from '@/components/teacher/RosterGrid';
import { TeacherSettings } from '@/components/teacher/TeacherSettings';
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

  const currentClass = classes.find(c => c.id === selectedClassId);

  useEffect(() => {
    checkUser();
  }, []);

  useEffect(() => {
    if (selectedClassId) {
      const channel = supabase
        .channel('public:passes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'passes', filter: `class_id=eq.${selectedClassId}` }, () => {
          fetchPasses();
        })
        .subscribe();

      const freezeChannel = supabase
        .channel('public:pass_freezes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'pass_freezes', filter: `class_id=eq.${selectedClassId}` }, () => {
          fetchFreezeStatus(selectedClassId);
        })
        .subscribe();

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
      setClasses(data);
      if (!selectedClassId) setSelectedClassId(data[0].id);
    }
  }, [profile, selectedClassId]);

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

  // Helper validation
  const isValidUUID = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

  const fetchStudents = async () => {
    if (!selectedClassId || !isValidUUID(selectedClassId)) return;

    // Step 1: Get enrollments
    const { data: enrollments } = await supabase
      .from('class_enrollments')
      .select('student_id')
      .eq('class_id', selectedClassId);

    if (!enrollments || enrollments.length === 0) {
      setStudents([]);
      return;
    }

    // Step 2: Get profiles for enrolled students (no email for privacy)
    const studentIds = enrollments.map(e => e.student_id);
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', studentIds);

    if (profiles) {
      setStudents(profiles.map(p => ({
        id: p.id,
        name: p.full_name,
        email: '' // Hidden for privacy
      })));
    }
  };

  const handleToggleAutoQueue = async (newMaxConcurrent?: number) => {
    if (!selectedClassId || !currentClass) return;

    const newValue = !currentClass.is_queue_autonomous;

    const updates: any = { is_queue_autonomous: newValue };

    // If enabling and a limit is provided, update that too
    if (newValue && newMaxConcurrent) {
      updates.max_concurrent_bathroom = newMaxConcurrent;
    }

    const { error } = await supabase
      .from('classes')
      .update(updates)
      .eq('id', selectedClassId);

    if (error) {
      toast({ title: "Error", description: "Failed to update queue setting", variant: "destructive" });
    } else {
      toast({ title: newValue ? "Auto-Queue Enabled" : "Auto-Queue Disabled" });
      setClasses(prev => prev.map(c =>
        c.id === selectedClassId ? { ...c, ...updates } : c
      ));

      // Update local settings context if relevant, though this is class-specific override
      if (newValue && newMaxConcurrent && settings) {
        // Note: settings.max_concurrent_bathroom is org level, we don't update that here.
        // But we could update a local class override state if we had one separate from 'classes'
      }
    }
  };

  const fetchPasses = async () => {
    if (!selectedClassId || !isValidUUID(selectedClassId)) return;
    const { data } = await supabase
      .from('passes')
      .select('id, student_id, class_id, destination, status, requested_at, approved_at, profiles:student_id(full_name)')
      .eq('class_id', selectedClassId)
      .in('status', ['pending', 'approved', 'pending_return'])
      .order('requested_at', { ascending: true });

    if (data) {
      const pending = data
        .filter((p: any) => p.status === 'pending')
        .map((p: any) => ({
          id: p.id,
          student_id: p.student_id,
          class_id: p.class_id,
          destination: p.destination,
          status: p.status,
          requested_at: p.requested_at,
          approved_at: p.approved_at,
          student_name: p.profiles?.full_name || 'Unknown',
          is_quota_exceeded: false
        }));

      const active = data
        .filter((p: any) => ['approved', 'pending_return'].includes(p.status))
        .map((p: any) => ({
          id: p.id,
          student_id: p.student_id,
          class_id: p.class_id,
          destination: p.destination,
          status: p.status,
          requested_at: p.requested_at,
          approved_at: p.approved_at,
          student_name: p.profiles?.full_name || 'Unknown'
        }));

      setPendingPasses(pending);
      setActivePasses(active);
    }
  };

  const handleApprove = async (passId: string, override: boolean = false) => {
    const { error } = await supabase
      .from('passes')
      .update({ status: 'approved', approved_at: new Date().toISOString() })
      .eq('id', passId);
    if (error) toast({ title: "Error", description: "Failed to approve pass", variant: "destructive" });
    else toast({ title: "Pass Approved" });
    fetchPasses();
  };

  const handleDeny = async (passId: string) => {
    const { error } = await supabase
      .from('passes')
      .update({ status: 'denied', denied_at: new Date().toISOString() })
      .eq('id', passId);
    if (error) toast({ title: "Error", description: "Failed to deny pass", variant: "destructive" });
    else toast({ title: "Pass Denied" });
    fetchPasses();
  };

  const checkAndAdvanceQueue = async (classId: string, currentActivePasses: ActivePass[], currentPendingPasses: PendingPass[]) => {
    if (!currentClass?.is_queue_autonomous || !classId) return;

    const limit = currentClass.max_concurrent_bathroom ?? settings?.max_concurrent_bathroom ?? 2;
    // Count active restroom passes (excluding any that might have just been returned - though this function is usually called after return)
    const restroomActiveCount = currentActivePasses.filter(p => p.destination === 'Restroom').length;

    if (restroomActiveCount < limit && currentPendingPasses.length > 0) {
      const nextPass = currentPendingPasses.find(p => p.destination === 'Restroom');

      if (nextPass) {
        console.log(`🤖 Auto-approving next student: ${nextPass.student_name}`);
        const { error: approveError } = await supabase
          .from('passes')
          .update({ status: 'approved', approved_at: new Date().toISOString() })
          .eq('id', nextPass.id);

        if (!approveError) {
          toast({ title: "Auto-Approved", description: `${nextPass.student_name} is next!` });
        }
      }
    }
  };

  const handleCheckIn = async (passId: string) => {
    // 1. Return the current pass
    const { error } = await supabase
      .from('passes')
      .update({ status: 'returned', returned_at: new Date().toISOString() })
      .eq('id', passId);

    if (error) {
      toast({ title: "Error", description: "Failed to return pass", variant: "destructive" });
      return;
    }

    toast({ title: "Welcome Back!", description: "Student checked in." });

    // 2. Refresh local state & Trigger Auto-Advance
    // We optimistic update or just fetch fresh data.
    // Let's fetch fresh data to be safe, then check advancement.
    // However, fetchPasses is async and doesn't return data.
    // We can manually filter the list for the check.

    // Simulate the new state for the check
    const updatedActivePasses = activePasses.filter(p => p.id !== passId);

    checkAndAdvanceQueue(selectedClassId, updatedActivePasses, pendingPasses);

    fetchPasses();
  };

  // Effect to listen for autonomous check-ins from students
  useEffect(() => {
    if (!selectedClassId || !currentClass?.is_queue_autonomous) return;

    const channel = supabase
      .channel('auto-queue-advance')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'passes',
        filter: `class_id=eq.${selectedClassId}`
      }, (payload) => {
        // If a pass was just marked 'returned' (by student or teacher)
        if (payload.new.status === 'returned' && payload.old.status !== 'returned') {
          // We need fresh state to perform the check safely. 
          // Since we can't easily access the absolute latest state inside this callback without refs or deps,
          // and adding deps triggers re-subscriptions, a safe bet is to:
          // 1. Trigger a fetch
          // 2. Perform the check inside the fetch or separate logic.

          // Actually, simpler: The `fetchPasses` is already called by the main subscription.
          // We can add a `useEffect` on `activePasses` change? Close but dangerous (loops).

          // Better approach: Let's rely on the main subscription calling `fetchPasses`.
          // But `fetchPasses` sets state. We need to perform the check AFTER state updates?
          // Or perform the check HERE using a one-off query?

          // Strategy:
          // When 'returned' event is seen:
          // Query the DB for current counts (source of truth).
          checkQueueFromDB(selectedClassId);
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [selectedClassId, currentClass?.is_queue_autonomous]);

  const checkQueueFromDB = async (classId: string) => {
    // 1. Get active restroom count
    const { count: activeCount } = await supabase
      .from('passes')
      .select('*', { count: 'exact', head: true })
      .eq('class_id', classId)
      .in('status', ['approved', 'pending_return']) // pending_return shouldn't happen in auto mode but good to include
      .eq('destination', 'Restroom');

    // 2. Get pending restroom count/list
    const { data: pending } = await supabase
      .from('passes')
      .select('id, student_id, profiles(full_name)')
      .eq('class_id', classId)
      .eq('status', 'pending')
      .eq('destination', 'Restroom')
      .order('requested_at', { ascending: true })
      .limit(1);

    const limit = currentClass?.max_concurrent_bathroom ?? settings?.max_concurrent_bathroom ?? 2;

    if (activeCount !== null && activeCount < limit && pending && pending.length > 0) {
      const nextPass = pending[0];
      console.log(`🤖 Realtime Auto-Advance for: ${nextPass.profiles?.full_name}`);

      await supabase
        .from('passes')
        .update({ status: 'approved', approved_at: new Date().toISOString() })
        .eq('id', nextPass.id);

      toast({ title: "Auto-Approved", description: `${nextPass.profiles?.full_name} is next!` });
    }
  };

  const handleRemoveStudent = async (student: Student) => {
    if (!confirm(`Remove ${student.name} from class?`)) return;
    const { error } = await supabase
      .from('class_enrollments')
      .delete()
      .eq('class_id', selectedClassId)
      .eq('student_id', student.id);
    if (error) toast({ title: "Error", variant: "destructive" });
    else { toast({ title: "Student Removed" }); fetchStudents(); }
  };

  const handleViewHistory = (student: Student) => {
    toast({ title: "History feature coming soon", description: `Viewing history for ${student.name}` });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <motion.div
          className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center"
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
        >
          <div className="w-8 h-8 border-3 border-primary-foreground border-t-transparent rounded-full animate-spin" />
        </motion.div>
      </div>
    );
  }


  const maxConcurrent = settings?.max_concurrent_bathroom ?? 2;

  return (
    <PageTransition className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30">
      <div className="p-4 sm:p-6 pb-24 max-w-7xl mx-auto">
        <TeacherHeader signOut={signOut} />

        <Tabs defaultValue="dashboard" className="space-y-6">
          <TabsList className="grid w-full max-w-sm grid-cols-2 rounded-xl bg-muted/50 p-1">
            <TabsTrigger value="dashboard" className="rounded-lg font-bold">Dashboard</TabsTrigger>
            <TabsTrigger value="settings" className="rounded-lg font-bold">Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard">
            <StaggerContainer className="space-y-6">
              {/* Controls Section */}
              <StaggerItem>
                <GlassCard variant="frosted" className="p-4">
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
                  />
                </GlassCard>
              </StaggerItem>

              {/* Pass Management Grid */}
              <StaggerItem>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <GlassCard variant="frosted" className="p-5">
                    <RequestQueue
                      pendingPasses={pendingPasses.map(p => ({
                        ...p,
                        is_quota_exceeded: activePasses.filter(ap => ap.destination === 'Restroom').length >= maxConcurrent && p.destination === 'Restroom'
                      }))}
                      onApprove={handleApprove}
                      onDeny={handleDeny}
                    />
                  </GlassCard>

                  <GlassCard variant="frosted" className="p-5">
                    <ActivePassList
                      activePasses={activePasses}
                      onCheckIn={handleCheckIn}
                    />
                  </GlassCard>
                </div>
              </StaggerItem>

              {/* Roster Section */}
              {selectedClassId && (
                <StaggerItem>
                  <GlassCard variant="frosted" className="p-5">
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
          </TabsContent>

          <TabsContent value="settings">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              <GlassCard variant="frosted">
                <TeacherSettings userEmail={profile?.email} />
              </GlassCard>
            </motion.div>
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
    </PageTransition>
  );
};

export default TeacherDashboard;
