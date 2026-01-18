import React from 'react';
import {
    Calendar,
    ChevronLeft,
    ChevronRight,
    Plus,
    Edit,
    Trash2,
    UserPlus,
    Check,
    Archive,
    ArchiveRestore
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GlassCard } from '@/components/ui/glass-card';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from '@/components/ui/select';
import { format, isToday } from 'date-fns';

interface Schedule {
    id: string;
    name: string;
    is_school_day: boolean;
    color: string | null;
    is_archived: boolean;
}

interface ScheduleAssignment {
    date: string;
    schedule_id: string;
    schedule_name: string;
}

interface AdminScheduleProps {
    currentMonth: Date;
    setCurrentMonth: (date: Date | ((prev: Date) => Date)) => void;
    daysInMonth: Date[];
    schedules: Schedule[];
    scheduleAssignments: ScheduleAssignment[];
    selectedDates: string[];
    setSelectedDates: (dates: string[] | ((prev: string[]) => string[])) => void;
    bulkScheduleId: string;
    setBulkScheduleId: (id: string) => void;
    handleBulkAssign: () => void;
    toggleDateSelection: (date: string) => void;
    openNewSchedule: () => void;
    openEditSchedule: (s: Schedule) => void;
    handleDeleteSchedule: (id: string) => void;
    handleToggleArchive: (s: Schedule) => void;
    showArchivedSchedules: boolean;
    setShowArchivedSchedules: (val: boolean) => void;
    setSubDialogDate: (d: Date) => void;
    setSubDialogOpen: (val: boolean) => void;
}

