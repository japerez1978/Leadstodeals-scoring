import React, { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext();

/** One HTTP request even if several SIGNED_IN/INITIAL_SESSION handlers run in the same tick. */
const tenantFetchInflight = new Map();

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

  // After tab focus, GoTrue may emit SIGNED_IN several times → coalesce tenant_users fetches.
  const TENANT_FETCH_COOLDOWN_MS = 8000;
  const lastTenantFetchRef = useRef({ userId: null, at: 0 });

  const fetchTenant = useCallback(async (authUserId) => {
    const existing = tenantFetchInflight.get(authUserId);
    if (existing) return existing;

    const promise = (async () => {
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
    })().finally(() => {
      tenantFetchInflight.delete(authUserId);
    });

    tenantFetchInflight.set(authUserId, promise);
    return promise;
  }, []);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // New User object on every TOKEN_REFRESHED → full tree re-render → duplicate work / noisy Network.
      setUser((prev) => {
        const next = session?.user ?? null;
        if (!next) return null;
        if (prev?.id === next.id) return prev;
        return next;
      });

      if (session?.user) {
        // Only these events mean “session identity changed”; everything else updates the JWT in-memory.
        const needTenant = event === 'INITIAL_SESSION' || event === 'SIGNED_IN';
        if (!needTenant) {
          setLoading(false);
          return;
        }
        const uid = session.user.id;
        const now = Date.now();
        const { userId: prevUid, at } = lastTenantFetchRef.current;
        if (prevUid === uid && now - at < TENANT_FETCH_COOLDOWN_MS) {
          setLoading(false);
          return;
        }
        lastTenantFetchRef.current = { userId: uid, at: now };
        setTimeout(() => {
          fetchTenant(uid).finally(() => setLoading(false));
        }, 0);
      } else {
        tenantFetchInflight.clear();
        lastTenantFetchRef.current = { userId: null, at: 0 };
        setTenant(null);
        setUserRole(null);
        setLoading(false);
      }
    });
    return () => subscription.unsubscribe();
  }, [fetchTenant]);

  const signIn = useCallback(async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }, []);

  const value = useMemo(
    () => ({ user, tenant, userRole, loading, signIn, signOut }),
    [user, tenant, userRole, loading, signIn, signOut]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
