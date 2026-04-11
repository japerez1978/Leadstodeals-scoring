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
    // Use ONLY onAuthStateChange — it fires INITIAL_SESSION synchronously
    // with the persisted session on mount. Calling getSession() in parallel
    // causes auth-token lock contention ("stole lock" errors).
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      try {
        setUser(session?.user ?? null);
        if (session?.user) {
          await fetchTenant(session.user.id);
        } else {
          setTenant(null);
        }
      } catch (err) {
        console.error('Error handling auth state change:', err);
      } finally {
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