import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
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

const PlanBadge = ({ plan }) => {
  const styles = {
    enterprise: 'bg-purple-500/15 text-purple-400',
    pro: 'bg-accent/15 text-accent',
    free: 'bg-[#2a2a2a] text-[#c5c6ca]',
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${styles[plan] ?? styles.free}`}>
      {plan?.toUpperCase() ?? '—'}
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
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('clientes');

  const [tenants, setTenants] = useState([]);
  const [loadingTenants, setLoadingTenants] = useState(true);

  const [showNewTenantForm, setShowNewTenantForm] = useState(false);
  const [formData, setFormData] = useState({ name: '', email: '', plan: 'pro' });
  const [apiToken, setApiToken] = useState('');
  const [selectedTenant, setSelectedTenant] = useState(null);
  const [submittingTenant, setSubmittingTenant] = useState(false);

  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteData, setInviteData] = useState({ email: '', rol: 'user', tenant_id: '' });
  const [submittingInvite, setSubmittingInvite] = useState(false);
  const [inviteMsg, setInviteMsg] = useState(null);

  useEffect(() => { fetchTenants(); }, []);
  useEffect(() => { if (activeTab === 'usuarios') fetchUsers(); }, [activeTab]);

  const fetchTenants = async () => {
    setLoadingTenants(true);
    try {
      const { data } = await supabase.from('tenants').select('*').order('created_at', { ascending: false });
      setTenants(data || []);
    } catch (error) {
      console.error('Error fetching tenants:', error);
    } finally {
      setLoadingTenants(false);
    }
  };

  const fetchUsers = async () => {
    setLoadingUsers(true);
    try {
      const { data, error } = await supabase
        .from('tenant_users')
        .select('id, email, rol, tenant_id, auth_user_id, created_at, tenants(nombre)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setUsers(data || []);
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleCreateTenant = async (e) => {
    e.preventDefault();
    if (!formData.name || !formData.email || !apiToken) {
      alert('Por favor completa todos los campos');
      return;
    }
    setSubmittingTenant(true);
    try {
      const { data: newTenant, error: createError } = await supabase
        .from('tenants')
        .insert([{ nombre: formData.name, email: formData.email, plan: formData.plan, hubspot_access_token: apiToken, created_by: user?.id }])
        .select().single();
      if (createError) throw createError;
      if (newTenant) {
        await supabase.from('scoring_matrices').insert([{
          tenant_id: newTenant.id, name: 'Matriz por defecto', active: true, description: 'Matriz de scoring inicial',
        }]);
      }
      setFormData({ name: '', email: '', plan: 'pro' });
      setApiToken('');
      setShowNewTenantForm(false);
      await fetchTenants();
    } catch (error) {
      console.error('Error creating tenant:', error);
      alert('Error al crear tenant: ' + error.message);
    } finally {
      setSubmittingTenant(false);
    }
  };

  const handleUpdateToken = async (tenantId, newToken) => {
    try {
      await supabase.from('tenants').update({ hubspot_access_token: newToken }).eq('id', tenantId);
      await fetchTenants();
      setSelectedTenant(null);
    } catch (error) {
      console.error('Error updating token:', error);
      alert('Error al actualizar token');
    }
  };

  const handleDeleteTenant = async (tenantId) => {
    if (!window.confirm('¿Estás seguro? Esta acción no se puede deshacer.')) return;
    try {
      await supabase.from('tenants').delete().eq('id', tenantId);
      await fetchTenants();
    } catch (error) {
      console.error('Error deleting tenant:', error);
      alert('Error al eliminar tenant');
    }
  };

  const handleInviteUser = async (e) => {
    e.preventDefault();
    setInviteMsg(null);
    if (!inviteData.email || !inviteData.tenant_id) {
      setInviteMsg({ type: 'error', text: 'Email y tenant son obligatorios.' });
      return;
    }
    setSubmittingInvite(true);
    try {
      const { error } = await supabase.from('tenant_users').insert([{
        email: inviteData.email, rol: inviteData.rol, tenant_id: inviteData.tenant_id, auth_user_id: null,
      }]);
      if (error) throw error;
      setInviteMsg({ type: 'success', text: `Usuario ${inviteData.email} invitado. Se vinculará al iniciar sesión.` });
      setInviteData({ email: '', rol: 'user', tenant_id: '' });
      setShowInviteForm(false);
      await fetchUsers();
    } catch (error) {
      console.error('Error inviting user:', error);
      setInviteMsg({ type: 'error', text: 'Error al invitar usuario: ' + error.message });
    } finally {
      setSubmittingInvite(false);
    }
  };

  const handleDeleteUser = async (userId, userEmail) => {
    if (!window.confirm(`¿Eliminar al usuario ${userEmail}?`)) return;
    try {
      const { error } = await supabase.from('tenant_users').delete().eq('id', userId);
      if (error) throw error;
      await fetchUsers();
    } catch (error) {
      console.error('Error deleting user:', error);
      alert('Error al eliminar usuario: ' + error.message);
    }
  };

  if (loadingTenants) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center">
        <Spinner />
        <p className="mt-4 text-sm text-[#c5c6ca]">Cargando panel...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Panel de Admin</h1>
        <p className="text-[#c5c6ca] text-sm mt-1">Gestiona clientes, suscripciones y usuarios</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-[#44474a]">
        {[
          { key: 'clientes', icon: 'business', label: 'Clientes' },
          { key: 'usuarios', icon: 'group', label: 'Usuarios' },
        ].map(({ key, icon, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors relative ${
              activeTab === key ? 'text-white' : 'text-[#c5c6ca] hover:text-white'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">{icon}</span>
            {label}
            {activeTab === key && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent rounded-t" />
            )}
          </button>
        ))}
      </div>

      {/* ── CLIENTES ── */}
      {activeTab === 'clientes' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-[#c5c6ca] text-sm">{tenants.length} cliente{tenants.length !== 1 ? 's' : ''}</p>
            <button
              onClick={() => setShowNewTenantForm(!showNewTenantForm)}
              className="flex items-center gap-2 px-3 py-2 bg-accent hover:bg-accent-dim text-white rounded-lg transition-colors text-sm font-medium"
            >
              <span className="material-symbols-outlined text-[16px]">{showNewTenantForm ? 'close' : 'add'}</span>
              {showNewTenantForm ? 'Cancelar' : 'Nuevo Cliente'}
            </button>
          </div>

          {showNewTenantForm && (
            <div className="bg-[#1c1b1c] border border-[#44474a] rounded-lg p-5">
              <h3 className="text-white font-semibold mb-4">Crear Nuevo Cliente</h3>
              <form onSubmit={handleCreateTenant} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Nombre de la Empresa">
                    <input type="text" value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className={inputCls} placeholder="Acme Corp" />
                  </Field>
                  <Field label="Email">
                    <input type="email" value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className={inputCls} placeholder="contacto@acme.com" />
                  </Field>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Plan">
                    <select value={formData.plan}
                      onChange={(e) => setFormData({ ...formData, plan: e.target.value })}
                      className={inputCls}>
                      <option value="free">Free</option>
                      <option value="pro">Pro</option>
                      <option value="enterprise">Enterprise</option>
                    </select>
                  </Field>
                  <Field label="HubSpot Private App Token">
                    <input type="password" value={apiToken}
                      onChange={(e) => setApiToken(e.target.value)}
                      className={inputCls + ' font-mono'} placeholder="pat-*..." />
                  </Field>
                </div>
                <p className="text-[#c5c6ca] text-xs">Token privado del cliente — nunca se comparte públicamente</p>
                <div className="flex gap-2 pt-1">
                  <button type="submit" disabled={submittingTenant}
                    className="flex-1 py-2.5 bg-accent hover:bg-accent-dim text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-colors">
                    {submittingTenant ? 'Creando...' : 'Crear Cliente'}
                  </button>
                  <button type="button" onClick={() => setShowNewTenantForm(false)}
                    className="flex-1 py-2.5 bg-[#201f20] hover:bg-[#2a2a2a] text-[#c5c6ca] border border-[#44474a] rounded-lg text-sm transition-colors">
                    Cancelar
                  </button>
                </div>
              </form>
            </div>
          )}

          {tenants.length === 0 ? (
            <div className="bg-[#1c1b1c] border border-[#44474a] rounded-lg p-12 text-center">
              <span className="material-symbols-outlined text-[48px] text-[#44474a] block mb-3">business</span>
              <p className="text-[#c5c6ca]">No hay clientes aún</p>
            </div>
          ) : (
            <div className="space-y-3">
              {tenants.map(tenant => (
                <div key={tenant.id} className="bg-[#1c1b1c] border border-[#44474a] rounded-lg overflow-hidden">
                  <div className="p-4 flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-white font-semibold">{tenant.nombre}</h3>
                        <PlanBadge plan={tenant.plan} />
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          tenant.hubspot_access_token ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'
                        }`}>
                          {tenant.hubspot_access_token ? 'Token ✓' : 'Sin token'}
                        </span>
                      </div>
                      <p className="text-[#c5c6ca] text-xs mt-1">{tenant.email}</p>
                      <p className="text-[#44474a] text-xs mt-0.5">
                        ID {String(tenant.id).slice(0, 8)} · Creado {new Date(tenant.created_at).toLocaleDateString('es-ES')}
                      </p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => setSelectedTenant(selectedTenant?.id === tenant.id ? null : tenant)}
                        className="px-3 py-1.5 bg-[#201f20] hover:bg-[#2a2a2a] text-[#c5c6ca] hover:text-white border border-[#44474a] rounded text-xs transition-colors"
                      >
                        {selectedTenant?.id === tenant.id ? 'Cerrar' : 'Editar token'}
                      </button>
                      <button
                        onClick={() => handleDeleteTenant(tenant.id)}
                        className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded text-xs transition-colors"
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>

                  {selectedTenant?.id === tenant.id && (
                    <div className="px-4 pb-4 pt-2 border-t border-[#44474a] space-y-2">
                      <input
                        type="password"
                        defaultValue={tenant.hubspot_access_token}
                        id={`token-${tenant.id}`}
                        className={inputCls + ' font-mono text-xs'}
                        placeholder="pat-*..."
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            const newToken = document.getElementById(`token-${tenant.id}`).value;
                            handleUpdateToken(tenant.id, newToken);
                          }}
                          className="flex-1 py-2 bg-green-500/10 hover:bg-green-500/20 text-green-400 rounded text-xs font-medium transition-colors"
                        >
                          Guardar
                        </button>
                        <button
                          onClick={() => setSelectedTenant(null)}
                          className="flex-1 py-2 bg-[#201f20] hover:bg-[#2a2a2a] text-[#c5c6ca] border border-[#44474a] rounded text-xs transition-colors"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── USUARIOS ── */}
      {activeTab === 'usuarios' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-[#c5c6ca] text-sm">{users.length} usuario{users.length !== 1 ? 's' : ''}</p>
            <button
              onClick={() => { setShowInviteForm(!showInviteForm); setInviteMsg(null); }}
              className="flex items-center gap-2 px-3 py-2 bg-accent hover:bg-accent-dim text-white rounded-lg transition-colors text-sm font-medium"
            >
              <span className="material-symbols-outlined text-[16px]">{showInviteForm ? 'close' : 'person_add'}</span>
              {showInviteForm ? 'Cancelar' : 'Invitar Usuario'}
            </button>
          </div>

          {inviteMsg && (
            <div className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm border ${
              inviteMsg.type === 'success'
                ? 'bg-green-500/10 text-green-400 border-green-500/30'
                : 'bg-red-500/10 text-red-400 border-red-500/30'
            }`}>
              <span className="material-symbols-outlined text-[16px]">
                {inviteMsg.type === 'success' ? 'check_circle' : 'error'}
              </span>
              {inviteMsg.text}
            </div>
          )}

          {showInviteForm && (
            <div className="bg-[#1c1b1c] border border-[#44474a] rounded-lg p-5">
              <h3 className="text-white font-semibold mb-4">Invitar Nuevo Usuario</h3>
              <form onSubmit={handleInviteUser} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                  <Field label="Tenant">
                    <select value={inviteData.tenant_id}
                      onChange={(e) => setInviteData({ ...inviteData, tenant_id: e.target.value })}
                      className={inputCls}>
                      <option value="">Selecciona un tenant...</option>
                      {tenants.map(t => (
                        <option key={t.id} value={t.id}>{t.nombre}</option>
                      ))}
                    </select>
                  </Field>
                </div>
                <p className="text-[#c5c6ca] text-xs">El auth_user_id se vinculará automáticamente al primer inicio de sesión.</p>
                <div className="flex gap-2 pt-1">
                  <button type="submit" disabled={submittingInvite}
                    className="flex-1 py-2.5 bg-accent hover:bg-accent-dim text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-colors">
                    {submittingInvite ? 'Invitando...' : 'Invitar Usuario'}
                  </button>
                  <button type="button" onClick={() => setShowInviteForm(false)}
                    className="flex-1 py-2.5 bg-[#201f20] hover:bg-[#2a2a2a] text-[#c5c6ca] border border-[#44474a] rounded-lg text-sm transition-colors">
                    Cancelar
                  </button>
                </div>
              </form>
            </div>
          )}

          {loadingUsers ? (
            <div className="flex flex-col items-center justify-center py-16">
              <Spinner />
              <p className="mt-4 text-sm text-[#c5c6ca]">Cargando usuarios...</p>
            </div>
          ) : users.length === 0 ? (
            <div className="bg-[#1c1b1c] border border-[#44474a] rounded-lg p-12 text-center">
              <span className="material-symbols-outlined text-[48px] text-[#44474a] block mb-3">group</span>
              <p className="text-[#c5c6ca]">No hay usuarios aún</p>
            </div>
          ) : (
            <div className="bg-[#1c1b1c] border border-[#44474a] rounded-lg overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#44474a]">
                    <th className="text-left text-xs font-medium text-[#c5c6ca] px-4 py-3 uppercase tracking-wider">Email</th>
                    <th className="text-left text-xs font-medium text-[#c5c6ca] px-4 py-3 uppercase tracking-wider">Rol</th>
                    <th className="text-left text-xs font-medium text-[#c5c6ca] px-4 py-3 uppercase tracking-wider hidden md:table-cell">Tenant</th>
                    <th className="text-left text-xs font-medium text-[#c5c6ca] px-4 py-3 uppercase tracking-wider hidden sm:table-cell">Creado</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#44474a]/50">
                  {users.map(u => (
                    <tr key={u.id} className="hover:bg-[#201f20] transition-colors">
                      <td className="px-4 py-3">
                        <p className="text-white text-sm">{u.email}</p>
                        {!u.auth_user_id && (
                          <p className="text-[#c5c6ca] text-xs mt-0.5">Pendiente de activar</p>
                        )}
                      </td>
                      <td className="px-4 py-3"><RoleBadge rol={u.rol} /></td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span className="text-[#c5c6ca] text-sm">{u.tenants?.nombre ?? '—'}</span>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <span className="text-[#c5c6ca] text-xs">{new Date(u.created_at).toLocaleDateString('es-ES')}</span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleDeleteUser(u.id, u.email)}
                          className="px-2 py-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded text-xs transition-colors"
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
      )}
    </div>
  );
};

export default AdminPanelPage;
