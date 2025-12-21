import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export const useWeeklyQuota = () => {
  const { user } = useAuth();
  const [weeklyLimit, setWeeklyLimit] = useState(4);
  const [usedPasses, setUsedPasses] = useState(0);
  const [loading, setLoading] = useState(true);
  // This tick allows us to force a refresh from outside the hook
  const [refreshTick, setRefreshTick] = useState(0);

  const fetchQuotaData = useCallback(async () => {
    if (!user) return;

    // Get weekly limit setting
    const { data: settings } = await supabase
      .from('weekly_quota_settings')
      .select('weekly_limit')
      .maybeSingle();

    if (settings) {
      setWeeklyLimit(settings.weekly_limit);
    }

    // Get start of current week (Monday)
    const now = new Date();
    const dayOfWeek = now.getDay();
    const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const monday = new Date(now);
    monday.setDate(now.getDate() - diff);
    monday.setHours(0, 0, 0, 0);

    // Count restroom passes this week
    // Added 'completed' to the status list to ensure it counts after check-in
    const { count } = await supabase
      .from('passes')
      .select('*', { count: 'exact', head: true })
      .eq('student_id', user.id)
      .eq('destination', 'Restroom')
      .in('status', ['approved', 'pending_return', 'returned', 'completed'])
      .gte('requested_at', monday.toISOString());

    setUsedPasses(count ?? 0);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchQuotaData();
  }, [fetchQuotaData, refreshTick]); // Re-runs when fetchQuotaData changes or refresh is called

  const refresh = () => setRefreshTick(prev => prev + 1);

  return {
    weeklyLimit,
    usedPasses,
    remaining: Math.max(0, weeklyLimit - usedPasses),
    isQuotaExceeded: usedPasses >= weeklyLimit,
    loading,
    refresh // This now triggers the useEffect above
  };
};
