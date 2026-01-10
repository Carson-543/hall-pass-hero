import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

import { useOrganization } from '@/contexts/OrganizationContext';

export const useWeeklyQuota = () => {
  const { user } = useAuth();
  const { settings } = useOrganization();
  const [weeklyLimit, setWeeklyLimit] = useState(4);
  const [usedPasses, setUsedPasses] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchQuotaData = useCallback(async () => {
    if (!user) return;

    if (settings) {
      setWeeklyLimit(settings.weekly_bathroom_limit);
    }

    // Get start of current week (Monday)
    const now = new Date();
    const dayOfWeek = now.getDay();
    const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const monday = new Date(now);
    monday.setDate(now.getDate() - diff);
    monday.setHours(0, 0, 0, 0);

    // Count restroom passes this week
    const { count } = await supabase
      .from('passes')
      .select('*', { count: 'exact', head: true })
      .eq('student_id', user.id)
      .eq('destination', 'Restroom')
      .in('status', ['approved', 'pending_return', 'returned'])
      .gte('requested_at', monday.toISOString());

    setUsedPasses(count ?? 0);
    setLoading(false);
  }, [user, settings]);

  useEffect(() => {
    fetchQuotaData();
  }, [fetchQuotaData]);

  return {
    weeklyLimit,
    usedPasses,
    remaining: Math.max(0, weeklyLimit - usedPasses),
    isQuotaExceeded: usedPasses >= weeklyLimit,
    loading,
    refresh: fetchQuotaData
  };
};
