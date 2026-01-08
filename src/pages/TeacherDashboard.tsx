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
import { Plus, Loader2 } from 'lucide-react';

export const TeacherDashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { organizationId } = useOrganization();

  // --- Core State ---
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<{ id: string; full_name: string; email?: string } | null>(null);
  const [classes, setClasses] = useState<any[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [students, setStudents] = useState<any[]>([]);
  const [pendingPasses, setPendingPasses] = useState<any[]>([]);
  const [activePasses, setActivePasses] = useState<any[]>([]);
  
  // --- UI States ---
  const [dialogOpen, setDialogOpen] = useState(false);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [createPassDialogOpen, setCreatePassDialogOpen] = useState(false);
  const [selectedStudentForHistory, setSelectedStudentForHistory] = useState<any | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // --- Quick Pass State ---
  const [selectedStudentForPass, setSelectedStudentForPass] = useState('');
  const [selectedDestination, setSelectedDestination] = useState('');
  const [isActionLoading, setIsActionLoading] = useState(false);
  const DESTINATIONS = ['Restroom', 'Locker', 'Office', 'Other'];

  const currentClass = classes.find(c => c.id === selectedClassId);

  // --- Auth Logic ---
  const checkUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { navigate('/auth'); return; }
    const { data: profileData } = await supabase.from('profiles').select('id, full_name').eq('id', user.id).single();
    setProfile(profileData);
    fetchClasses(user.id);
    setLoading(false);
  };

  const fetchClasses = async (uid: string) => {
    const { data } = await supabase.from('classes').select('*').eq('teacher_id', uid).order('period_order');
    if (data) setClasses(data);
  };

  const fetchPasses = useCallback(async () => {
    if (!selectedClassId) return;
    const { data: passes } = await supabase
      .from('passes')
      .select('*, profiles(full_name)')
      .eq('class_id', selectedClassId)
      .in('status', ['pending', 'approved', 'pending_return']);
    
    if (passes) {
      setPendingPasses(passes.filter(p => p.status === 'pending').map(p => ({ ...p, student_name: p.profiles?.full_name })));
      setActivePasses(passes.filter(p => p.status !== 'pending').map(p => ({ ...p, student_name: p.profiles?.full_name })));
    }
  }, [selectedClassId]);

  const fetchStudents = useCallback(async () => {
    if (!selectedClassId) return;
    const { data } = await supabase.from('class_enrollments').select('profiles(id, full_name)').eq('class_id', selectedClassId);
    if (data) setStudents(data.map((d: any) => ({ id: d.profiles.id, name: d.profiles.full_name })));
  }, [selectedClassId]);

  useEffect(() => { checkUser(); }, []);
  useEffect(() => {
    if (selectedClassId) {
      fetchPasses();
      fetchStudents();
    }
  }, [selectedClassId, fetchPasses, fetchStudents]);

  const handleQuickPass = async () => {
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
      setCreatePassDialogOpen(false);
      fetchPasses();
      toast({ title: "Pass Issued" });
    }
    setIsActionLoading(false);
  };

  if (loading) return <div className="h-screen w-full flex items-center justify-center bg-slate-950 text-white">Loading...</div>;

  return (
    <PageTransition className="min-h-screen w-full bg-slate-950 text-slate-100 flex flex-col items-center">
      {/* Background Glow */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none opacity-20 z-0">
        <div className="absolute top-[-10%] right-[-10%] w-[600px] h-[600px] bg-blue-600 blur-[150px] rounded-full" />
      </div>

      {/* Main Content Wrapper - Set to Full Width with Max-Width limit */}
      <div className="relative w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-6 z-10 flex flex-col gap-6">
        
        {/* Header - Full Width of container */}
        <TeacherHeader signOut={() => supabase.auth.signOut()} />
        
        <div className="w-full">
          <PeriodDisplay />
        </div>

        <StaggerContainer className="w-full space-y-6">
          <StaggerItem>
            <GlassCard className="p-6 bg-slate-900/60 border-white/10 w-full">
              <TeacherControls
                classes={classes}
                selectedClassId={selectedClassId}
                onClassChange={setSelectedClassId}
                onAddClass={() => setDialogOpen(true)}
                currentClass={currentClass}
              />
            </GlassCard>
          </StaggerItem>

          <StaggerItem>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 w-full">
              <GlassCard className="p-6 bg-slate-900/60 border-white/10 h-full">
                <RequestQueue pendingPasses={pendingPasses} onApprove={() => fetchPasses()} onDeny={() => fetchPasses()} />
              </GlassCard>
              <GlassCard className="p-6 bg-slate-900/60 border-white/10 h-full">
                <ActivePassList activePasses={activePasses} onCheckIn={() => fetchPasses()} />
              </GlassCard>
            </div>
          </StaggerItem>

          {selectedClassId && (
            <StaggerItem>
              <GlassCard className="p-6 bg-slate-900/60 border-white/10 w-full">
                <RosterGrid
                  students={students}
                  searchQuery={searchQuery}
                  setSearchQuery={setSearchQuery}
                  onViewHistory={(s) => { setSelectedStudentForHistory(s); setHistoryDialogOpen(true); }}
                />
              </GlassCard>
            </StaggerItem>
          )}
        </StaggerContainer>
      </div>

      {/* Floating Action Button - Properly Centered relative to screen */}
      {selectedClassId && (
        <div className="fixed bottom-8 left-0 right-0 flex justify-center px-4 z-50">
          <Button 
            onClick={() => setCreatePassDialogOpen(true)}
            className="w-full max-w-lg h-16 rounded-2xl shadow-2xl text-lg font-bold bg-blue-600 hover:bg-blue-500 text-white border-none transition-transform hover:scale-[1.02]"
          >
            <Plus className="mr-2 h-6 w-6" /> ISSUE QUICK PASS
          </Button>
        </div>
      )}

      {/* Dialogs */}
      <Dialog open={createPassDialogOpen} onOpenChange={setCreatePassDialogOpen}>
        <DialogContent className="rounded-3xl max-w-sm bg-slate-900 border-white/10 text-slate-100">
          <DialogHeader><DialogTitle className="font-bold text-xl">Quick Pass</DialogTitle></DialogHeader>
          <div className="space-y-6 py-4">
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase text-slate-400">Select Student</Label>
              <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                {students.map(s => (
                  <Button 
                    key={s.id} size="sm" 
                    variant={selectedStudentForPass === s.id ? 'default' : 'outline'}
                    className={`rounded-xl font-bold truncate ${selectedStudentForPass === s.id ? 'bg-blue-600' : 'border-white/10'}`}
                    onClick={() => setSelectedStudentForPass(s.id)}
                  >
                    {s.name}
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
                    className={`rounded-xl font-bold ${selectedDestination === d ? 'bg-blue-600' : 'border-white/10'}`}
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
      
      <ClassManagementDialog open={dialogOpen} onOpenChange={setDialogOpen} userId={profile?.id || ''} onSaved={() => fetchClasses(profile?.id || '')} />
      <StudentHistoryDialog open={historyDialogOpen} onOpenChange={setHistoryDialogOpen} studentId={selectedStudentForHistory?.id} studentName={selectedStudentForHistory?.name} />
    </PageTransition>
  );
};

export default TeacherDashboard;