export const AdminSchedule = ({
    currentMonth,
    setCurrentMonth,
    daysInMonth,
    schedules,
    scheduleAssignments,
    selectedDates,
    setSelectedDates,
    bulkScheduleId,
    setBulkScheduleId,
    handleBulkAssign,
    toggleDateSelection,
    openNewSchedule,
    openEditSchedule,
    handleDeleteSchedule,
    handleToggleArchive,
    showArchivedSchedules,
    setShowArchivedSchedules,
    setSubDialogDate,
    setSubDialogOpen
}: AdminScheduleProps) => {
    return (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Left Column: Calendar & Controls */}
            <div className="lg:col-span-8 space-y-6">
                <GlassCard className="border-2 border-white/10 shadow-2xl overflow-hidden p-0 bg-slate-900/60">
                    <div className="p-6 border-b border-white/10 bg-white/5 flex items-center justify-between">
                        <h3 className="text-xl font-black tracking-tight text-white flex items-center gap-2">
                            <Calendar className="h-5 w-5 text-blue-500" />
                            School Schedule
                        </h3>
                    </div>
                    <div className="p-6 flex flex-col items-center">
                        {/* Custom Navigation for Month */}
                        <div className="flex items-center justify-between w-full max-w-3xl mb-8 px-4">
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1))}
                                className="w-10 h-10 rounded-xl hover:bg-white/10 text-slate-400 hover:text-white transition-all"
                            >
                                <ChevronLeft className="h-6 w-6" />
                            </Button>
                            <h3 className="text-2xl font-black tracking-tight text-white">{format(currentMonth, 'MMMM yyyy')}</h3>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1))}
                                className="w-10 h-10 rounded-xl hover:bg-white/10 text-slate-400 hover:text-white transition-all"
                            >
                                <ChevronRight className="h-6 w-6" />
                            </Button>
                        </div>

                        {selectedDates.length > 0 && (
                            <div className="w-full max-w-3xl mb-8 p-6 bg-blue-600/20 rounded-2xl border-2 border-blue-500/30 flex flex-wrap items-center gap-4 animate-in fade-in slide-in-from-top-4 backdrop-blur-md">
                                <span className="font-black text-blue-400 flex items-center gap-2 text-sm uppercase tracking-widest">
                                    <Check className="h-4 w-4" /> {selectedDates.length} days selected
                                </span>
                                <div className="flex-1 flex gap-3 min-w-[300px]">
                                    <Select value={bulkScheduleId} onValueChange={setBulkScheduleId}>
                                        <SelectTrigger className="bg-slate-950 border-white/10 text-white font-bold h-11 rounded-xl">
                                            <SelectValue placeholder="Assign Schedule..." />
                                        </SelectTrigger>
                                        <SelectContent className="bg-slate-900 border-white/10 text-white rounded-xl">
                                            {schedules.filter(s => !s.is_archived).map(s => (
                                                <SelectItem key={s.id} value={s.id} className="focus:bg-blue-600 focus:text-white font-bold py-2.5">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: s.color || '#6B7280' }} />
                                                        {s.name}
                                                    </div>
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <Button onClick={handleBulkAssign} disabled={!bulkScheduleId} className="bg-blue-600 hover:bg-blue-700 text-white font-black px-6 h-11 rounded-xl shadow-lg shadow-blue-600/20">
                                        Apply
                                    </Button>
                                    <Button variant="ghost" onClick={() => setSelectedDates([])} className="text-slate-400 hover:text-white font-bold px-4 h-11 rounded-xl">
                                        Clear
                                    </Button>
                                </div>
                            </div>
                        )}

                        {/* Calendar Grid */}
                        <div className="w-full max-w-3xl grid grid-cols-7 gap-1 sm:gap-2">
                            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                                <div key={day} className="text-center text-xs font-black uppercase text-muted-foreground py-2">
                                    {day}
                                </div>
                            ))}

                            {Array.from({ length: daysInMonth[0].getDay() }).map((_, i) => (
                                <div key={`empty-${i}`} className="aspect-square" />
                            ))}

                            {daysInMonth.map(day => {
                                const dateStr = format(day, 'yyyy-MM-dd');
                                const assignment = scheduleAssignments.find(a => a.date === dateStr);
                                const schedule = schedules.find(s => s.id === assignment?.schedule_id);
                                const isSelected = selectedDates.includes(dateStr);
                                const isTodayDate = isToday(day);

                                return (
                                    <div
                                        key={dateStr}
                                        onClick={() => toggleDateSelection(dateStr)}
                                        className={`
                    relative aspect-square p-1 rounded-xl border cursor-pointer transition-all duration-200
                    hover:border-primary/50 hover:shadow-md group flex flex-col justify-between overflow-hidden
                    ${isSelected ? 'ring-2 ring-primary border-primary bg-primary/5' : 'bg-card border-border'}
                    ${isTodayDate ? 'ring-1 ring-offset-2 ring-blue-500' : ''}
                  `}
                                        style={schedule?.color ? { backgroundColor: `${schedule.color}15`, borderColor: isSelected ? undefined : `${schedule.color}40` } : {}}
                                    >
                                        <div className="flex justify-between items-start">
                                            <span className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full ${isTodayDate ? 'bg-blue-500 text-white' : 'text-muted-foreground'}`}>
                                                {format(day, 'd')}
                                            </span>
                                            <Button
                                                size="icon"
                                                variant="ghost"
                                                className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity -mr-1 -mt-1 hover:bg-transparent text-muted-foreground hover:text-primary"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setSubDialogDate(day);
                                                    setSubDialogOpen(true);
                                                }}
                                            >
                                                <UserPlus className="h-3 w-3" />
                                            </Button>
                                        </div>

                                        {schedule ? (
                                            <div className="mt-1">
                                                <div
                                                    className="text-[10px] font-bold truncate px-1.5 py-0.5 rounded text-white shadow-sm text-center"
                                                    style={{ backgroundColor: schedule.color || '#6B7280' }}
                                                >
                                                    {schedule.name}
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="flex-1 flex items-center justify-center">
                                                <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/20" />
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </GlassCard>
            </div>

            {/* Right Column: Legend & Tools */}
            <div className="lg:col-span-4 space-y-6">
                <GlassCard className="bg-slate-900/60 border-2 border-white/10 shadow-xl overflow-hidden p-0">
                    <div className="p-4 border-b border-white/10 bg-white/5 flex items-center justify-between">
                        <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Schedule Types</h3>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setShowArchivedSchedules(!showArchivedSchedules)}
                            className={`h-7 px-2 rounded-lg text-[10px] font-black uppercase transition-all ${showArchivedSchedules ? 'bg-blue-600/20 text-blue-400 hover:bg-blue-600/30' : 'text-slate-500 hover:text-slate-300'}`}
                        >
                            {showArchivedSchedules ? 'Showing Archived' : 'Show Archived'}
                        </Button>
                    </div>
                    <div className="p-4 space-y-3">
                        {schedules
                            .filter(s => showArchivedSchedules ? true : !s.is_archived)
                            .map(s => (
                                <div key={s.id} className={`flex items-center justify-between group p-3 rounded-2xl hover:bg-white/10 transition-all border border-transparent hover:border-white/5 ${s.is_archived ? 'opacity-50 grayscale' : ''}`}>
                                    <div className="flex items-center gap-3">
                                        <div className="w-4 h-4 rounded-full shadow-[0_0_10px_rgba(255,255,255,0.2)]" style={{ backgroundColor: s.color || '#6B7280' }} />
                                        <span className="font-black text-sm text-white">{s.name}</span>
                                    </div>
                                    <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                                        <Button
                                            size="icon"
                                            variant="ghost"
                                            className="h-8 w-8 rounded-lg hover:bg-slate-600/20 text-slate-400"
                                            title={s.is_archived ? "Restore Schedule" : "Archive Schedule"}
                                            onClick={() => handleToggleArchive(s)}
                                        >
                                            {s.is_archived ? <ArchiveRestore className="h-4 w-4 text-emerald-400" /> : <Archive className="h-4 w-4" />}
                                        </Button>
                                        <Button size="icon" variant="ghost" className="h-8 w-8 rounded-lg hover:bg-blue-600/20 text-blue-400" onClick={() => openEditSchedule(s)}><Edit className="h-4 w-4" /></Button>
                                        <Button size="icon" variant="ghost" className="h-8 w-8 rounded-lg hover:bg-red-600/20 text-red-400" onClick={() => handleDeleteSchedule(s.id)}><Trash2 className="h-4 w-4" /></Button>
                                    </div>
                                </div>
                            ))}
                        <Button variant="outline" className="w-full border-2 border-dashed border-white/10 bg-transparent hover:bg-white/5 hover:border-blue-500/30 text-slate-400 hover:text-white font-black h-12 rounded-2xl transition-all" onClick={openNewSchedule}>
                            <Plus className="h-4 w-4 mr-2" /> Create New Schedule
                        </Button>
                    </div>
                </GlassCard>
            </div>
        </div>
    );
};
