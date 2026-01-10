import { useState, useEffect, useCallback } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { isPast } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { PeriodDisplay } from '@/components/PeriodDisplay';
import { QuotaDisplay } from '@/components/QuotaDisplay';
import { useCurrentPeriod } from '@/hooks/useCurrentPeriod';
import { useWeeklyQuota } from '@/hooks/useWeeklyQuota';
import { PassHistory } from '@/components/PassHistory';
import { ElapsedTimer } from '@/components/ElapsedTimer';
import { FreezeIndicator } from '@/components/student/FreezeIndicator';
import { QueuePosition } from '@/components/student/QueuePosition';
import { ExpectedReturnTimer } from '@/components/student/ExpectedReturnTimer';

import { GlassCard } from '@/components/ui/glass-card';
import { GlowButton } from '@/components/ui/glow-button';
import { JoinClassDialog } from '@/components/student/JoinClassDialog';
import { PageTransition, FadeIn, StaggerContainer, StaggerItem } from '@/components/ui/page-transition';
import { FloatingElement } from '@/components/ui/floating-element';
import { StatusBadge } from '@/components/ui/status-badge';
import { LogOut, Clock, MapPin, Settings as SettingsIcon, Loader2, ArrowLeft, DoorOpen, KeyRound, Building2, MoreHorizontal, Snowflake, X, Plus } from 'lucide-react';

const DESTINATIONS = [
  { id: 'Restroom', icon: DoorOpen, label: 'Restroom' },
  { id: 'Locker', icon: KeyRound, label: 'Locker' },
  { id: 'Office', icon: Building2, label: 'Office' },
  { id: 'Other', icon: MoreHorizontal, label: 'Other' },
];

const MiniSnowflakes = () => {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {/* 1. The Frost Tint: Optimized for dark theme */}
      <div className="absolute inset-0 bg-blue-500/20 backdrop-blur-[2px]" />

      {/* 2. Higher Contrast Snowflakes */}
      <div className="absolute inset-0 p-1">
        {/* Top Snowflake */}
        <motion.div
          className="absolute top-1 right-1"
          animate={{ rotate: 360 }}
          transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
        >
          <Snowflake size={14} className="text-blue-200 fill-blue-300/30" />
        </motion.div>

        {/* Bottom Snowflake */}
        <motion.div
          className="absolute bottom-1 left-1"
          animate={{ rotate: -360 }}
          transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
        >
          <Snowflake size={12} className="text-blue-300" />
        </motion.div>
      </div>

      {/* 3. Frost Border Effect */}
      <div className="absolute inset-0 border border-blue-400/30 rounded-xl" />
    </div>
  );
};

