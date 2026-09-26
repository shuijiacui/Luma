import { useCallback, useEffect, useRef, useState } from 'react'
import { t, useLocale } from '@/i18n'
import { ApiError } from '@/lib/api/client'
import { randomId } from '@/lib/randomId'
import { getParentChat, sendParentChat, clearParentChat, type ArtworkMemory, type ParentChatInput, type ParentChatSnapshot } from '@/lib/api/communicationApi'
import { ArtworkSuggestions, SourcePreview } from './ArtworkSuggestions'
import { AuthedArtwork } from './dashboard/AuthedArtwork'
import { demoArtworkKind, sendDemoChat } from '../demo/parentChatDemo'
import { activeDemoConversation, deleteDemoConversation, loadDemoHistory, newDemoConversation, saveDemoHistory, updateDemoConversation } from '../demo/parentChatHistory'
import { ChatHistory, HistoryIcon, TrashIcon } from './ChatHistory'
import './communication.css'

interface Props {
  childName: string
  childId?: string
  token?: string
  isGuest?: boolean
  onChooseArtwork?: () => void
}

const STARTERS = ['刚才没忍住，冲孩子发了脾气', '孩子不愿意跟我说学校的事', '想聊聊孩子最近的画']
const EMPTY: ParentChatSnapshot = { revision: 0, turns: [], available: false, memory: { works: [], scannedCount: 0, limit: 50 } }

export function CommunicationSection(props: Props) {
  const locale = useLocale()
  return <ParentChatWorkspace key={`${props.childId ?? (props.isGuest ? props.childName : '')}:${props.token}:${locale}:${props.isGuest}`} {...props} locale={locale} />
}

