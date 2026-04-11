import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signIn(email, password);
      navigate('/dashboard');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#131313] flex items-center justify-center p-4">
      {/* Atmospheric blobs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-accent/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-purple-500/5 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-accent rounded-xl mb-4">
            <span className="material-symbols-outlined text-white text-[24px]">trending_up</span>
          </div>
          <h1 className="text-2xl font-bold text-white">LeadsToDeals</h1>
          <p className="text-[#c5c6ca] text-sm mt-1">Deal Intelligence Platform</p>
        </div>

        {/* Card */}
        <div className="bg-[#1c1b1c] border border-[#44474a] rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-5">Iniciar sesión</h2>

          {error && (
            <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 mb-4">
              <span className="material-symbols-outlined text-red-400 text-[16px]">error</span>
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[#c5c6ca] text-xs font-medium mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2.5 bg-[#131313] border border-[#44474a] rounded-lg text-white placeholder-[#44474a] focus:outline-none focus:border-accent text-sm transition-colors"
                placeholder="tu@empresa.com"
                required
              />
            </div>
            <div>
              <label className="block text-[#c5c6ca] text-xs font-medium mb-1.5">Contraseña</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2.5 bg-[#131313] border border-[#44474a] rounded-lg text-white placeholder-[#44474a] focus:outline-none focus:border-accent text-sm transition-colors"
                placeholder="••••••••"
                required
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-accent hover:bg-accent-dim disabled:opacity-50 text-white font-medium rounded-lg transition-colors text-sm flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <span className="material-symbols-outlined text-[16px] animate-spin">refresh</span>
                  Entrando...
                </>
              ) : (
                'Entrar'
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-[#44474a] text-xs mt-6">
          LeadsToDeals © {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
};

export default LoginPage;
