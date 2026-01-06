import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, AlertTriangle, Trash2, Shield, Loader2, Info, School } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { GlassCard } from '@/components/ui/glass-card';
import { PageTransition, StaggerContainer, StaggerItem, FadeIn } from '@/components/ui/page-transition';

const Settings = () => {
  const { user, signOut } = useAuth();
  const { organization, settings, organizationId } = useOrganization();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteAccount = async () => {
    if (confirmText !== 'DELETE') {
      toast({
        title: 'Confirmation Required',
        description: 'Please type DELETE to confirm.',
        variant: 'destructive'
      });
      return;
    }

    if (!user) return;

    setIsDeleting(true);

    try {
      if (settings?.require_deletion_approval) {
        // Create deletion request instead of immediate deletion
        const { error: requestError } = await supabase
          .from('account_deletion_requests')
          .insert({
            user_id: user.id,
            organization_id: organizationId,
            status: 'pending'
          });

        if (requestError) throw requestError;

        toast({
          title: 'Deletion Request Submitted',
          description: 'Your request has been sent to school administrators for approval.'
        });
      } else {
        // Immediate deletion (SB 29 complaint cascading delete)
        const { error: rpcError } = await supabase.rpc('delete_user_and_data', {
          _user_id: user.id
        });

        if (rpcError) throw rpcError;

        await signOut();
        toast({
          title: 'Account Deleted',
          description: 'Your account and data have been permanently removed.'
        });
        navigate('/auth');
      }
    } catch (error: any) {
      console.error('Error in deletion process:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to process deletion. Please contact support.',
        variant: 'destructive'
      });
    } finally {
      setIsDeleting(false);
      setDeleteDialogOpen(false);
      setConfirmText('');
    }
  };

  return (
    <PageTransition className="min-h-screen bg-slate-950 text-slate-100 selection:bg-blue-500/30">
      {/* Background Orbs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <motion.div
          className="absolute -top-1/4 -right-1/4 w-[80%] h-[80%] rounded-full bg-blue-600/15 blur-[100px]"
          animate={{ x: [0, 20, 0], y: [0, -10, 0] }}
          transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
        />
        <motion.div
          className="absolute -bottom-1/4 -left-1/4 w-[70%] h-[70%] rounded-full bg-blue-400/5 blur-[80px]"
          animate={{ x: [0, -20, 0], y: [0, 15, 0] }}
          transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
        />
      </div>

      <div className="relative z-10 max-w-2xl mx-auto p-4 pb-20">
        <header className="flex items-center justify-between mb-10 pt-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate(-1)}
              className="w-11 h-11 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/15 text-white shadow-sm"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-3xl font-black tracking-tighter text-white leading-none mb-1">Account <span className="text-blue-500">Settings</span></h1>
              <p className="text-sm text-slate-300 font-extrabold tracking-wide uppercase flex items-center gap-1.5 mt-1">
                <School className="h-3.5 w-3.5 text-blue-500" />
                {organization?.name || 'SmartPass Pro'}
              </p>
            </div>
          </div>
        </header>

        <StaggerContainer className="space-y-6">
          <StaggerItem>
            <GlassCard className="bg-slate-900/60 border-2 border-white/10 shadow-xl overflow-hidden p-0">
              <div className="p-4 border-b border-white/10 bg-white/5 bg-gradient-to-r from-blue-600/10 to-transparent">
                <h3 className="text-xl font-black tracking-tight text-white flex items-center gap-2">
                  <Shield className="h-5 w-5 text-blue-500" />
                  Data Privacy Notice
                </h3>
              </div>
              <div className="p-6 space-y-4">
                <div className="p-4 rounded-2xl bg-blue-600/5 border border-blue-500/20 text-slate-300">
                  <div className="flex items-start gap-3">
                    <Info className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
                    <div className="text-sm space-y-3 font-medium">
                      <p>Ohio Senate Bill 29 Compliance Notice:</p>
                      <div className="space-y-4 text-xs font-bold uppercase tracking-wider leading-relaxed">
                        <p><span className="text-white">Data Ownership:</span> Student data belongs to the school district. It is never sold or used for commercial purposes.</p>
                        <p><span className="text-white">Security:</span> Data is stored using industry-standard encryption and security protocols.</p>
                        <p><span className="text-white">Retention:</span> Data is only retained for as long as your account is active.</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </GlassCard>
          </StaggerItem>

          <StaggerItem>
            <GlassCard className="bg-slate-900/60 border-2 border-red-500/20 shadow-xl overflow-hidden p-0">
              <div className="p-4 border-b border-red-500/20 bg-red-500/5">
                <h3 className="text-xl font-black tracking-tight text-red-400 flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5" />
                  Danger Zone
                </h3>
              </div>
              <div className="p-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-red-500/5 border border-red-500/10">
                  <div className="space-y-1">
                    <h4 className="font-black text-white">Delete Account</h4>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">
                      {settings?.require_deletion_approval
                        ? 'Request permanent account removal from admin'
                        : 'Permanently remove your account and all data'}
                    </p>
                  </div>
                  <Button
                    variant="destructive"
                    onClick={() => setDeleteDialogOpen(true)}
                    className="bg-red-600 hover:bg-red-700 text-white font-black rounded-xl border-none shadow-lg shadow-red-600/20 h-11"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    {settings?.require_deletion_approval ? 'Request Deletion' : 'Delete Account'}
                  </Button>
                </div>
              </div>
            </GlassCard>
          </StaggerItem>
        </StaggerContainer>
      </div>

      <AnimatePresence>
        {deleteDialogOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
            >
              <GlassCard className="max-w-md w-full bg-slate-900 border-2 border-red-500/20 shadow-2xl p-6">
                <div className="flex items-center gap-3 text-red-400 mb-4">
                  <AlertTriangle className="h-8 w-8" />
                  <h3 className="text-2xl font-black tracking-tighter">Are you sure?</h3>
                </div>

                <p className="text-slate-300 font-bold text-sm mb-6 leading-relaxed">
                  {settings?.require_deletion_approval
                    ? "This will submit a request to your school administrator to delete your account. Once approved, all your pass history and profile data will be permanently removed."
                    : "This action is permanent and cannot be undone. All your hall pass history, class enrollments, and profile data will be immediately erased."}
                </p>

                <div className="space-y-4 mb-8">
                  <Label className="text-xs font-black uppercase tracking-widest text-slate-400">
                    Type <span className="text-red-400">DELETE</span> to confirm
                  </Label>
                  <Input
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value.toUpperCase())}
                    placeholder="DELETE"
                    className="bg-white/5 border-red-500/20 text-white font-mono font-bold h-12 rounded-xl focus:border-red-500"
                  />
                </div>

                <div className="flex gap-3">
                  <Button
                    variant="ghost"
                    className="flex-1 font-bold text-slate-400 hover:text-white hover:bg-white/5 rounded-xl h-12"
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
                    className="flex-2 bg-red-600 hover:bg-red-700 text-white font-black rounded-xl border-none shadow-lg shadow-red-600/20 h-12 px-8"
                    onClick={handleDeleteAccount}
                    disabled={confirmText !== 'DELETE' || isDeleting}
                  >
                    {isDeleting ? <Loader2 className="h-5 w-5 animate-spin" /> : (settings?.require_deletion_approval ? 'Confirm Request' : 'Delete Now')}
                  </Button>
                </div>
              </GlassCard>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </PageTransition>
  );
};

export default Settings;
