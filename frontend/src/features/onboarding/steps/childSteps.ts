import type { OnboardingStep } from '../OnboardingContext'

export const childSteps: OnboardingStep[] = [
  {
    target: '[data-onboarding="child-hero"]',
    title: '嗨！这是 Nilo',
    body: '摸摸头、点点鼻子，或者和 Nilo 击个掌。点击下方的小手提示，可以找到能互动的地方。',
  },
  {
    target: '[data-onboarding="child-door"]',
    title: '推开门，去画画',
    body: '点一下绿色的大门，就能进入画布。画到一半也可以回小屋玩一会儿，再开门接着画。刷新或退出前，记得下载画作哦。',
  },
  {
    target: '[data-onboarding="child-avatar"]',
    title: '换一个你喜欢的头像',
    body: '选一个最像你的头像，或者你最喜欢的那个～',
  },
]