const StudentDashboard = () => {
  const { user, role, signOut, loading: authLoading } = useAuth();
  const { organization } = useOrganization();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { currentPeriod } = useCurrentPeriod();
  const { refresh: refreshQuota } = useWeeklyQuota();

  const [enrolledClasses, setEnrolledClasses] = useState<any[]>([]);
  const [activePass, setActivePass] = useState<any | null>(null);
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [selectedDestination, setSelectedDestination] = useState<string>('');
  const [customDestination, setCustomDestination] = useState<string>('');
  const [requestLoading, setRequestLoading] = useState(false);
  const [activeFreeze, setActiveFreeze] = useState<{ freeze_type: string; ends_at?: string | null } | null>(null);
  const [joinDialogOpen, setJoinDialogOpen] = useState(false);

  const fetchEnrolledClasses = useCallback(async () => {
    if (!user?.id) return;
    console.log('[StudentDashboard] Fetching enrolled classes');
    const { data: enrollments } = await supabase
      .from('class_enrollments')
      .select('class_id')
      .eq('student_id', user.id);

    if (!enrollments?.length) {
      console.log('[StudentDashboard] No enrollments found');
      setEnrolledClasses([]);
      return;
    }

    const { data: classesData } = await supabase
      .from('classes')
      .select('id, name, period_order, teacher_id')
      .in('id', enrollments.map(e => e.class_id))
      .order('period_order');

    if (!classesData) {
      console.log('[StudentDashboard] Error or no classes data found for enrollments');
      return;
    }

    const teacherIds = [...new Set(classesData.map(c => c.teacher_id))];
    const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', teacherIds);
    const teacherMap = Object.fromEntries(profiles?.map(p => [p.id, p.full_name]) || []);

    console.log(`[StudentDashboard] Loaded ${classesData.length} classes`);
    setEnrolledClasses(classesData.map(c => ({
      ...c,
      teacher_name: teacherMap[c.teacher_id] ?? 'Unknown'
    })));
  }, [user?.id]);

  const fetchActivePass = useCallback(async () => {
    if (!user?.id) return;
    console.log('[StudentDashboard] Fetching active pass');
    const { data } = await supabase
      .from('passes')
      .select(`id, destination, status, requested_at, approved_at, expected_return_at, class_id`)
      .eq('student_id', user.id)
      .in('status', ['pending', 'approved', 'pending_return'])
      .order('requested_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data) {
      console.log('[StudentDashboard] Found active pass:', data.id, data.status);
      const { data: classData } = await supabase.from('classes').select('name, is_queue_autonomous').eq('id', data.class_id).maybeSingle();
      setActivePass({ ...data, class_name: classData?.name ?? 'Unknown', is_queue_autonomous: classData?.is_queue_autonomous });
      // Also fetch freeze status for this active class to show potential freezes
      fetchActiveFreeze(data.class_id);
    } else {
      console.log('[StudentDashboard] No active pass found');
      setActivePass(null);
    }
  }, [user?.id]);



  const fetchActiveFreeze = useCallback(async (id: string) => {
    if (!id) return;
    console.log(`[StudentDashboard] Fetching freeze status for class ${id}`);
    const { data } = await supabase.from('pass_freezes').select('freeze_type, ends_at').eq('class_id', id).eq('is_active', true).maybeSingle();
    console.log(`[StudentDashboard] Freeze status for ${id}:`, data);
    setActiveFreeze(data ? { freeze_type: data.freeze_type, ends_at: data.ends_at } : null);
  }, []);

  useEffect(() => {
    fetchEnrolledClasses();
    fetchActivePass();
  }, [fetchEnrolledClasses, fetchActivePass]);

  useEffect(() => {
    if (!user?.id || !activePass) return;

    // We only subscribe if we have an active pass
    const channelName = `student-pass-${user.id}`;
    console.log(`[StudentDashboard] Subscribing to: ${channelName} (Active Pass: ${activePass.id})`);

    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'passes', filter: `student_id=eq.${user.id}` },
        (payload) => {
          console.log('[StudentDashboard] Pass update:', payload);
          const newPass = payload.new as any;

          // Use payload data directly instead of refetching
          if (['returned', 'completed', 'denied', 'cancelled'].includes(newPass.status)) {
            // Pass ended - clear and refresh quota
            setActivePass(null);
            refreshQuota();
          } else if (newPass.id === activePass?.id) {
            // Update existing pass with new data from payload
            setActivePass((prev: any) => prev ? {
              ...prev,
              status: newPass.status,
              approved_at: newPass.approved_at,
              expected_return_at: newPass.expected_return_at
            } : null);
          }
        })
      .subscribe((status) => {
        console.log(`[StudentDashboard] Channel ${channelName} status: ${status}`);
      });

    return () => {
      console.log(`[StudentDashboard] Unsubscribing from: ${channelName}`);
      supabase.removeChannel(channel);
    };
  }, [user?.id, activePass?.id, fetchActivePass, refreshQuota]);

  useEffect(() => {
    if (!selectedClassId) return;
    fetchActiveFreeze(selectedClassId);

    const channelName = `freeze-check-${selectedClassId}`;
    console.log(`[StudentDashboard] Subscribing to freeze channel: ${channelName}`);

    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pass_freezes', filter: `class_id=eq.${selectedClassId}` },
        (payload) => {
          console.log('[StudentDashboard] Freeze INSERT:', payload);
          fetchActiveFreeze(selectedClassId);
        })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'pass_freezes', filter: `class_id=eq.${selectedClassId}` },
        (payload) => {
          console.log('[StudentDashboard] Freeze UPDATE:', payload);
          fetchActiveFreeze(selectedClassId);
        })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'pass_freezes', filter: `class_id=eq.${selectedClassId}` },
        (payload) => {
          console.log('[StudentDashboard] Freeze DELETE:', payload);
          fetchActiveFreeze(selectedClassId);
        })
      .subscribe((status) => {
        console.log(`[StudentDashboard] Freeze channel status: ${status}`);
      });
    return () => {
      console.log(`[StudentDashboard] Unsubscribing from freeze channel`);
      supabase.removeChannel(channel);
    };
  }, [selectedClassId, fetchActiveFreeze]);

  useEffect(() => {
    if (currentPeriod && enrolledClasses.length > 0) {
      const match = enrolledClasses.find(c => c.period_order === currentPeriod.period_order);
      if (match && !selectedClassId) {
        setSelectedClassId(match.id);
      }
    }
  }, [currentPeriod, enrolledClasses, selectedClassId]);

  const handleRequest = async () => {
    if (!user?.id || !selectedClassId || !selectedDestination) return;
    const finalDestination = selectedDestination === 'Other' ? customDestination : selectedDestination;
    if (!finalDestination) return;

    const { error } = await supabase.from('passes').insert({
      student_id: user.id,
      class_id: selectedClassId,
      destination: finalDestination
    });

    if (error) {
      console.error("[StudentDashboard] Error requesting pass:", error);
    } else {
      console.log(`[StudentDashboard] Pass requested to ${selectedDestination}`);
    }

    setRequestLoading(false);
    fetchActivePass();
  };

  const handleCheckIn = async () => {
    if (!activePass) return;

    // Optimistic update - clear UI immediately
    const previousPass = activePass;
    setActivePass(null);

    const { error } = await supabase.rpc('student_check_in', { p_pass_id: previousPass.id });

    if (error) {
      // Rollback on error
      setActivePass(previousPass);
      console.error("[StudentDashboard] Error checking in:", error);
      toast({ title: "Error checking in", description: error.message, variant: "destructive" });
    } else {
      console.log(`[StudentDashboard] Student checked in pass ${previousPass.id}`);
      toast({ title: "Checked in successfully!" });
      refreshQuota();
    }
  };

  const handleCancelRequest = async () => {
    if (!activePass || !user?.id) return;

    // Optimistic update - clear UI immediately
    const previousPass = activePass;
    setActivePass(null);

    const { error } = await supabase
      .from('passes')
      .update({
        status: 'cancelled',
        denied_at: new Date().toISOString(),
        denied_by: user.id
      })
      .eq('id', previousPass.id)
      .eq('status', 'pending');

    if (error) {
      // Rollback on error
      setActivePass(previousPass);
      console.error("[StudentDashboard] Error cancelling request:", error);
      toast({ title: 'Error cancelling request', variant: 'destructive' });
    } else {
      console.log(`[StudentDashboard] Pending request ${previousPass.id} cancelled`);
      toast({ title: 'Request Cancelled' });
    }
  };

  if (authLoading) {
    return (
      <div className="h-screen w-full flex bg-slate-950 items-center justify-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          className="relative z-10"
        >
          <Loader2 className="w-8 h-8 text-blue-500 shadow-glow" />
        </motion.div>
      </div>
    );
  }

  if (!user || role !== 'student') return <Navigate to="/auth" replace />;

  const isDestinationDisabled = (dest: string) => {
    if (!activeFreeze) return false;
    if (activeFreeze.freeze_type === 'all') return true;
    if (activeFreeze.freeze_type === 'bathroom' && dest === 'Restroom') return true;
    return false;
  };

  return (
    <PageTransition className="min-h-screen bg-slate-950 text-slate-100 selection:bg-blue-500/30 overflow-x-hidden">
      {/* Visual Background (Sync with Auth.tsx - Pro Blue) */}
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

      <div className="relative z-10 p-4 max-w-2xl mx-auto pb-24">
        {/* Header */}
        <FadeIn>
          <header className="flex items-center justify-between mb-10 pt-4">
            <div className="flex items-center gap-4">
              <motion.div
                className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center shadow-2xl shadow-blue-500/40 border-2 border-white/20"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <img src="/logo.png" alt="Logo" className="w-10 h-10 object-contain" />
              </motion.div>
              <div>
                <h1 className="text-3xl font-black tracking-tighter text-white leading-none mb-1">ClassPass <span className="text-blue-500">Pro</span></h1>
                <p className="text-sm text-slate-300 font-extrabold tracking-wide">{organization?.name}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                className="h-11 rounded-2xl bg-blue-600/10 border border-blue-500/20 text-blue-400 font-bold px-4 hover:bg-blue-600/20"
                onClick={() => setJoinDialogOpen(true)}
              >
                <Plus className="w-5 h-5 mr-2" />
                Join Class
              </Button>
              <Button variant="ghost" size="icon" className="w-11 h-11 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/15 text-white shadow-sm" onClick={() => navigate('/settings')}>
                <SettingsIcon className="h-5 w-5" />
              </Button>
              <Button variant="ghost" size="icon" className="w-11 h-11 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/15 text-white shadow-sm" onClick={signOut}>
                <LogOut className="h-5 w-5" />
              </Button>
            </div>
          </header>
        </FadeIn>

        <StaggerContainer className="grid gap-6">
          {/* Period & Quota Row */}
          <StaggerItem>
            <div className="grid grid-cols-2 gap-4">
              <GlassCard className="p-6 bg-slate-900/60 border-2 border-white/10 shadow-xl">
                <PeriodDisplay />
              </GlassCard>
              <GlassCard className="p-6 bg-slate-900/60 border-2 border-white/10 shadow-xl">
                <QuotaDisplay />
              </GlassCard>
            </div>
          </StaggerItem>

          {/* Freeze Indicator */}
          <StaggerItem>
            {selectedClassId && <FreezeIndicator classId={selectedClassId} />}
          </StaggerItem>

          {/* Main Content */}
          <StaggerItem>
            <AnimatePresence mode="wait">
              {activePass ? (
                <motion.div
                  key="active-pass"
                  initial={{ opacity: 0, scale: 0.95, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -20 }}
                  transition={{ duration: 0.3 }}
                >
                  <FloatingElement distance={5} duration={4}>
                    <GlassCard
                      glow
                      glowColor="primary"
                      className="relative overflow-hidden border-[3px] border-blue-600/50 bg-slate-900/40"
                    >
                      {/* Animated gradient background */}
                      <div className="absolute inset-0 bg-gradient-to-br from-blue-600/20 via-transparent to-blue-600/30 animate-pulse" />

                      <div className="relative space-y-6">
                        {/* Header */}
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-blue-400 mb-2">
                              Live Pass
                            </p>
                            <h2 className="text-5xl font-black tracking-tight text-white drop-shadow-sm">{activePass.destination}</h2>
                            <p className="text-base text-slate-200 font-black mt-2 flex items-center gap-2">
                              <span className="text-blue-500">at</span> {activePass.class_name}
                            </p>
                          </div>
                          <StatusBadge
                            status={activePass.status === 'pending' ? 'pending' : 'active'}
                            pulse
                            className={activePass.status === 'approved' ? 'bg-blue-600 border-2 border-white/30 text-white shadow-[0_0_20px_rgba(37,99,235,0.6)] px-4 py-1.5' : ''}
                          />
                        </div>

                        {/* Timer */}
                        {activePass.status === 'approved' && activePass.approved_at && (
                          <div className="p-5 rounded-2xl bg-white/10 border-2 border-white/10 backdrop-blur-md shadow-inner">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className="p-2 rounded-xl bg-blue-600/20">
                                  <Clock className="w-6 h-6 text-blue-400" />
                                </div>
                                <span className="text-sm font-black text-white uppercase tracking-[0.2em]">Time Out</span>
                              </div>
                              <ElapsedTimer startTime={activePass.approved_at} destination={activePass.destination} />
                            </div>
                          </div>
                        )}

                        {/* Queue Position */}
                        {activePass.status === 'pending' && (
                          <QueuePosition classId={activePass.class_id} passId={activePass.id} />
                        )}

                        {/* Cancel Button for Pending */}
                        {activePass.status === 'pending' && (
                          <GlowButton
                            variant="destructive"
                            size="md"
                            className="w-full bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20"
                            onClick={handleCancelRequest}
                          >
                            <X className="w-4 h-4 mr-2" />
                            Cancel Request
                          </GlowButton>
                        )}

                        {/* Expected Return */}
                        {activePass.status === 'approved' && (
                          <ExpectedReturnTimer expectedReturnAt={activePass.expected_return_at} />
                        )}

                        {/* Check In Button */}
                        {activePass.status === 'approved' && (
                          <GlowButton
                            variant="primary"
                            size="lg"
                            className="w-full h-16 text-xl font-black bg-blue-600 hover:bg-blue-500 text-white shadow-2xl shadow-blue-600/40 border-2 border-white/30 rounded-2xl transition-all hover:scale-[1.02] active:scale-[0.98]"
                            onClick={handleCheckIn}
                          >
                            <ArrowLeft className="w-6 h-6 mr-3" />
                            Check Back In
                          </GlowButton>
                        )}
                      </div>
                    </GlassCard>
                  </FloatingElement>
                </motion.div>
              ) : (
                <motion.div
                  key="request-form"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.3 }}
                >
                  <GlassCard hover3D className="space-y-8 border-2 border-white/10 bg-slate-900/60 shadow-xl">
                    <div className="border-b border-white/10 pb-4">
                      <h2 className="text-2xl font-black text-white tracking-tighter">Request Pass</h2>
                      <p className="text-sm text-slate-300 font-bold tracking-wide">Ready to go? Select your options below.</p>
                    </div>

                    {/* Class Selection */}
                    <div className="space-y-3">
                      <Label className="text-xs font-black uppercase tracking-[0.2em] text-blue-400">
                        Select Class
                      </Label>
                      <Select value={selectedClassId} onValueChange={setSelectedClassId}>
                        <SelectTrigger className="h-16 rounded-2xl text-lg font-black bg-white/10 border-2 border-white/20 text-white focus:ring-blue-500 transition-all hover:bg-white/20">
                          <SelectValue placeholder="Which class are you in?" />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-900 border-2 border-white/20 text-white p-2">
                          {enrolledClasses.map(c => (
                            <SelectItem key={c.id} value={c.id} className="text-base font-black p-3 rounded-xl focus:bg-blue-600 focus:text-white mb-1">
                              <span className="text-blue-400 mr-2 uppercase tracking-tighter">P{c.period_order}</span> {c.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Destination Grid */}
                    <div className="space-y-3">
                      <Label className="text-xs font-black uppercase tracking-[0.2em] text-blue-400">
                        Destination
                      </Label>
                      <div className="grid grid-cols-2 gap-4">
                        {DESTINATIONS.map((dest, i) => {
                          const Icon = dest.icon;
                          const disabled = isDestinationDisabled(dest.id);
                          const selected = selectedDestination === dest.id;

                          return (
                            <motion.button
                              key={dest.id}
                              onClick={() => !disabled && setSelectedDestination(dest.id)}
                              disabled={disabled}
                              className={`
                                relative p-6 rounded-2xl border-[3px] transition-all duration-300
                                flex flex-col items-center gap-3
                                overflow-hidden
                                ${selected
                                  ? 'border-blue-500 bg-blue-600 text-white shadow-2xl shadow-blue-600/30 scale-[1.02]'
                                  : 'border-white/10 bg-white/5 hover:border-white/30 hover:bg-white/15 text-white'
                                }
                                ${disabled ? 'opacity-20 cursor-not-allowed grayscale' : 'cursor-pointer hover:translate-y-[-2px]'}
                              `}
                              whileHover={!disabled ? { scale: 1.02 } : undefined}
                              whileTap={!disabled ? { scale: 0.98 } : undefined}
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: i * 0.05 }}
                            >
                              {disabled && <MiniSnowflakes />}
                              <Icon className={`w-8 h-8 transition-colors duration-300 ${selected ? 'text-white' : 'text-blue-400'}`} />
                              <span className={`text-base font-black transition-colors duration-300 tracking-tight ${selected ? 'text-white' : 'text-slate-300'}`}>
                                {dest.label}
                              </span>
                              {selected && (
                                <motion.div
                                  className="absolute inset-0 rounded-xl border-4 border-blue-900/50"
                                  layoutId="destination-highlight"
                                />
                              )}
                            </motion.button>
                          );
                        })}
                      </div>

                      {/* Custom Destination Input */}
                      <AnimatePresence>
                        {selectedDestination === 'Other' && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="space-y-3"
                          >
                            <Label className="text-xs font-black uppercase tracking-[0.2em] text-blue-400">
                              Where are you going?
                            </Label>
                            <Input
                              placeholder="Enter destination..."
                              value={customDestination}
                              onChange={(e) => setCustomDestination(e.target.value)}
                              className="h-14 rounded-xl bg-white/5 border-2 border-white/10 text-white font-bold focus-visible:ring-blue-900 focus-visible:ring-offset-slate-950"
                              autoFocus
                            />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    {/* Submit Button */}
                    <GlowButton
                      variant="primary"
                      className="w-full h-16 text-xl font-black bg-blue-600 hover:bg-blue-500 text-white shadow-2xl shadow-blue-600/40 border-2 border-white/30 rounded-2xl transition-all hover:scale-[1.01] active:scale-[0.99] mt-4"
                      size="lg"
                      onClick={handleRequest}
                      loading={requestLoading}
                      disabled={!selectedClassId || !selectedDestination || (selectedDestination === 'Other' && !customDestination.trim()) || requestLoading}
                    >
                      {requestLoading ? 'Requesting...' : 'Submit Request'}
                    </GlowButton>
                  </GlassCard>
                </motion.div>
              )}
            </AnimatePresence>
          </StaggerItem>

          {/* Pass History */}
          <StaggerItem>
            <GlassCard className="p-6 bg-slate-900/60 border-2 border-white/10 shadow-xl">
              <PassHistory />
            </GlassCard>
          </StaggerItem>
        </StaggerContainer>

        <JoinClassDialog
          open={joinDialogOpen}
          onOpenChange={setJoinDialogOpen}
          onJoined={fetchEnrolledClasses}
        />
      </div>
    </PageTransition>
  );
};

export default StudentDashboard;
