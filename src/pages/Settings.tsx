import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, AlertTriangle, Trash2, Shield, Loader2, Info } from 'lucide-react';

const Settings = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteAccount = async () => {
    if (confirmText !== 'DELETE') {
      toast({
        title: 'Confirmation Required',
        description: 'Please type DELETE to confirm account deletion.',
        variant: 'destructive'
      });
      return;
    }

    if (!user) return;

    setIsDeleting(true);

    try {
      // Call the database function to delete user data
      const { error: rpcError } = await supabase.rpc('delete_user_and_data', {
        _user_id: user.id
      });

      if (rpcError) {
        throw rpcError;
      }

      // Sign out the user
      await signOut();

      toast({
        title: 'Account Deleted',
        description: 'Your account and all associated data have been deleted.'
      });

      navigate('/auth');
    } catch (error: any) {
      console.error('Error deleting account:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete account. Please contact support.',
        variant: 'destructive'
      });
    } finally {
      setIsDeleting(false);
      setDeleteDialogOpen(false);
      setConfirmText('');
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card px-4 py-3">
        <div className="container mx-auto flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-bold">Account Settings</h1>
        </div>
      </header>

      <main className="container mx-auto p-4 max-w-2xl space-y-6">
        {/* Data Privacy Notice - Ohio SB 29 Compliance */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              Data Privacy Notice
            </CardTitle>
            <CardDescription>
              Ohio Senate Bill 29 Compliant
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <Info className="h-4 w-4" />
              <AlertTitle>Your Data Rights</AlertTitle>
              <AlertDescription className="mt-2 space-y-2">
                <p><strong>Data Ownership:</strong> All student data is the property of the school district and may be accessed by authorized district personnel. This application does not sell or use your data for commercial purposes, marketing, or advertising.</p>
                <p><strong>Data Collection:</strong> We only collect data necessary for hall pass management: your name, email, class enrollments, and pass history.</p>
                <p><strong>Data Storage:</strong> Student data is stored using Supabase, a managed cloud platform that provides industry-standard security protections, including encryption and access controls.</p>
                <p><strong>Data Retention:</strong> Student data is retained only while the account remains active and is permanently deleted immediately upon account deletion.</p>
                <p><strong>Data Deletion:</strong> You may request complete deletion of your account and all associated data at any time using the option below.</p>
                <p><strong>Third-Party Sharing:</strong> Your data is never shared with third parties for commercial purposes.</p>
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>

        {/* Danger Zone */}
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Danger Zone
            </CardTitle>
            <CardDescription>
              Irreversible actions that affect your account
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 rounded-lg border border-destructive/30 bg-destructive/5">
              <div>
                <h4 className="font-medium">Delete Account</h4>
                <p className="text-sm text-muted-foreground">
                  Permanently delete your account and all associated data
                </p>
              </div>
              <Button 
                variant="destructive" 
                onClick={() => setDeleteDialogOpen(true)}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Account
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>

      {/* Delete Account Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Delete Account
            </DialogTitle>
            <DialogDescription>
              This action cannot be undone. This will permanently delete your account and remove all your data from our servers, including:
            </DialogDescription>
          </DialogHeader>
          
          <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1 my-4">
            <li>Your profile information</li>
            <li>All your hall pass history</li>
            <li>Class enrollments</li>
            <li>Any classes you've created (if teacher)</li>
          </ul>

          <div className="space-y-2">
            <Label htmlFor="confirm-delete">
              Type <span className="font-mono font-bold">DELETE</span> to confirm
            </Label>
            <Input
              id="confirm-delete"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value.toUpperCase())}
              placeholder="DELETE"
              className="font-mono"
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button 
              variant="outline" 
              onClick={() => {
                setDeleteDialogOpen(false);
                setConfirmText('');
              }}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleDeleteAccount}
              disabled={confirmText !== 'DELETE' || isDeleting}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete My Account'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Settings;
