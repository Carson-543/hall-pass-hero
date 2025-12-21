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
import { LogOut, Plus, Clock, BookOpen, Calendar } from 'lucide-react';
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

  const fetchEnrolledClasses = async () => {
    if (!user) return;

    // Simplified joined query: Gets Enrollment -> Class Details -> Teacher Profile Name
    const { data, error } = await supabase
      .from('class_enrollments')
      .select(`
        class_id,
        classes (
          id,
          name,
          period_order,
          profiles:teacher_id (
            full_name
          )
        )
      `)
      .eq('student_id', user.id);

    if (error || !data) {
      setEnrolledClasses([]);
      return;
    }

    const classes: ClassInfo[] = data.map((item: any) => ({
      id: item.classes.id,
      name: item.classes.name,
      period_order: item.classes.period_order,
      teacher_name: item.classes.profiles?.full_name ?? 'Unknown Teacher'
    })).sort((a, b) => a.period_order - b.period_order);

    setEnrolledClasses(classes);

    if (currentPeriod) {
      const currentClass = classes.find(c => c.period_order === currentPeriod.period_order);
      if (currentClass) setSelectedClassId(currentClass.id);
    }
  };

  const fetchActivePass = async () => {
    if (!user) return;

    const { data } = await supabase
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

    if (data) {
      setActivePass({
        id: data.id,
        destination: data.destination,
        status: data.status ?? 'pending',
        requested_at: data.requested_at ?? '',
        approved_at: data.approved_at,
        class_name: (data.classes as any)?.name ?? ''
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

  useEffect(() => {
    if (activePass) {
      const titles: Record<string, string> = {
        pending: '⏳ Waiting | SmartPass Pro',
        approved: '🚶 Pass Active | SmartPass Pro',
        pending_return: '🔙 Returning | SmartPass Pro'
      };
      document.title = titles[activePass.status] || 'Student Dashboard | SmartPass Pro';
    } else {
      document.title = 'Student Dashboard | SmartPass Pro';
    }
    return () => { document.title = 'SmartPass Pro'; };
  }, [activePass]);

  useEffect(() => {
    fetchEnrolledClasses();
    fetchActivePass();
    fetchTodaySchedule();

    const channel = supabase
      .channel('student-passes')
      .on('postgres_changes', { 
          event: '*', 
          schema: 'public', 
          table: 'passes', 
          filter: `student_id=eq.${user?.id}` 
        }, 
        () => {
          fetchActivePass();
          refreshQuota();
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, currentPeriod]);

  const handleJoinClass = async () => {
    if (!joinCode.trim()) return;
    const normalizedCode = joinCode.toUpperCase().trim();

    const { data: classData } = await supabase
      .from('classes')
      .select('id, period_order, name')
      .eq('join_code', normalizedCode)
      .maybeSingle();

    if (!classData) {
      toast({ title: 'Invalid Code', variant: 'destructive' });
      return;
    }

    if (enrolledClasses.some(c => c.id === classData.id)) {
      toast({ title: 'Already Enrolled', variant: 'destructive' });
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
    setRequestLoading(true);

    const { error } = await supabase
      .from('passes')
      .insert({
        student_id: user!.id,
        class_id: selectedClassId,
        destination: destination
      });

    setRequestLoading(false);
    if (error) {
      toast({ title: 'Error requesting pass', variant: 'destructive' });
    } else {
      setSelectedDestination('');
      setCustomDestination('');
      fetchActivePass();
    }
  };

  const handleCheckIn = async () => {
    if (!activePass) return;
    await supabase
      .from('passes')
      .update({ status: 'pending_return', checked_in_at: new Date().toISOString() })
      .eq('id', activePass.id);
  };

  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    return `${hour % 12 || 12}:${minutes} ${ampm}`;
  };

  if (authLoading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  if (!user || role !== 'student') return <Navigate to="/auth" replace />;

  return (
    <div className="min-h-screen bg-background p-4 max-w-4xl mx-auto">
      <header className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center">
            <span className="text-primary-foreground font-bold text-lg">S</span>
          </div>
          <h1 className="text-2xl font-bold">Student Dashboard</h1>
        </div>
        <Button variant="outline" size="sm" onClick={signOut}>
          <LogOut className="h-4 w-4 mr-2" /> Sign Out
        </Button>
      </header>

      <div className="space-y-4">
        <PeriodDisplay />
        <QuotaDisplay />

        {/* Active Pass UI omitted for brevity, same as your original */}

        {!activePass && isSchoolDay && (
          <Card>
            <CardHeader><CardTitle className="text-sm">Request a Pass</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <Label>Class</Label>
              <Select value={selectedClassId} onValueChange={setSelectedClassId}>
                <SelectTrigger><SelectValue placeholder="Select a class" /></SelectTrigger>
                <SelectContent>
                  {enrolledClasses.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      Period {c.period_order}: {c.name} ({c.teacher_name})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* Destination buttons same as your original */}
              <Button className="w-full" onClick={handleRequestPass} disabled={requestLoading || !selectedClassId || !selectedDestination}>
                Request Pass
              </Button>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2"><BookOpen className="h-4 w-4" /> My Classes</CardTitle>
          </CardHeader>
          <CardContent>
            {enrolledClasses.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">No classes enrolled.</p>
            ) : (
              <div className="space-y-2">
                {enrolledClasses.map(c => (
                  <div key={c.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div>
                      <p className="font-medium">{c.name}</p>
                      <p className="text-sm text-primary font-medium">{c.teacher_name}</p>
                    </div>
                    <span className="text-sm font-mono bg-primary/10 text-primary px-2 py-1 rounded">Period {c.period_order}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      
      <FloatingPassButton
        userId={user.id}
        currentClassId={currentPeriod ? enrolledClasses.find(c => c.period_order === currentPeriod.period_order)?.id ?? null : null}
        hasActivePass={!!activePass}
        isQuotaExceeded={isQuotaExceeded}
        isSchoolDay={isSchoolDay}
        onPassRequested={fetchActivePass}
      />
    </div>
  );
};

export default StudentDashboard;
