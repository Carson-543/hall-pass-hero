import { useState } from 'react';
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
  is_passing_period: boolean; // Used here to denote "Structured Time"
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

  const handleFieldChange = async (periodId: string, field: keyof Period, value: any) => {
    const { error } = await supabase
      .from('periods')
      .update({ [field]: value })
      .eq('id', periodId);

    if (error) {
      toast({ title: 'Error', description: 'Failed to update time.', variant: 'destructive' });
    } else {
      onPeriodsChange();
    }
  };

  const handleAddEntry = async (type: 'class' | 'structured') => {
    // Calculate how many actual "class periods" exist to get the correct ordinal
    const classPeriodCount = periods.filter(p => !p.is_passing_period).length;
    const nextOrder = periods.length > 0 
      ? Math.max(...periods.map(p => p.period_order)) + 1 
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
      toast({ title: 'Error', description: 'Failed to add entry.', variant: 'destructive' });
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
      <div className="grid grid-cols-[1fr_120px_120px_40px] gap-4 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        <div>Label / Name</div>
        <div>Start Time</div>
        <div>End Time</div>
        <div></div>
      </div>
      
      <div className="space-y-2">
        {periods.sort((a, b) => a.period_order - b.period_order).map((period) => (
          <div 
            key={period.id} 
            className={`grid grid-cols-[1fr_120px_120px_40px] gap-4 items-center p-3 rounded-xl border transition-all ${
              period.is_passing_period ? 'bg-muted/30 border-dashed' : 'bg-card shadow-sm'
            }`}
          >
            {/* Period Name: Text for Classes, Input for Structured */}
            <div className="flex items-center gap-3">
              {period.is_passing_period ? (
                <div className="flex items-center gap-2 w-full">
                  <Clock className="h-4 w-4 text-orange-500 shrink-0" />
                  <Input
                    value={period.name}
                    onChange={(e) => handleFieldChange(period.id, 'name', e.target.value)}
                    className="h-8 text-sm bg-background"
                    placeholder="e.g. Lunch or Homeroom"
                  />
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-primary shrink-0" />
                  <span className="font-bold text-sm text-foreground">{period.name}</span>
                </div>
              )}
            </div>
            
            {/* Time Inputs */}
            <Input
              type="time"
              value={period.start_time}
              onChange={(e) => handleFieldChange(period.id, 'start_time', e.target.value)}
              className="h-9 text-sm font-medium"
            />
            
            <Input
              type="time"
              value={period.end_time}
              onChange={(e) => handleFieldChange(period.id, 'end_time', e.target.value)}
              className="h-9 text-sm font-medium"
            />
            
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
              onClick={() => handleDeletePeriod(period.id)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
      
      <div className="flex gap-2 pt-2">
        <Button 
          variant="outline" 
          onClick={() => handleAddEntry('class')}
          className="flex-1 bg-primary/5 border-primary/20 hover:bg-primary/10 text-primary"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Class Period
        </Button>
        <Button 
          variant="outline" 
          onClick={() => handleAddEntry('structured')}
          className="flex-1 border-dashed"
        >
          <Clock className="h-4 w-4 mr-2" />
          Add Structured Time
        </Button>
      </div>
    </div>
  );
};
