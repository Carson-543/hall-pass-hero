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
        <div className="flex items-center gap-3 text-3xl font-black text-blue-500 drop-shadow-[0_0_15px_rgba(37,99,235,0.3)]">
          <Clock className="h-6 w-6" />
          {formatTime(timeRemaining)}
        </div>
      </div>
    );
  }

  if (currentPeriod) {
    return (
      <div className="space-y-3 flex-1 w-full">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
              {currentPeriod.is_passing_period ? 'Passing Period' : 'Current Period'}
            </p>
            <h3 className="text-lg font-black text-white">{currentPeriod.name}</h3>
          </div>
          <div className="flex items-center gap-3 text-3xl font-black text-blue-500 drop-shadow-[0_0_15px_rgba(37,99,235,0.3)] ml-auto">
    <Clock className="h-7 w-7 mb-1" /> {/* Slight margin-bottom often helps icons look centered with large numbers */}
    {formatTime(timeRemaining)}
  </div>
        </div>
        {nextPeriod && (
          <p className="text-xs font-black text-slate-400 flex items-center gap-1.5 uppercase tracking-widest">
            <span className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(37,99,235,0.4)]" />
            Next Up: {nextPeriod.name}
          </p>
        )}
      </div>
    );
  }

  return null;
};
