import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { supabase } from '@/integrations/supabase/client';
import { OrganizationSelector } from '@/components/organization/OrganizationSelector';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { GlassCard } from '@/components/ui/glass-card';
import { GlowButton } from '@/components/ui/glow-button';
import { z } from 'zod';
import { Loader2, Eye, EyeOff, Sparkles } from 'lucide-react';

const emailSchema = z.string().email('Invalid email address');
const passwordSchema = z.string().min(6, 'Password must be at least 6 characters');

type AppRole = 'student' | 'teacher' | 'admin';

const Auth = () => {
  const { user, role, isApproved, loading, signOut } = useAuth();
  const { organization, organizationId, loading: orgLoading } = useOrganization();
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const [showPassword, setShowPassword] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupName, setSignupName] = useState('');
  const [signupRole, setSignupRole] = useState<AppRole>('student');
  const [forgotPasswordOpen, setForgotPasswordOpen] = useState(false);
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState('');
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [showOrgSelector, setShowOrgSelector] = useState(false);

  const { signIn, signUp } = useAuth();

  useEffect(() => {
    if (user && role && !orgLoading && !organizationId) {
      setShowOrgSelector(true);
    } else {
      setShowOrgSelector(false);
    }
  }, [user, role, orgLoading, organizationId]);

  const handleForgotPassword = async () => {
    try {
      emailSchema.parse(forgotPasswordEmail);
    } catch (err) {
      if (err instanceof z.ZodError) {
        toast({ title: 'Validation Error', description: err.errors[0].message, variant: 'destructive' });
        return;
      }
    }

    setIsSendingReset(true);
    const { error } = await supabase.auth.resetPasswordForEmail(forgotPasswordEmail, {
      redirectTo: `${window.location.origin}/reset-password`
    });
    setIsSendingReset(false);

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Reset Email Sent', description: 'Check your email for a password reset link.' });
      setForgotPasswordOpen(false);
      setForgotPasswordEmail('');
    }
  };

  if (loading || orgLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted/30">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
        >
          <Loader2 className="w-8 h-8 text-primary" />
        </motion.div>
      </div>
    );
  }

  if (showOrgSelector && user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted/30 p-4">
        <motion.div
          className="w-full max-w-md space-y-4"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <OrganizationSelector
            userId={user.id}
            isAdmin={role === 'admin'}
            onComplete={() => window.location.reload()}
          />
          <Button variant="ghost" className="w-full" onClick={signOut}>
            Sign Out
          </Button>
        </motion.div>
      </div>
    );
  }

  if (user && role && organizationId) {
    if (!isApproved && role !== 'student') {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted/30 p-4">
          <GlassCard className="w-full max-w-md">
            <CardHeader>
              <CardTitle>Awaiting Approval</CardTitle>
              <CardDescription>
                Your account is pending approval from an administrator at {organization?.name}.
                You'll be able to access the system once approved.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={signOut} variant="outline" className="w-full">
                Sign Out
              </Button>
            </CardContent>
          </GlassCard>
        </div>
      );
    }
    return <Navigate to={`/${role}`} replace />;
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      emailSchema.parse(loginEmail);
      passwordSchema.parse(loginPassword);
    } catch (err) {
      if (err instanceof z.ZodError) {
        toast({ title: 'Validation Error', description: err.errors[0].message, variant: 'destructive' });
        return;
      }
    }

    setIsLoading(true);
    const { error } = await signIn(loginEmail, loginPassword);
    setIsLoading(false);

    if (error) {
      toast({ title: 'Login Failed', description: error.message, variant: 'destructive' });
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      emailSchema.parse(signupEmail);
      passwordSchema.parse(signupPassword);
      if (!signupName.trim()) throw new Error('Name is required');
    } catch (err) {
      const msg = err instanceof z.ZodError ? err.errors[0].message : (err as Error).message;
      toast({ title: 'Validation Error', description: msg, variant: 'destructive' });
      return;
    }

    setIsLoading(true);
    const { error } = await signUp(signupEmail, signupPassword, signupName, signupRole);
    setIsLoading(false);

    if (error) {
      let message = error.message;
      if (message.includes('already registered')) {
        message = 'An account with this email already exists. Please log in instead.';
      }
      toast({ title: 'Signup Failed', description: message, variant: 'destructive' });
    } else {
      toast({
        title: 'Account Created',
        description: signupRole === 'student' ? 'You can now log in!' : 'Your account is pending admin approval.',
      });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted/30 p-4 relative overflow-hidden">
      {/* Decorative background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          className="absolute -top-40 -right-40 w-80 h-80 rounded-full bg-primary/10 blur-3xl"
          animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.5, 0.3] }}
          transition={{ duration: 8, repeat: Infinity }}
        />
        <motion.div
          className="absolute -bottom-40 -left-40 w-80 h-80 rounded-full bg-primary/5 blur-3xl"
          animate={{ scale: [1.2, 1, 1.2], opacity: [0.2, 0.4, 0.2] }}
          transition={{ duration: 10, repeat: Infinity }}
        />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
        className="relative z-10"
      >
        <GlassCard className="w-full max-w-xl" hover3D>
          <CardHeader className="text-center pb-2">
            <motion.div
              className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-lg shadow-primary/30"
              whileHover={{ scale: 1.05, rotate: 5 }}
            >
              <Sparkles className="w-8 h-8 text-primary-foreground" />
            </motion.div>
            <CardTitle className="text-3xl font-black tracking-tight">SmartPass</CardTitle>
            <CardDescription className="text-base">Digital Hall Pass Management</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="login" className="space-y-6">
              <TabsList className="grid w-full grid-cols-2 rounded-xl bg-muted/50 p-1">
                <TabsTrigger value="login" className="rounded-lg font-bold">Login</TabsTrigger>
                <TabsTrigger value="signup" className="rounded-lg font-bold">Sign Up</TabsTrigger>
              </TabsList>

              <TabsContent value="login" className="space-y-4">
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="login-email" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Email
                    </Label>
                    <Input
                      id="login-email"
                      type="email"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="h-12 rounded-xl"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="login-password" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        Password
                      </Label>
                      <Button
                        type="button"
                        variant="link"
                        className="px-0 h-auto text-xs text-primary"
                        onClick={() => setForgotPasswordOpen(true)}
                      >
                        Forgot password?
                      </Button>
                    </div>
                    <div className="relative">
                      <Input
                        id="login-password"
                        type={showPassword ? "text" : "password"}
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        placeholder="••••••••"
                        className="h-12 rounded-xl pr-12"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>
                  <GlowButton type="submit" className="w-full" size="lg" loading={isLoading}>
                    Sign In
                  </GlowButton>
                </form>
              </TabsContent>

              <TabsContent value="signup" className="space-y-4">
                <form onSubmit={handleSignup} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signup-name" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Full Name
                    </Label>
                    <Input
                      id="signup-name"
                      type="text"
                      value={signupName}
                      onChange={(e) => setSignupName(e.target.value)}
                      placeholder="John Doe"
                      className="h-12 rounded-xl"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-email" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Email
                    </Label>
                    <Input
                      id="signup-email"
                      type="email"
                      value={signupEmail}
                      onChange={(e) => setSignupEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="h-12 rounded-xl"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-password" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Password
                    </Label>
                    <div className="relative">
                      <Input
                        id="signup-password"
                        type={showPassword ? "text" : "password"}
                        value={signupPassword}
                        onChange={(e) => setSignupPassword(e.target.value)}
                        placeholder="••••••••"
                        className="h-12 rounded-xl pr-12"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-role" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Role
                    </Label>
                    <Select value={signupRole} onValueChange={(v) => setSignupRole(v as AppRole)}>
                      <SelectTrigger className="h-12 rounded-xl">
                        <SelectValue placeholder="Select your role" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="student">Student</SelectItem>
                        <SelectItem value="teacher">Teacher</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                    {signupRole !== 'student' && (
                      <p className="text-xs text-muted-foreground">
                        Teacher and Admin accounts require approval.
                      </p>
                    )}
                  </div>
                  <GlowButton type="submit" className="w-full" size="lg" loading={isLoading}>
                    Create Account
                  </GlowButton>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </GlassCard>
      </motion.div>

      {/* Forgot Password Dialog */}
      <Dialog open={forgotPasswordOpen} onOpenChange={setForgotPasswordOpen}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
            <DialogDescription>
              Enter your email address and we'll send you a link to reset your password.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="forgot-email">Email</Label>
              <Input
                id="forgot-email"
                type="email"
                value={forgotPasswordEmail}
                onChange={(e) => setForgotPasswordEmail(e.target.value)}
                placeholder="you@example.com"
                className="h-12 rounded-xl"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setForgotPasswordOpen(false)} className="rounded-xl">
              Cancel
            </Button>
            <Button onClick={handleForgotPassword} disabled={isSendingReset} className="rounded-xl">
              {isSendingReset ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : (
                'Send Reset Link'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Auth;
