import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Spinner from './Spinner';

const ProtectedRoute = ({ children, adminOnly = false }) => {
  const { user, userRole, loading } = useAuth();

  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login" />;
  if (adminOnly && !['admin','superadmin'].includes(userRole)) return <Navigate to="/dashboard" />;

  return children;
};

export default ProtectedRoute;
