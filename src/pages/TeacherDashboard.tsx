import { useState, useEffect, useCallback, useMemo } from 'react';
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
import { PeriodDisplay } from '@/components/PeriodDisplay';
import { ElapsedTimer } from '@/components/ElapsedTimer';
import { ClassManagementDialog } from '@/components/teacher/ClassManagementDialog';
import { StudentManagementDialog } from '@/components/teacher/StudentManagementDialog';
import { 
  LogOut, Plus, AlertTriangle, Check, X, 
  Copy, Search, Loader2, Clock, Settings, UserMinus,
  History, Calendar, Timer
} from 'lucide-react';
import { startOfWeek } from 'date-fns';

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
}

interface Student {
  id: string;
  name: string;
  email: string;
}

const getDestinationColor = (destination: string) => {
  switch (destination.toLowerCase()) {
    case 'restroom': return 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20';
    case 'locker': return 'bg-blue-500/10 text-blue-600 border-blue-500/20';
    case 'office': return 'bg-purple-500/10 text-purple-600 border-purple-500/20';
    default: return 'bg-muted text-muted-foreground border-border';
  }
};

const TeacherDashboard = () => {
  const { user, role, signOut, loading: authLoading } = useAuth();
  const { toast } = useToast();

  // Core Data States
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [pendingPasses, setPendingPasses] = useState<PendingPass[]>([]);
  const [activePasses, setActivePasses] = useState<PendingPass[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isActionLoading, setIsActionLoading] = useState(false);

  // Dialog States
  const [createPassDialogOpen, setCreatePassDialogOpen] = useState(false);
  const [classDialogOpen, setClassDialogOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<ClassInfo | null>(null);
  const [studentDialogOpen, setStudentDialogOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [selectedStudentForPass, setSelectedStudentForPass] = useState('');
  const [selectedDestination, setSelectedDestination] = useState('');
  const [customDestination, setCustomDestination] = useState('');

  // History & Filtering States
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [studentHistory, setStudentHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyFilterLocation, setHistoryFilterLocation] = useState<string>('all');
  const [historyFilterClass, setHistoryFilterClass] = useState<string>('all');

  const DESTINATIONS = ['Restroom', 'Locker', 'Office', 'Other'];

  const fetchClasses = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('classes')
      .select('*')
      .eq('teacher_id', user.id)
      .order('period_order');

    if (data && data.length > 0) {
      setClasses(data);
      if (!selectedClassId || !data.find(c => c.id === selectedClassId)) {
        setSelectedClassId(data[0].id);
      }
    }
  }, [user, selectedClassId]);

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
      .in('id', studentIds);

    if (profiles) {
      setStudents(profiles.map(p => ({ id: p.id, name: p.full_name, email: p.email })));
    }
  }, []);

  const fetchPasses = useCallback(async (classId: string) => {
    const { data: passes } = await supabase
      .from('passes')
      .select('id, student_id, destination, status, requested_at, approved_at')
      .eq('class_id', classId)
      .in('status', ['pending', 'approved', 'pending_return']);

    if (!passes) return;

    const studentIds = [...new Set(passes.map(p => p.student_id))];
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', studentIds);

    const profileMap = new Map(profiles?.map(p => [p.id, p.full_name]) || []);
    const { data: settings } = await supabase.from('weekly_quota_settings').select('weekly_limit').single();
    const limit = settings?.weekly_limit ?? 4;
    const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 }).toISOString();

    const processed = await Promise.all(passes.map(async (p) => {
      let exceeded = false;
      if (p.status === 'pending' && p.destination === 'Restroom') {
        const { count } = await supabase
          .from('passes')
          .select('*', { count: 'exact', head: true })
          .eq('student_id', p.student_id)
          .eq('destination', 'Restroom')
          .in('status', ['approved', 'pending_return', 'returned'])
          .gte('requested_at', weekStart);
        exceeded = (count ?? 0) >= limit;
      }
      return {
        id: p.id,
        student_id: p.student_id,
        student_name: profileMap.get(p.student_id) ?? 'Unknown',
        destination: p.destination,
        status: p.status,
        requested_at: p.requested_at,
        approved_at: p.approved_at,
        is_quota_exceeded: exceeded
      };
    }));

    setPendingPasses(processed.filter(p => p.status === 'pending'));
    setActivePasses(processed.filter(p => p.status !== 'pending'));
  }, []);

  const fetchStudentHistory = useCallback(async (studentId: string) => {
    setLoadingHistory(true);
    const { data, error } = await supabase
      .from('passes')
      .select(`*, classes (name, period_order)`)
      .eq('student_id', studentId)
      .order('requested_at', { ascending: false });
    
    if (!error) setStudentHistory(data || []);
    setLoadingHistory(false);
  }, []);

  useEffect(() => { fetchClasses(); }, [fetchClasses]);
  useEffect(() => {
    if (selectedClassId) {
      fetchPasses(selectedClassId);
      fetchRoster(selectedClassId);
    }
  }, [selectedClassId, fetchPasses, fetchRoster]);

  useEffect(() => {
    if (historyDialogOpen && selectedStudent) {
      fetchStudentHistory(selectedStudent.id);
    }
  }, [historyDialogOpen, selectedStudent, fetchStudentHistory]);

  // Pass Duration Helpers
  const getDuration = (start: string, end: string | null) => {
    if (!end) return 0;
    return (new Date(end).getTime() - new Date(start).getTime()) / 60000;
  };

  // Filtered History Logic
  const filteredHistory = useMemo(() => {
    return studentHistory.filter(pass => {
      const matchesLocation = historyFilterLocation === 'all' || pass.destination === historyFilterLocation;
      const matchesClass = historyFilterClass === 'all' || pass.class_id === historyFilterClass;
      return matchesLocation && matchesClass;
    });
  }, [studentHistory, historyFilterLocation, historyFilterClass]);

  const totalMinutes = useMemo(() => {
    return filteredHistory.reduce((acc, pass) => {
      return acc + (pass.returned_at ? getDuration(pass.approved_at || pass.requested_at, pass.returned_at) : 0);
    }, 0);
  }, [filteredHistory]);

  // Event Handlers
  const handleApprove = async (id: string, override: boolean) => {
    await supabase.from('passes').update({
      status: 'approved',
      approved_at: new Date().toISOString(),
      approved_by: user!.id,
      is_quota_override: override
    }).eq('id', id);
    fetchPasses(selectedClassId);
  };

  const handleDeny = async (id: string) => {
    await supabase.from('passes').update({ status: 'denied', denied_at: new Date().toISOString() }).eq('id', id);
    fetchPasses(selectedClassId);
  };

  const handleCheckIn = async (id: string) => {
    await supabase.from('passes').update({ status: 'returned', returned_at: new Date().toISOString() }).eq('id', id);
    fetchPasses(selectedClassId);
  };

  const handleQuickPass = async () => {
    if (!selectedStudentForPass || !selectedDestination) return;
    setIsActionLoading(true);
    const { error } = await supabase.from('passes').insert({
      student_id: selectedStudentForPass,
      class_id: selectedClassId,
      destination: selectedDestination === 'Other' ? customDestination : selectedDestination,
      status: 'approved',
      approved_at: new Date().toISOString(),
      approved_by: user!.id
    });
    setIsActionLoading(false);
    if (!error) {
      setCreatePassDialogOpen(false);
      fetchPasses(selectedClassId);
      toast({ title: 'Pass Issued' });
    }
  };

  if (authLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin" /></div>;
  if (!user || role !== 'teacher') return <Navigate to="/auth" replace />;

  const filteredStudents = students.filter(s => s.name.toLowerCase().includes(searchQuery.toLowerCase()));
  const currentClass = classes.find(c => c.id === selectedClassId);

  return (
    <div className="min-h-screen bg-background p-4 max-w-6xl mx-auto pb-32">
      <header className="flex items-center justify-between mb-6 pt-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center shadow-lg">
            <span className="text-primary-foreground font-bold text-xl">T</span>
          </div>
          <div>
            <h1 className="text-xl font-bold">Teacher Dashboard</h1>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Pass Control</p>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={signOut} className="rounded-full bg-card shadow-sm border">
          <LogOut className="h-5 w-5 text-muted-foreground" />
        </Button>
      </header>

      <div className="space-y-6">
        <PeriodDisplay />

        {/* Class Selection */}
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
          <Button variant="outline" size="icon" className="h-14 w-14 rounded-2xl bg-card border-none shadow-sm" onClick={() => setClassDialogOpen(true)}>
            <Settings className="h-5 w-5" />
          </Button>
          <Button size="icon" className="h-14 w-14 rounded-2xl shadow-lg" onClick={() => { setEditingClass(null); setClassDialogOpen(true); }}>
            <Plus className="h-5 w-5" />
          </Button>
        </div>

        {selectedClassId && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Requests */}
            <div className="space-y-3">
              <h2 className="text-sm font-bold uppercase text-orange-500">Pending ({pendingPasses.length})</h2>
              {pendingPasses.map(pass => (
                <Card key={pass.id} className={`rounded-2xl border-l-4 ${pass.is_quota_exceeded ? 'border-destructive' : 'border-warning'}`}>
                  <CardContent className="p-4 flex items-center justify-between">
                    <div>
                      <h3 className="font-bold">{pass.student_name}</h3>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${getDestinationColor(pass.destination)}`}>
                        {pass.destination}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <Button size="icon" variant="ghost" className="rounded-xl" onClick={() => handleDeny(pass.id)}><X className="h-4 w-4" /></Button>
                      <Button size="icon" className="rounded-xl shadow-md" onClick={() => handleApprove(pass.id, pass.is_quota_exceeded)}><Check className="h-4 w-4" /></Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Active */}
            <div className="space-y-3">
              <h2 className="text-sm font-bold uppercase text-emerald-500">Active ({activePasses.length})</h2>
              {activePasses.map(pass => (
                <Card key={pass.id} className="rounded-2xl border-l-4 border-emerald-500">
                  <CardContent className="p-4 flex items-center justify-between">
                    <div>
                      <h3 className="font-bold">{pass.student_name}</h3>
                      <div className="flex items-center gap-2 mt-1">
                         <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${getDestinationColor(pass.destination)}`}>{pass.destination}</span>
                         {pass.approved_at && <ElapsedTimer startTime={pass.approved_at} destination={pass.destination} />}
                      </div>
                    </div>
                    <Button onClick={() => handleCheckIn(pass.id)} className="rounded-xl font-bold px-4">Check In</Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Roster & History Search */}
        <div className="pt-6 border-t space-y-4">
           <div className="relative">
             <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
             <Input placeholder="Search students..." className="h-12 pl-12 rounded-2xl bg-card border-none shadow-sm" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
           </div>

           <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
             {filteredStudents.map(student => (
               <div key={student.id} className="bg-card p-3 rounded-xl border flex items-center justify-between">
                 <div className="min-w-0">
                   <p className="font-bold truncate">{student.name}</p>
                   <p className="text-[10px] text-muted-foreground">{student.email}</p>
                 </div>
                 <div className="flex gap-1">
                   <Button size="icon" variant="ghost" className="h-8 w-8 rounded-lg hover:bg-primary/10" onClick={() => { setSelectedStudent(student); setHistoryDialogOpen(true); }}>
                     <History className="h-4 w-4" />
                   </Button>
                   <Button size="icon" variant="ghost" className="h-8 w-8 rounded-lg" onClick={() => { setSelectedStudent(student); setStudentDialogOpen(true); }}>
                     <UserMinus className="h-4 w-4" />
                   </Button>
                 </div>
               </div>
             ))}
           </div>
        </div>
      </div>

      {/* Floating Action */}
      {selectedClassId && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 w-full max-w-md px-4">
          <Button onClick={() => setCreatePassDialogOpen(true)} className="w-full h-14 rounded-2xl shadow-xl text-lg font-bold">ISSUE QUICK PASS</Button>
        </div>
      )}

      {/* DETAILED HISTORY DIALOG */}
      <Dialog open={historyDialogOpen} onOpenChange={setHistoryDialogOpen}>
        <DialogContent className="rounded-3xl max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl font-bold">
              <History className="h-5 w-5 text-primary" />
              {selectedStudent?.name}'s Records
            </DialogTitle>
          </DialogHeader>

          <div className="flex gap-2 mb-2">
            <Select value={historyFilterLocation} onValueChange={setHistoryFilterLocation}>
              <SelectTrigger className="rounded-xl bg-muted/50 border-none font-bold"><SelectValue placeholder="Location" /></SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="all">All Locations</SelectItem>
                {DESTINATIONS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select value={historyFilterClass} onValueChange={setHistoryFilterClass}>
              <SelectTrigger className="rounded-xl bg-muted/50 border-none font-bold"><SelectValue placeholder="Class" /></SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="all">All Classes</SelectItem>
                {classes.map(c => <SelectItem key={c.id} value={c.id}>P{c.period_order}: {c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2 py-2 max-h-[50vh] overflow-y-auto pr-2">
            {loadingHistory ? (
              <div className="flex justify-center py-8"><Loader2 className="animate-spin" /></div>
            ) : filteredHistory.map(pass => {
              const dur = pass.returned_at ? getDuration(pass.approved_at || pass.requested_at, pass.returned_at) : null;
              return (
                <div key={pass.id} className="p-4 rounded-2xl bg-muted/30 border border-muted/50 flex flex-col gap-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md border ${getDestinationColor(pass.destination)}`}>{pass.destination}</span>
                      <p className="text-xs font-bold mt-1 text-muted-foreground">{pass.classes?.name} (P{pass.classes?.period_order})</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-bold text-muted-foreground">{new Date(pass.requested_at).toLocaleDateString()}</p>
                      {dur && <p className="text-xs font-black text-primary">{Math.round(dur)}m duration</p>}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 border-t border-muted/50 pt-2">
                    <div>
                      <p className="text-[9px] uppercase font-bold text-muted-foreground">Time Out</p>
                      <p className="text-xs font-bold">{new Date(pass.approved_at || pass.requested_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                    <div>
                      <p className="text-[9px] uppercase font-bold text-muted-foreground">Time In</p>
                      <p className="text-xs font-bold">{pass.returned_at ? new Date(pass.returned_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 pt-4 border-t flex justify-between items-center">
            <div className="flex items-center gap-2">
              <Timer className="h-4 w-4 text-primary" />
              <p className="text-xs font-bold uppercase text-muted-foreground tracking-widest">Total Hallway Time</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-black text-primary leading-none">{Math.round(totalMinutes)}m</p>
              <p className="text-[10px] font-bold text-muted-foreground uppercase">Filtered Total</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* External Dialogs */}
      <ClassManagementDialog open={classDialogOpen} onOpenChange={setClassDialogOpen} editingClass={editingClass} userId={user?.id || ''} onSaved={fetchClasses} />
      <StudentManagementDialog open={studentDialogOpen} onOpenChange={setStudentDialogOpen} student={selectedStudent} currentClassId={selectedClassId} teacherClasses={classes} onUpdated={() => fetchRoster(selectedClassId)} />
    </div>
  );
};

export default TeacherDashboard;
