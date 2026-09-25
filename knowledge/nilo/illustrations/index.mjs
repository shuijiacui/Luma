import mediumPlan from './medium-plan.json' with { type: 'json' }
import libraryExpansion from './library-expansion.json' with { type: 'json' }
// Original picture-book references. Asset URLs are project-owned, never model supplied.
const entries = [
  ['illustration-reading-child', 'readingchild', '读书的孩子', 'illustrated', 'people', ['character', 'person', 'book', 'library'], '观察低头阅读的姿态、手与书的关系，再选几条喜欢的衣褶。'],
  ['illustration-bookshop', 'bookshop', '书店', 'illustrated', 'architecture', ['building', 'street', 'book', 'town'], '先看房屋轮廓，再观察门窗的比例和花草细节。'],
  ['illustration-gardener', 'gardener', '园丁', 'realistic', 'people', ['character', 'person', 'garden', 'plant'], '观察身体重心、手臂动作和水壶的方向。'],
  ['illustration-school', 'school', '学校', 'realistic', 'architecture', ['building', 'town', 'children'], '先观察对称关系与屋顶，再挑选门窗描画。'],
]
const base = (id) => ({
  kind: 'illustration', aspect: 1, src: `/nilo-illustrations/${id}.png`,
  source: 'Nilo original · AI-assisted illustration',
  tracing: 'Choose the outer contour first; inner details are optional. Match the child’s current drawing and interest, not age alone.',
})
export const drawingIllustrations = [
  ...libraryExpansion.map(item => ({ ...base(item.id), ...item })),
  ...mediumPlan.assets.map(({ prompt, ...item }) => ({
    ...base(item.id), ...item, label: '轻松描画',
    related: item.category === 'people' ? ['character', 'person', item.subject] : ['building', 'town', item.subject],
  })),
  ...entries.map(([id, subject, name, style, category, related, learning]) => ({
    ...base(id), id, subject, name, label: '细细观察', style, category, related, learning,
    aliases: mediumPlan.assets.find(item => item.subject === subject)?.aliases ?? [],
    minPixels: 280, ageBands: ['8-9', '10-12'], difficulty: 'detailed', detail: 'rich',
  })),
]
