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
  teacher_name?: string;
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

    const { data } = await supabase
      .from('class_enrollments')
      .select(`
        class_id,
        classes (
          id,
          name,
          period_order,
          teacher_id,
          profiles:teacher_id (full_name)
        )
      `)
      .eq('student_id', user.id);

    if (data) {
      const classes = data.map((e: any) => ({
        id: e.classes.id,
        name: e.classes.name,
        period_order: e.classes.period_order,
        teacher_name: e.classes.profiles?.full_name ?? 'Unknown Teacher'
      }));
      setEnrolledClasses(classes.sort((a, b) => a.period_order - b.period_order));

      // Auto-select class for current period
      if (currentPeriod) {
        const currentClass = classes.find(c => c.period_order === currentPeriod.period_order);
        if (currentClass) {
          setSelectedClassId(currentClass.id);
        }
      }
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
    
    // Get today's schedule assignment
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

      if (periods) {
        setTodayPeriods(periods);
      }
    }
  };

  // Dynamic browser tab title
  useEffect(() => {
    if (activePass) {
      if (activePass.status === 'pending') {
        document.title = '⏳ Waiting for Approval | SmartPass Pro';
      } else if (activePass.status === 'approved') {
        document.title = '🚶 Pass Active | SmartPass Pro';
      } else if (activePass.status === 'pending_return') {
        document.title = '🔙 Returning | SmartPass Pro';
      }
    } else {
      document.title = 'Student Dashboard | SmartPass Pro';
    }

    return () => {
      document.title = 'SmartPass Pro';
    };
  }, [activePass]);

  useEffect(() => {
    fetchEnrolledClasses();
    fetchActivePass();
    fetchTodaySchedule();

    // Subscribe to pass changes
    const channel = supabase
      .channel('student-passes')
      .on(
        'postgres_changes',
        {
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

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, currentPeriod]);

  const handleJoinClass = async () => {
    if (!joinCode.trim()) return;

    const normalizedCode = joinCode.toUpperCase().trim();

    const { data: classData, error: classError } = await supabase
      .from('classes')
      .select('id, period_order, name')
      .eq('join_code', normalizedCode)
      .maybeSingle();

    if (classError || !classData) {
      toast({
        title: 'Invalid Code',
        description: 'No class found with that join code. Please check the code and try again.',
        variant: 'destructive'
      });
      return;
    }

    // Check if already enrolled in this class
    const existingEnrollment = enrolledClasses.find(c => c.id === classData.id);
    if (existingEnrollment) {
      toast({
        title: 'Already Enrolled',
        description: `You're already enrolled in ${classData.name}.`,
        variant: 'destructive'
      });
      return;
    }

    // Check if already enrolled in a class for this period
    const existingPeriodEnrollment = enrolledClasses.find(c => c.period_order === classData.period_order);
    if (existingPeriodEnrollment) {
      toast({
        title: 'Period Conflict',
        description: `You're already enrolled in ${existingPeriodEnrollment.name} for period ${classData.period_order}.`,
        variant: 'destructive'
      });
      return;
    }

    const { error } = await supabase
      .from('class_enrollments')
      .insert({
        class_id: classData.id,
        student_id: user!.id
      });

    if (error) {
      toast({
        title: 'Error',
        description: 'Failed to join class. Please try again.',
        variant: 'destructive'
      });
    } else {
      toast({
        title: 'Success!',
        description: `You have joined ${classData.name}!`
      });
      setJoinCode('');
      setJoinDialogOpen(false);
      fetchEnrolledClasses();
    }
  };

  const handleRequestPass = async () => {
    if (!selectedClassId || !selectedDestination) {
      toast({
        title: 'Missing Information',
        description: 'Please select a class and destination.',
        variant: 'destructive'
      });
      return;
    }

    const destination = selectedDestination === 'Other' ? customDestination : selectedDestination;
    if (selectedDestination === 'Other' && !customDestination.trim()) {
      toast({
        title: 'Missing Destination',
        description: 'Please enter a custom destination.',
        variant: 'destructive'
      });
      return;
    }

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
      toast({
        title: 'Error',
        description: 'Failed to request pass.',
        variant: 'destructive'
      });
    } else {
      toast({
        title: 'Pass Requested',
        description: 'Waiting for teacher approval.'
      });
      setSelectedDestination('');
      setCustomDestination('');
      fetchActivePass();
    }
  };

  const handleCheckIn = async () => {
    if (!activePass) return;

    const { error } = await supabase
      .from('passes')
      .update({
        status: 'pending_return',
        checked_in_at: new Date().toISOString()
      })
      .eq('id', activePass.id);

    if (error) {
      toast({
        title: 'Error',
        description: 'Failed to check in.',
        variant: 'destructive'
      });
    } else {
      toast({
        title: 'Checked In',
        description: 'Waiting for teacher confirmation.'
      });
    }
  };

  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  if (authLoading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  if (!user || role !== 'student') {
    return <Navigate to="/auth" replace />;
  }

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
          <LogOut className="h-4 w-4 mr-2" />
          Sign Out
        </Button>
      </header>

      <div className="space-y-4">
        <PeriodDisplay />
        <QuotaDisplay />

        {/* Active Pass Status */}
        {activePass && (
          <Card className="border-2 border-primary bg-primary/5 card-hover">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-primary animate-pulse-gentle" />
                  Active Pass
                </div>
                {activePass.status === 'approved' && activePass.approved_at && (
                  <ElapsedTimer 
                    startTime={activePass.approved_at} 
                    destination={activePass.destination}
                  />
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <p className="font-semibold text-lg">{activePass.destination}</p>
                <p className="text-sm text-muted-foreground">
                  From: {activePass.class_name}
                </p>
                <p className="text-sm">
                  Status: <span className="font-medium capitalize bg-primary/10 text-primary px-2 py-0.5 rounded-full">{activePass.status.replace('_', ' ')}</span>
                </p>
                {activePass.status === 'approved' && (
                  <Button onClick={handleCheckIn} className="w-full mt-2 btn-bounce">
                    Check Back In
                  </Button>
                )}
                {activePass.status === 'pending_return' && (
                  <p className="text-sm text-muted-foreground italic">
                    Waiting for teacher to confirm your return...
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Request New Pass */}
        {!activePass && isSchoolDay && (
          <Card className="card-hover">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Request a Pass</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Class</Label>
                <Select value={selectedClassId} onValueChange={setSelectedClassId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a class" />
                  </SelectTrigger>
                  <SelectContent>
                    {enrolledClasses.map(c => (
                      <SelectItem key={c.id} value={c.id}>
                        Period {c.period_order}: {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {DESTINATIONS.map(dest => (
                  <Button
                    key={dest}
                    variant={selectedDestination === dest ? 'default' : 'outline'}
                    className="h-16 btn-bounce"
                    onClick={() => setSelectedDestination(dest)}
                    disabled={dest === 'Restroom' && isQuotaExceeded}
                  >
                    {dest}
                    {dest === 'Restroom' && isQuotaExceeded && (
                      <span className="text-xs ml-1">(Quota)</span>
                    )}
                  </Button>
                ))}
              </div>

              {selectedDestination === 'Other' && (
                <Input
                  placeholder="Enter destination"
                  value={customDestination}
                  onChange={(e) => setCustomDestination(e.target.value)}
                />
              )}

              <Button 
                className="w-full btn-bounce" 
                onClick={handleRequestPass}
                disabled={requestLoading || !selectedClassId || !selectedDestination}
              >
                {requestLoading ? 'Requesting...' : 'Request Pass'}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* My Classes */}
        <Card className="card-hover">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <BookOpen className="h-4 w-4" />
              My Classes
            </CardTitle>
          </CardHeader>
          <CardContent>
            {enrolledClasses.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">
                No classes enrolled. Join a class using a code from your teacher.
              </p>
            ) : (
              <div className="space-y-2">
                {enrolledClasses.map(c => (
                  <div key={c.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                    <div>
                      <p className="font-medium">{c.name}</p>
                      <p className="text-sm text-muted-foreground">{c.teacher_name}</p>
                    </div>
                    <span className="text-sm font-mono bg-primary/10 text-primary px-2 py-1 rounded">
                      Period {c.period_order}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Today's Schedule */}
        {todayPeriods.length > 0 && (
          <Card className="card-hover">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Today's Schedule
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                {todayPeriods.map(period => {
                  const isCurrentPeriod = currentPeriod?.id === period.id;
                  return (
                    <div
                      key={period.id}
                      className={`flex items-center justify-between p-2 rounded-lg transition-colors ${
                        period.is_passing_period 
                          ? 'bg-muted/30 text-muted-foreground text-sm' 
                          : isCurrentPeriod 
                            ? 'bg-primary/10 border border-primary' 
                            : 'hover:bg-muted/50'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {isCurrentPeriod && <div className="w-2 h-2 rounded-full bg-primary animate-pulse-gentle" />}
                        <span className={`font-medium ${period.is_passing_period ? 'text-muted-foreground' : ''}`}>
                          {period.name}
                        </span>
                      </div>
                      <span className="font-mono text-sm">
                        {formatTime(period.start_time)} - {formatTime(period.end_time)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Join Class */}
        <Dialog open={joinDialogOpen} onOpenChange={setJoinDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" className="w-full btn-bounce">
              <Plus className="h-4 w-4 mr-2" />
              Join a Class
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Join a Class</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Join Code</Label>
                <Input
                  placeholder="Enter 6-character code"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  maxLength={6}
                  className="text-center text-lg font-mono tracking-widest"
                />
              </div>
              <Button onClick={handleJoinClass} className="w-full btn-bounce" disabled={joinCode.length !== 6}>
                Join Class
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Pass History */}
        <PassHistory />
      </div>

      {/* Floating Quick Pass Button */}
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