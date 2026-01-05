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
import { CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { GlassCard } from '@/components/ui/glass-card';
import { GlowButton } from '@/components/ui/glow-button';
import { z } from 'zod';
import { Loader2, Eye, EyeOff, School } from 'lucide-react';

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
    <div className="min-h-screen md:h-screen w-full flex flex-col md:flex-row bg-background overflow-hidden relative">
      {/* Left Panel: Visual/Branding - Full Screen on Desktop */}
      <div className="relative w-full md:w-1/2 lg:w-[60%] h-auto md:h-full bg-slate-950 flex flex-col items-center justify-center p-8 md:p-24 text-center overflow-hidden border-b md:border-b-0 md:border-r border-white/5 shrink-0">
        {/* Animated Background Orbs for "Popping" effect */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <motion.div
            className="absolute -top-1/4 -right-1/4 w-[80%] h-[80%] rounded-full bg-primary/20 blur-[64px]"
            style={{ willChange: "transform" }}
            animate={{
              x: [0, 30, 0],
              y: [0, -20, 0]
            }}
            transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
          />
          <motion.div
            className="absolute -bottom-1/4 -left-1/4 w-[70%] h-[70%] rounded-full bg-blue-600/10 blur-[60px]"
            style={{ willChange: "transform" }}
            animate={{
              x: [0, -20, 0],
              y: [0, 40, 0]
            }}
            transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
          />
          <div className="absolute inset-0 bg-black/40 pointer-events-none" />
        </div>

        <div className="relative z-10 flex flex-col items-center max-w-lg">
          <motion.div
            className="w-24 h-24 mb-10 rounded-[2.5rem] bg-gradient-to-br from-primary via-blue-500 to-primary flex items-center justify-center shadow-lg shadow-primary/20 border border-white/10"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, ease: "easeOut", delay: 0.2 }}
            whileHover={{ scale: 1.05 }}
          >
            <School className="w-12 h-12 text-white" />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            <h1 className="text-5xl md:text-7xl font-black tracking-tight mb-6 text-white leading-none">
              ClassPass <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-blue-600 px-1">Pro</span>
            </h1>
            <p className="text-xl md:text-2xl text-slate-400 font-medium max-w-md mx-auto leading-relaxed">
              The next generation of <span className="text-white font-bold">digital hall pass</span> management for modern schools.
            </p>
          </motion.div>

          {/* Feature highlights for "pop" */}
          <motion.div
            className="mt-12 grid grid-cols-2 gap-4 w-full"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
          >
            <div className="p-4 rounded-3xl bg-white/5 border border-white/10 backdrop-blur-sm">
              <p className="text-blue-400 font-black text-2xl">Real-time</p>
              <p className="text-slate-500 text-sm font-bold uppercase tracking-widest">Tracking</p>
            </div>
            <div className="p-4 rounded-3xl bg-white/5 border border-white/10 backdrop-blur-sm">
              <p className="text-blue-400 font-black text-2xl">Unlimited</p>
              <p className="text-slate-500 text-sm font-bold uppercase tracking-widest">Scalability</p>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Right Panel: Auth Form */}
      <div className="flex-1 flex flex-col justify-center items-center p-8 md:p-12 lg:p-24 bg-background relative z-20 overflow-y-auto">
        <motion.div
          className="w-full max-w-md"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          <div className="mb-10 text-center md:text-left">
            <h2 className="text-3xl font-black tracking-tight mb-2">Welcome Back</h2>
            <p className="text-muted-foreground font-medium">Please enter your details to continue.</p>
          </div>

          <Tabs defaultValue="login" className="space-y-8 w-full">
            <TabsList className="grid w-full grid-cols-2 rounded-2xl bg-muted/50 p-1.5 h-14">
              <TabsTrigger value="login" className="rounded-xl font-bold text-base data-[state=active]:shadow-lg">Login</TabsTrigger>
              <TabsTrigger value="signup" className="rounded-xl font-bold text-base data-[state=active]:shadow-lg">Sign Up</TabsTrigger>
            </TabsList>

            <TabsContent value="login" className="space-y-6">
              <form onSubmit={handleLogin} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="login-email" className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">
                    Email Address
                  </Label>
                  <Input
                    id="login-email"
                    type="email"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    placeholder="name@school.edu"
                    className="h-14 rounded-2xl px-6 text-base border-muted-foreground/20 focus:ring-primary/20 transition-all font-medium"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between ml-1">
                    <Label htmlFor="login-password" className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                      Password
                    </Label>
                    <Button
                      type="button"
                      variant="link"
                      className="px-0 h-auto text-xs font-bold text-primary hover:no-underline"
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
                      className="h-14 rounded-2xl px-6 pr-14 text-base border-muted-foreground/20 focus:ring-primary/20 transition-all font-medium"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1"
                    >
                      {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                    </button>
                  </div>
                </div>
                <GlowButton type="submit" className="w-full h-14 rounded-2xl text-lg font-black" size="lg" loading={isLoading}>
                  Sign In to Dashboard
                </GlowButton>
              </form>
            </TabsContent>

            <TabsContent value="signup" className="space-y-6">
              <form onSubmit={handleSignup} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="signup-name" className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">
                    Full Name
                  </Label>
                  <Input
                    id="signup-name"
                    type="text"
                    value={signupName}
                    onChange={(e) => setSignupName(e.target.value)}
                    placeholder="Enter your full name"
                    className="h-14 rounded-2xl px-6 text-base border-muted-foreground/20 transition-all font-medium"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-email" className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">
                    Email Address
                  </Label>
                  <Input
                    id="signup-email"
                    type="email"
                    value={signupEmail}
                    onChange={(e) => setSignupEmail(e.target.value)}
                    placeholder="name@school.edu"
                    className="h-14 rounded-2xl px-6 text-base border-muted-foreground/20 transition-all font-medium"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-password" className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">
                    Password
                  </Label>
                  <div className="relative">
                    <Input
                      id="signup-password"
                      type={showPassword ? "text" : "password"}
                      value={signupPassword}
                      onChange={(e) => setSignupPassword(e.target.value)}
                      placeholder="Min. 6 characters"
                      className="h-14 rounded-2xl px-6 pr-14 text-base border-muted-foreground/20 transition-all font-medium"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1"
                    >
                      {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-role" className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">
                    I am a...
                  </Label>
                  <Select value={signupRole} onValueChange={(v) => setSignupRole(v as AppRole)}>
                    <SelectTrigger className="h-14 rounded-2xl px-6 text-base border-muted-foreground/20 font-medium">
                      <SelectValue placeholder="Select your role" />
                    </SelectTrigger>
                    <SelectContent className="rounded-2xl">
                      <SelectItem value="student" className="h-12 rounded-xl">Student</SelectItem>
                      <SelectItem value="teacher" className="h-12 rounded-xl">Teacher</SelectItem>
                      <SelectItem value="admin" className="h-12 rounded-xl">Administrator</SelectItem>
                    </SelectContent>
                  </Select>
                  {signupRole !== 'student' && (
                    <p className="text-[10px] font-bold text-primary uppercase tracking-widest mt-2 ml-1">
                      * Teacher and Admin accounts require approval.
                    </p>
                  )}
                </div>
                <GlowButton type="submit" className="w-full h-14 rounded-2xl text-lg font-black mt-2" size="lg" loading={isLoading}>
                  Create My Account
                </GlowButton>
              </form>
            </TabsContent>
          </Tabs>
        </motion.div>


      </div>

      <Dialog open={forgotPasswordOpen} onOpenChange={setForgotPasswordOpen}>
        <DialogContent className="rounded-3xl p-8 border-0 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black tracking-tight">Reset Password</DialogTitle>
            <DialogDescription className="text-base font-medium">
              We'll send a secure link to your email to reset your account access.
            </DialogDescription>
          </DialogHeader>
          <div className="py-6">
            <div className="space-y-2">
              <Label htmlFor="forgot-email" className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">Email Address</Label>
              <Input
                id="forgot-email"
                type="email"
                value={forgotPasswordEmail}
                onChange={(e) => setForgotPasswordEmail(e.target.value)}
                placeholder="name@school.edu"
                className="h-14 rounded-2xl px-6 text-base font-medium"
              />
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-3">
            <Button variant="ghost" onClick={() => setForgotPasswordOpen(false)} className="rounded-2xl h-12 px-8 font-bold order-2 sm:order-1">
              Nevermind
            </Button>
            <Button
              onClick={handleForgotPassword}
              disabled={isSendingReset}
              className="rounded-2xl h-12 px-8 font-bold bg-primary text-white hover:bg-primary/90 order-1 sm:order-2 shadow-lg shadow-primary/25"
            >
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
