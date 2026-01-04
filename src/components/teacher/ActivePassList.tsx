import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ElapsedTimer } from '@/components/ElapsedTimer';

interface ActivePass {
    id: string;
    student_name: string;
    destination: string;
    from_class_name?: string;
    approved_at?: string;
}

interface ActivePassListProps {
    activePasses: ActivePass[];
    onCheckIn: (id: string) => void;
}

export const ActivePassList = ({ activePasses, onCheckIn }: ActivePassListProps) => {
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
            <h2 className="text-sm font-black uppercase tracking-[0.2em] text-green-600 border-b pb-2">Active Hallway ({activePasses.length})</h2>
            {activePasses.length === 0 ? (
                <div className="py-8 text-center bg-muted/20 rounded-2xl border-2 border-dashed">
                    <p className="text-sm font-bold text-muted-foreground">Hallway is empty</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {activePasses.map(pass => (
                        <Card key={pass.id} className="rounded-2xl border-l-[6px] border-l-green-500 shadow-sm">
                            <CardContent className="p-5 flex items-center justify-between">
                                <div>
                                    <h3 className="text-lg font-bold">{pass.student_name}</h3>
                                    <div className="flex flex-wrap items-center gap-2 mt-2">
                                        {pass.from_class_name && (
                                            <span className="text-[10px] font-black uppercase text-muted-foreground bg-muted px-2 py-1 rounded-md">
                                                {pass.from_class_name}
                                            </span>
                                        )}
                                        <span className={`inline-block px-3 py-1 text-xs font-black rounded-full border tracking-wider uppercase ${getDestinationColor(pass.destination)}`}>
                                            {pass.destination}
                                        </span>
                                        {pass.approved_at && (
                                            <div className="bg-green-500/10 text-green-600 px-3 py-1 rounded-full">
                                                <ElapsedTimer startTime={pass.approved_at} destination={pass.destination} />
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <Button onClick={() => onCheckIn(pass.id)} className="rounded-xl h-12 px-6 shadow-md font-bold uppercase tracking-tight">
                                    Check In
                                </Button>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
};
