import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format, differenceInMinutes } from "date-fns";
import { Clock, CheckCircle2, XCircle, LogOut, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { GlassCard } from "@/components/ui/glass-card";

interface Pass {
    id: string;
    destination: string;
    status: string;
    requested_at: string;
    approved_at: string | null;
    returned_at: string | null;
    denied_at: string | null;
}

interface StudentHistoryDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    studentId: string | null;
    studentName: string | null;
}

export const StudentHistoryDialog = ({
    open,
    onOpenChange,
    studentId,
    studentName
}: StudentHistoryDialogProps) => {
    const [passes, setPasses] = useState<Pass[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (open && studentId) {
            fetchHistory();
        }
    }, [open, studentId]);

    const fetchHistory = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('passes')
            .select('id, destination, status, requested_at, approved_at, returned_at, denied_at')
            .eq('student_id', studentId)
            .order('requested_at', { ascending: false })
            .limit(10);

        if (!error && data) {
            setPasses(data);
        }
        setLoading(false);
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'approved': return <Clock className="w-3.5 h-3.5" />;
            case 'returned': return <CheckCircle2 className="w-3.5 h-3.5" />;
            case 'denied': return <XCircle className="w-3.5 h-3.5" />;
            case 'pending_return': return <LogOut className="w-3.5 h-3.5" />;
            default: return <Clock className="w-3.5 h-3.5" />;
        }
    };

    const calculateDuration = (pass: Pass) => {
        if (pass.approved_at && pass.returned_at) {
            const mins = differenceInMinutes(new Date(pass.returned_at), new Date(pass.approved_at));
            return `${mins}m`;
        }
        return null;
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-xl rounded-[2.5rem] p-0 overflow-hidden border-2 border-white/10 bg-slate-950 shadow-2xl">
                <div className="p-8 h-full relative overflow-hidden">
                    {/* Decorative Background Gradient */}
                    <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/10 blur-[100px] rounded-full -mr-32 -mt-32 pointer-events-none" />
                    <div className="absolute bottom-0 left-0 w-64 h-64 bg-blue-500/5 blur-[80px] rounded-full -ml-32 -mb-32 pointer-events-none" />

                    <DialogHeader className="mb-8 relative z-10">
                        <DialogTitle className="text-3xl font-black tracking-tighter flex items-center gap-4">
                            <div className="p-3 bg-blue-600/10 rounded-2xl border border-blue-500/20 shadow-xl shadow-blue-500/10">
                                <Clock className="w-7 h-7 text-blue-500" />
                            </div>
                            <span className="text-white">
                                Pass History: {studentName}
                            </span>
                        </DialogTitle>
                    </DialogHeader>

                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-24 gap-6">
                            <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center shadow-lg">
                                <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-blue-500" />
                            </div>
                            <p className="text-slate-400 font-extrabold tracking-widest uppercase text-xs animate-pulse">Scanning pass records...</p>
                        </div>
                    ) : passes.length === 0 ? (
                        <div className="text-center py-24 bg-white/[0.02] rounded-[2rem] border-2 border-dashed border-white/5">
                            <Clock className="w-12 h-12 text-white/5 mx-auto mb-4" />
                            <p className="text-slate-500 font-black uppercase tracking-widest text-sm">No pass history found</p>
                        </div>
                    ) : (
                        <ScrollArea className="h-[480px] pr-4 relative z-10">
                            <div className="space-y-6">
                                {passes.map((pass) => (
                                    <div key={pass.id} className="relative pl-10 pb-2 last:pb-0">
                                        {/* Timeline Bar */}
                                        <div className="absolute left-[15px] top-6 bottom-0 w-0.5 bg-white/5 last:hidden" />

                                        {/* Timeline Marker */}
                                        <div className={`absolute left-0 top-0 w-8 h-8 rounded-full border-4 border-slate-950 shadow-xl z-20 flex items-center justify-center ${pass.status === 'returned' ? 'bg-emerald-500 shadow-emerald-500/20' :
                                                pass.status === 'denied' ? 'bg-red-500 shadow-red-500/20' :
                                                    'bg-blue-600 shadow-blue-600/20'
                                            }`}>
                                            <div className="text-white scale-75">
                                                {getStatusIcon(pass.status)}
                                            </div>
                                        </div>

                                        <div className="bg-white/5 hover:bg-white/[0.08] transition-all duration-300 p-6 rounded-[1.5rem] border border-white/5 group shadow-lg">
                                            <div className="flex items-start justify-between mb-4">
                                                <div>
                                                    <h4 className="font-black text-2xl text-white tracking-tight group-hover:text-blue-400 transition-colors">
                                                        {pass.destination}
                                                    </h4>
                                                    <div className="text-xs text-slate-400 flex items-center gap-2 mt-1.5 font-bold uppercase tracking-wider">
                                                        <Clock className="w-3.5 h-3.5 shrink-0 text-blue-500/50" />
                                                        {format(new Date(pass.requested_at), 'MMM d, h:mm a')}
                                                    </div>
                                                </div>
                                                <div className="flex flex-col items-end gap-2.5">
                                                    <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border-2 ${pass.status === 'returned' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' :
                                                            pass.status === 'denied' ? 'bg-red-500/10 text-red-500 border-red-500/20' :
                                                                'bg-blue-600/10 text-blue-400 border-blue-500/20'
                                                        }`}>
                                                        {pass.status.replace('_', ' ')}
                                                    </span>
                                                    {calculateDuration(pass) && (
                                                        <div className="flex items-center gap-2 px-3 py-1 bg-white/5 rounded-full border border-white/5">
                                                            <ArrowRight className="w-3 h-3 text-blue-500" />
                                                            <span className="text-[10px] font-black text-slate-300 uppercase tracking-tighter">
                                                                {calculateDuration(pass)} trip
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </ScrollArea>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
};
