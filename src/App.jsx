import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import ScoringDetailPage from './pages/ScoringDetailPage';
import ScoringPage from './pages/ScoringPage';
import AdminPanelPage from './pages/AdminPanelPage';
import DemoDetailPage from './pages/DemoDetailPage';

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Layout>
                  <DashboardPage />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/deal/:dealId"
            element={
              <ProtectedRoute>
                <Layout>
                  <ScoringDetailPage />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/scoring"
            element={
              <ProtectedRoute>
                <Layout>
                  <ScoringPage />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin"
            element={
              <ProtectedRoute adminOnly>
                <Layout>
                  <AdminPanelPage />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route path="/demo" element={<DemoDetailPage />} />
          <Route path="/" element={<Navigate to="/dashboard" />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
