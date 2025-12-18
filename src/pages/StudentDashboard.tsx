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
import { LogOut, Plus } from 'lucide-react';

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
          teacher_id
        )
      `)
      .eq('student_id', user.id);

    if (data) {
      const classes = data.map((e: any) => ({
        id: e.classes.id,
        name: e.classes.name,
        period_order: e.classes.period_order
      }));
      setEnrolledClasses(classes);

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
        status: data.status,
        requested_at: data.requested_at,
        approved_at: data.approved_at,
        class_name: (data.classes as any)?.name ?? ''
      });
    } else {
      setActivePass(null);
    }
  };

  useEffect(() => {
    fetchEnrolledClasses();
    fetchActivePass();

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

    const { data: classData, error: classError } = await supabase
      .from('classes')
      .select('id, period_order')
      .eq('join_code', joinCode.toUpperCase())
      .single();

    if (classError || !classData) {
      toast({
        title: 'Invalid Code',
        description: 'No class found with that join code.',
        variant: 'destructive'
      });
      return;
    }

    // Check if already enrolled in a class for this period
    const existingEnrollment = enrolledClasses.find(c => c.period_order === classData.period_order);
    if (existingEnrollment) {
      toast({
        title: 'Already Enrolled',
        description: `You're already enrolled in a class for period ${classData.period_order}.`,
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
        description: 'Failed to join class.',
        variant: 'destructive'
      });
    } else {
      toast({
        title: 'Success',
        description: 'You have joined the class!'
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

  if (authLoading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  if (!user || role !== 'student') {
    return <Navigate to="/auth" replace />;
  }

  return (
    <div className="min-h-screen bg-background p-4 max-w-4xl mx-auto">
      <header className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Student Dashboard</h1>
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
          <Card className="border-primary">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Active Pass</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <p className="font-semibold">{activePass.destination}</p>
                <p className="text-sm text-muted-foreground">
                  From: {activePass.class_name}
                </p>
                <p className="text-sm">
                  Status: <span className="font-medium capitalize">{activePass.status.replace('_', ' ')}</span>
                </p>
                {activePass.status === 'approved' && (
                  <Button onClick={handleCheckIn} className="w-full mt-2">
                    Check Back In
                  </Button>
                )}
                {activePass.status === 'pending_return' && (
                  <p className="text-sm text-muted-foreground">
                    Waiting for teacher to confirm your return.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Request New Pass */}
        {!activePass && isSchoolDay && (
          <Card>
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
                    className="h-16"
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
                className="w-full" 
                onClick={handleRequestPass}
                disabled={requestLoading || !selectedClassId || !selectedDestination}
              >
                {requestLoading ? 'Requesting...' : 'Request Pass'}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Join Class */}
        <Dialog open={joinDialogOpen} onOpenChange={setJoinDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" className="w-full">
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
                />
              </div>
              <Button onClick={handleJoinClass} className="w-full">
                Join Class
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Pass History */}
        <PassHistory />
      </div>
    </div>
  );
};

export default StudentDashboard;
