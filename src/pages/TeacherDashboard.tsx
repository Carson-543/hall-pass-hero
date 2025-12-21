import { useState, useEffect, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { PeriodDisplay } from '@/components/PeriodDisplay';
import { ElapsedTimer } from '@/components/ElapsedTimer';
import { LogOut, Plus, MapPin, Clock, History, AlertCircle, CheckCircle2, Loader2, ArrowRight } from 'lucide-react';
import { format, startOfWeek } from 'date-fns';

interface EnrolledClass {
  id: string;
  name: string;
  teacher_name: string;
  period_order: number;
}

interface ActivePass {
  id: string;
  destination: string;
  status: string;
  requested_at: string;
  approved_at?: string;
  class_name: string;
}

const StudentView = () => {
  const { user, role, signOut, loading: authLoading } = useAuth();
  const { toast } = useToast();

  // Data State
  const [enrolledClasses, setEnrolledClasses] = useState<EnrolledClass[]>([]);
  const [activePass, setActivePass] = useState<ActivePass | null>(null);
  const [weeklyPassCount, setWeeklyPassCount] = useState(0);
  const [weeklyLimit, setWeeklyLimit] = useState(4);
  
  // UI State
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  
  // Pass Request State
  const [requestDialogOpen, setRequestDialogOpen] = useState(false);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedDestination, setSelectedDestination] = useState('');
  const [customDestination, setCustomDestination] = useState('');

  const DESTINATIONS = ['Restroom', 'Locker', 'Office', 'Other'];

  const getWeekStart = useCallback(() => {
    return startOfWeek(new Date(), { weekStartsOn: 1 }).toISOString();
  }, []);

  const fetchData = useCallback(async () => {
    if (!user) return;

    // 1. Fetch Enrolled Classes with Teacher Names
    const { data: enrollments } = await supabase
      .from('class_enrollments')
      .select(`
        class_id,
        classes (
          id, name, period_order,
          profiles:teacher_id (full_name)
        )
      `)
      .eq('student_id', user.id);

    if (enrollments) {
      const formatted = enrollments.map((e: any) => ({
        id: e.classes.id,
        name: e.classes.name,
        period_order: e.classes.period_order,
        teacher_name: e.classes.profiles?.full_name || 'Unknown Teacher'
      }));
      setEnrolledClasses(formatted);
    }

    // 2. Fetch Active/Pending Pass
    const { data: passes } = await supabase
      .from('passes')
      .select(`
        id, destination, status, requested_at, approved_at,
        classes (name)
      `)
      .eq('student_id', user.id)
      .in('status', ['pending', 'approved', 'pending_return'])
      .order('requested_at', { ascending: false })
      .limit(1);

    if (passes && passes.length > 0) {
      setActivePass({
        id: passes[0].id,
        destination: passes[0].destination,
        status: passes[0].status,
        requested_at: passes[0].requested_at,
        approved_at: passes[0].approved_at,
        class_name: passes[0].classes?.name || 'Unknown Class'
      });
    } else {
      setActivePass(null);
    }

    // 3. Fetch Weekly Quota Progress
    const { count } = await supabase
      .from('passes')
      .select('*', { count: 'exact', head: true })
      .eq('student_id', user.id)
      .eq('destination', 'Restroom')
      .in('status', ['approved', 'pending_return', 'returned'])
      .gte('requested_at', getWeekStart());

    const { data: settings } = await supabase.from('weekly_quota_settings').select('weekly_limit').single();
    
    setWeeklyPassCount(count || 0);
    setWeeklyLimit(settings?.weekly_limit ?? 4);
    setIsInitialLoading(false);
  }, [user, getWeekStart]);

  useEffect(() => {
    fetchData();

    // Real-time subscription for pass updates
    const channel = supabase
      .channel(`student-updates-${user?.id}`)
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'passes', 
        filter: `student_id=eq.${user?.id}` 
      }, () => fetchData())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, fetchData]);

  const handleJoinClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCode.trim() || isSubmitting) return;
    setIsSubmitting(true);

    const { data: classData, error: classError } = await supabase
      .from('classes')
      .select('id')
      .eq('join_code', joinCode.toUpperCase())
      .single();

    if (classError || !classData) {
      toast({ title: "Invalid Code", description: "Class not found.", variant: "destructive" });
    } else {
      const { error: enrollError } = await supabase
        .from('class_enrollments')
        .insert({ student_id: user?.id, class_id: classData.id });

      if (enrollError) {
        toast({ title: "Error", description: "Already enrolled or failed to join.", variant: "destructive" });
      } else {
        toast({ title: "Success!", description: "You joined the class." });
        setJoinCode('');
        fetchData();
      }
    }
    setIsSubmitting(false);
  };

  const handleRequestPass = async () => {
    if (!selectedClassId || !selectedDestination || isSubmitting) return;
    setIsSubmitting(true);

    const destination = selectedDestination === 'Other' ? customDestination : selectedDestination;
    
    const { error } = await supabase.from('passes').insert({
      student_id: user?.id,
      class_id: selectedClassId,
      destination,
      status: 'pending'
    });

    if (error) {
      toast({ title: "Request Failed", variant: "destructive" });
    } else {
      toast({ title: "Request Sent", description: "Wait for teacher approval." });
      setRequestDialogOpen(false);
      setSelectedDestination('');
      setCustomDestination('');
    }
    setIsSubmitting(false);
  };

  const handleEndPass = async () => {
    if (!activePass || isSubmitting) return;
    setIsSubmitting(true);

    const { error } = await supabase
      .from('passes')
      .update({ status: 'pending_return' })
      .eq('id', activePass.id);

    if (error) {
      toast({ title: "Error", variant: "destructive" });
    } else {
      toast({ title: "Return Requested", description: "Please return to class." });
    }
    setIsSubmitting(false);
  };

  if (authLoading || isInitialLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin h-8 w-8 text-primary" /></div>;
  if (!user || role !== 'student') return <Navigate to="/auth" replace />;

  return (
    <div className="min-h-screen bg-background p-4 max-w-2xl mx-auto pb-24">
      <header className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold">S</div>
          <h1 className="text-xl font-bold">Student Pass</h1>
        </div>
        <Button variant="ghost" size="sm" onClick={signOut}><LogOut className="h-4 w-4 mr-2" />Sign Out</Button>
      </header>

      <div className="space-y-4">
        <PeriodDisplay />

        {/* Weekly Quota Card */}
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="pt-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-full"><Clock className="h-5 w-5 text-primary" /></div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Weekly Restroom Usage</p>
                <p className="text-2xl font-bold">{weeklyPassCount} / {weeklyLimit}</p>
              </div>
            </div>
            {weeklyPassCount >= weeklyLimit && (
              <div className="flex items-center text-destructive text-xs font-bold gap-1 bg-destructive/10 px-2 py-1 rounded">
                <AlertCircle className="h-3 w-3" /> LIMIT REACHED
              </div>
            )}
          </CardContent>
        </Card>

        {/* Active Pass Section */}
        {activePass ? (
          <Card className={`border-2 ${activePass.status === 'pending' ? 'border-yellow-500/50 bg-yellow-500/5' : 'border-green-500 bg-green-500/5'} animate-in fade-in slide-in-from-bottom-4`}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center justify-between">
                <span>Current Status</span>
                {activePass.status === 'pending' ? (
                  <span className="flex items-center gap-1 text-yellow-600"><Loader2 className="h-3 w-3 animate-spin" /> Pending Approval</span>
                ) : (
                  <span className="flex items-center gap-1 text-green-600"><CheckCircle2 className="h-3 w-3" /> Approved</span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between items-end">
                <div>
                  <h2 className="text-2xl font-bold">{activePass.destination}</h2>
                  <p className="text-sm text-muted-foreground">{activePass.class_name}</p>
                </div>
                {activePass.approved_at && (
                  <div className="text-right">
                    <ElapsedTimer startTime={activePass.approved_at} destination={activePass.destination} />
                  </div>
                )}
              </div>
              
              {activePass.status === 'approved' && (
                <Button variant="default" className="w-full h-12 text-lg font-bold" onClick={handleEndPass} disabled={isSubmitting}>
                  Request Return to Class
                </Button>
              )}
              {activePass.status === 'pending_return' && (
                <div className="bg-muted p-3 rounded-md text-center text-sm font-medium animate-pulse">
                  Returning to class... awaiting teacher check-in
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          <Dialog open={requestDialogOpen} onOpenChange={setRequestDialogOpen}>
            <DialogTrigger asChild>
              <Button className="w-full h-20 text-xl font-bold rounded-2xl shadow-lg btn-bounce gap-2" disabled={enrolledClasses.length === 0}>
                <Plus className="h-6 w-6" /> Request a Pass
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader><CardTitle>Where are you going?</CardTitle></DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Which Class?</Label>
                  <Select value={selectedClassId} onValueChange={setSelectedClassId}>
                    <SelectTrigger><SelectValue placeholder="Select current class" /></SelectTrigger>
                    <SelectContent>
                      {enrolledClasses.map(c => (
                        <SelectItem key={c.id} value={c.id}>P{c.period_order}: {c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Destination</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {DESTINATIONS.map(dest => (
                      <Button key={dest} variant={selectedDestination === dest ? 'default' : 'outline'} onClick={() => setSelectedDestination(dest)}>{dest}</Button>
                    ))}
                  </div>
                </div>
                {selectedDestination === 'Other' && <Input placeholder="Type location..." value={customDestination} onChange={(e) => setCustomDestination(e.target.value)} />}
                <Button onClick={handleRequestPass} className="w-full h-12 text-lg" disabled={isSubmitting || !selectedClassId || !selectedDestination}>
                  Send Request
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}

        {/* Classes & Joining */}
        <div className="space-y-2 pt-4">
          <div className="flex justify-between items-center">
            <h3 className="font-bold flex items-center gap-2"><MapPin className="h-4 w-4" /> My Classes</h3>
          </div>
          
          {enrolledClasses.length === 0 ? (
            <Card className="border-dashed border-2">
              <CardContent className="py-8 text-center text-muted-foreground space-y-4">
                <p>You aren't in any classes yet.</p>
                <form onSubmit={handleJoinClass} className="flex gap-2 max-w-xs mx-auto">
                  <Input placeholder="6-digit code" value={joinCode} onChange={(e) => setJoinCode(e.target.value)} maxLength={6} className="uppercase font-mono" />
                  <Button type="submit" disabled={isSubmitting}><ArrowRight className="h-4 w-4" /></Button>
                </form>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-2">
              {enrolledClasses.map(c => (
                <Card key={c.id} className="card-hover">
                  <CardContent className="p-3 flex justify-between items-center">
                    <div>
                      <p className="font-bold">Period {c.period_order}: {c.name}</p>
                      <p className="text-xs text-muted-foreground">{c.teacher_name}</p>
                    </div>
                    <History className="h-4 w-4 text-muted-foreground" />
                  </CardContent>
                </Card>
              ))}
              <Button variant="outline" size="sm" className="w-full border-dashed" onClick={() => setJoinCode('show_input')}>
                <Plus className="h-3 w-3 mr-2" /> Join another class
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default StudentView;
