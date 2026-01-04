import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Check, X } from 'lucide-react';

interface PendingPass {
    id: string;
    student_name: string;
    destination: string;
    is_quota_exceeded: boolean;
}

interface RequestQueueProps {
    pendingPasses: PendingPass[];
    onApprove: (id: string, override: boolean) => void;
    onDeny: (id: string) => void;
    isLoading?: boolean;
}

export const RequestQueue = ({ pendingPasses, onApprove, onDeny }: RequestQueueProps) => {
    const getDestinationColor = (destination: string) => {
        switch (destination?.toLowerCase()) {
            case 'restroom': return 'bg-green-500/10 text-green-700 border-green-500/20';
            case 'locker': return 'bg-blue-500/10 text-blue-700 border-blue-500/20';
            case 'office': return 'bg-purple-500/10 text-purple-700 border-purple-500/20';
            default: return 'bg-gray-100 text-gray-700 border-gray-200';
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between border-b pb-2">
                <h2 className="text-sm font-black uppercase tracking-[0.2em] text-yellow-600">Class Requests ({pendingPasses.length})</h2>
            </div>

            {pendingPasses.length === 0 ? (
                <div className="py-8 text-center bg-muted/20 rounded-2xl border-2 border-dashed">
                    <p className="text-sm font-bold text-muted-foreground">No active requests</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {pendingPasses.map(pass => (
                        <Card key={pass.id} className={`rounded-2xl border-l-[6px] ${pass.is_quota_exceeded ? 'border-l-destructive shadow-destructive/5' : 'border-l-yellow-500'} shadow-sm`}>
                            <CardContent className="p-5 flex items-center justify-between">
                                <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                        <h3 className="text-lg font-bold">{pass.student_name}</h3>
                                        {pass.is_quota_exceeded && (
                                            <div className="bg-destructive/10 text-destructive text-[10px] px-2 py-0.5 rounded-full font-black flex items-center gap-1">
                                                <AlertTriangle className="h-3 w-3" /> LIMIT REACHED
                                            </div>
                                        )}
                                    </div>
                                    <span className={`inline-block mt-1 px-3 py-1 text-xs font-black rounded-full border tracking-wider uppercase ${getDestinationColor(pass.destination)}`}>
                                        {pass.destination}
                                    </span>
                                </div>
                                <div className="flex gap-2">
                                    <Button size="icon" variant="secondary" className="h-12 w-12 rounded-xl bg-muted" onClick={() => onDeny(pass.id)}>
                                        <X className="h-5 w-5" />
                                    </Button>
                                    <Button size="icon" className="h-12 w-12 rounded-xl shadow-lg bg-primary text-primary-foreground" onClick={() => onApprove(pass.id, pass.is_quota_exceeded)}>
                                        <Check className="h-5 w-5" />
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
};
