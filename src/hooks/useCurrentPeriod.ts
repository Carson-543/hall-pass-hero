import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

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
  const [periodInfo, setPeriodInfo] = useState<CurrentPeriodInfo>({
    currentPeriod: null,
    nextPeriod: null,
    schedule: null,
    timeRemaining: 0,
    isSchoolDay: true,
    isBeforeSchool: false,
    isAfterSchool: false
  });
  const [loading, setLoading] = useState(true);

  const fetchScheduleData = async () => {
    const today = new Date().toISOString().split('T')[0];
    
    // Get today's schedule assignment
    const { data: assignment } = await supabase
      .from('schedule_assignments')
      .select('schedule_id')
      .eq('date', today)
      .maybeSingle();

    let scheduleId: string | null = null;

    if (assignment) {
      scheduleId = assignment.schedule_id;
    } else {
      // Default to Regular schedule if no assignment
      const { data: regularSchedule } = await supabase
        .from('schedules')
        .select('id')
        .eq('name', 'Regular')
        .single();
      
      scheduleId = regularSchedule?.id ?? null;
    }

    if (!scheduleId) {
      setLoading(false);
      return;
    }

    // Get schedule details
    const { data: schedule } = await supabase
      .from('schedules')
      .select('*')
      .eq('id', scheduleId)
      .single();

    if (!schedule) {
      setLoading(false);
      return;
    }

    if (!schedule.is_school_day) {
      setPeriodInfo({
        currentPeriod: null,
        nextPeriod: null,
        schedule,
        timeRemaining: 0,
        isSchoolDay: false,
        isBeforeSchool: false,
        isAfterSchool: false
      });
      setLoading(false);
      return;
    }

    // Get periods for this schedule
    const { data: periods } = await supabase
      .from('periods')
      .select('*')
      .eq('schedule_id', scheduleId)
      .order('period_order', { ascending: true });

    if (!periods || periods.length === 0) {
      setPeriodInfo({
        currentPeriod: null,
        nextPeriod: null,
        schedule,
        timeRemaining: 0,
        isSchoolDay: true,
        isBeforeSchool: true,
        isAfterSchool: false
      });
      setLoading(false);
      return;
    }

    return { schedule, periods };
  };

  const updateCurrentPeriod = async () => {
    const data = await fetchScheduleData();
    if (!data) return;

    const { schedule, periods } = data;
    const now = new Date();
    const currentTimeStr = now.toTimeString().slice(0, 8); // HH:MM:SS

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

    // Check if before or after school
    const firstPeriod = periods[0];
    const lastPeriod = periods[periods.length - 1];
    const isBeforeSchool = currentTimeStr < firstPeriod.start_time;
    const isAfterSchool = currentTimeStr >= lastPeriod.end_time;

    if (isBeforeSchool) {
      nextPeriod = firstPeriod;
    }

    // Calculate time remaining
    let timeRemaining = 0;
    if (currentPeriod) {
      const [endH, endM, endS] = currentPeriod.end_time.split(':').map(Number);
      const endDate = new Date();
      endDate.setHours(endH, endM, endS || 0, 0);
      timeRemaining = Math.max(0, Math.floor((endDate.getTime() - now.getTime()) / 1000));
    } else if (nextPeriod && isBeforeSchool) {
      const [startH, startM, startS] = nextPeriod.start_time.split(':').map(Number);
      const startDate = new Date();
      startDate.setHours(startH, startM, startS || 0, 0);
      timeRemaining = Math.max(0, Math.floor((startDate.getTime() - now.getTime()) / 1000));
    }

    setPeriodInfo({
      currentPeriod,
      nextPeriod,
      schedule,
      timeRemaining,
      isSchoolDay: schedule.is_school_day,
      isBeforeSchool,
      isAfterSchool
    });
    setLoading(false);
  };

  useEffect(() => {
    updateCurrentPeriod();
    const interval = setInterval(updateCurrentPeriod, 1000);
    return () => clearInterval(interval);
  }, []);

  return { ...periodInfo, loading };
};
