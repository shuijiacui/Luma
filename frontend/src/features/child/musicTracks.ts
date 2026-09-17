export const musicTracks = [
  { id: 'happy-lullaby', label: '星星摇篮曲', mood: '轻柔', file: 'happy-lullaby.mp3' },
  { id: 'jrpg-piano', label: '轻柔钢琴', mood: '轻柔', file: 'jrpg-piano.mp3' },
  { id: 'first-light-particles', label: '晨光微粒', mood: '轻柔', file: 'first-light-particles.mp3' },
  { id: 'happy-beat', label: '快乐节拍', mood: '欢快', file: 'happy-beat.mp3' },
  { id: 'pushing-ahead', label: '轻快冒险', mood: '欢快', file: 'pushing-ahead.mp3' },
] as const

export function musicUrl(file: string) {
  return `${import.meta.env.BASE_URL}music/${file}`
}
