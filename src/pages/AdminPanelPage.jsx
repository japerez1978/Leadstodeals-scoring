import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { useTenant } from 'core-saas';
import Spinner from '../components/Spinner';

const RoleBadge = ({ rol }) => {
  const styles = {
    superadmin: 'bg-purple-500/15 text-purple-400',
    admin: 'bg-accent/15 text-accent',
    user: 'bg-[#2a2a2a] text-[#c5c6ca]',
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${styles[rol] ?? styles.user}`}>
      {rol ?? 'user'}
    </span>
  );
};

const Field = ({ label, children }) => (
  <div>
    <label className="block text-[#c5c6ca] text-xs font-medium mb-1.5">{label}</label>
    {children}
  </div>
);

const inputCls = "w-full px-3 py-2.5 bg-[#131313] border border-[#44474a] rounded-lg text-white placeholder-[#44474a] focus:outline-none focus:border-accent text-sm transition-colors";

const AdminPanelPage = () => {
  const { user, loading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteData, setInviteData] = useState({ email: '', rol: 'user' });
  const [submittingInvite, setSubmittingInvite] = useState(false);
  const [inviteMsg, setInviteMsg] = useState(null);

  // Cargamos los datos del Tenant y Rol usando el motor centralizado
  const { data: tenantData, isLoading: tenantLoading } = useTenant(user?.id, user?.email);
  const tenant = tenantData?.tenants;
  const userRole = tenantData?.rol;

  const { data: users = [], isLoading: loadingUsers } = useQuery({
    queryKey: ['admin_users', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      const { data, error } = await supabase
        .from('tenant_users')
        .select('id, email, rol, tenant_id, auth_user_id, created_at, tenants(nombre)')
        .eq('tenant_id', tenant.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!tenant?.id
  });

  if (authLoading || tenantLoading) return (
    <div className="flex flex-col items-center justify-center py-24">
      <Spinner />
      <p className="mt-4 text-sm text-[#c5c6ca]">Sincronizando equipo...</p>
    </div>
  );

  const handleInviteUser = async (e) => {
    e.preventDefault();
    setInviteMsg(null);
    if (!inviteData.email) return;
    setSubmittingInvite(true);
    try {
      const { data: newUser, error: invError } = await supabase.from('tenant_users').insert([{
        email: inviteData.email.trim(), 
        rol: inviteData.rol, 
        tenant_id: tenant.id, 
        auth_user_id: null,
      }]).select().single();
      
      if (invError) throw invError;

      const { data: scoreApp } = await supabase.from('apps').select('id').eq('slug', 'ltd-score').maybeSingle();
      if (scoreApp && newUser) {
        await supabase.from('user_apps').insert([{
          user_id: newUser.id,
          app_id: scoreApp.id
        }]);
      }

      setInviteMsg({ type: 'success', text: `Usuario ${inviteData.email} invitado con éxito.` });
      setInviteData({ email: '', rol: 'user' });
      setShowInviteForm(false);
      queryClient.invalidateQueries({ queryKey: ['admin_users'] });
    } catch (error) {
      console.error('Error inviting user:', error);
      setInviteMsg({ type: 'error', text: 'Error: ' + error.message });
    } finally {
      setSubmittingInvite(false);
    }
  };

  const handleDeleteUser = async (userId, userEmail) => {
    if (!window.confirm(`¿Eliminar al usuario ${userEmail}?`)) return;
    try {
      const { error } = await supabase.from('tenant_users').delete().eq('id', userId);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['admin_users'] });
    } catch (error) {
      console.error('Error deleting user:', error);
      alert('Error: ' + error.message);
    }
  };

  return (
    <div className="space-y-6 text-white text-left">
      <div>
        <h1 className="text-2xl font-bold">Gestión de Equipo</h1>
        <p className="text-[#c5c6ca] text-sm mt-1">Administra los usuarios con acceso a {tenant?.nombre}</p>
      </div>

      <div className="flex gap-1 border-b border-[#44474a]">
        <button className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white relative">
          <span className="material-symbols-outlined text-[16px]">group</span>
          Usuarios
          <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent rounded-t" />
        </button>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-[#c5c6ca] text-sm">{users.length} usuario{users.length !== 1 ? 's' : ''}</p>
          <button
            onClick={() => { setShowInviteForm(!showInviteForm); setInviteMsg(null); }}
            className="flex items-center gap-2 px-3 py-2 bg-accent hover:bg-accent-dim text-white rounded-lg transition-colors text-sm font-medium"
          >
            <span className="material-symbols-outlined text-[16px]">{showInviteForm ? 'close' : 'person_add'}</span>
            {showInviteForm ? 'Cancelar' : 'Invitar'}
          </button>
        </div>

        {inviteMsg && (
          <div className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm border ${
            inviteMsg.type === 'success' ? 'bg-green-500/10 text-green-400 border-green-500/30' : 'bg-red-500/10 text-red-400 border-red-500/30'
          }`}>
            <span className="material-symbols-outlined text-[16px]">{inviteMsg.type === 'success' ? 'check_circle' : 'error'}</span>
            {inviteMsg.text}
          </div>
        )}

        {showInviteForm && (
          <div className="bg-[#1c1b1c] border border-accent/20 rounded-lg p-5 animate-in fade-in slide-in-from-top-4 duration-300">
            <div className="flex items-start gap-3 mb-4 p-3 bg-accent/5 rounded-lg border border-accent/10">
              <span className="material-symbols-outlined text-accent text-[20px]">info</span>
              <div>
                <p className="text-white text-sm font-semibold">Flujo de Invitación Centralizado</p>
                <p className="text-[#c5c6ca] text-xs mt-0.5">
                  Para asegurar que los usuarios reciban su email de bienvenida y contraseña, te recomendamos realizar las invitaciones desde la 
                  <a href="/admin-central" className="text-accent hover:underline ml-1">App de Administración Central</a>.
                </p>
              </div>
            </div>
            <h3 className="text-white font-semibold mb-4">Invitar Nuevo Usuario</h3>
            <form onSubmit={handleInviteUser} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Email">
                  <input type="email" value={inviteData.email}
                    onChange={(e) => setInviteData({ ...inviteData, email: e.target.value })}
                    className={inputCls} placeholder="usuario@empresa.com" />
                </Field>
                <Field label="Rol">
                  <select value={inviteData.rol}
                    onChange={(e) => setInviteData({ ...inviteData, rol: e.target.value })}
                    className={inputCls}>
                    <option value="user">User</option>
                    <option value="admin">Admin</option>
                  </select>
                </Field>
              </div>
              <p className="text-[#c5c6ca] text-xs">El acceso a Scoring se otorgará automáticamente.</p>
              <div className="flex gap-2 pt-1">
                <button type="submit" disabled={submittingInvite} className="flex-1 py-2.5 bg-accent hover:bg-accent-dim text-white rounded-lg text-sm font-medium transition-colors">
                  {submittingInvite ? 'Invitando...' : 'Invitar'}
                </button>
                <button type="button" onClick={() => setShowInviteForm(false)} className="flex-1 py-2.5 bg-[#201f20] text-[#c5c6ca] border border-[#44474a] rounded-lg text-sm transition-colors">
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        )}

        {loadingUsers ? (
          <div className="flex flex-col items-center justify-center py-16"><Spinner /><p className="mt-4 text-sm text-[#c5c6ca]">Cargando...</p></div>
        ) : users.length === 0 ? (
          <div className="bg-[#1c1b1c] border border-[#44474a] rounded-lg p-12 text-center">
            <span className="material-symbols-outlined text-[48px] text-[#44474a] block mb-3">group</span>
            <p className="text-[#c5c6ca]">No hay miembros aún</p>
          </div>
        ) : (
          <div className="bg-[#1c1b1c] border border-[#44474a] rounded-lg overflow-hidden border-white/5">
            <table className="w-full">
              <thead className="border-b border-white/5 bg-white/[0.02]">
                <tr>
                  <th className="text-left text-xs font-black uppercase tracking-wider text-[#444] px-4 py-3">Email</th>
                  <th className="text-left text-xs font-black uppercase tracking-wider text-[#444] px-4 py-3">Rol</th>
                  <th className="text-left text-xs font-black uppercase tracking-wider text-[#444] px-4 py-3 hidden sm:table-cell">Se unió</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {users.filter(u => !!u).map(u => (
                  <tr key={u?.id || Math.random()} className="hover:bg-white/[0.02] transition-colors group">
                    <td className="px-4 py-3 text-left">
                      <p className="text-sm font-medium text-white">{u?.email || 'Sin email'}</p>
                      {!u?.auth_user_id && <p className="text-[#c5c6ca] text-[10px] mt-0.5">Pendiente de activación</p>}
                    </td>
                    <td className="px-4 py-3 text-left"><RoleBadge rol={u?.rol} /></td>
                    <td className="px-4 py-3 hidden sm:table-cell text-xs text-[#c5c6ca] text-left">
                      {u?.created_at ? new Date(u.created_at).toLocaleDateString('es-ES') : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button 
                        onClick={() => handleDeleteUser(u?.id, u?.email)} 
                        className="px-3 py-1.5 bg-red-500/10 text-red-500 rounded-lg text-[10px] font-black uppercase tracking-widest opacity-0 group-hover:opacity-100 hover:bg-red-500/20 transition-all"
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminPanelPage;
