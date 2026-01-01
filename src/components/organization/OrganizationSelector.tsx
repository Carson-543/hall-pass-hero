import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Building2, Plus, Users } from 'lucide-react';

interface Organization {
  id: string;
  name: string;
  slug: string;
}

interface OrganizationSelectorProps {
  userId: string;
  isAdmin: boolean;
  onComplete: (organizationId: string) => void;
}

export const OrganizationSelector = ({ userId, isAdmin, onComplete }: OrganizationSelectorProps) => {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string>('');
  const [newOrgName, setNewOrgName] = useState('');
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchOrganizations();
  }, []);

  const fetchOrganizations = async () => {
    const { data } = await supabase
      .from('organizations')
      .select('id, name, slug')
      .order('name');
    
    if (data) {
      setOrganizations(data);
    }
  };

  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  };

  const handleJoinOrganization = async () => {
    if (!selectedOrgId) return;
    setLoading(true);

    const { error } = await supabase
      .from('organization_memberships')
      .insert({
        organization_id: selectedOrgId,
        user_id: userId,
      });

    if (error) {
      console.error('Error joining organization:', error);
      setLoading(false);
      return;
    }

    // Update profile with organization_id
    await supabase
      .from('profiles')
      .update({ organization_id: selectedOrgId })
      .eq('id', userId);

    setLoading(false);
    onComplete(selectedOrgId);
  };

  const handleCreateOrganization = async () => {
    if (!newOrgName.trim()) return;
    setLoading(true);

    const slug = generateSlug(newOrgName);

    // Create organization
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .insert({
        name: newOrgName.trim(),
        slug,
        created_by: userId,
      })
      .select()
      .single();

    if (orgError || !org) {
      console.error('Error creating organization:', orgError);
      setLoading(false);
      return;
    }

    // Create membership
    await supabase
      .from('organization_memberships')
      .insert({
        organization_id: org.id,
        user_id: userId,
      });

    // Update profile
    await supabase
      .from('profiles')
      .update({ organization_id: org.id })
      .eq('id', userId);

    // Create default settings
    await supabase
      .from('organization_settings')
      .insert({
        organization_id: org.id,
      });

    setLoading(false);
    onComplete(org.id);
  };

  const filteredOrganizations = organizations.filter(org =>
    org.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader className="text-center">
        <Building2 className="h-12 w-12 mx-auto text-primary mb-2" />
        <CardTitle>Join Your School</CardTitle>
        <CardDescription>
          Select your school or create a new organization
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="join" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="join" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Join
            </TabsTrigger>
            {isAdmin && (
              <TabsTrigger value="create" className="flex items-center gap-2">
                <Plus className="h-4 w-4" />
                Create
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="join" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Search Schools</Label>
              <Input
                placeholder="Type to search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Select School</Label>
              <Select value={selectedOrgId} onValueChange={setSelectedOrgId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose your school" />
                </SelectTrigger>
                <SelectContent>
                  {filteredOrganizations.map(org => (
                    <SelectItem key={org.id} value={org.id}>
                      {org.name}
                    </SelectItem>
                  ))}
                  {filteredOrganizations.length === 0 && (
                    <div className="p-2 text-sm text-muted-foreground text-center">
                      No schools found
                    </div>
                  )}
                </SelectContent>
              </Select>
            </div>

            <Button 
              className="w-full" 
              onClick={handleJoinOrganization}
              disabled={!selectedOrgId || loading}
            >
              {loading ? 'Joining...' : 'Join School'}
            </Button>
          </TabsContent>

          {isAdmin && (
            <TabsContent value="create" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label>School Name</Label>
                <Input
                  placeholder="e.g., Lincoln High School"
                  value={newOrgName}
                  onChange={(e) => setNewOrgName(e.target.value)}
                />
              </div>

              {newOrgName && (
                <p className="text-xs text-muted-foreground">
                  URL slug: {generateSlug(newOrgName)}
                </p>
              )}

              <Button 
                className="w-full" 
                onClick={handleCreateOrganization}
                disabled={!newOrgName.trim() || loading}
              >
                {loading ? 'Creating...' : 'Create School'}
              </Button>
            </TabsContent>
          )}
        </Tabs>
      </CardContent>
    </Card>
  );
};
