import { useState, useEffect } from 'react';
import { differenceInSeconds, isPast } from 'date-fns';
import { Timer, AlertTriangle, CheckCircle2 } from 'lucide-react';

interface ExpectedReturnTimerProps {
  expectedReturnAt: string;
}

export const ExpectedReturnTimer = ({ expectedReturnAt }: ExpectedReturnTimerProps) => {
  const [timeRemaining, setTimeRemaining] = useState<number>(0);
  const [isOverdue, setIsOverdue] = useState(false);

  useEffect(() => {
    const updateTimer = () => {
      const target = new Date(expectedReturnAt);
      const remaining = differenceInSeconds(target, new Date());

      if (remaining <= 0) {
        setIsOverdue(true);
        setTimeRemaining(Math.abs(remaining));
      } else {
        setIsOverdue(false);
        setTimeRemaining(remaining);
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [expectedReturnAt]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (isOverdue) {
    return null;
  }

  // Warning when less than 1 minute remaining
  const isWarning = timeRemaining < 60;

  return (
    <div className={`flex items-center gap-2 px-4 py-2 rounded-xl border-2 shadow-lg ${isWarning
      ? 'bg-amber-400 text-slate-950 border-white/40 animate-pulse'
      : 'bg-blue-600/30 text-blue-400 border-white/20 backdrop-blur-md'
      }`}>
      {isWarning ? (
        <Timer className="h-4 w-4 animate-pulse" />
      ) : (
        <CheckCircle2 className="h-4 w-4" />
      )}
      <span className="text-sm font-semibold">
        Return by: {formatTime(timeRemaining)}
      </span>
    </div>
  );
};
