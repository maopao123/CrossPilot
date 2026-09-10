'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiClient } from '../../lib/api-client';
import { AuthSession } from '@crosspilot/shared';
import { Shield, Sparkles, ArrowRight, Lock, Mail } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('demo@crosspilot.com');
  const [password, setPassword] = useState('crosspilot123');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDemoLogin = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const session = await ApiClient.post<AuthSession>('/api/v1/auth/demo-login', {
        role: 'OWNER',
      });
      ApiClient.setSession(session.token, session.activeWorkspace?.id);
      router.push('/app/overview');
    } catch (err: any) {
      setError(err.message || 'Demo login failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleStandardLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const session = await ApiClient.post<AuthSession>('/api/v1/auth/login', {
        email,
        password,
      });
      ApiClient.setSession(session.token, session.activeWorkspace?.id);
      router.push('/app/overview');
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-background">
      <div className="w-full max-w-md bg-surface border border-border rounded-xl p-8 shadow-2xl">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-blue-600 text-white font-bold text-xl mb-3 shadow-lg shadow-blue-500/20">
            CP
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">CrossPilot</h1>
          <p className="text-sm text-gray-400 mt-1">
            AI Cross-border Operations Platform
          </p>
        </div>

        {error && (
          <div className="mb-6 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-xs">
            {error}
          </div>
        )}

        {/* 1-Click Demo Login (V9 Section 253) */}
        <div className="mb-6">
          <button
            onClick={handleDemoLogin}
            disabled={isLoading}
            className="w-full flex items-center justify-center space-x-2 py-3 px-4 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold text-sm transition shadow-lg shadow-blue-600/25 disabled:opacity-50"
          >
            <Sparkles className="w-4 h-4 text-amber-300" />
            <span>{isLoading ? 'Entering Platform...' : '进入演示工作区 (1-Click Demo Login)'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
          <p className="text-[11px] text-gray-500 text-center mt-2">
            Default workspace: CrossPilot Demo (Amazon US)
          </p>
        </div>

        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-border"></div>
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-surface px-3 text-gray-500 uppercase tracking-wider">
              或者使用账号登录
            </span>
          </div>
        </div>

        {/* Standard Email/Password Form */}
        <form onSubmit={handleStandardLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1.5">
              Email
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-gray-500 absolute left-3 top-3" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="demo@crosspilot.com"
                className="w-full bg-surface-elevated border border-border rounded-lg pl-9 pr-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 transition"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1.5">
              Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-gray-500 absolute left-3 top-3" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-surface-elevated border border-border rounded-lg pl-9 pr-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 transition"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-2.5 px-4 rounded-lg bg-surface-elevated hover:bg-gray-800 border border-border text-white text-sm font-medium transition disabled:opacity-50"
          >
            {isLoading ? 'Authenticating...' : 'Sign In'}
          </button>
        </form>

        <div className="mt-8 text-center text-[11px] text-gray-500 flex items-center justify-center space-x-1">
          <Shield className="w-3.5 h-3.5 text-gray-500" />
          <span>CrossPilot Monorepo V9 • Multi-tenant Protected</span>
        </div>
      </div>
    </div>
  );
}
