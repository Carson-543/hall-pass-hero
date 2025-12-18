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
          <div className="animate-pulse h-8 bg-muted rounded" />
        </CardContent>
      </Card>
    );
  }

  const boxes = Array.from({ length: weeklyLimit }, (_, i) => i < weeklyLimit - usedPasses);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Weekly Restroom Passes</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex gap-2">
          {boxes.map((available, i) => (
            <div
              key={i}
              className={`w-8 h-8 rounded ${
                available 
                  ? 'bg-primary' 
                  : 'bg-muted'
              }`}
            />
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          {weeklyLimit - usedPasses} passes remaining this week
        </p>
      </CardContent>
    </Card>
  );
};
