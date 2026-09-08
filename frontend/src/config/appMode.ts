// 应用形态：portal（官网/双端合一的传统网页，默认）、parent（家长端 App）、child（儿童端 App）
// 由各 vite 配置通过 define __APP_MODE__ 注入；未注入时为 portal。
export type AppMode = 'portal' | 'parent' | 'child'

declare const __APP_MODE__: string | undefined

export const appMode: AppMode =
  typeof __APP_MODE__ !== 'undefined' && (__APP_MODE__ === 'parent' || __APP_MODE__ === 'child')
    ? __APP_MODE__
    : 'portal'

export const isStandaloneApp = appMode !== 'portal'

// 开发时默认打开三个本地入口；生产构建默认回到当前站点，避免误跳 localhost。
const readUrl = (value: string | undefined, fallback: string) =>
  value && value.trim().length > 0 ? value.trim() : fallback

const defaultUrl = (port: number) => import.meta.env.DEV ? `http://localhost:${port}` : '/'

export const portalUrl = readUrl(import.meta.env.VITE_PORTAL_URL, defaultUrl(5173))
export const parentAppUrl = readUrl(import.meta.env.VITE_PARENT_APP_URL, defaultUrl(5174))
export const childAppUrl = readUrl(import.meta.env.VITE_CHILD_APP_URL, defaultUrl(5175))

/** 当前形态固定绑定的角色（parent/child App 各自只有一种身份；portal 为 undefined） */
export const fixedRole: 'parent' | 'child' | undefined =
  appMode === 'parent' || appMode === 'child' ? appMode : undefined
