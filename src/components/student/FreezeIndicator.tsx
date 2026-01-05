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
      {/* Frosted glass overlay - Intensity increased */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/30 to-blue-200/5 pointer-events-none backdrop-blur-[2px]" />


      {/* Animated ice crystals */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(20)].map((_, i) => (
          <Snowflake
            key={i}
            className="absolute text-blue-800 animate-pulse"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              width: `${10 + Math.random() * 20}px`,
              height: `${10 + Math.random() * 20}px`,
              animationDelay: `${Math.random() * 2}s`,
              animationDuration: `${2 + Math.random() * 3}s`,
              transform: `rotate(${Math.random() * 360}deg)`,
              opacity: Math.random() * 0.7 + 0.3
            }}
          />
        ))}
      </div>


      {/* Pulsing border effect */}
      <div className="absolute inset-0 rounded-lg border-2 border-cyan-400/30 animate-pulse pointer-events-none" />

      <CardContent className="relative p-5">
        <div className="flex items-center gap-4">
          <div className="relative p-3 rounded-full bg-gradient-to-br from-cyan-400/30 to-blue-500/30 border border-cyan-300/50 shadow-lg shadow-cyan-500/20">
            <Snowflake className="h-7 w-7 text-blue-800 animate-spin" style={{ animationDuration: '8s' }} />
            {/* Inner glow */}
            <div className="absolute inset-0 rounded-full bg-cyan-400/40 blur-md" />

          </div>
          <div className="flex-1">
            <p className="font-bold text-lg text-blue-800 drop-shadow-md">
              {isBathroomOnly ? 'Restroom Passes' : '🔒 All Passes'} Frozen
            </p>
            {timeRemaining !== null ? (
              <div className="flex items-center gap-2 mt-1">
                <Timer className="h-4 w-4 text-blue-800" />
                <p className="text-blue-800 font-mono text-lg font-bold tracking-wider">
                  {formatTime(timeRemaining)}
                </p>
                <span className="text-blue-800/80 text-sm">remaining</span>
              </div>
            ) : (
              <p className="text-sm text-blue-800/80 mt-1">
                Your teacher has temporarily paused pass requests
              </p>
            )}
          </div>
        </div>

        {/* Ice crack decorations */}
        <svg className="absolute bottom-0 right-0 w-24 h-24 text-cyan-300/20 pointer-events-none" viewBox="0 0 100 100">
          <path d="M0 100 L30 70 L25 50 L40 30 L35 10 L50 0" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M30 70 L45 75 L60 60" fill="none" stroke="currentColor" strokeWidth="1" />
          <path d="M40 30 L55 35" fill="none" stroke="currentColor" strokeWidth="1" />
        </svg>
        <svg className="absolute top-0 left-0 w-16 h-16 text-cyan-300/15 pointer-events-none" viewBox="0 0 100 100">
          <path d="M100 0 L70 30 L80 50 L60 70 L70 90" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </CardContent>

      {/* Shimmer effect */}
      <style>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent)',
          animation: 'shimmer 3s infinite',
        }}
      />
    </Card>
  );
};
