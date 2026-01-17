import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './AuthContext';

interface Organization {
  id: string;
  name: string;
  slug: string;
}

interface OrganizationSettings {
  weekly_bathroom_limit: number;
  default_period_count: number;
  max_concurrent_bathroom: number;
  require_deletion_approval: boolean;
  bathroom_expected_minutes: number;
  locker_expected_minutes: number;
  office_expected_minutes: number;
}

interface OrganizationContextType {
  organization: Organization | null;
  organizationId: string | null;
  settings: OrganizationSettings | null;
  loading: boolean;
  refreshSettings: () => Promise<void>;
  setOrganization: (org: Organization) => void;
}

const defaultSettings: OrganizationSettings = {
  weekly_bathroom_limit: 4,
  default_period_count: 7,
  max_concurrent_bathroom: 2,
  require_deletion_approval: false,
  bathroom_expected_minutes: 5,
  locker_expected_minutes: 3,
  office_expected_minutes: 10,
};

const OrganizationContext = createContext<OrganizationContextType | undefined>(undefined);

export const useOrganization = () => {
  const context = useContext(OrganizationContext);
  if (!context) {
    throw new Error('useOrganization must be used within an OrganizationProvider');
  }
  return context;
};

export const OrganizationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [settings, setSettings] = useState<OrganizationSettings | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchOrganization = useCallback(async () => {
    if (!user?.id) {
      setOrganization(null);
      setSettings(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      // Fetch membership
      const { data: membership } = await supabase
        .from('organization_memberships')
        .select('organization_id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (membership?.organization_id) {
        // Fetch organization details
        const { data: org } = await supabase
          .from('organizations')
          .select('id, name, slug')
          .eq('id', membership.organization_id)
          .single();

        if (org) {
          setOrganization(org);

          // Fetch organization settings
          const { data: orgSettings } = await supabase
            .from('organization_settings')
            .select('weekly_bathroom_limit, default_period_count, max_concurrent_bathroom, require_deletion_approval, bathroom_expected_minutes, locker_expected_minutes, office_expected_minutes')
            .eq('organization_id', org.id)
            .maybeSingle();

          if (orgSettings) {
            setSettings({
              weekly_bathroom_limit: orgSettings.weekly_bathroom_limit ?? 4,
              default_period_count: orgSettings.default_period_count ?? 7,
              max_concurrent_bathroom: orgSettings.max_concurrent_bathroom ?? 2,
              require_deletion_approval: orgSettings.require_deletion_approval ?? false,
              bathroom_expected_minutes: orgSettings.bathroom_expected_minutes ?? 5,
              locker_expected_minutes: orgSettings.locker_expected_minutes ?? 3,
              office_expected_minutes: orgSettings.office_expected_minutes ?? 10,
            });
          } else {
            setSettings(defaultSettings);
          }
        }
      } else {
        setOrganization(null);
        setSettings(null);
      }
    } catch (error) {
      console.error('Error fetching organization:', error);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  const refreshSettings = useCallback(async () => {
    if (!organization?.id) return;

    const { data: orgSettings } = await supabase
      .from('organization_settings')
      .select('weekly_bathroom_limit, default_period_count, max_concurrent_bathroom, require_deletion_approval, bathroom_expected_minutes, locker_expected_minutes, office_expected_minutes')
      .eq('organization_id', organization.id)
      .maybeSingle();

    if (orgSettings) {
      setSettings({
        weekly_bathroom_limit: orgSettings.weekly_bathroom_limit ?? 4,
        default_period_count: orgSettings.default_period_count ?? 7,
        max_concurrent_bathroom: orgSettings.max_concurrent_bathroom ?? 2,
        require_deletion_approval: orgSettings.require_deletion_approval ?? false,
        bathroom_expected_minutes: orgSettings.bathroom_expected_minutes ?? 5,
        locker_expected_minutes: orgSettings.locker_expected_minutes ?? 3,
        office_expected_minutes: orgSettings.office_expected_minutes ?? 10,
      });
    }
  }, [organization?.id]);

  useEffect(() => {
    fetchOrganization();
  }, [fetchOrganization]);

  return (
    <OrganizationContext.Provider value={{
      organization,
      organizationId: organization?.id ?? null,
      settings,
      loading,
      refreshSettings,
      setOrganization,
    }}>
      {children}
    </OrganizationContext.Provider>
  );
};
