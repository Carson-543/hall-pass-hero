import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Plus, Trash2, Clock, BookOpen, Save } from 'lucide-react';

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
  
  // Local state to hold changes before they are saved to the DB
  const [localPeriods, setLocalPeriods] = useState<Period[]>([]);

  // Sync local state when the source data changes (e.g., initial load)
  useEffect(() => {
    setLocalPeriods(periods);
  }, [periods]);

  const handleLocalFieldChange = (periodId: string, field: keyof Period, value: any) => {
    setLocalPeriods(prev => prev.map(p => 
      p.id === periodId ? { ...p, [field]: value } : p
    ));
  };

  const handleSaveAll = async () => {
    try {
      // Upsert all current local periods to the database
      const { error } = await supabase
        .from('periods')
        .upsert(localPeriods, { onConflict: 'id' });

      if (error) throw error;

      toast({ title: 'Schedule Saved', description: 'All changes have been synced.' });
      onPeriodsChange(); // Refresh parent data
    } catch (error) {
      toast({ 
        title: 'Error', 
        description: 'Failed to save changes. Please check your connection.', 
        variant: 'destructive' 
      });
    }
  };

  const handleAddEntry = async (type: 'class' | 'structured') => {
    const classPeriodCount = localPeriods.filter(p => !p.is_passing_period).length;
    const nextOrder = localPeriods.length > 0 
      ? Math.max(...localPeriods.map(p => p.period_order)) + 1 
      : 1;

    const newPeriod = {
      schedule_id: scheduleId,
      name: type === 'class' ? `${getOrdinal(classPeriodCount + 1)} Period` : 'New Structured Time',
      period_order: nextOrder,
      start_time: '08:00',
      end_time: '08:50',
      is_passing_period: type === 'structured'
    };

    // Add to DB immediately to get an ID, then refresh local
    const { error } = await supabase.from('periods').insert(newPeriod);
    
    if (error) {
      toast({ title: 'Error', description: 'Could not add row.', variant: 'destructive' });
    } else {
      onPeriodsChange();
    }
  };

  const handleDeletePeriod = async (periodId: string) => {
    const { error } = await supabase.from('periods').delete().eq('id', periodId);
    if (!error) onPeriodsChange();
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-[1fr_120px_120px_40px] gap-4 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        <div>Label / Name</div>
        <div>Start Time</div>
        <div>End Time</div>
        <div></div>
      </div>
      
      <div className="space-y-2">
        {localPeriods.sort((a, b) => a.period_order - b.period_order).map((period) => (
          <div 
            key={period.id} 
            className={`grid grid-cols-[1fr_120px_120px_40px] gap-4 items-center p-3 rounded-xl border transition-all ${
              period.is_passing_period ? 'bg-muted/30 border-dashed' : 'bg-card shadow-sm'
            }`}
          >
            <div className="flex items-center gap-3">
              {period.is_passing_period ? (
                <div className="flex items-center gap-2 w-full">
                  <Clock className="h-4 w-4 text-orange-500 shrink-0" />
                  <Input
                    value={period.name}
                    onChange={(e) => handleLocalFieldChange(period.id, 'name', e.target.value)}
                    className="h-8 text-sm bg-background"
                  />
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-primary shrink-0" />
                  <span className="font-bold text-sm text-foreground">{period.name}</span>
                </div>
              )}
            </div>
            
            <Input
              type="time"
              value={period.start_time}
              onChange={(e) => handleLocalFieldChange(period.id, 'start_time', e.target.value)}
              className="h-9 text-sm font-medium"
            />
            
            <Input
              type="time"
              value={period.end_time}
              onChange={(e) => handleLocalFieldChange(period.id, 'end_time', e.target.value)}
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
      
      <div className="flex flex-col gap-3 pt-2">
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={() => handleAddEntry('class')}
            className="flex-1 bg-primary/5 border-primary/20 hover:bg-primary/10 text-primary h-10"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Class Period
          </Button>
          <Button 
            variant="outline" 
            onClick={() => handleAddEntry('structured')}
            className="flex-1 border-dashed h-10"
          >
            <Clock className="h-4 w-4 mr-2" />
            Add Structured Time
          </Button>
        </div>

        <Button 
          onClick={handleSaveAll} 
          className="w-full bg-green-600 hover:bg-green-700 text-white font-bold h-11"
        >
          <Save className="h-4 w-4 mr-2" />
          Save All Changes
        </Button>
      </div>
    </div>
  );
};
