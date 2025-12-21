import { useState, useEffect, useCallback } from 'react';
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
import { LogOut, Plus, Clock, BookOpen, Calendar, MapPin, CheckCircle2 } from 'lucide-react';
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
  const { currentPeriod } = useCurrentPeriod();
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

  // --- 1. DATA FETCHING LOGIC ---
  const fetchEnrolledClasses = useCallback(async () => {
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
  }, [user, currentPeriod]);

  const fetchActivePass = useCallback(async () => {
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
  }, [user]);

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

  // --- 2. REALTIME & SUBSCRIPTIONS ---
  useEffect(() => {
    if (!user?.id) return;

    fetchEnrolledClasses();
    fetchActivePass();
    fetchTodaySchedule();

    console.log("📡 Initializing Realtime for student:", user.id);

    const channel = supabase
      .channel(`student-dashboard-realtime-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*', 
          schema: 'public',
          table: 'passes',
          filter: `student_id=eq.${user.id}`
        },
        (payload) => {
          console.log("✨ Realtime event received:", payload);
          
          // RE-FETCH ALL DATA ON CHANGE
          fetchActivePass();
          refreshQuota();
          
          if (payload.eventType === 'UPDATE') {
            const newStatus = payload.new.status;
            const oldStatus = payload.old?.status;

            // Handle Approved State
            if (newStatus === 'approved' && oldStatus !== 'approved') {
              toast({ 
                title: "Pass Approved!", 
                description: `Your pass to ${payload.new.destination} is now active.` 
              });
            } 
            // Handle Return State (Updates the Counter)
            else if (newStatus === 'completed' || newStatus === 'pending_return') {
              console.log("🔄 Check-in detected, refreshing quota...");
              refreshQuota();
              if (newStatus === 'completed') {
                toast({ title: "Pass Completed", description: "Checked back into class." });
              }
            }
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') console.log('✅ Realtime connected');
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, fetchEnrolledClasses, fetchActivePass, refreshQuota]);

  // --- 3. TAB TITLE MANAGEMENT ---
  useEffect(() => {
    if (activePass) {
      const titles: Record<string, string> = {
        pending: '⏳ Waiting... | SmartPass',
        approved: '🚶 Active | SmartPass',
        pending_return: '🔙 Returning | SmartPass'
      };
      document.title = titles[activePass.status] || 'Student Dashboard';
    } else {
      document.title = 'Student Dashboard';
    }
  }, [activePass]);

  // --- 4. HANDLERS ---
  const handleJoinClass = async () => {
    if (!joinCode.trim()) return;
    const { data: classData } = await supabase
      .from('classes')
      .select('id, period_order, name')
      .eq('join_code', joinCode.toUpperCase().trim())
      .maybeSingle();

    if (!classData) {
      toast({ title: 'Invalid Code', variant: 'destructive' });
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
    const dest = selectedDestination === 'Other' ? customDestination : selectedDestination;
    
    setRequestLoading(true);
    const { error } = await supabase
      .from('passes')
      .insert({ student_id: user!.id, class_id: selectedClassId, destination: dest });

    setRequestLoading(false);
    if (!error) {
      toast({ title: "Request Sent" });
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
    const [h, m] = time.split(':');
    const hour = parseInt(h);
    return `${hour % 12 || 12}:${m} ${hour >= 12 ? 'PM' : 'AM'}`;
  };

  if (authLoading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  if (!user || role !== 'student') return <Navigate to="/auth" replace />;

  return (
    <div className="min-h-screen bg-background p-4 max-w-4xl mx-auto pb-24">
      <header className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center shadow-lg">
            <span className="text-primary-foreground font-black text-xl">S</span>
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Student Dashboard</h1>
            <p className="text-sm text-muted-foreground">{user.email}</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={signOut}><LogOut className="h-4 w-4 mr-2" /> Sign Out</Button>
      </header>

      <div className="grid gap-6">
        <PeriodDisplay />
        <QuotaDisplay />

        {/* LIVE PASS STATUS CARD */}
        {activePass && (
          <Card className="border-2 border-primary bg-primary/5 shadow-xl animate-in zoom-in duration-300">
            <CardHeader className="pb-2 border-b border-primary/10 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-primary flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-primary animate-pulse" /> Live Status
              </CardTitle>
              {activePass.status === 'approved' && activePass.approved_at && (
                <ElapsedTimer startTime={activePass.approved_at} destination={activePass.destination} />
              )}
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-3xl font-black tracking-tight">{activePass.destination}</h3>
                  <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                    <MapPin className="h-3 w-3" /> {activePass.class_name}
                  </p>
                </div>
                <div className="px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold uppercase">
                  {activePass.status.replace('_', ' ')}
                </div>
              </div>

              {activePass.status === 'pending' && (
                <div className="bg-amber-50 p-4 rounded-lg flex items-center gap-3 text-amber-800 border border-amber-100">
                  <Clock className="h-5 w-5 animate-spin-slow" />
                  <p className="text-sm font-medium">Waiting for teacher approval...</p>
                </div>
              )}

              {activePass.status === 'approved' && (
                <Button onClick={handleCheckIn} size="lg" className="w-full text-lg font-bold shadow-lg">Check Back In</Button>
              )}

              {activePass.status === 'pending_return' && (
                <div className="bg-blue-50 p-4 rounded-lg flex items-center gap-3 text-blue-800 border border-blue-100">
                  <CheckCircle2 className="h-5 w-5" />
                  <p className="text-sm font-medium">Checked in. Waiting for teacher to confirm.</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* REQUEST SECTION */}
        {!activePass && (
          <Card className="shadow-md">
            <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Plus className="h-5 w-5 text-primary" /> Request a Pass</CardTitle></CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase text-muted-foreground">Class</Label>
                <Select value={selectedClassId} onValueChange={setSelectedClassId}>
                  <SelectTrigger className="h-12"><SelectValue placeholder="Select class" /></SelectTrigger>
                  <SelectContent>
                    {enrolledClasses.map(c => (
                      <SelectItem key={c.id} value={c.id}>Period {c.period_order}: {c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase text-muted-foreground">Destination</Label>
                <div className="grid grid-cols-2 gap-3">
                  {DESTINATIONS.map(dest => (
                    <Button
                      key={dest}
                      variant={selectedDestination === dest ? 'default' : 'outline'}
                      className="h-16 font-bold"
                      onClick={() => setSelectedDestination(dest)}
                      disabled={dest === 'Restroom' && isQuotaExceeded}
                    >
                      {dest}
                    </Button>
                  ))}
                </div>
              </div>

              {selectedDestination === 'Other' && (
                <Input placeholder="Where to?" value={customDestination} onChange={e => setCustomDestination(e.target.value)} />
              )}

              <Button 
                className="w-full h-14 text-lg font-bold" 
                onClick={handleRequestPass} 
                disabled={requestLoading || !selectedClassId || !selectedDestination}
              >
                {requestLoading ? 'Sending...' : 'Request Pass'}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* BOTTOM SECTION: CLASSES & SCHEDULE */}
        <div className="grid md:grid-cols-2 gap-6">
          <Card>
            <CardHeader><CardTitle className="text-sm font-bold flex items-center gap-2 uppercase tracking-widest text-muted-foreground"><BookOpen className="h-4 w-4" /> My Classes</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {enrolledClasses.map(c => (
                <div key={c.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border">
                  <div><p className="font-bold">{c.name}</p><p className="text-xs text-primary">{c.teacher_name}</p></div>
                  <div className="text-[10px] font-black bg-primary/10 text-primary px-2 py-1 rounded">P{c.period_order}</div>
                </div>
              ))}
              <Dialog open={joinDialogOpen} onOpenChange={setJoinDialogOpen}>
                <DialogTrigger asChild><Button variant="outline" className="w-full mt-2 border-dashed"><Plus className="h-4 w-4 mr-2" /> Join Class</Button></DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Enter Class Code</DialogTitle></DialogHeader>
                  <Input placeholder="CODE123" value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase())} className="text-center text-2xl font-mono h-16" />
                  <Button onClick={handleJoinClass} className="w-full h-12 font-bold">Join Now</Button>
                </DialogContent>
              </Dialog>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm font-bold flex items-center gap-2 uppercase tracking-widest text-muted-foreground"><Calendar className="h-4 w-4" /> Today's Schedule</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {todayPeriods.map(p => (
                <div key={p.id} className={`flex justify-between p-3 rounded-lg border ${currentPeriod?.id === p.id ? 'bg-primary/5 border-primary' : 'border-transparent'}`}>
                  <span className="text-sm font-bold">{p.name}</span>
                  <span className="text-[10px] font-mono">{formatTime(p.start_time)} - {formatTime(p.end_time)}</span>
                </div>
              ))}
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
        isSchoolDay={true}
        onPassRequested={fetchActivePass}
      />
    </div>
  );
};

export default StudentDashboard;
