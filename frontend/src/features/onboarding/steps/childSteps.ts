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
    body: '点一下花藤里的绿色大门，就能进入画布，和 Nilo 一起画画。离开画布前，记得把喜欢的画作下载下来哦。',
  },
  {
    target: '[data-onboarding="child-avatar"]',
    title: '换一个你喜欢的头像',
    body: '选一个最像你的头像，或者你最喜欢的那个～',
  },
]
