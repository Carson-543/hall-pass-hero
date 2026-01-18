import React, { useState, useEffect } from 'react';
import {
    FileText,
    Search,
    Filter,
    Clock,
    User,
    Building2,
    ChevronDown,
    RotateCcw,
    CheckCircle2,
    XCircle,
    HelpCircle,
    Download,
    Calendar,
    MoreVertical,
    MapPin
} from 'lucide-react';
import { GlassCard } from '@/components/ui/glass-card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';

const PAGE_SIZE = 20;

export const AdminLogs = () => {
    const { toast } = useToast();
    const [logs, setLogs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [page, setPage] = useState(0);
    const [hasMore, setHasMore] = useState(true);

    // Filters
    const [statusFilter, setStatusFilter] = useState('all');
    const [studentSearch, setStudentSearch] = useState('');
    const [teacherFilter, setTeacherFilter] = useState('all');
    const [dateFilter, setDateFilter] = useState('');

    // Teacher List
    const [teachers, setTeachers] = useState<{ id: string, full_name: string }[]>([]);

    useEffect(() => {
        fetchInitialData();
    }, []);

    useEffect(() => {
        fetchLogs(0, true);
    }, [statusFilter, studentSearch, teacherFilter, dateFilter]);

    const fetchInitialData = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            const { data: membership } = await supabase
                .from('organization_memberships')
                .select('organization_id')
                .eq('user_id', user?.id)
                .single();

            if (!membership) return;

            const { data: staff, error } = await supabase
                .from('profiles')
                .select('id, full_name, user_roles!inner(role)')
                .eq('organization_id', membership.organization_id)
                .eq('user_roles.role', 'teacher' as any)
                .order('full_name');

            if (error) throw error;
            setTeachers(staff || []);
        } catch (error) {
            console.error('Error fetching staff:', error);
        }
    };

    const fetchLogs = async (pageNum: number, reset = false) => {
        if (reset) {
            setLoading(true);
            setPage(0);
        } else {
            setLoadingMore(true);
        }

        try {
            const { data: { user } } = await supabase.auth.getUser();
            const { data: membership } = await supabase
                .from('organization_memberships')
                .select('organization_id')
                .eq('user_id', user?.id)
                .single();

            if (!membership) return;

            // Simplified query to avoid join ambiguity
            let query = supabase
                .from('passes')
                .select(`
                    id,
                    requested_at,
                    status,
                    destination,
                    student:profiles!passes_student_id_fkey(full_name),
                    class:classes!inner(
                        name, 
                        organization_id, 
                        teacher:profiles!classes_teacher_id_fkey(full_name, id)
                    )
                `)
                .eq('classes.organization_id', membership.organization_id)
                .order('requested_at', { ascending: false })
                .range(pageNum * PAGE_SIZE, (pageNum + 1) * PAGE_SIZE - 1);

            if (statusFilter !== 'all') {
                query = query.eq('status', statusFilter as any);
            }
            if (studentSearch) {
                query = query.ilike('profiles.full_name', `%${studentSearch}%`);
            }
            if (teacherFilter !== 'all') {
                query = query.eq('classes.teacher_id', teacherFilter);
            }
            if (dateFilter) {
                query = query.gte('requested_at', `${dateFilter}T00:00:00Z`)
                    .lte('requested_at', `${dateFilter}T23:59:59Z`);
            }

            const { data, error } = await query;
            if (error) throw error;

            const transformed = (data || []).map((l: any) => ({
                id: l.id,
                requested_at: l.requested_at,
                status: l.status,
                destination: l.destination,
                student_name: l.student?.full_name || 'Unknown Student',
                class_name: l.class?.name || 'Deleted Class',
                teacher_name: l.class?.teacher?.full_name || 'Unknown Teacher'
            }));

            if (reset) {
                setLogs(transformed);
            } else {
                setLogs(prev => [...prev, ...transformed]);
            }

            setHasMore(data.length === PAGE_SIZE);
        } catch (error) {
            console.error('Logs fetch error:', error);
            toast({ title: 'Error', description: 'Failed to load logs', variant: 'destructive' });
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    };

    const handleLoadMore = () => {
        const nextPage = page + 1;
        setPage(nextPage);
        fetchLogs(nextPage);
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'returned': return <CheckCircle2 className="h-4 w-4 text-emerald-400" />;
            case 'denied': return <XCircle className="h-4 w-4 text-red-400" />;
            case 'approved': return <Clock className="h-4 w-4 text-blue-400" />;
            case 'pending_return': return <RotateCcw className="h-4 w-4 text-amber-400" />;
            default: return <HelpCircle className="h-4 w-4 text-slate-400" />;
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-12">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-3xl font-black text-white tracking-tighter uppercase">Audit Logs</h2>
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mt-1">Pass History & Compliance</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" className="h-12 bg-white/5 border-white/5 text-slate-400 hover:text-white hover:bg-emerald-600/20 hover:border-emerald-500/30 rounded-xl font-black px-6 gap-2 transition-all">
                        <Download className="h-4 w-4" /> EXPORT CSV
                    </Button>
                </div>
            </div>

            <GlassCard className="p-4 bg-slate-900/60 border-white/5 shadow-2xl">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div className="relative group">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-600 group-focus-within:text-blue-500 transition-colors" />
                        <Input
                            placeholder="Student Name..."
                            value={studentSearch}
                            onChange={(e) => setStudentSearch(e.target.value)}
                            className="pl-10 h-10 bg-slate-950/50 border-white/5 text-white font-bold rounded-lg focus:border-blue-500/30 text-xs"
                        />
                    </div>

                    <Select value={teacherFilter} onValueChange={setTeacherFilter}>
                        <SelectTrigger className="h-10 bg-slate-950/50 border-white/5 text-white font-bold rounded-lg text-xs">
                            <div className="flex items-center gap-2">
                                <User className="h-3.5 w-3.5 text-slate-600" />
                                <SelectValue placeholder="All Teachers" />
                            </div>
                        </SelectTrigger>
                        <SelectContent className="bg-slate-900 border-white/10 text-white rounded-xl font-bold">
                            <SelectItem value="all">All Teachers</SelectItem>
                            {teachers.map(t => (
                                <SelectItem key={t.id} value={t.id}>{t.full_name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger className="h-10 bg-slate-950/50 border-white/5 text-white font-bold rounded-lg text-xs">
                            <SelectValue placeholder="Status Filter" />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-900 border-white/10 text-white rounded-xl font-bold text-xs">
                            <SelectItem value="all">Every Status</SelectItem>
                            <SelectItem value="returned">Returned</SelectItem>
                            <SelectItem value="approved">Out Now</SelectItem>
                            <SelectItem value="denied">Denied</SelectItem>
                            <SelectItem value="pending">Pending Approval</SelectItem>
                        </SelectContent>
                    </Select>

                    <div className="relative group">
                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-600 group-focus-within:text-blue-500 transition-colors pointer-events-none" />
                        <Input
                            type="date"
                            value={dateFilter}
                            onChange={(e) => setDateFilter(e.target.value)}
                            className="pl-10 h-10 bg-slate-950/50 border-white/5 text-white font-bold rounded-lg focus:border-blue-500/30 text-xs [color-scheme:dark]"
                        />
                    </div>
                </div>
            </GlassCard>

            <div className="space-y-1">
                {loading ? (
                    <div className="py-20 text-center">
                        <div className="inline-block w-8 h-8 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                    </div>
                ) : logs.length === 0 ? (
                    <div className="py-20 text-center bg-white/5 rounded-3xl border border-dashed border-white/10">
                        <p className="text-slate-500 font-bold uppercase tracking-widest text-xs">No records found</p>
                    </div>
                ) : (
                    <div className="grid gap-1">
                        <AnimatePresence mode="popLayout">
                            {logs.map((log) => (
                                <motion.div
                                    key={log.id}
                                    layout
                                    initial={{ opacity: 0, y: 5 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.98 }}
                                >
                                    <div className="flex items-center justify-between p-3 px-6 bg-slate-900/40 border border-white/5 hover:border-blue-500/30 transition-all rounded-xl group overflow-hidden relative">
                                        <div className="flex items-center gap-8 flex-1">
                                            <div className="p-2 bg-white/5 rounded-lg border border-white/5 group-hover:bg-blue-600/10 group-hover:border-blue-500/20 transition-all">
                                                {getStatusIcon(log.status)}
                                            </div>
                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 flex-1">
                                                <div>
                                                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-600">Student</p>
                                                    <p className="font-black text-white uppercase text-sm truncate">{log.student_name}</p>
                                                </div>
                                                <div>
                                                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-600">Course & Staff</p>
                                                    <p className="text-xs font-bold text-slate-400 truncate">{log.class_name} • {log.teacher_name}</p>
                                                </div>
                                                <div>
                                                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-600">Destination</p>
                                                    <div className="flex items-center gap-2">
                                                        <MapPin className="h-3 w-3 text-blue-500" />
                                                        <span className="text-sm font-black text-blue-500 uppercase tracking-tight">{log.destination}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="text-right ml-4">
                                            <p className="text-[9px] font-black uppercase tracking-widest text-slate-600">Issued</p>
                                            <p className="text-xs font-black text-slate-200">{format(new Date(log.requested_at), 'MM/dd • h:mm a')}</p>
                                        </div>
                                    </div>
                                </motion.div>
                            ))}
                        </AnimatePresence>
                    </div>
                )}

                {hasMore && !loading && (
                    <div className="pt-8 flex justify-center">
                        <Button
                            onClick={handleLoadMore}
                            disabled={loadingMore}
                            className="h-12 px-10 bg-blue-600 hover:bg-blue-500 text-white font-black rounded-xl shadow-xl shadow-blue-600/20 border-none transition-all hover:scale-105 active:scale-95 text-xs tracking-widest"
                        >
                            {loadingMore ? (
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : 'LOAD MORE RECORDS'}
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
};
