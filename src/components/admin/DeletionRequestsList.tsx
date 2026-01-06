import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { Check, X, UserX, AlertTriangle, Clock, ShieldAlert } from 'lucide-react';
import { format } from 'date-fns';
import { GlassCard } from '@/components/ui/glass-card';
import { StaggerContainer, StaggerItem, FadeIn } from '@/components/ui/page-transition';

interface DeletionRequest {
  id: string;
  user_id: string;
  requested_at: string;
  status: string;
  user_name: string;
  user_role: string;
}

export const DeletionRequestsList = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const { organizationId } = useOrganization();
  const [requests, setRequests] = useState<DeletionRequest[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!organizationId) return;

    fetchRequests();

    const channel = supabase
      .channel('deletion-requests')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'account_deletion_requests',
        filter: `organization_id=eq.${organizationId}`
      }, () => fetchRequests())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [organizationId]);

  const fetchRequests = async () => {
    if (!organizationId) return;

    const { data: requestData } = await supabase
      .from('account_deletion_requests')
      .select('id, user_id, requested_at, status')
      .eq('organization_id', organizationId)
      .eq('status', 'pending')
      .order('requested_at');

    if (!requestData || requestData.length === 0) {
      setRequests([]);
      return;
    }

    // Fetch user details (name only - no email for privacy)
    const userIds = requestData.map(r => r.user_id);
    const [profilesRes, rolesRes] = await Promise.all([
      supabase.from('profiles').select('id, full_name').in('id', userIds),
      supabase.from('user_roles').select('user_id, role').in('user_id', userIds)
    ]);

    const profileMap = new Map(profilesRes.data?.map(p => [p.id, p.full_name]));
    const roleMap = new Map(rolesRes.data?.map(r => [r.user_id, r.role]));

    setRequests(requestData.map(r => ({
      id: r.id,
      user_id: r.user_id,
      requested_at: r.requested_at || new Date().toISOString(),
      status: r.status || 'pending',
      user_name: profileMap.get(r.user_id) || 'Unknown',
      user_role: roleMap.get(r.user_id) || 'unknown'
    })));
  };

  const handleApprove = async (request: DeletionRequest) => {
    setLoading(true);

    try {
      // Update request status
      await supabase
        .from('account_deletion_requests')
        .update({
          status: 'approved',
          reviewed_by: user?.id,
          reviewed_at: new Date().toISOString()
        })
        .eq('id', request.id);

      // Call the delete function
      const { error: deleteError } = await supabase.functions.invoke('delete-user', {
        body: { userId: request.user_id }
      });

      if (deleteError) throw deleteError;

      toast({ title: 'Account deleted successfully' });
      fetchRequests();
    } catch (error) {
      console.error('Error deleting user:', error);
      toast({ title: 'Error deleting account', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleDeny = async (requestId: string) => {
    await supabase
      .from('account_deletion_requests')
      .update({
        status: 'denied',
        reviewed_by: user?.id,
        reviewed_at: new Date().toISOString()
      })
      .eq('id', requestId);

    toast({ title: 'Deletion request denied' });
    fetchRequests();
  };

  if (requests.length === 0) {
    return (
      <GlassCard className="bg-slate-900/40 border-2 border-white/5 py-12">
        <div className="text-center space-y-3">
          <div className="inline-flex p-4 rounded-full bg-slate-950/50 border border-white/5 mb-2">
            <UserX className="h-8 w-8 text-slate-500 opacity-50" />
          </div>
          <p className="text-slate-500 font-bold uppercase tracking-widest text-xs">No pending deletion requests</p>
        </div>
      </GlassCard>
    );
  }

  return (
    <GlassCard className="bg-slate-900/60 border-2 border-white/10 shadow-xl overflow-hidden p-0">
      <div className="p-4 border-b border-white/10 bg-white/5 bg-gradient-to-r from-red-600/10 to-transparent flex items-center justify-between">
        <h3 className="text-xl font-black tracking-tight text-white flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-red-500" />
          Account Deletion Requests
        </h3>
        <span className="bg-red-600 text-white text-[10px] font-black px-2 py-0.5 rounded-full shadow-lg shadow-red-600/20">
          {requests.length} Pending
        </span>
      </div>

      <div className="p-6">
        <StaggerContainer className="space-y-4">
          {requests.map(request => (
            <div key={request.id} className="contents">
              <StaggerItem>
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-5 rounded-2xl bg-white/5 border border-white/5 hover:border-white/10 transition-all gap-4 group">
                  <div className="space-y-1.5 font-bold">
                    <p className="text-white text-lg font-black leading-none">{request.user_name}</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] font-black uppercase tracking-widest bg-blue-600/20 text-blue-400 px-2 py-0.5 rounded-full border border-blue-500/20">
                        {request.user_role}
                      </span>
                      <span className="text-[10px] text-slate-500 font-black uppercase tracking-wider flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Requested {format(new Date(request.requested_at), 'MMM d')}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeny(request.id)}
                      className="flex-1 sm:flex-none h-10 px-4 hover:bg-red-600/20 text-red-400 font-black rounded-xl transition-all"
                    >
                      <X className="h-4 w-4 mr-1.5" />
                      Deny
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleApprove(request)}
                      disabled={loading}
                      className="flex-1 sm:flex-none h-10 px-6 bg-green-600 hover:bg-green-700 text-white font-black rounded-xl border-none shadow-lg shadow-green-600/20 transition-all hover:scale-105 active:scale-95"
                    >
                      <Check className="h-4 w-4 mr-1.5" />
                      Approve
                    </Button>
                  </div>
                </div>
              </StaggerItem>
            </div>
          ))}
        </StaggerContainer>
      </div>
    </GlassCard>
  );
};