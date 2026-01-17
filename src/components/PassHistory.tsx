import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MultiSelect, Option } from '@/components/ui/multi-select';
import { format } from 'date-fns';

interface Pass {
  id: string;
  destination: string;
  status: string;
  requested_at: string;
  class_name: string;
}

type TimeFilter = 'this_week' | 'last_week' | 'this_month' | 'all';

const STATUS_OPTIONS: Option[] = [
  { label: 'Approved', value: 'approved' },
  { label: 'Returned', value: 'returned' },
  { label: 'Pending', value: 'pending' },
  { label: 'Denied', value: 'denied' },
  { label: 'Cancelled', value: 'cancelled' },
];

export const PassHistory = () => {
  const { user } = useAuth();
  const [passes, setPasses] = useState<Pass[]>([]);
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('this_week');
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>(['approved', 'returned', 'pending', 'denied', 'cancelled']); // Default ALL
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

    // Limit to 20 passes (increased for filtering), select only needed columns
    // We only query IF we have selected statuses, otherwise return empty
    if (selectedStatuses.length === 0) {
      setPasses([]);
      setLoading(false);
      return;
    }

    let query = supabase
      .from('passes')
      .select('id, destination, status, requested_at, class_id')
      .eq('student_id', user.id)
      .in('status', selectedStatuses as any) // FILTER BY MULTIPLE STATUSES
      .order('requested_at', { ascending: false })
      .limit(20);

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
  }, [user, timeFilter, selectedStatuses]); // Re-fetch when selectedStatuses changes

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved':
      case 'pending_return':
        return 'text-blue-500';
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
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-black uppercase tracking-widest text-slate-400">Pass History</h3>
          <Select value={timeFilter} onValueChange={(v) => setTimeFilter(v as TimeFilter)}>
            <SelectTrigger className="w-36 h-10 text-xs font-black bg-white/10 border-2 border-white/20 text-white rounded-xl focus:ring-blue-500 shadow-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-slate-900 border-2 border-white/20 text-white">
              <SelectItem value="this_week" className="text-xs font-black focus:bg-blue-600">This Week</SelectItem>
              <SelectItem value="last_week" className="text-xs font-black focus:bg-blue-600">Last Week</SelectItem>
              <SelectItem value="this_month" className="text-xs font-black focus:bg-blue-600">This Month</SelectItem>
              <SelectItem value="all" className="text-xs font-black focus:bg-blue-600">All Time</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Status Filter */}
        <div className="w-full">
          <MultiSelect
            options={STATUS_OPTIONS}
            selected={selectedStatuses}
            onChange={setSelectedStatuses}
            placeholder="Filter by Status"
            className="w-full"
          />
        </div>
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
            No passes found matching your filters.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {passes.map(pass => (
            <div
              key={pass.id}
              className="flex items-center justify-between p-5 rounded-2xl bg-white/5 border-2 border-white/5 hover:border-white/20 hover:bg-white/10 transition-all shadow-sm"
            >
              <div>
                <p className="font-black text-base text-white tracking-tighter">{pass.destination}</p>
                <p className="text-xs font-black text-slate-300 mt-1 flex items-center gap-2">
                  <span className="text-blue-500 opacity-60">•</span> {pass.class_name} <span className="text-slate-500">•</span> {format(new Date(pass.requested_at), 'MMM d, h:mm a')}
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