function ParentChatWorkspace({ childName, childId, token, isGuest = false, onChooseArtwork, locale }: Props & { locale: 'zh' | 'en' }) {
  const demoScope = childId ?? childName
  const [realSnapshot, setRealSnapshot] = useState<ParentChatSnapshot | null>(() => !childId || !token ? EMPTY : null)
  const [demoHistory, setDemoHistory] = useState(() => isGuest ? loadDemoHistory(demoScope, locale) : null)
  const snapshot = demoHistory ? activeDemoConversation(demoHistory).snapshot : realSnapshot
  const [historyOpen, setHistoryOpen] = useState(false)
  const [storageError, setStorageError] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [draft, setDraft] = useState('')
  const [selected, setSelected] = useState<ArtworkMemory | null>(null)
  const [preview, setPreview] = useState<ArtworkMemory | null>(null)
  const [pendingText, setPendingText] = useState<string | null>(null)
  const [failed, setFailed] = useState<{ input: ParentChatInput; message: string } | null>(null)
  const [notice, setNotice] = useState('')
  const [confirmClear, setConfirmClear] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [memoryOpen, setMemoryOpen] = useState(() => typeof window.matchMedia === 'function' && window.matchMedia('(min-width: 1200px)').matches)
  const [allMemory, setAllMemory] = useState(false)
  const [guidesOpen, setGuidesOpen] = useState(false)
  const textarea = useRef<HTMLTextAreaElement>(null)
  const feed = useRef<HTMLDivElement>(null)
  const busy = useRef(false)
  const mounted = useRef(true)
  const controllers = useRef(new Set<AbortController>())
  const loadSequence = useRef(0)
  const drafts = useRef(new Map<string, { text: string; sourceId: string | null }>())

  const setSnapshot = (update: (current: ParentChatSnapshot | null) => ParentChatSnapshot | null) => {
    if (isGuest) setDemoHistory(current => {
      if (!current) return current
      const next = update(activeDemoConversation(current).snapshot)
      return next ? updateDemoConversation(current, next) : current
    })
    else setRealSnapshot(update)
  }

  const reload = useCallback(async () => {
    if (!childId || !token || isGuest) return
    const sequence = ++loadSequence.current
    const controller = new AbortController(); controllers.current.add(controller)
    try {
      const data = await getParentChat(childId, token, locale, controller.signal)
      if (!controller.signal.aborted && sequence === loadSequence.current) {
        setRealSnapshot(data); setLoadError(false)
        setSelected(value => data.memory.works.find(work => work.sourceId === value?.sourceId) ?? null)
      }
    } catch { if (!controller.signal.aborted && sequence === loadSequence.current) setLoadError(true) }
    finally { controllers.current.delete(controller) }
  }, [childId, token, isGuest, locale])

  useEffect(() => {
    mounted.current = true
    void reload()
    const refresh = () => { if (!busy.current) void reload() }
    window.addEventListener('focus', refresh)
    const requests = controllers.current
    return () => { mounted.current = false; requests.forEach(controller => controller.abort()); requests.clear(); window.removeEventListener('focus', refresh) }
  }, [reload])
  useEffect(() => {
    if (feed.current) feed.current.scrollTop = feed.current.scrollHeight
  }, [snapshot?.turns.length, pendingText, failed, demoHistory?.activeId])
  useEffect(() => {
    if (demoHistory) setStorageError(!saveDemoHistory(demoScope, locale, demoHistory))
  }, [demoScope, locale, demoHistory])
  useEffect(() => {
    const resize = () => { if (textarea.current) {
      textarea.current.style.height = 'auto'
      textarea.current.style.height = `${Math.min(textarea.current.scrollHeight || 30, 84)}px`
    } }
    resize()
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [draft])

  const chooseWork = (sourceId: string) => {
    const work = snapshot?.memory.works.find(item => item.sourceId === sourceId)
    if (!work) return
    setSelected(work); setFailed(null)
    if (!draft.trim()) setDraft(t('想和孩子聊聊这幅画，可以从哪里开始？'))
    textarea.current?.focus()
  }

  const switchConversation = (id?: string) => {
    if (!demoHistory || busy.current) return
    const next = id ? { ...demoHistory, activeId: id } : newDemoConversation(demoHistory, locale)
    if (!next.conversations.some(item => item.id === next.activeId)) return
    if (!id && next === demoHistory && snapshot?.turns.length) {
      setNotice(t('已保存 30 段对话，删除一段后就可以新建。')); return
    }
    drafts.current.set(demoHistory.activeId, { text: draft, sourceId: selected?.sourceId ?? null })
    const saved = drafts.current.get(next.activeId)
    setDemoHistory(next); setDraft(saved?.text ?? '')
    setSelected(activeDemoConversation(next).snapshot.memory.works.find(work => work.sourceId === saved?.sourceId) ?? null)
    setFailed(null); setNotice(''); setConfirmClear(false); setHistoryOpen(false)
  }

  const deleteConversation = (id: string) => {
    if (!demoHistory || busy.current) return
    const next = deleteDemoConversation(demoHistory, id, locale)
    setDemoHistory(next); drafts.current.delete(id)
    if (id === demoHistory.activeId) {
      const saved = drafts.current.get(next.activeId)
      setDraft(saved?.text ?? '')
      setSelected(activeDemoConversation(next).snapshot.memory.works.find(work => work.sourceId === saved?.sourceId) ?? null)
      setFailed(null); setNotice(''); setConfirmClear(false)
    }
  }

  const send = async (retry?: ParentChatInput) => {
    if (busy.current || !snapshot?.available || (!isGuest && (!childId || !token)) || (!retry && !draft.trim())) return
    const previous = failed?.input
    const input = retry ?? (previous?.text === draft.trim() && previous.sourceId === (selected?.sourceId ?? null) ? previous
      : { text: draft.trim(), requestId: randomId(), revision: snapshot.revision, sourceId: selected?.sourceId ?? null, locale })
    busy.current = true; loadSequence.current++
    setPendingText(input.text); setFailed(null); setNotice(''); setDraft('')
    const controller = new AbortController(); controllers.current.add(controller)
    try {
      const result = isGuest ? await sendDemoChat(snapshot, input, controller.signal)
        : await sendParentChat(childId!, token!, input, controller.signal)
      if (controller.signal.aborted || !mounted.current) return
      setSnapshot(current => current ? { ...current, revision: result.revision,
        turns: [...current.turns.filter(turn => turn.id !== result.turn.id), result.turn].slice(isGuest ? -30 : -60) } : current)
      setSelected(null)
    } catch (err) {
      if (controller.signal.aborted || !mounted.current) return
      setDraft(input.text)
      if (err instanceof ApiError && (err.status === 409 || err.status === 404)) {
        setNotice(t('记录已更新，请确认后再发送。'))
        await reload()
      } else {
        const message = err instanceof ApiError && err.status === 429 ? t('消息发送太频繁，请稍后再试')
          : t('这次没能收到回复，你写的内容还在。可以重试。')
        setFailed({ input, message })
      }
    } finally {
      controllers.current.delete(controller); busy.current = false
      if (mounted.current) setPendingText(null)
    }
  }

  const clear = async () => {
    if (busy.current || !snapshot || (!isGuest && (!childId || !token))) return
    busy.current = true; loadSequence.current++; setClearing(true)
    const controller = new AbortController(); controllers.current.add(controller)
    try {
      const result = isGuest ? { revision: snapshot.revision + 1 }
        : await clearParentChat(childId!, token!, snapshot.revision, controller.signal)
      if (!controller.signal.aborted) {
        setSnapshot(current => current ? { ...current, revision: result.revision, turns: [] } : current)
        setFailed(null); setDraft(''); setSelected(null); setConfirmClear(false); setNotice('')
      }
    } catch { if (!controller.signal.aborted) { setNotice(t('暂时无法清空聊天，请重试。')); await reload() } }
    finally { controllers.current.delete(controller); busy.current = false; if (mounted.current) setClearing(false) }
  }

  const canChat = Boolean(snapshot?.available && (isGuest || (childId && token)))
  const hasMessages = Boolean(snapshot?.turns.length || pendingText)
  const works = snapshot?.memory.works ?? []
  const displayWorks = allMemory ? works : works.slice(0, 4)
  const dateLabel = (date: string) => new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'zh-CN', {
    month: 'short', day: 'numeric', timeZone: 'Asia/Shanghai',
  }).format(new Date(date))
  return (
    <section id="communication" className="parent-chat-layout" aria-label={t('家长对话空间')}>
      <div className="parent-chat-main">
        <div className="parent-chat-toolbar">
          {demoHistory ? <>
            <button type="button" className="parent-chat-history-trigger" disabled={pendingText !== null || clearing} onClick={() => setHistoryOpen(true)}><HistoryIcon />{t('历史记录')}</button>
            <div className="parent-chat-toolbar-actions"><button type="button" className="parent-chat-new" disabled={pendingText !== null || clearing} onClick={() => switchConversation()}><span aria-hidden="true">＋</span>{t('新对话')}</button>
              {!!snapshot?.turns.length && <button type="button" className="parent-chat-clear-trigger" aria-label={t('清空聊天')} title={t('清空聊天')} disabled={pendingText !== null || clearing} onClick={() => setConfirmClear(true)}><TrashIcon /></button>}
            </div>
          </> : <><span><i aria-hidden="true" />{t('聊聊日常，也聊聊孩子的创作')}</span>
            {!!snapshot?.turns.length && <button type="button" disabled={pendingText !== null || clearing} onClick={() => setConfirmClear(true)}>{t('清空聊天')}</button>}</>}
        </div>
        {confirmClear && <div className="parent-chat-clear" role="alertdialog" aria-label={t('清空这段聊天？')}>
          <p>{t('清空这段聊天？作品记忆会保留。')}</p>
          <button type="button" onClick={() => setConfirmClear(false)} disabled={clearing}>{t('取消')}</button>
          <button type="button" onClick={() => void clear()} disabled={clearing}>{t('确认清空')}</button>
        </div>}
        <div ref={feed} className={`parent-chat-feed${hasMessages ? ' has-messages' : ''}`} role="log" aria-label={t('聊天记录')} aria-live="polite" aria-relevant="additions text">
          {!snapshot && !loadError ? <p className="parent-chat-status" role="status">{t('正在打开聊天…')}</p>
            : loadError ? <div className="parent-chat-status" role="alert"><p>{t('暂时无法读取聊天记录。')}</p><button onClick={() => void reload()}>{t('重试')}</button></div>
              : !hasMessages ? <div className="parent-chat-welcome">
                <span className="parent-chat-flower" aria-hidden="true">✳</span>
                <h2>{t('今天，有什么想聊聊的？')}</h2>
                <p>{t('一句不好开口的话，一件有点为难的事，')}<br />{t('或者只是想说说今天。')}</p>
                <div className="parent-chat-starters">{STARTERS.map(text => <button key={text} type="button" disabled={!canChat}
                  onClick={() => { setDraft(t(text)); setFailed(null); textarea.current?.focus() }}>{t(text)}<span aria-hidden="true">↗</span></button>)}</div>
              </div> : null}
          {snapshot?.turns.map(turn => <div className="parent-chat-turn" key={turn.id}>
            <div className="parent-chat-message parent-chat-message--user"><p>{turn.userText}</p></div>
            <div className="parent-chat-message parent-chat-message--assistant">
              <span className="parent-chat-speaker">Luma</span>
              <p>{turn.reply}</p>
              {!!turn.sources.length && <div className="parent-chat-citations">{turn.sources.map(source => <button type="button" key={source.sourceId} onClick={() => setPreview(source)}>
                {t('参考作品')} · {dateLabel(source.createdAt)} · {source.title}<span aria-hidden="true">↗</span>
              </button>)}</div>}
            </div>
          </div>)}
          {pendingText && <div className="parent-chat-turn">
            <div className="parent-chat-message parent-chat-message--user"><p>{pendingText}</p></div>
            <div className="parent-chat-message parent-chat-message--assistant" role="status" aria-label={t('正在回复…')}>
              <span className="parent-chat-speaker">Luma</span><span className="parent-chat-typing" aria-hidden="true"><i /><i /><i /></span>
            </div>
          </div>}
        </div>
        <div className="parent-chat-input-area">
          {failed && <div className="parent-chat-error" role="alert"><span>{failed.message}</span><button type="button" onClick={() => void send(failed.input)}>{t('重试')}</button></div>}
          {notice && <p className="parent-chat-error" role="status">{notice}</p>}
          {storageError && <p className="parent-chat-error" role="status">{t('这次未能保存到浏览器，当前页面仍可继续聊天。')}</p>}
          {selected && <div className="parent-chat-selected"><span>{t('这次聊')} · {selected.title}</span><button type="button" disabled={pendingText !== null} aria-label={t('取消引用作品')} onClick={() => setSelected(null)}>×</button></div>}
          <form className="parent-chat-composer" onSubmit={event => { event.preventDefault(); void send() }}>
            <textarea ref={textarea} rows={1} maxLength={2000} value={draft} disabled={!canChat || pendingText !== null || clearing || loadError}
              aria-label={t('想说的话')} placeholder={t('慢慢说，不用组织好语言。')}
              onChange={event => { setDraft(event.target.value); setFailed(null) }}
              onKeyDown={event => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.nativeEvent.isComposing) { event.preventDefault(); void send() } }} />
            <div className="parent-chat-composer-bottom"><span>{draft.length > 1700 ? `${draft.length}/2000` : t('Enter 换行')}</span>
              <button type="submit" disabled={!canChat || !draft.trim() || pendingText !== null || clearing || loadError}>{t('发送')}<span aria-hidden="true">↑</span></button>
            </div>
          </form>
          {isGuest ? <p className="parent-chat-footnote">{t('聊过的话自动保存，可以从历史记录接着聊。')}</p>
            : !childId ? <p className="parent-chat-footnote">{t('连接孩子的创作空间后，就可以开始聊天。')}</p>
              : snapshot && !snapshot.available ? <p className="parent-chat-footnote">{t('聊天服务暂未配置，作品建议仍可查看。')}</p>
                : <p className="parent-chat-footnote">{t('聊天按孩子分别保存，你可以随时清空。')}</p>}
        </div>
      </div>
      <aside className="parent-chat-aside" aria-label={t('作品与沟通建议')}>
        <details className="parent-chat-memory" open={memoryOpen} onToggle={event => setMemoryOpen(event.currentTarget.open)}>
          <summary><span>{t('孩子的创作')}</span><span className="parent-chat-memory-count">{works.length || ''}<span aria-hidden="true">⌄</span></span></summary>
          <div className="parent-chat-memory-body">
            <p className="parent-chat-aside-intro">{t('聊到相关的事时，可以一起回看。')}</p>
            {works.length ? <>
              <div className="parent-chat-memory-list">{displayWorks.map(work => <div className="parent-chat-memory-row" key={work.sourceId}>
                <button type="button" className="parent-chat-memory-thumbnail" aria-label={`${t('查看作品')}：${work.title}`} onClick={() => setPreview(work)}>
                  <AuthedArtwork path={work.imageUrl} token={token} kind={isGuest ? demoArtworkKind(work.sourceId) : undefined} className="absolute inset-0 h-full w-full object-contain" emptyText="查看作品" />
                </button>
                <button type="button" className="parent-chat-memory-topic" onClick={() => chooseWork(work.sourceId)} disabled={!canChat || pendingText !== null}>
                  <time dateTime={work.createdAt}>{dateLabel(work.createdAt)}</time><span>{work.title}</span><small>{t('聊聊这幅画')} ↗</small>
                </button>
              </div>)}</div>
              {works.length > 4 && <button type="button" className="parent-chat-more" onClick={() => setAllMemory(value => !value)}>{t(allMemory ? '收起作品' : '查看更多作品')}</button>}
              <p className="parent-chat-memory-note">{t('记住画里看得到的细节，把画的意思留给孩子说。')}</p>
            </> : <div className="parent-chat-memory-empty"><p>{t(isGuest ? '正式家庭的作品会出现在这里。' : '暂时没有可回看的画面观察。日常的困惑也可以直接聊。')}</p>{onChooseArtwork && !isGuest && <button type="button" onClick={onChooseArtwork}>{t('查看创作记录')}</button>}</div>}
          </div>
        </details>
        <details className="parent-chat-guides" open={guidesOpen} onToggle={event => setGuidesOpen(event.currentTarget.open)}>
          <summary><span>{t('从画作找个话题')}</span><span aria-hidden="true">⌄</span></summary>
          {guidesOpen && <ArtworkSuggestions childName={childName} childId={childId} token={token} isGuest={isGuest} onChooseArtwork={onChooseArtwork} onDiscuss={chooseWork} />}
        </details>
      </aside>
      {historyOpen && demoHistory && <ChatHistory history={demoHistory} locale={locale} onClose={() => setHistoryOpen(false)} onOpen={switchConversation} onDelete={deleteConversation} />}
      {preview && <SourcePreview guide={{ ...preview, demoKind: isGuest ? demoArtworkKind(preview.sourceId) : undefined, provenanceNote: preview.provenance === 'co-created' ? t('这幅是共创作品，话题依据孩子自己的笔迹。') : null }} token={token} onClose={() => setPreview(null)} />}
    </section>
  )
}
