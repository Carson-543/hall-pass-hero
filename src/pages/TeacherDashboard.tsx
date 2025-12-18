import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { PeriodDisplay } from '@/components/PeriodDisplay';
import { LogOut, Plus, Users, AlertTriangle, Check, X } from 'lucide-react';

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
  is_quota_exceeded: boolean;
}

interface Student {
  id: string;
  name: string;
  email: string;
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

  // Sub mode
  const [subMode, setSubMode] = useState(false);
  const [teachers, setTeachers] = useState<{ id: string; name: string }[]>([]);
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>('');
  const [subClasses, setSubClasses] = useState<ClassInfo[]>([]);

  const fetchClasses = async () => {
    if (!user) return;

    const { data } = await supabase
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
        profiles!passes_student_id_fkey (full_name)
      `)
      .eq('class_id', classId)
      .in('status', ['approved', 'pending_return'])
      .order('requested_at');

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

  useEffect(() => {
    fetchClasses();
    fetchTeachers();
  }, [user]);

  useEffect(() => {
    if (selectedClassId) {
      fetchPasses(selectedClassId);
      fetchStudents(selectedClassId);

      // Subscribe to pass changes
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

    // Generate join code
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

  if (authLoading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  if (!user || role !== 'teacher') {
    return <Navigate to="/auth" replace />;
  }

  const currentClass = classes.find(c => c.id === selectedClassId);

  return (
    <div className="min-h-screen bg-background p-4 max-w-6xl mx-auto">
      <header className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Teacher Dashboard</h1>
        <div className="flex items-center gap-2">
          <Button
            variant={subMode ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSubMode(!subMode)}
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
          <Card className="border-primary">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
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

            <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button size="icon" variant="outline">
                  <Plus className="h-4 w-4" />
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
                  <Button onClick={handleCreateClass} className="w-full">
                    Create Class
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        )}

        {currentClass && (
          <Card>
            <CardContent className="pt-4">
              <p className="text-sm text-muted-foreground">
                Join Code: <span className="font-mono font-bold">{currentClass.join_code}</span>
              </p>
            </CardContent>
          </Card>
        )}

        <Tabs defaultValue="passes">
          <TabsList className="w-full">
            <TabsTrigger value="passes" className="flex-1">
              Pass Requests {pendingPasses.length > 0 && `(${pendingPasses.length})`}
            </TabsTrigger>
            <TabsTrigger value="active" className="flex-1">
              Active Passes {activePasses.length > 0 && `(${activePasses.length})`}
            </TabsTrigger>
            <TabsTrigger value="roster" className="flex-1">
              Roster ({students.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="passes" className="space-y-2">
            {pendingPasses.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  No pending pass requests
                </CardContent>
              </Card>
            ) : (
              pendingPasses.map(pass => (
                <Card key={pass.id} className={pass.is_quota_exceeded ? 'border-destructive' : ''}>
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
                          >
                            Extraordinary Approval
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => handleApprovePass(pass.id)}
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDenyPass(pass.id)}
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
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  No students currently out
                </CardContent>
              </Card>
            ) : (
              activePasses.map(pass => (
                <Card key={pass.id}>
                  <CardContent className="py-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{pass.student_name}</p>
                        <p className="text-sm text-muted-foreground">{pass.destination}</p>
                        <p className="text-xs text-muted-foreground capitalize">
                          {pass.status.replace('_', ' ')}
                        </p>
                      </div>
                      {pass.status === 'pending_return' ? (
                        <Button
                          size="sm"
                          onClick={() => handleConfirmReturn(pass.id)}
                        >
                          Confirm Return
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleConfirmReturn(pass.id)}
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

          <TabsContent value="roster" className="space-y-2">
            {students.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  No students enrolled
                </CardContent>
              </Card>
            ) : (
              students.map(student => (
                <Card key={student.id}>
                  <CardContent className="py-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{student.name}</p>
                        <p className="text-sm text-muted-foreground">{student.email}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default TeacherDashboard;
