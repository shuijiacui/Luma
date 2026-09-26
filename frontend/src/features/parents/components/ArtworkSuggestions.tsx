import { t, useLocale } from '@/i18n'
import { motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { fadeUp } from '@/design-system'
import { getCommunicationGuides, type CommunicationGuide, type CommunicationResponse } from '@/lib/api/communicationApi'
import { AuthedArtwork } from './dashboard/AuthedArtwork'
import type { ArtworkKind } from './dashboard/artworks'
import './communication.css'

type CardGuide = CommunicationGuide & { demoKind?: ArtworkKind }

function demoGuides(locale: 'zh' | 'en'): CardGuide[] {
  const en = locale === 'en'
  return [
    {
      id: 'demo-boat', sourceId: 'demo-boat', createdAt: '2026-09-08T00:00:00Z', imageUrl: null, demoKind: 'boat',
      subject: en ? 'boat' : '小船', focus: 'story', evidenceIds: [], provenanceNote: null,
      title: en ? 'Hear the boat’s story' : '听听小船的故事',
      observation: en ? 'There is a small boat in this picture.' : '这幅画里，有一艘小船。',
      opener: en ? 'Would you like to tell me about the little boat in your picture?' : '你愿意给我讲讲，画里的这艘小船吗？',
      followUp: en ? 'Which part of your story would you like to tell me more about?' : '你刚才讲的故事里，还有哪一点想让我知道呀？',
      alternative: en ? 'We can just look together. You can point to a part you like, if you want.' : '我们也可以一起看看。你愿意的话，指给我看一处你喜欢的地方就好。',
    },
    {
      id: 'demo-tree', sourceId: 'demo-tree', createdAt: '2026-09-06T00:00:00Z', imageUrl: null, demoKind: 'nature',
      subject: en ? 'tree' : '树', focus: 'process', evidenceIds: [], provenanceNote: null,
      title: en ? 'Explore how the tree was drawn' : '看看树是怎么画的',
      observation: en ? 'There are trees in this picture.' : '这幅画里，可以看到树。',
      opener: en ? 'Would you like to show me where you started drawing this tree?' : '你愿意指给我看看，这棵树是从哪里开始画的吗？',
      followUp: en ? 'Was there a part of drawing it that you would like to share?' : '画的过程里，有没有哪一步是你想和我分享的？',
      alternative: en ? 'You don’t have to explain. I’d be happy just looking at your picture with you.' : '不用解释也没关系，和你一起看看这幅画，我就很开心。',
    },
  ]
}

export function SourcePreview({ guide, token, onClose }: { guide: Pick<CardGuide, 'title' | 'imageUrl' | 'observation' | 'provenanceNote' | 'demoKind'>; token?: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => { dialog.current?.showModal() }, [])
  return (
    <dialog ref={dialog} className="communication-preview" onClose={onClose} aria-label={t('来源作品')}
      onClick={event => { if (event.target === event.currentTarget) dialog.current?.close() }}>
      <div className="communication-preview-body">
        <div className="communication-preview-heading">
          <h2>{guide.title}</h2>
          <button type="button" autoFocus onClick={() => dialog.current?.close()}>{t('关闭')}</button>
        </div>
        <div className="communication-preview-image">
          <AuthedArtwork path={guide.imageUrl} token={token} kind={guide.demoKind}
            className="absolute inset-0 h-full w-full object-contain" emptyText="暂时无法显示作品" />
        </div>
        <p>{guide.observation}</p>
        {guide.provenanceNote && <p className="communication-provenance">{guide.provenanceNote}</p>}
      </div>
    </dialog>
  )
}

function SuggestionCard({ guide, token, onPreview, onDiscuss }: { guide: CardGuide; token?: string; onPreview: () => void; onDiscuss?: () => void }) {
  const locale = useLocale()
  const date = new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'zh-CN', {
    year: 'numeric', month: 'short', day: 'numeric', timeZone: 'Asia/Shanghai',
  }).format(new Date(guide.createdAt))
  return (
    <article className={`communication-card communication-card--${guide.focus}`} aria-labelledby={`guide-${guide.id}`}>
      <div className="communication-source">
        <button type="button" className="communication-thumbnail" onClick={onPreview} aria-label={t('查看来源作品')}>
          <AuthedArtwork path={guide.imageUrl} token={token} kind={guide.demoKind}
            className="absolute inset-0 h-full w-full object-contain" emptyText="查看作品" />
        </button>
        <div className="communication-source-copy">
          <span className="communication-date">{guide.demoKind ? t('示例作品') : <time dateTime={guide.createdAt}>{date}</time>}</span>
          <h2 id={`guide-${guide.id}`}>{guide.title}</h2>
          <p>{guide.observation}</p>
        </div>
      </div>
      <div className="communication-opening">
        <span className="communication-label">{t('可以这样开口')}</span>
        <blockquote>“{guide.opener}”</blockquote>
      </div>
      <details className="communication-followup">
        <summary>{t('接下来怎么聊')}<span aria-hidden="true">＋</span></summary>
        <div className="communication-followup-content">
          <div><h3>{t('孩子愿意继续讲')}</h3><p>“{guide.followUp}”</p></div>
          <div><h3>{t('如果只说了一两句')}</h3><p>“{guide.alternative}”</p></div>
        </div>
      </details>
      {onDiscuss && <button type="button" className="communication-discuss" onClick={onDiscuss}>{t('聊聊这幅画')} <span aria-hidden="true">↗</span></button>}
    </article>
  )
}

