import { useWeeklyQuota } from '@/hooks/useWeeklyQuota';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export const QuotaDisplay = () => {
  const { weeklyLimit, usedPasses, loading } = useWeeklyQuota();

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-center">Weekly Restroom Passes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse h-8 bg-muted rounded w-3/4 mx-auto" />
        </CardContent>
      </Card>
    );
  }

  const boxes = Array.from({ length: weeklyLimit }, (_, i) => i < weeklyLimit - usedPasses);

  return (
    <Card>
      <CardHeader className="pb-2">
        {/* Centered the Title */}
        <CardTitle className="text-sm font-medium text-center">Weekly Restroom Passes</CardTitle>
      </CardHeader>
      {/* Corrected "className" typo and centered content */}
      <CardContent className="flex flex-col items-center justify-center">
        {/* Added justify-center and flex-wrap for the boxes */}
        <div className="flex flex-wrap gap-2 justify-center">
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
        {/* Added text-center to the text below */}
        <p className="text-xs text-muted-foreground mt-3 text-center">
          {Math.max(0, weeklyLimit - usedPasses)} passes remaining this week
        </p>
      </CardContent>
    </Card>
  );
};
