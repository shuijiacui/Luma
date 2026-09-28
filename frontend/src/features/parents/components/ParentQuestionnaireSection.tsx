import { lt, t, useLocale } from '@/i18n'
import { Button } from '@/components/ui'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  PARENT_QUESTIONNAIRE_ANSWER_OPTIONS,
  PARENT_QUESTIONNAIRE_DIMENSIONS,
  PARENT_QUESTIONNAIRE_QUESTIONS,
  normalizeParentQuestionnaireAnswers,
  type ParentQuestionnaireAnswers,
} from '../../../../../shared/parentQuestionnaire.mjs'
import { ApiError } from '@/lib/api/client'
import {
  listParentQuestionnaireRecords,
  saveParentQuestionnaireRecord,
  setQuestionnairePreference,
  questionnaireDraftKey,
  readQuestionnaireDraft,
  type ParentQuestionnaireRecord,
} from '@/lib/api/parentQuestionnaireApi'
import { ArrowLeftIcon, HeartIcon, TimelineIcon } from './dashboard/icons'
import './family-settings.css'

type View = 'overview' | 'form' | 'history' | 'result'

function scoreMessage(score: number) {
  if (score >= 75) return { title: '支持性资源较充足', detail: '最近一个月，你在连接、沟通与接纳方面有不少可依靠的资源。' }
  if (score >= 50) return { title: '正在积累陪伴支持', detail: '陪伴里既有稳定的时刻，也有一些需要被照顾的感受。' }
  return { title: '最近可以多照顾自己一点', detail: '你辛苦了，照顾自己的感受和照顾孩子同样重要。' }
}

function deltaText(value: number | null) {
  if (value === null) return t('首次记录')
  if (Math.abs(value) < 0.05) return t('与上次相同')
  return value > 0 ? t(`比上次高 ${value.toFixed(1)} 分`) : t(`比上次低 ${Math.abs(value).toFixed(1)} 分`)
}

function formatDate(value: string, locale: 'zh' | 'en') {
  return new Date(value).toLocaleString(locale === 'en' ? 'en-US' : 'zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function ScoreBreakdown({ record, previous, previousPending = false }: { record: ParentQuestionnaireRecord; previous?: ParentQuestionnaireRecord; previousPending?: boolean }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {PARENT_QUESTIONNAIRE_DIMENSIONS.map(dimension => {
        const score = record.scores.dimensions[dimension.id].score
        const previousScore = previous?.scores.dimensions[dimension.id].score
        const delta = previousScore === undefined ? null : score - previousScore
        return (
          <div key={dimension.id} className="rounded-2xl border border-[#efe8d9] bg-[#fdfcf8] p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="text-sm font-bold text-[#3a463c]">{t(dimension.label)}</div>
              <span className="text-xs font-semibold text-[#8f856c]">{Math.round(score)}</span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#eee7d7]">
              <div className="h-full rounded-full bg-gradient-to-r from-luma-grass-300 to-luma-teal-500" style={{ width: `${score}%` }} />
            </div>
            <div className="mt-2 text-[0.68rem] text-[#9a9280]">{previousPending ? t('加载更早记录后可比较') : deltaText(delta)}</div>
          </div>
        )
      })}
    </div>
  )
}

function AnswerReview({ record }: { record: ParentQuestionnaireRecord }) {
  return (
    <div className="divide-y divide-[#f0eadf] rounded-2xl bg-[#faf8f2] px-4">
      {PARENT_QUESTIONNAIRE_QUESTIONS.map(question => {
        const option = PARENT_QUESTIONNAIRE_ANSWER_OPTIONS.find(item => item.value === record.answers[question.id])
        return (
          <div key={question.id} className="grid gap-1 py-3 text-xs leading-relaxed sm:grid-cols-[1fr_auto] sm:gap-5">
            <span className="text-[#6f786d]">{question.number}. {lt(question.text)}</span>
            <strong className="text-[#334038]">{lt(option?.label ?? '')}</strong>
          </div>
        )
      })}
    </div>
  )
}

interface QuestionnaireProps {
  ownerId: string; token?: string; embedded?: boolean; onExpandedChange?: (expanded: boolean) => void
  children?: { id: string; nickname: string }[]; selectedChildId?: string
}

