import type { AnalysisSummary } from '@/lib/api/authApi'
import { fetchAuthedObjectUrl } from '@/lib/api/authedImage'

const escape = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))

/** 单文件离线成长册：原图内嵌，不含访问令牌，可用浏览器打印为 PDF。 */
export async function exportArchive(analyses: AnalysisSummary[], token: string, childName: string, year?: number) {
  const selected = analyses.filter(a => year === undefined || new Date(a.createdAt).getFullYear() === year)
  if (!selected.length) throw new Error('该时间段没有可导出的作品。')
  const sections: string[] = []
  for (const item of [...selected].reverse()) {
    let picture = ''
    if (item.imageUrl) {
      const url = await fetchAuthedObjectUrl(item.imageUrl, token)
      try {
        const blob = await (await fetch(url)).blob()
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(String(reader.result))
          reader.onerror = () => reject(new Error('图片读取失败'))
          reader.readAsDataURL(blob)
        })
        picture = `<img alt="孩子的画作" src="${escape(dataUrl)}">`
      } finally { URL.revokeObjectURL(url) }
    }
    const report = item.report
    sections.push(`<article><h2>${escape(new Date(item.createdAt).toLocaleDateString('zh-CN'))}</h2>${picture}<p>AI 画面描述：${escape(item.rawDescription ?? '暂无描述')}</p>${report ? `<p>${escape(report.emotion)} · 参考分值 ${Math.round(report.confidence * 100)}%</p><p>${escape(report.narrative ?? '')}</p><ul>${report.evidence.map(e => `<li>${escape(e.entryId)}：${escape(e.plain ?? e.summary)}</li>`).join('')}</ul><h3>陪伴建议</h3><ul>${report.parentAdvice.map(a => `<li>${escape(a)}</li>`).join('')}</ul>` : '<p>尚未生成解读</p>'}</article>`)
  }
  const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'"><title>Luma 成长册</title><style>body{font:16px/1.8 sans-serif;max-width:850px;margin:40px auto;padding:20px;color:#20352f}article{border-top:1px solid #ddd;padding:24px 0;break-before:page}img{max-width:100%;max-height:65vh;object-fit:contain}h1{font-size:30px}@media print{body{margin:0}article{break-inside:avoid}}</style><h1>${escape(childName)}的${year ?? '全部'}创作记录</h1><p>共 ${selected.length} 幅。AI 描述与规则参考分值仅供观察，不代表孩子原话或心理测量。可离线打开，使用浏览器打印保存为 PDF。</p>${sections.join('')}</html>`
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url; link.download = `Luma-${year ?? 'all'}-${Date.now()}.html`; link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 60000)
}
