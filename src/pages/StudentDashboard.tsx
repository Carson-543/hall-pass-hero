import { useState, useEffect, useCallback } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';
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
import { FreezeIndicator } from '@/components/student/FreezeIndicator';
import { QueuePosition } from '@/components/student/QueuePosition';
import { ExpectedReturnTimer } from '@/components/student/ExpectedReturnTimer';
import { LogOut, Plus, Clock, BookOpen, Calendar, MapPin, CheckCircle2, Settings, Loader2 } from 'lucide-react';
import { format } from 'date-fns';

const DESTINATIONS = ['Restroom', 'Locker', 'Office', 'Other'];

const StudentDashboard = () => {
  const { user, role, signOut, loading: authLoading } = useAuth();
  const { organization, settings } = useOrganization();
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
  const [activeFreeze, setActiveFreeze] = useState<any | null>(null);

  /**
   * FETCH ENROLLED CLASSES
   * Dependency fix: Removed selectedClassId from dependencies to prevent circular loops.
   */
  const fetchEnrolledClasses = useCallback(async () => {
    if (!user?.id) return;
    
    console.log("🔄 [Student] Fetching enrolled classes...");

    const { data: enrollments } = await supabase
      .from('class_enrollments')
      .select('class_id')
      .eq('student_id', user.id);

    if (!enrollments || enrollments.length === 0) {
      console.log("ℹ️ No enrollments found.");
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

    console.log(`📥 Found ${classes.length} classes.`);
    setEnrolledClasses(classes);
  }, [user?.id]); // Only depends on user ID

  /**
   * FETCH ACTIVE PASS
   */
  const fetchActivePass = useCallback(async () => {
    if (!user?.id) return;
    
    console.log("🔄 [Student] Checking for active passes...");

    const { data, error } = await supabase
      .from('passes')
      .select(`id, destination, status, requested_at, approved_at, expected_return_at, class_id`)
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
      console.log("📥 Active pass found:", data.destination);
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
        expected_return_at: data.expected_return_at,
        class_id: data.class_id,
        class_name: classData?.name ?? 'Unknown Class'
      });
    } else {
      setActivePass(null);
    }
  }, [user?.id]);

  /**
   * FETCH ACTIVE FREEZE
   */
  const fetchActiveFreeze = useCallback(async (classId: string) => {
    if (!classId) return;
    
    console.log(`🔄 [Student] Checking freeze status for class ${classId}`);
    const { data } = await supabase
      .from('pass_freezes')
      .select('*')
      .eq('class_id', classId)
      .eq('is_active', true)
      .maybeSingle();

    setActiveFreeze(data);
  }, []);

  /**
   * FETCH TODAY'S SCHEDULE
   */
  const fetchTodaySchedule = useCallback(async () => {
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

  /**
   * INITIAL LOAD & REALTIME SUBSCRIPTION
   */
  useEffect(() => {
    if (!user?.id) return;
    
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
          console.log("🔔 Realtime pass update:", payload.eventType);
          fetchActivePass();

          if (payload.eventType === 'UPDATE') {
            const newStatus = (payload.new as any).status;
            if (['returned', 'completed', 'denied'].includes(newStatus)) {
              refreshQuota(); 
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, fetchEnrolledClasses, fetchActivePass, fetchTodaySchedule, refreshQuota]);

  /**
   * SYNC SELECTED CLASS WITH CURRENT PERIOD
   * This is separated from the fetch to prevent infinite loops.
   */
  useEffect(() => {
    if (currentPeriod && enrolledClasses.length > 0 && !selectedClassId) {
      const currentClass = enrolledClasses.find(c => c.period_order === currentPeriod.period_order);
      if (currentClass) {
        console.log("📍 Auto-selecting class for Period:", currentPeriod.period_order);
        setSelectedClassId(currentClass.id);
      }
    }
  }, [currentPeriod, enrolledClasses, selectedClassId]);

  /**
   * FREEZE STATUS HANDLERS
   */
  useEffect(() => {
    if (selectedClassId) {
      fetchActiveFreeze(selectedClassId);

      const channel = supabase
        .channel(`freeze-${selectedClassId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'pass_freezes',
            filter: `class_id=eq.${selectedClassId}`
          },
          (payload) => {
              console.log("🔔 Realtime freeze change detected");
              fetchActiveFreeze(selectedClassId);
          }
        )
        .subscribe();

      return () => { supabase.removeChannel(channel); };
    }
  }, [selectedClassId, fetchActiveFreeze]);

  const isDestinationFrozen = (destination: string) => {
    if (!activeFreeze) return false;
    if (activeFreeze.freeze_type === 'all') return true;
    if (activeFreeze.freeze_type === 'bathroom' && destination === 'Restroom') return true;
    return false;
  };

  if (authLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin" /></div>;
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
            <p className="text-sm text-muted-foreground">{organization?.name || user.email}</p>
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

        {activeFreeze && (
          <FreezeIndicator 
            freezeType={activeFreeze.freeze_type} 
            endsAt={activeFreeze.ends_at} 
          />
        )}

        {activePass && (
          <Card className="border-2 border-primary bg-primary/5 shadow-xl">
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

              {activePass.status === 'pending' && activePass.destination === 'Restroom' && (
                <QueuePosition classId={activePass.class_id} passId={activePass.id} />
              )}

              {activePass.status === 'approved' && activePass.expected_return_at && (
                <ExpectedReturnTimer expectedReturnAt={activePass.expected_return_at} />
              )}

              {activePass.status === 'pending' && (
                <div className="bg-amber-50 border border-amber-200 p-4 rounded-lg flex items-center gap-3 text-amber-800">
                  <Clock className="h-5 w-5 animate-spin-slow" />
                  <p className="text-sm font-medium">Wait for teacher approval before leaving.</p>
                </div>
              )}

              {activePass.status === 'approved' && (
                <Button onClick={async () => {
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

              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase text-muted-foreground tracking-widest">Destination</Label>
                <div className="grid grid-cols-2 gap-2">
                  {DESTINATIONS.map(d => {
                    const isFrozen = isDestinationFrozen(d);
                    return (
                      <Button
                        key={d}
                        variant={selectedDestination === d ? 'default' : 'outline'}
                        className="h-12"
                        onClick={() => setSelectedDestination(d)}
                        disabled={isFrozen}
                      >
                        {d}
                        {isFrozen && <span className="ml-1 text-xs">(Frozen)</span>}
                      </Button>
                    );
                  })}
                </div>
              </div>

              <Button 
                className="w-full h-14 text-lg font-bold" 
                onClick={async () => {
                  setRequestLoading(true);
                  const dest = selectedDestination === 'Other' ? customDestination : selectedDestination;
                  const { error } = await supabase.from('passes').insert({ 
                    student_id: user.id, 
                    class_id: selectedClassId, 
                    destination: dest 
                  });
                  setRequestLoading(false);
                  if (error) {
                     toast({ title: "Failed to submit request", variant: "destructive" });
                  } else {
                     fetchActivePass();
                  }
                }} 
                disabled={requestLoading || !selectedClassId || !selectedDestination || isDestinationFrozen(selectedDestination)}
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
