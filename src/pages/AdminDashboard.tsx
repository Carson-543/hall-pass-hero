import React, { useState, useEffect, useRef } from 'react';
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
import { motion, AnimatePresence } from 'framer-motion';
import { GlassCard } from '@/components/ui/glass-card';
import { PageTransition, StaggerContainer, StaggerItem } from '@/components/ui/page-transition';

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
  const [semesterEndDate, setSemesterEndDate] = useState<string>('');

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
      setWeeklyQuota(settings.weekly_bathroom_limit);
      setDefaultPeriodCount(settings.default_period_count);
      setRequireDeletionApproval(settings.require_deletion_approval);
      setBathroomExpectedMinutes(settings.bathroom_expected_minutes);
      setLockerExpectedMinutes(settings.locker_expected_minutes);
      setOfficeExpectedMinutes(settings.office_expected_minutes);
      // Use type assertion for fields not yet in generated types
      setSemesterEndDate((settings as any).semester_end_date || '');
    }
  }, [settings]);

  // --- Data Fetching ---

  const fetchSchedules = async () => {
    if (!organizationId) return;
    const { data } = await supabase.from('schedules').select('*').eq('organization_id', organizationId).order('name');
    if (data) {
      setSchedules(data);
    }
  };

  const fetchPeriodsForStaging = async (scheduleId: string) => {
    const { data } = await supabase
      .from('periods')
      .select('*')
      .eq('schedule_id', scheduleId)
      .order('period_order');
    if (data) {
      setPeriods(data);
    }
  };

  const fetchActivePasses = async () => {
    if (!organizationId) return;

    // 1. Fetch all classes in this organization
    const { data: classesData, error: classError } = await supabase
      .from('classes')
      .select('id, name')
      .eq('organization_id', organizationId);

    if (classError || !classesData || classesData.length === 0) {
      setActivePasses([]);
      return;
    }

    const classIds = classesData.map(c => c.id);
    const classMap = new Map(classesData.map(c => [c.id, c.name]));

    // 2. Fetch passes for these classes
    const { data: passes, error: passError } = await supabase
      .from('passes')
      .select('id, student_id, destination, status, approved_at, class_id')
      .in('class_id', classIds)
      .in('status', ['approved', 'pending_return'])
      .order('approved_at', { ascending: true });

    if (passError || !passes || passes.length === 0) {
      setActivePasses([]);
      return;
    }

    const studentIds = [...new Set(passes.map(p => p.student_id))];
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', studentIds);

    const profileMap = new Map(profiles?.map(p => [p.id, p.full_name]) || []);

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

    // Use RPC to fetch pending users with emails (securely from auth.users)
    // Type assertion needed as this function is not in generated types yet
    const { data, error } = await (supabase.rpc as any)('get_organization_pending_users', { _org_id: organizationId });

    if (error || !data || data.length === 0) {
      setPendingUsers([]);
      return;
    }

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

    const { data: orgSchedules } = await supabase
      .from('schedules')
      .select('id')
      .eq('organization_id', organizationId);

    if (!orgSchedules) return;

    const scheduleIds = orgSchedules.map(s => s.id);

    const { data } = await supabase
      .from('schedule_assignments')
      .select('date, schedule_id')
      .in('schedule_id', scheduleIds)
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
    console.log(`🔄 Denying user: ${userId}`);
    // UPDATE: We now mark as FALSE (Denied) instead of deleting
    const { error } = await supabase
      .from('profiles')
      .update({ is_approved: false })
      .eq('id', userId);

    if (error) {
      console.error("❌ Denial error:", error);
      toast({ title: 'Error', description: 'Failed to deny user.', variant: 'destructive' });
    } else {
      console.log("✅ User denied.");
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
        semester_end_date: semesterEndDate || null,
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
        .subscribe((status) => {
          const timestamp = new Date().toLocaleTimeString();
          console.log(`[${timestamp}] [AdminDashboard] Admin channel status: ${status}`);
        });
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
    <PageTransition className="min-h-screen bg-slate-950 text-slate-100 selection:bg-blue-500/30 overflow-x-hidden">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <motion.div
          className="absolute -top-1/4 -right-1/4 w-[80%] h-[80%] rounded-full bg-blue-600/15 blur-[100px]"
          style={{ willChange: "transform" }}
          animate={{ x: [0, 20, 0], y: [0, -10, 0] }}
          transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
        />
        <motion.div
          className="absolute -bottom-1/4 -left-1/4 w-[70%] h-[70%] rounded-full bg-blue-400/5 blur-[80px]"
          style={{ willChange: "transform" }}
          animate={{ x: [0, -20, 0], y: [0, 15, 0] }}
          transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
        />
      </div>

      <div className="max-w-6xl mx-auto p-4 relative z-10">
        <StaggerContainer>
          <StaggerItem>
            <header className="flex items-center justify-between mb-8 pt-4">
              <div className="flex items-center gap-5">
                <motion.div
                  className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center shadow-2xl shadow-blue-500/40 border-2 border-white/20 overflow-hidden p-2"
                  whileHover={{ scale: 1.05, rotate: 5 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <img src="/logo.png" alt="Logo" className="w-10 h-10 object-contain drop-shadow-md" />
                </motion.div>
                <div>
                  <h1 className="text-3xl font-black tracking-tighter text-white leading-none mb-1">ClassPass <span className="text-blue-500">Pro</span></h1>
                  <p className="text-sm text-slate-300 font-extrabold tracking-wide uppercase flex items-center gap-1.5 mt-1">
                    <Building2 className="h-3.5 w-3.5 text-blue-500" />
                    {organization?.name || 'No Organization'}
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  console.log("🚪 Admin signing out...");
                  signOut();
                }}
                className="w-11 h-11 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/15 text-white shadow-sm transition-all"
              >
                <LogOut className="h-5 w-5" />
              </Button>
            </header>
          </StaggerItem>

          <StaggerItem>
            <div className="space-y-4">
              <GlassCard className="p-4 bg-slate-900/60 border-2 border-white/10 shadow-xl overflow-hidden">
                <PeriodDisplay />
              </GlassCard>

              <Tabs defaultValue="hallway" className="space-y-6">
                <TabsList className="w-full bg-slate-900/60 border-2 border-white/10 h-14 p-1 rounded-2xl backdrop-blur-xl">
                  <TabsTrigger value="hallway" className="flex-1 rounded-xl font-bold transition-all data-[state=active]:bg-blue-600 data-[state=active]:text-white">Hallway</TabsTrigger>
                  <TabsTrigger value="schedule" className="flex-1 rounded-xl font-bold transition-all data-[state=active]:bg-blue-600 data-[state=active]:text-white">Schedule</TabsTrigger>
                  <TabsTrigger value="settings" className="flex-1 rounded-xl font-bold transition-all data-[state=active]:bg-blue-600 data-[state=active]:text-white relative">
                    Settings
                    {pendingUsers.length > 0 && (
                      <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-black text-white ring-2 ring-slate-950 animate-in zoom-in">
                        {pendingUsers.length}
                      </span>
                    )}
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="hallway" className="space-y-4 outline-none border-none p-0">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-black uppercase tracking-widest text-slate-400">
                      <span className="text-blue-500">{activePasses.length}</span> Student{activePasses.length !== 1 ? 's' : ''} in the Hallway
                    </p>
                  </div>

                  {activePasses.length === 0 ? (
                    <GlassCard className="py-12 text-center text-slate-500 font-bold bg-slate-900/40 border-white/5 shadow-inner">
                      No students in hallways
                    </GlassCard>
                  ) : (
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-2">
                      {activePasses.map(pass => (
                        <div key={pass.id} className="contents">
                          <GlassCard className="relative overflow-hidden group hover:border-blue-500/50 transition-all duration-300 bg-slate-900/40">
                            <div className="absolute top-0 left-0 w-1.5 h-full bg-blue-600 shadow-[2px_0_10px_rgba(37,99,235,0.4)]" />
                            <div className="p-4 pl-6">
                              <div className="flex items-start justify-between">
                                <div className="space-y-1">
                                  <p className="font-black text-white text-lg tracking-tight leading-none mb-2">{pass.student_name}</p>
                                  <div className="flex flex-col gap-1.5">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-1.5">
                                      <Building2 className="h-3 w-3" /> From: {pass.from_class}
                                    </p>
                                    <div className="flex items-center gap-2">
                                      <span className="text-sm font-black text-blue-400">To: {pass.destination}</span>
                                      <span className="text-[10px] font-black uppercase tracking-widest bg-blue-900/30 text-blue-300 px-2 py-0.5 rounded-full border border-blue-500/20">
                                        {pass.status.replace('_', ' ')}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                                <div className="text-right">
                                  {pass.approved_at && (
                                    <div className="bg-slate-950/50 rounded-xl p-2.5 border border-white/5 shadow-xl">
                                      <ElapsedTimer startTime={pass.approved_at} destination={pass.destination} />
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </GlassCard>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="schedule" className="space-y-6 outline-none border-none p-0">
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    {/* Left Column: Calendar & Controls */}
                    <div className="lg:col-span-8 space-y-6">
                      <GlassCard className="border-2 border-white/10 shadow-2xl overflow-hidden p-0 bg-slate-900/60">
                        <div className="p-6 border-b border-white/10 bg-white/5 flex items-center justify-between">
                          <h3 className="text-xl font-black tracking-tight text-white flex items-center gap-2">
                            <Calendar className="h-5 w-5 text-blue-500" />
                            School Schedule
                          </h3>
                        </div>
                        <div className="p-6 flex flex-col items-center">
                          {/* Custom Navigation for Month */}
                          <div className="flex items-center justify-between w-full max-w-3xl mb-8 px-4">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1))}
                              className="w-10 h-10 rounded-xl hover:bg-white/10 text-slate-400 hover:text-white transition-all"
                            >
                              <ChevronLeft className="h-6 w-6" />
                            </Button>
                            <h3 className="text-2xl font-black tracking-tight text-white">{format(currentMonth, 'MMMM yyyy')}</h3>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1))}
                              className="w-10 h-10 rounded-xl hover:bg-white/10 text-slate-400 hover:text-white transition-all"
                            >
                              <ChevronRight className="h-6 w-6" />
                            </Button>
                          </div>

                          {selectedDates.length > 0 && (
                            <div className="w-full max-w-3xl mb-8 p-6 bg-blue-600/20 rounded-2xl border-2 border-blue-500/30 flex flex-wrap items-center gap-4 animate-in fade-in slide-in-from-top-4 backdrop-blur-md">
                              <span className="font-black text-blue-400 flex items-center gap-2 text-sm uppercase tracking-widest">
                                <Check className="h-4 w-4" /> {selectedDates.length} days selected
                              </span>
                              <div className="flex-1 flex gap-3 min-w-[300px]">
                                <Select value={bulkScheduleId} onValueChange={setBulkScheduleId}>
                                  <SelectTrigger className="bg-slate-950 border-white/10 text-white font-bold h-11 rounded-xl">
                                    <SelectValue placeholder="Assign Schedule..." />
                                  </SelectTrigger>
                                  <SelectContent className="bg-slate-900 border-white/10 text-white rounded-xl">
                                    {schedules.map(s => (
                                      <SelectItem key={s.id} value={s.id} className="focus:bg-blue-600 focus:text-white font-bold py-2.5">
                                        <div className="flex items-center gap-2">
                                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: s.color || '#6B7280' }} />
                                          {s.name}
                                        </div>
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <Button onClick={handleBulkAssign} disabled={!bulkScheduleId} className="bg-blue-600 hover:bg-blue-700 text-white font-black px-6 h-11 rounded-xl shadow-lg shadow-blue-600/20">
                                  Apply
                                </Button>
                                <Button variant="ghost" onClick={() => setSelectedDates([])} className="text-slate-400 hover:text-white font-bold px-4 h-11 rounded-xl">
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
                      </GlassCard>
                    </div>

                    {/* Right Column: Legend & Tools */}
                    <div className="lg:col-span-4 space-y-6">
                      <GlassCard className="bg-slate-900/60 border-2 border-white/10 shadow-xl overflow-hidden p-0">
                        <div className="p-4 border-b border-white/10 bg-white/5">
                          <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Schedule Types</h3>
                        </div>
                        <div className="p-4 space-y-3">
                          {schedules.map(s => (
                            <div key={s.id} className="flex items-center justify-between group p-3 rounded-2xl hover:bg-white/10 transition-all border border-transparent hover:border-white/5">
                              <div className="flex items-center gap-3">
                                <div className="w-4 h-4 rounded-full shadow-[0_0_10px_rgba(255,255,255,0.2)]" style={{ backgroundColor: s.color || '#6B7280' }} />
                                <span className="font-black text-sm text-white">{s.name}</span>
                              </div>
                              <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                                <Button size="icon" variant="ghost" className="h-8 w-8 rounded-lg hover:bg-blue-600/20 text-blue-400" onClick={() => openEditSchedule(s)}><Edit className="h-4 w-4" /></Button>
                                <Button size="icon" variant="ghost" className="h-8 w-8 rounded-lg hover:bg-red-600/20 text-red-400" onClick={() => handleDeleteSchedule(s.id)}><Trash2 className="h-4 w-4" /></Button>
                              </div>
                            </div>
                          ))}
                          <Button variant="outline" className="w-full border-2 border-dashed border-white/10 bg-transparent hover:bg-white/5 hover:border-blue-500/30 text-slate-400 hover:text-white font-black h-12 rounded-2xl transition-all" onClick={openNewSchedule}>
                            <Plus className="h-4 w-4 mr-2" /> Create New Schedule
                          </Button>
                        </div>
                      </GlassCard>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="settings" className="space-y-6 outline-none border-none p-0">
                  <GlassCard className="bg-slate-900/60 border-2 border-white/10 shadow-xl overflow-hidden p-0">
                    <div className="p-4 border-b border-white/10 bg-white/5 bg-gradient-to-r from-blue-600/10 to-transparent">
                      <h3 className="text-xl font-black tracking-tight text-white flex items-center gap-2">
                        <UserCheck className="h-5 w-5 text-blue-500" />
                        Staff Approvals
                      </h3>
                    </div>
                    <div className="p-6">
                      {pendingUsers.length === 0 ? (
                        <div className="py-8 text-center bg-slate-950/30 rounded-2xl border border-white/5">
                          <p className="text-slate-500 font-bold">No pending staff registrations</p>
                        </div>
                      ) : (
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                          {pendingUsers.map(u => (
                            <div key={u.id} className="contents">
                              <GlassCard className="bg-slate-950/50 border-white/10 hover:border-blue-500/50 transition-all p-4">
                                <div className="flex flex-col h-full justify-between gap-4">
                                  <div>
                                    <p className="font-black text-white text-lg leading-tight mb-1">{u.full_name}</p>
                                    <p className="text-xs text-slate-400 font-medium truncate mb-2">{u.email}</p>
                                    <span className="text-[10px] font-black uppercase tracking-widest bg-blue-600/20 text-blue-400 px-2 py-0.5 rounded-full border border-blue-500/20">
                                      {u.role}
                                    </span>
                                  </div>
                                  <div className="flex gap-2 pt-2 border-t border-white/5">
                                    <Button size="sm" onClick={() => handleApproveUser(u.id)} className="flex-1 bg-green-600 hover:bg-green-700 text-white font-black rounded-xl border-none">Approve</Button>
                                    <Button size="sm" variant="ghost" onClick={() => handleDenyUser(u.id)} className="px-3 hover:bg-red-600/20 text-red-500 rounded-xl">Deny</Button>
                                  </div>
                                </div>
                              </GlassCard>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </GlassCard>

                  {requireDeletionApproval && (
                    <DeletionRequestsList />
                  )}

                  <GlassCard className="bg-slate-900/60 border-2 border-white/10 shadow-xl overflow-hidden p-0">
                    <div className="p-4 border-b border-white/10 bg-white/5 bg-gradient-to-r from-blue-600/10 to-transparent">
                      <h3 className="text-xl font-black tracking-tight text-white flex items-center gap-2">
                        <Settings className="h-5 w-5 text-blue-500" />
                        Organization Settings
                      </h3>
                    </div>
                    <div className="p-6 space-y-8">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                        <div className="space-y-3">
                          <Label className="text-xs font-black uppercase tracking-widest text-slate-400">Weekly Restroom Quota</Label>
                          <Input type="number" min={1} max={50} value={weeklyQuota} onChange={(e) => setWeeklyQuota(parseInt(e.target.value) || 4)} className="bg-white/5 border-white/10 text-white font-bold h-12 rounded-xl focus:border-blue-500" />
                          <p className="text-[10px] text-slate-500 font-extrabold uppercase tracking-wide">Passes allowed per student per week</p>
                        </div>
                        <div className="space-y-3">
                          <Label className="text-xs font-black uppercase tracking-widest text-slate-400">Default Periods per Day</Label>
                          <Input type="number" min={1} max={12} value={defaultPeriodCount} onChange={(e) => setDefaultPeriodCount(parseInt(e.target.value) || 7)} className="bg-white/5 border-white/10 text-white font-bold h-12 rounded-xl focus:border-blue-500" />
                        </div>
                      </div>

                      <div className="space-y-4">
                        <Label className="text-xs font-black uppercase tracking-widest text-slate-400">Expected Return Times (minutes)</Label>
                        <div className="grid grid-cols-3 gap-6">
                          <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Restroom</Label>
                            <Input type="number" min={1} value={bathroomExpectedMinutes} onChange={(e) => setBathroomExpectedMinutes(parseInt(e.target.value) || 5)} className="bg-white/5 border-white/10 text-white font-bold h-11 rounded-xl" />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Locker</Label>
                            <Input type="number" min={1} value={lockerExpectedMinutes} onChange={(e) => setLockerExpectedMinutes(parseInt(e.target.value) || 3)} className="bg-white/5 border-white/10 text-white font-bold h-11 rounded-xl" />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Office</Label>
                            <Input type="number" min={1} value={officeExpectedMinutes} onChange={(e) => setOfficeExpectedMinutes(parseInt(e.target.value) || 10)} className="bg-white/5 border-white/10 text-white font-bold h-11 rounded-xl" />
                          </div>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                        <div className="space-y-3">
                          <Label className="text-xs font-black uppercase tracking-widest text-slate-400">Semester End Date</Label>
                          <Input
                            type="date"
                            value={semesterEndDate}
                            onChange={(e) => setSemesterEndDate(e.target.value)}
                            className="bg-white/5 border-white/10 text-white font-bold h-12 rounded-xl focus:border-blue-500 [color-scheme:dark]"
                          />
                          <p className="text-[10px] text-slate-500 font-extrabold uppercase tracking-wide">On this date, pass history and class enrollments will be wiped.</p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between p-5 rounded-2xl bg-white/5 border border-white/10 transition-all hover:bg-white/10">
                        <div>
                          <Label className="font-black text-white">Require Deletion Approval</Label>
                          <p className="text-[10px] text-slate-500 font-extrabold uppercase tracking-wide">Ohio SB 29 compliance mode</p>
                        </div>
                        <Switch
                          checked={requireDeletionApproval}
                          onCheckedChange={(val) => {
                            console.log(`🔄 Toggling deletion approval setting to: ${val}`);
                            setRequireDeletionApproval(val);
                          }}
                          className="data-[state=checked]:bg-blue-600"
                        />
                      </div>

                      <Button onClick={handleSaveSettings} className="w-full font-black h-12 rounded-2xl bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-600/20 text-white mt-4 border-none">Save Organization Settings</Button>
                    </div>
                  </GlassCard>
                </TabsContent>
              </Tabs>
            </div>
          </StaggerItem>
        </StaggerContainer>
      </div>

      <AnimatePresence>
        {scheduleDialogOpen && (
          <Dialog
            open={scheduleDialogOpen}
            onOpenChange={(open) => {
              if (!open) resetScheduleForm();
              setScheduleDialogOpen(open);
            }}
          >
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-slate-900/95 border-white/10 text-white rounded-[2rem] shadow-2xl backdrop-blur-xl">
              <DialogHeader className="pb-4 border-b border-white/5">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-2xl bg-blue-500/10 border border-blue-500/20">
                    <Calendar className="w-5 h-5 text-blue-400" />
                  </div>
                  <div>
                    <DialogTitle className="text-2xl font-black tracking-tighter text-white">{editingSchedule ? 'Edit Bell Schedule' : 'Create New Schedule'}</DialogTitle>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">Configure timings and passing periods</p>
                  </div>
                </div>
              </DialogHeader>

              <div className="space-y-8 py-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-5 rounded-2xl bg-white/5 border border-white/10 shadow-inner">
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Schedule Name</Label>
                    <Input
                      value={newScheduleName}
                      onChange={(e) => setNewScheduleName(e.target.value)}
                      placeholder="e.g., Regular, Advisory, Assembly"
                      className="h-12 bg-slate-900/50 border-white/10 text-white placeholder:text-slate-600 font-bold rounded-xl focus:border-blue-500/50"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Color Identifier</Label>
                    <div className="flex items-center gap-3 h-12 px-1">
                      {SCHEDULE_COLORS.map(c => (
                        <button
                          key={c.value}
                          className={`w-7 h-7 rounded-full border-2 transition-all duration-300 ${newScheduleColor === c.value ? 'border-white scale-110 shadow-lg' : 'border-transparent'}`}
                          style={{ backgroundColor: c.value, boxShadow: newScheduleColor === c.value ? `0 0 15px ${c.value}40` : 'none' }}
                          onClick={() => setNewScheduleColor(c.value)}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between p-5 rounded-2xl bg-white/5 border border-white/10 transition-all hover:bg-white/10 group cursor-pointer" onClick={() => setNewScheduleIsSchoolDay(!newScheduleIsSchoolDay)}>
                  <div className="flex items-center gap-4">
                    <div className={`p-2 rounded-xl transition-colors ${newScheduleIsSchoolDay ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                      <Calendar className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-black text-white text-sm">Active School Day</p>
                      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Students can request passes on this day</p>
                    </div>
                  </div>
                  <Switch
                    checked={newScheduleIsSchoolDay}
                    onCheckedChange={setNewScheduleIsSchoolDay}
                    className="data-[state=checked]:bg-blue-600"
                  />
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between px-1">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Period Timings</Label>
                    <span className="text-[10px] font-black text-blue-500 uppercase tracking-widest">Auto-indexed</span>
                  </div>
                  <InlinePeriodTable
                    periods={periods}
                    onChange={(updated) => {
                      console.log("💾 Period table updated in memory.");
                      setPeriods(updated);
                    }}
                  />
                </div>
              </div>

              <DialogFooter className="pt-2 border-t border-white/5 mt-4">
                <div className="flex gap-3 w-full">
                  <Button
                    variant="outline"
                    onClick={() => setScheduleDialogOpen(false)}
                    className="flex-1 h-14 bg-white/5 border-white/10 text-slate-400 hover:text-white hover:bg-white/10 font-black rounded-2xl transition-all"
                  >
                    CANCEL
                  </Button>
                  <Button
                    onClick={handleSaveSchedule}
                    className="flex-[2] h-14 bg-blue-600 hover:bg-blue-500 text-white font-black rounded-2xl shadow-xl shadow-blue-600/20 transition-all border-none"
                  >
                    SAVE SCHEDULE
                  </Button>
                </div>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </AnimatePresence>

      <SubManagementDialog
        open={subDialogOpen}
        onOpenChange={setSubDialogOpen}
        date={subDialogDate}
        organizationId={organizationId || null}
      />
    </PageTransition >
  );
};

export default AdminDashboard;

