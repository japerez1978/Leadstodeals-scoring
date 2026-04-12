import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [tenant, setTenant] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchTenant = useCallback(async (authUserId) => {
    const { data, error } = await supabase
      .from('tenant_users')
      .select('tenant_id, rol, tenants(*)')
      .eq('auth_user_id', authUserId)
      .maybeSingle();

    if (error) { console.error('Supabase error fetching tenant:', error); setTenant(null); return; }
    if (!data) { console.warn('No tenant found for user:', authUserId); setTenant(null); return; }

    const nextTenant = data.tenants ?? null;
    setTenant((prev) => {
      if (prev?.id != null && nextTenant?.id != null && prev.id === nextTenant.id) return prev;
      return nextTenant;
    });
    setUserRole(data.rol ?? null);
  }, []);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        // TOKEN_REFRESHED fires often; re-fetching tenant replaces `tenant` with a new object
        // reference and re-triggers every useEffect([tenant]) in the app → HubSpot/Supabase loops.
        if (event === 'TOKEN_REFRESHED') {
          setLoading(false);
          return;
        }
        setTimeout(() => {
          fetchTenant(session.user.id).finally(() => setLoading(false));
        }, 0);
      } else {
        setTenant(null);
        setUserRole(null);
        setLoading(false);
      }
    });
    return () => subscription.unsubscribe();
  }, [fetchTenant]);

  const signIn = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  return (
    <AuthContext.Provider value={{ user, tenant, userRole, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};
