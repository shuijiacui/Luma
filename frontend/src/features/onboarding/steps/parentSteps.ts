import type { OnboardingStep } from '../OnboardingContext'

export function parentSteps(hasChildren: boolean, show: (view: 'overview' | 'settings') => void): OnboardingStep[] {
  return [
    hasChildren ? {
      id: 'parent-child', target: '[data-onboarding="parent-child-switcher"]',
      title: '每个孩子，都有自己的空间', body: '在这里切换孩子，查看各自的创作记录。', prepare: () => show('overview'),
    } : {
      id: 'parent-invite', target: '[data-onboarding="parent-invite"]',
      title: '先连接孩子的创作空间', body: '复制家庭邀请码，让孩子注册时填写，就能连接两个账号。', prepare: () => show('settings'),
    },
    { id: 'parent-recent', target: '[data-onboarding="parent-recent"], [data-onboarding="parent-empty"] h3', title: '最近的创作，从这里看',
      body: '这里汇总最近的创作，点查看详情可以回看作品。还没有作品也没关系，等第一幅画到来。', prepare: () => show('overview') },
    { id: 'parent-records', target: '[data-onboarding="parent-archive"]', title: '留住每一次小小创作',
      body: '创作记录收好了作品、主题探索和时间轴，随时可以回看。', prepare: () => show('overview') },
    { id: 'parent-reports', target: '[data-onboarding="parent-reports"]', title: '回看一段时间的成长',
      body: '有了创作记录，就可以在周报与月报里查看阶段汇总和陪伴建议。', prepare: () => show('overview') },
  ]
}
export const communicationSteps: OnboardingStep[] = [{
  id: 'parent-communication', target: '[data-onboarding="parent-communication-title"]', title: '找一个温柔的开场白',
  body: '这里整理了创作观察和已有的陪伴建议，可以作为交流的参考。也请结合你对孩子的了解。',
}]
export const settingsSteps: OnboardingStep[] = [
  { id: 'settings-invite', target: '[data-onboarding="parent-invite"]', title: '邀请孩子加入家庭', body: '家庭邀请码在这里，也可以随时复制给新加入的孩子。' },
  { id: 'settings-data', target: '[data-onboarding="parent-data-title"]', title: '管理家庭数据', body: '查看作品导出、删除的说明，也可以在这里了解家庭账号注销。' },
]
