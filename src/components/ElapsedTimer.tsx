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
        "flex items-center gap-2 text-base font-black font-mono px-4 py-2 rounded-xl border-2 transition-all shadow-lg",
        !showWarning && "bg-white/10 text-slate-100 border-white/20 backdrop-blur-md",
        showWarning && !isWarning && !isOverdue && "bg-blue-600/40 text-blue-100 border-blue-400/50 backdrop-blur-md",
        showWarning && isWarning && "bg-amber-400 text-slate-950 border-white/40 animate-pulse",
        showWarning && isOverdue && "bg-blue-600 text-white border-white/40 shadow-[0_0_30px_rgba(37,99,235,0.6)] animate-pulse",
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
          <Clock className={cn("h-4 w-4", showWarning && !isWarning && !isOverdue ? "text-blue-400" : "text-current")} />
          <span className="tracking-tighter">{formatElapsed(Math.max(0, elapsed))}</span>
        </>
      )}
    </div>
  );
};
