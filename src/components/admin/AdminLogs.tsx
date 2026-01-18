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
    MoreVertical
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
    const [teacherSearch, setTeacherSearch] = useState('');
    const [dateFilter, setDateFilter] = useState('');

    useEffect(() => {
        fetchLogs(0, true);
    }, [statusFilter, studentSearch, teacherSearch, dateFilter]);

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

            let query = supabase
                .from('passes')
                .select(`
          id,
          student_id,
          requested_at,
          approved_at,
          returned_at,
          status,
          destination,
          profiles!passes_student_id_fkey(full_name),
          classes!inner(name, teacher_id, organization_id, profiles!classes_teacher_id_fkey(full_name))
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
            if (teacherSearch) {
                query = query.ilike('classes.profiles.full_name', `%${teacherSearch}%`);
            }
            if (dateFilter) {
                query = query.gte('requested_at', `${dateFilter}T00:00:00Z`)
                    .lte('requested_at', `${dateFilter}T23:59:59Z`);
            }

            const { data, error } = await query;
            if (error) throw error;

            if (reset) {
                setLogs(data || []);
            } else {
                setLogs(prev => [...prev, ...(data || [])]);
            }

            setHasMore(data.length === PAGE_SIZE);
        } catch (error) {
            console.error(error);
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
                    <h2 className="text-3xl font-black text-white tracking-tighter">Pass History Logs</h2>
                    <p className="text-sm font-bold text-slate-500 uppercase tracking-widest mt-1">Deep dive into movement records</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" className="h-12 bg-white/5 border-white/10 text-slate-400 hover:text-white rounded-xl font-bold px-4 gap-2">
                        <Download className="h-4 w-4" /> EXPORT CSV
                    </Button>
                </div>
            </div>

            <GlassCard className="p-6 bg-slate-900/60 border-white/10 shadow-2xl">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="relative group">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 group-focus-within:text-blue-500 transition-colors" />
                        <Input
                            placeholder="Search student..."
                            value={studentSearch}
                            onChange={(e) => setStudentSearch(e.target.value)}
                            className="pl-10 h-11 bg-slate-950/50 border-white/10 text-white font-bold rounded-xl focus:border-blue-500/50"
                        />
                    </div>
                    <div className="relative group">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 group-focus-within:text-blue-500 transition-colors" />
                        <Input
                            placeholder="Search teacher..."
                            value={teacherSearch}
                            onChange={(e) => setTeacherSearch(e.target.value)}
                            className="pl-10 h-11 bg-slate-950/50 border-white/10 text-white font-bold rounded-xl focus:border-blue-500/50"
                        />
                    </div>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger className="h-11 bg-slate-950/50 border-white/10 text-white font-bold rounded-xl">
                            <SelectValue placeholder="Status Filter" />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-900 border-white/10 text-white rounded-xl font-bold">
                            <SelectItem value="all">All Statuses</SelectItem>
                            <SelectItem value="returned">Returned</SelectItem>
                            <SelectItem value="approved">Out Now</SelectItem>
                            <SelectItem value="denied">Denied</SelectItem>
                            <SelectItem value="pending">Pending</SelectItem>
                        </SelectContent>
                    </Select>
                    <div className="relative group">
                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 group-focus-within:text-blue-500 transition-colors pointer-events-none" />
                        <Input
                            type="date"
                            value={dateFilter}
                            onChange={(e) => setDateFilter(e.target.value)}
                            className="pl-10 h-11 bg-slate-950/50 border-white/10 text-white font-bold rounded-xl focus:border-blue-500/50 [color-scheme:dark]"
                        />
                    </div>
                </div>
            </GlassCard>

            <div className="space-y-3">
                {loading ? (
                    <div className="py-20 text-center">
                        <div className="inline-block w-8 h-8 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                    </div>
                ) : logs.length === 0 ? (
                    <GlassCard className="py-20 text-center text-slate-500 font-bold bg-slate-900/40 border-dashed border-white/10">
                        No movement records found matching your filters
                    </GlassCard>
                ) : (
                    <div className="grid gap-3">
                        <AnimatePresence mode="popLayout">
                            {logs.map((log) => (
                                <motion.div
                                    key={log.id}
                                    layout
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, scale: 0.98 }}
                                >
                                    <GlassCard className="p-4 bg-slate-900/40 border-white/5 hover:border-blue-500/30 transition-all duration-300 group">
                                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                            <div className="flex items-center gap-4 flex-1">
                                                <div className="p-2.5 bg-white/5 rounded-xl border border-white/5 group-hover:bg-blue-600/10 group-hover:border-blue-500/20 transition-all">
                                                    {getStatusIcon(log.status)}
                                                </div>
                                                <div className="grid grid-cols-1 md:grid-cols-3 gap-x-8 gap-y-1 flex-1">
                                                    <div className="min-w-[150px]">
                                                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Student</p>
                                                        <p className="font-black text-white uppercase truncate">{log.profiles?.full_name}</p>
                                                    </div>
                                                    <div className="min-w-[150px]">
                                                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Course & Staff</p>
                                                        <p className="text-sm font-bold text-slate-300 truncate">{log.classes?.name} — {log.classes?.profiles?.full_name}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Destination</p>
                                                        <div className="flex items-center gap-2">
                                                            <MapPin className="h-3 w-3 text-blue-400" />
                                                            <span className="text-sm font-black text-blue-400 uppercase tracking-tight">{log.destination}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-6 text-right">
                                                <div>
                                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Timestamp</p>
                                                    <p className="text-xs font-black text-white">{format(new Date(log.requested_at), 'MMM d, h:mm a')}</p>
                                                </div>
                                                <div className="w-12 h-12 flex items-center justify-center">
                                                    <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl hover:bg-white/10 text-slate-500">
                                                        <MoreVertical className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            </div>
                                        </div>
                                    </GlassCard>
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
                            className="h-14 px-12 bg-blue-600 hover:bg-blue-500 text-white font-black rounded-2xl shadow-xl shadow-blue-600/20 border-none transition-all hover:scale-105 active:scale-95"
                        >
                            {loadingMore ? (
                                <>
                                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                                    LOADING...
                                </>
                            ) : 'LOAD MORE RECORDS'}
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
};

const MapPin = ({ className }: any) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
        <circle cx="12" cy="10" r="3" />
    </svg>
);
