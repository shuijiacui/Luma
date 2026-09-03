import { useNavigate } from 'react-router-dom'

import { Brand } from '@/components/brand'
import { Button, Card } from '@/components/ui'
import { AvatarPicker } from '@/features/profile/components/AvatarPicker'
import { useAuth } from '../AuthContext'

export function ChildDemoPage() {
  const navigate = useNavigate()
  const { session, logout } = useAuth()

  function handleLogout() {
    logout()
    navigate('/auth?role=child&mode=login')
  }

  return (
    <main className="relative min-h-screen overflow-x-hidden bg-luma-teal-50 px-5 py-6">
      <div
        className="absolute top-20 -left-24 size-80 rounded-full bg-luma-gold-100/60 blur-3xl"
        aria-hidden="true"
      />
      <header className="relative z-50 mx-auto flex max-w-6xl items-center justify-between rounded-luma-md border border-white/70 bg-white/70 px-5 py-3 shadow-luma-sm backdrop-blur-xl">
        <Brand size="md" />
        <div className="flex items-center gap-2">
          <div className="hidden text-right sm:block">
            <div className="text-sm font-bold text-luma-teal-900">
              {session?.displayName}
            </div>
            <div className="text-xs text-luma-muted">我的头像</div>
          </div>
          <AvatarPicker
            userId={session?.id ?? 'guest-child'}
            compact
          />
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            下次见
          </Button>
        </div>
      </header>

      <section className="relative z-0 mx-auto max-w-5xl py-14 text-center">
        {session?.isGuest && (
          <div className="mx-auto mb-7 w-fit rounded-full bg-luma-gold-100 px-4 py-2 text-sm font-semibold text-luma-gold-700">
            正在体验模式中 · 作品不会保存
          </div>
        )}
        <div className="luma-eyebrow text-luma-gold-700">Nilo 在等你</div>
        <h1 className="luma-heading-1 mt-3 text-luma-teal-900">
          嗨，{session?.displayName}！
        </h1>
        <p className="luma-body-lg mx-auto mt-4 max-w-xl text-luma-muted">
          今天要画一颗会唱歌的星星，还是讲一个藏在云朵里的故事？
        </p>

        <div className="mt-10 grid gap-5 text-left sm:grid-cols-2">
          <Card
            title="画一个新世界"
            description="打开画布，让颜色带你去任何地方。"
            variant="glass"
            interactive
            className="min-h-56"
          >
            <div className="flex items-end justify-between gap-4">
              <span className="text-5xl" aria-hidden="true">
                ✦
              </span>
              <Button
                variant="primary"
                onClick={() => navigate('/child/create')}
              >
                打开画布
              </Button>
            </div>
          </Card>
          <Card
            title="讲一个新故事"
            description="告诉 Nilo 一个开头，一起看看故事会去哪里。"
            variant="soft"
            interactive
            className="min-h-56"
          >
            <span className="text-5xl" aria-hidden="true">
              ◡
            </span>
          </Card>
        </div>
      </section>
    </main>
  )
}
