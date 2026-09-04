import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { Brand } from '@/components/brand'
import { Button, Card } from '@/components/ui'
import bgChild from '@/assets/images/bg-child.png'
import helloGif from '@/assets/images/hello.gif'
import { AvatarPicker } from '@/features/profile/components/AvatarPicker'
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
  const [showWorks, setShowWorks] = useState(false)

  function handleLogout() {
    logout()
    navigate('/auth?role=child&mode=login')
  }

  return (
    <main className="relative min-h-screen overflow-x-hidden bg-luma-teal-50 px-5 py-6">
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
      <header className="relative z-50 mx-auto flex max-w-6xl items-center justify-between rounded-luma-md border border-white/70 bg-white/70 px-5 py-3 shadow-luma-sm backdrop-blur-xl">
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

      <section className="relative z-0 mx-auto max-w-5xl py-14">
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

        <div className="mt-8 grid gap-4 text-left sm:grid-cols-2">
          {/* 画一个新世界 */}
          <Card
            title="画一个新世界"
            description="打开画布，让颜色带你去任何地方。"
            variant="glass"
            interactive
            className="min-h-0"
          >
            <div className="mt-3 flex items-center justify-between gap-4">
              <span className="text-4xl" aria-hidden="true">✦</span>
              <Button variant="primary" onClick={() => navigate('/child/create')}>
                打开画布
              </Button>
            </div>
          </Card>

          {/* 我的创作 */}
          {!showWorks ? (
            <Card
              title="我的创作"
              description="看看你画过的所有作品。"
              variant="soft"
              interactive
              className="min-h-0 cursor-pointer"
              onClick={() => setShowWorks(true)}
            >
              <div className="mt-3 flex items-center justify-between gap-4">
                <div className="flex gap-2 text-3xl">
                  {pastWorks.slice(0, 3).map((w) => (
                    <span key={w.id} aria-hidden="true">{w.emoji}</span>
                  ))}
                </div>
                <Button variant="secondary" onClick={() => setShowWorks(true)}>
                  查看全部
                </Button>
              </div>
            </Card>
          ) : (
            <Card
              title="我的创作"
              description="点一件作品继续画。"
              variant="soft"
              className="min-h-0"
            >
              <button
                type="button"
                onClick={() => setShowWorks(false)}
                className="mb-3 text-xs text-luma-muted hover:text-luma-teal-700"
              >
                ← 收起
              </button>
              <div className="space-y-2">
                {pastWorks.map((work) => (
                  <div
                    key={work.id}
                    className="flex items-center gap-3 rounded-xl border border-white/60 bg-white/55 px-3 py-2.5 backdrop-blur-sm transition hover:bg-white/80"
                  >
                    <span className="text-2xl leading-none" aria-hidden="true">
                      {work.emoji}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-bold text-luma-teal-900">
                        {work.title}
                      </div>
                      <div className="mt-0.5 text-xs text-luma-muted">{work.date}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => navigate('/child/create')}
                      className="shrink-0 rounded-lg bg-luma-teal-500 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-luma-teal-600"
                    >
                      继续
                    </button>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </section>
    </main>
  )
}
