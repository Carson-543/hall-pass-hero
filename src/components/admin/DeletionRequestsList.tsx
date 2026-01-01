import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { Check, X, UserX, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';

interface DeletionRequest {
  id: string;
  user_id: string;
  requested_at: string;
  status: string;
  user_name: string;
  user_email: string;
  user_role: string;
}

export const DeletionRequestsList = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [requests, setRequests] = useState<DeletionRequest[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchRequests();

    const channel = supabase
      .channel('deletion-requests')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'account_deletion_requests'
      }, () => fetchRequests())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchRequests = async () => {
    const { data: requestData } = await supabase
      .from('account_deletion_requests')
      .select('*')
      .eq('status', 'pending')
      .order('requested_at');

    if (!requestData || requestData.length === 0) {
      setRequests([]);
      return;
    }

    // Fetch user details
    const userIds = requestData.map(r => r.user_id);
    const [profilesRes, rolesRes] = await Promise.all([
      supabase.from('profiles').select('id, full_name, email').in('id', userIds),
      supabase.from('user_roles').select('user_id, role').in('user_id', userIds)
    ]);

    const profileMap = new Map(profilesRes.data?.map(p => [p.id, p]));
    const roleMap = new Map(rolesRes.data?.map(r => [r.user_id, r.role]));

    setRequests(requestData.map(r => {
      const profile = profileMap.get(r.user_id);
      return {
        id: r.id,
        user_id: r.user_id,
        requested_at: r.requested_at,
        status: r.status,
        user_name: profile?.full_name || 'Unknown',
        user_email: profile?.email || 'Unknown',
        user_role: roleMap.get(r.user_id) || 'unknown'
      };
    }));
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
      <Card>
        <CardContent className="p-6 text-center text-muted-foreground">
          <UserX className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>No pending deletion requests</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-destructive" />
          Account Deletion Requests
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {requests.map(request => (
          <div
            key={request.id}
            className="flex items-center justify-between p-4 border rounded-lg"
          >
            <div>
              <p className="font-medium">{request.user_name}</p>
              <p className="text-sm text-muted-foreground">{request.user_email}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs bg-muted px-2 py-0.5 rounded capitalize">
                  {request.user_role}
                </span>
                <span className="text-xs text-muted-foreground">
                  Requested {format(new Date(request.requested_at), 'MMM d, yyyy')}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleDeny(request.id)}
                className="text-destructive border-destructive hover:bg-destructive hover:text-destructive-foreground"
              >
                <X className="h-4 w-4 mr-1" />
                Deny
              </Button>
              <Button
                size="sm"
                onClick={() => handleApprove(request)}
                disabled={loading}
                className="bg-green-600 hover:bg-green-700"
              >
                <Check className="h-4 w-4 mr-1" />
                Approve
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};
