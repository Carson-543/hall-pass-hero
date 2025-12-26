import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { usePageVisibility } from '@/hooks/usePageVisibility';
import { PeriodDisplay } from '@/components/PeriodDisplay';
import { ElapsedTimer } from '@/components/ElapsedTimer';
import { ClassManagementDialog } from '@/components/teacher/ClassManagementDialog';
import { StudentManagementDialog } from '@/components/teacher/StudentManagementDialog';
import { 
  LogOut, Plus, AlertTriangle, Check, X, 
  Copy, Search, Loader2, History, Timer, UserMinus 
} from 'lucide-react';
import { startOfWeek } from 'date-fns';

// --- Interfaces ---
interface ClassInfo {
  id: string;
  name: string;
  period_order: number;
  join_code: string;
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

// --- Helpers ---
const getDestinationColor = (destination: string) => {
  switch (destination?.toLowerCase()) {
    case 'restroom': return 'bg-green-500/10 text-green-700 border-green-500/20';
    case 'locker': return 'bg-blue-500/10 text-blue-700 border-blue-500/20';
    case 'office': return 'bg-purple-500/10 text-purple-700 border-purple-500/20';
    default: return 'bg-gray-100 text-gray-700 border-gray-200';
  }
};

const getPassCardColor = (pass: PendingPass) => {
  if (pass.status === 'pending') {
    return pass.is_quota_exceeded ? 'border-l-destructive' : 'border-l-yellow-500';
  }
  return 'border-l-green-500';
};

const TeacherDashboard = () => {
  const { user, role, signOut, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const isVisible = usePageVisibility();
  
  // Safe dependency
  const userId = user?.id;
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Core Data
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [pendingPasses, setPendingPasses] = useState<PendingPass[]>([]);
  const [activePasses, setActivePasses] = useState<PendingPass[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [weeklyLimit, setWeeklyLimit] = useState<number>(4);

  // UI States
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [createPassDialogOpen, setCreatePassDialogOpen] = useState(false);
  const [classDialogOpen, setClassDialogOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<ClassInfo | null>(null);
  const [studentDialogOpen, setStudentDialogOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);

  // Quick Pass Logic
  const [selectedStudentForPass, setSelectedStudentForPass] = useState('');
  const [selectedDestination, setSelectedDestination] = useState('');
  const [customDestination, setCustomDestination] = useState('');
  const [quickPassQuota, setQuickPassQuota] = useState<{ count: number; exceeded: boolean } | null>(null);
  const [loadingQuotaCheck, setLoadingQuotaCheck] = useState(false);

  // History Logic
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [studentHistory, setStudentHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyFilterLocation, setHistoryFilterLocation] = useState<string>('all');
  const [historyFilterClass, setHistoryFilterClass] = useState<string>('all');

  const DESTINATIONS = ['Restroom', 'Locker', 'Office', 'Other'];

  // --- Main Data Fetching Logic ---

  // 1. Fetch Classes 
  const fetchClasses = useCallback(async () => {
    if (!userId) return;
    
    const { data } = await supabase
      .from('classes')
      .select('id, name, period_order, join_code')
      .eq('teacher_id', userId)
      .order('period_order');

    if (data && data.length > 0) {
      setClasses(data);
      setSelectedClassId(prev => {
        if (prev && data.find(c => c.id === prev)) return prev;
        return data[0].id;
      });
    } else {
      setClasses([]);
    }
  }, [userId]);

  // 2. Fetch Roster
  const fetchRoster = useCallback(async (classId: string) => {
    const { data: enrollments } = await supabase
      .from('class_enrollments')
      .select('student_id')
      .eq('class_id', classId);

    if (!enrollments || enrollments.length === 0) {
      setStudents([]);
      return;
    }

    const studentIds = enrollments.map(e => e.student_id);
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .in('id', studentIds)
      .order('full_name');

    if (profiles) {
      setStudents(profiles.map(p => ({ id: p.id, name: p.full_name, email: p.email })));
    }
  }, []);

  // 3. Fetch Passes (FIXED: Manual Join Strategy)
  const fetchPasses = useCallback(async (classId: string) => {
    if (!userId || !classId) return;

    try {
      // A. Settings
      const { data: settings } = await supabase
        .from('weekly_quota_settings')
        .select('weekly_limit')
        .maybeSingle();
      
      const limit = settings?.weekly_limit ?? 4;
      setWeeklyLimit(limit);

      // --- B. PENDING PASSES (No Joins) ---
      const { data: rawPending, error: pendingError } = await supabase
        .from('passes')
        .select('id, student_id, destination, status, requested_at')
        .eq('class_id', classId)
        .eq('status', 'pending');

      if (pendingError) {
        console.error("Error fetching pending:", pendingError);
      } else {
        // Fetch Names Manually to avoid 400 Error
        const pIds = rawPending.map(p => p.student_id);
        const { data: pNames } = await supabase
           .from('profiles')
           .select('id, full_name')
           .in('id', pIds);
        
        const nameMap = new Map(pNames?.map(n => [n.id, n.full_name]));
        const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 }).toISOString();

        const pendingMapped = await Promise.all(rawPending.map(async (p: any) => {
          let isExceeded = false;
          if (p.destination === 'Restroom') {
            const { count } = await supabase
              .from('passes')
              .select('id', { count: 'exact', head: true })
              .eq('student_id', p.student_id)
              .eq('destination', 'Restroom')
              .in('status', ['approved', 'pending_return', 'returned'])
              .gte('requested_at', weekStart);
            isExceeded = (count || 0) >= limit;
          }
          
          return {
            id: p.id,
            student_id: p.student_id,
            student_name: nameMap.get(p.student_id) || 'Unknown',
            destination: p.destination,
            status: p.status,
            requested_at: p.requested_at,
            is_quota_exceeded: isExceeded
          };
        }));
        setPendingPasses(pendingMapped);
      }

      // --- C. ACTIVE PASSES (No Joins) ---
      const { data: enrollments } = await supabase
        .from('class_enrollments')
        .select('student_id')
        .eq('class_id', classId);
      
      const studentIds = enrollments?.map(e => e.student_id) || [];

      if (studentIds.length > 0) {
        const { data: rawActive, error: activeError } = await supabase
          .from('passes')
          .select('id, student_id, class_id, destination, status, requested_at, approved_at')
          .in('student_id', studentIds)
          .in('status', ['approved', 'pending_return']);

        if (activeError) console.error("Error fetching active:", activeError);

        if (rawActive && rawActive.length > 0) {
            // Manual Joins for Active
            const activeSIds = rawActive.map(p => p.student_id);
            const activeCIds = rawActive.map(p => p.class_id);
            
            const [profilesRes, classesRes] = await Promise.all([
                supabase.from('profiles').select('id, full_name').in('id', activeSIds),
                supabase.from('classes').select('id, name').in('id', activeCIds)
            ]);
            
            const pMap = new Map(profilesRes.data?.map(p => [p.id, p.full_name]));
            const cMap = new Map(classesRes.data?.map(c => [c.id, c.name]));

            const activeMapped = rawActive.map(p => ({
                id: p.id,
                student_id: p.student_id,
                student_name: pMap.get(p.student_id) || 'Unknown',
                destination: p.destination,
                status: p.status,
                requested_at: p.requested_at,
                approved_at: p.approved_at,
                is_quota_exceeded: false,
                from_class_name: cMap.get(p.class_id)
            }));
            setActivePasses(activeMapped);
        } else {
            setActivePasses([]);
        }
      } else {
        setActivePasses([]);
      }

    } catch (error) {
      console.error("Critical Fetch Error:", error);
    }
  }, [userId]);

  // --- Effects ---

  // Initial Class Load
  useEffect(() => { 
    if(userId) fetchClasses(); 
  }, [userId, fetchClasses]);

  // Realtime Subscription
  useEffect(() => {
    if (!selectedClassId || !userId) return;

    fetchRoster(selectedClassId);
    fetchPasses(selectedClassId);
    console.log("🔄 useEffect fired! Timestamp:", new Date().toISOString());
    
    if (isVisible) {
      const channel = supabase.channel(`teacher-${selectedClassId}`)
        .on(
          'postgres_changes',
          { 
            event: '*', 
            schema: 'public', 
            table: 'passes',
            filter: `class_id=eq.${selectedClassId}` 
          }, 
          () => fetchPasses(selectedClassId)
        )
        .subscribe();

      channelRef.current = channel;
    }

    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  }, [selectedClassId, isVisible, fetchPasses, fetchRoster, userId]);

  // Quota Check
  useEffect(() => {
    if (!selectedStudentForPass || !createPassDialogOpen) {
      setQuickPassQuota(null);
      return;
    }
    const checkQuota = async () => {
      setLoadingQuotaCheck(true);
      const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 }).toISOString();
      const { count } = await supabase
        .from('passes')
        .select('id', { count: 'exact', head: true })
        .eq('student_id', selectedStudentForPass)
        .eq('destination', 'Restroom')
        .in('status', ['approved', 'pending_return', 'returned'])
        .gte('requested_at', weekStart);
      
      const currentCount = count || 0;
      setQuickPassQuota({ count: currentCount, exceeded: currentCount >= weeklyLimit });
      setLoadingQuotaCheck(false);
    };
    checkQuota();
  }, [selectedStudentForPass, createPassDialogOpen, weeklyLimit]);

