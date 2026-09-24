import { lt, t, useLocale } from '@/i18n'
// 画面观察（家长视角）：新报告只描述可见笔迹；旧报告保留版本标记供回看
// 数据源：/api/report + /api/children/:id/analyses（判定逻辑全在后端，前端只展示，不做阈值判断、不改写文案）
import { useCallback, useEffect, useRef, useState } from 'react'

import { Button, Card } from '@/components/ui'
import {
  fetchReport,
  type Emotion,
  type ReportResponse,
} from '@/lib/api/lumaApi'
import { listAnalyses, type AnalysisSummary } from '@/lib/api/authApi'
import { authFetch } from '@/lib/api/authFetch'
import { useAuthedImage } from '@/hooks/useAuthedImage'
import { cn } from '@/lib/cn'

const EMOTION_STYLE: Record<Emotion, { label: string; className: string }> = {
  画面观察: { label: '画面观察', className: 'bg-luma-teal-50 text-luma-teal-700 border-luma-teal-100' },
  乐观平稳: { label: '乐观平稳', className: 'bg-luma-teal-50 text-luma-teal-700 border-luma-teal-100' },
  未见明显风险信号: { label: '未见明显风险信号', className: 'bg-luma-teal-50 text-luma-teal-700 border-luma-teal-100' },
  焦虑倾向: { label: '焦虑倾向', className: 'bg-luma-gold-100 text-luma-gold-700 border-luma-gold-300/50' },
  低落倾向: { label: '低落倾向', className: 'bg-[#eceefc] text-[#5a63b8] border-[#d5d9f5]' },
  需要关注: { label: '需要关注', className: 'bg-[#fdeae7] text-[#c4533f] border-[#f6d0c9]' },
  信息不足: { label: '信息不足', className: 'bg-luma-ivory-100 text-luma-muted border-luma-ivory-200' },
}
const AGE_LABELS: Record<NonNullable<ReportResponse['childAgeBand']>, string> = {
  '5-7': '5–7 岁', '8-9': '8–9 岁', '10-12': '10–12 岁',
}

function emotionStyle(emotion: string) {
  return EMOTION_STYLE[emotion as Emotion] ?? EMOTION_STYLE.信息不足
}


/**
 * 历史缩略图：图片路由要求 Authorization 头，<img> 发不出，
 * 所以经 useAuthedImage 取 blob 再渲染，令牌不进 URL。
 */
function HistoryThumb({ path, token }: { path: string; token: string }) {
  useLocale()
  const objectUrl = useAuthedImage(path, token)
  if (!objectUrl) return null
  return (
    <img
      src={objectUrl}
      alt={t("孩子的画作")}
      className="size-12 shrink-0 rounded-lg object-cover"
    />
  )
}

