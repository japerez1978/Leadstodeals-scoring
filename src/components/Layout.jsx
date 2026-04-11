import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const NavItem = ({ to, icon, label, active }) => (
  <Link
    to={to}
    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-sm font-medium ${
      active
        ? 'bg-[#2a2a2a] text-white'
        : 'text-[#c5c6ca] hover:bg-[#201f20] hover:text-white'
    }`}
  >
    <span className="material-symbols-outlined text-[20px]">{icon}</span>
    <span>{label}</span>
  </Link>
);

const Layout = ({ children }) => {
  const { user, tenant, userRole, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const isActive = (path) => location.pathname === path || location.pathname.startsWith(path + '/');

  return (
    <div className="min-h-screen bg-[#131313] text-[#e5e2e1] flex">
      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-40 w-60 bg-[#1c1b1c] border-r border-[#44474a] flex flex-col transition-transform duration-300 ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      } lg:translate-x-0 lg:static lg:flex`}>
        {/* Logo */}
        <div className="p-4 border-b border-[#44474a]">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-accent rounded-md flex items-center justify-center">
              <span className="material-symbols-outlined text-white text-[16px]">trending_up</span>
            </div>
            <span className="font-semibold text-white text-sm">LeadsToDeals</span>
          </div>
          {tenant && (
            <p className="text-[#c5c6ca] text-xs mt-1 truncate">{tenant.nombre}</p>
          )}
        </div>

        {/* Nav links */}
        <nav className="flex-1 p-3 space-y-1">
          <NavItem to="/dashboard" icon="dashboard" label="Dashboard" active={isActive('/dashboard')} />
          <NavItem to="/scoring" icon="tune" label="Scoring Config" active={isActive('/scoring')} />
          {['admin', 'superadmin'].includes(userRole) && (
            <NavItem to="/admin" icon="admin_panel_settings" label="Admin" active={isActive('/admin')} />
          )}
        </nav>

        {/* Footer */}
        <div className="p-3 border-t border-[#44474a]">
          <div className="flex items-center gap-2 px-3 py-2 mb-1">
            <div className="w-7 h-7 bg-[#2a2a2a] rounded-full flex items-center justify-center">
              <span className="material-symbols-outlined text-[#c5c6ca] text-[16px]">person</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-xs font-medium truncate">{user?.email?.split('@')[0]}</p>
              <p className="text-[#c5c6ca] text-[10px] truncate capitalize">{userRole}</p>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="flex items-center gap-2 px-3 py-2 w-full text-[#c5c6ca] hover:text-white hover:bg-[#201f20] rounded-lg transition-colors text-sm"
          >
            <span className="material-symbols-outlined text-[18px]">logout</span>
            <span>Salir</span>
          </button>
        </div>
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar (mobile) */}
        <header className="lg:hidden flex items-center gap-3 px-4 py-3 bg-[#1c1b1c] border-b border-[#44474a]">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-[#c5c6ca] hover:text-white"
          >
            <span className="material-symbols-outlined">menu</span>
          </button>
          <span className="font-semibold text-white text-sm">LeadsToDeals</span>
        </header>

        <main className="flex-1 p-6 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
};

export default Layout;
