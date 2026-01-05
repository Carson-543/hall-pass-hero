import { useState, useEffect, useCallback } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
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
import { PageTransition, FadeIn, StaggerContainer, StaggerItem } from '@/components/ui/page-transition';
import { FloatingElement } from '@/components/ui/floating-element';
import { StatusBadge } from '@/components/ui/status-badge';
import { LogOut, Clock, MapPin, Settings as SettingsIcon, Loader2, ArrowLeft, Sparkles, DoorOpen, KeyRound, Building2, MoreHorizontal, Snowflake, X } from 'lucide-react';

const DESTINATIONS = [
  { id: 'Restroom', icon: DoorOpen, label: 'Restroom' },
  { id: 'Locker', icon: KeyRound, label: 'Locker' },
  { id: 'Office', icon: Building2, label: 'Office' },
  { id: 'Other', icon: MoreHorizontal, label: 'Other' },
];

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
  const [requestLoading, setRequestLoading] = useState(false);
  const [activeFreeze, setActiveFreeze] = useState<{ freeze_type: string; ends_at?: string | null } | null>(null);

  const fetchEnrolledClasses = useCallback(async () => {
    if (!user?.id) return;
    const { data: enrollments } = await supabase
      .from('class_enrollments')
      .select('class_id')
      .eq('student_id', user.id);

    if (!enrollments?.length) {
      setEnrolledClasses([]);
      return;
    }

    const { data: classesData } = await supabase
      .from('classes')
      .select('id, name, period_order, teacher_id')
      .in('id', enrollments.map(e => e.class_id))
      .order('period_order');

    if (!classesData) return;

    const teacherIds = [...new Set(classesData.map(c => c.teacher_id))];
    const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', teacherIds);
    const teacherMap = Object.fromEntries(profiles?.map(p => [p.id, p.full_name]) || []);

    setEnrolledClasses(classesData.map(c => ({
      ...c,
      teacher_name: teacherMap[c.teacher_id] ?? 'Unknown'
    })));
  }, [user?.id]);

  const fetchActivePass = useCallback(async () => {
    if (!user?.id) return;
    const { data } = await supabase
      .from('passes')
      .select(`id, destination, status, requested_at, approved_at, expected_return_at, class_id`)
      .eq('student_id', user.id)
      .in('status', ['pending', 'approved', 'pending_return'])
      .order('requested_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data) {
      const { data: classData } = await supabase.from('classes').select('name, is_queue_autonomous').eq('id', data.class_id).maybeSingle();
      setActivePass({ ...data, class_name: classData?.name ?? 'Unknown', is_queue_autonomous: classData?.is_queue_autonomous });
    } else {
      setActivePass(null);
    }
  }, [user?.id]);

  const MiniSnowflakes = () => {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="absolute inset-0 pointer-events-none overflow-hidden"
      >
        {/* 1. The Frost Tint: Makes the button look frozen/disabled */}
        <div className="absolute inset-0 bg-blue-500/10 backdrop-blur-[1px]" />

        {/* 2. Higher Contrast Snowflakes */}
        <div className="absolute inset-0 p-1">
          {/* Top Snowflake */}
          <motion.div
            className="absolute top-1 right-1"
            animate={{ rotate: 360 }}
            transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
          >
            <Snowflake size={14} className="text-blue-900 fill-blue-200/50" />
          </motion.div>

          {/* Bottom Snowflake */}
          <motion.div
            className="absolute bottom-1 left-1"
            animate={{ rotate: -360 }}
            transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
          >
            <Snowflake size={12} className="text-blue-900" />
          </motion.div>
        </div>

        {/* 3. Frost Border Effect */}
        <div className="absolute inset-0 border border-blue-200/50 rounded-xl" />
      </motion.div>
    );
  };

  const fetchActiveFreeze = useCallback(async (id: string) => {
    if (!id) return;
    const { data } = await supabase.from('pass_freezes').select('freeze_type, ends_at').eq('class_id', id).eq('is_active', true).maybeSingle();
    setActiveFreeze(data ? { freeze_type: data.freeze_type, ends_at: data.ends_at } : null);
  }, []);

  useEffect(() => {
    fetchEnrolledClasses();
    fetchActivePass();
  }, [fetchEnrolledClasses, fetchActivePass]);

  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`student-pass-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'passes', filter: `student_id=eq.${user.id}` },
        (payload) => {
          fetchActivePass();
          if (payload.eventType === 'UPDATE' && ['returned', 'completed', 'denied'].includes((payload.new as any).status)) {
            refreshQuota();
          }
        })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id, fetchActivePass, refreshQuota]);

  useEffect(() => {
    if (!selectedClassId) return;
    fetchActiveFreeze(selectedClassId);
    const channel = supabase
      .channel(`freeze-check-${selectedClassId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pass_freezes', filter: `class_id=eq.${selectedClassId}` },
        () => fetchActiveFreeze(selectedClassId))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
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
    setRequestLoading(true);
    await supabase.from('passes').insert({
      student_id: user.id,
      class_id: selectedClassId,
      destination: selectedDestination
    });
    setRequestLoading(false);
    fetchActivePass();
  };

  const handleCheckIn = async () => {
    if (!activePass) return;

    const { error } = await supabase.rpc('student_check_in', { p_pass_id: activePass.id });

    if (error) {
      toast({ title: "Error checking in", description: error.message, variant: "destructive" });
    }
  };

  const handleCancelRequest = async () => {
    if (!activePass) return;
    const { error } = await supabase
      .from('passes')
      .update({ status: 'denied', denied_at: new Date().toISOString() })
      .eq('id', activePass.id)
      .eq('status', 'pending');

    if (!error) {
      toast({ title: 'Request Cancelled' });
      setActivePass(null);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
        >
          <Loader2 className="w-8 h-8 text-primary" />
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
    <PageTransition className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30">
      {/* Ice overlay for freeze state */}


      <div className="relative z-10 p-4 max-w-2xl mx-auto pb-24">
        {/* Header */}
        <FadeIn>
          <header className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-4">
              <motion.div
                className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-lg shadow-primary/30"
                whileHover={{ scale: 1.05, rotate: 5 }}
                whileTap={{ scale: 0.95 }}
              >
                <Sparkles className="w-7 h-7 text-primary-foreground" />
              </motion.div>
              <div>
                <h1 className="text-2xl font-black tracking-tight">ClassPass Pro</h1>
                <p className="text-sm text-muted-foreground font-medium">{organization?.name}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="icon" className="rounded-xl" onClick={() => navigate('/settings')}>
                <SettingsIcon className="h-5 w-5" />
              </Button>
              <Button variant="ghost" size="icon" className="rounded-xl" onClick={signOut}>
                <LogOut className="h-5 w-5" />
              </Button>
            </div>
          </header>
        </FadeIn>

        <StaggerContainer className="grid gap-6">
          {/* Period & Quota Row */}
          <StaggerItem>
            <div className="grid grid-cols-2 gap-4">
              <GlassCard variant="frosted" className="p-4">
                <PeriodDisplay />
              </GlassCard>
              <GlassCard variant="frosted" className="p-4">
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
                      glowColor={activePass.status === 'approved' ? 'success' : 'warning'}
                      className="relative overflow-hidden border-2 border-primary/30"
                    >
                      {/* Animated gradient background */}
                      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/10 animate-pulse" />

                      <div className="relative space-y-6">
                        {/* Header */}
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground mb-2">
                              Live Pass
                            </p>
                            <h2 className="text-4xl font-black tracking-tight">{activePass.destination}</h2>
                            <p className="text-sm text-muted-foreground mt-1">
                              From: {activePass.class_name}
                            </p>
                          </div>
                          <StatusBadge
                            status={activePass.status === 'pending' ? 'pending' : 'active'}
                            pulse
                          />
                        </div>

                        {/* Timer */}
                        {activePass.status === 'approved' && activePass.approved_at && (
                          <div className="p-4 rounded-xl bg-muted/50 backdrop-blur-sm">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Clock className="w-5 h-5 text-primary" />
                                <span className="text-sm font-medium text-muted-foreground">Time Out</span>
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
                            className="w-full"
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
                            variant="success"
                            size="lg"
                            className="w-full"
                            onClick={handleCheckIn}
                          >
                            <ArrowLeft className="w-5 h-5" />
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
                  <GlassCard hover3D className="space-y-6">
                    <div>
                      <h2 className="text-xl font-bold mb-1">Request Pass</h2>
                      <p className="text-sm text-muted-foreground">Select your class and destination</p>
                    </div>

                    {/* Class Selection */}
                    <div className="space-y-2">
                      <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        Class
                      </Label>
                      <Select value={selectedClassId} onValueChange={setSelectedClassId}>
                        <SelectTrigger className="h-14 rounded-xl text-base font-medium">
                          <SelectValue placeholder="Select your class" />
                        </SelectTrigger>
                        <SelectContent>
                          {enrolledClasses.map(c => (
                            <SelectItem key={c.id} value={c.id} className="text-base">
                              <span className="font-bold">P{c.period_order}:</span> {c.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Destination Grid */}
                    <div className="space-y-2">
                      <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        Destination
                      </Label>
                      <div className="grid grid-cols-2 gap-3">
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
                                relative p-4 rounded-xl border-2 transition-all duration-200
                                flex flex-col items-center gap-2
                                overflow-hidden
                                ${selected
                                  ? 'border-primary bg-primary/10 text-primary shadow-lg shadow-primary/20'
                                  : 'border-border hover:border-primary/50 hover:bg-muted/50'
                                }
                                ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
                              `}
                              whileHover={!disabled ? { scale: 1.02 } : undefined}
                              whileTap={!disabled ? { scale: 0.98 } : undefined}
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: i * 0.05 }}
                            >
                              {disabled && <MiniSnowflakes />}
                              <Icon className={`w-6 h-6 ${selected ? 'text-primary' : 'text-muted-foreground'}`} />
                              <span className={`text-sm font-bold ${selected ? 'text-primary' : ''}`}>
                                {dest.label}
                              </span>
                              {selected && (
                                <motion.div
                                  className="absolute inset-0 rounded-xl border-2 border-primary"
                                  layoutId="destination-highlight"
                                />
                              )}
                            </motion.button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Submit Button */}
                    <GlowButton
                      variant="primary"
                      size="lg"
                      className="w-full"
                      onClick={handleRequest}
                      loading={requestLoading}
                      disabled={!selectedClassId || !selectedDestination || requestLoading}
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
            <GlassCard variant="frosted" className="p-4">
              <PassHistory />
            </GlassCard>
          </StaggerItem>
        </StaggerContainer>
      </div>
    </PageTransition>
  );
};

export default StudentDashboard;
