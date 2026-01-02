import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Users, Door-Open } from 'lucide-react';

interface BathroomQueueStatusProps {
  classId: string;
  maxConcurrent?: number;
}

export const BathroomQueueStatus = ({ classId, maxConcurrent = 2 }: BathroomQueueStatusProps) => {
  const [activeCount, setActiveCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    if (!classId) return;

    fetchCounts();

    const channel = supabase
      .channel(`bathroom-queue-${classId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'passes',
        filter: `class_id=eq.${classId}`
      }, () => fetchCounts())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [classId]);

  const fetchCounts = async () => {
    // Active bathroom passes
    const { count: active } = await supabase
      .from('passes')
      .select('id', { count: 'exact', head: true })
      .eq('class_id', classId)
      .eq('destination', 'Restroom')
      .in('status', ['approved', 'pending_return']);

    setActiveCount(active || 0);

    // Pending bathroom passes
    const { count: pending } = await supabase
      .from('passes')
      .select('id', { count: 'exact', head: true })
      .eq('class_id', classId)
      .eq('destination', 'Restroom')
      .eq('status', 'pending');

    setPendingCount(pending || 0);
  };

  const isFull = activeCount >= maxConcurrent;

  return (
    <Card className={`${isFull ? 'border-amber-500/50 bg-amber-500/5' : 'border-primary/20'}`}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-full ${isFull ? 'bg-amber-500/20' : 'bg-primary/10'}`}>
              <Door-open className={`h-5 w-5 ${isFull ? 'text-amber-600' : 'text-primary'}`} />
            </div>
            <div>
              <p className="font-semibold">Restroom Queue</p>
              <p className="text-sm text-muted-foreground">
                {activeCount}/{maxConcurrent} out • {pendingCount} waiting
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isFull && (
              <span className="text-xs font-medium text-amber-600 bg-amber-100 px-2 py-1 rounded-full">
                At Capacity
              </span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
