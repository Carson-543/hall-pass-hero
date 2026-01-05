import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format } from 'date-fns';

interface Pass {
  id: string;
  destination: string;
  status: string;
  requested_at: string;
  class_name: string;
}

type TimeFilter = 'this_week' | 'last_week' | 'this_month' | 'all';

export const PassHistory = () => {
  const { user } = useAuth();
  const [passes, setPasses] = useState<Pass[]>([]);
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('this_week');
  const [loading, setLoading] = useState(true);

  const fetchPasses = async () => {
    if (!user) return;

    let startDate: Date | null = null;
    let endDate: Date = new Date();
    const now = new Date();

    switch (timeFilter) {
      case 'this_week': {
        const dayOfWeek = now.getDay();
        const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        startDate = new Date(now);
        startDate.setDate(now.getDate() - diff);
        startDate.setHours(0, 0, 0, 0);
        break;
      }
      case 'last_week': {
        const dayOfWeek = now.getDay();
        const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        endDate = new Date(now);
        endDate.setDate(now.getDate() - diff);
        endDate.setHours(0, 0, 0, 0);
        startDate = new Date(endDate);
        startDate.setDate(startDate.getDate() - 7);
        break;
      }
      case 'this_month': {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      }
    }

    // Limit to 10 passes, select only needed columns
    let query = supabase
      .from('passes')
      .select('id, destination, status, requested_at, class_id')
      .eq('student_id', user.id)
      .order('requested_at', { ascending: false })
      .limit(10);

    if (startDate) {
      query = query.gte('requested_at', startDate.toISOString());
    }
    if (timeFilter === 'last_week') {
      query = query.lt('requested_at', endDate.toISOString());
    }

    const { data } = await query;

    if (data && data.length > 0) {
      // Batch fetch class names
      const classIds = [...new Set(data.map(p => p.class_id))];
      const { data: classesData } = await supabase
        .from('classes')
        .select('id, name')
        .in('id', classIds);

      const classMap = new Map(classesData?.map(c => [c.id, c.name]) || []);

      setPasses(data.map((p: any) => ({
        id: p.id,
        destination: p.destination,
        status: p.status,
        requested_at: p.requested_at,
        class_name: classMap.get(p.class_id) ?? 'Unknown'
      })));
    } else {
      setPasses([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchPasses();
  }, [user, timeFilter]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved':
      case 'pending_return':
        return 'text-blue-400';
      case 'returned':
        return 'text-slate-500';
      case 'denied':
        return 'text-red-400/80';
      default:
        return 'text-white';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-black uppercase tracking-widest text-slate-400">Pass History</h3>
        <Select value={timeFilter} onValueChange={(v) => setTimeFilter(v as TimeFilter)}>
          <SelectTrigger className="w-32 h-9 text-xs bg-white/5 border-white/10 text-white rounded-lg">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-slate-900 border-white/10 text-white">
            <SelectItem value="this_week" className="text-xs">This Week</SelectItem>
            <SelectItem value="last_week" className="text-xs">Last Week</SelectItem>
            <SelectItem value="this_month" className="text-xs">This Month</SelectItem>
            <SelectItem value="all" className="text-xs">All Time</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="animate-pulse space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-16 bg-white/5 rounded-2xl" />
          ))}
        </div>
      ) : passes.length === 0 ? (
        <div className="text-center py-8 bg-white/5 rounded-3xl border border-dashed border-white/10">
          <p className="text-sm text-slate-500 font-medium">
            No passes found for this period.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {passes.map(pass => (
            <div
              key={pass.id}
              className="flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/5 hover:border-white/10 transition-colors"
            >
              <div>
                <p className="font-bold text-sm text-white">{pass.destination}</p>
                <p className="text-[11px] font-medium text-slate-500 mt-0.5">
                  {pass.class_name} • {format(new Date(pass.requested_at), 'MMM d, h:mm a')}
                </p>
              </div>
              <span className={`text-[11px] font-black uppercase tracking-wider ${getStatusColor(pass.status)}`}>
                {pass.status.replace('_', ' ')}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};