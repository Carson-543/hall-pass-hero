import React, { useState, useEffect } from 'react';
import {
    Users,
    Plus,
    Search,
    MoreVertical,
    Edit,
    Trash2,
    BookOpen,
    UserCheck,
    ChevronRight,
    ShieldCheck,
    Building2,
    Clock,
    Hash
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
import { Label } from '@/components/ui/label';
import { motion, AnimatePresence } from 'framer-motion';

interface Teacher {
    id: string;
    full_name: string;
    classes: Class[];
}

interface Class {
    id: string;
    name: string;
    period_order: number;
    join_code: string;
}

export const AdminTeachers = () => {
    const { toast } = useToast();
    const [teachers, setTeachers] = useState<Teacher[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [isClassDialogOpen, setIsClassDialogOpen] = useState(false);
    const [editingClass, setEditingClass] = useState<Class | null>(null);
    const [selectedTeacherId, setSelectedTeacherId] = useState<string | null>(null);

    // Class Form State
    const [className, setClassName] = useState('');
    const [periodOrder, setPeriodOrder] = useState(1);

    useEffect(() => {
        fetchTeachers();
    }, [searchQuery]);

    const fetchTeachers = async () => {
        setLoading(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            const { data: membership } = await supabase
                .from('organization_memberships')
                .select('organization_id')
                .eq('user_id', user?.id)
                .single();

            if (!membership) return;

            // 1. Fetch teacher profiles in org
            let query = supabase
                .from('profiles')
                .select(`
          id, 
          full_name,
          user_roles!inner(role)
        `)
                .eq('organization_id', membership.organization_id)
                .eq('user_roles.role', 'teacher' as any)
                .order('full_name');

            if (searchQuery) {
                query = query.ilike('full_name', `%${searchQuery}%`);
            }

            const { data: profiles, error: profileError } = await query;
            if (profileError) throw profileError;

            // 2. Fetch classes for these teachers
            const teacherIds = profiles.map(p => p.id);
            const { data: classes, error: classError } = await supabase
                .from('classes')
                .select('*')
                .in('teacher_id', teacherIds)
                .order('period_order');

            if (classError) throw classError;

            const teacherMap = profiles.map((p: any) => ({
                id: p.id as string,
                full_name: p.full_name as string,
                classes: classes?.filter(c => c.teacher_id === p.id) || []
            }));

            setTeachers(teacherMap);
        } catch (error) {
            console.error('Error:', error);
            toast({ title: 'Error', description: 'Failed to load teachers', variant: 'destructive' });
        } finally {
            setLoading(false);
        }
    };

    const handleCreateOrUpdateClass = async () => {
        if (!className || !selectedTeacherId) return;

        try {
            const { data: { user } } = await supabase.auth.getUser();
            const { data: membership } = await supabase
                .from('organization_memberships')
                .select('organization_id')
                .eq('user_id', user?.id)
                .single();

            if (editingClass) {
                const { error } = await supabase
                    .from('classes')
                    .update({ name: className, period_order: periodOrder })
                    .eq('id', editingClass.id);
                if (error) throw error;
                toast({ title: 'Class Updated' });
            } else {
                const joinCode = Math.random().toString(36).substring(2, 8).toUpperCase();
                const { error } = await supabase
                    .from('classes')
                    .insert({
                        name: className,
                        period_order: periodOrder,
                        teacher_id: selectedTeacherId,
                        organization_id: membership?.organization_id,
                        join_code: joinCode
                    });
                if (error) throw error;
                toast({ title: 'Class Created', description: `Join Code: ${joinCode}` });
            }

            setIsClassDialogOpen(false);
            fetchTeachers();
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to save class', variant: 'destructive' });
        }
    };

    const handleDeleteClass = async (id: string) => {
        if (!confirm('Are you sure you want to delete this class? All pass history and enrollments will be lost.')) return;
        const { error } = await supabase.from('classes').delete().eq('id', id);
        if (error) toast({ title: 'Error', variant: 'destructive' });
        else {
            toast({ title: 'Class Deleted' });
            fetchTeachers();
        }
    };

    const openClassDialog = (teacherId: string, cls?: Class) => {
        setSelectedTeacherId(teacherId);
        if (cls) {
            setEditingClass(cls);
            setClassName(cls.name);
            setPeriodOrder(cls.period_order);
        } else {
            setEditingClass(null);
            setClassName('');
            setPeriodOrder(1);
        }
        setIsClassDialogOpen(true);
    };

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-3xl font-black text-white tracking-tighter">Teacher Roster</h2>
                    <p className="text-sm font-bold text-slate-500 uppercase tracking-widest mt-1">Manage staff and class configurations</p>
                </div>
                <div className="relative group min-w-[300px]">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 group-hover:text-blue-500 transition-colors" />
                    <Input
                        placeholder="Search teachers..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-12 h-14 bg-slate-900/50 border-white/10 text-white font-bold rounded-2xl focus:border-blue-500/50 placeholder:text-slate-600 transition-all shadow-inner"
                    />
                </div>
            </div>

            <div className="grid grid-cols-1 gap-6">
                {loading ? (
                    <div className="py-20 text-center">
                        <div className="inline-block w-8 h-8 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                    </div>
                ) : teachers.length === 0 ? (
                    <GlassCard className="py-20 text-center">
                        <p className="text-slate-500 font-bold">No teachers found</p>
                    </GlassCard>
                ) : (
                    teachers.map(teacher => (
                        <GlassCard key={teacher.id} className="p-0 overflow-hidden bg-slate-900/40 border-white/10 group/teacher hover:border-blue-500/30 transition-all duration-500">
                            <div className="p-6 bg-gradient-to-r from-blue-600/5 to-transparent border-b border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                                <div className="flex items-center gap-5">
                                    <div className="w-16 h-16 rounded-2xl bg-slate-800 border-2 border-white/10 flex items-center justify-center font-black text-2xl text-slate-400 shadow-xl group-hover/teacher:border-blue-500/50 group-hover/teacher:text-blue-400 transition-all">
                                        {teacher.full_name.charAt(0)}
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h3 className="text-xl font-black text-white tracking-tight uppercase">{teacher.full_name}</h3>
                                            <ShieldCheck className="h-4 w-4 text-blue-500" />
                                        </div>
                                    </div>
                                </div>
                                <Button
                                    onClick={() => openClassDialog(teacher.id)}
                                    className="bg-blue-600 hover:bg-blue-500 text-white font-black rounded-xl h-12 shadow-lg shadow-blue-600/20 gap-2 border-none"
                                >
                                    <Plus className="h-4 w-4" /> CREATE CLASS
                                </Button>
                            </div>

                            <div className="p-6">
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                    {teacher.classes.map(cls => (
                                        <div key={cls.id} className="group/class relative p-4 bg-slate-950/50 rounded-2xl border border-white/5 hover:border-blue-500/50 transition-all duration-300">
                                            <div className="flex items-start justify-between mb-4">
                                                <div className="p-2 bg-blue-600/10 rounded-xl">
                                                    <BookOpen className="h-5 w-5 text-blue-400" />
                                                </div>
                                                <div className="flex gap-1 opacity-0 group-hover/class:opacity-100 transition-opacity">
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8 rounded-lg text-blue-400 hover:bg-blue-600/20"
                                                        onClick={() => openClassDialog(teacher.id, cls)}
                                                    >
                                                        <Edit className="h-4 w-4" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8 rounded-lg text-red-400 hover:bg-red-600/20"
                                                        onClick={() => handleDeleteClass(cls.id)}
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            </div>
                                            <h4 className="font-black text-white text-lg leading-tight mb-2 uppercase">{cls.name}</h4>
                                            <div className="flex flex-col gap-2">
                                                <div className="flex items-center gap-2 text-[10px] font-black uppercase text-slate-500 tracking-widest">
                                                    <Clock className="h-3 w-3" /> Period {cls.period_order}
                                                </div>
                                                <div className="flex items-center gap-2 text-[10px] font-black uppercase text-blue-400 tracking-widest bg-blue-900/20 px-2 py-1 rounded-lg border border-blue-500/20 w-fit">
                                                    <Hash className="h-3 w-3" /> {cls.join_code}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                    {teacher.classes.length === 0 && (
                                        <div className="col-span-full py-8 text-center text-slate-600 font-bold uppercase tracking-widest text-[10px] border-2 border-dashed border-white/5 rounded-2xl bg-white/5">
                                            No active classes
                                        </div>
                                    )}
                                </div>
                            </div>
                        </GlassCard>
                    ))
                )}
            </div>

            <Dialog open={isClassDialogOpen} onOpenChange={setIsClassDialogOpen}>
                <DialogContent className="bg-slate-900 border-white/10 text-white rounded-[2rem] shadow-3xl overflow-hidden">
                    <DialogHeader className="p-6 border-b border-white/5 bg-gradient-to-br from-blue-600/10 to-transparent">
                        <DialogTitle className="text-2xl font-black tracking-tighter uppercase">{editingClass ? 'Edit Class' : 'Create New Class'}</DialogTitle>
                        <DialogDescription className="text-slate-400 font-bold text-xs uppercase tracking-widest">Configure classroom settings and periods</DialogDescription>
                    </DialogHeader>
                    <div className="p-8 space-y-6">
                        <div className="space-y-2">
                            <Label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Class Name</Label>
                            <Input
                                value={className}
                                onChange={(e) => setClassName(e.target.value)}
                                placeholder="e.g., Geometry, 11th Grade English"
                                className="h-14 bg-slate-950/50 border-white/10 text-white font-bold rounded-2xl focus:border-blue-500/50"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Daily Period Order</Label>
                            <Input
                                type="number"
                                min={1}
                                max={12}
                                value={periodOrder}
                                onChange={(e) => setPeriodOrder(parseInt(e.target.value) || 1)}
                                className="h-14 bg-slate-950/50 border-white/10 text-white font-bold rounded-2xl focus:border-blue-500/50"
                            />
                            <p className="text-[10px] text-slate-600 font-bold italic mt-1 ml-1">Determines when this class appears in the teacher's schedule each day.</p>
                        </div>
                    </div>
                    <DialogFooter className="p-6 bg-white/5 border-t border-white/5 gap-3">
                        <Button variant="outline" onClick={() => setIsClassDialogOpen(false)} className="flex-1 h-14 bg-white/5 border-white/10 text-slate-400 hover:text-white rounded-2xl font-black">CANCEL</Button>
                        <Button onClick={handleCreateOrUpdateClass} className="flex-[2] h-14 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl font-black shadow-xl shadow-blue-600/20 border-none">SAVE CONFIGURATION</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};
