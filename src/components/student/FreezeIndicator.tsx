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
    <div className="relative overflow-hidden rounded-2xl border-2 border-blue-500/50 bg-gradient-to-br from-blue-950/40 via-slate-900/70 to-slate-900/90 backdrop-blur-md animate-in fade-in duration-500 shadow-2xl">
      {/* 1. Frosted glass overlay - Optimized for dark theme */}
      <div className="absolute inset-0 bg-blue-500/5 pointer-events-none backdrop-blur-[1px]" />

      {/* 2. Animated ice crystals */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(12)].map((_, i) => (
          <Snowflake
            key={i}
            className="absolute text-blue-200/20 animate-pulse"
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
      <div className="absolute inset-0 rounded-2xl border-2 border-blue-400/30 animate-pulse pointer-events-none" />

      <div className="relative p-6">
        <div className="flex items-center gap-5">
          {/* Icon Container */}
          <div className="relative p-4 rounded-2xl bg-gradient-to-br from-blue-600/30 to-slate-800/80 border-2 border-white/20 shadow-xl shadow-blue-900/60">
            <Snowflake className="h-7 w-7 text-blue-400 animate-spin" style={{ animationDuration: '10s' }} />
          </div>

          {/* Text Content */}
          <div className="flex-1">
            <p className="font-black text-2xl text-white tracking-tighter">
              {isBathroomOnly ? 'Restroom' : 'All Passes'} <span className="text-blue-400 drop-shadow-[0_0_10px_rgba(96,165,250,0.5)]">Frozen</span>
            </p>

            {timeRemaining !== null ? (
              <div className="flex items-center gap-3 mt-2">
                <Timer className="h-5 w-5 text-blue-400" />
                <p className="text-blue-200 font-mono text-2xl font-black tracking-tighter">
                  {formatTime(timeRemaining)}
                </p>
                <span className="text-slate-400 text-[10px] font-black uppercase tracking-[0.3em]">
                  remaining
                </span>
              </div>
            ) : (
              <p className="text-sm text-slate-300 font-black mt-1 uppercase tracking-widest">
                Requests are paused
              </p>
            )}
          </div>
        </div>

        {/* Ice crack decorations - Subtler for dark theme */}
        <svg className="absolute bottom-0 right-0 w-24 h-24 text-blue-400/10 pointer-events-none" viewBox="0 0 100 100">
          <path d="M0 100 L30 70 L25 50 L40 30 L35 10 L50 0" fill="none" stroke="currentColor" strokeWidth="1" />
          <path d="M30 70 L45 75 L60 60" fill="none" stroke="currentColor" strokeWidth="1" />
        </svg>
      </div>

      {/* Shimmer Effect */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div
          className="w-1/2 h-full bg-gradient-to-r from-transparent via-blue-400/10 to-transparent"
          style={{
            animation: 'shimmer-slide 4s infinite linear',
          }}
        />
      </div>
    </div>
  );
};
