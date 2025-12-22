import { useState, useEffect, useCallback } from 'react';
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
  Copy, Search, Loader2, Clock, Settings, UserMinus
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

// Destination color mapping
const getDestinationColor = (destination: string) => {
  switch (destination.toLowerCase()) {
    case 'restroom': return 'bg-success/10 text-success border-success/20';
    case 'locker': return 'bg-blue-500/10 text-blue-600 border-blue-500/20';
    case 'office': return 'bg-purple-500/10 text-purple-600 border-purple-500/20';
    default: return 'bg-muted text-muted-foreground border-border';
  }
};

const getPassCardColor = (pass: PendingPass) => {
  if (pass.status === 'pending') {
    return pass.is_quota_exceeded ? 'border-l-destructive' : 'border-l-warning';
  }
  return 'border-l-success';
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

  const DESTINATIONS = ['Restroom', 'Locker', 'Office', 'Other'];

  // Fetch Classes
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
    } else {
      setClasses([]);
      setSelectedClassId('');
    }
  }, [user, selectedClassId]);

  // Fetch Students (Roster) - using two-step query
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
      setStudents(profiles.map(p => ({
        id: p.id,
        name: p.full_name,
        email: p.email
      })));
    }
  }, []);

  // Fetch Passes (Requests & Active) - using two-step query
  const fetchPasses = useCallback(async (classId: string) => {
    const { data: passes } = await supabase
      .from('passes')
      .select('id, student_id, destination, status, requested_at, approved_at')
      .eq('class_id', classId)
      .in('status', ['pending', 'approved', 'pending_return']);

    if (!passes || passes.length === 0) {
      setPendingPasses([]);
      setActivePasses([]);
      return;
    }

    // Get student profiles
    const studentIds = [...new Set(passes.map(p => p.student_id))];
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', studentIds);

    const profileMap = new Map(profiles?.map(p => [p.id, p.full_name]) || []);

    // Quota Logic
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

  // Sync Logic
  useEffect(() => { fetchClasses(); }, [fetchClasses]);

  useEffect(() => {
    if (selectedClassId) {
      fetchPasses(selectedClassId);
      fetchRoster(selectedClassId);

      const channel = supabase.channel(`teacher-sync-${selectedClassId}`)
        .on('postgres_changes', { 
          event: '*', 
          schema: 'public', 
          table: 'passes', 
          filter: `class_id=eq.${selectedClassId}` 
        }, () => fetchPasses(selectedClassId))
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'class_enrollments',
          filter: `class_id=eq.${selectedClassId}`
        }, () => fetchRoster(selectedClassId))
        .subscribe();

      return () => { supabase.removeChannel(channel); };
    }
  }, [selectedClassId, fetchPasses, fetchRoster]);

  const handleApprove = async (id: string, override: boolean) => {
    await supabase.from('passes').update({
      status: 'approved',
      approved_at: new Date().toISOString(),
      approved_by: user!.id,
      is_quota_override: override
    }).eq('id', id);
  };

  const handleDeny = async (id: string) => {
    await supabase.from('passes').update({
      status: 'denied',
      denied_at: new Date().toISOString(),
      denied_by: user!.id
    }).eq('id', id);
  };

  const handleCheckIn = async (id: string) => {
    await supabase.from('passes').update({
      status: 'returned',
      returned_at: new Date().toISOString(),
      confirmed_by: user!.id
    }).eq('id', id);
  };

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
      approved_by: user!.id
    });

    setIsActionLoading(false);
    if (!error) {
      setCreatePassDialogOpen(false);
      setSelectedStudentForPass('');
      setSelectedDestination('');
      setCustomDestination('');
      toast({ title: 'Pass Issued' });
    }
  };

  const openEditClass = (classInfo: ClassInfo) => {
    setEditingClass(classInfo);
    setClassDialogOpen(true);
  };

  const openStudentManagement = (student: Student) => {
    setSelectedStudent(student);
    setStudentDialogOpen(true);
  };

  if (authLoading) return <div className="min-h-screen flex items-center justify-center bg-background"><Loader2 className="animate-spin h-8 w-8 text-primary" /></div>;
  if (!user || role !== 'teacher') return <Navigate to="/auth" replace />;

  const filteredStudents = students.filter(s => s.name.toLowerCase().includes(searchQuery.toLowerCase()));
  const currentClass = classes.find(c => c.id === selectedClassId);

  return (
    <div className="min-h-screen bg-background p-4 max-w-6xl mx-auto pb-32">
      {/* Header */}
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
        <Button variant="ghost" size="icon" onClick={signOut} className="rounded-full bg-card shadow-sm border">
          <LogOut className="h-5 w-5 text-muted-foreground" />
        </Button>
      </header>

      <div className="space-y-6">
        <PeriodDisplay />

        {/* Class Selector with Create/Edit */}
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
          {currentClass && (
            <Button 
              variant="outline" 
              size="icon" 
              className="h-14 w-14 rounded-2xl"
              onClick={() => openEditClass(currentClass)}
            >
              <Settings className="h-5 w-5" />
            </Button>
          )}
          <Button 
            size="icon" 
            className="h-14 w-14 rounded-2xl"
            onClick={() => { setEditingClass(null); setClassDialogOpen(true); }}
          >
            <Plus className="h-5 w-5" />
          </Button>
        </div>

        {/* Main Grid: Requests + Active Passes */}
        {selectedClassId && (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Pending Requests */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold uppercase tracking-wider text-warning">
                    Requests ({pendingPasses.length})
                  </h2>
                </div>
                {pendingPasses.length === 0 ? (
                  <Card className="rounded-3xl border-2 border-dashed">
                    <CardContent className="py-12 text-center">
                      <Check className="mx-auto h-10 w-10 text-success/50 mb-3" />
                      <p className="text-muted-foreground font-medium">No pending requests</p>
                    </CardContent>
                  </Card>
                ) : (
                  pendingPasses.map(pass => (
                    <Card key={pass.id} className={`rounded-2xl border-l-4 ${getPassCardColor(pass)} ${pass.is_quota_exceeded ? 'bg-destructive/5' : ''}`}>
                      <CardContent className="p-4 flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="font-bold">{pass.student_name}</h3>
                            {pass.is_quota_exceeded && (
                              <div className="flex items-center gap-1 text-destructive bg-destructive/10 px-2 py-0.5 rounded-lg">
                                <AlertTriangle className="h-3 w-3" />
                                <span className="text-[10px] font-bold uppercase">Quota!</span>
                              </div>
                            )}
                          </div>
                          <span className={`inline-block mt-1 px-2 py-0.5 text-xs font-bold rounded-full border ${getDestinationColor(pass.destination)}`}>
                            {pass.destination}
                          </span>
                        </div>
                        <div className="flex gap-2">
                          <Button size="icon" variant="ghost" className="h-10 w-10 rounded-xl bg-muted" onClick={() => handleDeny(pass.id)}>
                            <X className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant={pass.is_quota_exceeded ? "destructive" : "default"} className="h-10 w-10 rounded-xl shadow-lg" onClick={() => handleApprove(pass.id, pass.is_quota_exceeded)}>
                            <Check className="h-4 w-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>

              {/* Active Passes */}
              <div className="space-y-3">
                <h2 className="text-sm font-bold uppercase tracking-wider text-success">
                  Active ({activePasses.length})
                </h2>
                {activePasses.length === 0 ? (
                  <Card className="rounded-3xl border-2 border-dashed">
                    <CardContent className="py-12 text-center">
                      <Clock className="mx-auto h-10 w-10 text-muted-foreground/50 mb-3" />
                      <p className="text-muted-foreground font-medium">Classroom is full</p>
                    </CardContent>
                  </Card>
                ) : (
                  activePasses.map(pass => (
                    <Card key={pass.id} className={`rounded-2xl border-l-4 ${getPassCardColor(pass)}`}>
                      <CardContent className="p-4 flex items-center justify-between">
                        <div>
                          <h3 className="font-bold">{pass.student_name}</h3>
                          <div className="flex items-center gap-2 mt-1">
                            <span className={`inline-block px-2 py-0.5 text-xs font-bold rounded-full border ${getDestinationColor(pass.destination)}`}>
                              {pass.destination}
                            </span>
                            {pass.approved_at && <ElapsedTimer startTime={pass.approved_at} destination={pass.destination} />}
                          </div>
                        </div>
                        <Button onClick={() => handleCheckIn(pass.id)} className="rounded-xl h-10 px-4 shadow-lg font-bold">
                          Check In
                        </Button>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </div>

            {/* Roster Section */}
            <div className="space-y-4 pt-4 border-t">
              {/* Join Code */}
              {currentClass && (
                <div className="bg-primary/5 rounded-2xl p-4 border border-primary/10 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] uppercase font-bold text-primary mb-1">Class Join Code</p>
                    <code className="text-2xl font-black tracking-widest text-primary">{currentClass.join_code}</code>
                  </div>
                  <Button variant="ghost" size="icon" className="rounded-xl h-10 w-10" onClick={() => { navigator.clipboard.writeText(currentClass.join_code); toast({ title: 'Copied!' }); }}>
                    <Copy className="h-5 w-5" />
                  </Button>
                </div>
              )}

              {/* Search + Roster */}
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input 
                  placeholder="Search students..." 
                  className="h-12 pl-12 rounded-2xl border-none shadow-sm font-medium bg-card" 
                  value={searchQuery} 
                  onChange={(e) => setSearchQuery(e.target.value)} 
                />
              </div>

              <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                {filteredStudents.map(student => (
                  <div 
                    key={student.id} 
                    className="bg-card p-3 rounded-xl shadow-sm border flex items-center justify-between hover:bg-muted/30 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="font-bold truncate">{student.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{student.email}</p>
                    </div>
                    <Button 
                      size="icon" 
                      variant="ghost" 
                      className="rounded-lg h-8 w-8 shrink-0"
                      onClick={() => openStudentManagement(student)}
                    >
                      <UserMinus className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </div>
                ))}
                {filteredStudents.length === 0 && (
                  <p className="col-span-full text-center text-muted-foreground py-8">
                    {students.length === 0 ? 'No students enrolled. Share the join code!' : 'No matching students'}
                  </p>
                )}
              </div>
            </div>
          </>
        )}

        {!selectedClassId && classes.length === 0 && (
          <Card className="rounded-3xl border-2 border-dashed">
            <CardContent className="py-16 text-center">
              <Plus className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
              <p className="text-lg font-bold mb-2">No Classes Yet</p>
              <p className="text-muted-foreground mb-4">Create your first class to get started</p>
              <Button onClick={() => { setEditingClass(null); setClassDialogOpen(true); }} className="rounded-xl">
                <Plus className="h-4 w-4 mr-2" />
                Create Class
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Floating Action Button */}
      {selectedClassId && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 w-full max-w-md px-4">
          <Button 
            onClick={() => setCreatePassDialogOpen(true)}
            className="w-full h-14 rounded-2xl shadow-2xl shadow-primary/40 text-lg font-bold flex items-center justify-center gap-3 active:scale-95 transition-transform"
          >
            <Plus className="h-5 w-5 stroke-[3px]" />
            ISSUE QUICK PASS
          </Button>
        </div>
      )}

      {/* Quick Issue Dialog */}
      <Dialog open={createPassDialogOpen} onOpenChange={setCreatePassDialogOpen}>
        <DialogContent className="rounded-3xl max-w-sm">
          <DialogHeader><DialogTitle className="text-xl font-bold">Quick Pass</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-xs uppercase font-bold text-muted-foreground">Select Student</Label>
              <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto p-1">
                {students.map(s => (
                  <Button key={s.id} variant={selectedStudentForPass === s.id ? 'default' : 'outline'} size="sm" className="rounded-xl font-bold" onClick={() => setSelectedStudentForPass(s.id)}>
                    {s.name.split(' ')[0]}
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase font-bold text-muted-foreground">Location</Label>
              <div className="grid grid-cols-2 gap-2">
                {DESTINATIONS.map(d => (
                  <Button key={d} variant={selectedDestination === d ? 'default' : 'outline'} className="rounded-xl font-bold" onClick={() => setSelectedDestination(d)}>
                    {d}
                  </Button>
                ))}
              </div>
            </div>
            {selectedDestination === 'Other' && (
              <Input placeholder="Specific location..." className="rounded-xl h-12" value={customDestination} onChange={(e) => setCustomDestination(e.target.value)} />
            )}
            <Button onClick={handleQuickPass} className="w-full h-12 rounded-xl font-bold mt-4" disabled={isActionLoading || !selectedStudentForPass || !selectedDestination}>
              {isActionLoading ? <Loader2 className="animate-spin" /> : "ISSUE PASS"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Class Management Dialog */}
      <ClassManagementDialog
        open={classDialogOpen}
        onOpenChange={setClassDialogOpen}
        editingClass={editingClass}
        userId={user?.id || ''}
        onSaved={fetchClasses}
      />

      {/* Student Management Dialog */}
      <StudentManagementDialog
        open={studentDialogOpen}
        onOpenChange={setStudentDialogOpen}
        student={selectedStudent}
        currentClassId={selectedClassId}
        teacherClasses={classes}
        onUpdated={() => fetchRoster(selectedClassId)}
      />
    </div>
  );
};

export default TeacherDashboard;
