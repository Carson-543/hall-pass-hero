import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { PeriodDisplay } from '@/components/PeriodDisplay';
import { ElapsedTimer } from '@/components/ElapsedTimer';
import { LogOut, Check, X, UserCheck, Calendar, Clock, Plus, Trash2, Users, Edit, AlertTriangle } from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isToday } from 'date-fns';

interface PendingUser {
  id: string;
  full_name: string;
  email: string;
  role: string;
}

interface ActivePass {
  id: string;
  student_name: string;
  from_class: string;
  destination: string;
  approved_at: string;
  status: string;
}

interface Schedule {
  id: string;
  name: string;
  is_school_day: boolean;
  color: string | null;
}

interface Period {
  id: string;
  schedule_id: string;
  name: string;
  period_order: number;
  start_time: string;
  end_time: string;
  is_passing_period: boolean;
}

interface ScheduleAssignment {
  date: string;
  schedule_id: string;
  schedule_name: string;
}

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
}

const AdminDashboard = () => {
  const { user, role, signOut, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([]);
  const [activePasses, setActivePasses] = useState<ActivePass[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [scheduleAssignments, setScheduleAssignments] = useState<ScheduleAssignment[]>([]);
  const [weeklyQuota, setWeeklyQuota] = useState(4);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [bulkScheduleId, setBulkScheduleId] = useState<string>('');

  // Period management
  const [selectedScheduleForPeriods, setSelectedScheduleForPeriods] = useState<string>('');
  const [periodDialogOpen, setPeriodDialogOpen] = useState(false);
  const [editingPeriod, setEditingPeriod] = useState<Period | null>(null);
  const [newPeriodName, setNewPeriodName] = useState('');
  const [newPeriodOrder, setNewPeriodOrder] = useState('');
  const [newPeriodStart, setNewPeriodStart] = useState('');
  const [newPeriodEnd, setNewPeriodEnd] = useState('');
  const [newPeriodIsPassing, setNewPeriodIsPassing] = useState(false);

  // Schedule management
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);
  const [newScheduleName, setNewScheduleName] = useState('');
  const [newScheduleIsSchoolDay, setNewScheduleIsSchoolDay] = useState(true);
  const [newScheduleColor, setNewScheduleColor] = useState('#DC2626');

  const SCHEDULE_COLORS = [
    { name: 'Red', value: '#DC2626' },
    { name: 'Orange', value: '#F59E0B' },
    { name: 'Green', value: '#10B981' },
    { name: 'Blue', value: '#3B82F6' },
    { name: 'Purple', value: '#8B5CF6' },
    { name: 'Gray', value: '#6B7280' },
  ];

  // Sub mode for admin
  const [subMode, setSubMode] = useState(false);
  const [teachers, setTeachers] = useState<{ id: string; name: string }[]>([]);
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>('');
  const [subClasses, setSubClasses] = useState<ClassInfo[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [classPendingPasses, setClassPendingPasses] = useState<PendingPass[]>([]);
  const [classActivePasses, setClassActivePasses] = useState<PendingPass[]>([]);

  const fetchPendingUsers = async () => {
    const { data: profiles } = await supabase
      .from('profiles')
      .select(`
        id,
        full_name,
        email,
        user_roles (role)
      `)
      .eq('is_approved', false);

    if (profiles) {
      setPendingUsers(profiles.map((p: any) => ({
        id: p.id,
        full_name: p.full_name,
        email: p.email,
        role: p.user_roles?.[0]?.role ?? 'unknown'
      })));
    }
  };

  const fetchActivePasses = async () => {
    const { data } = await supabase
      .from('passes')
      .select(`
        id,
        destination,
        status,
        approved_at,
        profiles!passes_student_id_fkey (full_name),
        classes (name)
      `)
      .in('status', ['approved', 'pending_return'])
      .order('approved_at', { ascending: false });

    if (data) {
      setActivePasses(data.map((p: any) => ({
        id: p.id,
        student_name: p.profiles?.full_name ?? 'Unknown',
        from_class: p.classes?.name ?? 'Unknown',
        destination: p.destination,
        approved_at: p.approved_at,
        status: p.status
      })));
    }
  };

  const fetchSchedules = async () => {
    const { data } = await supabase
      .from('schedules')
      .select('*')
      .order('name');

    if (data) {
      setSchedules(data);
      if (data.length > 0 && !selectedScheduleForPeriods) {
        setSelectedScheduleForPeriods(data[0].id);
      }
    }
  };

  const fetchPeriods = async (scheduleId: string) => {
    const { data } = await supabase
      .from('periods')
      .select('*')
      .eq('schedule_id', scheduleId)
      .order('period_order');

    if (data) {
      setPeriods(data);
    }
  };

  const fetchScheduleAssignments = async () => {
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);

    const { data } = await supabase
      .from('schedule_assignments')
      .select(`
        date,
        schedule_id,
        schedules (name)
      `)
      .gte('date', format(start, 'yyyy-MM-dd'))
      .lte('date', format(end, 'yyyy-MM-dd'));

    if (data) {
      setScheduleAssignments(data.map((a: any) => ({
        date: a.date,
        schedule_id: a.schedule_id,
        schedule_name: a.schedules?.name ?? ''
      })));
    }
  };

  const fetchQuotaSettings = async () => {
    const { data } = await supabase
      .from('weekly_quota_settings')
      .select('weekly_limit')
      .single();

    if (data) {
      setWeeklyQuota(data.weekly_limit ?? 4);
    }
  };

  const fetchTeachers = async () => {
    const { data } = await supabase
      .from('user_roles')
      .select(`
        user_id,
        profiles!user_roles_user_id_fkey (id, full_name)
      `)
      .eq('role', 'teacher');

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

  const fetchClassPasses = async (classId: string) => {
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

    if (pending) {
      setClassPendingPasses(pending.map((p: any) => ({
        id: p.id,
        student_id: p.student_id,
        student_name: (p.profiles as any)?.full_name ?? 'Unknown',
        destination: p.destination,
        status: p.status,
        requested_at: p.requested_at
      })));
    }

    if (active) {
      setClassActivePasses(active.map((p: any) => ({
        id: p.id,
        student_id: p.student_id,
        student_name: (p.profiles as any)?.full_name ?? 'Unknown',
        destination: p.destination,
        status: p.status,
        requested_at: p.requested_at
      })));
    }
  };

  useEffect(() => {
    fetchPendingUsers();
    fetchActivePasses();
    fetchSchedules();
    fetchQuotaSettings();
    fetchTeachers();

    const channel = supabase
      .channel('admin-passes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'passes' },
        () => {
          fetchActivePasses();
          if (selectedClassId) fetchClassPasses(selectedClassId);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Dynamic browser tab title
  useEffect(() => {
    if (pendingUsers.length > 0) {
      document.title = `(${pendingUsers.length}) Users Pending | SmartPass Pro`;
    } else {
      document.title = 'Admin Dashboard | SmartPass Pro';
    }

    return () => {
      document.title = 'SmartPass Pro';
    };
  }, [pendingUsers.length]);

  useEffect(() => {
    fetchScheduleAssignments();
  }, [currentMonth]);

  useEffect(() => {
    if (selectedScheduleForPeriods) {
      fetchPeriods(selectedScheduleForPeriods);
    }
  }, [selectedScheduleForPeriods]);

  useEffect(() => {
    if (selectedTeacherId) {
      fetchSubClasses(selectedTeacherId);
    }
  }, [selectedTeacherId]);

  useEffect(() => {
    if (selectedClassId) {
      fetchClassPasses(selectedClassId);
    }
  }, [selectedClassId]);

  const handleApproveUser = async (userId: string) => {
    const { error } = await supabase
      .from('profiles')
      .update({ is_approved: true })
      .eq('id', userId);

    if (error) {
      toast({ title: 'Error', description: 'Failed to approve user.', variant: 'destructive' });
    } else {
      toast({ title: 'User Approved' });
      fetchPendingUsers();
    }
  };

  const handleDenyUser = async (userId: string) => {
    const { error } = await supabase
      .from('profiles')
      .delete()
      .eq('id', userId);

    if (error) {
      toast({ title: 'Error', description: 'Failed to deny user.', variant: 'destructive' });
    } else {
      toast({ title: 'User Denied' });
      fetchPendingUsers();
    }
  };

  const handleUpdateQuota = async () => {
    const { data: existing } = await supabase
      .from('weekly_quota_settings')
      .select('id')
      .limit(1);

    if (existing && existing.length > 0) {
      await supabase
        .from('weekly_quota_settings')
        .update({ weekly_limit: weeklyQuota })
        .eq('id', existing[0].id);
    } else {
      await supabase
        .from('weekly_quota_settings')
        .insert({ weekly_limit: weeklyQuota });
    }

    toast({ title: 'Quota Updated' });
  };

  const handleAssignSchedule = async (date: string, scheduleId: string) => {
    const { error } = await supabase
      .from('schedule_assignments')
      .upsert({ date, schedule_id: scheduleId }, { onConflict: 'date' });

    if (error) {
      toast({ title: 'Error', description: 'Failed to assign schedule.', variant: 'destructive' });
    } else {
      fetchScheduleAssignments();
    }
  };

  const handleBulkAssign = async () => {
    if (!bulkScheduleId || selectedDates.length === 0) return;

    const assignments = selectedDates.map(date => ({
      date,
      schedule_id: bulkScheduleId
    }));

    for (const assignment of assignments) {
      await supabase
        .from('schedule_assignments')
        .upsert(assignment, { onConflict: 'date' });
    }

    toast({ title: 'Schedules Assigned', description: `${selectedDates.length} days updated.` });
    setSelectedDates([]);
    fetchScheduleAssignments();
  };

  const toggleDateSelection = (date: string) => {
    setSelectedDates(prev => 
      prev.includes(date) 
        ? prev.filter(d => d !== date)
        : [...prev, date]
    );
  };

  const handleCreateSchedule = async () => {
    if (!newScheduleName.trim()) return;

    if (editingSchedule) {
      const { error } = await supabase
        .from('schedules')
        .update({ 
          name: newScheduleName, 
          is_school_day: newScheduleIsSchoolDay,
          color: newScheduleColor
        })
        .eq('id', editingSchedule.id);

      if (error) {
        toast({ title: 'Error', description: 'Failed to update schedule.', variant: 'destructive' });
      } else {
        toast({ title: 'Schedule Updated' });
      }
    } else {
      const { error } = await supabase
        .from('schedules')
        .insert({ 
          name: newScheduleName, 
          is_school_day: newScheduleIsSchoolDay,
          color: newScheduleColor
        });

      if (error) {
        toast({ title: 'Error', description: 'Failed to create schedule.', variant: 'destructive' });
      } else {
        toast({ title: 'Schedule Created' });
      }
    }
    
    setScheduleDialogOpen(false);
    resetScheduleForm();
    fetchSchedules();
  };

  const handleDeleteSchedule = async (scheduleId: string) => {
    const { error } = await supabase
      .from('schedules')
      .delete()
      .eq('id', scheduleId);

    if (error) {
      toast({ title: 'Error', description: 'Failed to delete schedule. It may have periods or assignments.', variant: 'destructive' });
    } else {
      toast({ title: 'Schedule Deleted' });
      fetchSchedules();
    }
  };

  const openEditSchedule = (schedule: Schedule) => {
    setEditingSchedule(schedule);
    setNewScheduleName(schedule.name);
    setNewScheduleIsSchoolDay(schedule.is_school_day);
    setNewScheduleColor(schedule.color || '#DC2626');
    setScheduleDialogOpen(true);
  };

  const resetScheduleForm = () => {
    setEditingSchedule(null);
    setNewScheduleName('');
    setNewScheduleIsSchoolDay(true);
    setNewScheduleColor('#DC2626');
  };

  const handleSavePeriod = async () => {
    if (!newPeriodName.trim() || !newPeriodOrder || !newPeriodStart || !newPeriodEnd) return;

    const periodData = {
      schedule_id: selectedScheduleForPeriods,
      name: newPeriodName,
      period_order: parseInt(newPeriodOrder),
      start_time: newPeriodStart,
      end_time: newPeriodEnd,
      is_passing_period: newPeriodIsPassing
    };

    if (editingPeriod) {
      const { error } = await supabase
        .from('periods')
        .update(periodData)
        .eq('id', editingPeriod.id);

      if (error) {
        toast({ title: 'Error', description: 'Failed to update period.', variant: 'destructive' });
      } else {
        toast({ title: 'Period Updated' });
      }
    } else {
      const { error } = await supabase
        .from('periods')
        .insert(periodData);

      if (error) {
        toast({ title: 'Error', description: 'Failed to create period.', variant: 'destructive' });
      } else {
        toast({ title: 'Period Created' });
      }
    }

    setPeriodDialogOpen(false);
    resetPeriodForm();
    fetchPeriods(selectedScheduleForPeriods);
  };

  const handleDeletePeriod = async (periodId: string) => {
    const { error } = await supabase
      .from('periods')
      .delete()
      .eq('id', periodId);

    if (error) {
      toast({ title: 'Error', description: 'Failed to delete period.', variant: 'destructive' });
    } else {
      toast({ title: 'Period Deleted' });
      fetchPeriods(selectedScheduleForPeriods);
    }
  };

  const resetPeriodForm = () => {
    setEditingPeriod(null);
    setNewPeriodName('');
    setNewPeriodOrder('');
    setNewPeriodStart('');
    setNewPeriodEnd('');
    setNewPeriodIsPassing(false);
  };

  const openEditPeriod = (period: Period) => {
    setEditingPeriod(period);
    setNewPeriodName(period.name);
    setNewPeriodOrder(period.period_order.toString());
    setNewPeriodStart(period.start_time);
    setNewPeriodEnd(period.end_time);
    setNewPeriodIsPassing(period.is_passing_period ?? false);
    setPeriodDialogOpen(true);
  };

  const handleApprovePass = async (passId: string) => {
    const { error } = await supabase
      .from('passes')
      .update({
        status: 'approved',
        approved_at: new Date().toISOString(),
        approved_by: user!.id
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

  const getScheduleColor = (schedule: Schedule | undefined) => {
    if (!schedule) return 'bg-muted/50';
    if (schedule.color) {
      return ''; // Will use inline style instead
    }
    // Fallback for schedules without color
    switch (schedule.name) {
      case 'Regular': return 'bg-primary/20';
      case 'Early Release': return 'bg-accent';
      case 'Assembly': return 'bg-secondary';
      case 'No School': return 'bg-muted';
      default: return 'bg-secondary';
    }
  };

  const getScheduleStyle = (schedule: Schedule | undefined) => {
    if (!schedule?.color) return {};
    return { backgroundColor: `${schedule.color}20` }; // 20 = ~12% opacity in hex
  };

  if (authLoading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  if (!user || role !== 'admin') {
    return <Navigate to="/auth" replace />;
  }

  const daysInMonth = eachDayOfInterval({
    start: startOfMonth(currentMonth),
    end: endOfMonth(currentMonth)
  });

  return (
    <div className="min-h-screen bg-background p-4 max-w-6xl mx-auto">
      <header className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center">
            <span className="text-primary-foreground font-bold text-lg">A</span>
          </div>
          <h1 className="text-2xl font-bold">Admin Dashboard</h1>
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

        {/* Sub Mode UI */}
        {subMode && (
          <Card className="border-primary border-2 card-hover">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2 text-primary">
                <Users className="h-4 w-4" />
                Acting as Substitute
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="text-sm">Select Teacher</Label>
                <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto p-2 border rounded-lg bg-background/50">
                  {teachers.map(t => (
                    <Button
                      key={t.id}
                      variant={selectedTeacherId === t.id ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setSelectedTeacherId(t.id)}
                      className="btn-bounce"
                    >
                      {t.name}
                    </Button>
                  ))}
                </div>
              </div>

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

              {selectedClassId && (
                <div className="space-y-4">
                  <div>
                    <h4 className="font-medium mb-2">Pending Requests ({classPendingPasses.length})</h4>
                    {classPendingPasses.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No pending requests</p>
                    ) : (
                      classPendingPasses.map(pass => (
                        <Card key={pass.id} className="mb-2">
                          <CardContent className="py-3">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="font-medium">{pass.student_name}</p>
                                <p className="text-sm text-muted-foreground">{pass.destination}</p>
                              </div>
                              <div className="flex gap-2">
                                <Button size="sm" onClick={() => handleApprovePass(pass.id)} className="btn-bounce">
                                  <Check className="h-4 w-4" />
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => handleDenyPass(pass.id)} className="btn-bounce">
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))
                    )}
                  </div>
                  <div>
                    <h4 className="font-medium mb-2">Active Passes ({classActivePasses.length})</h4>
                    {classActivePasses.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No active passes</p>
                    ) : (
                      classActivePasses.map(pass => (
                        <Card key={pass.id} className="mb-2 border-l-4 border-l-primary">
                          <CardContent className="py-3">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="font-medium">{pass.student_name}</p>
                                <p className="text-sm text-muted-foreground">{pass.destination}</p>
                              </div>
                              <Button size="sm" onClick={() => handleConfirmReturn(pass.id)} className="btn-bounce">
                                Confirm Return
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      ))
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {!subMode && (
          <Tabs defaultValue="hallway">
            <TabsList className="w-full bg-muted">
              <TabsTrigger value="hallway" className="flex-1 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                Hallway
              </TabsTrigger>
              <TabsTrigger value="approvals" className="flex-1 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                Approvals {pendingUsers.length > 0 && `(${pendingUsers.length})`}
              </TabsTrigger>
              <TabsTrigger value="schedule" className="flex-1 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                Schedule
              </TabsTrigger>
              <TabsTrigger value="periods" className="flex-1 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                Periods
              </TabsTrigger>
              <TabsTrigger value="settings" className="flex-1 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                Settings
              </TabsTrigger>
            </TabsList>

            <TabsContent value="hallway" className="space-y-2">
              <p className="text-sm text-muted-foreground mb-4">
                {activePasses.length} student{activePasses.length !== 1 ? 's' : ''} currently out
              </p>
              {activePasses.length === 0 ? (
                <Card className="card-hover">
                  <CardContent className="py-8 text-center text-muted-foreground">
                    No students currently in hallways
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {activePasses.map(pass => (
                    <Card key={pass.id} className="card-hover border-l-4 border-l-primary">
                      <CardContent className="py-3">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-medium">{pass.student_name}</p>
                            <p className="text-sm text-muted-foreground">From: {pass.from_class}</p>
                            <p className="text-sm">To: {pass.destination}</p>
                          </div>
                          <div className="text-right space-y-1">
                            {pass.approved_at && (
                              <ElapsedTimer 
                                startTime={pass.approved_at} 
                                destination={pass.destination}
                              />
                            )}
                            <p className="text-xs text-muted-foreground capitalize">
                              {pass.status.replace('_', ' ')}
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="approvals" className="space-y-2">
              {pendingUsers.length === 0 ? (
                <Card className="card-hover">
                  <CardContent className="py-8 text-center text-muted-foreground">
                    No pending approvals
                  </CardContent>
                </Card>
              ) : (
                pendingUsers.map(u => (
                  <Card key={u.id} className="card-hover">
                    <CardContent className="py-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">{u.full_name}</p>
                          <p className="text-sm text-muted-foreground">{u.email}</p>
                          <p className="text-xs capitalize bg-primary/10 text-primary px-2 py-0.5 rounded-full inline-block mt-1">{u.role}</p>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => handleApproveUser(u.id)} className="btn-bounce">
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => handleDenyUser(u.id)} className="btn-bounce">
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </TabsContent>

            <TabsContent value="schedule">
              <Card className="card-hover">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <Calendar className="h-5 w-5" />
                      {format(currentMonth, 'MMMM yyyy')}
                    </CardTitle>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))}
                        className="btn-bounce"
                      >
                        Prev
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))}
                        className="btn-bounce"
                      >
                        Next
                      </Button>
                      <Dialog open={scheduleDialogOpen} onOpenChange={(open) => {
                        setScheduleDialogOpen(open);
                        if (!open) resetScheduleForm();
                      }}>
                        <DialogTrigger asChild>
                          <Button size="sm" variant="outline" className="btn-bounce">
                            <Plus className="h-4 w-4 mr-1" />
                            Schedule
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>{editingSchedule ? 'Edit Schedule' : 'Create Schedule'}</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4">
                            <div className="space-y-2">
                              <Label>Schedule Name</Label>
                              <Input
                                value={newScheduleName}
                                onChange={(e) => setNewScheduleName(e.target.value)}
                                placeholder="e.g., Regular, Early Release"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Color</Label>
                              <div className="flex flex-wrap gap-2">
                                {SCHEDULE_COLORS.map(c => (
                                  <button
                                    key={c.value}
                                    type="button"
                                    className={`w-8 h-8 rounded-lg border-2 transition-all ${newScheduleColor === c.value ? 'ring-2 ring-ring ring-offset-2' : ''}`}
                                    style={{ backgroundColor: c.value }}
                                    onClick={() => setNewScheduleColor(c.value)}
                                    title={c.name}
                                  />
                                ))}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                id="isSchoolDay"
                                checked={newScheduleIsSchoolDay}
                                onChange={(e) => setNewScheduleIsSchoolDay(e.target.checked)}
                              />
                              <Label htmlFor="isSchoolDay">Is a school day</Label>
                            </div>
                            <Button onClick={handleCreateSchedule} className="w-full btn-bounce">
                              {editingSchedule ? 'Update Schedule' : 'Create Schedule'}
                            </Button>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {selectedDates.length > 0 && (
                    <div className="mb-4 p-3 bg-primary/10 rounded-lg flex items-center gap-2">
                      <span className="text-sm font-medium">{selectedDates.length} days selected</span>
                      <Select value={bulkScheduleId} onValueChange={setBulkScheduleId}>
                        <SelectTrigger className="w-40">
                          <SelectValue placeholder="Schedule" />
                        </SelectTrigger>
                        <SelectContent>
                          {schedules.map(s => (
                            <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button size="sm" onClick={handleBulkAssign} className="btn-bounce">Apply</Button>
                      <Button size="sm" variant="outline" onClick={() => setSelectedDates([])} className="btn-bounce">Clear</Button>
                    </div>
                  )}

                  <div className="grid grid-cols-7 gap-1 text-center text-xs mb-2">
                    {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
                      <div key={d} className="font-medium text-muted-foreground py-1">{d}</div>
                    ))}
                  </div>

                  <div className="grid grid-cols-7 gap-1">
                    {Array.from({ length: (daysInMonth[0].getDay() + 6) % 7 }).map((_, i) => (
                      <div key={`empty-${i}`} />
                    ))}

                    {daysInMonth.map(day => {
                      const dateStr = format(day, 'yyyy-MM-dd');
                      const assignment = scheduleAssignments.find(a => a.date === dateStr);
                      const isSelected = selectedDates.includes(dateStr);
                      const scheduleForDay = schedules.find(s => s.id === assignment?.schedule_id);

                      return (
                        <div
                          key={dateStr}
                          className={`
                            relative p-1 min-h-[70px] border rounded-lg cursor-pointer transition-all
                            ${isToday(day) ? 'ring-2 ring-primary' : ''}
                            ${isSelected ? 'ring-2 ring-ring bg-primary/5' : ''}
                            ${!scheduleForDay?.color ? getScheduleColor(scheduleForDay) : ''}
                          `}
                          style={getScheduleStyle(scheduleForDay)}
                          onClick={() => toggleDateSelection(dateStr)}
                        >
                          <div className="text-xs font-medium">{format(day, 'd')}</div>
                          <Select
                            value={assignment?.schedule_id || ''}
                            onValueChange={(v) => handleAssignSchedule(dateStr, v)}
                          >
                            <SelectTrigger className="h-6 text-xs mt-1 bg-background/80">
                              <SelectValue placeholder="—" />
                            </SelectTrigger>
                            <SelectContent>
                              {schedules.map(s => (
                                <SelectItem key={s.id} value={s.id}>
                                  <div className="flex items-center gap-2">
                                    <div 
                                      className="w-2 h-2 rounded-full" 
                                      style={{ backgroundColor: s.color || '#6B7280' }}
                                    />
                                    {s.name}
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex gap-4 mt-4 text-xs flex-wrap">
                    {schedules.map(s => (
                      <div key={s.id} className="flex items-center gap-2">
                        <div 
                          className="w-3 h-3 rounded" 
                          style={{ backgroundColor: s.color || '#6B7280' }}
                        />
                        <span>{s.name}</span>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-5 w-5"
                          onClick={() => openEditSchedule(s)}
                        >
                          <Edit className="h-3 w-3" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-5 w-5 text-destructive hover:text-destructive"
                          onClick={() => handleDeleteSchedule(s.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="periods">
              <Card className="card-hover">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <Clock className="h-5 w-5" />
                      Bell Schedule
                    </CardTitle>
                    <div className="flex gap-2">
                      <Select value={selectedScheduleForPeriods} onValueChange={setSelectedScheduleForPeriods}>
                        <SelectTrigger className="w-40">
                          <SelectValue placeholder="Select schedule" />
                        </SelectTrigger>
                        <SelectContent>
                          {schedules.map(s => (
                            <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Dialog open={periodDialogOpen} onOpenChange={(open) => {
                        setPeriodDialogOpen(open);
                        if (!open) resetPeriodForm();
                      }}>
                        <DialogTrigger asChild>
                          <Button size="sm" className="btn-bounce">
                            <Plus className="h-4 w-4 mr-1" />
                            Add Period
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>{editingPeriod ? 'Edit Period' : 'Add Period'}</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4">
                            <div className="space-y-2">
                              <Label>Period Name</Label>
                              <Input
                                value={newPeriodName}
                                onChange={(e) => setNewPeriodName(e.target.value)}
                                placeholder="e.g., Period 1, Lunch, Passing"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Order</Label>
                              <Input
                                type="number"
                                value={newPeriodOrder}
                                onChange={(e) => setNewPeriodOrder(e.target.value)}
                                placeholder="1, 2, 3..."
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <Label>Start Time</Label>
                                <Input
                                  type="time"
                                  value={newPeriodStart}
                                  onChange={(e) => setNewPeriodStart(e.target.value)}
                                />
                              </div>
                              <div className="space-y-2">
                                <Label>End Time</Label>
                                <Input
                                  type="time"
                                  value={newPeriodEnd}
                                  onChange={(e) => setNewPeriodEnd(e.target.value)}
                                />
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                id="isPassing"
                                checked={newPeriodIsPassing}
                                onChange={(e) => setNewPeriodIsPassing(e.target.checked)}
                              />
                              <Label htmlFor="isPassing">Is passing period</Label>
                            </div>
                            <Button onClick={handleSavePeriod} className="w-full btn-bounce">
                              {editingPeriod ? 'Update Period' : 'Add Period'}
                            </Button>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {periods.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">No periods configured for this schedule</p>
                  ) : (
                    <div className="space-y-2">
                      {periods.map(period => (
                        <div
                          key={period.id}
                          className={`flex items-center justify-between p-3 rounded-lg ${period.is_passing_period ? 'bg-muted/50' : 'bg-background border'}`}
                        >
                          <div className="flex items-center gap-4">
                            <span className="font-mono text-sm text-muted-foreground w-8">{period.period_order}</span>
                            <div>
                              <p className="font-medium">{period.name}</p>
                              <p className="text-sm text-muted-foreground">
                                {period.start_time} - {period.end_time}
                              </p>
                            </div>
                            {period.is_passing_period && (
                              <span className="text-xs bg-muted px-2 py-0.5 rounded">Passing</span>
                            )}
                          </div>
                          <div className="flex gap-2">
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => openEditPeriod(period)}
                              className="btn-bounce"
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => handleDeletePeriod(period.id)}
                              className="btn-bounce text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="settings">
              <Card className="card-hover">
                <CardHeader>
                  <CardTitle>Weekly Restroom Quota</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-4">
                    <Label>Passes per week</Label>
                    <Input
                      type="number"
                      min={1}
                      max={20}
                      value={weeklyQuota}
                      onChange={(e) => setWeeklyQuota(parseInt(e.target.value) || 4)}
                      className="w-20"
                    />
                  </div>
                  <Button onClick={handleUpdateQuota} className="btn-bounce">Save</Button>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
};

export default AdminDashboard;