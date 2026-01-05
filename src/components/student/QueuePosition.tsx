import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Users, Clock } from 'lucide-react';

interface QueuePositionProps {
  passId: string;
  classId: string;
  maxConcurrent?: number;
}

export const QueuePosition = ({ passId, classId, maxConcurrent = 2 }: QueuePositionProps) => {
  const [position, setPosition] = useState<number | null>(null);
  const [activeCount, setActiveCount] = useState(0);

  useEffect(() => {
    fetchQueueInfo();

    const channel = supabase
      .channel(`queue-${passId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'passes',
        filter: `class_id=eq.${classId}`
      }, () => fetchQueueInfo())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [passId, classId]);

  const fetchQueueInfo = async () => {
    // Get queue position
    const { data: pendingPasses } = await supabase
      .from('passes')
      .select('id, requested_at')
      .eq('class_id', classId)
      .eq('destination', 'Restroom')
      .eq('status', 'pending')
      .order('requested_at');

    if (pendingPasses) {
      const idx = pendingPasses.findIndex(p => p.id === passId);
      setPosition(idx >= 0 ? idx + 1 : null);
    }

    // Get active count
    const { count } = await supabase
      .from('passes')
      .select('id', { count: 'exact', head: true })
      .eq('class_id', classId)
      .eq('destination', 'Restroom')
      .in('status', ['approved', 'pending_return']);

    setActiveCount(count || 0);
  };

  if (position === null) return null;

  const estimatedWait = position <= maxConcurrent ? 0 : (position - maxConcurrent) * 5;

  return (
    <div className="p-4 rounded-xl bg-blue-500/5 border border-blue-500/20">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-blue-500/20">
            <Users className="h-5 w-5 text-blue-400" />
          </div>
          <div>
            <p className="font-bold text-blue-400 text-sm">
              Queue Position: #{position}
            </p>
            <p className="text-xs text-slate-500 font-medium">
              Currently out: {activeCount}/{maxConcurrent}
            </p>
          </div>
        </div>
        {estimatedWait > 0 && (
          <div className="text-right">
            <div className="flex items-center gap-1.5 text-slate-400">
              <Clock className="h-3.5 w-3.5" />
              <span className="text-xs font-bold font-mono">~{estimatedWait}m wait</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
