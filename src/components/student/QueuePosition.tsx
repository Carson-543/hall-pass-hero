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
    <div className="p-5 rounded-2xl bg-blue-600/10 border-2 border-blue-500/40 shadow-xl shadow-blue-900/20">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-2xl bg-blue-600/30 border-2 border-white/20 shadow-lg">
            <Users className="h-6 w-6 text-blue-400" />
          </div>
          <div>
            <p className="font-black text-blue-400 text-base tracking-tight mb-0.5">
              Queue Position: <span className="text-white text-lg">#{position}</span>
            </p>
            <p className="text-xs text-slate-300 font-black uppercase tracking-widest">
              Live: {activeCount}/{maxConcurrent} Out
            </p>
          </div>
        </div>
        {estimatedWait > 0 && (
          <div className="text-right">
            <div className="flex flex-col items-end">
              <div className="flex items-center gap-1.5 text-blue-400">
                <Clock className="h-4 w-4" />
                <span className="text-sm font-black font-mono tracking-tighter">~{estimatedWait}m wait</span>
              </div>
              <span className="text-[10px] text-slate-500 font-black uppercase tracking-tighter">ESTIMATED</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
