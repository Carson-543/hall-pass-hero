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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { PeriodDisplay } from '@/components/PeriodDisplay';
import { ElapsedTimer } from '@/components/ElapsedTimer';
import { InlinePeriodTable } from '@/components/admin/InlinePeriodTable';
import { LogOut, Check, X, Calendar, Clock, Plus, Trash2, Users, Edit, Settings, UserCheck } from 'lucide-react';
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

const SCHEDULE_COLORS = [
  { name: 'Red', value: '#DC2626' },
  { name: 'Orange', value: '#F59E0B' },
  { name: 'Green', value: '#10B981' },
  { name: 'Blue', value: '#3B82F6' },
  { name: 'Purple', value: '#8B5CF6' },
  { name: 'Gray', value: '#6B7280' },
];

const AdminDashboard = () => {
  const { user, role, signOut, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([]);
  const [activePasses, setActivePasses] = useState<ActivePass[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [scheduleAssignments, setScheduleAssignments] = useState<ScheduleAssignment[]>([]);
  const [weeklyQuota, setWeeklyQuota] = useState(4);
  const [defaultPeriodCount, setDefaultPeriodCount] = useState(7);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [bulkScheduleId, setBulkScheduleId] = useState<string>('');

  // Schedule edit dialog (with inline periods)
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);
  const [newScheduleName, setNewScheduleName] = useState('');
  const [newScheduleIsSchoolDay, setNewScheduleIsSchoolDay] = useState(true);
  const [newScheduleColor, setNewScheduleColor] = useState('#DC2626');

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
      .select('id, full_name, email')
      .eq('is_approved', false);

    if (!profiles) return;

    const userIds = profiles.map(p => p.id);
    const { data: roles } = await supabase
      .from('user_roles')
      .select('user_id, role')
      .in('user_id', userIds);

    const roleMap = new Map(roles?.map(r => [r.user_id, r.role]) || []);

    setPendingUsers(profiles.map(p => ({
      id: p.id,
      full_name: p.full_name,
      email: p.email,
      role: roleMap.get(p.id) ?? 'unknown'
    })));
  };

  const fetchActivePasses = async () => {
    const { data: passes } = await supabase
      .from('passes')
      .select('id, student_id, destination, status, approved_at, class_id')
      .in('status', ['approved', 'pending_return'])
      .order('approved_at', { ascending: false });

    if (!passes || passes.length === 0) {
      setActivePasses([]);
      return;
    }

    // Get student profiles
    const studentIds = [...new Set(passes.map(p => p.student_id))];
    const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', studentIds);
    const profileMap = new Map(profiles?.map(p => [p.id, p.full_name]) || []);

    // Get class names
    const classIds = [...new Set(passes.map(p => p.class_id))];
    const { data: classes } = await supabase.from('classes').select('id, name').in('id', classIds);
    const classMap = new Map(classes?.map(c => [c.id, c.name]) || []);

    setActivePasses(passes.map(p => ({
      id: p.id,
      student_name: profileMap.get(p.student_id) ?? 'Unknown',
      from_class: classMap.get(p.class_id) ?? 'Unknown',
      destination: p.destination,
      approved_at: p.approved_at,
      status: p.status
    })));
  };

  const fetchSchedules = async () => {
    const { data } = await supabase.from('schedules').select('*').order('name');
    if (data) setSchedules(data);
  };

  const fetchPeriods = async (scheduleId: string) => {
    const { data } = await supabase
      .from('periods')
      .select('*')
      .eq('schedule_id', scheduleId)
      .order('period_order');
    if (data) setPeriods(data);
  };

  const fetchScheduleAssignments = async () => {
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);

    const { data } = await supabase
      .from('schedule_assignments')
      .select('date, schedule_id')
      .gte('date', format(start, 'yyyy-MM-dd'))
      .lte('date', format(end, 'yyyy-MM-dd'));

    if (data) {
      setScheduleAssignments(data.map(a => ({
        date: a.date,
        schedule_id: a.schedule_id,
        schedule_name: schedules.find(s => s.id === a.schedule_id)?.name ?? ''
      })));
    }
  };

  const fetchSettings = async () => {
    const { data } = await supabase
      .from('weekly_quota_settings')
      .select('weekly_limit, default_period_count')
      .single();

    if (data) {
      setWeeklyQuota(data.weekly_limit ?? 4);
      setDefaultPeriodCount(data.default_period_count ?? 7);
    }
  };

  const fetchTeachers = async () => {
    const { data: roles } = await supabase.from('user_roles').select('user_id').eq('role', 'teacher');
    if (!roles || roles.length === 0) return;

    const userIds = roles.map(r => r.user_id);
    const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', userIds);

    if (profiles) {
      setTeachers(profiles.map(p => ({ id: p.id, name: p.full_name })));
    }
  };

  const fetchSubClasses = async (teacherId: string) => {
    const { data } = await supabase.from('classes').select('*').eq('teacher_id', teacherId).order('period_order');
    if (data) setSubClasses(data);
  };

  const fetchClassPasses = async (classId: string) => {
    const { data: passes } = await supabase
      .from('passes')
      .select('id, student_id, destination, status, requested_at')
      .eq('class_id', classId)
      .in('status', ['pending', 'approved', 'pending_return'])
      .order('requested_at');

    if (!passes) return;

    const studentIds = [...new Set(passes.map(p => p.student_id))];
    const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', studentIds);
    const profileMap = new Map(profiles?.map(p => [p.id, p.full_name]) || []);

    const pending = passes.filter(p => p.status === 'pending').map(p => ({
      id: p.id,
      student_id: p.student_id,
      student_name: profileMap.get(p.student_id) ?? 'Unknown',
      destination: p.destination,
      status: p.status,
      requested_at: p.requested_at
    }));

    const active = passes.filter(p => p.status !== 'pending').map(p => ({
      id: p.id,
      student_id: p.student_id,
      student_name: profileMap.get(p.student_id) ?? 'Unknown',
      destination: p.destination,
      status: p.status,
      requested_at: p.requested_at
    }));

    setClassPendingPasses(pending);
    setClassActivePasses(active);
  };

  useEffect(() => {
    fetchPendingUsers();
    fetchActivePasses();
    fetchSchedules();
    fetchSettings();
    fetchTeachers();

    const channel = supabase
      .channel('admin-passes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'passes' }, () => {
        fetchActivePasses();
        if (selectedClassId) fetchClassPasses(selectedClassId);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  useEffect(() => {
    if (pendingUsers.length > 0) {
      document.title = `(${pendingUsers.length}) Users Pending | SmartPass Pro`;
    } else {
      document.title = 'Admin Dashboard | SmartPass Pro';
    }
    return () => { document.title = 'SmartPass Pro'; };
  }, [pendingUsers.length]);

  useEffect(() => { fetchScheduleAssignments(); }, [currentMonth, schedules]);
  useEffect(() => { if (editingSchedule) fetchPeriods(editingSchedule.id); }, [editingSchedule]);
  useEffect(() => { if (selectedTeacherId) fetchSubClasses(selectedTeacherId); }, [selectedTeacherId]);
  useEffect(() => { if (selectedClassId) fetchClassPasses(selectedClassId); }, [selectedClassId]);

  const handleApproveUser = async (userId: string) => {
    const { error } = await supabase.from('profiles').update({ is_approved: true }).eq('id', userId);
    if (error) {
      toast({ title: 'Error', description: 'Failed to approve user.', variant: 'destructive' });
    } else {
      toast({ title: 'User Approved' });
      fetchPendingUsers();
    }
  };

  const handleDenyUser = async (userId: string) => {
    const { error } = await supabase.from('profiles').delete().eq('id', userId);
    if (error) {
      toast({ title: 'Error', description: 'Failed to deny user.', variant: 'destructive' });
    } else {
      toast({ title: 'User Denied' });
      fetchPendingUsers();
    }
  };

  const handleSaveSettings = async () => {
    const { data: existing } = await supabase.from('weekly_quota_settings').select('id').limit(1);

    if (existing && existing.length > 0) {
      await supabase
        .from('weekly_quota_settings')
        .update({ weekly_limit: weeklyQuota, default_period_count: defaultPeriodCount })
        .eq('id', existing[0].id);
    } else {
      await supabase.from('weekly_quota_settings').insert({ weekly_limit: weeklyQuota, default_period_count: defaultPeriodCount });
    }
    toast({ title: 'Settings Saved' });
  };

  const handleAssignSchedule = async (date: string, scheduleId: string) => {
    const { error } = await supabase.from('schedule_assignments').upsert({ date, schedule_id: scheduleId }, { onConflict: 'date' });
    if (!error) fetchScheduleAssignments();
  };

  const handleBulkAssign = async () => {
    if (!bulkScheduleId || selectedDates.length === 0) return;
    for (const date of selectedDates) {
      await supabase.from('schedule_assignments').upsert({ date, schedule_id: bulkScheduleId }, { onConflict: 'date' });
    }
    toast({ title: 'Schedules Assigned', description: `${selectedDates.length} days updated.` });
    setSelectedDates([]);
    fetchScheduleAssignments();
  };

  const toggleDateSelection = (date: string) => {
    setSelectedDates(prev => prev.includes(date) ? prev.filter(d => d !== date) : [...prev, date]);
  };

  const handleSaveSchedule = async () => {
    if (!newScheduleName.trim()) return;

    if (editingSchedule) {
      await supabase
        .from('schedules')
        .update({ name: newScheduleName, is_school_day: newScheduleIsSchoolDay, color: newScheduleColor })
        .eq('id', editingSchedule.id);
      toast({ title: 'Schedule Updated' });
    } else {
      await supabase.from('schedules').insert({ name: newScheduleName, is_school_day: newScheduleIsSchoolDay, color: newScheduleColor });
      toast({ title: 'Schedule Created' });
    }
    setScheduleDialogOpen(false);
    resetScheduleForm();
    fetchSchedules();
  };

  const handleDeleteSchedule = async (scheduleId: string) => {
    const { error } = await supabase.from('schedules').delete().eq('id', scheduleId);
    if (error) {
      toast({ title: 'Error', description: 'Failed to delete schedule. Remove periods first.', variant: 'destructive' });
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
    setPeriods([]);
  };

  const handleApprovePass = async (passId: string) => {
    await supabase.from('passes').update({ status: 'approved', approved_at: new Date().toISOString(), approved_by: user!.id }).eq('id', passId);
  };

  const handleDenyPass = async (passId: string) => {
    await supabase.from('passes').update({ status: 'denied', denied_at: new Date().toISOString(), denied_by: user!.id }).eq('id', passId);
  };

  const handleConfirmReturn = async (passId: string) => {
    await supabase.from('passes').update({ status: 'returned', returned_at: new Date().toISOString(), confirmed_by: user!.id }).eq('id', passId);
  };

  const getScheduleStyle = (schedule: Schedule | undefined) => {
    if (!schedule?.color) return {};
    return { backgroundColor: `${schedule.color}20` };
  };

  if (authLoading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  if (!user || role !== 'admin') return <Navigate to="/auth" replace />;

  const daysInMonth = eachDayOfInterval({ start: startOfMonth(currentMonth), end: endOfMonth(currentMonth) });

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
          <Button variant={subMode ? 'default' : 'outline'} size="sm" onClick={() => setSubMode(!subMode)}>
            {subMode ? 'Exit Sub Mode' : 'Sub Mode'}
          </Button>
          <Button variant="outline" size="sm" onClick={signOut}>
            <LogOut className="h-4 w-4 mr-2" />Sign Out
          </Button>
        </div>
      </header>

      <div className="space-y-4">
        <PeriodDisplay />

        {/* Sub Mode UI */}
        {subMode && (
          <Card className="border-primary border-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2 text-primary">
                <Users className="h-4 w-4" />Acting as Substitute
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="text-sm">Select Teacher</Label>
                <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto p-2 border rounded-lg bg-muted/30">
                  {teachers.map(t => (
                    <Button key={t.id} variant={selectedTeacherId === t.id ? 'default' : 'outline'} size="sm" onClick={() => setSelectedTeacherId(t.id)}>
                      {t.name}
                    </Button>
                  ))}
                </div>
              </div>

              {selectedTeacherId && subClasses.length > 0 && (
                <Select value={selectedClassId} onValueChange={setSelectedClassId}>
                  <SelectTrigger><SelectValue placeholder="Select a class" /></SelectTrigger>
                  <SelectContent>
                    {subClasses.map(c => (
                      <SelectItem key={c.id} value={c.id}>Period {c.period_order}: {c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {selectedClassId && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-medium mb-2">Pending ({classPendingPasses.length})</h4>
                    {classPendingPasses.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No pending requests</p>
                    ) : (
                      classPendingPasses.map(pass => (
                        <Card key={pass.id} className="mb-2">
                          <CardContent className="py-3 flex items-center justify-between">
                            <div>
                              <p className="font-medium">{pass.student_name}</p>
                              <p className="text-sm text-muted-foreground">{pass.destination}</p>
                            </div>
                            <div className="flex gap-2">
                              <Button size="sm" onClick={() => handleApprovePass(pass.id)}><Check className="h-4 w-4" /></Button>
                              <Button size="sm" variant="outline" onClick={() => handleDenyPass(pass.id)}><X className="h-4 w-4" /></Button>
                            </div>
                          </CardContent>
                        </Card>
                      ))
                    )}
                  </div>
                  <div>
                    <h4 className="font-medium mb-2">Active ({classActivePasses.length})</h4>
                    {classActivePasses.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No active passes</p>
                    ) : (
                      classActivePasses.map(pass => (
                        <Card key={pass.id} className="mb-2 border-l-4 border-l-primary">
                          <CardContent className="py-3 flex items-center justify-between">
                            <div>
                              <p className="font-medium">{pass.student_name}</p>
                              <p className="text-sm text-muted-foreground">{pass.destination}</p>
                            </div>
                            <Button size="sm" onClick={() => handleConfirmReturn(pass.id)}>Confirm Return</Button>
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
              <TabsTrigger value="hallway" className="flex-1 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Hallway</TabsTrigger>
              <TabsTrigger value="schedule" className="flex-1 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Schedule</TabsTrigger>
              <TabsTrigger value="settings" className="flex-1 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                Settings {pendingUsers.length > 0 && <span className="ml-1 px-1.5 py-0.5 text-xs rounded-full bg-destructive text-destructive-foreground">{pendingUsers.length}</span>}
              </TabsTrigger>
            </TabsList>

            {/* Hallway Tab */}
            <TabsContent value="hallway" className="space-y-2">
              <p className="text-sm text-muted-foreground mb-4">{activePasses.length} student{activePasses.length !== 1 ? 's' : ''} currently out</p>
              {activePasses.length === 0 ? (
                <Card><CardContent className="py-8 text-center text-muted-foreground">No students currently in hallways</CardContent></Card>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {activePasses.map(pass => (
                    <Card key={pass.id} className="border-l-4 border-l-primary">
                      <CardContent className="py-3">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-medium">{pass.student_name}</p>
                            <p className="text-sm text-muted-foreground">From: {pass.from_class}</p>
                            <p className="text-sm">To: {pass.destination}</p>
                          </div>
                          <div className="text-right space-y-1">
                            {pass.approved_at && <ElapsedTimer startTime={pass.approved_at} destination={pass.destination} />}
                            <p className="text-xs text-muted-foreground capitalize">{pass.status.replace('_', ' ')}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Schedule Tab */}
            <TabsContent value="schedule">
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <CardTitle className="flex items-center gap-2">
                      <Calendar className="h-5 w-5" />{format(currentMonth, 'MMMM yyyy')}
                    </CardTitle>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))}>Prev</Button>
                      <Button variant="outline" size="sm" onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))}>Next</Button>
                      <Button size="sm" variant="outline" onClick={() => { resetScheduleForm(); setScheduleDialogOpen(true); }}>
                        <Plus className="h-4 w-4 mr-1" />Schedule
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {selectedDates.length > 0 && (
                    <div className="mb-4 p-3 bg-muted rounded-lg flex items-center gap-3 flex-wrap">
                      <span className="text-sm font-medium">{selectedDates.length} days selected</span>
                      <Select value={bulkScheduleId} onValueChange={setBulkScheduleId}>
                        <SelectTrigger className="w-40 h-8"><SelectValue placeholder="Select schedule" /></SelectTrigger>
                        <SelectContent>
                          {schedules.map(s => (
                            <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button size="sm" onClick={handleBulkAssign} disabled={!bulkScheduleId}>Apply</Button>
                      <Button size="sm" variant="ghost" onClick={() => setSelectedDates([])}>Clear</Button>
                    </div>
                  )}

                  <div className="grid grid-cols-7 gap-1 mb-2 text-center text-xs font-medium text-muted-foreground">
                    {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => <div key={d}>{d}</div>)}
                  </div>

                  <div className="grid grid-cols-7 gap-1">
                    {Array.from({ length: (daysInMonth[0].getDay() + 6) % 7 }).map((_, i) => <div key={`empty-${i}`} />)}
                    {daysInMonth.map(day => {
                      const dateStr = format(day, 'yyyy-MM-dd');
                      const assignment = scheduleAssignments.find(a => a.date === dateStr);
                      const isSelected = selectedDates.includes(dateStr);
                      const scheduleForDay = schedules.find(s => s.id === assignment?.schedule_id);

                      return (
                        <div
                          key={dateStr}
                          className={`relative p-1 min-h-[70px] border rounded-lg cursor-pointer transition-all hover:ring-1 hover:ring-ring ${isToday(day) ? 'ring-2 ring-primary' : ''} ${isSelected ? 'ring-2 ring-ring bg-primary/5' : ''}`}
                          style={getScheduleStyle(scheduleForDay)}
                          onClick={() => toggleDateSelection(dateStr)}
                        >
                          <div className="text-xs font-medium">{format(day, 'd')}</div>
                          <Select value={assignment?.schedule_id || ''} onValueChange={(v) => handleAssignSchedule(dateStr, v)}>
                            <SelectTrigger className="h-6 text-xs mt-1 bg-background/80"><SelectValue placeholder="—" /></SelectTrigger>
                            <SelectContent>
                              {schedules.map(s => (
                                <SelectItem key={s.id} value={s.id}>
                                  <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color || '#6B7280' }} />
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
                        <div className="w-3 h-3 rounded" style={{ backgroundColor: s.color || '#6B7280' }} />
                        <span>{s.name}</span>
                        <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => openEditSchedule(s)}><Edit className="h-3 w-3" /></Button>
                        <Button size="icon" variant="ghost" className="h-5 w-5 text-destructive hover:text-destructive" onClick={() => handleDeleteSchedule(s.id)}><Trash2 className="h-3 w-3" /></Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Settings Tab */}
            <TabsContent value="settings" className="space-y-4">
              {/* Staff Approvals */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><UserCheck className="h-5 w-5" />Staff Approvals</CardTitle>
                </CardHeader>
                <CardContent>
                  {pendingUsers.length === 0 ? (
                    <p className="text-center text-muted-foreground py-4">No pending approvals</p>
                  ) : (
                    <div className="space-y-2">
                      {pendingUsers.map(u => (
                        <div key={u.id} className="flex items-center justify-between p-3 rounded-lg border bg-card">
                          <div>
                            <p className="font-medium">{u.full_name}</p>
                            <p className="text-sm text-muted-foreground">{u.email}</p>
                            <span className="text-xs capitalize bg-primary/10 text-primary px-2 py-0.5 rounded-full">{u.role}</span>
                          </div>
                          <div className="flex gap-2">
                            <Button size="sm" onClick={() => handleApproveUser(u.id)}><Check className="h-4 w-4" /></Button>
                            <Button size="sm" variant="outline" onClick={() => handleDenyUser(u.id)}><X className="h-4 w-4" /></Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* General Settings */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Settings className="h-5 w-5" />General Settings</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Weekly Restroom Quota</Label>
                      <Input type="number" min={1} max={20} value={weeklyQuota} onChange={(e) => setWeeklyQuota(parseInt(e.target.value) || 4)} />
                    </div>
                    <div className="space-y-2">
                      <Label>Default Periods Per Day</Label>
                      <Select value={defaultPeriodCount.toString()} onValueChange={(v) => setDefaultPeriodCount(parseInt(v))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {[4, 5, 6, 7, 8, 9, 10].map(n => (
                            <SelectItem key={n} value={n.toString()}>{n} periods</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Button onClick={handleSaveSettings}>Save Settings</Button>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </div>

      {/* Schedule Edit Dialog with Inline Period Table */}
      <Dialog open={scheduleDialogOpen} onOpenChange={(open) => { setScheduleDialogOpen(open); if (!open) resetScheduleForm(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingSchedule ? 'Edit Schedule' : 'Create Schedule'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Schedule Name</Label>
                <Input value={newScheduleName} onChange={(e) => setNewScheduleName(e.target.value)} placeholder="e.g., Regular" />
              </div>
              <div className="space-y-2">
                <Label>Color</Label>
                <div className="flex gap-2">
                  {SCHEDULE_COLORS.map(c => (
                    <button
                      key={c.value}
                      className={`w-8 h-8 rounded-full border-2 transition-all ${newScheduleColor === c.value ? 'border-foreground scale-110' : 'border-transparent'}`}
                      style={{ backgroundColor: c.value }}
                      onClick={() => setNewScheduleColor(c.value)}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox id="isSchoolDay" checked={newScheduleIsSchoolDay} onCheckedChange={(checked) => setNewScheduleIsSchoolDay(!!checked)} />
              <Label htmlFor="isSchoolDay">This is a school day</Label>
            </div>

            {editingSchedule && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-base font-semibold flex items-center gap-2"><Clock className="h-4 w-4" />Bell Schedule</Label>
                </div>
                <InlinePeriodTable 
                  scheduleId={editingSchedule.id} 
                  periods={periods} 
                  onPeriodsChange={() => fetchPeriods(editingSchedule.id)} 
                />
              </div>
            )}
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setScheduleDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveSchedule}>{editingSchedule ? 'Save Changes' : 'Create Schedule'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminDashboard;
