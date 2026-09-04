import type { OnboardingStep } from '../OnboardingContext'

export const parentSteps: OnboardingStep[] = [
  {
    target: '[data-onboarding="parent-navbar"]',
    title: '欢迎来到 Luma 家长空间',
    body: '孩子每画一幅画，都在用颜色和线条说一些还不知道怎么开口的话。这里帮你把这些话读出来。',
  },
  {
    // Desktop: switcher in navbar; mobile: switcher in page body
    target: '[data-onboarding="parent-child-switcher"]',
    mobileTarget: '[data-onboarding="parent-child-switcher-mobile"]',
    title: '切换查看不同的孩子',
    body: '每个孩子的成长节奏都不一样。点头像切换，单独看每一个孩子的故事。',
  },
  {
    // Desktop: invite pill in navbar; mobile: invite pill in page body
    target: '[data-onboarding="parent-invite"]',
    mobileTarget: '[data-onboarding="parent-invite-mobile"]',
    title: '邀请孩子加入',
    body: '把这串邀请码发给孩子，他们注册后就会出现在你这里，两个账号就连在一起了。',
  },
  {
    target: '[data-onboarding="parent-tabs"]',
    title: '四个分区，各有侧重',
    body: '成长概览看本周整体状态，创作主题看孩子在画什么、想什么，成长时间轴追踪变化趋势，AI 沟通助手帮你找到跟孩子说话的方式。',
  },
  {
    target: '[data-onboarding="parent-tab-communication"]',
    title: '读懂孩子画里的话',
    body: '孩子画里藏着很多他说不出口的话。这里会帮你读懂这些画，找到真正走进孩子内心的沟通方式。',
  },
  {
    target: '[data-onboarding="parent-archive"]',
    title: '所有作品都留在这里',
    body: '孩子的每一幅画都留在这里。某天翻出来，也许会看见一个你当时没注意到的成长节点。',
  },
]
