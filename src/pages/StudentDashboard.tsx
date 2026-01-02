import { useState, useEffect, useCallback } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { PeriodDisplay } from '@/components/PeriodDisplay';
import { Settings } from '/Settings';
import { QuotaDisplay } from '@/components/QuotaDisplay';
import { useCurrentPeriod } from '@/hooks/useCurrentPeriod';
import { useWeeklyQuota } from '@/hooks/useWeeklyQuota';
import { PassHistory } from '@/components/PassHistory';
import { ElapsedTimer } from '@/components/ElapsedTimer';
import { FreezeIndicator } from '@/components/student/FreezeIndicator';
import { QueuePosition } from '@/components/student/QueuePosition';
import { ExpectedReturnTimer } from '@/components/student/ExpectedReturnTimer';
import { LogOut, Plus, Clock, MapPin, Settings, Loader2 } from 'lucide-react';

const DESTINATIONS = ['Restroom', 'Locker', 'Office', 'Other'];

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
  const [activeFreeze, setActiveFreeze] = useState<any | null>(null);

  // --- STABLE FETCHERS ---

  const fetchEnrolledClasses = useCallback(async () => {
    if (!user?.id) return;
    console.log("📡 [FETCH] Enrolled Classes");
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
    console.log("📡 [FETCH] Active Pass Status");
    const { data, error } = await supabase
      .from('passes')
      .select(`id, destination, status, requested_at, approved_at, expected_return_at, class_id`)
      .eq('student_id', user.id)
      .in('status', ['pending', 'approved', 'pending_return'])
      .order('requested_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data) {
      const { data: classData } = await supabase.from('classes').select('name').eq('id', data.class_id).maybeSingle();
      setActivePass({ ...data, class_name: classData?.name ?? 'Unknown' });
    } else {
      setActivePass(null);
    }
  }, [user?.id]);

  const fetchActiveFreeze = useCallback(async (id: string) => {
    if (!id) return;
    const { data } = await supabase.from('pass_freezes').select('*').eq('class_id', id).eq('is_active', true).maybeSingle();
    setActiveFreeze(data);
  }, []);

  // --- EFFECT 1: INITIAL LOAD ONLY ---
  useEffect(() => {
    fetchEnrolledClasses();
    fetchActivePass();
  }, [fetchEnrolledClasses, fetchActivePass]);

  // --- EFFECT 2: REALTIME SUBSCRIPTION (Passes) ---
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

  // --- EFFECT 3: REALTIME SUBSCRIPTION (Freezes) ---
  useEffect(() => {
    if (!selectedClassId) return;
    fetchActiveFreeze(selectedClassId);
    const channel = supabase
      .channel(`freeze-${selectedClassId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pass_freezes', filter: `class_id=eq.${selectedClassId}` }, 
      () => fetchActiveFreeze(selectedClassId))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selectedClassId, fetchActiveFreeze]);

  // --- EFFECT 4: AUTO-SELECT CLASS BASED ON BELL SCHEDULE ---
  useEffect(() => {
    if (currentPeriod && enrolledClasses.length > 0) {
      const match = enrolledClasses.find(c => c.period_order === currentPeriod.period_order);
      if (match && !selectedClassId) {
        setSelectedClassId(match.id);
      }
    }
  }, [currentPeriod, enrolledClasses, selectedClassId]);

  if (authLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin" /></div>;
  if (!user || role !== 'student') return <Navigate to="/auth" replace />;

  return (
    <div className="min-h-screen bg-background p-4 max-w-4xl mx-auto pb-24">
      <header className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center">
            <span className="text-primary-foreground font-black text-xl">S</span>
          </div>
          <div>
            <h1 className="text-2xl font-bold">Student Dashboard</h1>
            <p className="text-sm text-muted-foreground">{organization?.name}</p>
          </div>
        </div>
        <Button variant="ghost" onClick={settings}><Settings className="h-4 w-4 mr-2" /> Settings</Button>
        <Button variant="ghost" onClick={signOut}><LogOut className="h-4 w-4 mr-2" /> Sign Out</Button>
      </header>

      <div className="grid gap-6">
        <PeriodDisplay />
        <QuotaDisplay />

        {activeFreeze && <FreezeIndicator freezeType={activeFreeze.freeze_type} endsAt={activeFreeze.ends_at} />}

        {activePass ? (
          <Card className="border-2 border-primary bg-primary/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold flex justify-between items-center uppercase tracking-wider text-primary">
                Live Pass
                {activePass.status === 'approved' && activePass.approved_at && (
                  <ElapsedTimer startTime={activePass.approved_at} destination={activePass.destination} />
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6 pt-4">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-3xl font-black">{activePass.destination}</h3>
                  <p className="text-sm text-muted-foreground">From: {activePass.class_name}</p>
                </div>
                <div className="px-3 py-1 bg-primary/10 text-primary rounded-full text-xs font-bold uppercase">
                  {activePass.status.replace('_', ' ')}
                </div>
              </div>
              {activePass.status === 'pending' && <QueuePosition classId={activePass.class_id} passId={activePass.id} />}
              {activePass.status === 'approved' && <ExpectedReturnTimer expectedReturnAt={activePass.expected_return_at} />}
              {activePass.status === 'approved' && (
                <Button className="w-full" onClick={() => supabase.from('passes').update({ status: 'pending_return', returned_at: new Date().toISOString() }).eq('id', activePass.id)}>
                  Check Back In
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader><CardTitle className="text-lg">Request Pass</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Class</Label>
                <Select value={selectedClassId} onValueChange={setSelectedClassId}>
                  <SelectTrigger><SelectValue placeholder="Select Class" /></SelectTrigger>
                  <SelectContent>
                    {enrolledClasses.map(c => <SelectItem key={c.id} value={c.id}>P{c.period_order}: {c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {DESTINATIONS.map(d => (
                  <Button key={d} variant={selectedDestination === d ? 'default' : 'outline'} onClick={() => setSelectedDestination(d)} disabled={activeFreeze?.freeze_type === 'all' || (activeFreeze?.freeze_type === 'bathroom' && d === 'Restroom')}>
                    {d}
                  </Button>
                ))}
              </div>
              <Button 
                className="w-full h-12 font-bold" 
                disabled={!selectedClassId || !selectedDestination || requestLoading}
                onClick={async () => {
                  setRequestLoading(true);
                  await supabase.from('passes').insert({ student_id: user.id, class_id: selectedClassId, destination: selectedDestination });
                  setRequestLoading(false);
                  fetchActivePass();
                }}
              >
                {requestLoading ? 'Requesting...' : 'Submit Request'}
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
