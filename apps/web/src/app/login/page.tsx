'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiClient } from '../../lib/api-client';
import { AuthSession } from '@crosspilot/shared';
import { ThemeToggle } from '../../components/theme-toggle';
import { Button } from '../../components/ui/button';
import { Input, Label } from '../../components/ui/input';
import { InlineError } from '../../components/ui/skeleton';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('demo@crosspilot.com');
  const [password, setPassword] = useState('crosspilot123');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const goIn = (session: AuthSession) => {
    ApiClient.setSession(
      session.token,
      session.activeWorkspace?.id,
      session.activeWorkspace?.role,
    );
    router.push('/app/operations/today');
  };

  const handleDemoLogin = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const session = await ApiClient.post<AuthSession>('/api/v1/auth/demo-login', {
        role: 'OWNER',
      });
      goIn(session);
    } catch (err: any) {
      setError(err.message || '演示登录失败，请检查服务状态');
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
      goIn(session);
    } catch (err: any) {
      setError(err.message || '登录失败，请检查账号密码');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-[100dvh] flex-col items-center justify-center bg-background p-4">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight text-fg">CrossPilot</h1>
          <p className="mt-1 text-sm text-fg-muted">Amazon 卖家日常运营与决策台</p>
        </div>

        {error ? <div className="mb-4"><InlineError message={error} /></div> : null}

        <Button
          onClick={handleDemoLogin}
          disabled={isLoading}
          className="w-full py-2.5"
        >
          {isLoading ? '正在进入…' : '进入演示工作区'}
        </Button>
        <p className="mt-2 text-center text-[12px] text-fg-muted">
          默认工作区：CrossPilot 演示工作区（美国站）
        </p>

        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-[12px]">
            <span className="bg-background px-3 text-fg-muted">或使用账号登录</span>
          </div>
        </div>

        <form onSubmit={handleStandardLogin} className="space-y-3">
          <div>
            <Label htmlFor="email">登录邮箱</Label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="demo@crosspilot.com"
            />
          </div>
          <div>
            <Label htmlFor="password">登录密码</Label>
            <Input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <Button type="submit" variant="secondary" disabled={isLoading} className="w-full">
            {isLoading ? '正在验证…' : '登录'}
          </Button>
        </form>
      </div>
    </div>
  );
}
