import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

type AppRole = 'student' | 'teacher' | 'admin';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  role: AppRole | null;
  isApproved: boolean | null;
  loading: boolean;
  signUp: (email: string, password: string, fullName: string, role: AppRole) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [isApproved, setIsApproved] = useState<boolean | null>(null); // Default to null (pending/unknown)
  const [loading, setLoading] = useState(true);

  const fetchUserData = async (userId: string) => {
    try {
      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .maybeSingle();

      const { data: profileData } = await supabase
        .from('profiles')
        .select('is_approved')
        .eq('id', userId)
        .maybeSingle();

      if (roleData) {
        setRole(roleData.role as AppRole);
        console.log("✅ AuthContext: Role loaded:", roleData.role);
      } else {
        console.warn("⚠️ AuthContext: No role found for user.");
      }
      if (profileData) {
        setIsApproved(profileData.is_approved);
        console.log("✅ AuthContext: Approval status loaded:", profileData.is_approved);
      }
    } catch (e) {
      console.error("❌ AuthContext: Error fetching user data:", e);
    }
  };

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          // Defer Supabase calls with setTimeout
          setTimeout(() => {
            fetchUserData(session.user.id);
          }, 0);
        } else {
          setRole(null);
          setIsApproved(false);
        }
        setLoading(false);
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchUserData(session.user.id);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (email: string, password: string, fullName: string, role: AppRole) => {
    const redirectUrl = `${window.location.origin}/`;

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          full_name: fullName,
          role: role
        }
      }
    });
    return { error };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password
    });
    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setRole(null);
    setIsApproved(false);
  };

  return (
    <AuthContext.Provider value={{
      user,
      session,
      role,
      isApproved,
      loading,
      signUp,
      signIn,
      signOut
    }}>
      {children}
    </AuthContext.Provider>
  );
};
