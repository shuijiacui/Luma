import { useState } from 'react'
import { lt, t } from '@/i18n'
import { AvatarPicker } from '@/features/profile/components/AvatarPicker'
import { ChildBirthDate } from './ChildBirthDate'
import { FamilyDataSettings } from './FamilyDataSettings'
import { ParentQuestionnaireSection } from './ParentQuestionnaireSection'
import { ChevronRightIcon, FamilyIcon, SproutIcon } from './dashboard/icons'
import './family-settings.css'

interface FamilyChild {
  id: string
  nickname: string
  avatar: string
  birthDate?: string | null
}

interface Props {
  ownerId: string
  parentName: string
  token?: string
  isGuest: boolean
  children: FamilyChild[]
  selectedChildId?: string
  inviteCode?: string
  copied: boolean
  onCopyInvite: () => Promise<void>
  onSelectChild: (id: string) => void
  onProfileSaved: () => void
  onRestartTour: () => void
  onLogout: () => void
  onRegister: () => void
}

export function FamilySettings(props: Props) {
  const [questionnaireOpen, setQuestionnaireOpen] = useState(false)
  const [copyError, setCopyError] = useState(false)
  const { ownerId, parentName, token, isGuest, children, selectedChildId, inviteCode, copied } = props
  return <div className={`family-settings${questionnaireOpen ? ' is-questionnaire-open' : ''}`}>
    <section className="family-settings-account" hidden={questionnaireOpen} aria-label={t('家长账号')}>
      <div className="family-settings-identity">
        <AvatarPicker userId={ownerId} compact editable={false} />
        <div><h2>{lt(parentName)}</h2><p>{t('家长账号')}<span aria-hidden="true"> · </span>{t(isGuest ? '游客演示家庭' : '已连接家庭空间')}</p></div>
      </div>
      <div className="family-settings-account-actions">
        {!isGuest && <button type="button" onClick={props.onRestartTour}>{t('重新看新手引导')}</button>}
        <button type="button" onClick={props.onLogout}>{t('退出登录')}<span aria-hidden="true">↗</span></button>
      </div>
    </section>

    <div className="family-settings-columns">
      <section className="family-settings-members" hidden={questionnaireOpen} aria-labelledby="family-members-title">
        <div className="family-settings-section-heading"><span className="family-settings-section-icon"><FamilyIcon /></span>
          <div><h2 id="family-members-title">{t('家庭成员')}</h2><p>{t('每个孩子，都有自己的创作空间。')}</p></div>
        </div>
        <div className="family-settings-children">
          {children.map(child => <div className="family-settings-child" key={child.id}>
            <div className="family-settings-child-row">
              <img src={child.avatar} alt="" />
              <div className="family-settings-child-copy"><h3>{child.nickname}</h3><p>{child.id === selectedChildId ? <><i aria-hidden="true" />{t('当前查看')}</> : t('小创作者')}</p></div>
              <button type="button" className="family-settings-child-link" onClick={() => props.onSelectChild(child.id)} aria-label={`${t('查看成长概览')} · ${child.nickname}`}>
                <span>{t('成长概览')}</span><ChevronRightIcon />
              </button>
            </div>
            {!isGuest && token && <details className="family-settings-child-profile">
              <summary>{t('编辑孩子资料')}<span aria-hidden="true">＋</span></summary>
              <ChildBirthDate childId={child.id} initial={child.birthDate} token={token} onSaved={props.onProfileSaved} />
            </details>}
          </div>)}
          {children.length === 0 && <div className="family-settings-empty"><SproutIcon /><p>{t('还没有孩子加入')}</p><span>{t('用下面的邀请码，连接孩子的创作空间。')}</span></div>}
        </div>

        <div className="family-settings-invite" data-onboarding="parent-invite">
          <div className="family-settings-invite-heading"><h3>{t('邀请孩子加入')}</h3><span>{t('家庭邀请码')}</span></div>
          <div className="family-settings-invite-code"><code aria-label={t('家庭邀请码')}>{inviteCode ?? '—'}</code>
            <button type="button" disabled={!inviteCode} onClick={async () => {
              setCopyError(false)
              try { await props.onCopyInvite() } catch { setCopyError(true) }
            }}>{copied ? <span aria-hidden="true">✓</span> : <CopyIcon />}{t(copied ? '已复制' : '复制邀请码')}</button>
          </div>
          <p>{t('孩子注册时填写，就能加入这个家庭。')}</p>
          <span className="sr-only" role="status">{copied ? t('邀请码已复制') : ''}</span>
          {copyError && <p role="alert">{t('暂时无法自动复制，请选中邀请码手动复制。')}</p>}
        </div>
      </section>

      <ParentQuestionnaireSection ownerId={ownerId} token={isGuest ? undefined : token} children={children} selectedChildId={selectedChildId} embedded onExpandedChange={setQuestionnaireOpen} />
    </div>

    <div className={`family-settings-footer${!isGuest ? ' family-settings-footer--data' : ''}`} hidden={questionnaireOpen}>
      {!isGuest && token ? <FamilyDataSettings token={token} onDeleted={props.onLogout} /> : isGuest ? <section className="family-settings-guest">
        <span className="family-settings-guest-icon"><SproutIcon /></span>
        <div><h3>{t('创建一个正式账号？')}</h3><p>{t('注册后，可邀请孩子并保存真实的创作记录。')}</p></div>
        <button type="button" onClick={props.onRegister}>{t('创建正式账号')}<ChevronRightIcon /></button>
      </section> : null}
    </div>
  </div>
}

function CopyIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="8" y="8" width="12" height="13" rx="2" /><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h3" /></svg>
}
