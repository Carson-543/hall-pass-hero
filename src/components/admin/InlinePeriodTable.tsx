import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Plus, Trash2, Clock, BookOpen } from 'lucide-react';

interface Period {
  id: string;
  schedule_id: string;
  name: string;
  period_order: number;
  start_time: string;
  end_time: string;
  is_passing_period: boolean;
}

interface InlinePeriodTableProps {
  scheduleId: string;
  periods: Period[];
  onPeriodsChange: () => void;
}

const getOrdinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

export const InlinePeriodTable = ({ scheduleId, periods, onPeriodsChange }: InlinePeriodTableProps) => {
  const { toast } = useToast();
  
  // Local state for smooth typing and time selection
  const [localPeriods, setLocalPeriods] = useState<Period[]>([]);

  useEffect(() => {
    setLocalPeriods(periods);
  }, [periods]);

  const handleLocalFieldChange = async (periodId: string, field: keyof Period, value: any) => {
    // 1. Update local UI state immediately for responsiveness
    setLocalPeriods(prev => prev.map(p => 
      p.id === periodId ? { ...p, [field]: value } : p
    ));

    // 2. Silently update the DB in the background so the parent 
    // "Save" button doesn't have to handle a complex bulk upsert.
    // This resolves the "finicky" typing while staying synced.
    await supabase
      .from('periods')
      .update({ [field]: value })
      .eq('id', periodId);
  };

  const handleAddEntry = async (type: 'class' | 'structured') => {
    const classPeriodCount = localPeriods.filter(p => !p.is_passing_period).length;
    const nextOrder = localPeriods.length > 0 
      ? Math.max(...localPeriods.map(p => p.period_order)) + 1 
      : 1;

    const { error } = await supabase
      .from('periods')
      .insert({
        schedule_id: scheduleId,
        name: type === 'class' ? `${getOrdinal(classPeriodCount + 1)} Period` : 'New Structured Time',
        period_order: nextOrder,
        start_time: '08:00',
        end_time: '08:50',
        is_passing_period: type === 'structured'
      });

    if (error) {
      toast({ title: 'Error', description: 'Could not add entry.', variant: 'destructive' });
    } else {
      onPeriodsChange();
    }
  };

  const handleDeletePeriod = async (periodId: string) => {
    const { error } = await supabase.from('periods').delete().eq('id', periodId);
    if (!error) onPeriodsChange();
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[1fr_110px_110px_40px] gap-3 px-4 text-[10px] font-bold text-muted-foreground uppercase">
        <div>Label / Name</div>
        <div>Start</div>
        <div>End</div>
        <div></div>
      </div>
      
      <div className="space-y-1.5">
        {localPeriods.sort((a, b) => a.period_order - b.period_order).map((period) => (
          <div 
            key={period.id} 
            className={`grid grid-cols-[1fr_110px_110px_40px] gap-3 items-center p-2 rounded-lg border transition-all ${
              period.is_passing_period ? 'bg-muted/20 border-dashed' : 'bg-card'
            }`}
          >
            <div className="flex items-center gap-2 overflow-hidden">
              {period.is_passing_period ? (
                <>
                  <Clock className="h-3.5 w-3.5 text-orange-500 shrink-0" />
                  <Input
                    value={period.name}
                    onChange={(e) => handleLocalFieldChange(period.id, 'name', e.target.value)}
                    className="h-7 text-xs bg-background"
                  />
                </>
              ) : (
                <>
                  <BookOpen className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span className="font-semibold text-xs truncate">{period.name}</span>
                </>
              )}
            </div>
            
            <Input
              type="time"
              step="60" // Ensures multi-digit typing works better in some browsers
              value={period.start_time}
              onChange={(e) => handleLocalFieldChange(period.id, 'start_time', e.target.value)}
              className="h-8 text-xs px-2"
            />
            
            <Input
              type="time"
              step="60"
              value={period.end_time}
              onChange={(e) => handleLocalFieldChange(period.id, 'end_time', e.target.value)}
              className="h-8 text-xs px-2"
            />
            
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-destructive"
              onClick={() => handleDeletePeriod(period.id)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </div>
      
      <div className="flex gap-2 pt-1">
        <Button 
          variant="outline" 
          size="sm"
          onClick={() => handleAddEntry('class')}
          className="flex-1 text-xs h-8"
        >
          <Plus className="h-3.5 w-3.5 mr-1" />
          Add Period
        </Button>
        <Button 
          variant="outline" 
          size="sm"
          onClick={() => handleAddEntry('structured')}
          className="flex-1 text-xs border-dashed h-8"
        >
          <Clock className="h-3.5 w-3.5 mr-1" />
          Structured Time
        </Button>
      </div>
    </div>
  );
};
