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
    <Card className="relative overflow-hidden border-2 border-cyan-400/60 bg-gradient-to-br from-cyan-500/20 via-blue-500/15 to-indigo-500/20 backdrop-blur-sm animate-in fade-in duration-500">
      {/* 1. Frosted glass overlay - High intensity for white background separation */}
      <div className="absolute inset-0 bg-white/40 pointer-events-none backdrop-blur-[2px]" />

      {/* 2. Animated ice crystals */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(15)].map((_, i) => (
          <Snowflake
            key={i}
            className="absolute text-blue-400/40 animate-pulse"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              width: `${12 + Math.random() * 20}px`,
              height: `${12 + Math.random() * 20}px`,
              animationDelay: `${Math.random() * 2}s`,
              animationDuration: `${3 + Math.random() * 2}s`,
              transform: `rotate(${Math.random() * 360}deg)`,
            }}
          />
        ))}
      </div>

      {/* 3. Pulsing border effect */}
      <div className="absolute inset-0 rounded-lg border-2 border-cyan-300/40 animate-pulse pointer-events-none" />

      <CardContent className="relative p-5">
        <div className="flex items-center gap-4">
          {/* Icon Container */}
          <div className="relative p-3 rounded-full bg-gradient-to-br from-cyan-400/40 to-blue-500/40 border border-white/50 shadow-lg shadow-cyan-500/20">
            <Snowflake className="h-7 w-7 text-blue-900 animate-spin" style={{ animationDuration: '10s' }} />
            <div className="absolute inset-0 rounded-full bg-cyan-200/30 blur-md" />
          </div>

          {/* Text Content with White Glows */}
          <div className="flex-1">
            <p className="font-black text-xl text-blue-900 drop-shadow-[0_0_12px_rgba(255,255,255,1)] drop-shadow-[0_0_3px_rgba(255,255,255,1)]">
              {isBathroomOnly ? 'Restroom Passes' : '🔒 All Passes'} Frozen
            </p>
            
            {timeRemaining !== null ? (
              <div className="flex items-center gap-2 mt-1">
                <Timer className="h-5 w-5 text-blue-900 drop-shadow-[0_0_5px_white]" />
                <p className="text-blue-900 font-mono text-xl font-black tracking-tighter drop-shadow-[0_0_10px_white]">
                  {formatTime(timeRemaining)}
                </p>
                <span className="text-blue-900/90 text-xs font-bold uppercase tracking-widest drop-shadow-[0_0_5px_white]">
                  remaining
                </span>
              </div>
            ) : (
              <p className="text-sm text-blue-900 font-bold mt-1 drop-shadow-[0_0_8px_white]">
                Requests are temporarily paused
              </p>
            )}
          </div>
        </div>

        {/* Ice crack decorations */}
        <svg className="absolute bottom-0 right-0 w-24 h-24 text-cyan-500/10 pointer-events-none" viewBox="0 0 100 100">
          <path d="M0 100 L30 70 L25 50 L40 30 L35 10 L50 0" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M30 70 L45 75 L60 60" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </CardContent>

      {/* Shimmer Effect Animation */}
      <style>{`
        @keyframes shimmer-slide {
          0% { transform: translateX(-150%) skewX(-20deg); }
          100% { transform: translateX(150%) skewX(-20deg); }
        }
      `}</style>
      <div
        className="absolute inset-0 pointer-events-none overflow-hidden"
      >
        <div 
          className="w-1/2 h-full bg-gradient-to-r from-transparent via-white/20 to-transparent"
          style={{
            animation: 'shimmer-slide 4s infinite linear',
          }}
        />
      </div>
    </Card>
  );
};
