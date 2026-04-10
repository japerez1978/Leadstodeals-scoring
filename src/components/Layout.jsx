import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const Layout = ({ children }) => {
  const { user, tenant, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-background text-text">
      <header className="bg-card border-b border-border p-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center space-x-4">
            <h1 className="text-xl font-bold text-accent">LeadsToDeals Scoring</h1>
            {tenant && <span className="text-sm text-text">{tenant.nombre}</span>}
          </div>
          <div className="flex items-center space-x-4">
            <Link to="/dashboard" className="text-accent hover:underline">Dashboard</Link>
            {user && user.user_metadata?.role === 'admin' && (
              <Link to="/scoring" className="text-accent hover:underline">Scoring</Link>
            )}
            <button onClick={handleSignOut} className="text-accent hover:underline">Logout</button>
          </div>
        </div>
      </header>
      <main className="p-4">
        {children}
      </main>
    </div>
  );
};

export default Layout;