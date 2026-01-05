import { useState, useEffect } from 'react';
import { Clock, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ElapsedTimerProps {
  startTime: string;
  destination: string;
  className?: string;
  showWarning?: boolean;
}

const DESTINATION_THRESHOLDS: Record<string, number> = {
  'Restroom': 300, // 5 minutes
  'Locker': 180,   // 3 minutes
  'Office': 600,   // 10 minutes
  'Other': 600,    // 10 minutes default
};

export const ElapsedTimer = ({ startTime, destination, className, showWarning = true }: ElapsedTimerProps) => {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const start = new Date(startTime).getTime();

    const updateElapsed = () => {
      const now = Date.now();
      setElapsed(Math.floor((now - start) / 1000));
    };

    updateElapsed();
    const interval = setInterval(updateElapsed, 1000);

    return () => clearInterval(interval);
  }, [startTime]);

  const threshold = DESTINATION_THRESHOLDS[destination] ?? DESTINATION_THRESHOLDS['Other'];
  const percentage = (elapsed / threshold) * 100;
  const isWarning = percentage >= 50 && percentage < 100;
  const isOverdue = elapsed >= threshold;

  const formatElapsed = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div
      className={cn(
        "flex items-center gap-2 text-sm font-black font-mono px-3 py-1 rounded-lg transition-all",
        !showWarning && "bg-white/5 text-slate-400",
        showWarning && !isWarning && !isOverdue && "bg-white/5 text-blue-400",
        showWarning && isWarning && "bg-amber-400/10 text-amber-400 border border-amber-400/20",
        showWarning && isOverdue && "bg-red-500/20 text-red-100 border border-red-500/30 animate-pulse",
        className
      )}
    >
      {showWarning && isOverdue ? (
        <>
          <AlertTriangle className="h-3.5 w-3.5" />
          <span>+{formatElapsed(elapsed - threshold)}</span>
          <span className="text-xs uppercase font-bold tracking-wider">Overdue</span>
        </>
      ) : (
        <>
          <Clock className="h-3.5 w-3.5" />
          <span>{formatElapsed(Math.max(0, elapsed))}</span>
        </>
      )}
    </div>
  );
};
