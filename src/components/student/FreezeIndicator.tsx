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
    <div className="relative overflow-hidden rounded-2xl border-2 border-red-500/40 bg-gradient-to-br from-red-950/30 via-slate-900/60 to-slate-900/80 backdrop-blur-md animate-in fade-in duration-500">
      {/* 1. Frosted glass overlay - Optimized for dark theme */}
      <div className="absolute inset-0 bg-red-500/5 pointer-events-none backdrop-blur-[1px]" />

      {/* 2. Animated ice crystals */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(12)].map((_, i) => (
          <Snowflake
            key={i}
            className="absolute text-white/10 animate-pulse"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              width: `${14 + Math.random() * 18}px`,
              height: `${14 + Math.random() * 18}px`,
              animationDelay: `${Math.random() * 2}s`,
              animationDuration: `${3 + Math.random() * 2}s`,
              transform: `rotate(${Math.random() * 360}deg)`,
            }}
          />
        ))}
      </div>

      {/* 3. Pulsing border effect */}
      <div className="absolute inset-0 rounded-2xl border-2 border-red-500/30 animate-pulse pointer-events-none" />

      <div className="relative p-5">
        <div className="flex items-center gap-4">
          {/* Icon Container */}
          <div className="relative p-3 rounded-2xl bg-gradient-to-br from-red-600/20 to-slate-800/60 border border-white/20 shadow-lg shadow-red-950/50">
            <Snowflake className="h-6 w-6 text-red-500 animate-spin" style={{ animationDuration: '10s' }} />
          </div>

          {/* Text Content */}
          <div className="flex-1">
            <p className="font-black text-xl text-white tracking-tight">
              {isBathroomOnly ? 'Restroom' : 'All Passes'} <span className="text-red-500 shadow-sm">Frozen</span>
            </p>

            {timeRemaining !== null ? (
              <div className="flex items-center gap-2 mt-1">
                <Timer className="h-4 w-4 text-red-500/80" />
                <p className="text-red-300 font-mono text-xl font-black tracking-tighter">
                  {formatTime(timeRemaining)}
                </p>
                <span className="text-slate-500 text-[10px] font-black uppercase tracking-[0.2em]">
                  remaining
                </span>
              </div>
            ) : (
              <p className="text-sm text-slate-400 font-black mt-1">
                Requests are temporarily paused
              </p>
            )}
          </div>
        </div>

        {/* Ice crack decorations - Subtler for dark theme */}
        <svg className="absolute bottom-0 right-0 w-20 h-20 text-white/5 pointer-events-none" viewBox="0 0 100 100">
          <path d="M0 100 L30 70 L25 50 L40 30 L35 10 L50 0" fill="none" stroke="currentColor" strokeWidth="1" />
          <path d="M30 70 L45 75 L60 60" fill="none" stroke="currentColor" strokeWidth="1" />
        </svg>
      </div>

      {/* Shimmer Effect */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div
          className="w-1/2 h-full bg-gradient-to-r from-transparent via-red-500/10 to-transparent"
          style={{
            animation: 'shimmer-slide 4s infinite linear',
          }}
        />
      </div>
    </div>
  );
};
