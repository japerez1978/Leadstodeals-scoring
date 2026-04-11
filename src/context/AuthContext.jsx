import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [tenant, setTenant] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Supabase auth-lock deadlock guard:
    // The onAuthStateChange callback runs INSIDE the gotrue auth lock. Any
    // supabase.from(...) call inside it will try to re-acquire the same lock
    // and hang forever — the app gets stuck in loading:true and paints as a
    // black screen on refresh. Rule: the callback MUST be synchronous and
    // MUST defer any further Supabase calls onto a fresh microtask/task.
    // https://supabase.com/docs/reference/javascript/auth-onauthstatechange
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        // Defer OUT of the auth-lock callback
        setTimeout(() => {
          fetchTenant(session.user.id).finally(() => setLoading(false));
        }, 0);
      } else {
        setTenant(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchTenant = async (authUserId) => {
    const { data, error } = await supabase
      .from('tenant_users')
      .select('tenant_id, tenants(*)')
      .eq('auth_user_id', authUserId)
      .maybeSingle();

    if (error) {
      console.error('Supabase error fetching tenant:', error);
      setTenant(null);
      return;
    }

    if (!data) {
      console.warn('No tenant found for user:', authUserId);
      setTenant(null);
      return;
    }

    console.log('Tenant data fetched:', data);
    setTenant(data.tenants ?? null);
  };

  const signIn = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  const value = {
    user,
    tenant,
    loading,
    signIn,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};