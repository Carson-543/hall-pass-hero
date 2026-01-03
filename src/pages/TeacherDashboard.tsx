import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useToast } from '@/hooks/use-toast';
import { usePageVisibility } from '@/hooks/usePageVisibility';
import { PeriodDisplay } from '@/components/PeriodDisplay';
import { ElapsedTimer } from '@/components/ElapsedTimer';
import { ClassManagementDialog } from '@/components/teacher/ClassManagementDialog';
import { StudentManagementDialog } from '@/components/teacher/StudentManagementDialog';
import { BathroomQueueStatus } from '@/components/teacher/BathroomQueueStatus';
import {
  LogOut, Plus, AlertTriangle, Check, X,
  Copy, Search, Loader2, History, Timer, UserMinus, Snowflake
} from 'lucide-react';
import { startOfWeek, addMinutes, differenceInSeconds } from 'date-fns';

// --- Interfaces ---
interface ClassInfo {
  id: string;
  name: string;
  period_order: number;
  join_code: string;
  max_concurrent_bathroom?: number;
}


interface PendingPass {
  id: string;
  student_id: string;
  student_name: string;
  destination: string;
  status: string;
  requested_at: string;
  approved_at?: string;
  is_quota_exceeded: boolean;
  from_class_name?: string;
}

interface Student {
  id: string;
  name: string;
  email: string;
}

interface ActiveFreeze {
  id: string;
  freeze_type: 'bathroom' | 'all';
  ends_at: string | null;
}

