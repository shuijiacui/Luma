import { lt, t, useLocale } from '@/i18n'
import { useState } from 'react'
import { Button } from '@/components/ui'
import { authFetch } from '@/lib/api/authFetch'
import './family-settings-details.css'

export function FamilyDataSettings({ token, onDeleted }: { token: string; onDeleted: () => void }) {
  useLocale()
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  return <section className="family-data-settings">
    <div className="family-data-heading">
      <div className="family-data-copy">
        <h3 data-onboarding="parent-data-title" className="family-data-title">{t("家庭数据管理")}</h3>
        <p className="family-data-description">{t("可在完整成长档案中导出作品和解读，在单幅画作的完整解读中删除作品。")}</p>
      </div>
      {!open && <Button variant="ghost" size="sm" className="family-data-open" onClick={() => setOpen(true)}>{t("注销整个家庭")}</Button>}
    </div>
    {open && <form className="family-data-form" onSubmit={async event => {
      event.preventDefault()
      if (busy) return
      setBusy(true); setError('')
      try {
        await authFetch('/auth/family/delete', { method: 'POST', token, body: { password, confirmation: confirmation === t('删除整个家庭') ? '删除整个家庭' : confirmation } })
        setPassword(''); onDeleted()
      } catch (cause) { setError(cause instanceof Error ? cause.message : '注销失败，请重试。'); setBusy(false) }
    }}>
      <p className="family-data-warning">{t("这会删除本家庭全部家长与儿童账号、作品、解读和周期报告，并使所有设备退出登录，无法撤销。请先导出需要保留的档案。既有备份按部署方保留周期清理；已下载文件及外部模型服务留存需分别处理。")}</p>
      <div className="family-data-fields">
        <label className="family-data-label">{t("家长登录密码")}<input required type="password" autoComplete="current-password" maxLength={1024} value={password} disabled={busy} onChange={e => setPassword(e.target.value)} className="family-data-input" /></label>
        <label className="family-data-label">{t("输入“删除整个家庭”确认")}<input required value={confirmation} disabled={busy} onChange={e => setConfirmation(e.target.value)} className="family-data-input" /></label>
      </div>
      {error && <p role="alert" className="family-data-error">{lt(error)}</p>}
      <div className="family-data-actions"><Button type="submit" size="sm" className="family-data-confirm" disabled={busy || !password || confirmation !== t('删除整个家庭')}>{lt(busy ? '正在注销…' : '确认永久注销')}</Button><Button size="sm" disabled={busy} variant="ghost" onClick={() => { setOpen(false); setPassword(''); setConfirmation(''); setError('') }}>{t("取消")}</Button></div>
    </form>}
  </section>
}
