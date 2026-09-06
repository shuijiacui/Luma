import { useCallback, useEffect, useState } from 'react'
import { listAnalyses, type AnalysisSummary } from '@/lib/api/authApi'

export function useChildHistory(childId?: string, token?: string) {
  const [revision, setRevision] = useState(0)
  const [state, setState] = useState<{ key: string; data: AnalysisSummary[] | null; error: string | null }>({ key: '', data: null, error: null })
  const key = childId ?? ''
  const reload = useCallback(() => setRevision(n => n + 1), [])
  useEffect(() => {
    window.addEventListener('focus', reload)
    const timer = window.setInterval(() => { if (!document.hidden) reload() }, 30000)
    return () => { window.removeEventListener('focus', reload); window.clearInterval(timer) }
  }, [reload])
  useEffect(() => {
    if (!childId || !token) return
    let active = true
    listAnalyses(childId, token).then(res => {
      if (active) setState({ key, data: res.analyses, error: null })
    }).catch(() => {
      if (active) setState({ key, data: null, error: '无法加载创作记录，请检查网络后重试。' })
    })
    return () => { active = false }
  }, [childId, token, key, revision])
  return {
    analyses: !childId || !token ? [] : state.key === key ? state.data : null,
    error: state.key === key ? state.error : null,
    reload,
  }
}
