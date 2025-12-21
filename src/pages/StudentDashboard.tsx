import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { PeriodDisplay } from '@/components/PeriodDisplay';
import { QuotaDisplay } from '@/components/QuotaDisplay';
import { useCurrentPeriod } from '@/hooks/useCurrentPeriod';
import { useWeeklyQuota } from '@/hooks/useWeeklyQuota';
import { PassHistory } from '@/components/PassHistory';
import { ElapsedTimer } from '@/components/ElapsedTimer';
import { FloatingPassButton } from '@/components/FloatingPassButton';
import { LogOut, Plus, Clock, BookOpen, Calendar, MapPin, AlertCircle, CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';

const DESTINATIONS = ['Restroom', 'Locker', 'Office', 'Other'];

interface ClassInfo {
  id: string;
  name: string;
  period_order: number;
  teacher_name: string;
}

interface ActivePass {
  id: string;
  destination: string;
  status: string;
  requested_at: string;
  approved_at: string | null;
  class_name: string;
}

interface Period {
  id: string;
  name: string;
  period_order: number;
  start_time: string;
  end_time: string;
  is_passing_period: boolean;
}

const StudentDashboard = () => {
  const { user, role, signOut, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const { currentPeriod, isSchoolDay } = useCurrentPeriod();
  const { isQuotaExceeded, refresh: refreshQuota } = useWeeklyQuota();

  const [enrolledClasses, setEnrolledClasses] = useState<ClassInfo[]>([]);
  const [activePass, setActivePass] = useState<ActivePass | null>(null);
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [selectedDestination, setSelectedDestination] = useState<string>('');
  const [customDestination, setCustomDestination] = useState<string>('');
  const [joinCode, setJoinCode] = useState('');
  const [joinDialogOpen, setJoinDialogOpen] = useState(false);
  const [requestLoading, setRequestLoading] = useState(false);
  const [todayPeriods, setTodayPeriods] = useState<Period[]>([]);

  // 1. DATA FETCHING LOGIC
  const fetchEnrolledClasses = async () => {
    if (!user) return;

    const { data: enrollments, error: enrollError } = await supabase
      .from('class_enrollments')
      .select('class_id')
      .eq('student_id', user.id);

    if (enrollError || !enrollments || enrollments.length === 0) {
      setEnrolledClasses([]);
      return;
    }

    const classIds = enrollments.map(e => e.class_id);
    const { data: classesData, error: classError } = await supabase
      .from('classes')
      .select('id, name, period_order, teacher_id')
      .in('id', classIds)
      .order('period_order');

    if (classError || !classesData) return;

    const teacherIds = [...new Set(classesData.map(c => c.teacher_id))];
    const { data: teacherProfiles } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', teacherIds);

    const teacherMap: Record<string, string> = {};
    teacherProfiles?.forEach(p => {
      teacherMap[p.id] = p.full_name;
    });

    const classes = classesData.map(c => ({
      id: c.id,
      name: c.name,
      period_order: c.period_order,
      teacher_name: teacherMap[c.teacher_id] ?? 'Unknown Teacher'
    }));

    setEnrolledClasses(classes);

    if (currentPeriod) {
      const currentClass = classes.find(c => c.period_order === currentPeriod.period_order);
      if (currentClass) setSelectedClassId(currentClass.id);
    }
  };

  const fetchActivePass = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('passes')
      .select(`
        id,
        destination,
        status,
        requested_at,
        approved_at,
        classes (name)
      `)
      .eq('student_id', user.id)
      .in('status', ['pending', 'approved', 'pending_return'])
      .order('requested_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) console.error("Error fetching pass:", error);

    if (data) {
      setActivePass({
        id: data.id,
        destination: data.destination,
        status: data.status ?? 'pending',
        requested_at: data.requested_at ?? '',
        approved_at: data.approved_at,
        class_name: (data.classes as any)?.name ?? 'Unknown Class'
      });
    } else {
      setActivePass(null);
    }
  };

  const fetchTodaySchedule = async () => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const { data: assignment } = await supabase
      .from('schedule_assignments')
      .select('schedule_id')
      .eq('date', today)
      .maybeSingle();

    if (assignment) {
      const { data: periods } = await supabase
        .from('periods')
        .select('*')
        .eq('schedule_id', assignment.schedule_id)
        .order('period_order');
      if (periods) setTodayPeriods(periods);
    }
  };

  // 2. REALTIME & SUBSCRIPTIONS
  // 2. REALTIME & SUBSCRIPTIONS
  useEffect(() => {
    // Only set up if we have a user ID
    if (!user?.id) return;

    // Initial data load
    fetchEnrolledClasses();
    fetchActivePass();
    fetchTodaySchedule();

    console.log("📡 Initializing Realtime for student:", user.id);

    const channel = supabase
      .channel(`student-dashboard-realtime-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*', // Listen for INSERT, UPDATE, and DELETE
          schema: 'public',
          table: 'passes',
          filter: `student_id=eq.${user.id}`
        },
        (payload) => {
          console.log("✨ Realtime event received:", payload);
          
          // Re-fetch data to update the UI
          fetchActivePass();
          refreshQuota();
          
          // Show toast notifications for specific status changes
          if (payload.eventType === 'UPDATE') {
            const newStatus = payload.new.status;
            const oldStatus = payload.old?.status;

            if (newStatus === 'approved' && oldStatus !== 'approved') {
              toast({ 
                title: "Pass Approved!", 
                description: `Your pass to ${payload.new.destination} is now active.`,
                variant: "default" 
              });
            } else if (newStatus === 'completed') {
              toast({ 
                title: "Pass Completed", 
                description: "You have been checked back into class.",
              });
            }
          }
            // 1. Immediately re-fetch the active pass state
  fetchActivePass();
  
  // 2. IMPORTANT: Refresh the quota counter
  // This calls the refresh function from your useWeeklyQuota hook
  refreshQuota();

  // 3. UI Feedback for checking back in
  if (payload.eventType === 'UPDATE') {
    const newStatus = payload.new.status;
    
    // If status changed to completed or pending_return, update the count
    if (newStatus === 'completed' || newStatus === 'pending_return') {
      console.log("🔄 Pass status updated, refreshing quota...");
      refreshQuota(); 
    }

    if (newStatus === 'approved') {
      toast({ title: "Pass Approved!", description: `Heading to ${payload.new.destination}` });
    }
  }
          // 1. Immediately re-fetch the active pass state
  fetchActivePass();
  
  // 2. IMPORTANT: Refresh the quota counter
  // This calls the refresh function from your useWeeklyQuota hook
  refreshQuota();

  // 3. UI Feedback for checking back in
  if (payload.eventType === 'UPDATE') {
    const newStatus = payload.new.status;
    
    // If status changed to completed or pending_return, update the count
    if (newStatus === 'completed' || newStatus === 'pending_return') {
      console.log("🔄 Pass status updated, refreshing quota...");
      refreshQuota(); 
    }

    if (newStatus === 'approved') {
      toast({ title: "Pass Approved!", description: `Heading to ${payload.new.destination}` });
    }
  }
        }
      )
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          console.log('✅ Successfully subscribed to pass changes');
        }
        if (status === 'CHANNEL_ERROR') {
          console.error('❌ Realtime connection error:', err);
        }
        if (status === 'TIMED_OUT') {
          console.warn('⌛ Realtime subscription timed out.');
        }
      });

    // Cleanup: Remove the channel when the component unmounts or user changes
    return () => {
      console.log("🔌 Cleaning up Realtime channel");
      supabase.removeChannel(channel);
    };
    
    // NOTE: Removed currentPeriod from dependencies. 
    // This prevents the socket from closing and reopening every time the clock ticks.
  }, [user?.id]);

  // 3. TAB TITLE MANAGEMENT
  useEffect(() => {
    if (activePass) {
      const titles: Record<string, string> = {
        pending: '⏳ Waiting for Approval | SmartPass Pro',
        approved: '🚶 Pass Active | SmartPass Pro',
        pending_return: '🔙 Returning | SmartPass Pro'
      };
      document.title = titles[activePass.status] || 'Student Dashboard | SmartPass Pro';
    } else {
      document.title = 'Student Dashboard | SmartPass Pro';
    }
    return () => { document.title = 'SmartPass Pro'; };
  }, [activePass]);

  // 4. HANDLERS
  const handleJoinClass = async () => {
    if (!joinCode.trim()) return;
    const normalizedCode = joinCode.toUpperCase().trim();

    const { data: classData, error: classError } = await supabase
      .from('classes')
      .select('id, period_order, name')
      .eq('join_code', normalizedCode)
      .maybeSingle();

    if (classError || !classData) {
      toast({ title: 'Invalid Code', description: 'Check the code and try again.', variant: 'destructive' });
      return;
    }

    // Check conflicts
    if (enrolledClasses.some(c => c.id === classData.id)) {
      toast({ title: 'Already Enrolled', variant: 'destructive' });
      return;
    }
    if (enrolledClasses.some(c => c.period_order === classData.period_order)) {
      toast({ title: 'Period Conflict', description: `Already have a class for Period ${classData.period_order}`, variant: 'destructive' });
      return;
    }

    const { error } = await supabase
      .from('class_enrollments')
      .insert({ class_id: classData.id, student_id: user!.id });

    if (error) {
      toast({ title: 'Error joining class', variant: 'destructive' });
    } else {
      toast({ title: 'Success!', description: `Joined ${classData.name}` });
      setJoinCode('');
      setJoinDialogOpen(false);
      fetchEnrolledClasses();
    }
  };

  const handleRequestPass = async () => {
    if (!selectedClassId || !selectedDestination) return;
    const destination = selectedDestination === 'Other' ? customDestination : selectedDestination;
    
    if (selectedDestination === 'Other' && !customDestination.trim()) {
      toast({ title: "Please enter a destination", variant: "destructive" });
      return;
    }

    setRequestLoading(true);
    const { error } = await supabase
      .from('passes')
      .insert({ student_id: user!.id, class_id: selectedClassId, destination });

    setRequestLoading(false);
    if (error) {
      toast({ title: 'Error requesting pass', variant: 'destructive' });
    } else {
      toast({ title: "Request Sent", description: "Waiting for teacher approval." });
      setSelectedDestination('');
      setCustomDestination('');
      fetchActivePass();
    }
  };

  const handleCheckIn = async () => {
    if (!activePass) return;
    const { error } = await supabase
      .from('passes')
      .update({ status: 'pending_return', checked_in_at: new Date().toISOString() })
      .eq('id', activePass.id);
    
    if (error) toast({ title: "Error checking in", variant: "destructive" });
  };

  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    return `${hour % 12 || 12}:${minutes} ${hour >= 12 ? 'PM' : 'AM'}`;
  };

  if (authLoading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  if (!user || role !== 'student') return <Navigate to="/auth" replace />;

  return (
    <div className="min-h-screen bg-background p-4 max-w-4xl mx-auto pb-24">
      <header className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center shadow-lg shadow-primary/20">
            <span className="text-primary-foreground font-black text-xl">S</span>
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Student Dashboard</h1>
            <p className="text-sm text-muted-foreground">Logged in as {user.email}</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={signOut} className="text-muted-foreground hover:text-destructive">
          <LogOut className="h-4 w-4 mr-2" /> Sign Out
        </Button>
      </header>

      <div className="grid gap-6">
        <PeriodDisplay />
        <QuotaDisplay />

        {/* ACTIVE PASS SECTION */}
        {activePass && (
          <Card className="border-2 border-primary bg-primary/5 shadow-xl animate-in fade-in zoom-in duration-300">
            <CardHeader className="pb-2 border-b border-primary/10">
              <CardTitle className="text-sm font-bold flex justify-between items-center uppercase tracking-wider text-primary">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                  Live Pass Status
                </div>
                {activePass.status === 'approved' && activePass.approved_at && (
                  <ElapsedTimer startTime={activePass.approved_at} destination={activePass.destination} />
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
              <div className="flex justify-between items-start">
                <div className="space-y-1">
                  <h3 className="text-3xl font-black tracking-tight">{activePass.destination}</h3>
                  <div className="flex items-center text-muted-foreground gap-1">
                    <MapPin className="h-3 w-3" />
                    <span className="text-sm font-medium">Origin: {activePass.class_name}</span>
                  </div>
                </div>
                <div className={`px-4 py-2 rounded-full font-bold text-xs uppercase tracking-widest ${
                  activePass.status === 'pending' ? 'bg-amber-100 text-amber-700' : 
                  activePass.status === 'approved' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                }`}>
                  {activePass.status.replace('_', ' ')}
                </div>
              </div>

              {activePass.status === 'pending' && (
                <div className="bg-amber-50 border border-amber-200 p-4 rounded-lg flex items-center gap-3 text-amber-800">
                  <Clock className="h-5 w-5 animate-spin-slow" />
                  <p className="text-sm font-medium">Your teacher has been notified. Please wait for approval before leaving.</p>
                </div>
              )}

              {activePass.status === 'approved' && (
                <Button onClick={handleCheckIn} size="lg" className="w-full text-lg font-bold shadow-lg shadow-primary/20 hover:scale-[1.01] transition-transform">
                  Check Back In
                </Button>
              )}

              {activePass.status === 'pending_return' && (
                <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg flex items-center gap-3 text-blue-800">
                  <CheckCircle2 className="h-5 w-5" />
                  <p className="text-sm font-medium">You have checked in. Waiting for your teacher to confirm your return.</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* REQUEST SECTION */}
        {!activePass && (
          <Card className="shadow-md border-none ring-1 ring-border">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Plus className="h-5 w-5 text-primary" />
                Request a Pass
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase text-muted-foreground tracking-widest">Select Class</Label>
                <Select value={selectedClassId} onValueChange={setSelectedClassId}>
                  <SelectTrigger className="h-12">
                    <SelectValue placeholder="Which class are you in?" />
                  </SelectTrigger>
                  <SelectContent>
                    {enrolledClasses.map(c => (
                      <SelectItem key={c.id} value={c.id} className="py-3">
                        <div className="flex flex-col">
                          <span className="font-bold">Period {c.period_order}: {c.name}</span>
                          <span className="text-xs text-muted-foreground">{c.teacher_name}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase text-muted-foreground tracking-widest">Select Destination</Label>
                <div className="grid grid-cols-2 gap-3">
                  {DESTINATIONS.map(dest => (
                    <Button
                      key={dest}
                      variant={selectedDestination === dest ? 'default' : 'outline'}
                      className={`h-20 flex-col gap-1 transition-all ${selectedDestination === dest ? 'ring-2 ring-primary ring-offset-2' : ''}`}
                      onClick={() => setSelectedDestination(dest)}
                      disabled={dest === 'Restroom' && isQuotaExceeded}
                    >
                      <span className="font-bold text-base">{dest}</span>
                      {dest === 'Restroom' && isQuotaExceeded && <span className="text-[10px] opacity-70 italic font-medium">Weekly Quota Reached</span>}
                    </Button>
                  ))}
                </div>
              </div>

              {selectedDestination === 'Other' && (
                <div className="space-y-2 animate-in slide-in-from-top-2 duration-200">
                  <Label className="text-xs font-bold uppercase text-muted-foreground tracking-widest">Specify Location</Label>
                  <Input 
                    placeholder="Where are you going?" 
                    value={customDestination} 
                    onChange={e => setCustomDestination(e.target.value)}
                    className="h-12"
                  />
                </div>
              )}

              <Button 
                className="w-full h-14 text-lg font-bold transition-all active:scale-95" 
                onClick={handleRequestPass} 
                disabled={requestLoading || !selectedClassId || !selectedDestination}
              >
                {requestLoading ? 'Processing...' : 'Submit Pass Request'}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* LISTS SECTION */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* MY CLASSES */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3 border-b border-muted/50">
              <CardTitle className="text-sm font-bold flex items-center gap-2 text-muted-foreground uppercase tracking-widest">
                <BookOpen className="h-4 w-4" />
                My Enrolled Classes
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="space-y-3">
                {enrolledClasses.length === 0 ? (
                  <div className="text-center py-8 px-4 border-2 border-dashed rounded-xl">
                    <p className="text-sm text-muted-foreground">You haven't joined any classes yet.</p>
                  </div>
                ) : (
                  enrolledClasses.map(c => (
                    <div key={c.id} className="flex items-center justify-between p-4 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors border border-transparent hover:border-border">
                      <div className="space-y-0.5">
                        <p className="font-bold leading-none">{c.name}</p>
                        <p className="text-xs font-medium text-primary">{c.teacher_name}</p>
                      </div>
                      <div className="text-[10px] font-black bg-primary/10 text-primary px-2.5 py-1 rounded-md uppercase tracking-tighter">
                        P{c.period_order}
                      </div>
                    </div>
                  ))
                )}
              </div>
              
              <Dialog open={joinDialogOpen} onOpenChange={setJoinDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="w-full mt-4 border-dashed h-12 text-muted-foreground">
                    <Plus className="h-4 w-4 mr-2" /> Join New Class
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Enroll in a Class</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-6 pt-4">
                    <div className="space-y-2 text-center">
                      <Label className="text-muted-foreground">Enter 6-Digit Class Code</Label>
                      <Input 
                        placeholder="ABC-123" 
                        value={joinCode} 
                        onChange={e => setJoinCode(e.target.value.toUpperCase())} 
                        maxLength={6} 
                        className="text-center text-3xl font-black h-20 tracking-[0.5em] font-mono"
                      />
                    </div>
                    <Button onClick={handleJoinClass} size="lg" className="w-full font-bold h-14" disabled={joinCode.length !== 6}>
                      Join Class
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </CardContent>
          </Card>

          {/* SCHEDULE */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3 border-b border-muted/50">
              <CardTitle className="text-sm font-bold flex items-center gap-2 text-muted-foreground uppercase tracking-widest">
                <Calendar className="h-4 w-4" />
                Today's Schedule
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="space-y-2">
                {todayPeriods.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">No schedule assigned for today.</p>
                ) : (
                  todayPeriods.map(p => {
                    const isCurrent = currentPeriod?.id === p.id;
                    return (
                      <div key={p.id} className={`flex justify-between items-center p-3 rounded-lg border transition-all ${
                        isCurrent ? 'bg-primary/10 border-primary ring-1 ring-primary/20' : 'bg-transparent border-transparent'
                      }`}>
                        <div className="flex items-center gap-3">
                          {isCurrent && <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />}
                          <span className={`text-sm font-bold ${isCurrent ? 'text-primary' : 'text-foreground'} ${p.is_passing_period ? 'text-muted-foreground font-normal italic' : ''}`}>
                            {p.name}
                          </span>
                        </div>
                        <span className="text-[10px] font-mono font-bold text-muted-foreground">
                          {formatTime(p.start_time)} - {formatTime(p.end_time)}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <PassHistory />
      </div>

      <FloatingPassButton
        userId={user.id}
        currentClassId={currentPeriod ? enrolledClasses.find(c => c.period_order === currentPeriod.period_order)?.id ?? null : null}
        hasActivePass={!!activePass}
        isQuotaExceeded={isQuotaExceeded}
        isSchoolDay={true} // Hardcoded for testing, change back to isSchoolDay if desired
        onPassRequested={fetchActivePass}
      />
    </div>
  );
};

export default StudentDashboard;