const TeacherDashboard = () => {
  const { user, role, signOut, loading: authLoading } = useAuth();
  const { organization, settings } = useOrganization();
  const { toast } = useToast();
  const isVisible = usePageVisibility();
  const userId = user?.id;

  // Core Data
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [pendingPasses, setPendingPasses] = useState<PendingPass[]>([]);
  const [activePasses, setActivePasses] = useState<PendingPass[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [weeklyLimit, setWeeklyLimit] = useState<number>(4);

  // Freeze State
  const [activeFreeze, setActiveFreeze] = useState<ActiveFreeze | null>(null);
  const [freezeType, setFreezeType] = useState<'bathroom' | 'all'>('bathroom');
  const [timerMinutes, setTimerMinutes] = useState<string>('');
  const [isFreezeLoading, setIsFreezeLoading] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);

  // UI States
  const [createPassDialogOpen, setCreatePassDialogOpen] = useState(false);
  const [classDialogOpen, setClassDialogOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<ClassInfo | null>(null);
  const [studentDialogOpen, setStudentDialogOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);

  // Quick Pass Logic
  const [selectedStudentForPass, setSelectedStudentForPass] = useState('');
  const [selectedDestination, setSelectedDestination] = useState('');
  const [customDestination, setCustomDestination] = useState('');

  // History State
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [studentHistory, setStudentHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyFilterLocation, setHistoryFilterLocation] = useState<string>('all');
  const [historyFilterClass, setHistoryFilterClass] = useState<string>('all');

  const DESTINATIONS = ['Restroom', 'Locker', 'Office', 'Other'];

  // --- Helpers ---
  const getDestinationColor = (destination: string) => {
    switch (destination?.toLowerCase()) {
      case 'restroom': return 'bg-green-500/10 text-green-700 border-green-500/20';
      case 'locker': return 'bg-blue-500/10 text-blue-700 border-blue-500/20';
      case 'office': return 'bg-purple-500/10 text-purple-700 border-purple-500/20';
      default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  // --- Actions ---
  const fetchFreezeStatus = useCallback(async (classId: string) => {
    if (!classId) return;
    const { data } = await supabase.from('pass_freezes').select('id, freeze_type, ends_at').eq('class_id', classId).eq('is_active', true).maybeSingle();
    if (data) setActiveFreeze({ id: data.id, freeze_type: data.freeze_type as 'bathroom' | 'all', ends_at: data.ends_at });
    else setActiveFreeze(null);
  }, []);

  const handleFreeze = async () => {
    if (!selectedClassId || !userId) return;
    setIsFreezeLoading(true);
    const endsAt = timerMinutes ? addMinutes(new Date(), parseInt(timerMinutes)).toISOString() : null;
    const { error } = await supabase.from('pass_freezes').upsert({
      class_id: selectedClassId, teacher_id: userId, freeze_type: freezeType, ends_at: endsAt, is_active: true,
    }, { onConflict: 'class_id' });
    if (!error) { toast({ title: freezeType === 'bathroom' ? 'Bathroom Frozen' : 'Queue Frozen' }); setTimerMinutes(''); }
    setIsFreezeLoading(false);
  };

  const handleUnfreeze = async () => {
    if (!selectedClassId) return;
    setIsFreezeLoading(true);
    await supabase.from('pass_freezes').delete().eq('class_id', selectedClassId);
    toast({ title: "Queue Unfrozen" });
    setIsFreezeLoading(false);
  };

  const fetchClasses = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase.from('classes').select('id, name, period_order, join_code, max_concurrent_bathroom').eq('teacher_id', userId).order('period_order');
    if (data && data.length > 0) {
      setClasses(data);
      if (!selectedClassId) setSelectedClassId(data[0].id);
    }
  }, [userId, selectedClassId]);


  const fetchPasses = useCallback(async (classId: string) => {
    if (!userId || !classId) return;
    const { data: rawPending } = await supabase.from('passes').select('id, student_id, destination, status, requested_at').eq('class_id', classId).eq('status', 'pending').order('requested_at', { ascending: true });
    if (rawPending) {
      const pIds = rawPending.map(p => p.student_id);
      const { data: pNames } = await supabase.from('profiles').select('id, full_name').in('id', pIds);
      const nameMap = new Map(pNames?.map(n => [n.id, n.full_name]));
      const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 }).toISOString();

      const pendingMapped = await Promise.all(rawPending.map(async (p: any) => {
        const { count } = await supabase.from('passes').select('id', { count: 'exact', head: true }).eq('student_id', p.student_id).eq('destination', 'Restroom').in('status', ['approved', 'pending_return', 'returned']).gte('requested_at', weekStart);
        return { id: p.id, student_id: p.student_id, student_name: nameMap.get(p.student_id) || 'Unknown', destination: p.destination, status: p.status, requested_at: p.requested_at, is_quota_exceeded: (count || 0) >= (settings?.weekly_bathroom_limit ?? 4) };
      }));
      setPendingPasses(pendingMapped);
    }

    const { data: rawActive } = await supabase.from('passes').select('id, student_id, class_id, destination, status, requested_at, approved_at').in('status', ['approved', 'pending_return']).order('approved_at', { ascending: true });
    if (rawActive) {
      const activeSIds = rawActive.map(p => p.student_id);
      const [profilesRes, classesRes] = await Promise.all([
        supabase.from('profiles').select('id, full_name').in('id', activeSIds),
        supabase.from('classes').select('id, name').in('id', rawActive.map(p => p.class_id))
      ]);
      const pMap = new Map(profilesRes.data?.map(p => [p.id, p.full_name]));
      const cMap = new Map(classesRes.data?.map(c => [c.id, c.name]));
      setActivePasses(rawActive.map(p => ({ id: p.id, student_id: p.student_id, student_name: pMap.get(p.student_id) || 'Unknown', destination: p.destination, status: p.status, requested_at: p.requested_at, approved_at: p.approved_at, is_quota_exceeded: false, from_class_name: cMap.get(p.class_id) })));
    }
  }, [userId, settings]);

  const fetchRoster = useCallback(async (classId: string) => {
    const { data: enrollments } = await supabase.from('class_enrollments').select('student_id').eq('class_id', classId);
    if (!enrollments || enrollments.length === 0) { setStudents([]); return; }
    const { data: profiles } = await supabase.from('profiles').select('id, full_name, email').in('id', enrollments.map(e => e.student_id)).order('full_name');
    if (profiles) setStudents(profiles.map(p => ({ id: p.id, name: p.full_name, email: p.email })));
  }, []);

  const handleApprove = async (id: string, override: boolean) => {
    if (!userId) return;
    await supabase.from('passes').update({ status: 'approved', approved_at: new Date().toISOString(), approved_by: userId, is_quota_override: override }).eq('id', id);
    toast({ title: "Pass Approved" });
  };

  const handleDeny = async (id: string) => {
    await supabase.from('passes').update({ status: 'denied', denied_at: new Date().toISOString(), denied_by: userId }).eq('id', id);
    toast({ title: "Pass Denied", variant: "destructive" });
  };

  const handleCheckIn = async (id: string) => {
    await supabase.from('passes').update({ status: 'returned', returned_at: new Date().toISOString(), confirmed_by: userId }).eq('id', id);
    toast({ title: "Student Returned" });
  };

  const handleQuickPass = async () => {
    if (!selectedStudentForPass || !selectedDestination || !userId) return;
    const dest = selectedDestination === 'Other' ? customDestination : selectedDestination;
    const { error } = await supabase.from('passes').insert({
      student_id: selectedStudentForPass, class_id: selectedClassId, destination: dest,
      status: 'approved', approved_at: new Date().toISOString(), approved_by: userId
    });
    if (!error) { setCreatePassDialogOpen(false); setSelectedStudentForPass(''); setSelectedDestination(''); toast({ title: 'Pass Issued' }); }
  };

  const fetchStudentHistory = useCallback(async (studentId: string) => {
    setLoadingHistory(true);
    const { data: rawHistory } = await supabase.from('passes').select('id, destination, requested_at, approved_at, returned_at, class_id').eq('student_id', studentId).order('requested_at', { ascending: false }).limit(50);
    if (rawHistory) {
      const { data: cData } = await supabase.from('classes').select('id, name, period_order').in('id', rawHistory.map(p => p.class_id));
      const cMap = new Map(cData?.map(c => [c.id, c]));
      setStudentHistory(rawHistory.map(p => ({ ...p, classes: cMap.get(p.class_id) })));
    }
    setLoadingHistory(false);
  }, []);

  useEffect(() => { if (historyDialogOpen && selectedStudent) fetchStudentHistory(selectedStudent.id); }, [historyDialogOpen, selectedStudent, fetchStudentHistory]);

  const filteredHistory = useMemo(() => studentHistory.filter(pass => (historyFilterLocation === 'all' || pass.destination === historyFilterLocation) && (historyFilterClass === 'all' || pass.class_id === historyFilterClass)), [studentHistory, historyFilterLocation, historyFilterClass]);

  const totalMinutes = useMemo(() => filteredHistory.reduce((acc, pass) => (pass.returned_at && pass.approved_at) ? acc + ((new Date(pass.returned_at).getTime() - new Date(pass.approved_at).getTime()) / 60000) : acc, 0), [filteredHistory]);

  useEffect(() => { if (userId) fetchClasses(); }, [userId, fetchClasses]);
  useEffect(() => {
    if (!selectedClassId || !userId) return;
    fetchFreezeStatus(selectedClassId);
    fetchRoster(selectedClassId);
    fetchPasses(selectedClassId);
    const channel = supabase.channel(`teacher-${selectedClassId}`).on('postgres_changes', { event: '*', schema: 'public', table: 'passes', filter: `class_id=eq.${selectedClassId}` }, () => fetchPasses(selectedClassId)).subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [selectedClassId, userId, fetchFreezeStatus, fetchRoster, fetchPasses]);

  if (authLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin h-8 w-8 text-primary" /></div>;
  if (!user || role !== 'teacher') return <Navigate to="/auth" replace />;

  const currentClass = classes.find(c => c.id === selectedClassId);
  const filteredStudents = students.filter(s => s.name.toLowerCase().includes(searchQuery.toLowerCase()));
  const bathroomPending = pendingPasses.filter(p => p.destination === 'Restroom').length;
  const bathroomActive = activePasses.filter(p => p.destination === 'Restroom').length;

  return (
    <div className="min-h-screen bg-background p-4 max-w-6xl mx-auto pb-32">
      <header className="flex items-center justify-between mb-6 pt-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center shadow-lg shadow-primary/20"><span className="text-primary-foreground font-bold text-xl">T</span></div>
          <h1 className="text-xl font-bold">Teacher Dashboard</h1>
        </div>
        <Button variant="ghost" size="sm" onClick={() => signOut()} className="text-muted-foreground hover:text-destructive"><LogOut className="h-4 w-4 mr-2" /> Sign Out</Button>
      </header>

      <div className="space-y-6">
        <PeriodDisplay />

        <div className="flex gap-2">
          <Select value={selectedClassId} onValueChange={setSelectedClassId}>
            <SelectTrigger className="h-14 rounded-2xl bg-card border-none shadow-sm text-lg font-bold px-6 flex-1"><SelectValue placeholder="Select Class" /></SelectTrigger>
            <SelectContent>{classes.map(c => <SelectItem key={c.id} value={c.id}>Period {c.period_order}: {c.name}</SelectItem>)}</SelectContent>
          </Select>
          <Button size="icon" variant="outline" className="h-14 w-14 rounded-2xl border-dashed" onClick={() => { setEditingClass(null); setClassDialogOpen(true); }}><Plus className="h-5 w-5" /></Button>
        </div>

        {selectedClassId && (
          <>
            <BathroomQueueStatus classId={selectedClassId} maxConcurrent={currentClass?.max_concurrent_bathroom ?? settings?.max_concurrent_bathroom ?? 2} />


            <div className="flex flex-col gap-8">
              {/* REQUESTS SECTION */}
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b pb-2">
                  <h2 className="text-sm font-black uppercase tracking-[0.2em] text-yellow-600">Class Requests ({pendingPasses.length})</h2>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant={!!activeFreeze ? "destructive" : "outline"} className={`group relative overflow-hidden transition-all duration-300 h-9 w-9 hover:w-44 rounded-full border shadow-sm ${!!activeFreeze ? 'bg-destructive text-destructive-foreground' : 'bg-background text-blue-500 hover:border-blue-300'}`} disabled={isFreezeLoading}>
                        <div className="absolute left-0 flex items-center justify-center w-9 h-9">{isFreezeLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Snowflake className={`h-4 w-4 ${activeFreeze ? 'animate-pulse' : ''}`} />}</div>
                        <span className="ml-6 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap text-xs font-bold pl-1 uppercase tracking-tighter">{activeFreeze ? "Unfreeze Queue" : "Freeze Controls"}</span>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-72 rounded-3xl" align="end">
                      {activeFreeze ? (
                        <div className="space-y-3 text-center p-2"><p className="font-bold text-destructive">{activeFreeze.freeze_type === 'bathroom' ? 'Bathroom' : 'All'} Passes are Frozen</p><Button variant="destructive" className="w-full rounded-xl font-bold" onClick={handleUnfreeze}>Unfreeze Now</Button></div>
                      ) : (
                        <div className="space-y-4 p-2">
                          <div className="space-y-2"><Label className="text-[10px] font-bold uppercase text-muted-foreground">Freeze Type</Label><Select value={freezeType} onValueChange={(v) => setFreezeType(v as 'bathroom' | 'all')}><SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="bathroom">Bathroom Only</SelectItem><SelectItem value="all">All Passes</SelectItem></SelectContent></Select></div>
                          <div className="space-y-2"><Label className="text-[10px] font-bold uppercase text-muted-foreground">Timer (Minutes)</Label><Input type="number" placeholder="Stay frozen until manually cleared" value={timerMinutes} onChange={(e) => setTimerMinutes(e.target.value)} className="rounded-xl" /></div>
                          <Button className="w-full font-bold rounded-xl" onClick={handleFreeze}>Freeze Pass Queue</Button>
                        </div>
                      )}
                    </PopoverContent>
                  </Popover>
                </div>

                {pendingPasses.length === 0 ? (
                  <div className="py-8 text-center bg-muted/20 rounded-2xl border-2 border-dashed"><p className="text-sm font-bold text-muted-foreground">No active requests</p></div>
                ) : (
                  <div className="space-y-3">
                    {pendingPasses.map(pass => (
                      <Card key={pass.id} className={`rounded-2xl border-l-[6px] ${pass.is_quota_exceeded ? 'border-l-destructive shadow-destructive/5' : 'border-l-yellow-500'} shadow-sm`}>
                        <CardContent className="p-5 flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <h3 className="text-lg font-bold">{pass.student_name}</h3>
                              {pass.is_quota_exceeded && <div className="bg-destructive/10 text-destructive text-[10px] px-2 py-0.5 rounded-full font-black flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> LIMIT REACHED</div>}
                            </div>
                            <span className={`inline-block mt-1 px-3 py-1 text-xs font-black rounded-full border tracking-wider uppercase ${getDestinationColor(pass.destination)}`}>{pass.destination}</span>
                          </div>
                          <div className="flex gap-2">
                            <Button size="icon" variant="secondary" className="h-12 w-12 rounded-xl bg-muted" onClick={() => handleDeny(pass.id)}><X className="h-5 w-5" /></Button>
                            <Button size="icon" className="h-12 w-12 rounded-xl shadow-lg bg-primary text-primary-foreground" onClick={() => handleApprove(pass.id, pass.is_quota_exceeded)}><Check className="h-5 w-5" /></Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>

              {/* ACTIVE HALLWAY SECTION */}
              <div className="space-y-4">
                <h2 className="text-sm font-black uppercase tracking-[0.2em] text-green-600 border-b pb-2">Active Hallway ({activePasses.length})</h2>
                {activePasses.length === 0 ? (
                  <div className="py-8 text-center bg-muted/20 rounded-2xl border-2 border-dashed"><p className="text-sm font-bold text-muted-foreground">Hallway is empty</p></div>
                ) : (
                  <div className="space-y-3">
                    {activePasses.map(pass => (
                      <Card key={pass.id} className="rounded-2xl border-l-[6px] border-l-green-500 shadow-sm">
                        <CardContent className="p-5 flex items-center justify-between">
                          <div>
                            <h3 className="text-lg font-bold">{pass.student_name}</h3>
                            <div className="flex flex-wrap items-center gap-2 mt-2">
                              {pass.from_class_name && <span className="text-[10px] font-black uppercase text-muted-foreground bg-muted px-2 py-1 rounded-md">{pass.from_class_name}</span>}
                              <span className={`inline-block px-3 py-1 text-xs font-black rounded-full border tracking-wider uppercase ${getDestinationColor(pass.destination)}`}>{pass.destination}</span>
                              {pass.approved_at && <div className="bg-green-500/10 text-green-600 px-3 py-1 rounded-full"><ElapsedTimer startTime={pass.approved_at} destination={pass.destination} /></div>}
                            </div>
                          </div>
                          <Button onClick={() => handleCheckIn(pass.id)} className="rounded-xl h-12 px-6 shadow-md font-bold uppercase tracking-tight">Check In</Button>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* ROSTER SECTION */}
            <div className="space-y-4 pt-12 border-t mt-12">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="relative w-full sm:max-w-md">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                  <Input placeholder="Search class roster..." className="h-14 pl-12 rounded-2xl border-none shadow-inner bg-muted/40 font-medium" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                </div>
                {currentClass && (
                  <div className="flex items-center gap-4 bg-primary/5 border-2 border-primary/20 p-2 pl-6 rounded-2xl group w-full sm:w-auto justify-between">
                    <div>
                      <p className="text-[10px] font-black text-primary/60 uppercase leading-none mb-1">Join Code</p>
                      <span className="text-2xl font-black tracking-[0.15em] text-primary">{currentClass.join_code}</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-12 w-12 rounded-xl bg-white shadow-sm hover:bg-primary hover:text-white transition-colors"
                      onClick={() => {
                        navigator.clipboard.writeText(currentClass.join_code);
                        toast({ title: "Code Copied", description: "Copied to clipboard" });
                      }}
                    >
                      <Copy className="h-5 w-5" />
                    </Button>
                  </div>
                )}
              </div>
              <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                {filteredStudents.map(student => (
                  <div key={student.id} className="bg-card p-4 rounded-2xl shadow-sm border flex items-center justify-between group hover:border-primary/50 transition-colors">
                    <p className="font-bold text-lg">{student.name}</p>
                    <div className="flex gap-2">
                      <Button size="icon" variant="ghost" className="h-10 w-10 rounded-xl bg-muted/50 opacity-50 group-hover:opacity-100" onClick={() => { setSelectedStudent(student); setHistoryDialogOpen(true); }}><History className="h-5 w-5" /></Button>
                      <Button size="icon" variant="ghost" className="h-10 w-10 rounded-xl bg-muted/50 opacity-50 group-hover:opacity-100" onClick={() => { setSelectedStudent(student); setStudentDialogOpen(true); }}><UserMinus className="h-5 w-5" /></Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* FAB - QUICK PASS */}
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 w-full max-w-md px-4">
        <Button onClick={() => setCreatePassDialogOpen(true)} className="w-full h-16 rounded-3xl shadow-2xl text-xl font-black flex items-center justify-center gap-4 border-t-4 border-white/20">
          <Plus className="h-6 w-6" /> ISSUE QUICK PASS
        </Button>
      </div>

      {/* QUICK PASS DIALOG */}
      <Dialog open={createPassDialogOpen} onOpenChange={setCreatePassDialogOpen}>
        <DialogContent className="rounded-[2.5rem] max-w-sm p-8">
          <DialogHeader><DialogTitle className="font-black text-2xl text-center">Quick Pass</DialogTitle></DialogHeader>
          <div className="space-y-6 py-4">
            <div className="space-y-3">
              <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">Student</Label>
              <Select value={selectedStudentForPass} onValueChange={setSelectedStudentForPass}>
                <SelectTrigger className="h-14 rounded-2xl bg-muted/30 border-none text-lg font-bold"><SelectValue placeholder="Who is leaving?" /></SelectTrigger>
                <SelectContent className="rounded-2xl">{students.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-3">
              <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">Destination</Label>
              <div className="grid grid-cols-2 gap-2">
                {DESTINATIONS.map(d => (
                  <Button
                    key={d}
                    variant={selectedDestination === d ? 'default' : 'outline'}
                    className={`h-14 rounded-2xl font-bold border-2 ${selectedDestination === d ? 'border-primary' : 'border-transparent bg-muted/20'}`}
                    onClick={() => setSelectedDestination(d)}
                  >{d}</Button>
                ))}
              </div>
            </div>
            <Button onClick={handleQuickPass} className="w-full h-16 rounded-2xl font-black text-lg shadow-xl mt-4" disabled={!selectedStudentForPass || !selectedDestination}>Confirm & Issue</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* HISTORY DIALOG */}
      <Dialog open={historyDialogOpen} onOpenChange={setHistoryDialogOpen}>
        <DialogContent className="rounded-[2.5rem] max-w-lg p-8">
          <DialogHeader><DialogTitle className="flex items-center gap-3 text-2xl font-black"><History className="h-6 w-6 text-primary" /> {selectedStudent?.name}</DialogTitle></DialogHeader>
          <div className="flex gap-2 mb-2 mt-6">
            <Select value={historyFilterLocation} onValueChange={setHistoryFilterLocation}><SelectTrigger className="h-12 rounded-xl bg-muted/50 border-none font-bold"><SelectValue placeholder="Location" /></SelectTrigger><SelectContent className="rounded-xl"><SelectItem value="all">All Locations</SelectItem>{DESTINATIONS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent></Select>
            <Select value={historyFilterClass} onValueChange={setHistoryFilterClass}><SelectTrigger className="h-12 rounded-xl bg-muted/50 border-none font-bold"><SelectValue placeholder="Class" /></SelectTrigger><SelectContent className="rounded-xl"><SelectItem value="all">All Periods</SelectItem>{classes.map(c => <SelectItem key={c.id} value={c.id}>P{c.period_order}</SelectItem>)}</SelectContent></Select>
          </div>
          <div className="space-y-3 py-6 max-h-[40vh] overflow-y-auto pr-2 custom-scrollbar">
            {loadingHistory ? <div className="flex justify-center py-8"><Loader2 className="animate-spin h-8 w-8 text-primary" /></div> : filteredHistory.length === 0 ? <p className="text-center text-muted-foreground py-8 font-bold">No history recorded.</p> : filteredHistory.map(pass => (
              <div key={pass.id} className="p-4 rounded-2xl bg-muted/20 border border-muted/50 flex flex-col gap-2">
                <div className="flex justify-between items-start">
                  <div><span className={`text-[10px] font-black uppercase px-3 py-1 rounded-full border ${getDestinationColor(pass.destination)}`}>{pass.destination}</span><p className="text-xs font-bold mt-2 text-muted-foreground">{pass.classes?.name || 'Unknown Class'}</p></div>
                  <div className="text-right"><p className="text-[10px] font-black text-muted-foreground uppercase">{new Date(pass.requested_at).toLocaleDateString()}</p><p className="font-bold text-sm">{new Date(pass.requested_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p></div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-6 border-t flex justify-between items-center"><div className="flex items-center gap-3"><Timer className="h-6 w-6 text-primary" /><p className="text-sm font-black text-muted-foreground uppercase tracking-[0.2em]">Weekly Airtime</p></div><p className="text-4xl font-black text-primary leading-none">{Math.round(totalMinutes)}<span className="text-sm ml-1 text-muted-foreground">m</span></p></div>
        </DialogContent>
      </Dialog>

      <ClassManagementDialog open={classDialogOpen} onOpenChange={setClassDialogOpen} editingClass={editingClass} userId={userId || ''} onSaved={fetchClasses} />
      <StudentManagementDialog open={studentDialogOpen} onOpenChange={setStudentDialogOpen} student={selectedStudent} currentClassId={selectedClassId} teacherClasses={classes} onUpdated={() => fetchRoster(selectedClassId)} />
    </div>
  );
};

export default TeacherDashboard;
