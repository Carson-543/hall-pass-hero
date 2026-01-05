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
            <DialogContent className="max-w-xl rounded-[2rem] p-0 overflow-hidden border-0 bg-transparent shadow-2xl">
                <GlassCard
                    variant="frosted"
                    glow
                    glowColor="primary"
                    className="p-8 h-full border-0 relative overflow-hidden"
                >
                    {/* Decorative Background Gradient */}
                    <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 blur-[100px] rounded-full -mr-32 -mt-32 pointer-events-none" />
                    <div className="absolute bottom-0 left-0 w-64 h-64 bg-primary/5 blur-[80px] rounded-full -ml-32 -mb-32 pointer-events-none" />

                    <DialogHeader className="mb-8 relative z-10">
                        <DialogTitle className="text-3xl font-black tracking-tight flex items-center gap-3">
                            <div className="p-2.5 bg-primary/10 rounded-2xl">
                                <Clock className="w-7 h-7 text-primary" />
                            </div>
                            <span className="bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/70">
                                Pass History: {studentName}
                            </span>
                        </DialogTitle>
                    </DialogHeader>

                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-20 gap-4">
                            <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-primary" />
                            <p className="text-muted-foreground font-medium animate-pulse">Loading pass data...</p>
                        </div>
                    ) : passes.length === 0 ? (
                        <div className="text-center py-20 bg-muted/20 rounded-3xl border-2 border-dashed border-muted-foreground/10">
                            <Clock className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
                            <p className="text-muted-foreground font-medium">No recent pass history found.</p>
                        </div>
                    ) : (
                        <ScrollArea className="h-[450px] px-6 relative z-10">
                            <div className="space-y-6 pl-4">
                                {passes.map((pass) => (
                                    <div key={pass.id} className="relative pl-10 pb-6 border-l-2 border-primary/10 last:border-0 last:pb-0">
                                        {/* Timeline Marker */}
                                        <div className={`absolute left-[-13px] top-0 p-1.5 rounded-full border-4 border-background shadow-lg z-20 ${pass.status === 'returned' ? 'bg-success' :
                                            pass.status === 'denied' ? 'bg-destructive' :
                                                'bg-primary'
                                            }`}>
                                            <div className="text-white flex items-center justify-center">
                                                {getStatusIcon(pass.status)}
                                            </div>
                                        </div>

                                        <div className="bg-muted/30 hover:bg-muted/50 transition-colors p-5 rounded-3xl border border-white/5 group">
                                            <div className="flex items-start justify-between mb-2">
                                                <div>
                                                    <h4 className="font-bold text-xl group-hover:text-primary transition-colors">
                                                        {pass.destination}
                                                    </h4>
                                                    <div className="text-sm text-muted-foreground flex items-center gap-2 mt-1">
                                                        <Clock className="w-3.5 h-3.5 shrink-0" />
                                                        {format(new Date(pass.requested_at), 'MMM d, h:mm a')}
                                                    </div>
                                                </div>
                                                <div className="flex flex-col items-end gap-2">
                                                    <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${pass.status === 'returned' ? 'bg-success/10 text-success border border-success/20' :
                                                        pass.status === 'denied' ? 'bg-destructive/10 text-destructive border border-destructive/20' :
                                                            'bg-primary/10 text-primary border border-primary/20'
                                                        }`}>
                                                        {pass.status.replace('_', ' ')}
                                                    </span>
                                                    {calculateDuration(pass) && (
                                                        <div className="flex items-center gap-1.5 px-3 py-1 bg-primary/10 rounded-full">
                                                            <ArrowRight className="w-3 h-3 text-primary" />
                                                            <span className="text-xs font-bold text-primary italic">
                                                                {calculateDuration(pass)} duration
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
                </GlassCard>
            </DialogContent>
        </Dialog>
    );
};
