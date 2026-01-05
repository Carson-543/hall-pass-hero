import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useToast } from '@/hooks/use-toast';
import { Snowflake, Timer, X } from 'lucide-react';
import { differenceInSeconds, addMinutes } from 'date-fns';

interface FreezeControlsProps {
  classId: string;
  teacherId: string;
}

interface ActiveFreeze {
  id: string;
  freeze_type: 'bathroom' | 'all';
  started_at: string;
  ends_at: string | null;
}

export const FreezeControls = ({ classId, teacherId }: FreezeControlsProps) => {
  const { toast } = useToast();
  const [activeFreeze, setActiveFreeze] = useState<ActiveFreeze | null>(null);
  const [freezeType, setFreezeType] = useState<'bathroom' | 'all'>('bathroom');
  const [timerMinutes, setTimerMinutes] = useState<string>('');
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchActiveFreeze();

    const channel = supabase
      .channel(`freeze-${classId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'pass_freezes',
        filter: `class_id=eq.${classId}`
      }, () => fetchActiveFreeze())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [classId]);

  // Countdown timer
  useEffect(() => {
    if (!activeFreeze?.ends_at) {
      setTimeRemaining(null);
      return;
    }

    const updateTimer = () => {
      const remaining = differenceInSeconds(new Date(activeFreeze.ends_at!), new Date());
      if (remaining <= 0) {
        // Auto-unfreeze when timer expires
        handleUnfreeze();
      } else {
        setTimeRemaining(remaining);
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [activeFreeze?.ends_at]);

  const fetchActiveFreeze = async () => {
    const { data } = await supabase
      .from('pass_freezes')
      .select('*')
      .eq('class_id', classId)
      .eq('is_active', true)
      .maybeSingle();

    if (data) {
      setActiveFreeze({
        id: data.id,
        freeze_type: data.freeze_type as 'bathroom' | 'all',
        started_at: data.started_at,
        ends_at: data.ends_at,
      });
    } else {
      setActiveFreeze(null);
    }
  };

  const handleFreeze = async () => {
    setLoading(true);

    const endsAt = timerMinutes
      ? addMinutes(new Date(), parseInt(timerMinutes)).toISOString()
      : null;

    const { error } = await supabase
      .from('pass_freezes')
      .upsert({
        class_id: classId,
        teacher_id: teacherId,
        freeze_type: freezeType,
        ends_at: endsAt,
        is_active: true,
      }, { onConflict: 'class_id' });

    if (error) {
      toast({ title: 'Error', description: 'Failed to freeze passes', variant: 'destructive' });
    } else {
      toast({ title: freezeType === 'bathroom' ? 'Restroom Passes Frozen' : 'All Passes Frozen' });
    }

    setTimerMinutes('');
    setLoading(false);
  };

  const handleUnfreeze = async () => {
    if (!activeFreeze) return;

    const { error } = await supabase
      .from('pass_freezes')
      .delete()
      .eq('id', activeFreeze.id);

    if (!error) {
      setActiveFreeze(null);
      toast({ title: 'Passes Unfrozen' });
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (activeFreeze) {
    return (
      <Card className="border-destructive/50 bg-destructive/5">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-destructive/10">
                <Snowflake className="h-5 w-5 text-destructive animate-pulse" />
              </div>
              <div>
                <p className="font-semibold text-destructive">
                  {activeFreeze.freeze_type === 'bathroom' ? 'Restroom' : 'All'} Passes Frozen
                </p>
                {timeRemaining !== null && (
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <Timer className="h-3 w-3" />
                    Auto-unfreezes in {formatTime(timeRemaining)}
                  </p>
                )}
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleUnfreeze}
              className="border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
            >
              <X className="h-4 w-4 mr-1" />
              Unfreeze
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Snowflake className="h-4 w-4" />
          Freeze Passes
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72" align="end">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Freeze Type</Label>
            <Select value={freezeType} onValueChange={(v) => setFreezeType(v as 'bathroom' | 'all')}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bathroom">Restroom Only</SelectItem>
                <SelectItem value="all">All Passes</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Auto-Unfreeze Timer (optional)</Label>
            <div className="flex gap-2">
              <Input
                type="number"
                placeholder="Minutes"
                value={timerMinutes}
                onChange={(e) => setTimerMinutes(e.target.value)}
                min={1}
                max={120}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Leave empty for manual unfreeze
            </p>
          </div>

          <Button
            className="w-full"
            onClick={handleFreeze}
            disabled={loading}
          >
            {loading ? 'Freezing...' : 'Freeze Now'}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};
