import { useEffect, useRef, useState } from 'react'
import { t } from '@/i18n'
import type { ParentConversation } from '@/lib/api/communicationApi'

export function ChatHistory({ history, locale, childName, persistent = false, busy = false, error, onClose, onOpen, onDelete }: {
  history: { activeId: string; conversations: ParentConversation[] }; locale: 'zh' | 'en'; onClose: () => void
  childName?: string; persistent?: boolean; busy?: boolean; error?: string
  onOpen: (id: string) => void; onDelete: (id: string) => boolean | Promise<boolean>
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  useEffect(() => {
    const element = dialog.current
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    element?.showModal()
    return () => { element?.close(); previousFocus?.focus() }
  }, [])
  const conversations = history.conversations.filter(item => item.turnCount > 0)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  const date = (value: string) => new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'zh-CN', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date(value))
  return <dialog ref={dialog} className="parent-chat-history" aria-labelledby="chat-history-title"
    onCancel={event => { event.preventDefault(); onClose() }} onClick={event => { if (event.target === event.currentTarget) onClose() }}>
    <div className="parent-chat-history-panel">
      <header><div><h2 id="chat-history-title">{t('历史记录')}</h2><p>{childName && <>{childName} · </>}{t('想接着聊的事，都在这里。')}</p></div>
        <button type="button" aria-label={t('关闭历史记录')} onClick={onClose}>×</button></header>
      <div className="parent-chat-history-list">
        {error && <p className="parent-chat-error" role="alert">{error}</p>}
        {conversations.length ? <ul>{conversations.map(({ id, title, lastReply, updatedAt }) => {
          return <li key={id} className={id === history.activeId ? 'is-current' : ''}>
            <div className="parent-chat-history-row"><button type="button" className="parent-chat-history-open" disabled={busy} onClick={() => onOpen(id)}
              aria-label={`${t('继续对话')}：${title}`} aria-current={id === history.activeId ? 'true' : undefined}>
              <span className="parent-chat-history-meta"><time dateTime={updatedAt}>{date(updatedAt)}</time>
                {id === history.activeId && <small>{t('当前对话')}</small>}</span>
              <strong>{title}</strong><span className="parent-chat-history-excerpt">{lastReply}</span>
            </button><button type="button" className="parent-chat-history-delete" aria-label={`${t('删除对话')}：${title}`}
              disabled={busy} onClick={() => setDeleting(id)}><TrashIcon /></button></div>
            {deleting === id && <div className="parent-chat-history-confirm" role="alert">
              <p>{t('删除后，这段对话无法恢复。')}</p><div><button type="button" disabled={busy} onClick={() => setDeleting(null)}>{t('取消')}</button>
                <button type="button" disabled={busy} onClick={async () => { if (await onDelete(id)) setDeleting(null) }}>{t('确认删除')}</button></div>
            </div>}
          </li>
        })}</ul> : <div className="parent-chat-history-empty"><HistoryIcon /><h3>{t('聊过的话，会留在这里')}</h3><p>{t('发出第一句话后，就会自动保存。')}</p></div>}
      </div>
      <footer>{t(persistent ? '保存在账号中，按孩子分别记录' : '保存在当前浏览器')}</footer>
    </div>
  </dialog>
}

export function HistoryIcon() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 11a9 9 0 1 1 2.4 7M3 4v7h7M12 7v5l3 2" /></svg>
}

export function TrashIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7" /></svg>
}
