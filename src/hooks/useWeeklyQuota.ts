import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export const useWeeklyQuota = () => {
  const { user } = useAuth();
  const [weeklyLimit, setWeeklyLimit] = useState(4);
  const [usedPasses, setUsedPasses] = useState(0);
  const [loading, setLoading] = useState(true);
  // 1. ADD THIS TICK STATE
  const [refreshTick, setRefreshTick] = useState(0);

  const fetchQuotaData = useCallback(async () => {
    if (!user?.id) return;

    // Get weekly limit
    const { data: settings } = await supabase
      .from('weekly_quota_settings')
      .select('weekly_limit')
      .maybeSingle();

    if (settings) setWeeklyLimit(settings.weekly_limit);

    // Get start of week (Monday)
    const now = new Date();
    const dayOfWeek = now.getDay();
    const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const monday = new Date(now);
    monday.setDate(now.getDate() - diff);
    monday.setHours(0, 0, 0, 0);

    // 2. IMPORTANT: Check these statuses! 
    // If a pass is 'completed' or 'pending_return', it MUST be in this list 
    // to show up as a "used" box.
    const { count, error } = await supabase
      .from('passes')
      .select('*', { count: 'exact', head: true })
      .eq('student_id', user.id)
      .eq('destination', 'Restroom')
      .in('status', ['approved', 'pending_return', 'completed', 'returned'])
      .gte('requested_at', monday.toISOString());

    if (!error) {
      setUsedPasses(count ?? 0);
    }
    setLoading(false);
  }, [user?.id]);

  // 3. ADD refreshTick TO THIS DEPENDENCY ARRAY
  useEffect(() => {
    fetchQuotaData();
  }, [fetchQuotaData, refreshTick]);

  // 4. THIS FUNCTION FORCES THE REFRESH
  const refresh = () => setRefreshTick(prev => prev + 1);

  return {
    weeklyLimit,
    usedPasses,
    remaining: Math.max(0, weeklyLimit - usedPasses),
    isQuotaExceeded: usedPasses >= weeklyLimit,
    loading,
    refresh
  };
};
