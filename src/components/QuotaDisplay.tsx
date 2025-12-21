import { useWeeklyQuota } from '@/hooks/useWeeklyQuota';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export const QuotaDisplay = () => {
  const { weeklyLimit, usedPasses, loading } = useWeeklyQuota();

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Weekly Restroom Passes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse h-8 bg-muted rounded w-full" />
        </CardContent>
      </Card>
    );
  }

  // Calculation for available passes
  const remaining = Math.max(0, weeklyLimit - usedPasses);
  
  // Create an array representing the total limit
  // Filled boxes = used, Empty/Dimmed boxes = available (or vice-versa)
  // Usually, bright color = "available", muted = "used"
  const boxes = Array.from({ length: weeklyLimit });

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex justify-between">
          <span>Weekly Restroom Passes</span>
          <span className={`${remaining === 0 ? 'text-destructive' : 'text-primary'}`}>
            {remaining} / {weeklyLimit}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex gap-2.5">
          {boxes.map((_, i) => {
            const isAvailable = i < remaining;
            return (
              <div
                key={i}
                className={`w-10 h-10 rounded-lg border-2 transition-all duration-500 ease-out transform ${
                  isAvailable 
                    ? 'bg-primary border-primary shadow-sm shadow-primary/20 scale-100' 
                    : 'bg-muted border-transparent scale-95 opacity-40'
                }`}
              />
            );
          })}
        </div>
        <p className="text-xs font-medium text-muted-foreground mt-3 flex items-center gap-2">
          {remaining === 0 ? (
            <span className="text-destructive font-bold">⚠️ Weekly quota reached</span>
          ) : (
            <span>You have {remaining} passes left for the week</span>
          )}
        </p>
      </CardContent>
    </Card>
  );
};
