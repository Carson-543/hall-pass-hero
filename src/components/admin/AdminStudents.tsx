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
    MessageSquare,
    BookOpen,
    Check
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
    DialogFooter,
    DialogDescription
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

interface ClassEnrollment {
    id: string;
    name: string;
    teacher_name: string;
    is_enrolled: boolean;
}

export const AdminStudents = () => {
    const { toast } = useToast();
    const [searchQuery, setSearchQuery] = useState('');
    const [students, setStudents] = useState<Student[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
    const [overlapData, setOverlapData] = useState<OverlapData[]>([]);
    const [showOverlapDialog, setShowOverlapDialog] = useState(false);

    // Enrollment State
    const [showEnrollmentDialog, setShowEnrollmentDialog] = useState(false);
    const [availableClasses, setAvailableClasses] = useState<ClassEnrollment[]>([]);
    const [loadingEnrollments, setLoadingEnrollments] = useState(false);

    useEffect(() => {
        fetchStudents();
    }, [searchQuery]);

    const fetchStudents = async () => {
        setLoading(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { data: membership } = await supabase
                .from('organization_memberships')
                .select('organization_id')
                .eq('user_id', user.id)
                .single();

            if (!membership) return;

            // 1. Fetch profiles that have the 'student' role in this org
            let query = supabase
                .from('profiles')
                .select(`
                    id, 
                    full_name,
                    user_roles!inner(role)
                `)
                .eq('organization_id', membership.organization_id)
                .eq('user_roles.role', 'student' as any)
                .order('full_name');

            if (searchQuery) {
                query = query.ilike('full_name', `%${searchQuery}%`);
            }

            const { data: profiles, error: profileError } = await query.limit(100);
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

    const handleShowEnrollments = async (student: Student) => {
        setSelectedStudent(student);
        setShowEnrollmentDialog(true);
        setLoadingEnrollments(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            const { data: membership } = await supabase
                .from('organization_memberships')
                .select('organization_id')
                .eq('user_id', user?.id)
                .single();

            if (!membership) return;

            // Fetch all classes in org
            const { data: classes, error: classError } = await supabase
                .from('classes')
                .select(`
                    id, 
                    name, 
                    profiles!classes_teacher_id_fkey(full_name)
                `)
                .eq('organization_id', membership.organization_id)
                .order('name');

            if (classError) throw classError;

            // Fetch current enrollments
            const { data: enrollments, error: enrollError } = await supabase
                .from('class_enrollments')
                .select('class_id')
                .eq('student_id', student.id);

            if (enrollError) throw enrollError;

            const enrolledIds = new Set(enrollments?.map(e => e.class_id) || []);

            const mapped: ClassEnrollment[] = (classes || []).map(c => ({
                id: c.id,
                name: c.name,
                teacher_name: (c.profiles as any)?.full_name || 'Unknown',
                is_enrolled: enrolledIds.has(c.id)
            }));

            setAvailableClasses(mapped);
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to load enrollments', variant: 'destructive' });
        } finally {
            setLoadingEnrollments(false);
        }
    };

    const toggleEnrollment = async (classId: string, currentlyEnrolled: boolean) => {
        if (!selectedStudent) return;

        try {
            if (currentlyEnrolled) {
                const { error } = await supabase
                    .from('class_enrollments')
                    .delete()
                    .eq('class_id', classId)
                    .eq('student_id', selectedStudent.id);
                if (error) throw error;
            } else {
                const { error } = await supabase
                    .from('class_enrollments')
                    .insert({ class_id: classId, student_id: selectedStudent.id });
                if (error) throw error;
            }

            setAvailableClasses(prev => prev.map(c =>
                c.id === classId ? { ...c, is_enrolled: !currentlyEnrolled } : c
            ));

            toast({
                title: currentlyEnrolled ? 'Unenrolled' : 'Enrolled',
                description: `Student ${currentlyEnrolled ? 'removed from' : 'added to'} class.`
            });
        } catch (error) {
            toast({ title: 'Error', description: 'Action failed', variant: 'destructive' });
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
        if (!confirm('Are you sure you want to remove this student from the organization?')) return;

        try {
            const { error } = await supabase
                .from('profiles')
                .update({ organization_id: null })
                .eq('id', studentId);

            if (error) throw error;

            setStudents(prev => prev.filter(s => s.id !== studentId));
            toast({ title: 'Student Removed' });
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to remove student', variant: 'destructive' });
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-12">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-3xl font-black text-white tracking-tighter uppercase">Roster</h2>
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mt-1">Directory • {students.length} Entries</p>
                </div>
                <div className="relative group min-w-[350px]">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 group-hover:text-blue-500 transition-colors" />
                    <Input
                        placeholder="Filter by name..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-12 h-12 bg-slate-950/50 border-white/5 text-white font-bold rounded-xl focus:border-blue-500/30 focus:ring-4 focus:ring-blue-500/5 placeholder:text-slate-600 transition-all shadow-2xl"
                    />
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex items-center gap-4 p-4 bg-white/5 rounded-2xl border border-white/5">
                    <div className="p-3 bg-blue-600/20 rounded-xl">
                        <Users className="h-5 w-5 text-blue-400" />
                    </div>
                    <div>
                        <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Enrolled Students</p>
                        <h4 className="text-xl font-black text-white">{students.length}</h4>
                    </div>
                </div>
                <div className="flex items-center gap-4 p-4 bg-white/5 rounded-2xl border border-white/5">
                    <div className="p-3 bg-emerald-600/20 rounded-xl">
                        <Activity className="h-5 w-5 text-emerald-400" />
                    </div>
                    <div>
                        <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Total Weekly Passes</p>
                        <h4 className="text-xl font-black text-white">{students.reduce((acc, s) => acc + s.weekly_pass_count, 0)}</h4>
                    </div>
                </div>
            </div>

            <div className="space-y-2">
                {loading ? (
                    <div className="py-20 text-center">
                        <div className="inline-block w-8 h-8 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                    </div>
                ) : students.length === 0 ? (
                    <div className="py-20 text-center bg-white/5 rounded-3xl border border-dashed border-white/10">
                        <p className="text-slate-500 font-bold uppercase tracking-widest text-xs">No students found</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-2">
                        <AnimatePresence mode="popLayout">
                            {students.map((student) => (
                                <motion.div
                                    layout
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, scale: 0.98 }}
                                    key={student.id}
                                >
                                    <div className="flex items-center justify-between p-3 px-6 bg-slate-900/40 border border-white/5 hover:border-blue-500/30 transition-all rounded-xl group">
                                        <div className="flex items-center gap-6 flex-1">
                                            <div className="min-w-[200px]">
                                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-600 mb-0.5">Student Name</p>
                                                <h4 className="font-black text-white uppercase group-hover:text-blue-400 transition-colors">{student.full_name}</h4>
                                            </div>

                                            <div className="hidden md:block">
                                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-600 mb-0.5">Weekly Usage</p>
                                                <div className="flex items-center gap-2">
                                                    <div className="h-1.5 w-24 bg-white/5 rounded-full overflow-hidden">
                                                        <div
                                                            className={`h-full rounded-full ${student.weekly_pass_count > 5 ? 'bg-red-500' : 'bg-blue-500'}`}
                                                            style={{ width: `${Math.min((student.weekly_pass_count / 10) * 100, 100)}%` }}
                                                        />
                                                    </div>
                                                    <span className={`text-xs font-black ${student.weekly_pass_count > 5 ? 'text-red-400' : 'text-blue-400'}`}>
                                                        {student.weekly_pass_count}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleShowOverlap(student)}
                                                className="h-9 px-4 rounded-lg bg-blue-600/5 text-blue-400 hover:bg-blue-600/20 font-black text-[10px] tracking-widest border border-blue-500/10"
                                            >
                                                <History className="h-3.5 w-3.5 mr-2" /> OVERLAPS
                                            </Button>

                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg hover:bg-white/10 text-slate-500">
                                                        <MoreVertical className="h-4 w-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent className="bg-slate-900 border-white/10 text-white rounded-xl shadow-2xl">
                                                    <DropdownMenuItem
                                                        onClick={() => handleShowEnrollments(student)}
                                                        className="focus:bg-blue-600 focus:text-white cursor-pointer font-bold gap-2 text-xs"
                                                    >
                                                        <Plus className="h-3.5 w-3.5" /> Manage Enrollments
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem
                                                        onClick={() => handleRemoveStudent(student.id)}
                                                        className="focus:bg-red-600 focus:text-white cursor-pointer font-bold text-red-400 gap-2 text-xs"
                                                    >
                                                        <UserMinus className="h-3.5 w-3.5" /> Remove from Org
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </div>
                                    </div>
                                </motion.div>
                            ))}
                        </AnimatePresence>
                    </div>
                )}
            </div>

            {/* Overlap Dialog */}
            <Dialog open={showOverlapDialog} onOpenChange={setShowOverlapDialog}>
                <DialogContent className="bg-slate-950 border-white/10 text-white max-w-2xl rounded-[2rem] p-0 overflow-hidden shadow-3xl">
                    <div className="p-8 bg-gradient-to-br from-blue-600/20 to-transparent border-b border-white/10">
                        <h2 className="text-3xl font-black tracking-tighter uppercase">Hallway Correlation</h2>
                        <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px] mt-1 italic">
                            Analyzing movement patterns for {selectedStudent?.full_name}
                        </p>
                    </div>

                    <div className="p-8 space-y-3 max-h-[50vh] overflow-y-auto">
                        {overlapData.length === 0 ? (
                            <div className="py-12 text-center text-slate-500 font-bold bg-white/5 rounded-2xl border border-dashed border-white/10">
                                No significant historical overlaps found
                            </div>
                        ) : (
                            overlapData.map((d) => (
                                <div key={d.other_student_id} className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/10">
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center font-black text-slate-400 text-sm">
                                            {d.other_student_name.charAt(0)}
                                        </div>
                                        <div>
                                            <p className="font-black text-white uppercase text-sm">{d.other_student_name}</p>
                                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{d.overlap_count} Shared Events</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-lg font-black text-blue-400 leading-none">{d.overlap_percentage.toFixed(0)}%</div>
                                        <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest mt-1">Consistency</p>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            {/* Enrollment Dialog */}
            <Dialog open={showEnrollmentDialog} onOpenChange={setShowEnrollmentDialog}>
                <DialogContent className="bg-slate-950 border-white/10 text-white max-w-2xl rounded-[2rem] p-0 overflow-hidden shadow-3xl">
                    <div className="p-8 bg-gradient-to-br from-emerald-600/20 to-transparent border-b border-white/10">
                        <h2 className="text-3xl font-black tracking-tighter uppercase">Class Enrollment</h2>
                        <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px] mt-1">
                            Managing course access for {selectedStudent?.full_name}
                        </p>
                    </div>

                    <div className="p-8 space-y-2 max-h-[50vh] overflow-y-auto">
                        {loadingEnrollments ? (
                            <div className="py-12 text-center">
                                <div className="inline-block w-6 h-6 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
                            </div>
                        ) : availableClasses.length === 0 ? (
                            <div className="py-12 text-center text-slate-500 font-bold bg-white/5 rounded-2xl border border-dashed border-white/10">
                                No active classes found in organization
                            </div>
                        ) : (
                            availableClasses.map((cls) => (
                                <div key={cls.id} className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/10 hover:border-emerald-500/20 transition-all">
                                    <div className="flex items-center gap-4">
                                        <div className={`p-2 rounded-lg ${cls.is_enrolled ? 'bg-emerald-600/20' : 'bg-white/5'}`}>
                                            <BookOpen className={`h-4 w-4 ${cls.is_enrolled ? 'text-emerald-400' : 'text-slate-500'}`} />
                                        </div>
                                        <div>
                                            <p className="font-black text-white uppercase text-sm">{cls.name}</p>
                                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{cls.teacher_name}</p>
                                        </div>
                                    </div>
                                    <Button
                                        onClick={() => toggleEnrollment(cls.id, cls.is_enrolled)}
                                        className={`h-9 px-4 rounded-lg font-black text-[10px] tracking-widest border transition-all ${cls.is_enrolled
                                            ? 'bg-red-600/10 border-red-500/20 text-red-400 hover:bg-red-600/20'
                                            : 'bg-emerald-600/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-600/20'
                                            }`}
                                    >
                                        {cls.is_enrolled ? 'UNENROLL' : 'ENROLL'}
                                    </Button>
                                </div>
                            ))
                        )}
                    </div>
                    <div className="p-6 bg-white/5 border-t border-white/5">
                        <Button onClick={() => setShowEnrollmentDialog(false)} className="w-full h-12 bg-slate-800 hover:bg-slate-700 text-white font-black rounded-xl uppercase tracking-widest text-xs">Done</Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
};
