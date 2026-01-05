import { useCurrentPeriod } from '@/hooks/useCurrentPeriod';
import { Card, CardContent } from '@/components/ui/card';
import { Clock } from 'lucide-react';

const formatTime = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

export const PeriodDisplay = () => {
  const {
    currentPeriod,
    nextPeriod,
    timeRemaining,
    isSchoolDay,
    isBeforeSchool,
    isAfterSchool,
    loading
  } = useCurrentPeriod();

  if (loading) {
    return (
      <div className="animate-pulse h-16 bg-white/5 rounded-xl" />
    );
  }

  if (!isSchoolDay) {
    return (
      <div className="text-center py-2">
        <h3 className="text-lg font-semibold text-slate-400">No School Today</h3>
      </div>
    );
  }

  if (isAfterSchool) {
    return (
      <div className="text-center py-2">
        <h3 className="text-lg font-semibold text-slate-400">School Day Ended</h3>
      </div>
    );
  }

  if (isBeforeSchool && nextPeriod) {
    return (
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">School starts in</p>
          <h3 className="text-lg font-black text-white">{nextPeriod.name}</h3>
        </div>
        <div className="flex items-center gap-2 text-2xl font-black text-red-500 drop-shadow-[0_0_10px_rgba(239,68,68,0.2)]">
          <Clock className="h-5 w-5" />
          {formatTime(timeRemaining)}
        </div>
      </div>
    );
  }

  if (currentPeriod) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
              {currentPeriod.is_passing_period ? 'Passing Period' : 'Current Period'}
            </p>
            <h3 className="text-lg font-black text-white">{currentPeriod.name}</h3>
          </div>
          <div className="flex items-center gap-2 text-2xl font-black text-red-500 drop-shadow-[0_0_10px_rgba(239,68,68,0.2)]">
            <Clock className="h-5 w-5" />
            {formatTime(timeRemaining)}
          </div>
        </div>
        {nextPeriod && (
          <p className="text-xs font-black text-slate-500 flex items-center gap-1.5 uppercase tracking-wider">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500/50" />
            Next: {nextPeriod.name}
          </p>
        )}
      </div>
    );
  }

  return null;
};
