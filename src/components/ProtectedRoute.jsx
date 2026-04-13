import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTenant } from 'core-saas'; // Inyectamos el hook del Core
import Spinner from './Spinner';

const ProtectedRoute = ({ children, adminOnly = false }) => {
  const { user, loading: authLoading } = useAuth();
  
  // Cargamos los datos del Tenant y Rol usando el nuevo motor
  const { 
    data: tenantData, 
    isLoading: tenantLoading, 
    isError 
  } = useTenant(user?.id, user?.email);

  if (authLoading || tenantLoading) return <Spinner />;
  if (!user) return <Navigate to="/login" />;
  if (isError) return <Navigate to="/login" />; // Si hay error, mejor re-autenticar

  const tenant = tenantData?.tenants;
  const userRole = tenantData?.rol;

  // Multi-tenant check: ¿Tiene la empresa permiso para esta app?
  // Basado en el catálogo que definimos (el slug para esta app es 'ltd_score')
  // Nota: Si el usuario es superadmin, saltamos la validación
  const hasSubscription = userRole === 'superadmin' || !!tenant;
  
  // Si no hay vinculación con empresa, denegar acceso
  if (!tenant && userRole !== 'superadmin') {
    return (
      <div className="min-h-screen bg-[#131313] flex items-center justify-center p-6 text-center">
        <div className="max-w-md w-full bg-[#1c1b1c] border border-[#44474a] rounded-2xl p-8 shadow-2xl">
          <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
            <span className="material-symbols-outlined text-red-400 text-[32px]">no_accounts</span>
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Acceso No Autorizado</h2>
          <p className="text-[#c5c6ca] text-sm mb-6">
            Tu cuenta no está vinculada a ninguna empresa activa. 
            Contacta con soporte para activar tu cuenta multi-tenant.
          </p>
          <a href="/login" className="inline-block px-6 py-2.5 bg-[#2a2a2a] hover:bg-[#333] text-white rounded-lg text-sm font-medium transition-colors">
            Volver al Login
          </a>
        </div>
      </div>
    );
  }

  // Verificación de rol de administrador
  if (adminOnly && !['admin','superadmin'].includes(userRole)) {
    return <Navigate to="/dashboard" />;
  }

  return children;
};

export default ProtectedRoute;