interface Props {
  childName: string
  childId?: string
  token?: string
  isGuest?: boolean
  onChooseArtwork?: () => void
  onDiscuss?: (sourceId: string) => void
}

export function ArtworkSuggestions({ childName, childId, token, isGuest = false, onChooseArtwork, onDiscuss }: Props) {
  const locale = useLocale()
  const [revision, setRevision] = useState(0)
  const [state, setState] = useState<{ key: string; response?: CommunicationResponse; error?: boolean }>({ key: '' })
  const [preview, setPreview] = useState<{ key: string; guide: CardGuide } | null>(null)
  const key = `${childId ?? ''}:${token ?? ''}:${locale}:${revision}`
  useEffect(() => {
    if (isGuest || !childId || !token) return
    const controller = new AbortController()
    getCommunicationGuides(childId, token, locale, controller.signal).then(response => {
      if (!controller.signal.aborted) setState({ key, response })
    }).catch(() => { if (!controller.signal.aborted) setState({ key, error: true }) })
    return () => controller.abort()
  }, [childId, token, locale, key, isGuest])
  useEffect(() => {
    const refresh = () => setRevision(value => value + 1)
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [])
  const current = state.key === key ? state : null
  const guides = isGuest ? demoGuides(locale) : current?.response?.cards
  const missingChild = !isGuest && (!childId || !token)
  const outOfScope = current?.response?.emptyReason === 'age_out_of_scope'
  const loading = !isGuest && !missingChild && !current
  return (
    <motion.section variants={fadeUp} className="communication-workspace" aria-label={t(`和 ${childName} 聊什么？`)}>
      {loading ? (
        <div className="communication-empty" role="status"><p>{t('正在为这次交流准备话题…')}</p></div>
      ) : current?.error ? (
        <div className="communication-empty" role="alert">
          <p>{t('暂时无法加载沟通建议，请稍后重试。')}</p>
          <button type="button" onClick={() => setRevision(value => value + 1)}>{t('重试')}</button>
        </div>
      ) : !guides?.length ? (
        <div className="communication-empty">
          <h2>{t(outOfScope ? '先一起欣赏孩子的作品' : '从一幅画，开始一次交流')}</h2>
          <p>{t(outOfScope ? '当前分龄沟通建议适用于 5–12 岁。你仍然可以和孩子一起回看作品。'
            : missingChild ? '连接孩子的创作空间后，就能从作品里找到话题。' : '先为一幅作品生成画面观察，这里就会出现对应的开场白和接话建议。')}</p>
          {!missingChild && !outOfScope && onChooseArtwork && <button type="button" onClick={onChooseArtwork}>{t('选择作品生成解读')}</button>}
        </div>
      ) : (
        <>
          <div className="communication-grid">
            {guides.map(guide => <SuggestionCard key={`${locale}:${guide.id}`} guide={guide} token={token}
              onPreview={() => setPreview({ key, guide })} onDiscuss={onDiscuss ? () => onDiscuss(guide.sourceId) : undefined} />)}
          </div>
          <p className="communication-note">{t('选一个话题就好。先听孩子说；暂时不想聊，一起看看画也很好。')}</p>
        </>
      )}
      {preview?.key === key && <SourcePreview guide={preview.guide} token={token} onClose={() => setPreview(null)} />}
    </motion.section>
  )
}
