import React, { useState, useEffect } from 'react';
import {
    GraduationCap,
    Search,
    Trash2,
    History,
    Users,
    Plus,
    X,
    MoreVertical,
    ChevronRight,
    TrendingDown,
    TrendingUp,
    Activity,
    UserMinus,
    MessageSquare
} from 'lucide-react';
import { GlassCard } from '@/components/ui/glass-card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter
} from '@/components/ui/dialog';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { motion, AnimatePresence } from 'framer-motion';

interface Student {
    id: string;
    full_name: string;
    weekly_pass_count: number;
}

interface OverlapData {
    other_student_id: string;
    other_student_name: string;
    overlap_count: number;
    overlap_percentage: number;
}

export const AdminStudents = () => {
    const { toast } = useToast();
    const [searchQuery, setSearchQuery] = useState('');
    const [students, setStudents] = useState<Student[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
    const [overlapData, setOverlapData] = useState<OverlapData[]>([]);
    const [showOverlapDialog, setShowOverlapDialog] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    useEffect(() => {
        fetchStudents();
    }, [searchQuery]);

    const fetchStudents = async () => {
        setLoading(true);
        try {
            // Get current user's organization
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { data: membership } = await supabase
                .from('organization_memberships')
                .select('organization_id')
                .eq('user_id', user.id)
                .single();

            if (!membership) return;

            // 1. Fetch student profiles in org
            let query = supabase
                .from('profiles')
                .select('id, full_name')
                .eq('organization_id', membership.organization_id)
                .order('full_name');

            if (searchQuery) {
                query = query.ilike('full_name', `%${searchQuery}%`);
            }

            const { data: profiles, error: profileError } = await query.limit(50);
            if (profileError) throw profileError;

            // 2. Fetch weekly pass counts
            const startOfWeek = new Date();
            startOfWeek.setHours(0, 0, 0, 0);
            startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());

            const { data: counts, error: passError } = await (supabase.rpc as any)('get_weekly_pass_counts', {
                p_org_id: membership.organization_id,
                p_start_date: startOfWeek.toISOString()
            });

            const countMap = new Map(counts?.map((c: any) => [c.student_id, c.count]) || []);

            setStudents(profiles.map(p => ({
                id: p.id as string,
                full_name: (p as any).full_name as string,
                weekly_pass_count: Number(countMap.get(p.id) || 0)
            })));

        } catch (error) {
            console.error('Error fetching students:', error);
            toast({ title: 'Error', description: 'Failed to load students', variant: 'destructive' });
        } finally {
            setLoading(false);
        }
    };

    const handleShowOverlap = async (student: Student) => {
        setSelectedStudent(student);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            const { data: membership } = await supabase
                .from('organization_memberships')
                .select('organization_id')
                .eq('user_id', user?.id)
                .single();

            const { data, error } = await (supabase.rpc as any)('get_student_overlaps', {
                p_student_id: student.id,
                p_org_id: membership?.organization_id
            });

            if (error) throw error;
            setOverlapData(data || []);
            setShowOverlapDialog(true);
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to load overlap analytics', variant: 'destructive' });
        }
    };

    const handleRemoveStudent = async (studentId: string) => {
        if (!confirm('Are you sure you want to remove this student from the organization? This will also remove them from all classes.')) return;

        setIsDeleting(true);
        try {
            // 1. Remove from all classes in org
            // 2. Clear organization_id from profile
            const { error } = await supabase
                .from('profiles')
                .update({ organization_id: null })
                .eq('id', studentId);

            if (error) throw error;

            setStudents(prev => prev.filter(s => s.id !== studentId));
            toast({ title: 'Student Removed', description: 'Student successfully removed from organization.' });
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to remove student', variant: 'destructive' });
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-12">
            {/* Header & Search */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-3xl font-black text-white tracking-tighter">School Roster</h2>
                    <p className="text-sm font-bold text-slate-500 uppercase tracking-widest mt-1 italic">Managing {students.length} filtered students</p>
                </div>
                <div className="relative group min-w-[300px]">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 group-hover:text-blue-500 transition-colors" />
                    <Input
                        placeholder="Search students..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-12 h-14 bg-slate-900/50 border-white/10 text-white font-bold rounded-2xl focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/10 placeholder:text-slate-600 transition-all"
                    />
                </div>
            </div>

            {/* Stats Overview */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                <GlassCard className="p-6 bg-blue-600/10 border-blue-500/20">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-blue-600 rounded-2xl shadow-lg shadow-blue-500/20">
                            <Users className="h-6 w-6 text-white" />
                        </div>
                        <div>
                            <p className="text-xs font-black uppercase tracking-widest text-blue-400">Total Enrolled</p>
                            <h4 className="text-2xl font-black text-white">{students.length}</h4>
                        </div>
                    </div>
                </GlassCard>
                <GlassCard className="p-6 bg-amber-600/10 border-amber-500/20">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-amber-600 rounded-2xl shadow-lg shadow-amber-500/20">
                            <Activity className="h-6 w-6 text-white" />
                        </div>
                        <div>
                            <p className="text-xs font-black uppercase tracking-widest text-amber-400">Avg Weekly Passes</p>
                            <h4 className="text-2xl font-black text-white">
                                {students.length > 0 ? (students.reduce((acc, s) => acc + s.weekly_pass_count, 0) / students.length).toFixed(1) : '0.0'}
                            </h4>
                        </div>
                    </div>
                </GlassCard>
                <GlassCard className="p-6 bg-slate-800/50 border-white/10">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-slate-700 rounded-2xl">
                            <TrendingUp className="h-6 w-6 text-white" />
                        </div>
                        <div>
                            <p className="text-xs font-black uppercase tracking-widest text-slate-400">Peak Activity</p>
                            <h4 className="text-2xl font-black text-white">Period 4</h4>
                        </div>
                    </div>
                </GlassCard>
            </div>

            {/* Student Grid */}
            {loading ? (
                <div className="py-20 text-center space-y-4">
                    <div className="inline-block w-12 h-12 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                    <p className="text-slate-500 font-bold uppercase tracking-widest text-xs">Accessing Student Directory...</p>
                </div>
            ) : students.length === 0 ? (
                <GlassCard className="py-20 text-center bg-slate-900/40 border-dashed border-white/10">
                    <p className="text-slate-500 font-bold">No students found matching your criteria</p>
                </GlassCard>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <AnimatePresence mode="popLayout">
                        {students.map((student) => (
                            <motion.div
                                layout
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                key={student.id}
                            >
                                <GlassCard className="group relative overflow-hidden p-6 hover:border-blue-500/40 transition-all duration-300 bg-slate-900/40">
                                    <div className="flex flex-col gap-4">
                                        <div className="flex items-start justify-between">
                                            <div className="flex items-center gap-4">
                                                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-slate-700 to-slate-800 border-2 border-white/10 flex items-center justify-center font-black text-xl text-white shadow-xl">
                                                    {student.full_name.charAt(0)}
                                                </div>
                                                <div>
                                                    <h4 className="text-lg font-black text-white tracking-tight leading-none mb-1 group-hover:text-blue-400 transition-colors uppercase whitespace-nowrap overflow-hidden text-ellipsis max-w-[140px]">{student.full_name}</h4>
                                                </div>
                                            </div>
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-slate-500 hover:text-white hover:bg-white/10">
                                                        <MoreVertical className="h-4 w-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent className="bg-slate-900 border-white/10 text-white rounded-xl shadow-2xl">
                                                    <DropdownMenuItem className="focus:bg-blue-600 focus:text-white cursor-pointer font-bold gap-2">
                                                        <Plus className="h-4 w-4" /> Manage Enrollments
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem
                                                        onClick={() => handleRemoveStudent(student.id)}
                                                        className="focus:bg-red-600 focus:text-white cursor-pointer font-bold text-red-400 gap-2"
                                                    >
                                                        <UserMinus className="h-4 w-4" /> Remove Student
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </div>

                                        <div className="grid grid-cols-2 gap-3 pt-2">
                                            <div className="p-3 bg-white/5 rounded-2xl border border-white/5 text-center transition-all group-hover:bg-white/10">
                                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Passes this week</p>
                                                <span className={`text-xl font-black ${student.weekly_pass_count > 5 ? 'text-red-400' : 'text-blue-400'}`}>
                                                    {student.weekly_pass_count}
                                                </span>
                                            </div>
                                            <button
                                                onClick={() => handleShowOverlap(student)}
                                                className="p-3 bg-blue-600/10 rounded-2xl border border-blue-500/20 text-center hover:bg-blue-600/20 transition-all flex flex-col items-center justify-center cursor-pointer group/overlap"
                                            >
                                                <History className="h-4 w-4 text-blue-400 mb-1 group-hover/overlap:scale-110 transition-transform" />
                                                <span className="text-[10px] font-black uppercase tracking-tight text-blue-400">Overlap Profile</span>
                                            </button>
                                        </div>
                                    </div>
                                </GlassCard>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </div>
            )}

            {/* Overlap Dialog */}
            <Dialog open={showOverlapDialog} onOpenChange={setShowOverlapDialog}>
                <DialogContent className="bg-slate-950 border-white/10 text-white max-w-2xl rounded-[2rem] p-0 overflow-hidden shadow-3xl">
                    <div className="p-8 bg-gradient-to-br from-blue-600/20 to-transparent border-b border-white/10">
                        <div className="flex items-center gap-6">
                            <div className="w-16 h-16 rounded-2xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/20 font-black text-2xl">
                                {selectedStudent?.full_name.charAt(0)}
                            </div>
                            <div>
                                <h2 className="text-3xl font-black tracking-tighter">Hallway Chemistry</h2>
                                <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px] mt-1 flex items-center gap-2">
                                    <Activity className="h-3 w-3 text-blue-500" /> Overlap analytics for {selectedStudent?.full_name}
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="p-8 space-y-6 max-h-[50vh] overflow-y-auto custom-scrollbar">
                        {overlapData.length === 0 ? (
                            <div className="py-12 text-center text-slate-500 font-bold bg-white/5 rounded-3xl border border-dashed border-white/10">
                                No consistent overlaps detected for this student
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {overlapData.map((d, i) => (
                                    <div key={d.other_student_id} className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/10 hover:bg-white/10 transition-all">
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center font-black text-slate-400 text-sm">
                                                {d.other_student_name.charAt(0)}
                                            </div>
                                            <div>
                                                <p className="font-black text-white">{d.other_student_name}</p>
                                                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{d.overlap_count} Shared Hallway Sessions</p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-lg font-black text-blue-400 leading-none">{d.overlap_percentage.toFixed(0)}%</div>
                                            <p className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest mt-1">Correlation</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="p-8 border-t border-white/10 bg-white/5">
                        <Button
                            onClick={() => setShowOverlapDialog(false)}
                            className="w-full h-14 bg-slate-800 hover:bg-slate-700 text-white font-black rounded-2xl transition-all"
                        >
                            CLOSE ANALYTICS
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
};
