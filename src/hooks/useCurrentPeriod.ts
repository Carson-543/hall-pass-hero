import { useState, useEffect, useCallback, useRef } from 'react';
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

interface CachedScheduleData {
  schedule: Schedule;
  periods: Period[];
  fetchedDate: string;
}

export const useCurrentPeriod = () => {

  const { organizationId } = useOrganization();
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
  
  // Cache schedule data to avoid repeated fetches
  const cachedDataRef = useRef<CachedScheduleData | null>(null);

  const fetchScheduleData = useCallback(async (): Promise<CachedScheduleData | null> => {
    const today = new Date().toISOString().split('T')[0];
    
    // Return cached data if it's from today
    if (cachedDataRef.current && cachedDataRef.current.fetchedDate === today) {
      return cachedDataRef.current;
    }
      console.log("Running useCurrentPeriod");
    // Get today's schedule assignment - filter by organization's schedules
    let scheduleId: string | null = null;
    
    if (organizationId) {
      // First get schedules for this organization
      const { data: orgSchedules } = await supabase
        .from('schedules')
        .select('id')
        .eq('organization_id', organizationId);
      
      if (orgSchedules && orgSchedules.length > 0) {
        const scheduleIds = orgSchedules.map(s => s.id);
        
        // Check for assignment today
        const { data: assignment } = await supabase
          .from('schedule_assignments')
          .select('schedule_id')
          .eq('date', today)
          .in('schedule_id', scheduleIds)
          .maybeSingle();
        
        if (assignment) {
          scheduleId = assignment.schedule_id;
        } else {
          // Default to Regular schedule in this org
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
      // Fallback: no org filter (for public access)
      const { data: assignment } = await supabase
        .from('schedule_assignments')
        .select('schedule_id')
        .eq('date', today)
        .maybeSingle();

      if (assignment) {
        scheduleId = assignment.schedule_id;
      } else {
        const { data: regularSchedule } = await supabase
          .from('schedules')
          .select('id')
          .eq('name', 'Regular')
          .maybeSingle();
        
        scheduleId = regularSchedule?.id ?? null;
      }
    }

    if (!scheduleId) {
      return null;
    }

    // Get schedule details
    const { data: schedule } = await supabase
      .from('schedules')
      .select('id, name, is_school_day')
      .eq('id', scheduleId)
      .single();

    if (!schedule) {
      return null;
    }

    if (!schedule.is_school_day) {
      cachedDataRef.current = {
        schedule,
        periods: [],
        fetchedDate: today
      };
      return cachedDataRef.current;
    }

    // Get periods for this schedule
    const { data: periods } = await supabase
      .from('periods')
      .select('id, name, period_order, start_time, end_time, is_passing_period')
      .eq('schedule_id', scheduleId)
      .order('period_order', { ascending: true });

    cachedDataRef.current = {
      schedule,
      periods: periods || [],
      fetchedDate: today
    };
    
    return cachedDataRef.current;
  }, [organizationId]);

  // Calculate current period info from cached data (no DB calls)
  const calculatePeriodInfo = useCallback((cachedData: CachedScheduleData | null) => {
    if (!cachedData) {
      setPeriodInfo({
        currentPeriod: null,
        nextPeriod: null,
        schedule: null,
        timeRemaining: 0,
        isSchoolDay: true,
        isBeforeSchool: false,
        isAfterSchool: false
      });
      setLoading(false);
      return;
    }

    const { schedule, periods } = cachedData;

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

    if (periods.length === 0) {
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
  }, []);

  // Fetch data once on mount or when org changes
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    
    // Clear cache if org changes
    if (cachedDataRef.current && organizationId) {
      cachedDataRef.current = null;
    }
    
    const initializeData = async () => {
      setLoading(true);
      const data = await fetchScheduleData();
      calculatePeriodInfo(data);
    };
    
    initializeData();
    
    // Check at midnight if we need to refetch (new day)
    const checkForNewDay = () => {
      const currentDate = new Date().toISOString().split('T')[0];
      if (cachedDataRef.current && cachedDataRef.current.fetchedDate !== currentDate) {
        // It's a new day, refetch schedule data
        fetchScheduleData().then(data => calculatePeriodInfo(data));
      }
    };
    
    // Check every minute for day change (instead of calculating exact midnight)
    const dayCheckInterval = setInterval(checkForNewDay, 60000);
    
    return () => clearInterval(dayCheckInterval);
  }, [organizationId, fetchScheduleData, calculatePeriodInfo]);

  // Update time calculations every second (NO database calls)
  useEffect(() => {
    const interval = setInterval(() => {
      if (cachedDataRef.current) {
        calculatePeriodInfo(cachedDataRef.current);
      }
    }, 1000);
    
    return () => clearInterval(interval);
  }, [calculatePeriodInfo]);

  return { ...periodInfo, loading };
};
