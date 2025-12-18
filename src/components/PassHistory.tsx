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
  approved_at: string | null;
  returned_at: string | null;
  class_name: string;
}

type TimeFilter = 'this_week' | 'last_week' | 'this_month' | 'last_month' | 'all';

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
      case 'last_month': {
        endDate = new Date(now.getFullYear(), now.getMonth(), 1);
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        break;
      }
    }

    let query = supabase
      .from('passes')
      .select(`
        id,
        destination,
        status,
        requested_at,
        approved_at,
        returned_at,
        classes (name)
      `)
      .eq('student_id', user.id)
      .order('requested_at', { ascending: false });

    if (startDate) {
      query = query.gte('requested_at', startDate.toISOString());
    }
    if (timeFilter !== 'all' && timeFilter !== 'this_week' && timeFilter !== 'this_month') {
      query = query.lt('requested_at', endDate.toISOString());
    }

    const { data } = await query;

    if (data) {
      setPasses(data.map((p: any) => ({
        id: p.id,
        destination: p.destination,
        status: p.status,
        requested_at: p.requested_at,
        approved_at: p.approved_at,
        returned_at: p.returned_at,
        class_name: p.classes?.name ?? 'Unknown'
      })));
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
        return 'text-primary';
      case 'returned':
        return 'text-muted-foreground';
      case 'denied':
        return 'text-destructive';
      default:
        return 'text-foreground';
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">Pass History</CardTitle>
          <Select value={timeFilter} onValueChange={(v) => setTimeFilter(v as TimeFilter)}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="this_week">This Week</SelectItem>
              <SelectItem value="last_week">Last Week</SelectItem>
              <SelectItem value="this_month">This Month</SelectItem>
              <SelectItem value="last_month">Last Month</SelectItem>
              <SelectItem value="all">All Time</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="animate-pulse space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-12 bg-muted rounded" />
            ))}
          </div>
        ) : passes.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No passes found for this period.
          </p>
        ) : (
          <div className="space-y-2">
            {passes.map(pass => (
              <div
                key={pass.id}
                className="flex items-center justify-between p-2 rounded bg-muted/50"
              >
                <div>
                  <p className="font-medium text-sm">{pass.destination}</p>
                  <p className="text-xs text-muted-foreground">
                    {pass.class_name} • {format(new Date(pass.requested_at), 'MMM d, h:mm a')}
                  </p>
                </div>
                <span className={`text-xs font-medium capitalize ${getStatusColor(pass.status)}`}>
                  {pass.status.replace('_', ' ')}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
