import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { Plus, Trash2, GripVertical } from 'lucide-react';

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
  const [editingPeriods, setEditingPeriods] = useState<Period[]>(periods);

  // Sync when periods prop changes
  useState(() => {
    setEditingPeriods(periods);
  });

  const handleFieldChange = async (periodId: string, field: keyof Period, value: any) => {
    const updated = editingPeriods.map(p => 
      p.id === periodId ? { ...p, [field]: value } : p
    );
    setEditingPeriods(updated);

    // Debounced save
    const period = updated.find(p => p.id === periodId);
    if (period) {
      await supabase
        .from('periods')
        .update({ [field]: value })
        .eq('id', periodId);
    }
  };

  const handleAddPeriod = async () => {
    const nextOrder = periods.length > 0 
      ? Math.max(...periods.map(p => p.period_order)) + 1 
      : 1;

    const { error } = await supabase
      .from('periods')
      .insert({
        schedule_id: scheduleId,
        name: `${getOrdinal(nextOrder)} Period`,
        period_order: nextOrder,
        start_time: '08:00',
        end_time: '08:50',
        is_passing_period: false
      });

    if (error) {
      toast({ title: 'Error', description: 'Failed to add period.', variant: 'destructive' });
    } else {
      onPeriodsChange();
    }
  };

  const handleDeletePeriod = async (periodId: string) => {
    const { error } = await supabase
      .from('periods')
      .delete()
      .eq('id', periodId);

    if (error) {
      toast({ title: 'Error', description: 'Failed to delete period.', variant: 'destructive' });
    } else {
      onPeriodsChange();
    }
  };

  const handleMoveUp = async (index: number) => {
    if (index === 0) return;
    const currentPeriod = periods[index];
    const abovePeriod = periods[index - 1];
    
    // Swap period_order values
    await supabase.from('periods').update({ period_order: abovePeriod.period_order }).eq('id', currentPeriod.id);
    await supabase.from('periods').update({ period_order: currentPeriod.period_order }).eq('id', abovePeriod.id);
    onPeriodsChange();
  };

  const handleMoveDown = async (index: number) => {
    if (index === periods.length - 1) return;
    const currentPeriod = periods[index];
    const belowPeriod = periods[index + 1];
    
    // Swap period_order values
    await supabase.from('periods').update({ period_order: belowPeriod.period_order }).eq('id', currentPeriod.id);
    await supabase.from('periods').update({ period_order: currentPeriod.period_order }).eq('id', belowPeriod.id);
    onPeriodsChange();
  };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[auto_1fr_80px_100px_100px_auto] gap-2 text-xs font-medium text-muted-foreground px-2">
        <div className="w-8"></div>
        <div>Period Name</div>
        <div className="text-center">Included</div>
        <div>Start</div>
        <div>End</div>
        <div className="w-10"></div>
      </div>
      
      {periods.map((period, index) => (
        <div 
          key={period.id} 
          className="grid grid-cols-[auto_1fr_80px_100px_100px_auto] gap-2 items-center p-2 rounded-lg bg-card border hover:bg-muted/30 transition-colors"
        >
          <div className="flex flex-col gap-0.5">
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-5 w-8 hover:bg-muted"
              onClick={() => handleMoveUp(index)}
              disabled={index === 0}
            >
              <span className="text-xs">↑</span>
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-5 w-8 hover:bg-muted"
              onClick={() => handleMoveDown(index)}
              disabled={index === periods.length - 1}
            >
              <span className="text-xs">↓</span>
            </Button>
          </div>
          
          <Input
            value={period.name}
            onChange={(e) => handleFieldChange(period.id, 'name', e.target.value)}
            className="h-9 text-sm"
          />
          
          <div className="flex justify-center">
            <Checkbox
              checked={!period.is_passing_period}
              onCheckedChange={(checked) => handleFieldChange(period.id, 'is_passing_period', !checked)}
            />
          </div>
          
          <Input
            type="time"
            value={period.start_time}
            onChange={(e) => handleFieldChange(period.id, 'start_time', e.target.value)}
            className="h-9 text-sm"
          />
          
          <Input
            type="time"
            value={period.end_time}
            onChange={(e) => handleFieldChange(period.id, 'end_time', e.target.value)}
            className="h-9 text-sm"
          />
          
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={() => handleDeletePeriod(period.id)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      
      <Button 
        variant="outline" 
        onClick={handleAddPeriod}
        className="w-full mt-2 border-dashed"
      >
        <Plus className="h-4 w-4 mr-2" />
        Add Period
      </Button>
    </div>
  );
};
