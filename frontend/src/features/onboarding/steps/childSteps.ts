import type { OnboardingStep } from '../OnboardingContext'

export const childSteps: OnboardingStep[] = [
  { id: 'child-head', target: '[data-onboarding="child-head"]', title: '你好，我是 Nilo！', body: '轻轻摸摸我的头，和我打个招呼吧。', interaction: 'click' },
  { id: 'child-door', target: '[data-onboarding="child-door-button"]', title: '推开门，一起画画吧', body: '点点这扇门，我们去画一幅属于你的画。', interaction: 'click', focusArea: { x: .25, y: .3, width: .5, height: .35 } },
]
export const canvasSteps: OnboardingStep[] = [
  { id: 'canvas-color', target: '[data-onboarding="canvas-colors"]', title: '挑一个喜欢的颜色', body: '点一下颜色，就能用它画画啦。', interaction: 'click' },
  { id: 'canvas-stroke', target: '[data-onboarding="canvas-paper"] canvas', title: '试着画一笔', body: '用手指或画笔，在亮起来的纸上画一笔吧。', interaction: 'stroke', focusArea: { x: .3, y: .25, width: .35, height: .25 } },
  { id: 'canvas-undo', target: '[data-onboarding="canvas-undo"]', title: '画错了也没关系', body: '点底部中间的「撤销」，就能退回刚才那一笔，再试一次。', interaction: 'click' },
  { id: 'canvas-nilo', target: '[data-onboarding="canvas-nilo"]', title: '跟着 Nilo 描一描', body: '点 Nilo，会出现灰色虚线底图。拖小手柄移动，拉角角变大小，沿虚线描一遍，画好再点「清除底图」。' },
  { id: 'canvas-music', target: '[data-onboarding="canvas-music"]', title: '让音乐陪你画画', body: '点顶部的「音乐：关」开启背景音乐，再点一下就关闭。旁边的小箭头可以换歌、调音量。' },
  { id: 'canvas-save', target: '[data-onboarding="canvas-save"]', title: '把喜欢的画收好', body: '换图形、清除图形和保存都在底部中间。画好后点保存，下次就能从历史图画接着画。' },
]
