import { useState, useEffect, useCallback } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
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
import { LogOut, Plus, Clock, BookOpen, Calendar, MapPin, CheckCircle2, Settings, Loader2 } from 'lucide-react';
import { format } from 'date-fns';

const DESTINATIONS = ['Restroom', 'Locker', 'Office', 'Other'];

const StudentDashboard = () => {
  const { user, role, signOut, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { currentPeriod } = useCurrentPeriod();
  const { isQuotaExceeded, refresh: refreshQuota } = useWeeklyQuota();

  const [enrolledClasses, setEnrolledClasses] = useState<any[]>([]);
  const [activePass, setActivePass] = useState<any | null>(null);
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [selectedDestination, setSelectedDestination] = useState<string>('');
  const [customDestination, setCustomDestination] = useState<string>('');
  const [joinCode, setJoinCode] = useState('');
  const [joinDialogOpen, setJoinDialogOpen] = useState(false);
  const [requestLoading, setRequestLoading] = useState(false);
  const [todayPeriods, setTodayPeriods] = useState<any[]>([]);

  // --- 1. ENROLLED CLASSES LOGGING ---
  const fetchEnrolledClasses = useCallback(async () => {
    if (!user?.id) return;
    console.log("%c📡 DATABASE FETCH: Enrolled Classes", "color: #3b82f6; font-weight: bold;");
    
    const { data: enrollments } = await supabase
      .from('class_enrollments')
      .select('class_id')
      .eq('student_id', user.id);

    if (!enrollments || enrollments.length === 0) {
      setEnrolledClasses([]);
      return;
    }

    const classIds = enrollments.map(e => e.class_id);
    const { data: classesData } = await supabase
      .from('classes')
      .select('id, name, period_order, teacher_id')
      .in('id', classIds)
      .order('period_order');

    if (!classesData) return;

    const teacherIds = [...new Set(classesData.map(c => c.teacher_id))];
    const { data: teacherProfiles } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', teacherIds);

    const teacherMap: Record<string, string> = {};
    teacherProfiles?.forEach(p => { teacherMap[p.id] = p.full_name; });

    const classes = classesData.map(c => ({
      id: c.id,
      name: c.name,
      period_order: c.period_order,
      teacher_name: teacherMap[c.teacher_id] ?? 'Unknown Teacher'
    }));

    setEnrolledClasses(classes);
    if (currentPeriod && !selectedClassId) {
      const currentClass = classes.find(c => c.period_order === currentPeriod.period_order);
      if (currentClass) setSelectedClassId(currentClass.id);
    }
  }, [user?.id, currentPeriod, selectedClassId]);

  // --- 2. ACTIVE PASS LOGGING ---
  const fetchActivePass = useCallback(async () => {
    if (!user?.id) return;
    console.log("%c📡 DATABASE FETCH: Active Pass Status", "color: #10b981; font-weight: bold;");
    
    const { data, error } = await supabase
      .from('passes')
      .select(`id, destination, status, requested_at, approved_at, class_id`)
      .eq('student_id', user.id)
      .in('status', ['pending', 'approved', 'pending_return'])
      .order('requested_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("❌ Error fetching pass:", error);
      return;
    }

    if (data) {
      const { data: classData } = await supabase
        .from('classes')
        .select('name')
        .eq('id', data.class_id)
        .maybeSingle();

      setActivePass({
        id: data.id,
        destination: data.destination,
        status: data.status ?? 'pending',
        requested_at: data.requested_at ?? '',
        approved_at: data.approved_at,
        class_name: classData?.name ?? 'Unknown Class'
      });
    } else {
      setActivePass(null);
    }
  }, [user?.id]);

  // --- 3. SCHEDULE LOGGING ---
  const fetchTodaySchedule = useCallback(async () => {
    console.log("%c📡 DATABASE FETCH: Today's Schedule", "color: #f59e0b; font-weight: bold;");
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
  }, []);

  // --- 4. REALTIME LOGGING ---
  useEffect(() => {
    if (!user?.id) return;

    console.log("%c🚀 MOUNT: Initializing Student Dashboard", "color: #ffffff; background: #3b82f6; padding: 2px 4px; border-radius: 2px;");
    
    fetchEnrolledClasses();
    fetchActivePass();
    fetchTodaySchedule();

    const channel = supabase
      .channel(`student-dashboard-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*', 
          schema: 'public',
          table: 'passes',
          filter: `student_id=eq.${user.id}`
        },
        (payload) => {
          const newRecord = payload.new as { status?: string } | undefined;
          console.log("%c⚡ REALTIME EVENT: Pass changed", "color: #a855f7; font-weight: bold;", payload.eventType, newRecord?.status);
          fetchActivePass();

          if (payload.eventType === 'UPDATE') {
            const newStatus = payload.new.status;
            if (['returned', 'completed', 'denied'].includes(newStatus)) {
              console.log("🔄 Pass finalized, refreshing quota...");
              refreshQuota(); 
            }
          }
        }
      )
      .subscribe((status) => {
        console.log(`%c🔌 Realtime Status: ${status}`, "font-style: italic; color: #6b7280;");
      });

    return () => {
      console.log("%c🛑 UNMOUNT: Cleaning up dashboard", "color: #ef4444;");
      supabase.removeChannel(channel);
    };
  }, [user?.id, fetchEnrolledClasses, fetchActivePass, fetchTodaySchedule]);

  if (authLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin" /></div>;
  if (!user || role !== 'student') return <Navigate to="/auth" replace />;

  return (
    // ... JSX stays exactly the same as the previous fix ...
    <div className="min-h-screen bg-background p-4 max-w-4xl mx-auto pb-24">
       <header className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center shadow-lg shadow-primary/20">
            <span className="text-primary-foreground font-black text-xl">S</span>
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Student Dashboard</h1>
            <p className="text-sm text-muted-foreground">{user.email}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate('/settings')} className="text-muted-foreground hover:text-primary">
            <Settings className="h-4 w-4 mr-2" /> Settings
          </Button>
          <Button variant="ghost" size="sm" onClick={signOut} className="text-muted-foreground hover:text-destructive">
            <LogOut className="h-4 w-4 mr-2" /> Sign Out
          </Button>
        </div>
      </header>

      <div className="grid gap-6">
        <PeriodDisplay />
        <QuotaDisplay />

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
                  <p className="text-sm font-medium">Wait for teacher approval before leaving.</p>
                </div>
              )}

              {activePass.status === 'approved' && (
                <Button onClick={async () => {
                  console.log("🖱️ CLICK: Check-in clicked");
                  const { error } = await supabase
                    .from('passes')
                    .update({ status: 'pending_return', returned_at: new Date().toISOString() })
                    .eq('id', activePass.id);
                  if (error) toast({ title: "Error checking in", variant: "destructive" });
                }} size="lg" className="w-full text-lg font-bold shadow-lg shadow-primary/20">
                  Check Back In
                </Button>
              )}
            </CardContent>
          </Card>
        )}
        
        {!activePass && (
          <Card className="shadow-md">
            <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Plus className="h-5 w-5 text-primary" /> Request a Pass</CardTitle></CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase text-muted-foreground tracking-widest">Select Class</Label>
                <Select value={selectedClassId} onValueChange={setSelectedClassId}>
                  <SelectTrigger className="h-12"><SelectValue placeholder="Which class are you in?" /></SelectTrigger>
                  <SelectContent>
                    {enrolledClasses.map(c => (
                      <SelectItem key={c.id} value={c.id} className="py-3">
                        <span className="font-bold">Period {c.period_order}: {c.name}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button 
                className="w-full h-14 text-lg font-bold" 
                onClick={async () => {
                  console.log("🖱️ CLICK: Request Pass clicked");
                  setRequestLoading(true);
                  const dest = selectedDestination === 'Other' ? customDestination : selectedDestination;
                  const { error } = await supabase.from('passes').insert({ student_id: user.id, class_id: selectedClassId, destination: dest });
                  setRequestLoading(false);
                  if (!error) fetchActivePass();
                }} 
                disabled={requestLoading || !selectedClassId || !selectedDestination}
              >
                {requestLoading ? 'Processing...' : 'Submit Pass Request'}
              </Button>
            </CardContent>
          </Card>
        )}
        <PassHistory />
      </div>
    </div>
  );
};

export default StudentDashboard;