  // --- Actions ---

  const handleApprove = async (id: string, override: boolean) => {
    if (!userId) return;
    await supabase.from('passes').update({
      status: 'approved',
      approved_at: new Date().toISOString(),
      approved_by: userId,
      is_quota_override: override
    }).eq('id', id);
  };

  const handleDeny = async (id: string) => {
    if (!userId) return;
    await supabase.from('passes').update({ 
      status: 'denied', 
      denied_at: new Date().toISOString(), 
      denied_by: userId 
    }).eq('id', id);
  };

  const handleCheckIn = async (id: string) => {
    if (!userId) return;
    await supabase.from('passes').update({ 
      status: 'returned', 
      returned_at: new Date().toISOString(), 
      confirmed_by: userId 
    }).eq('id', id);
  };

  const handleQuickPass = async () => {
    if (!selectedStudentForPass || !selectedDestination || isActionLoading || !userId) return;
    setIsActionLoading(true);
    const dest = selectedDestination === 'Other' ? customDestination : selectedDestination;
    const isOverride = (dest === 'Restroom' && quickPassQuota?.exceeded) || false;

    const { error } = await supabase.from('passes').insert({
      student_id: selectedStudentForPass,
      class_id: selectedClassId,
      destination: dest,
      status: 'approved',
      approved_at: new Date().toISOString(),
      approved_by: userId,
      is_quota_override: isOverride
    });

    setIsActionLoading(false);
    if (!error) {
      setCreatePassDialogOpen(false);
      setSelectedStudentForPass('');
      setSelectedDestination('');
      setCustomDestination('');
      setQuickPassQuota(null);
      toast({ title: 'Pass Issued' });
    } else {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  // --- History (Fix 400 for History too) ---
  const fetchStudentHistory = useCallback(async (studentId: string) => {
    setLoadingHistory(true);
    
    // Manual Join for History
    const { data: rawHistory } = await supabase
      .from('passes')
      .select('id, destination, requested_at, approved_at, returned_at, class_id')
      .eq('student_id', studentId)
      .order('requested_at', { ascending: false })
      .limit(50);
      
    if (rawHistory && rawHistory.length > 0) {
        const classIds = rawHistory.map(p => p.class_id);
        const { data: cData } = await supabase.from('classes').select('id, name, period_order').in('id', classIds);
        const cMap = new Map(cData?.map(c => [c.id, c]));
        
        const mappedHistory = rawHistory.map(p => ({
            ...p,
            classes: cMap.get(p.class_id)
        }));
        setStudentHistory(mappedHistory);
    } else {
        setStudentHistory([]);
    }
    setLoadingHistory(false);
  }, []);

  useEffect(() => {
    if (historyDialogOpen && selectedStudent) {
      fetchStudentHistory(selectedStudent.id);
    }
  }, [historyDialogOpen, selectedStudent, fetchStudentHistory]);

  const filteredHistory = useMemo(() => {
    return studentHistory.filter(pass => {
      const matchesLoc = historyFilterLocation === 'all' || pass.destination === historyFilterLocation;
      const matchesClass = historyFilterClass === 'all' || pass.class_id === historyFilterClass;
      return matchesLoc && matchesClass;
    });
  }, [studentHistory, historyFilterLocation, historyFilterClass]);

  const totalMinutes = useMemo(() => {
    return filteredHistory.reduce((acc, pass) => {
      if (!pass.returned_at || !pass.approved_at) return acc;
      const diff = new Date(pass.returned_at).getTime() - new Date(pass.approved_at).getTime();
      return acc + (diff / 60000);
    }, 0);
  }, [filteredHistory]);

  if (authLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin h-8 w-8 text-primary" /></div>;
  if (!user || role !== 'teacher') return <Navigate to="/auth" replace />;

  const currentClass = classes.find(c => c.id === selectedClassId);
  const filteredStudents = students.filter(s => s.name.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="min-h-screen bg-background p-4 max-w-6xl mx-auto pb-32">
      <header className="flex items-center justify-between mb-6 pt-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center shadow-lg shadow-primary/20">
            <span className="text-primary-foreground font-bold text-xl">T</span>
          </div>
          <div>
            <h1 className="text-xl font-bold">Teacher Central</h1>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Pass Management</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={signOut} className="text-muted-foreground hover:text-destructive">
          <LogOut className="h-4 w-4 mr-2" /> Sign Out
        </Button>
      </header>

      <div className="space-y-6">
        <PeriodDisplay />

        <div className="flex gap-2">
          <Select value={selectedClassId} onValueChange={setSelectedClassId}>
            <SelectTrigger className="h-14 rounded-2xl bg-card border-none shadow-sm text-lg font-bold px-6 flex-1">
              <SelectValue placeholder="Select Class" />
            </SelectTrigger>
            <SelectContent className="rounded-2xl">
              {classes.map(c => (
                <SelectItem key={c.id} value={c.id}>Period {c.period_order}: {c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="icon" className="h-14 w-14 rounded-2xl shadow-lg" onClick={() => { setEditingClass(null); setClassDialogOpen(true); }}>
            <Plus className="h-5 w-5" />
          </Button>
        </div>

        {selectedClassId && (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              
              {/* PENDING REQUESTS */}
              <div className="space-y-3">
                <h2 className="text-sm font-bold uppercase tracking-wider text-yellow-600">Requests ({pendingPasses.length})</h2>
                {pendingPasses.map(pass => (
                  <Card key={pass.id} className={`rounded-2xl border-l-4 ${getPassCardColor(pass)} shadow-sm`}>
                    <CardContent className="p-4 flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold">{pass.student_name}</h3>
                          {pass.is_quota_exceeded && <AlertTriangle className="h-4 w-4 text-destructive" />}
                        </div>
                        <span className={`inline-block mt-1 px-2 py-0.5 text-xs font-bold rounded-full border ${getDestinationColor(pass.destination)}`}>
                          {pass.destination}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <Button size="icon" variant="ghost" className="h-10 w-10 rounded-xl bg-muted" onClick={() => handleDeny(pass.id)}><X className="h-4 w-4" /></Button>
                        <Button size="icon" className="h-10 w-10 rounded-xl shadow-md bg-white hover:bg-gray-50 text-black border" onClick={() => handleApprove(pass.id, pass.is_quota_exceeded)}><Check className="h-4 w-4" /></Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {pendingPasses.length === 0 && <p className="text-center py-4 text-muted-foreground text-sm italic">No pending requests</p>}
              </div>

              {/* ACTIVE PASSES */}
              <div className="space-y-3">
                <h2 className="text-sm font-bold uppercase tracking-wider text-green-600">Active Hallway ({activePasses.length})</h2>
                {activePasses.map(pass => (
                  <Card key={pass.id} className="rounded-2xl border-l-4 border-l-green-500 shadow-sm">
                    <CardContent className="p-4 flex items-center justify-between">
                      <div>
                        <h3 className="font-bold">{pass.student_name}</h3>
                        <div className="flex flex-wrap items-center gap-2 mt-1">
                          {pass.from_class_name && (
                            <span className="text-[10px] font-black uppercase text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                              {pass.from_class_name}
                            </span>
                          )}
                          <span className={`inline-block px-2 py-0.5 text-xs font-bold rounded-full border ${getDestinationColor(pass.destination)}`}>
                            {pass.destination}
                          </span>
                          {pass.approved_at && <ElapsedTimer startTime={pass.approved_at} destination={pass.destination} />}
                        </div>
                      </div>
                      <Button onClick={() => handleCheckIn(pass.id)} className="rounded-xl h-10 px-4 shadow-sm font-bold">Check In</Button>
                    </CardContent>
                  </Card>
                ))}
                {activePasses.length === 0 && <p className="text-center py-4 text-muted-foreground text-sm italic">No active passes</p>}
              </div>
            </div>

            {/* STUDENT ROSTER */}
            <div className="space-y-4 pt-4 border-t mt-6">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                  <Input 
                    placeholder="Search students..." 
                    className="h-12 pl-12 rounded-2xl border-none shadow-sm font-medium bg-card" 
                    value={searchQuery} 
                    onChange={(e) => setSearchQuery(e.target.value)} 
                  />
                </div>
                {currentClass && (
                  <div className="h-12 px-6 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-between sm:justify-start gap-4 shadow-sm">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-black uppercase text-primary leading-none">Class Code</span>
                      <span className="text-sm font-black tracking-widest uppercase">{currentClass.join_code}</span>
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-primary hover:bg-primary/20 rounded-lg" onClick={() => { navigator.clipboard.writeText(currentClass.join_code); toast({ title: "Copied!" }); }}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>

              <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                {filteredStudents.map(student => (
                  <div key={student.id} className="bg-card p-3 rounded-xl shadow-sm border flex items-center justify-between hover:bg-muted/30 transition-colors">
                    <div className="min-w-0"><p className="font-bold truncate">{student.name}</p></div>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" className="rounded-lg h-8 w-8 hover:bg-primary/10 hover:text-primary" onClick={() => { setSelectedStudent(student); setHistoryDialogOpen(true); }}>
                        <History className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" className="rounded-lg h-8 w-8" onClick={() => { setSelectedStudent(student); setStudentDialogOpen(true); }}>
                        <UserMinus className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {selectedClassId && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 w-full max-w-md px-4">
          <Button onClick={() => setCreatePassDialogOpen(true)} className="w-full h-14 rounded-2xl shadow-2xl text-lg font-bold flex items-center justify-center gap-3">
            <Plus className="h-5 w-5" /> ISSUE QUICK PASS
          </Button>
        </div>
      )}

      {/* QUICK PASS DIALOG */}
      <Dialog open={createPassDialogOpen} onOpenChange={setCreatePassDialogOpen}>
        <DialogContent className="rounded-3xl max-w-sm">
          <DialogHeader><DialogTitle className="font-bold">Quick Pass</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
             <div className="space-y-2">
                <Label className="text-xs font-bold uppercase text-muted-foreground">Student</Label>
                <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto">
                  {students.map(s => (
                    <Button 
                      key={s.id} 
                      size="sm" 
                      variant={selectedStudentForPass === s.id ? 'default' : 'outline'} 
                      className="rounded-xl font-bold" 
                      onClick={() => setSelectedStudentForPass(s.id)}
                    >
                      {s.name.split(' ')[0]}
                    </Button>
                  ))}
                </div>
             </div>
             <div className="space-y-2">
                <Label className="text-xs font-bold uppercase text-muted-foreground">Location</Label>
                <div className="grid grid-cols-2 gap-2">
                  {DESTINATIONS.map(d => (
                    <Button 
                      key={d} 
                      variant={selectedDestination === d ? 'default' : 'outline'} 
                      className="rounded-xl font-bold" 
                      onClick={() => setSelectedDestination(d)}
                    >
                      {d}
                    </Button>
                  ))}
                </div>
             </div>
             <div className="space-y-2">
               <Button onClick={handleQuickPass} className="w-full h-12 rounded-xl font-bold" disabled={isActionLoading || !selectedStudentForPass || !selectedDestination}>
                 {isActionLoading ? <Loader2 className="animate-spin h-4 w-4" /> : "Issue Pass"}
               </Button>
               {selectedStudentForPass && (selectedDestination === 'Restroom' || !selectedDestination) && (
                 <div className="text-center text-xs font-medium">
                    {loadingQuotaCheck ? (
                      <span className="text-muted-foreground flex items-center justify-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Checking limits...</span>
                    ) : quickPassQuota?.exceeded ? (
                      <div className="text-destructive flex items-center justify-center gap-1.5 p-2 bg-destructive/10 rounded-lg">
                        <AlertTriangle className="h-3 w-3" />
                        <span>Weekly limit reached ({quickPassQuota.count}/{weeklyLimit})</span>
                      </div>
                    ) : quickPassQuota && (
                      <span className="text-muted-foreground">Weekly usage: {quickPassQuota.count}/{weeklyLimit}</span>
                    )}
                 </div>
               )}
             </div>
          </div>
        </DialogContent>
      </Dialog>
      
      {/* HISTORY DIALOG */}
      <Dialog open={historyDialogOpen} onOpenChange={setHistoryDialogOpen}>
        <DialogContent className="rounded-3xl max-w-lg">
          <DialogHeader><DialogTitle className="flex items-center gap-2 text-xl font-bold"><History className="h-5 w-5 text-primary" /> {selectedStudent?.name}'s History</DialogTitle></DialogHeader>
          <div className="flex gap-2 mb-2 mt-4">
            <Select value={historyFilterLocation} onValueChange={setHistoryFilterLocation}>
              <SelectTrigger className="rounded-xl bg-muted/50 border-none font-bold"><SelectValue placeholder="All Locations" /></SelectTrigger>
              <SelectContent className="rounded-xl"><SelectItem value="all">All Locations</SelectItem>{DESTINATIONS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={historyFilterClass} onValueChange={setHistoryFilterClass}>
              <SelectTrigger className="rounded-xl bg-muted/50 border-none font-bold"><SelectValue placeholder="All Classes" /></SelectTrigger>
              <SelectContent className="rounded-xl"><SelectItem value="all">All Classes</SelectItem>{classes.map(c => <SelectItem key={c.id} value={c.id}>P{c.period_order}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2 py-4 max-h-[50vh] overflow-y-auto pr-2">
            {loadingHistory ? <div className="flex justify-center py-8"><Loader2 className="animate-spin text-muted-foreground" /></div> : filteredHistory.length === 0 ? <p className="text-center text-muted-foreground py-8">No records found.</p> : filteredHistory.map(pass => (
              <div key={pass.id} className="p-4 rounded-2xl bg-muted/30 border border-muted/50 flex flex-col gap-2">
                <div className="flex justify-between items-start">
                  <div><span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md border ${getDestinationColor(pass.destination)}`}>{pass.destination}</span><p className="text-xs font-bold mt-1 text-muted-foreground">{pass.classes?.name}</p></div>
                  <div className="text-right"><p className="text-[10px] font-bold text-muted-foreground">{new Date(pass.requested_at).toLocaleDateString()}</p></div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-2 pt-4 border-t flex justify-between items-center">
            <div className="flex items-center gap-2"><Timer className="h-5 w-5 text-primary" /><p className="text-sm font-bold text-muted-foreground uppercase tracking-widest">Total Time</p></div>
            <p className="text-2xl font-black text-primary leading-none">{Math.round(totalMinutes)}m</p>
          </div>
        </DialogContent>
      </Dialog>
      
      <ClassManagementDialog open={classDialogOpen} onOpenChange={setClassDialogOpen} editingClass={editingClass} userId={userId || ''} onSaved={fetchClasses} />
      <StudentManagementDialog open={studentDialogOpen} onOpenChange={setStudentDialogOpen} student={selectedStudent} currentClassId={selectedClassId} teacherClasses={classes} onUpdated={() => fetchRoster(selectedClassId)} />
    </div>
  );
};

export default TeacherDashboard;
