import avatar1 from './u1.png'
import avatar2 from './u2.png'
import avatar3 from './u3.png'
import avatar4 from './u4.png'
import avatar5 from './u5.png'

export const defaultAvatars = [
  { id: 'u1', src: avatar1, label: '开心 Nilo' },
  { id: 'u2', src: avatar2, label: '微笑 Nilo' },
  { id: 'u3', src: avatar3, label: '惊喜 Nilo' },
  { id: 'u4', src: avatar4, label: '好奇 Nilo' },
  { id: 'u5', src: avatar5, label: '温柔 Nilo' },
] as const

export { avatar2 as niloCompanion }
