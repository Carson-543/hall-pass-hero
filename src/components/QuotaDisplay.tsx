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
    <div className="flex flex-col items-center justify-center space-y-4">
      <p className="text-xs font-black uppercase tracking-[0.25em] text-slate-400 text-center">Weekly Passes</p>
      <div className="flex flex-wrap gap-2 justify-center">
        {boxes.map((available, i) => (
          <div
            key={i}
            className={`w-8 h-8 rounded-xl border-2 transition-all duration-300 ${available
              ? 'bg-blue-600 border-white/20 shadow-xl shadow-blue-600/30'
              : 'bg-white/10 border-white/10'
              }`}
          />
        ))}
      </div>
      <p className="text-xs font-black text-blue-400 uppercase tracking-[0.25em] text-center bg-blue-500/10 px-3 py-1 rounded-lg border border-blue-500/20">
        {Math.max(0, weeklyLimit - usedPasses)} Available
      </p>
    </div>
  );
};
