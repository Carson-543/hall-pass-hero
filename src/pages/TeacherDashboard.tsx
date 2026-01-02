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
import { useToast } from '@/hooks/use-toast';
import { usePageVisibility } from '@/hooks/usePageVisibility';
import { PeriodDisplay } from '@/components/PeriodDisplay';
import { ElapsedTimer } from '@/components/ElapsedTimer';
import { ClassManagementDialog } from '@/components/teacher/ClassManagementDialog';
import { StudentManagementDialog } from '@/components/teacher/StudentManagementDialog';
import { BathroomQueueStatus } from '@/components/teacher/BathroomQueueStatus';
import { SubModeToggle } from '@/components/teacher/SubModeToggle';
import { 
  LogOut, Plus, AlertTriangle, Check, X, 
  Copy, Search, Loader2, History, Timer, UserMinus, Snowflake 
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

const TeacherDashboard = () => {
  const { user, role, signOut, loading: authLoading } = useAuth();
  const { organization, settings } = useOrganization();
  const { toast } = useToast();
  const isVisible = usePageVisibility();
  
  const userId = user?.id;
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const freezeChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Core Data
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [pendingPasses, setPendingPasses] = useState<PendingPass[]>([]);
  const [activePasses, setActivePasses] = useState<PendingPass[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [weeklyLimit, setWeeklyLimit] = useState<number>(4);

  // Freeze State (Synced with pass_freezes table)
  const [isFrozen, setIsFrozen] = useState(false);
  const [isFreezeLoading, setIsFreezeLoading] = useState(false);

  // Sub Mode
  const [isSubMode, setIsSubMode] = useState(false);
  const [subAssignments, setSubAssignments] = useState<any[]>([]);

  // UI States
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [createPassDialogOpen, setCreatePassDialogOpen] = useState(false);
  const [classDialogOpen, setClassDialogOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<ClassInfo | null>(null);
  const [studentDialogOpen, setStudentDialogOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);

  // Quick Pass & History Logic
  const [selectedStudentForPass, setSelectedStudentForPass] = useState('');
  const [selectedDestination, setSelectedDestination] = useState('');
  const [customDestination, setCustomDestination] = useState('');
  const [quickPassQuota, setQuickPassQuota] = useState<{ count: number; exceeded: boolean } | null>(null);
  const [loadingQuotaCheck, setLoadingQuotaCheck] = useState(false);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [studentHistory, setStudentHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyFilterLocation, setHistoryFilterLocation] = useState<string>('all');
  const [historyFilterClass, setHistoryFilterClass] = useState<string>('all');

  const DESTINATIONS = ['Restroom', 'Locker', 'Office', 'Other'];

  // --- Helper Functions ---
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

  // --- Database Actions ---

  const fetchFreezeStatus = useCallback(async (classId: string) => {
    if (!classId) return;
    const { data } = await supabase
      .from('pass_freezes')
      .select('is_active')
      .eq('class_id', classId)
      .eq('is_active', true)
      .maybeSingle();
    setIsFrozen(!!data);
  }, []);

  const handleToggleFreeze = async () => {
    if (!selectedClassId || !userId || isFreezeLoading) return;
    setIsFreezeLoading(true);
    try {
      if (isFrozen) {
        await supabase.from('pass_freezes').delete().eq('class_id', selectedClassId);
        toast({ title: "Queue Unfrozen", description: "Students can now request passes." });
      } else {
        await supabase.from('pass_freezes').upsert({
          class_id: selectedClassId,
          teacher_id: userId,
          freeze_type: 'all',
          is_active: true,
        }, { onConflict: 'class_id' });
        toast({ title: "Queue Frozen", description: "All requests are blocked.", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIsFreezeLoading(false);
    }
  };

  const fetchClasses = useCallback(async () => {
    if (!userId) return;
    const { data, error } = await supabase
      .from('classes')
      .select('id, name, period_order, join_code')
      .eq('teacher_id', userId)
      .order('period_order');

    if (!error && data && data.length > 0) {
      setClasses(data);
      if (!selectedClassId) setSelectedClassId(data[0].id);
    }
  }, [userId, selectedClassId]);

  const fetchRoster = useCallback(async (classId: string) => {
    const { data: enrollments } = await supabase.from('class_enrollments').select('student_id').eq('class_id', classId);
    if (!enrollments || enrollments.length === 0) { setStudents([]); return; }
    const { data: profiles } = await supabase.from('profiles').select('id, full_name, email').in('id', enrollments.map(e => e.student_id)).order('full_name');
    if (profiles) setStudents(profiles.map(p => ({ id: p.id, name: p.full_name, email: p.email })));
  }, []);

  const fetchPasses = useCallback(async (classId: string) => {
    if (!userId || !classId) return;
    const limit = settings?.weekly_bathroom_limit ?? 4;
    setWeeklyLimit(limit);

    // Pending
    const { data: rawPending } = await supabase
      .from('passes')
      .select('id, student_id, destination, status, requested_at')
      .eq('class_id', classId)
      .eq('status', 'pending')
      .order('requested_at', { ascending: true });

    if (rawPending) {
      const pIds = rawPending.map(p => p.student_id);
      const { data: pNames } = await supabase.from('profiles').select('id, full_name').in('id', pIds);
      const nameMap = new Map(pNames?.map(n => [n.id, n.full_name]));
      const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 }).toISOString();

      const pendingMapped = await Promise.all(rawPending.map(async (p: any) => {
        let isExceeded = false;
        if (p.destination === 'Restroom') {
          const { count } = await supabase.from('passes').select('id', { count: 'exact', head: true })
            .eq('student_id', p.student_id).eq('destination', 'Restroom').in('status', ['approved', 'pending_return', 'returned']).gte('requested_at', weekStart);
          isExceeded = (count || 0) >= limit;
        }
        return {
          id: p.id, student_id: p.student_id, student_name: nameMap.get(p.student_id) || 'Unknown',
          destination: p.destination, status: p.status, requested_at: p.requested_at, is_quota_exceeded: isExceeded
        };
      }));
      setPendingPasses(pendingMapped);
    }

    // Active
    const { data: enrollments } = await supabase.from('class_enrollments').select('student_id').eq('class_id', classId);
    const studentIds = enrollments?.map(e => e.student_id) || [];

    if (studentIds.length > 0) {
      const { data: rawActive } = await supabase.from('passes').select('id, student_id, class_id, destination, status, requested_at, approved_at')
        .in('student_id', studentIds).in('status', ['approved', 'pending_return']).order('approved_at', { ascending: true });

      if (rawActive) {
        const activeSIds = rawActive.map(p => p.student_id);
        const activeCIds = rawActive.map(p => p.class_id);
        const [profilesRes, classesRes] = await Promise.all([
          supabase.from('profiles').select('id, full_name').in('id', activeSIds),
          supabase.from('classes').select('id, name').in('id', activeCIds)
        ]);
        const pMap = new Map(profilesRes.data?.map(p => [p.id, p.full_name]));
        const cMap = new Map(classesRes.data?.map(c => [c.id, c.name]));

        setActivePasses(rawActive.map(p => ({
          id: p.id, student_id: p.student_id, student_name: pMap.get(p.student_id) || 'Unknown',
          destination: p.destination, status: p.status, requested_at: p.requested_at, approved_at: p.approved_at,
          is_quota_exceeded: false, from_class_name: cMap.get(p.class_id)
        })));
      }
    } else {
      setActivePasses([]);
    }
  }, [userId, settings]);

  // --- Subscriptions & Lifecycle ---

  useEffect(() => { if (userId) fetchClasses(); }, [userId, fetchClasses]);

  useEffect(() => {
    if (!selectedClassId || !userId) return;
    fetchFreezeStatus(selectedClassId);
    fetchRoster(selectedClassId);
    fetchPasses(selectedClassId);

    const freezeChannel = supabase.channel(`freeze-${selectedClassId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pass_freezes', filter: `class_id=eq.${selectedClassId}` }, () => fetchFreezeStatus(selectedClassId))
      .subscribe();

    const passChannel = supabase.channel(`teacher-${selectedClassId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'passes' }, () => fetchPasses(selectedClassId))
      .subscribe();

    return () => {
      supabase.removeChannel(freezeChannel);
      supabase.removeChannel(passChannel);
    };
  }, [selectedClassId, userId, fetchFreezeStatus, fetchRoster, fetchPasses]);

  // Quota Check Logic
  useEffect(() => {
    if (!selectedStudentForPass || !createPassDialogOpen) return;
    const checkQuota = async () => {
      setLoadingQuotaCheck(true);
      const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 }).toISOString();
      const { count } = await supabase.from('passes').select('id', { count: 'exact', head: true })
        .eq('student_id', selectedStudentForPass).eq('destination', 'Restroom').in('status', ['approved', 'pending_return', 'returned']).gte('requested_at', weekStart);
      setQuickPassQuota({ count: count || 0, exceeded: (count || 0) >= weeklyLimit });
      setLoadingQuotaCheck(false);
    };
    checkQuota();
  }, [selectedStudentForPass, createPassDialogOpen, weeklyLimit]);

  // --- Pass Actions ---
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
    await supabase.from('passes').update({ status: 'denied', denied_at: new Date().toISOString(), denied_by: userId }).eq('id', id);
  };

  const handleCheckIn = async (id: string) => {
    await supabase.from('passes').update({ status: 'returned', returned_at: new Date().toISOString(), confirmed_by: userId }).eq('id', id);
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
      toast({ title: 'Pass Issued' });
    }
  };

  if (authLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin h-8 w-8 text-primary" /></div>;
  if (!user || role !== 'teacher') return <Navigate to="/auth" replace />;

  const filteredStudents = students.filter(s => s.name.toLowerCase().includes(searchQuery.toLowerCase()));
  const bathroomPending = pendingPasses.filter(p => p.destination === 'Restroom').length;
  const bathroomActive = activePasses.filter(p => p.destination === 'Restroom').length;

  return (
    <div className="min-h-screen bg-background p-4 max-w-6xl mx-auto pb-32">
      <header className="flex items-center justify-between mb-6 pt-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center shadow-lg shadow-primary/20">
            <span className="text-primary-foreground font-bold text-xl">T</span>
          </div>
          <div>
            <h1 className="text-xl font-bold">Teacher Central</h1>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{organization?.name || 'Pass Management'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => signOut()} className="text-muted-foreground hover:text-destructive">
            <LogOut className="h-4 w-4 mr-2" /> Sign Out
          </Button>
        </div>
      </header>

      <div className="space-y-6">
        <PeriodDisplay />

        <div className="flex gap-2">
          <Select value={selectedClassId} onValueChange={setSelectedClassId}>
            <SelectTrigger className="h-14 rounded-2xl bg-card border-none shadow-sm text-lg font-bold px-6 flex-1">
              <SelectValue placeholder="Select Class" />
            </SelectTrigger>
            <SelectContent>
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
            <BathroomQueueStatus 
              pendingCount={bathroomPending} 
              activeCount={bathroomActive}
              maxConcurrent={settings?.max_concurrent_bathroom ?? 2}
            />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-3">
                <div className="flex items-center justify-between mb-1">
                  <h2 className="text-sm font-bold uppercase tracking-wider text-yellow-600">Requests ({pendingPasses.length})</h2>
                  
                  {/* ANIMATED FREEZE BUTTON */}
                  <Button
                    variant={isFrozen ? "destructive" : "outline"}
                    className={`group relative overflow-hidden transition-all duration-300 ease-in-out h-8 w-8 hover:w-40 rounded-full border shadow-sm ${isFrozen ? 'bg-destructive text-destructive-foreground' : 'bg-background hover:bg-blue-50 text-blue-500 hover:border-blue-200'}`}
                    onClick={handleToggleFreeze}
                    disabled={isFreezeLoading}
                  >
                    <div className="absolute left-0 flex items-center justify-center w-8 h-8">
                       {isFreezeLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Snowflake className={`h-4 w-4 ${isFrozen ? 'animate-pulse' : ''}`} />}
                    </div>
                    <span className="ml-6 opacity-0 group-hover:opacity-100 transition-opacity duration-300 whitespace-nowrap text-xs font-bold pl-1">
                      {isFrozen ? "Unfreeze Requests" : "Freeze Requests"}
                    </span>
                  </Button>
                </div>
                
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
                        <Button size="icon" className="h-10 w-10 rounded-xl shadow-md bg-white border" onClick={() => handleApprove(pass.id, pass.is_quota_exceeded)}><Check className="h-4 w-4" /></Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <div className="space-y-3">
                <h2 className="text-sm font-bold uppercase tracking-wider text-green-600">Active Hallway ({activePasses.length})</h2>
                {activePasses.map(pass => (
                  <Card key={pass.id} className="rounded-2xl border-l-4 border-l-green-500 shadow-sm">
                    <CardContent className="p-4 flex items-center justify-between">
                      <div>
                        <h3 className="font-bold">{pass.student_name}</h3>
                        <div className="flex flex-wrap items-center gap-2 mt-1">
                          {pass.from_class_name && <span className="text-[10px] font-black uppercase text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{pass.from_class_name}</span>}
                          <span className={`inline-block px-2 py-0.5 text-xs font-bold rounded-full border ${getDestinationColor(pass.destination)}`}>{pass.destination}</span>
                          {pass.approved_at && <ElapsedTimer startTime={pass.approved_at} destination={pass.destination} />}
                        </div>
                      </div>
                      <Button onClick={() => handleCheckIn(pass.id)} className="rounded-xl h-10 px-4 shadow-sm font-bold">Check In</Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>

            {/* ROSTER */}
            <div className="space-y-4 pt-4 border-t mt-6">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                  <Input placeholder="Search students..." className="h-12 pl-12 rounded-2xl border-none shadow-sm bg-card" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                </div>
                {currentClass && (
                  <div className="h-12 px-6 rounded-2xl bg-primary/10 border border-primary/20 flex items-center gap-4">
                    <span className="text-sm font-black tracking-widest uppercase">{currentClass.join_code}</span>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { navigator.clipboard.writeText(currentClass.join_code); toast({ title: "Copied!" }); }}><Copy className="h-4 w-4" /></Button>
                  </div>
                )}
              </div>
              <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                {filteredStudents.map(student => (
                  <div key={student.id} className="bg-card p-3 rounded-xl shadow-sm border flex items-center justify-between">
                    <p className="font-bold truncate">{student.name}</p>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => { setSelectedStudent(student); setHistoryDialogOpen(true); }}><History className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => { setSelectedStudent(student); setStudentDialogOpen(true); }}><UserMinus className="h-4 w-4" /></Button>
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
          <Button onClick={() => setCreatePassDialogOpen(true)} className="w-full h-14 rounded-2xl shadow-2xl text-lg font-bold flex items-center gap-3">
            <Plus className="h-5 w-5" /> ISSUE QUICK PASS
          </Button>
        </div>
      )}

      {/* DIALOGS */}
      <Dialog open={createPassDialogOpen} onOpenChange={setCreatePassDialogOpen}>
        <DialogContent className="rounded-3xl max-w-sm">
          <DialogHeader><DialogTitle className="font-bold">Quick Pass</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <Label className="text-xs font-bold uppercase text-muted-foreground">Student</Label>
            <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto">
              {students.map(s => (
                <Button key={s.id} size="sm" variant={selectedStudentForPass === s.id ? 'default' : 'outline'} className="rounded-xl font-bold" onClick={() => setSelectedStudentForPass(s.id)}>{s.name.split(' ')[0]}</Button>
              ))}
            </div>
            <Label className="text-xs font-bold uppercase text-muted-foreground">Location</Label>
            <div className="grid grid-cols-2 gap-2">
              {DESTINATIONS.map(d => (
                <Button key={d} variant={selectedDestination === d ? 'default' : 'outline'} className="rounded-xl font-bold" onClick={() => setSelectedDestination(d)}>{d}</Button>
              ))}
            </div>
            <Button onClick={handleQuickPass} className="w-full h-12 rounded-xl font-bold" disabled={isActionLoading || !selectedStudentForPass || !selectedDestination}>
              {isActionLoading ? <Loader2 className="animate-spin h-4 w-4" /> : "Issue Pass"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ClassManagementDialog open={classDialogOpen} onOpenChange={setClassDialogOpen} editingClass={editingClass} userId={userId || ''} onSaved={fetchClasses} />
      <StudentManagementDialog open={studentDialogOpen} onOpenChange={setStudentDialogOpen} student={selectedStudent} currentClassId={selectedClassId} teacherClasses={classes} onUpdated={() => fetchRoster(selectedClassId)} />
    </div>
  );
};

export default TeacherDashboard;
