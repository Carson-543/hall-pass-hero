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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { GlassCard } from '@/components/ui/glass-card';
import { GlowButton } from '@/components/ui/glow-button';
import { z } from 'zod';
import { Loader2, Eye, EyeOff, Clock } from 'lucide-react';

const emailSchema = z.string().email('Invalid email address');
const passwordSchema = z.string().min(6, 'Password must be at least 6 characters');

type AppRole = 'student' | 'teacher' | 'admin';

const Auth = () => {
  const { user, role, isApproved, loading, signOut, signIn, signUp } = useAuth();
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

  // 1. LOADING STATE
  if (loading || orgLoading) {
    return (
      <div className="h-screen w-full flex bg-slate-950 items-center justify-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
        >
          <Loader2 className="w-8 h-8 text-primary shadow-glow" />
        </motion.div>
      </div>
    );
  }

  // 2. AUTHENTICATED LOGIC FLOW
  if (user) {
    // STEP A: If no organization is selected, show the selector
    if (!organizationId) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-950 p-4 relative overflow-hidden">
          {/* Background Orbs */}
          <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none opacity-20">
            <div className="absolute -top-1/4 -right-1/4 w-[80%] h-[80%] rounded-full bg-primary/30 blur-[100px]" />
          </div>

          <motion.div
            className="w-full max-w-md space-y-4 relative z-10"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <OrganizationSelector
              userId={user.id}
              isAdmin={role === 'admin'}
              onComplete={() => window.location.reload()}
            />
            <Button variant="ghost" className="w-full text-slate-400 hover:text-white" onClick={signOut}>
              Sign Out
            </Button>
          </motion.div>
        </div>
      );
    }

    // STEP B: If organization is selected but user is NOT approved
    // (We bypass this for students if your system auto-approves them)
    if (!isApproved && role !== 'student') {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-950 p-4">
          <GlassCard className="w-full max-w-md border-primary/20 shadow-2xl shadow-primary/10">
            <CardHeader className="text-center pb-2">
              <div className="mx-auto w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mb-6 border border-primary/20">
                <Clock className="w-8 h-8 text-primary animate-pulse" />
              </div>
              <CardTitle className="text-3xl font-black text-white">Pending Approval</CardTitle>
              <CardDescription className="text-lg text-slate-400 pt-2 leading-relaxed">
                You've joined <span className="text-white font-bold">{organization?.name}</span>.
                Your account is currently being reviewed by an administrator.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              <div className="p-4 rounded-2xl bg-white/5 border border-white/10 text-sm text-slate-400 font-medium text-center">
                Access will be granted automatically once your role is verified.
              </div>
              <div className="flex gap-3">
                <Button
                  onClick={signOut}
                  variant="outline"
                  className="flex-1 h-12 rounded-xl font-bold border-white/10 hover:bg-white/5"
                >
                  Sign Out
                </Button>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button className="flex-1 h-12 rounded-xl font-bold bg-white/10 hover:bg-white/20 text-white border border-white/10">
                      Change Role
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="rounded-3xl p-8 border-0 shadow-2xl bg-slate-900 text-white">
                    <DialogHeader>
                      <DialogTitle className="text-2xl font-black">Change Role & Re-apply</DialogTitle>
                      <DialogDescription className="text-slate-400">
                        If you applied with the wrong role or were denied, you can update your details here to re-submit your application.
                      </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={async (e) => {
                      e.preventDefault();
                      const formData = new FormData(e.currentTarget);
                      const newName = formData.get('name') as string;
                      const newRole = formData.get('role') as AppRole;

                      if (!newName || !newRole) return;

                      setIsLoading(true);

                      // 1. Update Role
                      await supabase.from('user_roles').update({ role: newRole }).eq('user_id', user.id);

                      // 2. Upsert Profile (Restore it if deleted, update name)
                      // If new role is student, auto-approve.
                      await supabase.from('profiles').upsert({
                        id: user.id,
                        email: user.email,
                        full_name: newName,
                        is_approved: newRole === 'student'
                      });

                      toast({ title: "Application Updated", description: "Your role and details have been updated." });
                      window.location.reload();
                    }} className="space-y-5 pt-4">
                      <div className="space-y-2">
                        <Label className="uppercase text-xs font-black tracking-widest text-slate-500">Full Name</Label>
                        <Input name="name" placeholder="Enter your full name" required defaultValue={user.user_metadata?.full_name || ''} className="h-12 rounded-xl bg-white/5 border-white/10 text-white" />
                      </div>
                      <div className="space-y-2">
                        <Label className="uppercase text-xs font-black tracking-widest text-slate-500">I am a...</Label>
                        <Select name="role" required defaultValue="student">
                          <SelectTrigger className="h-12 rounded-xl bg-white/5 border-white/10 text-white">
                            <SelectValue placeholder="Select role" />
                          </SelectTrigger>
                          <SelectContent className="rounded-xl bg-slate-900 border-white/10 text-white">
                            <SelectItem value="student">Student (Auto-Approved)</SelectItem>
                            <SelectItem value="teacher">Teacher</SelectItem>
                            <SelectItem value="admin">Administrator</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <Button type="submit" disabled={isLoading} className="w-full h-12 rounded-xl font-black text-lg bg-blue-600 hover:bg-blue-500 text-white">
                        {isLoading ? <Loader2 className="animate-spin" /> : "Update & Re-apply"}
                      </Button>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>
            </CardContent>
          </GlassCard>
        </div>
      );
    }

    // STEP C: Approved and Has Org -> Redirect to Dashboard
    return <Navigate to={`/${role}`} replace />;
  }

  // 3. UNAUTHENTICATED STATE (Login / Signup Forms)
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
    if (error) toast({ title: 'Login Failed', description: error.message, variant: 'destructive' });
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
      toast({ title: 'Signup Failed', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Account Created', description: 'Please log in to select your school.' });
    }
  };

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
      toast({ title: 'Reset Email Sent', description: 'Check your email for a link.' });
      setForgotPasswordOpen(false);
    }
  };

  return (
    <div className="min-h-screen md:h-screen w-full flex flex-col md:flex-row bg-background overflow-hidden relative">
      <div className="relative w-full md:w-1/2 lg:w-[60%] h-auto md:h-full bg-slate-950 flex flex-col items-center justify-center p-8 md:p-24 text-center overflow-hidden border-b md:border-b-0 md:border-r border-white/5 shrink-0">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <motion.div className="absolute -top-1/4 -right-1/4 w-[80%] h-[80%] rounded-full bg-primary/20 blur-[64px]" animate={{ x: [0, 30, 0], y: [0, -20, 0] }} transition={{ duration: 20, repeat: Infinity, ease: "linear" }} />
          <motion.div className="absolute -bottom-1/4 -left-1/4 w-[70%] h-[70%] rounded-full bg-blue-600/10 blur-[60px]" animate={{ x: [0, -20, 0], y: [0, 40, 0] }} transition={{ duration: 25, repeat: Infinity, ease: "linear" }} />
          <div className="absolute inset-0 bg-black/40 pointer-events-none" />
        </div>
        <div className="relative z-10 flex flex-col items-center max-w-lg">
          <motion.div className="w-24 h-24 mb-10 rounded-[2.5rem] bg-gradient-to-br from-primary via-blue-500 to-primary flex items-center justify-center shadow-lg border border-white/10" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
            <img src="/logo.png" alt="Logo" className="w-16 h-16 object-contain" />
          </motion.div>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}>
            <h1 className="text-5xl md:text-7xl font-black tracking-tight mb-6 text-white leading-none">ClassPass <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-blue-600 px-1">Pro</span></h1>
            <p className="text-xl md:text-2xl text-slate-400 font-medium max-w-md mx-auto">The next generation of <span className="text-white font-bold">digital hall pass</span> management.</p>
          </motion.div>
        </div>
      </div>

      <div className="flex-1 flex flex-col justify-center items-center p-8 md:p-12 lg:p-24 bg-background relative z-20 overflow-y-auto">
        <motion.div className="w-full max-w-md" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <div className="mb-10 text-center md:text-left">
            <h2 className="text-3xl font-black tracking-tight mb-2">Welcome Back</h2>
            <p className="text-muted-foreground font-medium">Please enter your details to continue.</p>
          </div>
          <Tabs defaultValue="login" className="space-y-8 w-full">
            <TabsList className="grid w-full grid-cols-2 rounded-2xl bg-muted/50 p-1.5 h-14">
              <TabsTrigger value="login" className="rounded-xl font-bold text-base">Login</TabsTrigger>
              <TabsTrigger value="signup" className="rounded-xl font-bold text-base">Sign Up</TabsTrigger>
            </TabsList>
            <TabsContent value="login" className="space-y-6">
              <form onSubmit={handleLogin} className="space-y-6">
                <div className="space-y-2">
                  <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground">Email Address</Label>
                  <Input type="email" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} placeholder="name@school.edu" className="h-14 rounded-2xl px-6 font-medium" required />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground">Password</Label>
                    <Button type="button" variant="link" className="text-xs font-bold text-primary" onClick={() => setForgotPasswordOpen(true)}>Forgot?</Button>
                  </div>
                  <div className="relative">
                    <Input type={showPassword ? "text" : "password"} value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} placeholder="••••••••" className="h-14 rounded-2xl px-6 font-medium" required />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">{showPassword ? <EyeOff size={20} /> : <Eye size={20} />}</button>
                  </div>
                </div>
                <GlowButton type="submit" className="w-full h-14 rounded-2xl text-lg font-black" loading={isLoading}>Sign In</GlowButton>
              </form>
            </TabsContent>
            <TabsContent value="signup" className="space-y-6">
              <form onSubmit={handleSignup} className="space-y-5">
                <div className="space-y-2">
                  <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground">Full Name</Label>
                  <Input value={signupName} onChange={(e) => setSignupName(e.target.value)} placeholder="Enter your full name" className="h-14 rounded-2xl px-6 font-medium" required />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground">Email Address</Label>
                  <Input type="email" value={signupEmail} onChange={(e) => setSignupEmail(e.target.value)} placeholder="name@school.edu" className="h-14 rounded-2xl px-6 font-medium" required />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground">Password</Label>
                  {/* ADDED WRAPPER AND TOGGLE BUTTON BELOW */}
                  <div className="relative">
                    <Input
                      type={showPassword ? "text" : "password"}
                      value={signupPassword}
                      onChange={(e) => setSignupPassword(e.target.value)}
                      placeholder="Min. 6 characters"
                      className="h-14 rounded-2xl px-6 font-medium"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground">I am a...</Label>
                  <Select value={signupRole} onValueChange={(v) => setSignupRole(v as AppRole)}>
                    <SelectTrigger className="h-14 rounded-2xl px-6 text-base font-medium">
                      <SelectValue placeholder="Select your role" />
                    </SelectTrigger>
                    <SelectContent className="rounded-2xl">
                      <SelectItem value="student" className="h-12 rounded-xl">Student</SelectItem>
                      <SelectItem value="teacher" className="h-12 rounded-xl">Teacher</SelectItem>
                      <SelectItem value="admin" className="h-12 rounded-xl">Administrator</SelectItem>
                    </SelectContent>
                  </Select>
                  {signupRole !== 'student' && <p className="text-[10px] font-bold text-primary uppercase tracking-widest mt-2">* Requires approval</p>}
                </div>
                <GlowButton type="submit" className="w-full h-14 rounded-2xl text-lg font-black" loading={isLoading}>Create Account</GlowButton>
              </form>
            </TabsContent>
          </Tabs>
        </motion.div>
      </div>

      <Dialog open={forgotPasswordOpen} onOpenChange={setForgotPasswordOpen}>
        <DialogContent className="rounded-3xl p-8 border-0 shadow-2xl">
          <DialogHeader><DialogTitle className="text-2xl font-black">Reset Password</DialogTitle></DialogHeader>
          <div className="py-6 space-y-2">
            <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground">Email Address</Label>
            <Input type="email" value={forgotPasswordEmail} onChange={(e) => setForgotPasswordEmail(e.target.value)} className="h-14 rounded-2xl px-6 font-medium" />
          </div>
          <DialogFooter className="gap-3">
            <Button variant="ghost" onClick={() => setForgotPasswordOpen(false)} className="rounded-2xl h-12 px-8 font-bold">Nevermind</Button>
            <Button onClick={handleForgotPassword} disabled={isSendingReset} className="rounded-2xl h-12 px-8 font-bold bg-primary text-white">
              {isSendingReset ? 'Sending...' : 'Send Reset Link'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Auth;
