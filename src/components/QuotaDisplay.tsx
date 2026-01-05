import { useWeeklyQuota } from '@/hooks/useWeeklyQuota';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export const QuotaDisplay = () => {
  const { weeklyLimit, usedPasses, loading } = useWeeklyQuota();

  if (loading) {
    return (
      <div className="space-y-4">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-500 text-center">Weekly Passes</p>
        <div className="animate-pulse h-8 bg-white/5 rounded-xl w-3/4 mx-auto" />
      </div>
    );
  }

  const boxes = Array.from({ length: weeklyLimit }, (_, i) => i < weeklyLimit - usedPasses);

  return (
    <div className="flex flex-col items-center justify-center space-y-3">
      <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-500 text-center">Weekly Passes</p>
      <div className="flex flex-wrap gap-1.5 justify-center">
        {boxes.map((available, i) => (
          <div
            key={i}
            className={`w-7 h-7 rounded-lg border transition-all duration-300 ${available
              ? 'bg-red-600 border-red-500 shadow-lg shadow-red-500/30'
              : 'bg-white/5 border-white/10'
              }`}
          />
        ))}
      </div>
      <p className="text-[10px] font-black text-red-500 uppercase tracking-[0.2em] text-center">
        {Math.max(0, weeklyLimit - usedPasses)} Left
      </p>
    </div>
  );
};
