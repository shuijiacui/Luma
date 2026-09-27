import { lt, t, useLocale } from '@/i18n'
import { useState } from 'react'
import { authFetch } from '@/lib/api/authFetch'
import { Button } from '@/components/ui'
import './family-settings-details.css'

export function ChildBirthDate({ childId, initial, token, onSaved }: { childId: string; initial?: string | null; token: string; onSaved: () => void }) {
  useLocale()
  const [value, setValue] = useState(initial ?? '')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  return <form className="family-birth-form" onSubmit={async e => {
    e.preventDefault(); setBusy(true)
    try {
      await authFetch(`/children/${childId}/profile`, { method: 'POST', token, body: { birthDate: value || null } })
      setStatus('已保存；新生成的解读会采用该年龄。'); onSaved()
    } catch { setStatus('保存失败，请确认日期后重试。') } finally { setBusy(false) }
  }}>
    <div className="family-birth-fields">
      <label className="family-birth-label"><span>{t("出生日期（由家长填写）")}</span><input type="date" value={value} max={new Date().toISOString().slice(0, 10)} onChange={e => setValue(e.target.value)} className="family-birth-input" /></label>
      <Button disabled={busy} size="sm" variant="secondary" type="submit" className="family-birth-save">{t("保存日期")}</Button>
    </div>
    <p role="status" className="family-birth-status">{lt(status || '用于按年龄处理画面特征；留空时不推测年龄。')}</p>
  </form>
}
