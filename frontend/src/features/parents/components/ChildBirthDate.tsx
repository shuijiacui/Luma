import { useState } from 'react'
import { authFetch } from '@/lib/api/authFetch'
import { Button } from '@/components/ui'

export function ChildBirthDate({ childId, initial, token, onSaved }: { childId: string; initial?: string | null; token: string; onSaved: () => void }) {
  const [value, setValue] = useState(initial ?? '')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  return <form className="mt-4 flex flex-wrap items-center gap-3" onSubmit={async e => {
    e.preventDefault(); setBusy(true)
    try {
      await authFetch(`/children/${childId}/profile`, { method: 'POST', token, body: { birthDate: value || null } })
      setStatus('已保存；新生成的解读会采用该年龄。'); onSaved()
    } catch { setStatus('保存失败，请确认日期后重试。') } finally { setBusy(false) }
  }}>
    <label className="text-sm">出生日期（由家长填写） <input type="date" value={value} max={new Date().toISOString().slice(0, 10)} onChange={e => setValue(e.target.value)} className="rounded border p-2" /></label>
    <Button disabled={busy} type="submit">保存日期</Button>
    <p role="status" className="text-xs">{status || '用于按年龄处理画面特征；留空时不推测年龄。'}</p>
  </form>
}
