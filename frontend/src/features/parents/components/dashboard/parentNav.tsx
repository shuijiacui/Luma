import type { ReactNode } from 'react'

import {
  ChatIcon,
  CompassIcon,
  FamilyIcon,
  RecordsIcon,
  SproutIcon,
  TimelineIcon,
} from './icons'

export type ViewKey =
  | 'overview'
  | 'records'
  | 'themes'
  | 'timeline'
  | 'communication'
  | 'settings'

export interface NavEntry {
  key: ViewKey
  label: string
  icon: ReactNode
  title: string
  subtitle: string
}

export const NAV_ENTRIES: NavEntry[] = [
  {
    key: 'overview',
    label: '成长概览',
    icon: <SproutIcon className="size-4" />,
    title: '成长概览',
    subtitle: '在这里，看见创作中的变化，也看见 ta 一点一滴的成长',
  },
  {
    key: 'records',
    label: '创作记录',
    icon: <RecordsIcon className="size-4" />,
    title: '创作记录',
    subtitle: '每一幅画都被好好收着，像一颗颗成长的小脚印',
  },
  {
    key: 'themes',
    label: '主题探索',
    icon: <CompassIcon className="size-4" />,
    title: '主题探索',
    subtitle: '看看 ta 最近在画什么、想什么，那些反复出现的内容往往最重要',
  },
  {
    key: 'timeline',
    label: '成长时间轴',
    icon: <TimelineIcon className="size-4" />,
    title: '成长时间轴',
    subtitle: '主题与表达方式的变化，沿着时间一点点展开',
  },
  {
    key: 'communication',
    label: 'AI 沟通助手',
    icon: <ChatIcon className="size-4" />,
    title: 'AI 沟通助手',
    subtitle: '从创作观察出发，找一个和孩子开口的温柔理由',
  },
  {
    key: 'settings',
    label: '家庭设置',
    icon: <FamilyIcon className="size-4" />,
    title: '家庭设置',
    subtitle: '管理家庭空间、邀请孩子，也照顾好你的账号',
  },
]

export const DEFAULT_VIEW: ViewKey = 'overview'

