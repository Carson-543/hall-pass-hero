import { useState, useEffect } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Plus, Loader2, Snowflake, Bot } from 'lucide-react';

interface ClassInfo {
    id: string;
    name: string;
    period_order: number;
    is_queue_autonomous?: boolean;
}

interface TeacherControlsProps {
    classes: ClassInfo[];
    selectedClassId: string;
    onClassChange: (value: string) => void;
    onAddClass: () => void;
    activeFreeze: { freeze_type: string } | null;
    freezeType: 'bathroom' | 'all';
    onFreezeTypeChange: (value: 'bathroom' | 'all') => void;
    timerMinutes: string;
    onTimerChange: (value: string) => void;
    isFreezeLoading: boolean;
    onFreeze: () => void;
    onUnfreeze: () => void;
    currentClass: ClassInfo | undefined;
    onToggleAutoQueue?: (newMaxConcurrent?: number) => void;
    maxConcurrent: number;
}

export const TeacherControls = ({
    classes,
    selectedClassId,
    onClassChange,
    onAddClass,
    activeFreeze,
    freezeType,
    onFreezeTypeChange,
    timerMinutes,
    onTimerChange,
    isFreezeLoading,
    onFreeze,
    onUnfreeze,
    currentClass,
    onToggleAutoQueue,
    maxConcurrent
}: TeacherControlsProps) => {
    const [tempMaxConcurrent, setTempMaxConcurrent] = useState<string>('2');

    useEffect(() => {
        setTempMaxConcurrent(maxConcurrent.toString());
    }, [maxConcurrent]);

    const handleToggle = () => {
        if (onToggleAutoQueue) {
            if (!currentClass?.is_queue_autonomous) {
                // Enabling: pass the new limit
                onToggleAutoQueue(parseInt(tempMaxConcurrent) || 2);
            } else {
                // Disabling: no new limit needed
                onToggleAutoQueue();
            }
        }
    };

    return (
        <div className="flex flex-col gap-4">
            {/* Class Selector Row */}
            <div className="flex gap-2 w-full">
                <Select value={selectedClassId} onValueChange={onClassChange}>
                    <SelectTrigger className="h-14 rounded-2xl bg-card border-none shadow-sm text-lg font-bold px-6 flex-1">
                        <SelectValue placeholder="Select Class" />
                    </SelectTrigger>
                    <SelectContent>
                        {classes.map(c => (
                            <SelectItem key={c.id} value={c.id}>
                                Period {c.period_order}: {c.name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Button
                    size="icon"
                    variant="outline"
                    className="h-14 w-14 rounded-2xl border-dashed shrink-0"
                    onClick={onAddClass}
                >
                    <Plus className="h-5 w-5" />
                </Button>
            </div>

            {/* Controls Row - Only show if class selected */}
            {selectedClassId && (
                <div className="flex items-center justify-between gap-2 overflow-x-auto pb-2">
                    <div className="text-sm font-black uppercase tracking-[0.2em] text-muted-foreground whitespace-nowrap hidden sm:block">
                        Controls
                    </div>

                    <div className="flex items-center gap-2 ml-auto">
                        {/* Freeze Control */}
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button
                                    variant={!!activeFreeze ? "destructive" : "outline"}
                                    className={`group relative overflow-hidden transition-all duration-300 h-10 w-10 hover:w-44 rounded-full border shadow-sm ${!!activeFreeze ? 'bg-destructive text-destructive-foreground' : 'bg-background text-blue-500 hover:border-blue-300'}`}
                                    disabled={isFreezeLoading}
                                >
                                    <div className="absolute left-0 flex items-center justify-center w-10 h-10">
                                        {isFreezeLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Snowflake className={`h-4 w-4 ${activeFreeze ? 'animate-pulse' : ''}`} />}
                                    </div>
                                    <span className="ml-8 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap text-xs font-bold uppercase tracking-tighter">
                                        {activeFreeze ? "Unfreeze Queue" : "Freeze Controls"}
                                    </span>
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-72 rounded-3xl" align="end">
                                {activeFreeze ? (
                                    <div className="space-y-3 text-center p-2">
                                        <p className="font-bold text-destructive">
                                            {activeFreeze.freeze_type === 'bathroom' ? 'Restroom' : 'All'} Passes are Frozen
                                        </p>
                                        <Button variant="destructive" className="w-full rounded-xl font-bold" onClick={onUnfreeze}>
                                            Unfreeze Now
                                        </Button>
                                    </div>
                                ) : (
                                    <div className="space-y-4 p-2">
                                        <div className="space-y-2">
                                            <Label className="text-[10px] font-bold uppercase text-muted-foreground">Freeze Type</Label>
                                            <Select value={freezeType} onValueChange={(v) => onFreezeTypeChange(v as 'bathroom' | 'all')}>
                                                <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="bathroom">Restroom Only</SelectItem>
                                                    <SelectItem value="all">All Passes</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-[10px] font-bold uppercase text-muted-foreground">Timer (Minutes)</Label>
                                            <Input
                                                type="number"
                                                placeholder="Stay frozen until manually cleared"
                                                value={timerMinutes}
                                                onChange={(e) => onTimerChange(e.target.value)}
                                                className="rounded-xl"
                                            />
                                        </div>
                                        <Button className="w-full font-bold rounded-xl" onClick={onFreeze}>
                                            Freeze Pass Queue
                                        </Button>
                                    </div>
                                )}
                            </PopoverContent>
                        </Popover>

                        {/* Autonomous Queue Toggle */}
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button
                                    variant="outline"
                                    className={`group relative overflow-hidden transition-all duration-300 h-10 w-10 hover:w-48 rounded-full border shadow-sm ${currentClass?.is_queue_autonomous ? 'bg-purple-100 text-purple-700 border-purple-200 hover:border-purple-300' : 'bg-background text-muted-foreground'}`}
                                >
                                    <div className="absolute left-0 flex items-center justify-center w-10 h-10">
                                        <Bot className={`h-4 w-4 ${currentClass?.is_queue_autonomous ? 'text-purple-600' : ''}`} />
                                    </div>
                                    <span className="ml-8 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap text-xs font-bold uppercase tracking-tighter">
                                        {currentClass?.is_queue_autonomous ? "Auto-Queue Active" : "Enable Auto-Queue"}
                                    </span>
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent className="rounded-3xl">
                                <AlertDialogHeader>
                                    <AlertDialogTitle className="flex items-center gap-2">
                                        <Bot className="h-5 w-5 text-purple-600" />
                                        {currentClass?.is_queue_autonomous ? "Disable Autonomous Queue?" : "Enable Autonomous Queue?"}
                                    </AlertDialogTitle>
                                    <AlertDialogDescription className="space-y-2 pt-2">
                                        <p>
                                            {currentClass?.is_queue_autonomous
                                                ? "Turning this off will require you to manually approve every student request from now on. Existing approved passes will remain valid."
                                                : "When enabled, the system will automatically approve student restroom requests if there is space available."}
                                        </p>
                                        {!currentClass?.is_queue_autonomous && (
                                            <>
                                                <div className="space-y-2 pt-2">
                                                    <Label>Max Concurrent Restroom Users</Label>
                                                    <Input
                                                        type="number"
                                                        min="1"
                                                        max="10"
                                                        value={tempMaxConcurrent}
                                                        onChange={(e) => setTempMaxConcurrent(e.target.value)}
                                                        className="rounded-xl"
                                                    />
                                                </div>

                                                <div className="bg-muted/50 p-3 rounded-xl text-xs space-y-1 mt-2">
                                                    <p className="font-bold">How it works:</p>
                                                    <ul className="list-disc pl-4 space-y-0.5 text-muted-foreground">
                                                        <li>If active passes {'<'} Limit ({tempMaxConcurrent}), request is approved instantly.</li>
                                                        <li>If full, student joins the queue as "Pending".</li>
                                                        <li>When a student returns, the next person in line is automatically approved.</li>
                                                    </ul>
                                                </div>
                                            </>
                                        )}
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                        onClick={handleToggle}
                                        className={`rounded-xl font-bold ${currentClass?.is_queue_autonomous ? 'bg-destructive hover:bg-destructive/90' : 'bg-purple-600 hover:bg-purple-700'}`}
                                    >
                                        {currentClass?.is_queue_autonomous ? "Disable Auto-Queue" : "Yes, Enable It"}
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    </div>
                </div>
            )}
        </div>
    );
};
