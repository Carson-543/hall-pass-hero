import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
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
import { RequestQueue } from '@/components/teacher/RequestQueue';
import { ActivePassList } from '@/components/teacher/ActivePassList';
import { RosterGrid } from '@/components/teacher/RosterGrid';
import { GlassCard } from '@/components/ui/glass-card';
import { PageTransition, StaggerContainer, StaggerItem } from '@/components/ui/page-transition';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Loader2, Search } from 'lucide-react';

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

  // --- Core State ---
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<{ id: string; full_name: string; email?: string } | null>(null);
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [students, setStudents] = useState<Student[]>([]);
  const [pendingPasses, setPendingPasses] = useState<PendingPass[]>([]);
  const [activePasses, setActivePasses] = useState<ActivePass[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);

  // --- UI & Controls State ---
  const [activeFreeze, setActiveFreeze] = useState<FreezeStatus | null>(null);
  const [isFreezeLoading, setIsFreezeLoading] = useState(false);
  const [freezeType, setFreezeType] = useState<'bathroom' | 'all'>('bathroom');
  const [timerMinutes, setTimerMinutes] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  
  // --- Dialog States ---
  const [dialogOpen, setDialogOpen] = useState(false);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [createPassDialogOpen, setCreatePassDialogOpen] = useState(false);
  const [selectedStudentForHistory, setSelectedStudentForHistory] = useState<Student | null>(null);

  // --- Quick Pass State ---
  const [selectedStudentForPass, setSelectedStudentForPass] = useState('');
  const [selectedDestination, setSelectedDestination] = useState('');
  const [customDestination, setCustomDestination] = useState('');
  const [isActionLoading, setIsActionLoading] = useState(false);

  const DESTINATIONS = ['Restroom', 'Locker', 'Office', 'Other'];
  const currentClass = classes.find(c => c.id === selectedClassId);
  const { currentPeriod } = useCurrentPeriod();

  // --- Auth & Initial Data ---
  useEffect(() => {
    checkUser();
  }, []);

  const checkUser = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate('/auth'); return; }

      const { data: profileData } = await supabase.from('profiles').select('id, full_name').eq('id', user.id).single();
      const { data: roleData } = await supabase.from('user_roles').select('role').eq('user_id', user.id).single();

      if (!profileData || roleData?.role !== 'teacher') {
        navigate('/'); return;
      }

      setProfile({ ...profileData, email: user.email });
      await fetchClasses(user.id);
    } catch (error) {
      console.error("Dashboard Load Error:", error);
    } finally {
      setLoading(false);
    }
  };

  // --- Data Fetching ---
  const fetchClasses = useCallback(async (userId?: string) => {
  const uid = userId || profile?.id;
  if (!uid) return;

  const { data } = await supabase
    .from('classes')
    .select('*')
    .eq('teacher_id', uid)
    .order('period_order');

  if (data && data.length > 0) {
    setClasses(data);

    // Only auto-select if nothing is selected yet
    if (!selectedClassId) {
      // 1. Try to find class matching the actual current period (time-based)
      const matchesPeriod = data.find(c => c.period_order === currentPeriod);
      
      if (matchesPeriod) {
        setSelectedClassId(matchesPeriod.id);
      } else {
        // 2. Fallback to the first class of the day if no period match
        setSelectedClassId(data[0].id);
      }
    }
  }
}, [profile, selectedClassId, currentPeriod]); // Added currentPeriod to dependencies

  const fetchPasses = useCallback(async () => {
    if (!selectedClassId) return;
    const { data: passes } = await supabase
      .from('passes')
      .select('id, student_id, class_id, destination, status, requested_at, approved_at')
      .eq('class_id', selectedClassId)
      .in('status', ['pending', 'approved', 'pending_return'])
      .order('requested_at', { ascending: true });

    if (passes) {
      const studentIds = [...new Set(passes.map(p => p.student_id))];
      const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', studentIds);
      const profileMap = new Map(profiles?.map(p => [p.id, p.full_name]) || []);
      
      setPendingPasses(passes.filter(p => p.status === 'pending').map(p => ({ 
        ...p, 
        student_name: profileMap.get(p.student_id) || 'Unknown' 
      })) as PendingPass[]);
      
      setActivePasses(passes.filter(p => ['approved', 'pending_return'].includes(p.status)).map(p => ({ 
        ...p, 
        student_name: profileMap.get(p.student_id) || 'Unknown' 
      })) as ActivePass[]);
    }
  }, [selectedClassId]);

  const fetchStudents = useCallback(async () => {
    if (!selectedClassId) return;
    const { data: enrollments } = await supabase.from('class_enrollments').select('student_id').eq('class_id', selectedClassId);
    if (!enrollments?.length) { setStudents([]); return; }
    
    const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', enrollments.map(e => e.student_id));
    if (profiles) setStudents(profiles.map(p => ({ id: p.id, name: p.full_name, email: '' })));
  }, [selectedClassId]);

  // --- Handlers ---
  const handleQuickPass = async () => {
    if (!selectedStudentForPass || !selectedDestination || isActionLoading) return;
    setIsActionLoading(true);
    const dest = selectedDestination === 'Other' ? customDestination : selectedDestination;
    
    const { error } = await supabase.from('passes').insert({
      student_id: selectedStudentForPass,
      class_id: selectedClassId,
      destination: dest,
      status: 'approved',
      approved_at: new Date().toISOString(),
      approved_by: profile?.id
    });

    if (!error) {
      toast({ title: "Pass Issued" });
      setCreatePassDialogOpen(false);
      setSelectedStudentForPass('');
      setSelectedDestination('');
      fetchPasses();
    }
    setIsActionLoading(false);
  };

  const handleApprove = async (passId: string) => {
    await supabase.from('passes').update({ status: 'approved', approved_at: new Date().toISOString() }).eq('id', passId);
    fetchPasses();
  };

  const handleDeny = async (passId: string) => {
    await supabase.from('passes').update({ status: 'denied', denied_at: new Date().toISOString() }).eq('id', passId);
    fetchPasses();
  };

  const handleCheckIn = async (passId: string) => {
    await supabase.from('passes').update({ status: 'returned', returned_at: new Date().toISOString() }).eq('id', passId);
    fetchPasses();
  };

  // --- Realtime Subscriptions ---
  useEffect(() => {
    if (selectedClassId) {
      fetchStudents(); fetchPasses();
      const channel = supabase.channel(`teacher-db-${selectedClassId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'passes', filter: `class_id=eq.${selectedClassId}` }, () => fetchPasses())
        .subscribe();
      return () => { supabase.removeChannel(channel); };
    }
  }, [selectedClassId, fetchPasses, fetchStudents]);

  if (loading) return <div className="h-screen flex items-center justify-center bg-slate-950"><Loader2 className="animate-spin text-blue-500 w-12 h-12" /></div>;

  return (
    <PageTransition className="min-h-screen bg-slate-950 text-slate-100 pb-32">
      {/* Background Glow */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none opacity-20">
        <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] bg-blue-600 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[500px] h-[500px] bg-indigo-600 blur-[120px] rounded-full" />
      </div>

      <div className="relative p-4 sm:p-6 max-w-7xl mx-auto z-10">
        <TeacherHeader signOut={() => supabase.auth.signOut()} />
        <div className="mb-6"><PeriodDisplay /></div>

        <StaggerContainer className="space-y-6">
          <StaggerItem>
            <GlassCard className="p-6 bg-slate-900/60 border-white/10">
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
                onFreeze={() => {}} // Implementation logic
                onUnfreeze={() => {}} // Implementation logic
                currentClass={currentClass}
                maxConcurrent={settings?.max_concurrent_bathroom ?? 2}
                onToggleAutoQueue={() => {}} // Implementation logic
                onDeleteClass={() => {}} // Implementation logic
              />
            </GlassCard>
          </StaggerItem>

          <StaggerItem>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <GlassCard className="p-6 bg-slate-900/60 border-white/10">
                <RequestQueue
                  pendingPasses={pendingPasses}
                  onApprove={handleApprove}
                  onDeny={handleDeny}
                />
              </GlassCard>
              <GlassCard className="p-6 bg-slate-900/60 border-white/10">
                <ActivePassList
                  activePasses={activePasses}
                  onCheckIn={handleCheckIn}
                />
              </GlassCard>
            </div>
          </StaggerItem>

          {selectedClassId && (
            <StaggerItem>
              <GlassCard className="p-6 bg-slate-900/60 border-white/10">
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

        {/* Floating Quick Pass Action */}
        {selectedClassId && (
          <motion.div 
  initial={{ y: 100 }} 
  animate={{ y: 0 }}
  /* Changed right-8 to left-8 */
  className="fixed bottom-8 right-8 z-50" 
>
  <Button 
    onClick={() => setCreatePassDialogOpen(true)}
    className="px-8 h-16 rounded-2xl shadow-2xl text-lg font-bold bg-blue-600 hover:bg-blue-500 text-white border-none"
  >
    <Plus className="mr-2 h-6 w-6" /> ISSUE QUICK PASS
  </Button>
</motion.div>
        )}

        {/* Dialogs */}
        <ClassManagementDialog
          open={dialogOpen} onOpenChange={setDialogOpen}
          userId={profile?.id || ''} organizationId={organizationId}
          onSaved={() => fetchClasses()}
        />

        <StudentHistoryDialog
          open={historyDialogOpen} onOpenChange={setHistoryDialogOpen}
          studentId={selectedStudentForHistory?.id || null}
          studentName={selectedStudentForHistory?.name || null}
        />

        {/* Quick Pass Dialog */}
        <Dialog open={createPassDialogOpen} onOpenChange={setCreatePassDialogOpen}>
          <DialogContent className="rounded-3xl max-w-sm bg-slate-900 border-white/10 text-slate-100">
            <DialogHeader><DialogTitle className="font-bold text-xl">Quick Pass</DialogTitle></DialogHeader>
            <div className="space-y-6 py-4">
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase text-slate-400">Student</Label>
                <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto pr-1">
                  {students.map(s => (
                    <Button 
                      key={s.id} size="sm" 
                      variant={selectedStudentForPass === s.id ? 'default' : 'outline'}
                      className={`rounded-xl font-bold ${selectedStudentForPass === s.id ? 'bg-blue-600' : 'border-white/10 text-blue-600 bg-blue-300'}`}
                      onClick={() => setSelectedStudentForPass(s.id)}
                    >
                      {s.name.split(' ')[0]}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase text-slate-400">Location</Label>
                <div className="grid grid-cols-2 gap-2">
                  {DESTINATIONS.map(d => (
                    <Button 
                      key={d} variant={selectedDestination === d ? 'default' : 'outline'}
                      className={`rounded-xl font-bold ${selectedDestination === d ? 'bg-blue-600' : 'border-white/10 text-blue-600 bg-blue-300'}`}
                      onClick={() => setSelectedDestination(d)}
                    >
                      {d}
                    </Button>
                  ))}
                </div>
              </div>
              <Button 
                onClick={handleQuickPass} disabled={isActionLoading || !selectedStudentForPass || !selectedDestination}
                className="w-full h-12 rounded-xl bg-blue-600 hover:bg-blue-700"
              >
                {isActionLoading ? <Loader2 className="animate-spin" /> : 'Confirm Pass'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </PageTransition>
  );
};

export default TeacherDashboard;
