import React, { createContext, useContext, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
  const queryClient = useQueryClient();

  // Query for organization membership and details
  const { data: organization, isLoading: isOrgLoading } = useQuery({
    queryKey: ['organization', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;

      const { data: membership } = await supabase
        .from('organization_memberships')
        .select('organization_id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!membership?.organization_id) return null;

      const { data: org } = await supabase
        .from('organizations')
        .select('id, name, slug')
        .eq('id', membership.organization_id)
        .single();

      return org || null;
    },
    enabled: !!user?.id,
    staleTime: 1000 * 60 * 30, // 30 minutes
  });

  // Query for organization settings
  const { data: settings, isLoading: isSettingsLoading } = useQuery({
    queryKey: ['organization-settings', organization?.id],
    queryFn: async () => {
      if (!organization?.id) return null;

      const { data: orgSettings } = await supabase
        .from('organization_settings')
        .select('weekly_bathroom_limit, default_period_count, max_concurrent_bathroom, require_deletion_approval, bathroom_expected_minutes, locker_expected_minutes, office_expected_minutes')
        .eq('organization_id', organization.id)
        .maybeSingle();

      if (!orgSettings) return defaultSettings;

      return {
        weekly_bathroom_limit: orgSettings.weekly_bathroom_limit ?? 4,
        default_period_count: orgSettings.default_period_count ?? 7,
        max_concurrent_bathroom: orgSettings.max_concurrent_bathroom ?? 2,
        require_deletion_approval: orgSettings.require_deletion_approval ?? false,
        bathroom_expected_minutes: orgSettings.bathroom_expected_minutes ?? 5,
        locker_expected_minutes: orgSettings.locker_expected_minutes ?? 3,
        office_expected_minutes: orgSettings.office_expected_minutes ?? 10,
      };
    },
    enabled: !!organization?.id,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  const refreshSettings = async () => {
    if (organization?.id) {
      await queryClient.invalidateQueries({ queryKey: ['organization-settings', organization.id] });
    }
  };

  const contextValue = useMemo(() => ({
    organization: organization || null,
    organizationId: organization?.id ?? null,
    settings: settings || null,
    loading: isOrgLoading || (isSettingsLoading && !!organization),
    refreshSettings,
  }), [organization, isOrgLoading, settings, isSettingsLoading]);

  return (
    <OrganizationContext.Provider value={contextValue}>
      {children}
    </OrganizationContext.Provider>
  );
};
