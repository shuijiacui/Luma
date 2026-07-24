import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'

import { Button } from '@/components/ui'
import { cn } from '@/lib/cn'
import { useAuth } from '../AuthContext'
import { AuthShell } from '../components/AuthShell'
import { FormField } from '../components/FormField'
import { GuestDivider } from '../components/GuestDivider'
import type { UserRole } from '../types'

type AuthMode = 'login' | 'register'

export function UnifiedAuthPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { session, loginParent, registerParent, loginChild, registerChild, continueAsGuest } =
    useAuth()

  const role: UserRole =
    searchParams.get('role') === 'child' ? 'child' : 'parent'
  const mode: AuthMode =
    searchParams.get('mode') === 'register' ? 'register' : 'login'

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [nickname, setNickname] = useState('')
  const [creationCode, setCreationCode] = useState('')
  const [confirmCode, setConfirmCode] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [error, setError] = useState('')

  if (session) return <Navigate to={`/${session.role}/demo`} replace />

  function switchPanel(nextRole: UserRole, nextMode: AuthMode = mode) {
    setError('')
    setSearchParams({ role: nextRole, mode: nextMode })
  }

  function updateCreationCode(value: string, target: 'main' | 'confirm') {
    const nextValue = value.replace(/\D/g, '').slice(0, 4)
    if (target === 'main') setCreationCode(nextValue)
    else setConfirmCode(nextValue)
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError('')

    if (role === 'parent' && mode === 'login') {
      const result = loginParent(email, password)
      if (!result.ok) return setError(result.message ?? '登录失败。')
      return navigate('/parent/demo')
    }

    if (role === 'parent' && mode === 'register') {
      if (password.length < 6) return setError('密码至少需要 6 位。')
      if (password !== confirmPassword) {
        return setError('两次输入的密码不一致。')
      }
      const result = registerParent({ name, email, password })
      if (!result.ok) return setError(result.message ?? '注册失败。')
      return navigate('/parent/demo')
    }

    if (role === 'child' && mode === 'login') {
      const result = loginChild(nickname, creationCode)
      if (!result.ok) return setError(result.message ?? '还差一点，再试试吧。')
      return navigate('/child/demo')
    }

    if (!/^\d{4}$/.test(creationCode)) {
      return setError('请设置 4 个数字组成的创作码。')
    }
    if (creationCode !== confirmCode) {
      return setError('两个创作码不一样，再看一眼吧。')
    }
    const result = registerChild({ nickname, creationCode, inviteCode })
    if (!result.ok) return setError(result.message ?? '还差一点，再试试吧。')
    return navigate('/child/demo')
  }

  function handleGuest() {
    continueAsGuest(role)
    navigate(`/${role}/demo`)
  }

  const isParent = role === 'parent'
  const isLogin = mode === 'login'

  return (
    <AuthShell
      role={role}
      eyebrow="一个入口 · 两个专属空间"
      title={isLogin ? '欢迎回到 Luma' : '开启 Luma 旅程'}
      description={
        isParent
          ? '进入家长空间，温柔地陪伴每一次成长。'
          : '进入你的创作空间，Nilo 已经准备好啦。'
      }
    >
      <div
        className="mb-5 grid grid-cols-2 rounded-2xl bg-luma-ivory-100 p-1"
        aria-label="选择使用身份"
      >
        <button
          type="button"
          onClick={() => switchPanel('parent')}
          aria-pressed={isParent}
          className={cn(
            'min-h-11 rounded-xl px-3 text-sm font-bold outline-none transition-all focus-visible:ring-3 focus-visible:ring-luma-gold-300/60',
            isParent
              ? 'bg-white text-luma-teal-900 shadow-luma-sm'
              : 'text-luma-muted hover:text-luma-teal-700',
          )}
        >
          家长
        </button>
        <button
          type="button"
          onClick={() => switchPanel('child')}
          aria-pressed={!isParent}
          className={cn(
            'min-h-11 rounded-xl px-3 text-sm font-bold outline-none transition-all focus-visible:ring-3 focus-visible:ring-luma-gold-300/60',
            !isParent
              ? 'bg-white text-luma-teal-900 shadow-luma-sm'
              : 'text-luma-muted hover:text-luma-teal-700',
          )}
        >
          小小创作者
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {isParent ? (
          <>
            {!isLogin && (
              <FormField
                label="你的称呼"
                autoComplete="name"
                placeholder="例如：Nilo 妈妈"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
              />
            )}
            <FormField
              label="邮箱"
              type="email"
              autoComplete="email"
              placeholder="name@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
            <FormField
              label={isLogin ? '密码' : '设置密码'}
              type="password"
              autoComplete={isLogin ? 'current-password' : 'new-password'}
              placeholder={isLogin ? '输入密码' : '至少 6 位'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={6}
            />
            {!isLogin && (
              <FormField
                label="确认密码"
                type="password"
                autoComplete="new-password"
                placeholder="再次输入密码"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
                minLength={6}
              />
            )}
          </>
        ) : (
          <>
            {!isLogin && (
              <FormField
                label="家庭邀请码"
                autoComplete="off"
                placeholder="输入你的小钥匙"
                value={inviteCode}
                onChange={(event) =>
                  setInviteCode(event.target.value.toUpperCase().slice(0, 9))
                }
                required
                minLength={6}
                maxLength={9}
                hint="这是进入你的家庭空间的小钥匙"
                className="text-center font-semibold tracking-[0.18em] uppercase"
              />
            )}
            <FormField
              label="我的昵称"
              autoComplete="username"
              placeholder={isLogin ? '你喜欢的名字' : '例如：星星船长'}
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
              required
              minLength={isLogin ? undefined : 2}
              maxLength={16}
            />
            <FormField
              label={isLogin ? '4 位创作码' : '设置 4 位创作码'}
              type="password"
              inputMode="numeric"
              autoComplete={isLogin ? 'current-password' : 'new-password'}
              placeholder="••••"
              value={creationCode}
              onChange={(event) =>
                updateCreationCode(event.target.value, 'main')
              }
              required
              pattern="\d{4}"
              maxLength={4}
              className="text-center text-xl tracking-[0.5em]"
            />
            {!isLogin && (
              <FormField
                label="再输一次创作码"
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
                placeholder="••••"
                value={confirmCode}
                onChange={(event) =>
                  updateCreationCode(event.target.value, 'confirm')
                }
                required
                pattern="\d{4}"
                maxLength={4}
                className="text-center text-xl tracking-[0.5em]"
              />
            )}
          </>
        )}

        {error && (
          <div
            role="alert"
            className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {error}
          </div>
        )}

        <Button
          type="submit"
          variant={!isParent ? 'gold' : 'primary'}
          size="lg"
          className="w-full"
        >
          {isLogin
            ? isParent
              ? '登录家长空间'
              : '去找 Nilo'
            : isParent
              ? '创建并进入'
              : '开启我的小天地'}
        </Button>
      </form>

      <p className="mt-5 text-center text-sm text-luma-muted">
        {isLogin ? '还没有账号？' : '已经有账号？'}{' '}
        <button
          type="button"
          onClick={() => switchPanel(role, isLogin ? 'register' : 'login')}
          className="font-semibold text-luma-teal-700 hover:underline"
        >
          {isLogin ? '立即注册' : '返回登录'}
        </button>
      </p>

      {isLogin && (
        <>
          <GuestDivider />
          <Button
            variant="secondary"
            size="lg"
            className="w-full"
            onClick={handleGuest}
          >
            {isParent ? '游客体验家长端' : '先去逛一逛'}
          </Button>
          <p className="mt-3 text-center text-xs text-luma-muted">
            游客模式中的内容不会保存
          </p>
        </>
      )}
    </AuthShell>
  )
}
