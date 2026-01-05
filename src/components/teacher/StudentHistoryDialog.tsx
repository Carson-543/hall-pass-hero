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
            case 'approved': return <Clock className="w-4 h-4 text-primary" />;
            case 'returned': return <CheckCircle2 className="w-4 h-4 text-success" />;
            case 'denied': return <XCircle className="w-4 h-4 text-destructive" />;
            case 'pending_return': return <LogOut className="w-4 h-4 text-warning" />;
            default: return <Clock className="w-4 h-4 text-muted-foreground" />;
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
            <DialogContent className="max-w-md rounded-3xl p-0 overflow-hidden border-0 bg-transparent shadow-2xl">
                <GlassCard variant="frosted" className="p-6 h-full">
                    <DialogHeader className="mb-4">
                        <DialogTitle className="text-2xl font-bold flex items-center gap-2">
                            <Clock className="w-6 h-6 text-primary" />
                            History: {studentName}
                        </DialogTitle>
                    </DialogHeader>

                    {loading ? (
                        <div className="flex justify-center py-12">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                        </div>
                    ) : passes.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground">
                            No recent pass history found.
                        </div>
                    ) : (
                        <ScrollArea className="h-[400px] pr-4">
                            <div className="space-y-4">
                                {passes.map((pass) => (
                                    <div key={pass.id} className="relative pl-8 pb-4 border-l border-primary/20 last:border-0 last:pb-0">
                                        <div className="absolute left-[-9px] top-0 bg-background p-1 rounded-full border border-primary/20">
                                            {getStatusIcon(pass.status)}
                                        </div>

                                        <div className="space-y-1">
                                            <div className="flex items-center justify-between">
                                                <span className="font-bold text-lg">{pass.destination}</span>
                                                <Badge variant="outline" className="capitalize bg-primary/5 rounded-lg">
                                                    {pass.status.replace('_', ' ')}
                                                </Badge>
                                            </div>

                                            <div className="text-sm text-muted-foreground flex items-center gap-2">
                                                {format(new Date(pass.requested_at), 'MMM d, h:mm a')}
                                                {calculateDuration(pass) && (
                                                    <>
                                                        <ArrowRight className="w-3 h-3" />
                                                        <span className="text-primary font-medium">{calculateDuration(pass)} duration</span>
                                                    </>
                                                )}
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
