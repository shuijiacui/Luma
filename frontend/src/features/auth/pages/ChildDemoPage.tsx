import { useNavigate } from 'react-router-dom'

import { Brand } from '@/components/brand'
import { Button, Card } from '@/components/ui'
import bgChild from '@/assets/images/bg-child.png'
import helloGif from '@/assets/images/hello.gif'
import { AvatarPicker } from '@/features/profile/components/AvatarPicker'
import { VineCreations } from '@/features/child/components/VineCreations'
import { useAuth } from '../AuthContext'

const pastWorks = [
  { id: 'w1', title: '会发光的森林', emoji: '🌲', date: '昨天' },
  { id: 'w2', title: 'Nilo 的蓝色小船', emoji: '🚤', date: '3天前' },
  { id: 'w3', title: '云朵上的城市', emoji: '☁️', date: '上周' },
  { id: 'w4', title: '会唱歌的星星', emoji: '⭐', date: '上周' },
]

export function ChildDemoPage() {
  const navigate = useNavigate()
  const { session, logout } = useAuth()

  function handleLogout() {
    logout()
    navigate('/auth?role=child&mode=login')
  }

  return (
    <main className="relative min-h-screen overflow-x-hidden bg-luma-teal-50">
      {/* background image */}
      <img
        src={bgChild}
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-40 select-none"
      />
      <div
        className="absolute top-20 -left-24 size-80 rounded-full bg-luma-gold-100/60 blur-3xl"
        aria-hidden="true"
      />

      {/* header */}
      <div className="relative z-50 px-5 pt-6">
        <header className="mx-auto flex max-w-6xl items-center justify-between rounded-luma-md border border-white/70 bg-white/70 px-5 py-3 shadow-luma-sm backdrop-blur-xl">
          <Brand size="md" />
          <div className="flex items-center gap-2">
            <div className="hidden text-right sm:block">
              <div className="text-sm font-bold text-luma-teal-900">
                {session?.displayName}
              </div>
              <div className="text-xs text-luma-muted">我的头像</div>
            </div>
            <AvatarPicker userId={session?.id ?? 'guest-child'} compact />
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              下次见
            </Button>
          </div>
        </header>
      </div>

      {/* page body: left content + right vine */}
      <div className="relative mx-auto flex max-w-6xl items-start px-5">

        {/* left: hero + card */}
        <section className="relative z-10 min-w-0 flex-1 py-14 pr-6">
          {session?.isGuest && (
            <div className="mb-7 w-fit rounded-full bg-luma-gold-100 px-4 py-2 text-sm font-semibold text-luma-gold-700">
              正在体验模式中 · 作品不会保存
            </div>
          )}

          <div className="flex flex-col items-center gap-6 text-center sm:items-start sm:text-left">
            <div className="luma-eyebrow text-luma-gold-700">Nilo 在等你</div>
            <div className="flex items-center gap-4">
              <img
                src={helloGif}
                alt="Nilo 向你打招呼"
                className="w-32 shrink-0 sm:w-40"
                style={{ mixBlendMode: 'multiply' }}
              />
              <h1 className="luma-heading-1 text-luma-teal-900">
                嗨，{session?.displayName}！
              </h1>
            </div>
            <p className="luma-body-lg max-w-xl text-luma-muted">
              今天要画什么？打开画布，让 Nilo 陪你一起。
            </p>
          </div>

          <div className="mt-8 text-left">
            <Card
              title="画一个新世界"
              description="打开画布，让颜色带你去任何地方。"
              variant="glass"
              className="min-h-0 transition-[border-color,box-shadow] hover:border-luma-teal-300 hover:shadow-luma-md"
            >
              <div className="mt-3 flex items-center justify-between gap-4">
                <span className="text-4xl" aria-hidden="true">✦</span>
                <Button variant="primary" onClick={() => navigate('/child/create')}>
                  打开画布
                </Button>
              </div>
            </Card>
          </div>
        </section>

        {/* right: vine — no top padding, hugs the header bottom */}
        <div className="relative z-0 hidden w-[40%] shrink-0 sm:block">
          <VineCreations
            works={pastWorks}
            onOpen={() => navigate('/child/create')}
          />
        </div>
      </div>
    </main>
  )
}
