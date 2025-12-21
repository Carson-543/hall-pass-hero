import { useState, useEffect, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { PeriodDisplay } from '@/components/PeriodDisplay';
import { ElapsedTimer } from '@/components/ElapsedTimer';
import { 
  LogOut, Plus, Users, AlertTriangle, Check, X, 
  Copy, UserMinus, ClipboardList, Clock, Search, Loader2 
} from 'lucide-react';
import { format, startOfWeek } from 'date-fns';

interface ClassInfo {
  id: string;
  name: string;
  period_order: number;
  join_code: string;
}

interface PendingPass {
  id: string;
  student_id: string;
  student_name: string;
  destination: string;
  status: string;
  requested_at: string;
  approved_at?: string;
  is_quota_exceeded: boolean;
}

interface Student {
  id: string;
  name: string;
  email: string;
}

const TeacherDashboard = () => {
  const { user, role, signOut, loading: authLoading } = useAuth();
  const { toast } = useToast();

  // Core Data States
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [pendingPasses, setPendingPasses] = useState<PendingPass[]>([]);
  const [activePasses, setActivePasses] = useState<PendingPass[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isActionLoading, setIsActionLoading] = useState(false);

  // UI / Dialog States
  const [createPassDialogOpen, setCreatePassDialogOpen] = useState(false);
  const [selectedStudentForPass, setSelectedStudentForPass] = useState('');
  const [selectedDestination, setSelectedDestination] = useState('');
  const [customDestination, setCustomDestination] = useState('');

  const DESTINATIONS = ['Restroom', 'Locker', 'Office', 'Other'];

  // 1. Fetch Classes (Init)
  const fetchClasses = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('classes')
      .select('*')
      .eq('teacher_id', user.id)
      .order('period_order');

    if (data && data.length > 0) {
      setClasses(data);
      if (!selectedClassId) setSelectedClassId(data[0].id);
    }
  };

  // 2. Fetch Students (Roster)
  const fetchRoster = async (classId: string) => {
    const { data } = await supabase
      .from('class_enrollments')
      .select(`profiles (id, full_name, email)`)
      .eq('class_id', classId);

    if (data) {
      setStudents(data.map((item: any) => ({
        id: item.profiles.id,
        name: item.profiles.full_name,
        email: item.profiles.email
      })));
    }
  };

  // 3. Fetch Passes (Requests & Active)
  const fetchPasses = useCallback(async (classId: string) => {
    const { data: passes } = await supabase
      .from('passes')
      .select(`
        id, 
        student_id, 
        destination, 
        status, 
        requested_at, 
        approved_at, 
        profiles!passes_student_id_fkey (full_name)
      `)
      .eq('class_id', classId)
      .in('status', ['pending', 'approved', 'pending_return']);

    if (!passes) return;

    // Quota Logic
    const { data: settings } = await supabase.from('weekly_quota_settings').select('weekly_limit').single();
    const limit = settings?.weekly_limit ?? 4;
    const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 }).toISOString();

    const processed = await Promise.all(passes.map(async (p: any) => {
      let exceeded = false;
      if (p.status === 'pending' && p.destination === 'Restroom') {
        const { count } = await supabase
          .from('passes')
          .select('*', { count: 'exact', head: true })
          .eq('student_id', p.student_id)
          .eq('destination', 'Restroom')
          .in('status', ['approved', 'pending_return', 'returned'])
          .gte('requested_at', weekStart);
        exceeded = (count ?? 0) >= limit;
      }
      return {
        id: p.id,
        student_id: p.student_id,
        student_name: p.profiles?.full_name ?? 'Unknown',
        destination: p.destination,
        status: p.status,
        requested_at: p.requested_at,
        approved_at: p.approved_at,
        is_quota_exceeded: exceeded
      };
    }));

    setPendingPasses(processed.filter(p => p.status === 'pending'));
    setActivePasses(processed.filter(p => p.status !== 'pending'));
  }, []);

  // Sync Logic
  useEffect(() => { fetchClasses(); }, [user]);

  useEffect(() => {
    if (selectedClassId) {
      fetchPasses(selectedClassId);
      fetchRoster(selectedClassId);

      const channel = supabase.channel(`teacher-sync-${selectedClassId}`)
        .on('postgres_changes', { 
          event: '*', 
          schema: 'public', 
          table: 'passes', 
          filter: `class_id=eq.${selectedClassId}` 
        }, () => fetchPasses(selectedClassId))
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'class_enrollments',
          filter: `class_id=eq.${selectedClassId}`
        }, () => fetchRoster(selectedClassId))
        .subscribe();

      return () => { supabase.removeChannel(channel); };
    }
  }, [selectedClassId, fetchPasses]);

  const handleApprove = async (id: string, override: boolean) => {
    await supabase.from('passes').update({
      status: 'approved',
      approved_at: new Date().toISOString(),
      approved_by: user!.id,
      is_quota_override: override
    }).eq('id', id);
  };

  const handleDeny = async (id: string) => {
    await supabase.from('passes').update({
      status: 'denied',
      denied_at: new Date().toISOString(),
      denied_by: user!.id
    }).eq('id', id);
  };

  const handleCheckIn = async (id: string) => {
    await supabase.from('passes').update({
      status: 'returned',
      returned_at: new Date().toISOString(),
      confirmed_by: user!.id
    }).eq('id', id);
  };

  const handleQuickPass = async () => {
    if (!selectedStudentForPass || !selectedDestination || isActionLoading) return;
    setIsActionLoading(true);
    
    const dest = selectedDestination === 'Other' ? customDestination : selectedDestination;
    const { error } = await supabase.from('passes').insert({
      student_id: selectedStudentForPass,
      class_id: selectedClassId,
      destination: dest,
      status: 'approved',
      approved_at: new Date().toISOString(),
      approved_by: user!.id
    });

    setIsActionLoading(false);
    if (!error) {
      setCreatePassDialogOpen(false);
      setSelectedStudentForPass('');
      setSelectedDestination('');
      toast({ title: 'Pass Issued' });
    }
  };

  if (authLoading) return <div className="min-h-screen flex items-center justify-center bg-slate-50"><Loader2 className="animate-spin h-8 w-8 text-primary" /></div>;
  if (!user || role !== 'teacher') return <Navigate to="/auth" replace />;

  const filteredStudents = students.filter(s => s.name.toLowerCase().includes(searchQuery.toLowerCase()));
  const currentClass = classes.find(c => c.id === selectedClassId);

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-4 max-w-2xl mx-auto pb-32">
      {/* Header */}
      <header className="flex items-center justify-between mb-8 pt-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center shadow-lg shadow-primary/20">
            <span className="text-white font-bold text-xl">T</span>
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Teacher Central</h1>
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Pass Management</p>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={signOut} className="rounded-full bg-white shadow-sm border">
          <LogOut className="h-5 w-5 text-slate-600" />
        </Button>
      </header>

      <div className="space-y-6">
        <PeriodDisplay />

        {/* Class Selector */}
        <Select value={selectedClassId} onValueChange={setSelectedClassId}>
          <SelectTrigger className="h-16 rounded-[28px] bg-white border-none shadow-sm text-lg font-bold px-6">
            <SelectValue placeholder="Select Class" />
          </SelectTrigger>
          <SelectContent className="rounded-2xl">
            {classes.map(c => (
              <SelectItem key={c.id} value={c.id}>Period {c.period_order}: {c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Navigation Tabs */}
        <Tabs defaultValue="active" className="w-full">
          <TabsList className="w-full bg-slate-200/50 p-1 rounded-[28px] h-14">
            <TabsTrigger value="active" className="flex-1 rounded-2xl h-12 font-bold data-[state=active]:shadow-md">Active ({activePasses.length})</TabsTrigger>
            <TabsTrigger value="requests" className="flex-1 rounded-2xl h-12 font-bold relative data-[state=active]:shadow-md">
              Requests
              {pendingPasses.length > 0 && <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center animate-bounce">{pendingPasses.length}</span>}
            </TabsTrigger>
            <TabsTrigger value="roster" className="flex-1 rounded-2xl h-12 font-bold data-[state=active]:shadow-md">Roster</TabsTrigger>
          </TabsList>

          {/* Active Passes View */}
          <TabsContent value="active" className="mt-6 space-y-4">
            {activePasses.length === 0 ? (
               <div className="text-center py-16 bg-white rounded-[40px] border-2 border-dashed border-slate-200">
                 <Clock className="mx-auto h-12 w-12 text-slate-300 mb-4" />
                 <p className="text-slate-500 font-bold">Classroom is full</p>
               </div>
            ) : (
              activePasses.map(pass => (
                <Card key={pass.id} className="rounded-[32px] border-none shadow-sm overflow-hidden bg-white">
                  <div className="h-1.5 bg-primary w-full" />
                  <CardContent className="p-6 flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-black text-slate-900">{pass.student_name}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="px-3 py-1 bg-slate-100 rounded-full text-[10px] font-black text-slate-600 uppercase tracking-tighter">{pass.destination}</span>
                        {pass.approved_at && <ElapsedTimer startTime={pass.approved_at} destination={pass.destination} />}
                      </div>
                    </div>
                    <Button onClick={() => handleCheckIn(pass.id)} className="rounded-2xl h-12 px-6 shadow-lg shadow-primary/20 font-bold">Check In</Button>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          {/* Pending Requests View */}
          <TabsContent value="requests" className="mt-6 space-y-4">
            {pendingPasses.length === 0 ? (
               <div className="text-center py-16 bg-white rounded-[40px] border-2 border-dashed border-slate-200">
                  <Check className="mx-auto h-12 w-12 text-green-300 mb-4" />
                  <p className="text-slate-500 font-bold">No pending requests</p>
               </div>
            ) : pendingPasses.map(pass => (
              <Card key={pass.id} className={`rounded-[32px] border-none shadow-sm ${pass.is_quota_exceeded ? 'bg-red-50' : 'bg-white'}`}>
                <CardContent className="p-6 flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-black text-slate-900">{pass.student_name}</h3>
                      {pass.is_quota_exceeded && <div className="flex items-center gap-1 text-red-600 bg-red-100 px-2 py-0.5 rounded-lg"><AlertTriangle className="h-3 w-3" /><span className="text-[10px] font-black uppercase">Quota!</span></div>}
                    </div>
                    <p className="text-slate-500 font-bold text-sm">{pass.destination}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="icon" variant="ghost" className="h-12 w-12 rounded-2xl bg-slate-100" onClick={() => handleDeny(pass.id)}><X className="h-5 w-5 text-slate-600" /></Button>
                    <Button size="icon" variant={pass.is_quota_exceeded ? "destructive" : "default"} className="h-12 w-12 rounded-2xl shadow-lg" onClick={() => handleApprove(pass.id, pass.is_quota_exceeded)}><Check className="h-5 w-5" /></Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          {/* Roster View */}
          <TabsContent value="roster" className="mt-6 space-y-4">
             {currentClass && (
               <div className="bg-primary/5 rounded-[32px] p-6 border border-primary/10 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] uppercase font-black text-primary mb-1">Class Join Code</p>
                    <code className="text-2xl font-black tracking-widest text-primary">{currentClass.join_code}</code>
                  </div>
                  <Button variant="ghost" className="rounded-2xl h-12 w-12" onClick={() => {navigator.clipboard.writeText(currentClass.join_code); toast({title: 'Copied!'})}}><Copy className="h-5 w-5" /></Button>
               </div>
             )}
             <div className="relative">
                <Search className="absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                <Input placeholder="Search students..." className="h-14 pl-14 rounded-3xl border-none shadow-sm font-medium" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
             </div>
             <div className="space-y-2">
                {filteredStudents.map(student => (
                  <div key={student.id} className="bg-white p-4 rounded-3xl shadow-sm border border-slate-100 flex items-center justify-between">
                    <div>
                      <p className="font-bold text-slate-900">{student.name}</p>
                      <p className="text-xs text-slate-500">{student.email}</p>
                    </div>
                    <Button size="icon" variant="ghost" className="rounded-xl"><ClipboardList className="h-5 w-5 text-slate-400" /></Button>
                  </div>
                ))}
             </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Floating Action Button */}
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 w-full max-w-md px-4">
        <Button 
          disabled={!selectedClassId}
          onClick={() => setCreatePassDialogOpen(true)}
          className="w-full h-16 rounded-[28px] shadow-2xl shadow-primary/40 text-lg font-black flex items-center justify-center gap-3 active:scale-95 transition-transform"
        >
          <Plus className="h-6 w-6 stroke-[3px]" />
          ISSUE QUICK PASS
        </Button>
      </div>

      {/* Quick Issue Dialog */}
      <Dialog open={createPassDialogOpen} onOpenChange={setCreatePassDialogOpen}>
        <DialogContent className="rounded-[40px] max-w-sm">
          <DialogHeader><DialogTitle className="text-xl font-black">Quick Pass</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-[10px] uppercase font-black text-slate-400">Select Student</Label>
              <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto p-1">
                {students.map(s => (
                  <Button key={s.id} variant={selectedStudentForPass === s.id ? 'default' : 'outline'} size="sm" className="rounded-xl font-bold" onClick={() => setSelectedStudentForPass(s.id)}>
                    {s.name.split(' ')[0]}
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] uppercase font-black text-slate-400">Location</Label>
              <div className="grid grid-cols-2 gap-2">
                {DESTINATIONS.map(d => <Button key={d} variant={selectedDestination === d ? 'default' : 'outline'} className="rounded-xl font-bold" onClick={() => setSelectedDestination(d)}>{d}</Button>)}
              </div>
            </div>
            {selectedDestination === 'Other' && <Input placeholder="Specific location..." className="rounded-xl h-12" value={customDestination} onChange={(e) => setCustomDestination(e.target.value)} />}
            <Button onClick={handleQuickPass} className="w-full h-14 rounded-2xl font-black text-lg mt-4" disabled={isActionLoading}>
              {isActionLoading ? <Loader2 className="animate-spin" /> : "ISSUE PASS"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TeacherDashboard;
