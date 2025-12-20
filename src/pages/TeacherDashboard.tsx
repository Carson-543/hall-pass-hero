import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { PeriodDisplay } from '@/components/PeriodDisplay';
import { ElapsedTimer } from '@/components/ElapsedTimer';
import { LogOut, Plus, Users, AlertTriangle, Check, X, Copy, UserMinus, ClipboardList, Calendar, Filter } from 'lucide-react';
import { format, startOfWeek, endOfWeek, subWeeks, startOfMonth, endOfMonth, subMonths } from 'date-fns';

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

interface PassHistoryItem {
  id: string;
  destination: string;
  status: string;
  requested_at: string;
  class_name: string;
}

const TeacherDashboard = () => {
  const { user, role, signOut, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [pendingPasses, setPendingPasses] = useState<PendingPass[]>([]);
  const [activePasses, setActivePasses] = useState<PendingPass[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [newClassName, setNewClassName] = useState('');
  const [newClassPeriod, setNewClassPeriod] = useState('');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  // Create pass for student
  const [createPassDialogOpen, setCreatePassDialogOpen] = useState(false);
  const [selectedStudentForPass, setSelectedStudentForPass] = useState('');
  const [selectedDestination, setSelectedDestination] = useState('');
  const [customDestination, setCustomDestination] = useState('');

  // Student pass history
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [selectedStudentHistory, setSelectedStudentHistory] = useState<Student | null>(null);
  const [studentPassHistory, setStudentPassHistory] = useState<PassHistoryItem[]>([]);
  const [historyFilter, setHistoryFilter] = useState('this_week');
  const [historyClassFilter, setHistoryClassFilter] = useState('all');

  // Remove student
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const [studentToRemove, setStudentToRemove] = useState<Student | null>(null);

  // Sub mode
  const [subMode, setSubMode] = useState(false);
  const [teachers, setTeachers] = useState<{ id: string; name: string }[]>([]);
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>('');
  const [subClasses, setSubClasses] = useState<ClassInfo[]>([]);

  const DESTINATIONS = ['Restroom', 'Locker', 'Office', 'Other'];

  const fetchClasses = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('classes')
      .select('*')
      .eq('teacher_id', user.id)
      .order('period_order');

    if (data) {
      setClasses(data);
      if (data.length > 0 && !selectedClassId) {
        setSelectedClassId(data[0].id);
      }
    }
  };

  const fetchPasses = async (classId: string) => {
    const { data: pending } = await supabase
      .from('passes')
      .select(`
        id,
        student_id,
        destination,
        status,
        requested_at,
        approved_at,
        profiles!passes_student_id_fkey (full_name)
      `)
      .eq('class_id', classId)
      .eq('status', 'pending')
      .order('requested_at');

    const { data: active } = await supabase
      .from('passes')
      .select(`
        id,
        student_id,
        destination,
        status,
        requested_at,
        approved_at,
        profiles!passes_student_id_fkey (full_name)
      `)
      .eq('class_id', classId)
      .in('status', ['approved', 'pending_return'])
      .order('approved_at');

    // Check quota for each pending pass
    if (pending) {
      const passesWithQuota = await Promise.all(
        pending.map(async (p: any) => {
          const { count } = await supabase
            .from('passes')
            .select('*', { count: 'exact', head: true })
            .eq('student_id', p.student_id)
            .eq('destination', 'Restroom')
            .in('status', ['approved', 'pending_return', 'returned'])
            .gte('requested_at', getWeekStart().toISOString());

          const { data: settings } = await supabase
            .from('weekly_quota_settings')
            .select('weekly_limit')
            .single();

          const limit = settings?.weekly_limit ?? 4;
          const isExceeded = p.destination === 'Restroom' && (count ?? 0) >= limit;

          return {
            id: p.id,
            student_id: p.student_id,
            student_name: (p.profiles as any)?.full_name ?? 'Unknown',
            destination: p.destination,
            status: p.status,
            requested_at: p.requested_at,
            is_quota_exceeded: isExceeded
          };
        })
      );
      setPendingPasses(passesWithQuota);
    }

    if (active) {
      setActivePasses(active.map((p: any) => ({
        id: p.id,
        student_id: p.student_id,
        student_name: (p.profiles as any)?.full_name ?? 'Unknown',
        destination: p.destination,
        status: p.status,
        requested_at: p.requested_at,
        approved_at: p.approved_at,
        is_quota_exceeded: false
      })));
    }
  };

  const fetchStudents = async (classId: string) => {
    const { data } = await supabase
      .from('class_enrollments')
      .select(`
        student_id,
        profiles!class_enrollments_student_id_fkey (id, full_name, email)
      `)
      .eq('class_id', classId);

    if (data) {
      setStudents(data.map((e: any) => ({
        id: e.profiles?.id ?? e.student_id,
        name: e.profiles?.full_name ?? 'Unknown',
        email: e.profiles?.email ?? ''
      })));
    }
  };

  const fetchTeachers = async () => {
    const { data } = await supabase
      .from('user_roles')
      .select(`
        user_id,
        profiles!user_roles_user_id_fkey (id, full_name)
      `)
      .eq('role', 'teacher')
      .neq('user_id', user?.id);

    if (data) {
      setTeachers(data.map((t: any) => ({
        id: t.user_id,
        name: t.profiles?.full_name ?? 'Unknown'
      })));
    }
  };

  const fetchSubClasses = async (teacherId: string) => {
    const { data } = await supabase
      .from('classes')
      .select('*')
      .eq('teacher_id', teacherId)
      .order('period_order');

    if (data) {
      setSubClasses(data);
    }
  };

  const fetchStudentPassHistory = async (studentId: string) => {
    let startDate: Date;
    let endDate = new Date();

    switch (historyFilter) {
      case 'this_week':
        startDate = startOfWeek(new Date(), { weekStartsOn: 1 });
        break;
      case 'last_week':
        startDate = startOfWeek(subWeeks(new Date(), 1), { weekStartsOn: 1 });
        endDate = endOfWeek(subWeeks(new Date(), 1), { weekStartsOn: 1 });
        break;
      case 'this_month':
        startDate = startOfMonth(new Date());
        break;
      case 'last_month':
        startDate = startOfMonth(subMonths(new Date(), 1));
        endDate = endOfMonth(subMonths(new Date(), 1));
        break;
      default:
        startDate = startOfWeek(new Date(), { weekStartsOn: 1 });
    }

    let query = supabase
      .from('passes')
      .select(`
        id,
        destination,
        status,
        requested_at,
        class_id,
        classes (name)
      `)
      .eq('student_id', studentId)
      .gte('requested_at', startDate.toISOString())
      .lte('requested_at', endDate.toISOString())
      .order('requested_at', { ascending: false });

    if (historyClassFilter !== 'all') {
      query = query.eq('class_id', historyClassFilter);
    }

    const { data } = await query;

    if (data) {
      setStudentPassHistory(data.map((p: any) => ({
        id: p.id,
        destination: p.destination,
        status: p.status,
        requested_at: p.requested_at,
        class_name: p.classes?.name ?? 'Unknown'
      })));
    }
  };

  useEffect(() => {
    fetchClasses();
    fetchTeachers();
  }, [user]);

  // Dynamic browser tab title
  useEffect(() => {
    if (pendingPasses.length > 0) {
      document.title = `(${pendingPasses.length}) Approval Needed | SmartPass Pro`;
    } else {
      document.title = 'Teacher Dashboard | SmartPass Pro';
    }

    return () => {
      document.title = 'SmartPass Pro';
    };
  }, [pendingPasses.length]);

  useEffect(() => {
    if (selectedClassId) {
      fetchPasses(selectedClassId);
      fetchStudents(selectedClassId);

      const channel = supabase
        .channel(`class-passes-${selectedClassId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'passes',
            filter: `class_id=eq.${selectedClassId}`
          },
          () => {
            fetchPasses(selectedClassId);
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [selectedClassId]);

  useEffect(() => {
    if (selectedTeacherId) {
      fetchSubClasses(selectedTeacherId);
    }
  }, [selectedTeacherId]);

  useEffect(() => {
    if (selectedStudentHistory) {
      fetchStudentPassHistory(selectedStudentHistory.id);
    }
  }, [selectedStudentHistory, historyFilter, historyClassFilter]);

  const getWeekStart = () => {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const monday = new Date(now);
    monday.setDate(now.getDate() - diff);
    monday.setHours(0, 0, 0, 0);
    return monday;
  };

  const handleCreateClass = async () => {
    if (!newClassName.trim() || !newClassPeriod) return;

    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let joinCode = '';
    for (let i = 0; i < 6; i++) {
      joinCode += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    const { error } = await supabase
      .from('classes')
      .insert({
        teacher_id: user!.id,
        name: newClassName,
        period_order: parseInt(newClassPeriod),
        join_code: joinCode
      });

    if (error) {
      toast({
        title: 'Error',
        description: 'Failed to create class.',
        variant: 'destructive'
      });
    } else {
      toast({
        title: 'Class Created',
        description: `Join code: ${joinCode}`
      });
      setNewClassName('');
      setNewClassPeriod('');
      setCreateDialogOpen(false);
      fetchClasses();
    }
  };

  const handleCreatePassForStudent = async () => {
    if (!selectedStudentForPass || !selectedDestination) return;

    const destination = selectedDestination === 'Other' ? customDestination : selectedDestination;
    if (selectedDestination === 'Other' && !customDestination.trim()) {
      toast({
        title: 'Missing Destination',
        description: 'Please enter a custom destination.',
        variant: 'destructive'
      });
      return;
    }

    const { error } = await supabase
      .from('passes')
      .insert({
        student_id: selectedStudentForPass,
        class_id: selectedClassId,
        destination: destination,
        status: 'approved',
        approved_at: new Date().toISOString(),
        approved_by: user!.id
      });

    if (error) {
      toast({ title: 'Error', description: 'Failed to create pass.', variant: 'destructive' });
    } else {
      toast({ title: 'Pass Created', description: 'Student can now leave.' });
      setCreatePassDialogOpen(false);
      setSelectedStudentForPass('');
      setSelectedDestination('');
      setCustomDestination('');
      fetchPasses(selectedClassId);
    }
  };

  const handleApprovePass = async (passId: string, isOverride: boolean = false) => {
    const { error } = await supabase
      .from('passes')
      .update({
        status: 'approved',
        approved_at: new Date().toISOString(),
        approved_by: user!.id,
        is_quota_override: isOverride
      })
      .eq('id', passId);

    if (error) {
      toast({ title: 'Error', description: 'Failed to approve pass.', variant: 'destructive' });
    }
  };

  const handleDenyPass = async (passId: string) => {
    const { error } = await supabase
      .from('passes')
      .update({
        status: 'denied',
        denied_at: new Date().toISOString(),
        denied_by: user!.id
      })
      .eq('id', passId);

    if (error) {
      toast({ title: 'Error', description: 'Failed to deny pass.', variant: 'destructive' });
    }
  };

  const handleConfirmReturn = async (passId: string) => {
    const { error } = await supabase
      .from('passes')
      .update({
        status: 'returned',
        returned_at: new Date().toISOString(),
        confirmed_by: user!.id
      })
      .eq('id', passId);

    if (error) {
      toast({ title: 'Error', description: 'Failed to confirm return.', variant: 'destructive' });
    }
  };

  const handleRemoveStudent = async () => {
    if (!studentToRemove || !selectedClassId) return;

    const { error } = await supabase
      .from('class_enrollments')
      .delete()
      .eq('class_id', selectedClassId)
      .eq('student_id', studentToRemove.id);

    if (error) {
      toast({ title: 'Error', description: 'Failed to remove student.', variant: 'destructive' });
    } else {
      toast({ title: 'Student Removed' });
      setRemoveDialogOpen(false);
      setStudentToRemove(null);
      fetchStudents(selectedClassId);
    }
  };

  const copyJoinCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast({ title: 'Copied!', description: `Join code ${code} copied to clipboard.` });
  };

  if (authLoading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  if (!user || role !== 'teacher') {
    return <Navigate to="/auth" replace />;
  }

  const currentClass = classes.find(c => c.id === selectedClassId);
  const displayClasses = subMode ? subClasses : classes;

  return (
    <div className="min-h-screen bg-background p-4 max-w-6xl mx-auto">
      <header className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center">
            <span className="text-primary-foreground font-bold text-lg">S</span>
          </div>
          <h1 className="text-2xl font-bold">Teacher Dashboard</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={subMode ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSubMode(!subMode)}
            className="btn-bounce"
          >
            {subMode ? 'Exit Sub Mode' : 'Sub Mode'}
          </Button>
          <Button variant="outline" size="sm" onClick={signOut}>
            <LogOut className="h-4 w-4 mr-2" />
            Sign Out
          </Button>
        </div>
      </header>

      <div className="space-y-4">
        <PeriodDisplay />

        {subMode && (
          <Card className="border-primary border-2 card-hover">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2 text-primary">
                <Users className="h-4 w-4" />
                Acting as Substitute
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Select value={selectedTeacherId} onValueChange={setSelectedTeacherId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a teacher" />
                </SelectTrigger>
                <SelectContent>
                  {teachers.map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {selectedTeacherId && subClasses.length > 0 && (
                <Select value={selectedClassId} onValueChange={setSelectedClassId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a class" />
                  </SelectTrigger>
                  <SelectContent>
                    {subClasses.map(c => (
                      <SelectItem key={c.id} value={c.id}>
                        Period {c.period_order}: {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </CardContent>
          </Card>
        )}

        {!subMode && (
          <div className="flex items-center gap-2">
            <Select value={selectedClassId} onValueChange={setSelectedClassId}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Select a class" />
              </SelectTrigger>
              <SelectContent>
                {classes.map(c => (
                  <SelectItem key={c.id} value={c.id}>
                    Period {c.period_order}: {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Create Pass for Student Button */}
            <Dialog open={createPassDialogOpen} onOpenChange={setCreatePassDialogOpen}>
              <DialogTrigger asChild>
                <Button size="icon" variant="default" className="btn-bounce" disabled={!selectedClassId || students.length === 0}>
                  <Plus className="h-4 w-4" />
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create Pass for Student</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Student</Label>
                    <Select value={selectedStudentForPass} onValueChange={setSelectedStudentForPass}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select student" />
                      </SelectTrigger>
                      <SelectContent>
                        {students.map(s => (
                          <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Destination</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {DESTINATIONS.map(dest => (
                        <Button
                          key={dest}
                          variant={selectedDestination === dest ? 'default' : 'outline'}
                          className="btn-bounce"
                          onClick={() => setSelectedDestination(dest)}
                        >
                          {dest}
                        </Button>
                      ))}
                    </div>
                  </div>
                  {selectedDestination === 'Other' && (
                    <Input
                      placeholder="Enter destination"
                      value={customDestination}
                      onChange={(e) => setCustomDestination(e.target.value)}
                    />
                  )}
                  <Button onClick={handleCreatePassForStudent} className="w-full btn-bounce">
                    Create Pass
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        )}

        <Tabs defaultValue="passes">
          <TabsList className="w-full bg-muted">
            <TabsTrigger value="passes" className="flex-1 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              Requests {pendingPasses.length > 0 && `(${pendingPasses.length})`}
            </TabsTrigger>
            <TabsTrigger value="active" className="flex-1 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              Active {activePasses.length > 0 && `(${activePasses.length})`}
            </TabsTrigger>
            <TabsTrigger value="roster" className="flex-1 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              Roster ({students.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="passes" className="space-y-2">
            {pendingPasses.length === 0 ? (
              <Card className="card-hover">
                <CardContent className="py-8 text-center text-muted-foreground">
                  No pending pass requests
                </CardContent>
              </Card>
            ) : (
              pendingPasses.map(pass => (
                <Card key={pass.id} className={`card-hover ${pass.is_quota_exceeded ? 'border-destructive border-2' : ''}`}>
                  <CardContent className="py-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{pass.student_name}</p>
                        <p className="text-sm text-muted-foreground">{pass.destination}</p>
                        {pass.is_quota_exceeded && (
                          <p className="text-xs text-destructive flex items-center gap-1 mt-1">
                            <AlertTriangle className="h-3 w-3" />
                            QUOTA EXCEEDED
                          </p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        {pass.is_quota_exceeded ? (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleApprovePass(pass.id, true)}
                            className="btn-bounce"
                          >
                            Override
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => handleApprovePass(pass.id)}
                            className="btn-bounce"
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDenyPass(pass.id)}
                          className="btn-bounce"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="active" className="space-y-2">
            {activePasses.length === 0 ? (
              <Card className="card-hover">
                <CardContent className="py-8 text-center text-muted-foreground">
                  No students currently out
                </CardContent>
              </Card>
            ) : (
              activePasses.map(pass => (
                <Card key={pass.id} className="card-hover border-l-4 border-l-primary">
                  <CardContent className="py-3">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{pass.student_name}</p>
                          {pass.approved_at && (
                            <ElapsedTimer 
                              startTime={pass.approved_at} 
                              destination={pass.destination}
                            />
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">{pass.destination}</p>
                        <p className="text-xs text-muted-foreground capitalize">
                          {pass.status.replace('_', ' ')}
                        </p>
                      </div>
                      {pass.status === 'pending_return' ? (
                        <Button
                          size="sm"
                          onClick={() => handleConfirmReturn(pass.id)}
                          className="btn-bounce"
                        >
                          Confirm Return
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleConfirmReturn(pass.id)}
                          className="btn-bounce"
                        >
                          Check In
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="roster" className="space-y-4">
            {/* Roster Header with Join Code and Create Class */}
            {currentClass && (
              <Card className="bg-primary/5 border-primary/20">
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium">Join Code:</span>
                      <code className="bg-background px-3 py-1 rounded-md font-mono text-lg font-bold">
                        {currentClass.join_code}
                      </code>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => copyJoinCode(currentClass.join_code)}
                        className="btn-bounce"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                    <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
                      <DialogTrigger asChild>
                        <Button variant="outline" className="btn-bounce">
                          <Plus className="h-4 w-4 mr-2" />
                          Create Class
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Create New Class</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <Label>Class Name</Label>
                            <Input
                              value={newClassName}
                              onChange={(e) => setNewClassName(e.target.value)}
                              placeholder="e.g., Algebra 1"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Period</Label>
                            <Select value={newClassPeriod} onValueChange={setNewClassPeriod}>
                              <SelectTrigger>
                                <SelectValue placeholder="Select period" />
                              </SelectTrigger>
                              <SelectContent>
                                {[1, 2, 3, 4, 5, 6, 7, 8].map(p => (
                                  <SelectItem key={p} value={p.toString()}>Period {p}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <Button onClick={handleCreateClass} className="w-full btn-bounce">
                            Create Class
                          </Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* All Classes List */}
            {!subMode && classes.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                {classes.map(c => (
                  <Card
                    key={c.id}
                    className={`cursor-pointer card-hover ${c.id === selectedClassId ? 'ring-2 ring-primary' : ''}`}
                    onClick={() => setSelectedClassId(c.id)}
                  >
                    <CardContent className="py-3 text-center">
                      <p className="font-medium">Period {c.period_order}</p>
                      <p className="text-sm text-muted-foreground truncate">{c.name}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* Students List */}
            {students.length === 0 ? (
              <Card className="card-hover">
                <CardContent className="py-8 text-center text-muted-foreground">
                  No students enrolled
                </CardContent>
              </Card>
            ) : (
              students.map(student => (
                <Card key={student.id} className="card-hover">
                  <CardContent className="py-3">
                    <div className="flex items-center justify-between">
                      <div 
                        className="flex-1 cursor-pointer"
                        onClick={() => {
                          setSelectedStudentHistory(student);
                          setHistoryDialogOpen(true);
                        }}
                      >
                        <p className="font-medium hover:text-primary transition-colors">{student.name}</p>
                        <p className="text-sm text-muted-foreground">{student.email}</p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => {
                            setSelectedStudentHistory(student);
                            setHistoryDialogOpen(true);
                          }}
                          className="btn-bounce"
                        >
                          <ClipboardList className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => {
                            setStudentToRemove(student);
                            setRemoveDialogOpen(true);
                          }}
                          className="btn-bounce text-destructive hover:text-destructive"
                        >
                          <UserMinus className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Student Pass History Dialog */}
      <Dialog open={historyDialogOpen} onOpenChange={setHistoryDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5" />
              {selectedStudentHistory?.name}'s Pass History
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Select value={historyFilter} onValueChange={setHistoryFilter}>
                <SelectTrigger className="flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="this_week">This Week</SelectItem>
                  <SelectItem value="last_week">Last Week</SelectItem>
                  <SelectItem value="this_month">This Month</SelectItem>
                  <SelectItem value="last_month">Last Month</SelectItem>
                </SelectContent>
              </Select>
              <Select value={historyClassFilter} onValueChange={setHistoryClassFilter}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="All Classes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Classes</SelectItem>
                  {classes.map(c => (
                    <SelectItem key={c.id} value={c.id}>Period {c.period_order}: {c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="max-h-64 overflow-y-auto space-y-2">
              {studentPassHistory.length === 0 ? (
                <p className="text-center text-muted-foreground py-4">No passes found</p>
              ) : (
                studentPassHistory.map(pass => (
                  <div key={pass.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                    <div>
                      <p className="font-medium">{pass.destination}</p>
                      <p className="text-xs text-muted-foreground">{pass.class_name}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm capitalize">{pass.status.replace('_', ' ')}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(pass.requested_at), 'MMM d, h:mm a')}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Remove Student Confirmation Dialog */}
      <Dialog open={removeDialogOpen} onOpenChange={setRemoveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Student</DialogTitle>
          </DialogHeader>
          <p>Are you sure you want to remove <strong>{studentToRemove?.name}</strong> from this class?</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleRemoveStudent} className="btn-bounce">
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TeacherDashboard;