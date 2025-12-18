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
      <Card>
        <CardContent className="p-4">
          <div className="animate-pulse h-16 bg-muted rounded" />
        </CardContent>
      </Card>
    );
  }

  if (!isSchoolDay) {
    return (
      <Card>
        <CardContent className="p-4 text-center">
          <h3 className="text-lg font-semibold text-muted-foreground">No School Today</h3>
        </CardContent>
      </Card>
    );
  }

  if (isAfterSchool) {
    return (
      <Card>
        <CardContent className="p-4 text-center">
          <h3 className="text-lg font-semibold text-muted-foreground">School Day Ended</h3>
        </CardContent>
      </Card>
    );
  }

  if (isBeforeSchool && nextPeriod) {
    return (
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">School starts in</p>
              <h3 className="text-lg font-semibold">{nextPeriod.name}</h3>
            </div>
            <div className="flex items-center gap-2 text-2xl font-mono font-bold text-primary">
              <Clock className="h-5 w-5" />
              {formatTime(timeRemaining)}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (currentPeriod) {
    return (
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">
                {currentPeriod.is_passing_period ? 'Passing Period' : 'Current Period'}
              </p>
              <h3 className="text-lg font-semibold">{currentPeriod.name}</h3>
            </div>
            <div className="flex items-center gap-2 text-2xl font-mono font-bold text-primary">
              <Clock className="h-5 w-5" />
              {formatTime(timeRemaining)}
            </div>
          </div>
          {nextPeriod && (
            <p className="text-xs text-muted-foreground mt-2">
              Next: {nextPeriod.name}
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  return null;
};
