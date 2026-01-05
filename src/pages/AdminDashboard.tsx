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

import { DeletionRequestsList } from '@/components/admin/DeletionRequestsList';
import { SubManagementDialog } from '@/components/admin/SubManagementDialog';
import { LogOut, Check, X, Calendar, Clock, Plus, Trash2, Users, Edit, Settings, UserCheck, Building2, ChevronLeft, ChevronRight, UserPlus } from 'lucide-react';

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
      console.log("[AdminDashboard] Loading organization settings into state:", settings);
      setWeeklyQuota(settings.weekly_bathroom_limit);
      setDefaultPeriodCount(settings.default_period_count);

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

    // Simplified query using join to fetch passes for the current organization
    const { data: passes, error: passError } = await supabase
      .from('passes')
      .select(`
        id, 
        student_id, 
        destination, 
        status, 
        approved_at, 
        class_id,
        classes!inner(id, name, organization_id)
      `)
      .eq('classes.organization_id', organizationId)
      .in('status', ['approved', 'pending_return'])
      .order('approved_at', { ascending: true });

    if (passError) {
      console.error("[AdminDashboard] Error fetching active passes:", passError);
      return;
    }

    if (!passes || passes.length === 0) {
      console.log("[AdminDashboard] No active passes found for this organization.");
      setActivePasses([]);
      return;
    }

    const studentIds = [...new Set(passes.map(p => p.student_id))];
    console.log(`[AdminDashboard] Resolving names for ${studentIds.length} students...`);
    const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', studentIds);
    const profileMap = new Map(profiles?.map(p => [p.id, p.full_name]) || []);

    setActivePasses(passes.map(p => ({
      id: p.id,
      student_name: profileMap.get(p.student_id) ?? 'Unknown',
      from_class: (p.classes as any)?.name ?? 'Unknown',
      destination: p.destination,
      approved_at: p.approved_at,
      status: p.status
    })));
  };

  const fetchPendingUsers = async () => {
    if (!organizationId) return;
    console.log(`🔄 Fetching pending user approvals for: ${organizationId}`);

    // Use RPC to fetch pending users with emails (securely from auth.users)
    const { data, error } = await supabase
      .rpc('get_organization_pending_users', { _org_id: organizationId });

    if (error) {
      console.error("❌ Error fetching pending users:", error);
      return;
    }

    if (!data || data.length === 0) {
      setPendingUsers([]);
      return;
    }

    console.log(`📥 ${data.length} pending users found.`);
    setPendingUsers(data.map((u: any) => ({
      id: u.id,
      full_name: u.full_name,
      email: u.email,
      role: u.role
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

  const generateDefaultPeriods = (): Period[] => {
    const count = defaultPeriodCount || 7;
    const generatedPeriods: Period[] = [];

    let currentTime = 8 * 60; // Start at 8:00 AM in minutes
    const periodLength = 50; // 50 minute periods
    const passingTime = 5; // 5 minute passing periods

    for (let i = 1; i <= count; i++) {
      const startHour = Math.floor(currentTime / 60);
      const startMin = currentTime % 60;
      const endTime = currentTime + periodLength;
      const endHour = Math.floor(endTime / 60);
      const endMin = endTime % 60;

      generatedPeriods.push({
        schedule_id: '',
        name: `Period ${i}`,
        period_order: i,
        start_time: `${String(startHour).padStart(2, '0')}:${String(startMin).padStart(2, '0')}`,
        end_time: `${String(endHour).padStart(2, '0')}:${String(endMin).padStart(2, '0')}`,
        is_passing_period: false
      });

      currentTime = endTime + passingTime;
    }

    return generatedPeriods;
  };

  const openNewSchedule = () => {
    resetScheduleForm();
    setPeriods(generateDefaultPeriods());
    setScheduleDialogOpen(true);
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
    console.log("💾 Current periods state in AdminDashboard before save:", periods);

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
        id: p.id || crypto.randomUUID(),
        schedule_id: scheduleId!,
        name: p.name,
        period_order: p.period_order,
        start_time: p.start_time,
        end_time: p.end_time,
        is_passing_period: p.is_passing_period
      }));

      // Ensure scheduleId is a string for Typescript safety although we check it above
      if (!scheduleId) return;

      if (periodsToSave.length > 0) {
        console.log("💾 Payload being sent to Supabase:", JSON.stringify(periodsToSave, null, 2));
        const { error: upsertError } = await supabase.from('periods').upsert(periodsToSave);
        if (upsertError) {
          console.error("❌ Error upserting periods:", JSON.stringify(upsertError, null, 2));
          toast({ title: "Error", description: "Failed to save bell schedule rows: " + upsertError.message, variant: "destructive" });
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
          console.log("[AdminDashboard] Global pass update received:", payload);
          fetchActivePasses();
        })
        .subscribe((status) => console.log(`[AdminDashboard] Admin channel status: ${status}`));
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

          <TabsContent value="schedule" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left Column: Calendar & Controls */}
              <div className="lg:col-span-8 space-y-6">
                <Card className="border-none shadow-md overflow-hidden">
                  <CardHeader className="bg-primary/5 pb-4 border-b">
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2 text-xl">
                        <Calendar className="h-5 w-5 text-primary" />
                        School Schedule
                      </CardTitle>
                      <div className="flex gap-2">
                        {/* Button removed as per user request */}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="p-6 flex flex-col items-center">
                      {/* Custom Navigation for Month */}
                      <div className="flex items-center justify-between w-full max-w-3xl mb-4 px-4">
                        <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1))}>
                          <ChevronLeft className="h-5 w-5" />
                        </Button>
                        <h3 className="text-xl font-bold">{format(currentMonth, 'MMMM yyyy')}</h3>
                        <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1))}>
                          <ChevronRight className="h-5 w-5" />
                        </Button>
                      </div>

                      {selectedDates.length > 0 && (
                        <div className="w-full max-w-3xl mb-6 p-4 bg-primary/10 rounded-xl border border-primary/20 flex flex-wrap items-center gap-4 animate-in fade-in slide-in-from-top-2">
                          <span className="font-bold text-primary flex items-center gap-2">
                            <Check className="h-4 w-4" /> {selectedDates.length} days selected
                          </span>
                          <div className="flex-1 flex gap-2">
                            <Select value={bulkScheduleId} onValueChange={setBulkScheduleId}>
                              <SelectTrigger className="bg-background border-primary/20"><SelectValue placeholder="Select Schedule to Assign" /></SelectTrigger>
                              <SelectContent>
                                {schedules.map(s => (
                                  <SelectItem key={s.id} value={s.id}>
                                    <div className="flex items-center gap-2">
                                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: s.color || '#6B7280' }} />
                                      {s.name}
                                    </div>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Button onClick={handleBulkAssign} disabled={!bulkScheduleId} className="font-bold shadow-sm">
                              Apply
                            </Button>
                            <Button variant="ghost" onClick={() => setSelectedDates([])}>
                              Clear
                            </Button>
                          </div>
                        </div>
                      )}

                      {/* Calendar Grid - Custom Implementation for specific controls */}
                      <div className="w-full max-w-3xl grid grid-cols-7 gap-1 sm:gap-2">
                        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                          <div key={day} className="text-center text-xs font-black uppercase text-muted-foreground py-2">
                            {day}
                          </div>
                        ))}

                        {Array.from({ length: daysInMonth[0].getDay() }).map((_, i) => (
                          <div key={`empty-${i}`} className="aspect-square" />
                        ))}

                        {daysInMonth.map(day => {
                          const dateStr = format(day, 'yyyy-MM-dd');
                          const assignment = scheduleAssignments.find(a => a.date === dateStr);
                          const schedule = schedules.find(s => s.id === assignment?.schedule_id);
                          const isSelected = selectedDates.includes(dateStr);
                          const isTodayDate = isToday(day);

                          return (
                            <div
                              key={dateStr}
                              onClick={() => toggleDateSelection(dateStr)}
                              className={`
                                  relative aspect-square p-1 rounded-xl border cursor-pointer transition-all duration-200
                                  hover:border-primary/50 hover:shadow-md group flex flex-col justify-between overflow-hidden
                                  ${isSelected ? 'ring-2 ring-primary border-primary bg-primary/5' : 'bg-card border-border'}
                                  ${isTodayDate ? 'ring-1 ring-offset-2 ring-blue-500' : ''}
                                `}
                              style={schedule?.color ? { backgroundColor: `${schedule.color}15`, borderColor: isSelected ? undefined : `${schedule.color}40` } : {}}
                            >
                              <div className="flex justify-between items-start">
                                <span className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full ${isTodayDate ? 'bg-blue-500 text-white' : 'text-muted-foreground'}`}>
                                  {format(day, 'd')}
                                </span>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity -mr-1 -mt-1 hover:bg-transparent text-muted-foreground hover:text-primary"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSubDialogDate(day);
                                    setSubDialogOpen(true);
                                  }}
                                >
                                  <UserPlus className="h-3 w-3" />
                                </Button>
                              </div>

                              {schedule ? (
                                <div className="mt-1">
                                  <div
                                    className="text-[10px] font-bold truncate px-1.5 py-0.5 rounded text-white shadow-sm text-center"
                                    style={{ backgroundColor: schedule.color || '#6B7280' }}
                                  >
                                    {schedule.name}
                                  </div>
                                </div>
                              ) : (
                                <div className="flex-1 flex items-center justify-center">
                                  <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/20" />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Right Column: Legend & Tools */}
              <div className="lg:col-span-4 space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm font-black uppercase text-muted-foreground tracking-wider">Schedule Types</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {schedules.map(s => (
                      <div key={s.id} className="flex items-center justify-between group p-2 rounded-lg hover:bg-muted/50 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className="w-4 h-4 rounded-full shadow-sm" style={{ backgroundColor: s.color || '#6B7280' }} />
                          <span className="font-bold">{s.name}</span>
                        </div>
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEditSchedule(s)}><Edit className="h-3 w-3" /></Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => handleDeleteSchedule(s.id)}><Trash2 className="h-3 w-3" /></Button>
                        </div>
                      </div>
                    ))}
                    <Button variant="outline" className="w-full border-dashed" onClick={openNewSchedule}>
                      <Plus className="h-4 w-4 mr-2" /> Create New Schedule
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          {/* Removed TabsContent for substitutes */}

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
                    <Label className="font-bold">Default Periods per Day</Label>
                    <Input type="number" min={1} max={12} value={defaultPeriodCount} onChange={(e) => setDefaultPeriodCount(parseInt(e.target.value) || 7)} />
                  </div>
                </div>

                <div className="space-y-4">
                  <Label className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Expected Return Times (minutes)</Label>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Restroom</Label>
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

