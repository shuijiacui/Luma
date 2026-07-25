import type { OnboardingStep } from '../OnboardingContext'

export const childSteps: OnboardingStep[] = [
  {
    target: '[data-onboarding="child-hero"]',
    title: '嗨！这是 Nilo',
    body: 'Nilo 一直在这里等你呢！每次你画画，它都会陪在旁边，还会在故事里悄悄出现哦～',
  },
  {
    target: '[data-onboarding="child-canvas-card"]',
    title: '从这里开始今天的创作',
    body: '今天想画什么？不用想太久——点开画布，让画笔带你去！',
  },
  {
    target: '[data-onboarding="child-vine"]',
    title: '你的作品保存在这里',
    body: '你画过的每一幅都会保存在这里，慢慢长成一棵属于你的大树🌱',
  },
  {
    target: '[data-onboarding="child-avatar"]',
    title: '换一个你喜欢的头像',
    body: '选一个最像你的头像，或者你最喜欢的那个～',
  },
]
