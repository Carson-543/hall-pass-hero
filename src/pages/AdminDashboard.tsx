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
import { useToast } from '@/hooks/use-toast';
import { PeriodDisplay } from '@/components/PeriodDisplay';
import { LogOut, Check, X, UserCheck, Calendar, Clock } from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isToday } from 'date-fns';

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
}

interface ScheduleAssignment {
  date: string;
  schedule_id: string;
  schedule_name: string;
}

const AdminDashboard = () => {
  const { user, role, signOut, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([]);
  const [activePasses, setActivePasses] = useState<ActivePass[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [scheduleAssignments, setScheduleAssignments] = useState<ScheduleAssignment[]>([]);
  const [weeklyQuota, setWeeklyQuota] = useState(4);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [bulkScheduleId, setBulkScheduleId] = useState<string>('');

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
      setWeeklyQuota(data.weekly_limit);
    }
  };

  useEffect(() => {
    fetchPendingUsers();
    fetchActivePasses();
    fetchSchedules();
    fetchQuotaSettings();

    // Subscribe to active passes
    const channel = supabase
      .channel('admin-passes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'passes'
        },
        () => {
          fetchActivePasses();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    fetchScheduleAssignments();
  }, [currentMonth]);

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
    // Delete the user (cascades to profile and roles)
    const { error } = await supabase.auth.admin.deleteUser(userId);

    if (error) {
      // Fallback: just mark as denied or leave unapproved
      toast({ title: 'Note', description: 'User remains unapproved.' });
    } else {
      toast({ title: 'User Denied' });
      fetchPendingUsers();
    }
  };

  const handleUpdateQuota = async () => {
    const { error } = await supabase
      .from('weekly_quota_settings')
      .update({ weekly_limit: weeklyQuota })
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Update all rows

    if (error) {
      toast({ title: 'Error', description: 'Failed to update quota.', variant: 'destructive' });
    } else {
      toast({ title: 'Quota Updated' });
    }
  };

  const handleAssignSchedule = async (date: string, scheduleId: string) => {
    const { error } = await supabase
      .from('schedule_assignments')
      .upsert({
        date,
        schedule_id: scheduleId
      }, { onConflict: 'date' });

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

    const { error } = await supabase
      .from('schedule_assignments')
      .upsert(assignments, { onConflict: 'date' });

    if (error) {
      toast({ title: 'Error', description: 'Failed to assign schedules.', variant: 'destructive' });
    } else {
      toast({ title: 'Schedules Assigned', description: `${selectedDates.length} days updated.` });
      setSelectedDates([]);
      fetchScheduleAssignments();
    }
  };

  const toggleDateSelection = (date: string) => {
    setSelectedDates(prev => 
      prev.includes(date) 
        ? prev.filter(d => d !== date)
        : [...prev, date]
    );
  };

  const getTimeSinceApproved = (approvedAt: string) => {
    const diff = Date.now() - new Date(approvedAt).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m`;
    return `${Math.floor(mins / 60)}h ${mins % 60}m`;
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

  const getScheduleColor = (scheduleName: string) => {
    switch (scheduleName) {
      case 'Regular': return 'bg-primary/20';
      case 'Early Release': return 'bg-accent';
      case 'Assembly': return 'bg-secondary';
      case 'No School': return 'bg-muted';
      default: return '';
    }
  };

  return (
    <div className="min-h-screen bg-background p-4 max-w-6xl mx-auto">
      <header className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Admin Dashboard</h1>
        <Button variant="outline" size="sm" onClick={signOut}>
          <LogOut className="h-4 w-4 mr-2" />
          Sign Out
        </Button>
      </header>

      <div className="space-y-4">
        <PeriodDisplay />

        <Tabs defaultValue="hallway">
          <TabsList className="w-full">
            <TabsTrigger value="hallway" className="flex-1">
              Hallway Monitor
            </TabsTrigger>
            <TabsTrigger value="approvals" className="flex-1">
              Approvals {pendingUsers.length > 0 && `(${pendingUsers.length})`}
            </TabsTrigger>
            <TabsTrigger value="schedule" className="flex-1">
              Schedule
            </TabsTrigger>
            <TabsTrigger value="settings" className="flex-1">
              Settings
            </TabsTrigger>
          </TabsList>

          <TabsContent value="hallway" className="space-y-2">
            <p className="text-sm text-muted-foreground mb-4">
              {activePasses.length} student{activePasses.length !== 1 ? 's' : ''} currently out
            </p>
            {activePasses.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  No students currently in hallways
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {activePasses.map(pass => (
                  <Card key={pass.id}>
                    <CardContent className="py-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-medium">{pass.student_name}</p>
                          <p className="text-sm text-muted-foreground">From: {pass.from_class}</p>
                          <p className="text-sm">To: {pass.destination}</p>
                        </div>
                        <div className="text-right">
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            {getTimeSinceApproved(pass.approved_at)}
                          </div>
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
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  No pending approvals
                </CardContent>
              </Card>
            ) : (
              pendingUsers.map(u => (
                <Card key={u.id}>
                  <CardContent className="py-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{u.full_name}</p>
                        <p className="text-sm text-muted-foreground">{u.email}</p>
                        <p className="text-xs capitalize">{u.role}</p>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => handleApproveUser(u.id)}>
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handleDenyUser(u.id)}>
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
            <Card>
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
                      onClick={() => setCurrentMonth(new Date(currentMonth.setMonth(currentMonth.getMonth() - 1)))}
                    >
                      Prev
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentMonth(new Date(currentMonth.setMonth(currentMonth.getMonth() + 1)))}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {selectedDates.length > 0 && (
                  <div className="mb-4 p-3 bg-muted rounded-lg flex items-center gap-2">
                    <span className="text-sm">{selectedDates.length} days selected</span>
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
                    <Button size="sm" onClick={handleBulkAssign}>Apply</Button>
                    <Button size="sm" variant="outline" onClick={() => setSelectedDates([])}>Clear</Button>
                  </div>
                )}

                <div className="grid grid-cols-7 gap-1 text-center text-xs mb-2">
                  {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
                    <div key={d} className="font-medium text-muted-foreground py-1">{d}</div>
                  ))}
                </div>

                <div className="grid grid-cols-7 gap-1">
                  {/* Add empty cells for days before the first of the month */}
                  {Array.from({ length: (daysInMonth[0].getDay() + 6) % 7 }).map((_, i) => (
                    <div key={`empty-${i}`} />
                  ))}
                  
                  {daysInMonth.map(day => {
                    const dateStr = format(day, 'yyyy-MM-dd');
                    const assignment = scheduleAssignments.find(a => a.date === dateStr);
                    const isSelected = selectedDates.includes(dateStr);

                    return (
                      <div
                        key={dateStr}
                        className={`
                          relative p-1 min-h-[60px] border rounded cursor-pointer
                          ${isToday(day) ? 'ring-2 ring-primary' : ''}
                          ${isSelected ? 'ring-2 ring-ring' : ''}
                          ${assignment ? getScheduleColor(assignment.schedule_name) : ''}
                        `}
                        onClick={() => toggleDateSelection(dateStr)}
                      >
                        <div className="text-xs font-medium">{format(day, 'd')}</div>
                        {assignment && (
                          <div className="text-xs text-muted-foreground truncate">
                            {assignment.schedule_name}
                          </div>
                        )}
                        {!assignment && (
                          <Select
                            value=""
                            onValueChange={(v) => {
                              handleAssignSchedule(dateStr, v);
                            }}
                          >
                            <SelectTrigger className="h-6 text-xs mt-1">
                              <SelectValue placeholder="—" />
                            </SelectTrigger>
                            <SelectContent>
                              {schedules.map(s => (
                                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="flex gap-4 mt-4 text-xs">
                  {schedules.map(s => (
                    <div key={s.id} className="flex items-center gap-1">
                      <div className={`w-3 h-3 rounded ${getScheduleColor(s.name)}`} />
                      <span>{s.name}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="settings">
            <Card>
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
                <Button onClick={handleUpdateQuota}>Save</Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default AdminDashboard;