export function ParentQuestionnaireSection(props: QuestionnaireProps) {
  const children = props.children ?? []
  const [choice, setChoice] = useState(props.selectedChildId ?? children[0]?.id ?? '')
  const childId = children.some(child => child.id === choice) ? choice : null
  const childName = children.find(child => child.id === childId)?.nickname
  const selector = children.length > 0 ? <label className="family-questionnaire-child">{t('这次想回顾与谁的相处？')}
    <select value={childId ?? ''} onChange={event => setChoice(event.target.value)}>
      {children.map(child => <option key={child.id} value={child.id}>{child.nickname}</option>)}
      <option value="">{t('未关联孩子的记录')}</option>
    </select>
  </label> : null
  return <QuestionnaireWorkspace key={`${props.ownerId}:${Boolean(props.token)}:${childId}`} {...props} childId={childId} childName={childName} selector={selector} />
}

function QuestionnaireWorkspace({ ownerId, token, embedded = false, onExpandedChange, childId, childName, selector }: QuestionnaireProps & {
  childId: string | null; childName?: string; selector: ReactNode
}) {
  const locale = useLocale()
  const [records, setRecords] = useState<ParentQuestionnaireRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [loadRevision, setLoadRevision] = useState(0)
  const [view, setView] = useState<View>('overview')
  const [step, setStep] = useState(0)
  const [childAge, setChildAge] = useState('')
  const [answers, setAnswers] = useState<Partial<ParentQuestionnaireAnswers>>({})
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [savedRecord, setSavedRecord] = useState<ParentQuestionnaireRecord | null>(null)
  const [nextOffset, setNextOffset] = useState<number | null>(null)
  const [latestRevision, setLatestRevision] = useState(0)
  const [total, setTotal] = useState(0)
  const [loadingMore, setLoadingMore] = useState(false)
  const [historyError, setHistoryError] = useState('')
  const [enabled, setEnabled] = useState(false)
  const [preferenceBusy, setPreferenceBusy] = useState(false)
  const [preferenceError, setPreferenceError] = useState('')
  const draftKey = questionnaireDraftKey(ownerId, childId, Boolean(token))
  const [draft, setDraft] = useState(() => readQuestionnaireDraft(draftKey))
  const [draftError, setDraftError] = useState(false)
  const [baseRevision, setBaseRevision] = useState(0)
  const [conflict, setConflict] = useState(false)
  const section = useRef<HTMLElement>(null)
  const previousView = useRef<View>('overview')
  useEffect(() => { onExpandedChange?.(view !== 'overview') }, [view, onExpandedChange])
  useEffect(() => {
    if (view === previousView.current) return
    previousView.current = view
    const frame = window.requestAnimationFrame(() => {
      const element = section.current
      if (!element) return
      element.scrollIntoView?.({ block: 'start', behavior: 'instant' })
      const target = view === 'overview' ? element.querySelector<HTMLButtonElement>('.family-questionnaire-start-button') : element.querySelector<HTMLButtonElement>('button')
      target?.focus({ preventScroll: true })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [view])
  const detailClass = embedded ? 'family-questionnaire-detail' : 'rounded-[1.9rem] border border-white/70 bg-white/95 p-6 shadow-luma-card backdrop-blur-sm sm:p-7'

  useEffect(() => {
    let active = true
    setLoading(true)
    listParentQuestionnaireRecords(ownerId, token, 0, childId)
      .then(page => {
        if (!active) return
        setRecords(page.records)
        setNextOffset(page.nextOffset)
        setLatestRevision(page.latestRevision)
        setTotal(page.total)
        setEnabled(page.enabled)
        setLoadError('')
      })
      .catch(error => {
        if (active) setLoadError(error instanceof Error ? error.message : '问卷记录加载失败，请稍后重试。')
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [ownerId, token, loadRevision, childId])

  useEffect(() => {
    if (view !== 'form') return
    const value = { childAge, answers, step, revision: baseRevision }
    setDraft(value)
    try { localStorage.setItem(draftKey, JSON.stringify(value)); setDraftError(false) }
    catch { setDraftError(true) }
  }, [view, childAge, answers, step, baseRevision, draftKey])

  async function togglePreference() {
    if (!token || !childId || preferenceBusy) return
    setPreferenceBusy(true); setPreferenceError('')
    try { setEnabled((await setQuestionnairePreference(childId, !enabled, token)).enabled) }
    catch { setPreferenceError('设置未保存，请重试。') }
    finally { setPreferenceBusy(false) }
  }

  async function loadMore() {
    if (nextOffset === null || loadingMore) return
    setLoadingMore(true); setHistoryError('')
    try {
      const page = await listParentQuestionnaireRecords(ownerId, token, nextOffset, childId)
      if (page.latestRevision !== latestRevision) {
        setLoadRevision(value => value + 1)
        setHistoryError('记录已更新，已重新加载最新记录，请继续查看更多。')
        return
      }
      setRecords(current => [...current, ...page.records.filter(item => !current.some(record => record.id === item.id))])
      setNextOffset(page.nextOffset)
    } catch { setHistoryError('历史记录加载失败，请重试。') }
    finally { setLoadingMore(false) }
  }

  const latest = records[0]
  const ageNumber = Number(childAge)
  const ageValid = Number.isInteger(ageNumber) && ageNumber >= 5 && ageNumber <= 12
  const completeAnswers = useMemo(() => normalizeParentQuestionnaireAnswers(answers), [answers])

  function beginForm(record?: ParentQuestionnaireRecord) {
    setChildAge(draft?.childAge ?? (record ? String(record.childAge) : ''))
    setAnswers(draft?.answers ?? (record ? { ...record.answers } : {}))
    setStep(draft?.step ?? 0)
    setBaseRevision(draft?.revision ?? latestRevision)
    setConflict(false)
    setSaveError('')
    setView('form')
  }

  function openHistory() {
    setSaveError('')
    setView('history')
  }

  async function submit() {
    if (!completeAnswers || !ageValid || saving) {
      setSaveError('请确认孩子年龄并完成全部题目。')
      return
    }
    setSaving(true)
    setSaveError('')
    try {
      const saved = await saveParentQuestionnaireRecord(ownerId, {
        revision: baseRevision,
        childId,
        childAge: ageNumber,
        answers: completeAnswers,
      }, token)
      setRecords(current => [saved, ...current.filter(item => item.id !== saved.id)])
      setSavedRecord(saved)
      setLatestRevision(saved.revision)
      setTotal(value => value + 1)
      setNextOffset(value => value === null ? null : value + 1)
      setDraft(null)
      try { localStorage.removeItem(draftKey) } catch { /* The saved server record remains authoritative. */ }
      setView('result')
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : '保存失败，请稍后重试。')
      if (error instanceof ApiError && error.status === 409) { setConflict(true); setLoadRevision(value => value + 1) }
    } finally {
      setSaving(false)
    }
  }

  if (loading && records.length === 0) {
    return (
      <section className={embedded ? 'family-questionnaire-loading' : 'rounded-[1.9rem] border border-white/70 bg-white/95 p-6 text-sm text-[#9a9280] shadow-luma-card sm:p-7'} role="status">
        {t('正在加载问卷记录…')}
      </section>
    )
  }

  if (view === 'form') {
    const question = step > 0 ? PARENT_QUESTIONNAIRE_QUESTIONS[step - 1] : null
    return (
      <section ref={section} className={detailClass}>
        <div className="flex items-center justify-between gap-3">
          <button type="button" onClick={() => setView('overview')} className="inline-flex items-center gap-2 text-sm font-semibold text-luma-teal-700">
            <ArrowLeftIcon className="size-4" />{t('返回家庭设置')}
          </button>
          <span className="text-xs font-semibold text-[#9a9280]">{lt(step > 0 ? `${step}/15` : '准备开始')}</span>
        </div>
        <p className="mt-4 text-center text-xs text-[#7d8777]">{childName ?? t('未关联孩子的记录')} · {t('回顾最近一个月')}</p>
        <p className="mt-2 text-center text-xs text-[#7d8777]" role="status">{t(draftError ? '草稿暂时无法保存，请保持页面打开并完成提交。' : '填写进度会保存在此浏览器，可稍后继续。')}</p>

        {step === 0 ? (
          <div className="mx-auto max-w-xl py-8 text-center sm:py-12">
            <div className="mx-auto grid size-16 place-items-center rounded-full bg-luma-grass-50 text-luma-grass-700">
              <HeartIcon className="size-7" />
            </div>
            <h2 className="mt-5 font-display text-2xl font-bold text-[#2c3a33]">{t('先说说孩子的年龄')}</h2>
            <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-[#7d8777]">{t('记录填写时的年龄，方便以后回顾。')}</p>
            <label className="mx-auto mt-6 block max-w-xs text-left text-sm font-semibold text-[#4c594f]">
              {t('孩子年龄')}
              <span className="relative mt-2 block">
                <input
                  type="number"
                  min={5}
                  max={12}
                  inputMode="numeric"
                  value={childAge}
                  onChange={event => setChildAge(event.target.value)}
                  className="w-full rounded-2xl border border-[#e7dfcf] bg-[#fdfcf8] px-4 py-3 pr-12 text-base outline-none transition focus:border-luma-grass-400 focus:ring-4 focus:ring-luma-grass-100"
                  aria-label={t('孩子年龄')}
                />
                <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm text-[#9a9280]">{t('岁')}</span>
              </span>
            </label>
            {!ageValid && childAge && <p className="mt-2 text-xs text-[#b8792c]">{t('请填写 5–12 岁之间的整数')}</p>}
            <Button className="mt-6 bg-luma-grass-600 hover:bg-luma-grass-700" disabled={!ageValid} onClick={() => setStep(1)}>
              {t('开始 15 道题')}
            </Button>
          </div>
        ) : question ? (
          <div className="mx-auto max-w-2xl py-7 sm:py-10">
            <div className="h-1 overflow-hidden rounded-full bg-[#eee7d7]">
              <div className="h-full rounded-full bg-luma-grass-500 transition-all duration-300" style={{ width: `${(step / 15) * 100}%` }} />
            </div>
            <p className="mt-3 text-center text-xs text-[#9a9280]">{t('还有几题就完成了，感谢您的耐心。')}</p>
            <div className="mt-8 text-center">
              <div className="luma-eyebrow text-[0.66rem] tracking-[0.2em] text-[#9b8a5f]">{t(`第 ${question.number} 题`)}</div>
              <h2 className="mx-auto mt-4 max-w-xl font-display text-xl font-bold leading-relaxed text-[#2c3a33] sm:text-2xl">{lt(question.text)}</h2>
            </div>
            <div className="mt-8 grid grid-cols-2 gap-3">
              {PARENT_QUESTIONNAIRE_ANSWER_OPTIONS.map(option => {
                const selected = answers[question.id] === option.value
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setAnswers(current => ({ ...current, [question.id]: option.value }))}
                    className={`rounded-2xl border px-4 py-4 text-left transition ${selected
                      ? 'border-luma-grass-400 bg-luma-grass-50 text-luma-grass-700 shadow-sm'
                      : 'border-[#e9e2d4] bg-[#fdfcf8] text-[#667067] hover:border-luma-grass-200 hover:bg-white'}`}
                  >
                    <span className="block font-brand text-lg font-bold">{option.value}</span>
                    <span className="mt-1 block text-sm font-semibold">{t(option.label)}</span>
                  </button>
                )
              })}
            </div>
            <div className="mt-8 flex items-center justify-between gap-3">
              <Button variant="ghost" disabled={saving} onClick={() => setStep(value => Math.max(0, value - 1))}>{t('上一题')}</Button>
              {step < 15 ? (
                <Button disabled={!answers[question.id]} onClick={() => setStep(value => value + 1)}>{t('下一题')}</Button>
              ) : (
                <Button isLoading={saving} disabled={!completeAnswers || !ageValid} onClick={submit}>{t('保存这次记录')}</Button>
              )}
            </div>
            {saveError && <p role="alert" className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{lt(saveError)}</p>}
            {conflict && <Button variant="secondary" disabled={loading || Boolean(loadError)} onClick={() => { setBaseRevision(latestRevision); setConflict(false); setSaveError('') }}>{t('保留答案，更新保存版本')}</Button>}
            {conflict && loadError && <button type="button" onClick={() => setLoadRevision(value => value + 1)}>{t('重试')}</button>}
          </div>
        ) : null}
      </section>
    )
  }

  if (view === 'result' && savedRecord) {
    const previous = records.find(record => record.revision < savedRecord.revision)
    const delta = previous ? savedRecord.scores.total - previous.scores.total : null
    const message = scoreMessage(savedRecord.scores.total)
    return (
      <section ref={section} className={detailClass}>
        <button type="button" onClick={() => setView('overview')} className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-luma-teal-700">
          <ArrowLeftIcon className="size-4" />{t('返回家庭设置')}
        </button>
        <div className="rounded-[1.65rem] bg-gradient-to-br from-[#f3f8ed] to-[#fdf8ed] p-6 text-center sm:p-8">
          <div className="mx-auto grid size-14 place-items-center rounded-full bg-white text-luma-grass-600 shadow-sm"><HeartIcon className="size-6" /></div>
          <div className="mt-4 text-xs font-semibold tracking-[0.15em] text-[#9a8f7a]">{t('本次陪伴感受概览')}</div>
          <h2 className="mt-2 font-display text-2xl font-bold text-[#2c3a33]">{t(message.title)}</h2>
          <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-[#6f786d]">{t(message.detail)}</p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2 text-xs text-[#8f856c]">
            <span className="rounded-full bg-white/80 px-3 py-1.5">{t(`记录版本 ${savedRecord.revision}`)}</span>
            <span className="rounded-full bg-white/80 px-3 py-1.5">{t('支持性资源')} {Math.round(savedRecord.scores.total)}</span>
            <span className="rounded-full bg-white/80 px-3 py-1.5">{deltaText(delta)}</span>
          </div>
        </div>
        <div className="mt-5"><ScoreBreakdown record={savedRecord} previous={previous} /></div>
        <details className="mt-5 rounded-2xl border border-[#efe8d9] px-4 py-3">
          <summary className="cursor-pointer text-sm font-semibold text-[#4c594f]">{t('查看本次作答')}</summary>
          <div className="mt-3"><AnswerReview record={savedRecord} /></div>
        </details>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button variant="secondary" onClick={() => beginForm(savedRecord)}>{t('继续修改')}</Button>
          <Button onClick={openHistory}>{t('查看填写记录与变化')}</Button>
        </div>
      </section>
    )
  }

  if (view === 'history') {
    const latestRecord = records[0]
    const previousRecord = records[1]
    const totalDelta = latestRecord && previousRecord ? latestRecord.scores.total - previousRecord.scores.total : null
    return (
      <section ref={section} className={detailClass}>
        <button type="button" onClick={() => setView('overview')} className="inline-flex items-center gap-2 text-sm font-semibold text-luma-teal-700">
          <ArrowLeftIcon className="size-4" />{t('返回家庭设置')}
        </button>
        <div className="mt-5">
          <div className="luma-eyebrow text-[0.66rem] tracking-[0.2em] text-[#9b8a5f]">{t('填写历史')}</div>
          <h2 className="mt-1.5 font-display text-xl font-bold text-[#2c3a33]">{t('填写记录与变化')}</h2>
          <p className="mt-2 text-sm leading-relaxed text-[#7d8777]">{t('每次提交都会保留一个版本，可以回看感受和维度的变化。')}</p>
        </div>

        {latestRecord ? (
          <>
            <div className="mt-5 rounded-2xl border border-luma-grass-100 bg-luma-grass-50/70 p-5">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <div className="text-xs font-semibold text-[#7d8777]">{t('最近一次填写')} · {formatDate(latestRecord.createdAt, locale)}</div>
                  <div className="mt-1 font-display text-xl font-bold text-[#2c3a33]">{t('支持性资源')} {Math.round(latestRecord.scores.total)}</div>
                </div>
                <div className={`rounded-full px-3 py-1.5 text-xs font-bold ${totalDelta === null || Math.abs(totalDelta) < 0.05 ? 'bg-white text-[#8f856c]' : totalDelta > 0 ? 'bg-white text-luma-grass-700' : 'bg-white text-[#b8792c]'}`}>
                  {deltaText(totalDelta)}
                </div>
              </div>
            </div>

            <ol className="mt-5 space-y-3">
              {records.map((record, index) => {
                const previous = records[index + 1]
                const delta = previous ? record.scores.total - previous.scores.total : null
                return (
                  <li key={record.id}>
                    <details open={index === 0} className="group rounded-2xl border border-[#efe8d9] bg-[#fdfcf8]">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-4 [&::-webkit-details-marker]:hidden">
                        <span>
                          <strong className="block text-sm text-[#334038]">{t(`记录版本 ${record.revision}`)}</strong>
                          <span className="mt-1 block text-xs text-[#9a9280]">{formatDate(record.createdAt, locale)} · {record.childAge} {t('岁')}</span>
                        </span>
                        <span className="text-right">
                          <strong className="block font-display text-xl text-[#334038]">{Math.round(record.scores.total)}</strong>
                          <span className="mt-1 block text-[0.68rem] text-[#9a9280]">{!previous && nextOffset !== null ? t('加载更早记录后可比较') : deltaText(delta)}</span>
                        </span>
                      </summary>
                      <div className="border-t border-[#f0eadf] p-4">
                        <ScoreBreakdown record={record} previous={previous} previousPending={!previous && nextOffset !== null} />
                        <details className="mt-4 rounded-2xl border border-[#efe8d9] px-4 py-3">
                          <summary className="cursor-pointer text-xs font-semibold text-[#4c594f]">{t('查看本次作答')}</summary>
                          <div className="mt-3"><AnswerReview record={record} /></div>
                        </details>
                      </div>
                    </details>
                  </li>
                )
              })}
            </ol>
            {historyError && <p className="mt-4 text-sm" role="alert">{t(historyError)}</p>}
            {nextOffset !== null && <Button className="mt-5" variant="secondary" isLoading={loadingMore} onClick={loadMore}>{t('加载更早记录')}</Button>}
          </>
        ) : (
          <div className="mt-5 rounded-2xl bg-[#faf7ef] p-8 text-center text-sm text-[#9a9280]">{t('还没有填写记录。')}</div>
        )}
      </section>
    )
  }

  const message = latest ? scoreMessage(latest.scores.total) : null
  return (
    <section ref={section} data-onboarding="parent-questionnaire" className={`family-questionnaire-overview${embedded ? '' : ' is-standalone'}`} aria-labelledby="family-questionnaire-title">
      <div className="family-settings-section-heading"><span className="family-settings-section-icon"><HeartIcon /></span>
        <div><h2 id="family-questionnaire-title">{t('亲子日常陪伴小调查')}</h2><p>{t('也留一点时间，照顾自己的感受。')}</p></div>
      </div>
      <p className="family-questionnaire-intro">{t('用几分钟回顾最近一个月的陪伴感受。答案没有对错，也不是对你或孩子的评价。')}</p>
      {selector}
      <div className="family-questionnaire-meta"><span>{t('15 道题')}</span><i aria-hidden="true" /><span>{t('约 2 分钟')}</span><i aria-hidden="true" /><span>{t('可随时修改')}</span></div>

      {loadError && <div role="alert" className="family-questionnaire-error"><p>{lt(loadError)}</p><button type="button" onClick={() => setLoadRevision(value => value + 1)}>{t('重试')}</button></div>}

      <div className="family-questionnaire-start">
        {latest && message ? <div className="family-questionnaire-latest"><p>{t('最近一次填写')} · {formatDate(latest.createdAt, locale)}</p><strong>{t(message.title)}</strong></div>
          : <p>{t('从最近的日常开始，按自己的感受回答。')}</p>}
        <Button className="family-questionnaire-start-button" onClick={() => beginForm(latest)} disabled={Boolean(loadError)}>
          {t(draft ? '继续未完成的问卷' : latest ? '继续了解' : '开始了解')}<span aria-hidden="true"> ↗</span>
        </Button>
      </div>
      {draft && <button type="button" className="mt-2 text-xs text-[#7d8777]" onClick={() => {
        try { localStorage.removeItem(draftKey); setDraft(null); setDraftError(false) } catch { setDraftError(true) }
      }}>{t('放弃这份草稿')}</button>}
      {draftError && <p role="alert" className="text-xs">{t('草稿暂时无法保存，请保持页面打开并完成提交。')}</p>}

      <button type="button" disabled={records.length === 0} onClick={openHistory} className="family-questionnaire-history">
        <TimelineIcon /><span><strong>{t('查看填写记录与变化')}</strong><small>{total ? t(`共 ${total} 次记录`) : t('还没有填写记录。')}</small></span><span aria-hidden="true">›</span>
      </button>
      {token && childId && <div className="family-questionnaire-preference">
        <label><span>{t('让沟通助手参考这份问卷')}</span><input type="checkbox" role="switch" checked={enabled} disabled={preferenceBusy || Boolean(loadError)} onChange={togglePreference} /></label>
        <p>{t('开启后，聊天会参考你为这个孩子填写的最近 90 天内的最新回答摘要；默认关闭，可随时调整。')}</p>
        <p>{t('关闭后不再读取问卷，已经生成的聊天仍会保留。')}</p>
        {enabled && (!latest || Date.now() - Date.parse(latest.createdAt) > 90 * 86400000) && <p>{t('填写一份近期问卷后，助手才能参考。')}</p>}
        {preferenceError && <p role="alert">{t(preferenceError)}</p>}
      </div>}
      <p className="family-questionnaire-note">{t(!token ? '游客问卷与草稿只保存在此浏览器，用于个人回顾。' : !childId ? '这些记录尚未关联孩子，不会用于聊天。请选择孩子后填写一份新记录。' : '问卷与你的孩子创作记录分开保存，仅你自己的沟通助手可按设置参考。')}</p>
    </section>
  )
}
