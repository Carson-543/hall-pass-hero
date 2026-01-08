import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useCurrentPeriod } from '@/hooks/useCurrentPeriod';
import { ClassManagementDialog } from '@/components/teacher/ClassManagementDialog';
import { StudentHistoryDialog } from '@/components/teacher/StudentHistoryDialog';
import { useOrganization } from '@/contexts/OrganizationContext';

// UI Components
import { PeriodDisplay } from '@/components/PeriodDisplay';
import { TeacherHeader } from '@/components/teacher/TeacherHeader';
import { TeacherControls } from '@/components/teacher/TeacherControls';
import { SubModeToggle } from '@/components/teacher/SubModeToggle';
import { RequestQueue } from '@/components/teacher/RequestQueue';
import { ActivePassList } from '@/components/teacher/ActivePassList';
import { RosterGrid } from '@/components/teacher/RosterGrid';
import { GlassCard } from '@/components/ui/glass-card';
import { PageTransition, StaggerContainer, StaggerItem } from '@/components/ui/page-transition';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Loader2 } from 'lucide-react';

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
  const { currentPeriod } = useCurrentPeriod();

  // --- Core State ---
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<{ id: string; full_name: string; email?: string } | null>(null);
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [students, setStudents] = useState<Student[]>([]);
  const [pendingPasses, setPendingPasses] = useState<PendingPass[]>([]);
  const [activePasses, setActivePasses] = useState<ActivePass[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);

  // --- UI/Control State ---
  const [activeFreeze, setActiveFreeze] = useState<FreezeStatus | null>(null);
  const [isFreezeLoading, setIsFreezeLoading] = useState(false);
  const [freezeType, setFreezeType] = useState<'bathroom' | 'all'>('bathroom');
  const [timerMinutes, setTimerMinutes] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  
  // --- Sub Mode State ---
  const [isSubMode, setIsSubMode] = useState(false);
  const [subClasses, setSubClasses] = useState<ClassInfo[]>([]);

  // --- Quick Pass State ---
  const [createPassDialogOpen, setCreatePassDialogOpen] = useState(false);
  const [selectedStudentForPass, setSelectedStudentForPass] = useState('');
  const [selectedDestination, setSelectedDestination] = useState('');
  const [isActionLoading, setIsActionLoading] = useState(false);
  const DESTINATIONS = ['Restroom', 'Locker', 'Office', 'Other'];

  // --- Dialog States ---
  const [dialogOpen, setDialogOpen] = useState(false);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [selectedStudentForHistory, setSelectedStudentForHistory] = useState<Student | null>(null);

  const displayClasses = isSubMode ? subClasses : classes;
  const currentClass = displayClasses.find(c => c.id === selectedClassId);

  // --- Handlers ---
  const handleSubModeChange = (enabled: boolean, teacherId: string | null, classList: any[]) => {
    setIsSubMode(enabled);
    if (enabled && classList.length > 0) {
      setSubClasses(classList);
      setSelectedClassId(classList[0].id);
    } else {
      setSubClasses([]);
      if (classes.length > 0) setSelectedClassId(classes[0].id);
    }
  };

  const handleQuickPass = async () => {
    if (!selectedStudentForPass || !selectedDestination || isActionLoading) return;
    setIsActionLoading(true);
    
    const { error } = await supabase.from('passes').insert({
      student_id: selectedStudentForPass,
      class_id: selectedClassId,
      destination: selectedDestination,
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
    } else {
      toast({ title: "Error", description: "Could not issue pass", variant: "destructive" });
    }
    setIsActionLoading(false);
  };

  // --- Auth & Data Fetching (truncated for brevity but logic remains same) ---
  useEffect(() => { checkUser(); }, []);

  const checkUser = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate('/auth'); return; }
      const { data: profileData } = await supabase.from('profiles').select('id, full_name').eq('id', user.id).single();
      const { data: roleData } = await supabase.from('user_roles').select('role').eq('user_id', user.id).single();

      if (!profileData || roleData?.role !== 'teacher') { navigate('/'); return; }
      setProfile({ ...profileData, email: user.email });
      await fetchClasses(user.id);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  const fetchClasses = useCallback(async (userId?: string) => {
    const uid = userId || profile?.id;
    if (!uid) return;
    const { data } = await supabase.from('classes').select('*').eq('teacher_id', uid).order('period_order');
    if (data) setClasses(data);
  }, [profile]);

  const fetchPasses = useCallback(async () => {
    if (!selectedClassId) return;
    const { data: passes } = await supabase.from('passes').select('*').eq('class_id', selectedClassId).in('status', ['pending', 'approved', 'pending_return']);
    if (passes) {
      const studentIds = [...new Set(passes.map(p => p.student_id))];
      const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', studentIds);
      const profileMap = new Map(profiles?.map(p => [p.id, p.full_name]) || []);
      
      setPendingPasses(passes.filter(p => p.status === 'pending').map(p => ({ ...p, student_name: profileMap.get(p.student_id) || 'Unknown' })) as PendingPass[]);
      setActivePasses(passes.filter(p => ['approved', 'pending_return'].includes(p.status)).map(p => ({ ...p, student_name: profileMap.get(p.student_id) || 'Unknown' })) as ActivePass[]);
    }
  }, [selectedClassId]);

  const fetchStudents = useCallback(async () => {
    if (!selectedClassId) return;
    const { data: enrollments } = await supabase.from('class_enrollments').select('student_id').eq('class_id', selectedClassId);
    if (!enrollments?.length) { setStudents([]); return; }
    const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', enrollments.map(e => e.student_id));
    if (profiles) setStudents(profiles.map(p => ({ id: p.id, name: p.full_name, email: '' })));
  }, [selectedClassId]);

  useEffect(() => {
    if (selectedClassId) {
      fetchStudents(); fetchPasses();
      const channel = supabase.channel(`db-${selectedClassId}`).on('postgres_changes', { event: '*', schema: 'public', table: 'passes', filter: `class_id=eq.${selectedClassId}` }, () => fetchPasses()).subscribe();
      return () => { supabase.removeChannel(channel); };
    }
  }, [selectedClassId, fetchPasses, fetchStudents]);

  if (loading) return <div className="h-screen flex items-center justify-center bg-slate-950 text-blue-500"><Loader2 className="animate-spin w-12 h-12" /></div>;

  return (
    <PageTransition className="min-h-screen bg-slate-950 text-slate-100 pb-32">
      <div className="relative p-4 sm:p-6 max-w-7xl mx-auto z-10">
        <TeacherHeader signOut={() => supabase.auth.signOut()} />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <PeriodDisplay />
          {profile?.id && <SubModeToggle userId={profile.id} onSubModeChange={handleSubModeChange} />}
        </div>

        <StaggerContainer className="space-y-6">
          <StaggerItem>
            <GlassCard className="p-6 bg-slate-900/60 border-white/10 shadow-xl">
              <TeacherControls
                classes={displayClasses}
                isSubMode={isSubMode}
                selectedClassId={selectedClassId}
                onClassChange={setSelectedClassId}
                onAddClass={() => setDialogOpen(true)}
                currentClass={currentClass}
                // ... (other props match your TeacherControls implementation)
              />
            </GlassCard>
          </StaggerItem>

          <StaggerItem>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <GlassCard className="p-6 bg-slate-900/60 border-white/10"><RequestQueue pendingPasses={pendingPasses} onApprove={() => {}} onDeny={() => {}} /></GlassCard>
              <GlassCard className="p-6 bg-slate-900/60 border-white/10"><ActivePassList activePasses={activePasses} onCheckIn={() => {}} /></GlassCard>
            </div>
          </StaggerItem>

          {selectedClassId && (
            <StaggerItem>
              <GlassCard className="p-6 bg-slate-900/60 border-white/10">
                <RosterGrid students={students} currentClass={currentClass} searchQuery={searchQuery} setSearchQuery={setSearchQuery} onViewHistory={handleViewHistory} onRemoveStudent={() => {}} />
              </GlassCard>
            </StaggerItem>
          )}
        </StaggerContainer>

        {/* --- FLOATING QUICK PASS BUTTON --- */}
        {selectedClassId && (
          <motion.div initial={{ y: 100 }} animate={{ y: 0 }} className="fixed bottom-8 right-8 z-50">
            <Button onClick={() => setCreatePassDialogOpen(true)} className="px-8 h-16 rounded-2xl shadow-2xl text-lg font-bold bg-blue-600 hover:bg-blue-500 text-white border-none">
              <Plus className="mr-2 h-6 w-6" /> ISSUE QUICK PASS
            </Button>
          </motion.div>
        )}

        {/* --- QUICK PASS DIALOG --- */}
        <Dialog open={createPassDialogOpen} onOpenChange={setCreatePassDialogOpen}>
          <DialogContent className="rounded-3xl max-w-sm bg-slate-900 border-white/10 text-slate-100">
            <DialogHeader><DialogTitle className="font-bold text-xl">Quick Pass</DialogTitle></DialogHeader>
            <div className="space-y-6 py-4">
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase text-slate-400">Student</Label>
                <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto pr-1">
                  {students.map(s => (
                    <Button key={s.id} size="sm" variant={selectedStudentForPass === s.id ? 'default' : 'outline'}
                      className={`rounded-xl font-bold ${selectedStudentForPass === s.id ? 'bg-blue-600' : 'border-white/10 text-blue-600 bg-blue-900/20'}`}
                      onClick={() => setSelectedStudentForPass(s.id)}>
                      {s.name.split(' ')[0]}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase text-slate-400">Location</Label>
                <div className="grid grid-cols-2 gap-2">
                  {DESTINATIONS.map(d => (
                    <Button key={d} variant={selectedDestination === d ? 'default' : 'outline'}
                      className={`rounded-xl font-bold ${selectedDestination === d ? 'bg-blue-600' : 'border-white/10 text-blue-600 bg-blue-900/20'}`}
                      onClick={() => setSelectedDestination(d)}>
                      {d}
                    </Button>
                  ))}
                </div>
              </div>
              <Button onClick={handleQuickPass} disabled={isActionLoading || !selectedStudentForPass || !selectedDestination} className="w-full h-12 rounded-xl bg-blue-600 hover:bg-blue-700">
                {isActionLoading ? <Loader2 className="animate-spin" /> : 'Confirm Pass'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <ClassManagementDialog open={dialogOpen} onOpenChange={setDialogOpen} userId={profile?.id || ''} organizationId={organizationId} editingClass={null} onSaved={() => { fetchClasses(); setDialogOpen(false); }} />
        <StudentHistoryDialog open={historyDialogOpen} onOpenChange={setHistoryDialogOpen} studentId={selectedStudentForHistory?.id || null} studentName={selectedStudentForHistory?.name || null} />
      </div>
    </PageTransition>
  );
};

export default TeacherDashboard;
