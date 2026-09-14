import type { OnboardingStep } from '../OnboardingContext'

export const childSteps: OnboardingStep[] = [
  { id: 'child-head', target: '[data-onboarding="child-head"]', title: '你好，我是 Nilo！', body: '轻轻摸摸我的头，和我打个招呼吧。', interaction: 'click' },
  { id: 'child-door', target: '[data-onboarding="child-door-button"]', title: '推开门，一起画画吧', body: '点点这扇门，我们去画一幅属于你的画。', interaction: 'click', focusArea: { x: .25, y: .3, width: .5, height: .35 } },
]
export const canvasSteps: OnboardingStep[] = [
  { id: 'canvas-color', target: '[data-onboarding="canvas-colors"]', title: '挑一个喜欢的颜色', body: '点一下颜色，就能用它画画啦。', interaction: 'click' },
  { id: 'canvas-stroke', target: '[data-onboarding="canvas-paper"] canvas', title: '试着画一笔', body: '用手指或画笔，在亮起来的纸上画一笔吧。', interaction: 'stroke', focusArea: { x: .3, y: .25, width: .35, height: .25 } },
  { id: 'canvas-undo', target: '[data-onboarding="canvas-undo"]', title: '画错了也没关系', body: '点这里可以撤销刚才那一笔，再试一次。', interaction: 'click' },
  { id: 'canvas-save', target: '[data-onboarding="canvas-save"]', title: '把喜欢的画收好', body: '画好后点保存，成功后就能在历史图画里找到，下次还能继续画。' },
]
