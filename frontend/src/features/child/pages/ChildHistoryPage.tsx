import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthContext'
import type { AuthSession } from '@/features/auth/types'
import { useAuthedImage } from '@/hooks/useAuthedImage'
import { t, useLocale } from '@/i18n'
import { LanguageSwitcher } from '@/i18n/LanguageSwitcher'
import { clearChildDraft } from '../draft'
import { listArtworks, type ArtworkSummary } from '../artworks'

function ArtworkCard({ work, token, onOpen }: { work: ArtworkSummary; token?: string; onOpen: () => void }) {
  const locale = useLocale()
  const remoteImage = useAuthedImage(work.imageUrl, token)
  const image = work.image ?? remoteImage
  return <button type="button" onClick={onOpen} className="group overflow-hidden rounded-3xl border border-luma-teal-100 bg-white p-3 text-left shadow-luma-sm transition hover:-translate-y-1 hover:shadow-luma-md focus-visible:outline-3 focus-visible:outline-luma-teal-700">
    <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-2xl bg-[#fffdf8]">
      {image ? <img src={image} alt={t('已保存的图画')} className="h-full w-full object-contain" /> : <span className="text-luma-muted">{t('打开查看图画')}</span>}
    </div>
    <div className="flex flex-wrap items-center justify-between gap-2 px-2 pt-4 pb-2">
      <time className="text-sm text-luma-muted" dateTime={work.updatedAt}>{new Date(work.updatedAt).toLocaleString(locale === 'en' ? 'en-US' : 'zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</time>
      <span className="rounded-full bg-luma-teal-50 px-4 py-2 font-bold text-luma-teal-800">{t('继续画')} →</span>
    </div>
  </button>
}

export function ChildHistoryPage() {
  const { session } = useAuth()
  return <History key={session?.id} session={session} />
}
function History({ session }: { session: AuthSession | null }) {
  useLocale()
  const navigate = useNavigate()
  const [works, setWorks] = useState<ArtworkSummary[]>([])
  const [offset, setOffset] = useState(0)
  const [nextOffset, setNextOffset] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let cancelled = false
    setLoading(true); setError(false)
    listArtworks(session, offset).then(page => {
      if (cancelled) return
      setWorks(previous => offset === 0 ? page.artworks : Array.from(new Map([...previous, ...page.artworks].map(work => [work.id, work])).values()))
      setNextOffset(page.nextOffset)
    }).catch(() => { if (!cancelled) setError(true) }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [session, offset, retry])
  function newDrawing() { clearChildDraft(); navigate('/child/create') }
  return <main className="min-h-screen bg-luma-ivory-50 px-5 py-6 text-luma-teal-900 sm:px-10">
    <div className="mx-auto max-w-6xl">
      <header className="flex items-center justify-between gap-3">
        <button type="button" className="min-h-12 rounded-xl px-4 font-bold hover:bg-white" onClick={() => navigate('/child/demo')}>← {t('返回小屋')}</button>
        <LanguageSwitcher />
      </header>
      <section className="flex flex-wrap items-end justify-between gap-5 py-10">
        <div><p className="mb-2 text-sm text-luma-muted">Nilo · {t('我的小画册')}</p><h1 className="text-3xl font-bold sm:text-4xl">{t('历史图画')}</h1><p className="mt-3 text-luma-muted">{t('没画完也没关系，点开一幅画，接着画吧！')}</p></div>
        <button type="button" onClick={newDrawing} className="min-h-12 rounded-2xl bg-luma-teal-700 px-6 py-3 font-bold text-white">+ {t('画一幅新的')}</button>
      </section>
      {session?.isGuest && <p className="mb-6 rounded-2xl bg-white px-5 py-3 text-sm text-luma-muted">{t('游客图画保存在当前浏览器，清除浏览器数据后会消失。')}</p>}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{works.map(work => <ArtworkCard key={work.id} work={work} token={session?.token} onOpen={() => navigate(`/child/create?artwork=${encodeURIComponent(work.id)}`)} />)}</div>
      {loading && <p role="status" className="py-12 text-center">{t('正在翻开小画册…')}</p>}
      {error && <div role="alert" className="py-10 text-center"><p>{t('小画册暂时没打开，再试一次吧。')}</p><button type="button" onClick={() => setRetry(value => value + 1)} className="mt-4 min-h-12 rounded-xl bg-white px-6">{t('重试')}</button></div>}
      {!loading && !error && works.length === 0 && <div className="rounded-3xl border border-dashed border-luma-teal-200 bg-white/70 px-6 py-16 text-center"><span aria-hidden="true" className="text-5xl">🎨</span><h2 className="mt-5 text-xl font-bold">{t('第一幅画，等你来画')}</h2><p className="mt-3 text-luma-muted">{t('画完点「保存」或「完成」，下次就能在这里继续。')}</p><button type="button" onClick={newDrawing} className="mt-6 min-h-12 rounded-xl bg-luma-teal-700 px-6 font-bold text-white">{t('去画画')}</button></div>}
      {!loading && !error && nextOffset !== null && <div className="py-8 text-center"><button type="button" onClick={() => setOffset(nextOffset)} className="min-h-12 rounded-xl bg-white px-6 font-bold">{t('更多图画')}</button></div>}
    </div>
  </main>
}
