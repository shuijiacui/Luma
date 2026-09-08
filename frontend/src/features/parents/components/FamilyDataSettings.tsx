import { lt, t, useLocale } from '@/i18n'
import { useState } from 'react'
import { Button } from '@/components/ui'
import { authFetch } from '@/lib/api/authFetch'

export function FamilyDataSettings({ token, onDeleted }: { token: string; onDeleted: () => void }) {
  useLocale()
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  return <section className="rounded-3xl border border-[#efe8d9] bg-white/90 p-6">
    <h3 className="font-bold">{t("家庭数据管理")}</h3>
    <p className="mt-2 text-sm leading-relaxed">{t("可在完整成长档案中导出作品和解读，在单幅画作的完整解读中删除作品。")}</p>
    {!open ? <Button variant="ghost" className="mt-4" onClick={() => setOpen(true)}>{t("注销整个家庭")}</Button> : <form className="mt-4 space-y-4" onSubmit={async event => {
      event.preventDefault()
      if (busy) return
      setBusy(true); setError('')
      try {
        await authFetch('/auth/family/delete', { method: 'POST', token, body: { password, confirmation: confirmation === t('删除整个家庭') ? '删除整个家庭' : confirmation } })
        setPassword(''); onDeleted()
      } catch (cause) { setError(cause instanceof Error ? cause.message : '注销失败，请重试。'); setBusy(false) }
    }}>
      <p className="text-sm leading-relaxed text-red-800">{t("这会删除本家庭全部家长与儿童账号、作品、解读和周期报告，并使所有设备退出登录，无法撤销。请先导出需要保留的档案。既有备份按部署方保留周期清理；已下载文件及外部模型服务留存需分别处理。")}</p>
      <label className="block text-sm">{t("家长登录密码")}<input required type="password" autoComplete="current-password" maxLength={1024} value={password} disabled={busy} onChange={e => setPassword(e.target.value)} className="mt-1 block w-full max-w-sm rounded-xl border p-3" /></label>
      <label className="block text-sm">{t("输入“删除整个家庭”确认")}<input required value={confirmation} disabled={busy} onChange={e => setConfirmation(e.target.value)} className="mt-1 block w-full max-w-sm rounded-xl border p-3" /></label>
      {error && <p role="alert" className="text-sm text-red-800">{lt(error)}</p>}
      <div className="flex gap-3"><Button type="submit" disabled={busy || !password || confirmation !== t('删除整个家庭')}>{lt(busy ? '正在注销…' : '确认永久注销')}</Button><Button disabled={busy} variant="ghost" onClick={() => { setOpen(false); setPassword(''); setConfirmation(''); setError('') }}>{t("取消")}</Button></div>
    </form>}
  </section>
}
