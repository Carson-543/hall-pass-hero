import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useCurrentPeriod } from '@/hooks/useCurrentPeriod';
import { ClassManagementDialog } from '@/components/teacher/ClassManagementDialog';
import { StudentHistoryDialog } from '@/components/teacher/StudentHistoryDialog';
import { useOrganization } from '@/contexts/OrganizationContext';

// Components
import { PeriodDisplay } from '@/components/PeriodDisplay';
import { TeacherHeader } from '@/components/teacher/TeacherHeader';
import { TeacherControls } from '@/components/teacher/TeacherControls';
import { SubModeToggle } from '@/components/teacher/SubModeToggle';
import { RequestQueue } from '@/components/teacher/RequestQueue';
import { ActivePassList } from '@/components/teacher/ActivePassList';
import { RosterGrid } from '@/components/teacher/RosterGrid';
import { GlassCard } from '@/components/ui/glass-card';
import { PageTransition, StaggerContainer, StaggerItem } from '@/components/ui/page-transition';
import { FloatingPassButton } from '@/components/FloatingPassButton';

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

  // --- Sub Mode State ---
  const [isSubMode, setIsSubMode] = useState(false);
  const [subClasses, setSubClasses] = useState<ClassInfo[]>([]);

  // --- Derived Data ---
  const displayClasses = isSubMode ? subClasses : classes;
  const currentClass = displayClasses.find(c => c.id === selectedClassId);
  const maxConcurrent = currentClass?.max_concurrent_bathroom ?? settings?.max_concurrent_bathroom ?? 2;
  
  // Logic for FloatingPassButton
  const isRestroomQuotaExceeded = activePasses.filter(p => p.destination === 'Restroom').length >= maxConcurrent;

  const { currentPeriod } = useCurrentPeriod();

  // --- Sub Mode Handler ---
  const handleSubModeChange = (enabled: boolean, teacherId: string | null, classList: any[]) => {
    setIsSubMode(enabled);
    if (enabled && classList.length > 0) {
      setSubClasses(classList);
      setSelectedClassId(classList[0].id);
    } else {
      setSubClasses([]);
      if (classes.length > 0) {
        setSelectedClassId(classes[0].id);
      }
    }
  };

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
      .select('id, name, period_order, join_code, is_queue_autonomous, max_concurrent_bathroom')
      .eq('teacher_id', uid)
      .order('period_order');
    if (data && data.length > 0) {
      setClasses(data);
    }
  }, [profile]);

  useEffect(() => {
    if (classes.length > 0 && !selectedClassId && !isSubMode) {
      if (currentPeriod) {
        const matchingClass = classes.find(c => c.period_order === currentPeriod.period_order);
        if (matchingClass) {
          setSelectedClassId(matchingClass.id);
          return;
        }
      }
      setSelectedClassId(classes[0].id);
    }
  }, [classes, currentPeriod, selectedClassId, isSubMode]);

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
    }, { onConflict: 'class_id' });

    if (error) toast({ title: "Error", description: "Failed to freeze queue", variant: "destructive" });
    else {
      toast({ title: "Queue Frozen" });
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
      toast({ title: "Queue Unfrozen" });
      setActiveFreeze(null);
    }
    setIsFreezeLoading(false);
  };

  const fetchStudents = async () => {
    if (!selectedClassId) return;
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

  const fetchPasses = async () => {
    if (!selectedClassId) return;
    const { data: passes, error: passError } = await supabase
      .from('passes')
      .select('id, student_id, class_id, destination, status, requested_at, approved_at')
      .eq('class_id', selectedClassId)
      .in('status', ['pending', 'approved', 'pending_return'])
      .order('requested_at', { ascending: true });
    if (passError) return;
    if (passes) {
      const studentIds = [...new Set(passes.map(p => p.student_id))];
      const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', studentIds);
      const profileMap = new Map(profiles?.map(p => [p.id, p.full_name]) || []);
      setPendingPasses(passes.filter(p => p.status === 'pending').map(p => ({ ...p, student_name: profileMap.get(p.student_id) || 'Unknown', is_quota_exceeded: false })) as PendingPass[]);
      setActivePasses(passes.filter(p => ['approved', 'pending_return'].includes(p.status)).map(p => ({ ...p, student_name: profileMap.get(p.student_id) || 'Unknown' })) as ActivePass[]);
    }
  };

  useEffect(() => {
    if (selectedClassId) {
      const channel = supabase.channel(`teacher-dashboard-${selectedClassId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'passes', filter: `class_id=eq.${selectedClassId}` }, () => fetchPasses())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'pass_freezes', filter: `class_id=eq.${selectedClassId}` }, () => fetchFreezeStatus(selectedClassId))
        .subscribe();
      fetchStudents();
      fetchPasses();
      fetchFreezeStatus(selectedClassId);
      return () => { supabase.removeChannel(channel); };
    }
  }, [selectedClassId, fetchFreezeStatus]);

  const handleApprove = async (passId: string) => {
    await supabase.from('passes').update({ status: 'approved', approved_at: new Date().toISOString() }).eq('id', passId);
    fetchPasses();
  };

  const handleDeny = async (passId: string) => {
    await supabase.from('passes').update({ status: 'denied', denied_at: new Date().toISOString() }).eq('id', passId);
    fetchPasses();
  };

 const handleCheckIn = async (passId: string) => {
  // 1. Fetch the current state of this pass
  const { data: pass } = await supabase
    .from('passes')
    .select('returned_at')
    .eq('id', passId)
    .single();

  // 2. Prepare the update object
  const updateData: any = { status: 'returned' };
  
  // 3. Only add returned_at if it's currently null/missing
  if (!pass?.returned_at) {
    updateData.returned_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from('passes')
    .update(updateData)
    .eq('id', passId);

  if (error) {
    console.error("Error checking in:", error.message);
  } else {
    fetchPasses();
  }
};

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-950">
        <motion.div className="w-16 h-16 rounded-2xl bg-blue-600 animate-spin" />
      </div>
    );
  }

  return (
    <PageTransition className="min-h-screen bg-slate-950 text-slate-100">
      <div className="relative p-4 sm:p-6 pb-24 max-w-7xl mx-auto z-10">
        <TeacherHeader signOut={signOut} />
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <PeriodDisplay />
          {profile?.id && (
            <SubModeToggle userId={profile.id} onSubModeChange={handleSubModeChange} />
          )}
        </div>

        <StaggerContainer className="space-y-6">
          <StaggerItem>
            <GlassCard className="p-6 bg-slate-900/60 border-2 border-white/10 shadow-xl">
              <TeacherControls
                classes={displayClasses}
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
                onToggleAutoQueue={async (newMaxConcurrent?: number) => {
                  if (!selectedClassId) return;
                  const newValue = !currentClass?.is_queue_autonomous;
                  const updateData: { is_queue_autonomous: boolean; max_concurrent_bathroom?: number } = {
                    is_queue_autonomous: newValue,
                  };
                  if (newValue && newMaxConcurrent) {
                    updateData.max_concurrent_bathroom = newMaxConcurrent;
                  }
                  const { error } = await supabase
                    .from('classes')
                    .update(updateData)
                    .eq('id', selectedClassId);
                  if (error) {
                    toast({ title: "Error", description: "Failed to update auto-queue setting", variant: "destructive" });
                  } else {
                    toast({ title: newValue ? "Auto-Queue Enabled" : "Auto-Queue Disabled" });
                    setClasses(prev => prev.map(c => 
                      c.id === selectedClassId 
                        ? { ...c, is_queue_autonomous: newValue, max_concurrent_bathroom: newMaxConcurrent ?? c.max_concurrent_bathroom }
                        : c
                    ));
                    if (isSubMode) {
                      setSubClasses(prev => prev.map(c => 
                        c.id === selectedClassId 
                          ? { ...c, is_queue_autonomous: newValue, max_concurrent_bathroom: newMaxConcurrent ?? c.max_concurrent_bathroom }
                          : c
                      ));
                    }
                  }
                }}
                onDeleteClass={async (classId: string) => {
                  const { error } = await supabase
                    .from('classes')
                    .delete()
                    .eq('id', classId);
                  if (error) {
                    toast({ title: "Error", description: "Failed to delete class", variant: "destructive" });
                  } else {
                    toast({ title: "Class Deleted" });
                    const remaining = classes.filter(c => c.id !== classId);
                    setClasses(remaining);
                    if (remaining.length > 0) {
                      setSelectedClassId(remaining[0].id);
                    } else {
                      setSelectedClassId('');
                    }
                  }
                }}
              />
            </GlassCard>
          </StaggerItem>

          <StaggerItem>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <GlassCard className="p-6 bg-slate-900/60">
                <RequestQueue
                  pendingPasses={pendingPasses.map(p => ({
                    ...p,
                    is_quota_exceeded: activePasses.filter(ap => ap.destination === 'Restroom').length >= maxConcurrent && p.destination === 'Restroom'
                  }))}
                  onApprove={handleApprove}
                  onDeny={handleDeny}
                />
              </GlassCard>

              <GlassCard className="p-6 bg-slate-900/60">
                <ActivePassList
                  activePasses={activePasses}
                  onCheckIn={handleCheckIn}
                />
              </GlassCard>
            </div>
          </StaggerItem>

          {selectedClassId && (
            <StaggerItem>
              <GlassCard className="p-6 bg-slate-900/60">
                <RosterGrid
                  students={students}
                  currentClass={currentClass}
                  searchQuery={searchQuery}
                  setSearchQuery={setSearchQuery}
                  onViewHistory={(s) => { setSelectedStudentForHistory(s); setHistoryDialogOpen(true); }}
                  onRemoveStudent={() => {}}
                />
              </GlassCard>
            </StaggerItem>
          )}
        </StaggerContainer>

        {/* Dialogs */}
        <ClassManagementDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          userId={profile?.id || ''}
          organizationId={organizationId}
          editingClass={null}
          onSaved={() => { fetchClasses(profile?.id); }}
        />

        <StudentHistoryDialog
          open={historyDialogOpen}
          onOpenChange={setHistoryDialogOpen}
          studentId={selectedStudentForHistory?.id || null}
          studentName={selectedStudentForHistory?.name || null}
        />



<FloatingPassButton
  userId={profile?.id || ''}
  currentClassId={selectedClassId}
  students={students} // Pass the roster state here
  isQuotaExceeded={isRestroomQuotaExceeded}
  onPassRequested={fetchPasses}
/>
      </div>
    </PageTransition>
  );
};

export default TeacherDashboard;
