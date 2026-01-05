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
    <div className="space-y-2">
      {sortedPeriods.map((period, idx) => (
        <div key={period.id || `temp-${period.period_order}-${idx}`} className={`grid grid-cols-[1fr_110px_110px_40px] gap-3 items-center p-2 rounded-lg border transition-all ${period.is_passing_period ? 'bg-muted/10 border-dashed' : 'bg-card'
          }`}>
          <div className="flex items-center gap-2 px-1">
            {period.is_passing_period ? (
              <>
                <Clock className="h-3.5 w-3.5 text-orange-500 shrink-0" />
                <Input
                  value={period.name}
                  onChange={(e) => handleFieldChange(idx, 'name', e.target.value)}
                  className="h-8 text-xs bg-background focus-visible:ring-0 focus-visible:ring-offset-0"
                />
              </>
            ) : (
              <div className="flex items-center gap-2 h-8">
                <BookOpen className="h-3.5 w-3.5 text-primary shrink-0" />
                <span className="font-semibold text-xs">{period.name}</span>
              </div>
            )}
          </div>

          <Input
            type="time"
            value={period.start_time}
            onChange={(e) => handleFieldChange(idx, 'start_time', e.target.value)}
            className="h-8 text-xs px-2 focus-visible:ring-0 focus-visible:ring-offset-0"
          />

          <Input
            type="time"
            value={period.end_time}
            onChange={(e) => handleFieldChange(idx, 'end_time', e.target.value)}
            className="h-8 text-xs px-2 focus-visible:ring-0 focus-visible:ring-offset-0"
          />

          <Button
            variant="ghost"
            size="icon"
            onClick={() => handleDelete(idx)}
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}

      <div className="flex gap-2 pt-1">
        <Button variant="outline" size="sm" onClick={() => handleAddEntry('class')} className="flex-1 text-xs h-9">
          <Plus className="h-3.5 w-3.5 mr-1" /> Add Period
        </Button>
        <Button variant="outline" size="sm" onClick={() => handleAddEntry('structured')} className="flex-1 text-xs border-dashed h-9">
          <Clock className="h-3.5 w-3.5 mr-1" /> Add Structured Time
        </Button>
      </div>
    </div>
  );
};
