import { useState, useEffect, useRef } from 'react';
import { Navigate } from 'react-router-dom';
import { usePageVisibility } from '@/hooks/usePageVisibility';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { PeriodDisplay } from '@/components/PeriodDisplay';
import { ElapsedTimer } from '@/components/ElapsedTimer';
import { InlinePeriodTable } from '@/components/admin/InlinePeriodTable';
import { SubstituteCalendar } from '@/components/admin/SubstituteCalendar';
import { SubManagementDialog } from '@/components/admin/SubManagementDialog';
import { DeletionRequestsList } from '@/components/admin/DeletionRequestsList';
import { LogOut, Check, X, Calendar, Clock, Plus, Trash2, Users, Edit, Settings, UserCheck, Building2, UserPlus } from 'lucide-react';

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
  id?: string;
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
  const { organization, organizationId, settings, refreshSettings } = useOrganization();
  const { toast } = useToast();
  const isVisible = usePageVisibility();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([]);
  const [activePasses, setActivePasses] = useState<ActivePass[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [scheduleAssignments, setScheduleAssignments] = useState<ScheduleAssignment[]>([]);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [bulkScheduleId, setBulkScheduleId] = useState<string>('');
  const [subDialogDate, setSubDialogDate] = useState<Date | null>(null);
  const [subDialogOpen, setSubDialogOpen] = useState(false);


  // Organization Settings
  const [weeklyQuota, setWeeklyQuota] = useState(4);
  const [defaultPeriodCount, setDefaultPeriodCount] = useState(7);
  const [maxConcurrentBathroom, setMaxConcurrentBathroom] = useState(2);
  const [requireDeletionApproval, setRequireDeletionApproval] = useState(false);
  const [bathroomExpectedMinutes, setBathroomExpectedMinutes] = useState(5);
  const [lockerExpectedMinutes, setLockerExpectedMinutes] = useState(3);
  const [officeExpectedMinutes, setOfficeExpectedMinutes] = useState(10);

  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);
  const [newScheduleName, setNewScheduleName] = useState('');
  const [newScheduleIsSchoolDay, setNewScheduleIsSchoolDay] = useState(true);
  const [newScheduleColor, setNewScheduleColor] = useState('#DC2626');

  // Load settings from organization context
  useEffect(() => {
    if (settings) {
      console.log("⚙️ Loading organization settings into admin state:", settings);
      setWeeklyQuota(settings.weekly_bathroom_limit);
      setDefaultPeriodCount(settings.default_period_count);
      setMaxConcurrentBathroom(settings.max_concurrent_bathroom);
      setRequireDeletionApproval(settings.require_deletion_approval);
      setBathroomExpectedMinutes(settings.bathroom_expected_minutes);
      setLockerExpectedMinutes(settings.locker_expected_minutes);
      setOfficeExpectedMinutes(settings.office_expected_minutes);
    }
  }, [settings]);

  // --- Data Fetching ---

  const fetchSchedules = async () => {
    if (!organizationId) return;
    console.log(`🔄 Fetching schedules for organization: ${organizationId}`);
    const { data, error } = await supabase.from('schedules').select('*').eq('organization_id', organizationId).order('name');
    if (error) console.error("❌ Error fetching schedules:", error);
    if (data) {
      console.log(`📥 ${data.length} schedules fetched.`);
      setSchedules(data);
    }
  };

  const fetchPeriodsForStaging = async (scheduleId: string) => {
    console.log(`🔄 Fetching periods for schedule: ${scheduleId}`);
    const { data, error } = await supabase
      .from('periods')
      .select('*')
      .eq('schedule_id', scheduleId)
      .order('period_order');
    if (error) console.error("❌ Error fetching periods:", error);
    if (data) {
      console.log(`📥 ${data.length} periods fetched.`);
      setPeriods(data);
    }
  };

  const fetchActivePasses = async () => {
    if (!organizationId) return;
    console.log(`🔄 Fetching active passes for organization: ${organizationId}`);

    // Get classes in this organization
    const { data: orgClasses, error: classError } = await supabase
      .from('classes')
      .select('id')
      .eq('organization_id', organizationId);

    if (classError) console.error("❌ Error fetching classes:", classError);
    if (!orgClasses || orgClasses.length === 0) {
      console.log("ℹ️ No classes found for this organization.");
      setActivePasses([]);
      return;
    }

    const classIds = orgClasses.map(c => c.id);

    const { data: passes, error: passError } = await supabase
      .from('passes')
      .select('id, student_id, destination, status, approved_at, class_id')
      .in('class_id', classIds)
      .in('status', ['approved', 'pending_return'])
      .order('approved_at', { ascending: true });

    if (passError) console.error("❌ Error fetching passes:", passError);
    if (!passes || passes.length === 0) {
      console.log("ℹ️ No active hallway passes found.");
      setActivePasses([]);
      return;
    }

    console.log(`📥 ${passes.length} active passes found. Resolving names...`);
    const studentIds = [...new Set(passes.map(p => p.student_id))];
    const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', studentIds);
    const profileMap = new Map(profiles?.map(p => [p.id, p.full_name]) || []);

    const { data: classesData } = await supabase.from('classes').select('id, name').in('id', classIds);
    const classMap = new Map(classesData?.map(c => [c.id, c.name]) || []);

    setActivePasses(passes.map(p => ({
      id: p.id,
      student_name: profileMap.get(p.student_id) ?? 'Unknown',
      from_class: classMap.get(p.class_id) ?? 'Unknown',
      destination: p.destination,
      approved_at: p.approved_at,
      status: p.status
    })));
  };

  const fetchPendingUsers = async () => {
    if (!organizationId) return;
    console.log(`🔄 Fetching pending user approvals for: ${organizationId}`);

    const { data: profiles, error: profileError } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .eq('organization_id', organizationId)
      .eq('is_approved', false);

    if (profileError) console.error("❌ Error fetching pending profiles:", profileError);
    if (!profiles || profiles.length === 0) {
      setPendingUsers([]);
      return;
    }

    const userIds = profiles.map(p => p.id);
    const { data: roles, error: rolesError } = await supabase
      .from('user_roles')
      .select('user_id, role')
      .in('user_id', userIds);

    if (rolesError) console.error("❌ Error fetching user roles:", rolesError);
    const roleMap = new Map(roles?.map(r => [r.user_id, r.role]) || []);

    console.log(`📥 ${profiles.length} pending users found.`);
    setPendingUsers(profiles.map(p => ({
      id: p.id,
      full_name: p.full_name,
      email: p.email,
      role: roleMap.get(p.id) ?? 'unknown'
    })));
  };

  const fetchScheduleAssignments = async () => {
    if (!organizationId) return;

    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);
    console.log(`🔄 Fetching schedule assignments for month: ${format(currentMonth, 'MMMM yyyy')}`);

    const { data: orgSchedules } = await supabase
      .from('schedules')
      .select('id')
      .eq('organization_id', organizationId);

    if (!orgSchedules) return;

    const scheduleIds = orgSchedules.map(s => s.id);

    const { data, error } = await supabase
      .from('schedule_assignments')
      .select('date, schedule_id')
      .in('schedule_id', scheduleIds)
      .gte('date', format(start, 'yyyy-MM-dd'))
      .lte('date', format(end, 'yyyy-MM-dd'));

    if (error) console.error("❌ Error fetching assignments:", error);
    if (data) {
      console.log(`📥 ${data.length} schedule assignments fetched for current view.`);
      setScheduleAssignments(data.map(a => ({
        date: a.date,
        schedule_id: a.schedule_id,
        schedule_name: schedules.find(s => s.id === a.schedule_id)?.name ?? ''
      })));
    }
  };

  // --- Handlers ---

  const handleApproveUser = async (userId: string) => {
    console.log(`🔄 Approving user: ${userId}`);
    const { error } = await supabase.from('profiles').update({ is_approved: true }).eq('id', userId);
    if (error) {
      console.error("❌ Approval error:", error);
      toast({ title: 'Error', description: 'Failed to approve user.', variant: 'destructive' });
    } else {
      console.log("✅ User approved successfully.");
      toast({ title: 'User Approved' });
      fetchPendingUsers();
    }
  };

  const handleDenyUser = async (userId: string) => {
    console.log(`🔄 Denying (deleting) user: ${userId}`);
    const { error } = await supabase.from('profiles').delete().eq('id', userId);
    if (error) {
      console.error("❌ Denial error:", error);
      toast({ title: 'Error', description: 'Failed to deny user.', variant: 'destructive' });
    } else {
      console.log("✅ User denied and record removed.");
      toast({ title: 'User Denied' });
      fetchPendingUsers();
    }
  };

  const handleSaveSettings = async () => {
    if (!organizationId) return;
    console.log("🔄 Saving organization settings...");

    const { error } = await supabase
      .from('organization_settings')
      .upsert({
        organization_id: organizationId,
        weekly_bathroom_limit: weeklyQuota,
        default_period_count: defaultPeriodCount,
        max_concurrent_bathroom: maxConcurrentBathroom,
        require_deletion_approval: requireDeletionApproval,
        bathroom_expected_minutes: bathroomExpectedMinutes,
        locker_expected_minutes: lockerExpectedMinutes,
        office_expected_minutes: officeExpectedMinutes,
      }, { onConflict: 'organization_id' });

    if (error) {
      console.error("❌ Error saving settings:", error);
      toast({ title: 'Error', description: 'Failed to save settings.', variant: 'destructive' });
    } else {
      console.log("✅ Settings saved successfully.");
      toast({ title: 'Settings Saved' });
      refreshSettings();
    }
  };

  const handleAssignSchedule = async (date: string, scheduleId: string) => {
    console.log(`🔄 Assigning schedule ${scheduleId} to date: ${date}`);
    const { error } = await supabase.from('schedule_assignments').upsert({ date, schedule_id: scheduleId }, { onConflict: 'date' });
    if (error) console.error("❌ Assignment error:", error);
    if (!error) fetchScheduleAssignments();
  };

  const handleBulkAssign = async () => {
    if (!bulkScheduleId || selectedDates.length === 0) return;
    console.log(`🔄 Bulk assigning schedule ${bulkScheduleId} to ${selectedDates.length} days`);

    for (const date of selectedDates) {
      const { error } = await supabase.from('schedule_assignments').upsert({ date, schedule_id: bulkScheduleId }, { onConflict: 'date' });
      if (error) console.error(`❌ Error assigning to ${date}:`, error);
    }

    toast({ title: 'Schedules Assigned', description: `${selectedDates.length} days updated.` });
    setSelectedDates([]);
    fetchScheduleAssignments();
  };

  const toggleDateSelection = (date: string) => {
    setSelectedDates(prev => prev.includes(date) ? prev.filter(d => d !== date) : [...prev, date]);
  };

  // --- Schedule Dialog Control ---

  const resetScheduleForm = () => {
    setEditingSchedule(null);
    setNewScheduleName('');
    setNewScheduleIsSchoolDay(true);
    setNewScheduleColor('#DC2626');
    setPeriods([]);
  };

  const openEditSchedule = (schedule: Schedule) => {
    console.log(`🔄 Opening editor for schedule: ${schedule.name}`);
    setEditingSchedule(schedule);
    setNewScheduleName(schedule.name);
    setNewScheduleIsSchoolDay(schedule.is_school_day);
    setNewScheduleColor(schedule.color || '#DC2626');
    fetchPeriodsForStaging(schedule.id);
    setScheduleDialogOpen(true);
  };

  const handleSaveSchedule = async () => {
    if (!newScheduleName.trim() || !organizationId) return;
    console.log(`🔄 Saving schedule: ${newScheduleName}`);

    let scheduleId = editingSchedule?.id;

    if (editingSchedule) {
      const { error } = await supabase
        .from('schedules')
        .update({
          name: newScheduleName,
          is_school_day: newScheduleIsSchoolDay,
          color: newScheduleColor
        })
        .eq('id', editingSchedule.id);
      if (error) console.error("❌ Error updating schedule row:", error);
    } else {
      const { data, error } = await supabase
        .from('schedules')
        .insert({
          name: newScheduleName,
          is_school_day: newScheduleIsSchoolDay,
          color: newScheduleColor,
          organization_id: organizationId
        })
        .select()
        .single();

      if (error) {
        console.error("❌ Error creating schedule row:", error);
        toast({ title: "Error", description: "Could not create schedule", variant: "destructive" });
        return;
      }
      scheduleId = data.id;
    }

    if (scheduleId) {
      console.log(`🔄 Syncing periods for schedule ID: ${scheduleId}`);
      const currentIds = periods.filter(p => p.id).map(p => p.id);

      if (currentIds.length > 0) {
        await supabase
          .from('periods')
          .delete()
          .eq('schedule_id', scheduleId)
          .not('id', 'in', `(${currentIds.join(',')})`);
      } else {
        await supabase.from('periods').delete().eq('schedule_id', scheduleId);
      }

      const periodsToSave = periods.map(p => ({
        ...(p.id ? { id: p.id } : {}),
        schedule_id: scheduleId,
        name: p.name,
        period_order: p.period_order,
        start_time: p.start_time,
        end_time: p.end_time,
        is_passing_period: p.is_passing_period
      }));

      if (periodsToSave.length > 0) {
        const { error: upsertError } = await supabase.from('periods').upsert(periodsToSave);
        if (upsertError) {
          console.error("❌ Error upserting periods:", upsertError);
          toast({ title: "Error", description: "Failed to save bell schedule rows", variant: "destructive" });
        }
      }
    }

    toast({ title: editingSchedule ? 'Schedule Updated' : 'Schedule Created' });
    setScheduleDialogOpen(false);
    resetScheduleForm();
    fetchSchedules();
  };

  const handleDeleteSchedule = async (scheduleId: string) => {
    if (!confirm('Are you sure you want to delete this schedule? This will affect all assigned days.')) return;
    console.log(`🔄 Deleting schedule: ${scheduleId}`);

    await supabase.from('periods').delete().eq('schedule_id', scheduleId);
    await supabase.from('schedule_assignments').delete().eq('schedule_id', scheduleId);
    const { error } = await supabase.from('schedules').delete().eq('id', scheduleId);

    if (error) {
      console.error("❌ Deletion error:", error);
      toast({ title: 'Error', description: 'Failed to delete schedule.', variant: 'destructive' });
    } else {
      console.log("✅ Schedule and related data deleted.");
      toast({ title: 'Schedule Deleted' });
      fetchSchedules();
      fetchScheduleAssignments();
    }
  };

  const getScheduleStyle = (schedule: Schedule | undefined) => {
    if (!schedule?.color) return {};
    return { backgroundColor: `${schedule.color}20` };
  };

  // --- Effects ---

  useEffect(() => {
    if (organizationId) {
      fetchPendingUsers();
      fetchActivePasses();
      fetchSchedules();
    }
  }, [organizationId]);

  useEffect(() => {
    if (isVisible && organizationId) {
      console.log("📡 Opening admin-passes realtime channel...");
      channelRef.current = supabase
        .channel('admin-passes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'passes' }, (payload) => {
          console.log("🔔 Global pass update received:", payload);
          fetchActivePasses();
        })
        .subscribe((status) => console.log("📡 Admin channel status:", status));
    }

    return () => {
      if (channelRef.current) {
        console.log("📡 Closing admin-passes realtime channel.");
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [isVisible, organizationId]);

  useEffect(() => {
    if (isVisible) {
      fetchActivePasses();
    }
  }, [isVisible]);

  useEffect(() => {
    if (pendingUsers.length > 0) {
      document.title = `(${pendingUsers.length}) Users Pending | SmartPass Pro`;
    } else {
      document.title = 'Admin Dashboard | SmartPass Pro';
    }
    return () => { document.title = 'SmartPass Pro'; };
  }, [pendingUsers.length]);

  useEffect(() => { fetchScheduleAssignments(); }, [currentMonth, schedules, organizationId]);

  if (authLoading) return <div className="min-h-screen flex items-center justify-center">Loading Admin Access...</div>;
  if (!user || role !== 'admin') return <Navigate to="/auth" replace />;

  const daysInMonth = eachDayOfInterval({ start: startOfMonth(currentMonth), end: endOfMonth(currentMonth) });

  return (
    <div className="min-h-screen bg-background p-4 max-w-6xl mx-auto">
      <header className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center">
            <span className="text-primary-foreground font-bold text-lg">A</span>
          </div>
          <div>
            <h1 className="text-2xl font-bold">Admin Dashboard</h1>
            <p className="text-sm text-muted-foreground flex items-center gap-1">
              <Building2 className="h-3 w-3" />
              {organization?.name || 'No Organization'}
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => {
          console.log("🚪 Admin signing out...");
          signOut();
        }}>
          <LogOut className="h-4 w-4 mr-2" />Sign Out
        </Button>
      </header>

      <div className="space-y-4">
        <PeriodDisplay />

        <Tabs defaultValue="hallway">
          <TabsList className="w-full bg-muted">
            <TabsTrigger value="hallway" className="flex-1">Hallway</TabsTrigger>
            <TabsTrigger value="schedule" className="flex-1">Schedule</TabsTrigger>
            <TabsTrigger value="substitutes" className="flex-1">Substitutes</TabsTrigger>
            <TabsTrigger value="settings" className="flex-1">
              Settings {pendingUsers.length > 0 && <span className="ml-1 px-1.5 py-0.5 text-xs rounded-full bg-destructive text-destructive-foreground">{pendingUsers.length}</span>}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="hallway" className="space-y-2">
            <p className="text-sm text-muted-foreground mb-4">{activePasses.length} student{activePasses.length !== 1 ? 's' : ''} in the hallway</p>
            {activePasses.length === 0 ? (
              <Card><CardContent className="py-8 text-center text-muted-foreground">No students in hallways</CardContent></Card>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {activePasses.map(pass => (
                  <Card key={pass.id} className="border-l-4 border-l-primary">
                    <CardContent className="py-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-medium">{pass.student_name}</p>
                          <p className="text-sm text-muted-foreground">From: {pass.from_class}</p>
                          <p className="text-sm font-semibold">To: {pass.destination}</p>
                        </div>
                        <div className="text-right space-y-1">
                          {pass.approved_at && <ElapsedTimer startTime={pass.approved_at} destination={pass.destination} />}
                          <p className="text-xs text-muted-foreground capitalize font-bold">{pass.status.replace('_', ' ')}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

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
                      <Plus className="h-4 w-4 mr-1" />Create New
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
                    <Button size="sm" onClick={handleBulkAssign} disabled={!bulkScheduleId}>Apply to Selected</Button>
                    <Button size="sm" variant="ghost" onClick={() => setSelectedDates([])}>Cancel</Button>
                  </div>
                )}

                <div className="grid grid-cols-7 gap-1 mb-2 text-center text-xs font-medium text-muted-foreground">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => <div key={d}>{d}</div>)}
                </div>

                <div className="grid grid-cols-7 gap-1">
                  {Array.from({ length: daysInMonth[0].getDay() }).map((_, i) => (
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
                        className={`relative p-1 min-h-[70px] border rounded-lg cursor-pointer transition-all hover:ring-1 hover:ring-ring group ${isToday(day) ? 'ring-2 ring-primary' : ''} ${isSelected ? 'ring-2 ring-ring bg-primary/5' : ''}`}
                        style={getScheduleStyle(scheduleForDay)}
                        onClick={() => toggleDateSelection(dateStr)}

                      >
                        <div className="text-xs font-medium">{format(day, 'd')}</div>
                        <Select value={assignment?.schedule_id || ''} onValueChange={(v) => handleAssignSchedule(dateStr, v)}>
                          <SelectTrigger className="h-6 text-[10px] mt-1 bg-background/80"><SelectValue placeholder="—" /></SelectTrigger>
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
                        <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 rounded-full bg-background/50 hover:bg-primary/20 hover:text-primary"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSubDialogDate(day);
                              setSubDialogOpen(true);
                            }}
                          >
                            <UserPlus className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    );

                  })}
                </div>

                <div className="flex gap-4 mt-4 text-xs flex-wrap border-t pt-4">
                  {schedules.map(s => (
                    <div key={s.id} className="flex items-center gap-2 bg-muted/50 p-2 rounded-lg">
                      <div className="w-3 h-3 rounded" style={{ backgroundColor: s.color || '#6B7280' }} />
                      <span className="font-bold">{s.name}</span>
                      <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => openEditSchedule(s)}><Edit className="h-3 w-3" /></Button>
                      <Button size="icon" variant="ghost" className="h-5 w-5 text-destructive hover:text-destructive" onClick={() => handleDeleteSchedule(s.id)}><Trash2 className="h-3 w-3" /></Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="substitutes">
            <SubstituteCalendar />
          </TabsContent>

          <TabsContent value="settings" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><UserCheck className="h-5 w-5" />Staff Approvals</CardTitle>
              </CardHeader>
              <CardContent>
                {pendingUsers.length === 0 ? (
                  <p className="text-center text-muted-foreground py-4">No pending staff registrations</p>
                ) : (
                  <div className="space-y-2">
                    {pendingUsers.map(u => (
                      <div key={u.id} className="flex items-center justify-between p-3 rounded-lg border bg-card">
                        <div>
                          <p className="font-medium">{u.full_name}</p>
                          <p className="text-sm text-muted-foreground">{u.email}</p>
                          <span className="text-xs font-black uppercase bg-primary/10 text-primary px-2 py-0.5 rounded-full">{u.role}</span>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => handleApproveUser(u.id)} className="bg-green-600 hover:bg-green-700"><Check className="h-4 w-4" /></Button>
                          <Button size="sm" variant="outline" onClick={() => handleDenyUser(u.id)} className="text-destructive border-destructive"><X className="h-4 w-4" /></Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {requireDeletionApproval && (
              <DeletionRequestsList />
            )}

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Settings className="h-5 w-5" />Organization Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="font-bold">Weekly Restroom Quota (per student)</Label>
                    <Input type="number" min={1} max={50} value={weeklyQuota} onChange={(e) => setWeeklyQuota(parseInt(e.target.value) || 4)} />
                    <p className="text-xs text-muted-foreground">Default restroom passes allowed per student per week</p>
                  </div>
                  <div className="space-y-2">
                    <Label className="font-bold">Max Concurrent Bathroom</Label>
                    <Input type="number" min={1} max={20} value={maxConcurrentBathroom} onChange={(e) => setMaxConcurrentBathroom(parseInt(e.target.value) || 2)} />
                  </div>
                </div>

                <div className="space-y-4">
                  <Label className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Expected Return Times (minutes)</Label>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Bathroom</Label>
                      <Input type="number" min={1} value={bathroomExpectedMinutes} onChange={(e) => setBathroomExpectedMinutes(parseInt(e.target.value) || 5)} />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Locker</Label>
                      <Input type="number" min={1} value={lockerExpectedMinutes} onChange={(e) => setLockerExpectedMinutes(parseInt(e.target.value) || 3)} />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Office</Label>
                      <Input type="number" min={1} value={officeExpectedMinutes} onChange={(e) => setOfficeExpectedMinutes(parseInt(e.target.value) || 10)} />
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/20">
                  <div>
                    <Label className="font-bold">Require Deletion Approval</Label>
                    <p className="text-xs text-muted-foreground">Students must request account deletion (Ohio SB 29 compliance)</p>
                  </div>
                  <Switch checked={requireDeletionApproval} onCheckedChange={(val) => {
                    console.log(`🔄 Toggling deletion approval setting to: ${val}`);
                    setRequireDeletionApproval(val);
                  }} />
                </div>

                <Button onClick={handleSaveSettings} className="w-full font-bold">Save Organization Settings</Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog
        open={scheduleDialogOpen}
        onOpenChange={(open) => {
          if (!open) resetScheduleForm();
          setScheduleDialogOpen(open);
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingSchedule ? 'Edit Bell Schedule' : 'Create New Bell Schedule'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Schedule Name</Label>
                <Input value={newScheduleName} onChange={(e) => setNewScheduleName(e.target.value)} placeholder="e.g., Regular, Advisory, Assembly" />
              </div>
              <div className="space-y-2">
                <Label>Color Identifier</Label>
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

            <div className="flex items-center space-x-2 p-3 bg-muted/30 rounded-lg">
              <Checkbox id="isSchoolDay" checked={newScheduleIsSchoolDay} onCheckedChange={(checked) => setNewScheduleIsSchoolDay(!!checked)} />
              <Label htmlFor="isSchoolDay" className="font-medium">Students can request passes on this day</Label>
            </div>

            <div className="space-y-2">
              <Label className="font-bold">Period Timings</Label>
              <InlinePeriodTable
                periods={periods}
                onChange={(updated) => {
                  console.log("💾 Period table updated in memory.");
                  setPeriods(updated);
                }}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setScheduleDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSaveSchedule}>Save Schedule</Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <SubManagementDialog
        open={subDialogOpen}
        onOpenChange={setSubDialogOpen}
        date={subDialogDate}
        organizationId={organizationId || null}
      />
    </div>
  );
};

export default AdminDashboard;