function formatTime(iso: string) {
  const date = new Date(iso)
  return `${date.getMonth() + 1}月${date.getDate()}日 ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

const ELEMENT_ZH: Record<string, string> = {
  person: '人物', house: '房子', tree: '树', cloud: '云', rain: '雨', sun: '太阳', moon: '月亮',
  star: '星星', flower: '花', grass: '草', animal: '小动物', mountain: '山', river: '小河', water: '溪流', bird: '小鸟',
  cat: '小猫', dog: '小狗', car: '汽车', rainbow: '彩虹', butterfly: '蝴蝶', fish: '小鱼', boat: '小船',
  fence: '栅栏', road: '小路',
}

function elementLabel(value: string) {
  return ELEMENT_ZH[value] ?? value.replaceAll('_', ' ')
}

// 趋势方向文案（描述性，不做预测、不下结论——v2 界限）
interface DrawingInsightSectionProps {
  childId?: string
  token?: string
  onUpdated?: () => void
}

export function DrawingInsightSection({ childId, token, onUpdated }: DrawingInsightSectionProps) {
  useLocale()
  const [report, setReport] = useState<ReportResponse | null>(null)
  const [reportSource, setReportSource] = useState<'latest' | 'history'>('latest')
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [history, setHistory] = useState<AnalysisSummary[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [loadError, setLoadError] = useState(false)
  const features = !!(token && childId && history.length)
  const activeId = history.some(a => a.id === selectedId) ? selectedId : history[0]?.id

  // 每次加载打一个递增的 token：childId 切换、或 handleGenerate 手动触发的重新加载，
  // 都会产生新的 token，只有最新一次请求的结果会被采纳，避免旧孩子/旧请求的数据后到覆盖新数据
  const loadTokenRef = useRef(0)
  const generationRef = useRef(0)
  useEffect(() => {
    const lifetime = generationRef
    return () => { lifetime.current++ }
  }, [])

  const loadHistory = useCallback(() => {
    if (!childId || !token) return
    setLoadError(false)
    const requestToken = ++loadTokenRef.current
    listAnalyses(childId, token)
      .then((res) => {
        if (loadTokenRef.current === requestToken) setHistory(res.analyses)
      })
      .catch(() => {
        if (loadTokenRef.current === requestToken) setLoadError(true)
      })
  }, [childId, token])

  useEffect(() => {
    loadHistory()
    const counter = loadTokenRef
    return () => { counter.current++ }
  }, [loadHistory])

  async function handleGenerate() {
    if (!activeId || !token || status === 'loading') return
    const generation = ++generationRef.current
    setStatus('loading')
    try {
      const result = await fetchReport(null, { token, analysisId: activeId })
      if (generation !== generationRef.current) return
      setReport(result)
      setReportSource('latest')
      setStatus('idle')
      loadHistory() // report 回写后刷新历史
      onUpdated?.()
    } catch {
      if (generation === generationRef.current) setStatus('error')
    }
  }

  async function deleteSelected() {
    if (!activeId || !token || status === 'loading') return
    if (!window.confirm(t('删除这幅画及其解读？该操作无法撤销。'))) return
    const generation = ++generationRef.current
    setStatus('loading')
    try {
      await authFetch('/analyses/' + activeId + '/delete', { method: 'POST', token })
      if (generation !== generationRef.current) return
      setReport(null); setSelectedId(''); setStatus('idle'); loadHistory(); onUpdated?.()
    } catch { if (generation === generationRef.current) setStatus('error') }
  }

  function handleSelectHistory(item: AnalysisSummary) {
    if (status === 'loading') return
    setSelectedId(item.id)
    setReport(item.report)
    setReportSource('history')
  }

  const style = report ? emotionStyle(report.emotion) : null
  const observation = report?.kind === 'observation-v1'

  return (
    <Card
      variant="glass"
      eyebrow="画面观察"
      title={lt('所选画作的画面观察')}
      description={lt('看看孩子画了什么，听孩子讲自己的故事')}
      className="mt-5 border-luma-teal-100"
    >
      <p className="mb-3 text-xs leading-relaxed text-luma-muted">{t('新解读将使用当前语言；已有自由文本保留生成时的语言。')}</p>
      {loadError && <p role="alert" className="text-sm text-red-700">{t("作品加载失败。")}<button onClick={loadHistory}>{t("重试")}</button></p>}
      {features && <Button variant="ghost" size="sm" disabled={status === 'loading'} onClick={deleteSelected}>{t("删除所选画作")}</Button>}
      {report && status === 'error' && <p role="alert">{t("操作失败，请稍后重试。")}</p>}
      {features && <label className="mb-3 block text-sm">{t("选择画作")}<select className="ml-2 rounded-lg border p-2" value={activeId ?? ''} disabled={status === 'loading'} onChange={e => {
          const item = history.find(a => a.id === e.target.value)
          if (item) handleSelectHistory(item)
        }}>
          {history.map(a => <option key={a.id} value={a.id}>{lt(formatTime(a.createdAt))} · {lt(a.summary.elements.map(elementLabel).join('、') || '小画')}{lt(a.report ? '' : '（未解读）')}</option>)}
        </select>
      </label>}
      {!report ? (
        <div className="mt-2 flex flex-wrap items-center gap-3">
          {features ? (
            <Button variant="secondary" onClick={handleGenerate} disabled={status === 'loading'}>
              {lt(status === 'loading' ? '正在解读…' : '生成画面解读')}
            </Button>
          ) : (
            <p className="text-sm text-luma-muted">
              {lt(token ? '正在读取家庭画作；完成创作后可在任意设备生成解读。' : '演示内容不生成真实家庭报告。')}
            </p>
          )}
          {status === 'error' && (
            <span className="text-sm font-semibold text-[#c4533f]">
              {t("解读服务暂时不可用，请确认后端已启动后重试")}</span>
          )}
        </div>
      ) : (
        <div className="mt-2 space-y-5">
          <div className="flex flex-wrap items-center gap-4">
            <span
              className={cn(
                'rounded-full border px-4 py-1.5 text-sm font-bold',
                style?.className,
              )}
            >
              {observation ? lt('画面观察') : lt('历史旧版报告')}
            </span>
            {observation && report.childAgeBand && (
              <span className="rounded-full bg-luma-ivory-50 px-3 py-1 text-xs font-semibold text-luma-teal-700">
                {lt(AGE_LABELS[report.childAgeBand])}
              </span>
            )}
            {reportSource === 'history' && (
              <span className="text-xs font-semibold text-luma-muted">{t("（历史解读）")}</span>
            )}
          </div>

          {report.narrative && (
            <div className="rounded-xl border border-luma-ivory-200 bg-white px-4 py-3 text-sm leading-relaxed text-luma-teal-900">
              {report.narrative}
            </div>
          )}

          {report.evidence.length > 0 && (
            <div>
              <div className="luma-eyebrow text-luma-gold-700">{observation ? lt('画面里看到') : lt('历史旧版依据')}</div>
              <ul className="mt-2 space-y-2">
                {report.evidence.map((item) => (
                  <li
                    key={item.entryId}
                    className="rounded-xl bg-luma-ivory-50 px-3.5 py-2.5 text-sm leading-relaxed"
                  >
                    <span className={item.plain ? 'text-luma-teal-900' : 'text-luma-muted'}>
                      {lt(item.plain ?? item.summary)}
                    </span>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <span className="font-mono text-[11px] font-bold text-luma-teal-600">
                        {lt(item.entryId)}
                      </span>
                      {item.clusterLabel && (
                        <span className="rounded-full bg-luma-teal-50 px-2 py-0.5 text-[11px] font-semibold text-luma-teal-700">
                          {lt(item.clusterLabel)}
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <div className="luma-eyebrow text-luma-gold-700">{t("沟通建议")}</div>
            {observation && report.ageContext && <p className="mt-2 text-xs leading-relaxed text-luma-muted">{lt(report.ageContext)}</p>}
            <ul className="mt-2 space-y-2">
              {report.parentAdvice.map((advice) => (
                <li key={advice} className="flex items-start gap-2.5 text-sm leading-relaxed text-luma-teal-900">
                  <span className="mt-2 size-1.5 shrink-0 rounded-full bg-luma-gold-300" />
                  {lt(advice)}
                </li>
              ))}
            </ul>
          </div>

          {report.webAdvice && report.webAdvice.length > 0 && (
            <div>
              <div className="luma-eyebrow text-luma-teal-700">
                {lt(report.webAdviceSource ?? '延伸建议')}
              </div>
              <ul className="mt-2 space-y-2">
                {report.webAdvice.map((advice) => (
                  <li key={advice} className="flex items-start gap-2.5 text-sm leading-relaxed text-luma-muted">
                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-luma-ivory-300" />
                    {lt(advice)}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {report.referenceEvidence && report.referenceEvidence.length > 0 && (
            <div>
              <div className="luma-eyebrow text-luma-teal-700">
                {lt(report.referenceEvidenceSource ?? '文献背景')}
              </div>
              <ul className="mt-2 space-y-2">
                {report.referenceEvidence.map((item, index) => (
                  <li key={`${item.sourceFile}-${index}`} className="rounded-xl bg-luma-ivory-50 px-3.5 py-2.5 text-sm leading-relaxed text-luma-muted">
                    <span className="text-luma-teal-900">{lt(item.text)}</span>
                    <div className="mt-1 text-xs text-luma-muted">
                      {t("局限：")}{lt(item.limitation)}
                    </div>
                    <div className="mt-1 font-mono text-[11px] text-luma-teal-600">
                      {t("文献来源：")}{item.sourceFile}{item.sourcePage ? ` · PDF p. ${item.sourcePage}` : ''}
                    </div>
                    {item.sourceUrl && <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-xs font-semibold text-luma-teal-700 underline underline-offset-2">{lt('查看原文')}</a>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="rounded-xl bg-luma-teal-50 px-4 py-3 text-xs leading-relaxed text-luma-teal-700">
            {observation ? lt('这里只描述单幅画中可见的内容。模型可能看错；孩子自己的讲述比画面猜测更重要。')
              : lt('这份历史旧版报告包含未经目标人群验证的规则分值，不应据此判断孩子的心理状态。可以重新生成画面观察。')}</div>

          {features && (
            <Button variant="ghost" size="sm" onClick={handleGenerate} disabled={status === 'loading'}>
              {lt(status === 'loading' ? '正在解读…' : '重新解读所选画作')}
            </Button>
          )}
        </div>
      )}

      {token && history.length > 0 && (
        <div className="mt-6 border-t border-luma-ivory-200 pt-5">
          <div className="luma-eyebrow text-luma-gold-700">{t("历史解读")}</div>
          <ul className="mt-3 space-y-2">
            {history.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => handleSelectHistory(item)}
                  disabled={status === 'loading'}
                  className={cn(
                    'flex w-full items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-left text-sm transition',
                    item.report
                      ? 'border-luma-ivory-200 bg-white hover:border-luma-teal-100 hover:bg-luma-teal-50'
                      : 'cursor-default border-luma-ivory-200 bg-luma-ivory-50 text-luma-muted',
                  )}
                >
                  <span className="text-luma-muted">{lt(formatTime(item.createdAt))}</span>
                  <span className="flex-1 truncate font-semibold text-luma-teal-900">
                    {lt(item.summary.elements.length > 0
                      ? `画了 ${item.summary.elements.map(elementLabel).join('、')}`
                      : '画面元素较少')}
                  </span>
                  {item.imageUrl && token && (
                    <HistoryThumb path={item.imageUrl} token={token} />
                  )}
                  {item.report ? (
                    <span
                      className={cn(
                        'shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-bold',
                        emotionStyle(item.report.emotion).className,
                      )}
                    >
                      {item.report.kind === 'observation-v1' ? lt('画面观察') : lt('历史旧版报告')}
                    </span>
                  ) : (
                    <span className="shrink-0 text-xs">{t("未生成解读")}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  )
}
