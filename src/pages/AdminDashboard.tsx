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
import { LogOut, Check, X, Calendar, Clock, Plus, Trash2, Users, Edit, Settings, UserCheck, Building2, ChevronLeft, ChevronRight, UserPlus, Archive, ArchiveRestore } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { GlassCard } from '@/components/ui/glass-card';
import { PageTransition, StaggerContainer, StaggerItem } from '@/components/ui/page-transition';

// Modular Page Components
import { AdminSidebar, type AdminPage } from '@/components/admin/AdminSidebar';
import { AdminHallway } from '@/components/admin/AdminHallway';
import { AdminSchedule } from '@/components/admin/AdminSchedule';
import { AdminSettings } from '@/components/admin/AdminSettings';
import { AdminStudents } from '@/components/admin/AdminStudents';
import { AdminTeachers } from '@/components/admin/AdminTeachers';
import { AdminAnalytics } from '@/components/admin/AdminAnalytics';
import { AdminLogs } from '@/components/admin/AdminLogs';

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
  is_archived: boolean;
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
  const [showArchivedSchedules, setShowArchivedSchedules] = useState(false);
  const [activeTab, setActiveTab] = useState<AdminPage>('hallway');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);


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
      setSchedules((data as any[]).map(s => ({
        ...s,
        is_archived: !!s.is_archived
      })));
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
    }
  };

  const handleToggleArchive = async (schedule: Schedule) => {
    const { error } = await supabase
      .from('schedules')
      .update({ is_archived: !schedule.is_archived } as any)
      .eq('id', schedule.id);

    if (error) {
      toast({ title: 'Error', description: 'Failed to update schedule status.', variant: 'destructive' });
    } else {
      toast({
        title: schedule.is_archived ? 'Schedule Restored' : 'Schedule Archived',
        description: schedule.is_archived ? `${schedule.name} is now active.` : `${schedule.name} has been moved to archives.`
      });
      fetchSchedules();
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
    <div className="min-h-screen bg-slate-950 flex overflow-hidden">
      {/* Sidebar Navigation */}
      <AdminSidebar
        currentPage={activeTab}
        onPageChange={setActiveTab}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        orgName={organization?.name || 'No Organization'}
        onSignOut={signOut}
      />

      {/* Main Content Area */}
      <main className="flex-1 h-screen overflow-y-auto relative custom-scrollbar">
        {/* Background Gradients */}
        <div className="fixed inset-0 overflow-hidden pointer-events-none">
          <motion.div
            className="absolute -top-1/4 -right-1/4 w-[80%] h-[80%] rounded-full bg-blue-600/10 blur-[120px]"
            animate={{ x: [0, 30, 0], y: [0, -20, 0] }}
            transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
          />
          <motion.div
            className="absolute -bottom-1/4 -left-1/4 w-[70%] h-[70%] rounded-full bg-blue-400/5 blur-[100px]"
            animate={{ x: [0, -30, 0], y: [0, 20, 0] }}
            transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
          />
        </div>

        <div className="max-w-7xl mx-auto p-8 relative z-10">
          <PageTransition key={activeTab}>
            {activeTab === 'hallway' && (
              <AdminHallway activePasses={activePasses} />
            )}

            {activeTab === 'schedule' && (
              <AdminSchedule
                currentMonth={currentMonth}
                setCurrentMonth={setCurrentMonth}
                daysInMonth={daysInMonth}
                schedules={schedules}
                scheduleAssignments={scheduleAssignments}
                selectedDates={selectedDates}
                setSelectedDates={setSelectedDates}
                bulkScheduleId={bulkScheduleId}
                setBulkScheduleId={setBulkScheduleId}
                handleBulkAssign={handleBulkAssign}
                toggleDateSelection={toggleDateSelection}
                openNewSchedule={openNewSchedule}
                openEditSchedule={openEditSchedule}
                handleDeleteSchedule={handleDeleteSchedule}
                handleToggleArchive={handleToggleArchive}
                showArchivedSchedules={showArchivedSchedules}
                setShowArchivedSchedules={setShowArchivedSchedules}
                setSubDialogDate={setSubDialogDate}
                setSubDialogOpen={setSubDialogOpen}
              />
            )}

            {activeTab === 'students' && <AdminStudents />}
            {activeTab === 'teachers' && <AdminTeachers />}
            {activeTab === 'analytics' && <AdminAnalytics />}
            {activeTab === 'logs' && <AdminLogs />}

            {activeTab === 'settings' && (
              <AdminSettings
                pendingUsers={pendingUsers}
                handleApproveUser={handleApproveUser}
                handleDenyUser={handleDenyUser}
                requireDeletionApproval={requireDeletionApproval}
                setRequireDeletionApproval={setRequireDeletionApproval}
                weeklyQuota={weeklyQuota}
                setWeeklyQuota={setWeeklyQuota}
                defaultPeriodCount={defaultPeriodCount}
                setDefaultPeriodCount={setDefaultPeriodCount}
                bathroomExpectedMinutes={bathroomExpectedMinutes}
                setBathroomExpectedMinutes={setBathroomExpectedMinutes}
                lockerExpectedMinutes={lockerExpectedMinutes}
                setLockerExpectedMinutes={setLockerExpectedMinutes}
                officeExpectedMinutes={officeExpectedMinutes}
                setOfficeExpectedMinutes={setOfficeExpectedMinutes}
                semesterEndDate={semesterEndDate}
                setSemesterEndDate={setSemesterEndDate}
                handleSaveSettings={handleSaveSettings}
              />
            )}
          </PageTransition>
        </div>
      </main>

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
    </div>
  );
};

export default AdminDashboard;

