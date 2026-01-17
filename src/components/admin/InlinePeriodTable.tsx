import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Trash2, Clock, BookOpen } from 'lucide-react';

interface Period {
  id?: string;
  schedule_id: string;
  name: string;
  period_order: number;
  start_time: string;
  end_time: string;
  is_passing_period: boolean;
}

interface InlinePeriodTableProps {
  periods: Period[];
  onChange: (updatedPeriods: Period[]) => void;
}

export const InlinePeriodTable = ({ periods, onChange }: InlinePeriodTableProps) => {

  // Create a sorted version for the UI so the indices match the rows seen by the user
  const sortedPeriods = [...periods].sort((a, b) => a.period_order - b.period_order);

  const handleFieldChange = (indexInSorted: number, field: keyof Period, value: any) => {
    // 1. Work with the sorted copy
    const updated = [...sortedPeriods];

    // 2. Update the specific field while keeping everything else (like id) intact
    updated[indexInSorted] = {
      ...updated[indexInSorted],
      [field]: value
    };

    // 3. Send the full updated array back to AdminDashboard
    console.log(`📝 InlinePeriodTable: Updating period at index ${indexInSorted} (Order: ${updated[indexInSorted].period_order})`, updated[indexInSorted]);
    onChange(updated);
  };

  const handleAddEntry = (type: 'class' | 'structured') => {
    const classCount = periods.filter(p => !p.is_passing_period).length;
    const nextOrder = periods.length > 0 ? Math.max(...periods.map(p => p.period_order)) + 1 : 1;

    const newPeriod: Period = {
      name: type === 'class' ? `${classCount + 1}${getOrdinal(classCount + 1)} Period` : 'Lunch',
      period_order: nextOrder,
      start_time: '08:00',
      end_time: '08:50',
      is_passing_period: type === 'structured',
      schedule_id: periods[0]?.schedule_id || ''
    };
    onChange([...periods, newPeriod]);
  };

  const handleDelete = (indexInSorted: number) => {
    const updated = sortedPeriods.filter((_, i) => i !== indexInSorted);
    onChange(updated);
  };

  const getOrdinal = (n: number) => {
    const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
    return s[(v - 20) % 10] || s[v] || s[0];
  };

  return (
    <div className="space-y-3">
      {sortedPeriods.map((period, idx) => (
        <div
          key={period.id || `temp-${period.period_order}-${idx}`}
          className={`grid grid-cols-[1fr_auto_auto_40px] gap-4 items-center p-3 rounded-2xl border transition-all duration-300 ${period.is_passing_period
              ? 'bg-blue-500/5 border-dashed border-blue-500/20 group hover:border-blue-500/40'
              : 'bg-white/5 border-white/5 group hover:border-white/20 hover:bg-white/[0.07]'
            }`}
        >
          <div className="flex items-center gap-3 px-1 min-w-0">
            <div className={`p-2 rounded-xl shrink-0 transition-colors ${period.is_passing_period ? 'bg-blue-500/10 text-blue-400' : 'bg-slate-500/10 text-slate-400'
              }`}>
              {period.is_passing_period ? (
                <Clock className="h-4 w-4" />
              ) : (
                <BookOpen className="h-4 w-4" />
              )}
            </div>

            <div className="flex-1 min-w-0">
              {period.is_passing_period ? (
                <Input
                  value={period.name}
                  onChange={(e) => handleFieldChange(idx, 'name', e.target.value)}
                  className="h-9 text-xs font-bold bg-slate-900/50 border-white/5 focus-visible:ring-blue-500/20 focus:border-blue-500/30 text-white placeholder:text-slate-600 rounded-xl"
                />
              ) : (
                <div className="flex flex-col">
                  <span className="font-black text-xs text-white tracking-wide uppercase">{period.name}</span>
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">Class Period</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <span className="absolute -top-4 left-1 text-[8px] font-black text-slate-600 uppercase tracking-widest">Start</span>
              <Input
                type="time"
                value={period.start_time}
                onChange={(e) => handleFieldChange(idx, 'start_time', e.target.value)}
                className="h-10 w-[100px] text-xs font-black bg-slate-900/50 border-white/10 focus:border-blue-500/50 rounded-xl text-white appearance-none"
              />
            </div>
            <div className="relative">
              <span className="absolute -top-4 left-1 text-[8px] font-black text-slate-600 uppercase tracking-widest">End</span>
              <Input
                type="time"
                value={period.end_time}
                onChange={(e) => handleFieldChange(idx, 'end_time', e.target.value)}
                className="h-10 w-[100px] text-xs font-black bg-slate-900/50 border-white/10 focus:border-blue-500/50 rounded-xl text-white appearance-none"
              />
            </div>
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => handleDelete(idx)}
            className="h-10 w-10 text-slate-600 hover:text-red-400 hover:bg-red-400/10 rounded-xl transition-all"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}

      <div className="flex gap-3 pt-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleAddEntry('class')}
          className="flex-1 text-[10px] font-black uppercase tracking-widest h-11 rounded-2xl bg-white/5 border-white/10 hover:bg-blue-600 hover:border-blue-500 text-slate-400 hover:text-white transition-all shadow-lg"
        >
          <Plus className="h-3.5 w-3.5 mr-2" /> Add Period
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleAddEntry('structured')}
          className="flex-1 text-[10px] font-black uppercase tracking-widest h-11 rounded-2xl bg-white/5 border-white/10 border-dashed hover:bg-slate-800 hover:border-white/20 text-slate-400 hover:text-white transition-all shadow-lg"
        >
          <Clock className="h-3.5 w-3.5 mr-2" /> Add Passing
        </Button>
      </div>
    </div>
  );
};
