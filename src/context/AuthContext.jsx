import React, { createContext, useContext, useEffect, useState } from 'react';
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

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
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
  }, []);

  const fetchTenant = async (authUserId) => {
    const { data, error } = await supabase
      .from('tenant_users')
      .select('tenant_id, rol, tenants(*)')
      .eq('auth_user_id', authUserId)
      .maybeSingle();

    if (error) { console.error('Supabase error fetching tenant:', error); setTenant(null); return; }
    if (!data) { console.warn('No tenant found for user:', authUserId); setTenant(null); return; }

    setTenant(data.tenants ?? null);
    setUserRole(data.rol ?? null);
  };

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
