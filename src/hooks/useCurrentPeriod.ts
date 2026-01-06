import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/contexts/OrganizationContext';

interface Period {
  id: string;
  name: string;
  period_order: number;
  start_time: string;
  end_time: string;
  is_passing_period: boolean;
}

interface Schedule {
  id: string;
  name: string;
  is_school_day: boolean;
}

interface CurrentPeriodInfo {
  currentPeriod: Period | null;
  nextPeriod: Period | null;
  schedule: Schedule | null;
  timeRemaining: number; // seconds
  isSchoolDay: boolean;
  isBeforeSchool: boolean;
  isAfterSchool: boolean;
}

export const useCurrentPeriod = () => {
  const { organizationId } = useOrganization();
  const [now, setNow] = useState(new Date());

  // Timer to update "now" every second for local calculations
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const { data: scheduleData, isLoading } = useQuery({
    queryKey: ['current-schedule', organizationId, new Date().toISOString().split('T')[0]],
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0];
      let scheduleId: string | null = null;

      if (organizationId) {
        const { data: orgSchedules } = await supabase
          .from('schedules')
          .select('id')
          .eq('organization_id', organizationId);

        if (orgSchedules && orgSchedules.length > 0) {
          const scheduleIds = orgSchedules.map(s => s.id);
          const { data: assignment } = await supabase
            .from('schedule_assignments')
            .select('schedule_id')
            .eq('date', today)
            .in('schedule_id', scheduleIds)
            .maybeSingle();

          if (assignment) {
            scheduleId = assignment.schedule_id;
          } else {
            const { data: regularSchedule } = await supabase
              .from('schedules')
              .select('id')
              .eq('organization_id', organizationId)
              .eq('name', 'Regular')
              .maybeSingle();
            scheduleId = regularSchedule?.id ?? orgSchedules[0].id;
          }
        }
      } else {
        const { data: assignment } = await supabase
          .from('schedule_assignments')
          .select('schedule_id')
          .eq('date', today)
          .maybeSingle();
        if (assignment) scheduleId = assignment.schedule_id;
        else {
          const { data: regularSchedule } = await supabase
            .from('schedules')
            .select('id')
            .eq('name', 'Regular')
            .maybeSingle();
          scheduleId = regularSchedule?.id ?? null;
        }
      }

      if (!scheduleId) return null;

      const { data: schedule } = await supabase
        .from('schedules')
        .select('id, name, is_school_day')
        .eq('id', scheduleId)
        .single();

      if (!schedule) return null;
      if (!schedule.is_school_day) return { schedule, periods: [] };

      const { data: periods } = await supabase
        .from('periods')
        .select('id, name, period_order, start_time, end_time, is_passing_period')
        .eq('schedule_id', scheduleId)
        .order('period_order', { ascending: true });

      return { schedule, periods: periods || [] };
    },
    staleTime: 1000 * 60 * 60, // 1 hour - schedule rarely changes during the day
    gcTime: 1000 * 60 * 60 * 24,
  });

  const periodInfo = useMemo(() => {
    if (!scheduleData) return {
      currentPeriod: null,
      nextPeriod: null,
      schedule: null,
      timeRemaining: 0,
      isSchoolDay: true,
      isBeforeSchool: false,
      isAfterSchool: false
    };

    const { schedule, periods } = scheduleData;
    const currentTimeStr = now.toTimeString().slice(0, 8); // HH:MM:SS

    if (!schedule.is_school_day) {
      return {
        currentPeriod: null,
        nextPeriod: null,
        schedule,
        timeRemaining: 0,
        isSchoolDay: false,
        isBeforeSchool: false,
        isAfterSchool: false
      };
    }

    if (periods.length === 0) {
      return {
        currentPeriod: null,
        nextPeriod: null,
        schedule,
        timeRemaining: 0,
        isSchoolDay: true,
        isBeforeSchool: true,
        isAfterSchool: false
      };
    }

    let currentPeriod: Period | null = null;
    let nextPeriod: Period | null = null;

    for (let i = 0; i < periods.length; i++) {
      const period = periods[i];
      if (currentTimeStr >= period.start_time && currentTimeStr < period.end_time) {
        currentPeriod = period;
        nextPeriod = periods[i + 1] ?? null;
        break;
      }
    }

    const firstPeriod = periods[0];
    const lastPeriod = periods[periods.length - 1];
    const isBeforeSchool = currentTimeStr < firstPeriod.start_time;
    const isAfterSchool = currentTimeStr >= lastPeriod.end_time;

    if (isBeforeSchool) nextPeriod = firstPeriod;

    let timeRemaining = 0;
    if (currentPeriod) {
      const [endH, endM, endS] = currentPeriod.end_time.split(':').map(Number);
      const endDate = new Date(now);
      endDate.setHours(endH, endM, endS || 0, 0);
      timeRemaining = Math.max(0, Math.floor((endDate.getTime() - now.getTime()) / 1000));
    } else if (nextPeriod && isBeforeSchool) {
      const [startH, startM, startS] = nextPeriod.start_time.split(':').map(Number);
      const startDate = new Date(now);
      startDate.setHours(startH, startM, startS || 0, 0);
      timeRemaining = Math.max(0, Math.floor((startDate.getTime() - now.getTime()) / 1000));
    }

    return {
      currentPeriod,
      nextPeriod,
      schedule,
      timeRemaining,
      isSchoolDay: schedule.is_school_day,
      isBeforeSchool,
      isAfterSchool
    };
  }, [scheduleData, now]);

  return { ...periodInfo, loading: isLoading };
};