import { compileSketch } from '../../../../../shared/niloSketch.mjs'
import type { DetailChoice, DetailInvitation } from '../companion/detailCreation'

export function DetailCreationCard({ invitation, locale, disabled, onChoose, onClose }: {
  invitation: DetailInvitation; locale: 'zh' | 'en'; disabled: boolean; onChoose: (choice: DetailChoice) => void; onClose: () => void
}) {
  const en = locale === 'en'
  return <section className="mx-auto w-full max-w-xl rounded-2xl border border-luma-teal-100 bg-luma-ivory-50 px-4 py-3 text-sm text-luma-teal-900" aria-label={en ? 'Try a little detail' : '一起添个小细节'}>
    <div className="flex items-start gap-3">
      <p className="flex-1" role="status">{invitation.message}</p>
      <button type="button" disabled={disabled} aria-label={en ? 'Put the hint away' : '收起小提示'} onClick={onClose}>×</button>
    </div>
    {invitation.mode !== 'offer' && <ol className="mt-2 list-decimal space-y-1 pl-5">{invitation.steps.map(step => <li key={step}>{step}</li>)}</ol>}
    {invitation.example && <svg className="my-2" style={{ width: 128, height: 128 / invitation.example.aspect }} viewBox="0 0 1 1" preserveAspectRatio="none" role="img" aria-label={en ? 'A little outline example' : '细节轮廓小示范'}>
      {compileSketch(invitation.example)?.map((points, i) => <polyline key={i} points={points.map(point => `${point.x},${point.y}`).join(' ')} fill="none" stroke="currentColor" strokeWidth=".014" strokeDasharray=".025 .025" strokeLinecap="round" />)}
    </svg>}
    <div className="mt-3 flex flex-wrap gap-2">
      <button type="button" disabled={disabled} className="rounded-xl bg-luma-teal-100 px-3 py-2 font-semibold" onClick={() => onChoose('self')}>{en ? 'I’ll try' : '我来试试'}</button>
      {invitation.mode === 'offer' && <button type="button" disabled={disabled} className="rounded-xl border border-luma-teal-200 px-3 py-2" onClick={() => onChoose('hint')}>{en ? 'Give me a hint' : '给我一点提示'}</button>}
      {invitation.mode !== 'outline' && <button type="button" disabled={disabled} className="rounded-xl border border-luma-teal-200 px-3 py-2" onClick={() => onChoose('outline')}>{en ? 'Show me an outline' : '帮我画个轮廓'}</button>}
    </div>
  </section>
}
