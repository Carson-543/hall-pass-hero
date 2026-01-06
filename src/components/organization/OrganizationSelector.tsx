import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Users, School } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

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
  const { toast } = useToast();

  useEffect(() => {
    fetchOrganizations();
  }, []);

  const fetchOrganizations = async () => {
    const { data, error } = await supabase
      .from('organizations')
      .select('id, name, slug')
      .order('name');

    if (error) {
      toast({ title: "Error", description: "Failed to load organizations.", variant: "destructive" });
      return;
    }
    if (data) setOrganizations(data);
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

    // 1. Join organization memberships
    const { error: memberError } = await supabase
      .from('organization_memberships')
      .insert({ organization_id: selectedOrgId, user_id: userId });

    if (memberError) {
      toast({ title: "Error", description: "You might already be a member of this school.", variant: "destructive" });
      setLoading(false);
      return;
    }

    // 2. Update the main profile row
    const { error: profileError } = await supabase
      .from('profiles')
      .update({ organization_id: selectedOrgId })
      .eq('id', userId);

    if (profileError) {
      toast({ title: "Update Failed", description: "Profile could not be linked.", variant: "destructive" });
      setLoading(false);
      return;
    }

    setLoading(false);
    onComplete(selectedOrgId);
  };

  const handleCreateOrganization = async () => {
    if (!newOrgName.trim()) return;
    setLoading(true);

    const slug = generateSlug(newOrgName);

    // 1. Create organization
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .insert({ name: newOrgName.trim(), slug, created_by: userId })
      .select()
      .single();

    if (orgError || !org) {
      toast({ title: "Creation Failed", description: orgError?.message || "Could not create school.", variant: "destructive" });
      setLoading(false);
      return;
    }

    // 2. Setup membership & profile link (Admins are auto-approved for orgs they create)
    await supabase.from('organization_memberships').insert({ organization_id: org.id, user_id: userId });
    
    const { error: profileError } = await supabase
      .from('profiles')
      .update({ organization_id: org.id, is_approved: true })
      .eq('id', userId);

    if (profileError) {
      toast({ title: "Linking Error", description: "School created, but profile update failed.", variant: "destructive" });
    }

    // 3. Setup default settings
    await supabase.from('organization_settings').insert({ organization_id: org.id });

    setLoading(false);
    onComplete(org.id);
  };

  const filteredOrganizations = organizations.filter(org =>
    org.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Card className="w-full max-w-md mx-auto border-white/10 bg-slate-900/50 backdrop-blur-xl shadow-2xl">
      <CardHeader className="text-center pb-8">
        <div className="mx-auto w-16 h-16 bg-blue-500/10 rounded-2xl flex items-center justify-center mb-4 border border-blue-500/20">
          <School className="w-8 h-8 text-blue-400" />
        </div>
        <CardTitle className="text-2xl font-black text-white">Join Your School</CardTitle>
        <CardDescription className="text-white">
          Please select your organization to continue
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="join" className="w-full">
          <TabsList className="grid w-full grid-cols-2 rounded-xl h-12 p-1 bg-white/5 border border-white/10">
            <TabsTrigger value="join" className="rounded-lg gap-2 font-bold data-[state=active]:bg-blue-600">
              <Users className="h-4 w-4" /> Join
            </TabsTrigger>
            {isAdmin && (
              <TabsTrigger value="create" className="rounded-lg gap-2 font-bold data-[state=active]:bg-blue-600">
                <Plus className="h-4 w-4" /> Create
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="join" className="space-y-6 mt-8">
            <div className="space-y-2">
              <Label className="text-xs font-black uppercase text-white ml-1">Search Schools</Label>
              <Input
                placeholder="Lincoln High School..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-12 rounded-xl bg-white/5 border-white/10 focus:ring-blue-600"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-black uppercase text-white ml-1">Select School</Label>
              <Select value={selectedOrgId} onValueChange={setSelectedOrgId}>
                <SelectTrigger className="h-12 rounded-xl bg-white/5 border-white/10">
                  <SelectValue placeholder="Choose a school" />
                </SelectTrigger>
                <SelectContent className="rounded-xl border-white/10 bg-slate-900">
                  {filteredOrganizations.map(org => (
                    <SelectItem key={org.id} value={org.id} className="h-10 rounded-lg">{org.name}</SelectItem>
                  ))}
                  {filteredOrganizations.length === 0 && <div className="p-4 text-sm text-white text-center">No schools found</div>}
                </SelectContent>
              </Select>
            </div>

            <Button
              className="w-full h-14 rounded-2xl font-black text-lg bg-blue-600 hover:bg-blue-600/90 shadow-lg shadow-blue-600/20"
              onClick={handleJoinOrganization}
              disabled={!selectedOrgId || loading}
            >
              {loading ? <Loader2 className="animate-spin" /> : 'Join School'}
            </Button>
          </TabsContent>

          {isAdmin && (
            <TabsContent value="create" className="space-y-6 mt-8">
              <div className="space-y-2">
                <Label className="text-xs font-black uppercase text-white ml-1">New School Name</Label>
                <Input
                  placeholder="e.g., Lincoln High School"
                  value={newOrgName}
                  onChange={(e) => setNewOrgName(e.target.value)}
                  className="h-12 rounded-xl bg-white/5 border-white/10 focus:ring-blue-600"
                />
              </div>

              <Button
                className="w-full h-14 rounded-2xl font-black text-lg bg-blue-600 hover:bg-blue-500 shadow-lg shadow-blue-500/20"
                onClick={handleCreateOrganization}
                disabled={!newOrgName.trim() || loading}
              >
                {loading ? <Loader2 className="animate-spin" /> : 'Create School'}
              </Button>
            </TabsContent>
          )}
        </Tabs>
      </CardContent>
    </Card>
  );
};
