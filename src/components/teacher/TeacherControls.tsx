import { useState, useEffect } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Plus, Loader2, Snowflake, Bot, Trash2 } from 'lucide-react';
import { AutoClearMenu } from '@/components/teacher/AutoClearMenu';

interface ClassInfo {
    id: string;
    name: string;
    period_order: number;
    is_queue_autonomous?: boolean;
    max_concurrent_bathroom?: number;
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
    onDeleteClass: (id: string) => void;
    onClearQueue?: (clearActive: boolean, clearPending: boolean) => void;
}

const ClearQueueMenu = ({ onClear }: { onClear: (active: boolean, pending: boolean) => void }) => {
    const [clearActive, setClearActive] = useState(true);
    const [clearPending, setClearPending] = useState(true);
    const [open, setOpen] = useState(false);

    const handleClear = () => {
        onClear(clearActive, clearPending);
        setOpen(false);
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    className="h-10 w-10 p-0 rounded-full border-2 border-white/20 bg-white/10 hover:bg-white/15 hover:border-red-400/50 text-slate-400 hover:text-red-400 transition-all shadow-lg"
                    title="Clear Queue"
                >
                    <Trash2 className="h-4 w-4" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 rounded-[1.5rem] bg-slate-900 border-white/20 text-white shadow-2xl p-0 overflow-hidden" align="end">
                <div className="p-4 border-b border-white/10 bg-slate-900/50">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 rounded-xl border bg-red-500/20 border-red-500/30">
                            <Trash2 className="w-5 h-5 text-red-500" />
                        </div>
                        <div>
                            <h4 className="font-black text-white text-sm uppercase tracking-wide">Clear Queue</h4>
                            <p className="text-[10px] font-bold text-slate-400">Select items to remove</p>
                        </div>
                    </div>
                </div>

                <div className="p-4 space-y-6">
                    {/* Active Passes Toggle */}
                    <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                            <Label className="text-sm font-bold text-white">Active Passes</Label>
                            <p className="text-[10px] font-medium text-slate-400">Includes pending returns</p>
                        </div>
                        <Switch
                            checked={clearActive}
                            onCheckedChange={setClearActive}
                            className="data-[state=checked]:bg-red-600"
                        />
                    </div>

                    {/* Pending Requests Toggle */}
                    <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                            <Label className="text-sm font-bold text-white">Pending Requests</Label>
                            <p className="text-[10px] font-medium text-slate-400">Deny all waiting students</p>
                        </div>
                        <Switch
                            checked={clearPending}
                            onCheckedChange={setClearPending}
                            className="data-[state=checked]:bg-red-600"
                        />
                    </div>

                    <Button
                        onClick={handleClear}
                        disabled={!clearActive && !clearPending}
                        className="w-full font-bold rounded-xl h-10 shadow-lg bg-red-600 hover:bg-red-700 text-white shadow-red-500/20"
                    >
                        Clear Selected
                    </Button>
                </div>
            </PopoverContent>
        </Popover>
    );
};

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
    maxConcurrent,
    onDeleteClass,
    onClearQueue
}: TeacherControlsProps) => {
    const [tempMaxConcurrent, setTempMaxConcurrent] = useState<string>('2');

    useEffect(() => {
        setTempMaxConcurrent(maxConcurrent.toString());
    }, [maxConcurrent]);

    const handleToggle = () => {
        if (onToggleAutoQueue) {
            if (!currentClass?.is_queue_autonomous) {
                onToggleAutoQueue(parseInt(tempMaxConcurrent) || 2);
            } else {
                onToggleAutoQueue();
            }
        }
    };

    return (
        <div className="flex flex-col gap-4">
            {/* Class Selector Row */}
            <div className="flex gap-3 w-full">
                <Select value={selectedClassId} onValueChange={onClassChange}>
                    <SelectTrigger className="h-14 rounded-2xl bg-white/10 border-2 border-white/20 shadow-xl text-lg font-bold px-6 flex-1 text-white hover:bg-white/15 transition-all">
                        <SelectValue placeholder="Select Class" />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-900 border-white/20 text-white rounded-2xl overflow-hidden backdrop-blur-xl">
                        {classes.map(c => (
                            <SelectItem
                                key={c.id}
                                value={c.id}
                                className="focus:bg-blue-600 focus:text-white py-3 cursor-pointer transition-colors font-bold"
                            >
                                Period {c.period_order}: {c.name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Button
                    size="icon"
                    variant="outline"
                    className="h-14 w-14 rounded-2xl border-2 border-dashed border-white/20 bg-white/5 hover:bg-white/10 hover:border-blue-500/50 text-white transition-all shrink-0"
                    onClick={onAddClass}
                >
                    <Plus className="h-6 w-6" />
                </Button>

                {selectedClassId && (
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button
                                size="icon"
                                variant="ghost"
                                className="h-14 w-14 rounded-2xl bg-red-500/10 border-2 border-red-500/20 text-red-500 hover:bg-red-500 hover:text-white transition-all shrink-0"
                            >
                                <Trash2 className="h-6 w-6" />
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="rounded-[2rem] bg-slate-900 border-white/10 text-white shadow-2xl">
                            <AlertDialogHeader>
                                <AlertDialogTitle className="text-2xl font-black">Delete Class?</AlertDialogTitle>
                                <AlertDialogDescription className="text-slate-300 font-medium pt-2">
                                    This will permanently remove <span className="text-white font-bold">{currentClass?.name}</span> and all associated hall pass history. This action cannot be undone.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter className="pt-4">
                                <AlertDialogCancel className="rounded-xl bg-white/5 border-white/10 text-white hover:bg-white/10">Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                    onClick={() => onDeleteClass(selectedClassId)}
                                    className="rounded-xl bg-red-600 hover:bg-red-700 text-white font-black px-6"
                                >
                                    Delete Permanently
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                )}
            </div>

            {/* Controls Row - Only show if class selected */}
            {selectedClassId && (
                <div className="flex items-center justify-between gap-2 overflow-x-auto pb-2">
                    <div className="text-[10px] font-black uppercase tracking-[0.2em] text-white/60 whitespace-nowrap hidden sm:block">
                        Quick Controls
                    </div>

                    <div className="flex items-center gap-2 ml-auto">
                        {/* Clear Queue Popover */}
                        {onClearQueue && (
                            <ClearQueueMenu onClear={onClearQueue} />
                        )}

                        {/* Auto-Clear Queue */}
                        <AutoClearMenu />

                        {/* Freeze Control */}
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button
                                    variant={!!activeFreeze ? "destructive" : "outline"}
                                    className={`group relative overflow-hidden transition-all duration-300 h-10 w-10 hover:w-44 rounded-full border-2 shadow-lg p-0 ${!!activeFreeze ? 'bg-red-600 border-red-500 text-white shadow-red-500/20' : 'bg-white/10 border-white/20 text-blue-400 hover:border-blue-400/50 hover:bg-white/15'}`}
                                    disabled={isFreezeLoading}
                                >
                                    <div className="absolute left-[-2px] top-[-2px] w-10 h-10 flex items-center justify-center pointer-events-none">
                                        {isFreezeLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Snowflake className={`h-4 w-4 ${activeFreeze ? 'animate-pulse' : ''}`} />}
                                    </div>
                                    <span className="ml-[2.5rem] opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap text-[10px] font-black uppercase tracking-widest">
                                        {activeFreeze ? "Unfreeze Queue" : "Freeze Controls"}
                                    </span>
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-72 rounded-3xl bg-slate-900 border-white/20 text-white shadow-2xl" align="end">
                                {activeFreeze ? (
                                    <div className="space-y-3 text-center p-2">
                                        <p className="font-bold text-red-500">
                                            {activeFreeze.freeze_type === 'bathroom' ? 'Restroom' : 'All'} Passes are Frozen
                                        </p>
                                        <Button variant="destructive" className="w-full rounded-xl font-bold bg-red-600 hover:bg-red-700" onClick={onUnfreeze}>
                                            Unfreeze Now
                                        </Button>
                                    </div>
                                ) : (
                                    <div className="space-y-4 p-2">
                                        <div className="space-y-2">
                                            <Label className="text-[10px] font-bold uppercase text-slate-400">Freeze Type</Label>
                                            <Select value={freezeType} onValueChange={(v) => onFreezeTypeChange(v as 'bathroom' | 'all')}>
                                                <SelectTrigger className="rounded-xl bg-white/5 border-white/10 text-white"><SelectValue /></SelectTrigger>
                                                <SelectContent className="bg-slate-900 border-white/20 text-white">
                                                    <SelectItem value="bathroom">Restroom Only</SelectItem>
                                                    <SelectItem value="all">All Passes</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-[10px] font-bold uppercase text-slate-400">Timer (Minutes)</Label>
                                            <Input
                                                type="number"
                                                placeholder="Manual clear"
                                                value={timerMinutes}
                                                onChange={(e) => onTimerChange(e.target.value)}
                                                className="rounded-xl bg-white/5 border-white/10 text-white placeholder:text-slate-500"
                                            />
                                        </div>
                                        <Button className="w-full font-bold rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/30" onClick={onFreeze}>
                                            Freeze Pass Queue
                                        </Button>
                                    </div>
                                )}
                            </PopoverContent>
                        </Popover>

                        {/* Autonomous Queue Toggle */}
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    className={`group relative overflow-hidden transition-all duration-300 h-10 w-10 hover:w-48 rounded-full border-2 shadow-lg p-0 ${currentClass?.is_queue_autonomous ? 'bg-blue-600 border-blue-500 text-white hover:bg-blue-700' : 'bg-white/10 border-white/20 text-slate-400 hover:border-blue-400/50 hover:bg-white/15'}`}
                                >
                                    <div className="absolute left-[-2px] top-[-2px] w-10 h-10 flex items-center justify-center pointer-events-none">
                                        <Bot className={`h-4 w-4 ${currentClass?.is_queue_autonomous ? 'text-white' : ''}`} />
                                    </div>
                                    <span className="ml-[2.5rem] opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap text-[10px] font-black uppercase tracking-widest">
                                        {currentClass?.is_queue_autonomous ? "Auto-Queue Active" : "Enable Auto-Queue"}
                                    </span>
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-80 rounded-[1.5rem] bg-slate-900 border-white/20 text-white shadow-2xl p-0 overflow-hidden" align="end">
                                <div className="p-4 border-b border-white/10 bg-slate-900/50">
                                    <div className="flex items-center gap-3 mb-2">
                                        <div className={`p-2 rounded-xl border ${currentClass?.is_queue_autonomous ? 'bg-blue-500/20 border-blue-500/30' : 'bg-slate-800 border-white/10'}`}>
                                            <Bot className={`w-5 h-5 ${currentClass?.is_queue_autonomous ? 'text-blue-500' : 'text-slate-400'}`} />
                                        </div>
                                        <div>
                                            <h4 className="font-black text-white text-sm uppercase tracking-wide">Auto-Queue</h4>
                                            <p className="text-[10px] font-bold text-slate-400">
                                                {currentClass?.is_queue_autonomous ? 'System is approving passes' : 'Manual approval only'}
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                <div className="p-4 space-y-4">
                                    <div className="space-y-4">
                                        <p className="text-xs text-slate-300 font-medium leading-relaxed">
                                            {currentClass?.is_queue_autonomous
                                                ? "The system is automatically approving students when spots open up."
                                                : "Enable this to let the system automatically approve restroom requests based on availability."}
                                        </p>

                                        {/* Max Concurrent Setting - Always show if enabled, or allows setup before enabling */}
                                        <div className="space-y-2">
                                            <Label className="text-[10px] font-bold uppercase text-slate-400">Max Concurrent Users</Label>
                                            <div className="flex gap-2">
                                                <Input
                                                    type="number"
                                                    min="1"
                                                    max="10"
                                                    value={tempMaxConcurrent}
                                                    onChange={(e) => setTempMaxConcurrent(e.target.value)}
                                                    className="rounded-xl bg-white/5 border-white/10 text-white placeholder:text-slate-500 h-10 font-bold"
                                                />
                                            </div>
                                        </div>

                                        <Button
                                            onClick={handleToggle}
                                            className={`w-full font-bold rounded-xl h-10 shadow-lg ${currentClass?.is_queue_autonomous
                                                ? 'bg-red-600 hover:bg-red-700 text-white shadow-red-500/20'
                                                : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/20'
                                                }`}
                                        >
                                            {currentClass?.is_queue_autonomous ? "Disable Auto-Queue" : "Enable Auto-Queue"}
                                        </Button>
                                    </div>
                                </div>
                            </PopoverContent>
                        </Popover>
                    </div>
                </div>
            )}
        </div>
    );
};
