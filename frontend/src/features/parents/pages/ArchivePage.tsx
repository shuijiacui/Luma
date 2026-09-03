import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'

import bgParent from '@/assets/images/bg-parent.png'
import { Navbar } from '@/components/layout'
import { Button, Card } from '@/components/ui'
import { fadeUp, staggerContainer } from '@/design-system'
import { AvatarPicker } from '@/features/profile/components/AvatarPicker'
import { cn } from '@/lib/cn'
import { useAuth } from '@/features/auth/AuthContext'

const archiveData = {
  year: '2024–2025',
  totalWorks: 87,
  months: [
    {
      month: '2024年12月',
      works: [
        { title: '会唱歌的雪', type: '故事', emoji: '❄️', highlight: true },
        { title: '礼物树', type: '绘画', emoji: '🎁', highlight: false },
        { title: 'Nilo 的圣诞帽', type: '绘画', emoji: '🦦', highlight: true },
      ],
      aiSummary: '这个月的创作充满节日气氛，孩子开始为常见物件赋予声音和情感。',
    },
    {
      month: '2025年1月',
      works: [
        { title: '新年第一颗星', type: '故事', emoji: '⭐', highlight: true },
        { title: '冬天的兔子', type: '绘画', emoji: '🐇', highlight: false },
      ],
      aiSummary: '场景从室内转向室外，户外探索的意象开始出现。',
    },
    {
      month: '2025年2月',
      works: [
        { title: '云朵上的城市', type: '故事', emoji: '☁️', highlight: true },
        { title: '会飞的石头', type: '故事', emoji: '🪨', highlight: false },
        { title: '彩虹桥', type: '绘画', emoji: '🌈', highlight: true },
      ],
      aiSummary: '"不可能发生的事"开始出现，想象力明显扩展。',
    },
    {
      month: '2025年3月',
      works: [
        { title: 'Nilo 的蓝色小船', type: '绘画', emoji: '🚤', highlight: true },
        { title: '会发光的森林', type: '故事', emoji: '🌲', highlight: false },
      ],
      aiSummary: '孩子开始为动物角色命名，角色有了明确的性格特征。',
    },
  ],
}

const toneMap = {
  故事: 'bg-luma-teal-50 text-luma-teal-700',
  绘画: 'bg-luma-gold-100 text-luma-gold-700',
} as const

export function ArchivePage() {
  const navigate = useNavigate()
  const { session, logout } = useAuth()

  function handleLogout() {
    logout()
    navigate('/auth?role=parent&mode=login')
  }

  return (
    <main className="relative min-h-screen bg-luma-ivory-50 px-4 py-4 sm:px-5 sm:py-5">
      <img
        src={bgParent}
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-40 select-none"
      />
      <div className="relative z-0">
        <Navbar
          items={[
            { label: '成长概览', href: '/parent/demo' },
            { label: '成长档案', href: '#archive', isActive: true },
          ]}
          actions={
            <>
              <div className="hidden text-right lg:block">
                <div className="text-sm font-bold text-luma-teal-900">
                  {session?.displayName}
                </div>
                <div className="text-xs text-luma-muted">家长账号</div>
              </div>
              <AvatarPicker userId={session?.id ?? 'guest-parent'} compact />
              <Button variant="ghost" size="sm" onClick={handleLogout}>
                退出
              </Button>
            </>
          }
        />

        <motion.div
          className="mx-auto max-w-4xl py-10 sm:py-14"
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
        >
          <motion.section variants={fadeUp} id="archive">
            <div className="luma-eyebrow text-luma-gold-700">家庭成长档案</div>
            <h1 className="luma-heading-1 mt-3 text-luma-teal-900">
              My Child's Creative Journey
            </h1>
            <p className="luma-body-lg mt-4 max-w-2xl text-luma-muted">
              {archiveData.year} · 共 {archiveData.totalWorks} 件作品 ·
              每一件都是孩子留下的印记
            </p>
          </motion.section>

          <motion.div
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
            className="mt-10 space-y-8"
          >
            {archiveData.months.map((m) => (
              <motion.div key={m.month} variants={fadeUp}>
                <div className="mb-4 flex items-center gap-4">
                  <span className="font-brand text-lg font-bold text-luma-teal-900">
                    {m.month}
                  </span>
                  <div className="h-px flex-1 bg-luma-teal-100" />
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {m.works.map((work) => (
                    <div
                      key={work.title}
                      className={cn(
                        'rounded-2xl border p-4 transition',
                        work.highlight
                          ? 'border-luma-teal-100 bg-white shadow-luma-sm'
                          : 'border-luma-ivory-200 bg-luma-ivory-50',
                      )}
                    >
                      <div className="text-3xl">{work.emoji}</div>
                      <div className="mt-3 font-bold text-luma-teal-900">
                        {work.title}
                      </div>
                      <div className="mt-2">
                        <span
                          className={cn(
                            'rounded-full px-2.5 py-0.5 text-xs font-bold',
                            toneMap[work.type as keyof typeof toneMap],
                          )}
                        >
                          {work.type}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                {m.aiSummary && (
                  <div className="mt-3 rounded-xl bg-luma-teal-50 px-4 py-3 text-sm text-luma-teal-700">
                    AI："{m.aiSummary}"
                  </div>
                )}
              </motion.div>
            ))}
          </motion.div>

          <motion.div variants={fadeUp} className="mt-12">
            <Card
              variant="glass"
              eyebrow="年度回顾"
              title="生成完整成长报告"
              description="将一年的创作轨迹整理成可保存、可分享的成长册。"
              className="text-center"
            >
              <div className="mt-4 flex flex-wrap justify-center gap-3">
                <Button variant="primary">生成 2024–2025 成长册</Button>
                <Button variant="secondary">导出全部作品</Button>
              </div>
              <p className="mt-4 text-xs text-luma-muted">
                成长册功能为年付会员专属
              </p>
            </Card>
          </motion.div>
        </motion.div>
      </div>
    </main>
  )
}
