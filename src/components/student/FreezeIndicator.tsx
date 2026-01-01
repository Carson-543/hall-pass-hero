import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Snowflake, Timer } from 'lucide-react';
import { differenceInSeconds } from 'date-fns';

interface FreezeIndicatorProps {
  classId: string;
}

interface ActiveFreeze {
  freeze_type: 'bathroom' | 'all';
  ends_at: string | null;
}

export const FreezeIndicator = ({ classId }: FreezeIndicatorProps) => {
  const [freeze, setFreeze] = useState<ActiveFreeze | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (!classId) return;

    fetchFreeze();

    const channel = supabase
      .channel(`student-freeze-${classId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'pass_freezes',
        filter: `class_id=eq.${classId}`
      }, () => fetchFreeze())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [classId]);

  useEffect(() => {
    if (!freeze?.ends_at) {
      setTimeRemaining(null);
      return;
    }

    const updateTimer = () => {
      const remaining = differenceInSeconds(new Date(freeze.ends_at!), new Date());
      if (remaining <= 0) {
        setFreeze(null);
        setTimeRemaining(null);
      } else {
        setTimeRemaining(remaining);
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [freeze?.ends_at]);

  const fetchFreeze = async () => {
    const { data } = await supabase
      .from('pass_freezes')
      .select('freeze_type, ends_at')
      .eq('class_id', classId)
      .eq('is_active', true)
      .maybeSingle();

    if (data) {
      setFreeze({
        freeze_type: data.freeze_type as 'bathroom' | 'all',
        ends_at: data.ends_at,
      });
    } else {
      setFreeze(null);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!freeze) return null;

  const isBathroomOnly = freeze.freeze_type === 'bathroom';

  return (
    <Card className="border-amber-500/50 bg-amber-500/10 animate-in fade-in duration-300">
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-full bg-amber-500/20">
            <Snowflake className="h-5 w-5 text-amber-600 animate-pulse" />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-amber-700">
              {isBathroomOnly ? 'Bathroom Passes' : 'All Passes'} Temporarily Unavailable
            </p>
            {timeRemaining !== null ? (
              <p className="text-sm text-amber-600 flex items-center gap-1">
                <Timer className="h-3 w-3" />
                Available again in {formatTime(timeRemaining)}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Your teacher has paused pass requests
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
