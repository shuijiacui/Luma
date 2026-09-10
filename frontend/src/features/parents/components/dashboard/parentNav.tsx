import type { ReactNode } from 'react'

import {
  ChatIcon,
  FamilyIcon,
  RecordsIcon,
  SproutIcon,
  TimelineIcon,
} from './icons'

export type ViewKey =
  | 'overview'
  | 'records'
  | 'settings'
  | 'reports'
  | 'communication'

export interface NavEntry {
  key: ViewKey
  label: string
  icon: ReactNode
  title: string
  subtitle: string
}

/** 家长端底部常驻五个入口：成长概览 / 创作记录 / 家庭设置 / 周报与月报 / AI 沟通助手 */
export const NAV_ENTRIES: NavEntry[] = [
  {
    key: 'overview',
    label: '成长概览',
    icon: <SproutIcon className="size-4" />,
    title: '成长概览',
    subtitle: '看见创作，也看见成长。',
  },
  {
    key: 'records',
    label: '创作记录',
    icon: <RecordsIcon className="size-4" />,
    title: '创作记录',
    subtitle: '创作记录、主题探索与成长时间轴，都收在这里。',
  },
  {
    key: 'settings',
    label: '家庭设置',
    icon: <FamilyIcon className="size-4" />,
    title: '家庭设置',
    subtitle: '管理家庭空间、邀请孩子，也照顾好你的账号。',
  },
  {
    key: 'reports',
    label: '周报与月报',
    icon: <TimelineIcon className="size-4" />,
    title: '周报与月报',
    subtitle: '把一段时间里的创作收在一起，回看主题和陪伴建议。',
  },
  {
    key: 'communication',
    label: 'AI 沟通助手',
    icon: <ChatIcon className="size-4" />,
    title: 'AI 沟通助手',
    subtitle: '从创作观察出发，找一个和孩子开口的温柔理由。',
  },
]

export const DEFAULT_VIEW: ViewKey = 'overview'
