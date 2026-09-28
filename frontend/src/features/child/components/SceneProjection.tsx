import { useMemo, useState } from 'react'
import { useLocale } from '@/i18n'
import type { Projection } from '../hooks/useCompanion'
import { proposalStrokes, type DrawingProposal } from '../companion/proposals'
import { illustrationTracePaths } from '../companion/illustrationTracing'
import { useIllustrationTraces } from '../hooks/useIllustrationTraces'
import { CompanionProjection } from './CompanionProjection'
import { getDrawingIllustration } from '../../../../../shared/niloIllustrations.mjs'
import { validateGeneratedRaster } from '../../../../../shared/niloGeneratedRaster.mjs'

/** Scene geometry is always a tracing aid, separate from the child's painted ink. */
export function SceneProjection({ projection, onEdit, onInteractionStart }: {
  projection: Projection
  onEdit?: (id: string, patch: Partial<DrawingProposal>) => void
  onInteractionStart?: () => void
}) {
  const locale = useLocale()
  const scene = projection.scene!
  const proposals = useMemo(() => [projection.proposal, ...projection.additions], [projection.proposal, projection.additions])
  const illustrationIds = [...new Set(proposals.flatMap(proposal => proposal.template === 'illustration' && proposal.illustrationId ? [proposal.illustrationId] : []))]
  const traces = useIllustrationTraces(illustrationIds)
  const [failedImages, setFailedImages] = useState<string[]>([])
  const objects = useMemo(() => proposals.map((proposal, index) => {
    const raster = proposal.template === 'generated' ? validateGeneratedRaster(proposal.raster) : null
    const trace = raster ? { version: 1 as const, aspect: raster.width / raster.height, projection: raster.projection, paths: raster.paths ?? [] }
      : proposal.illustrationId ? traces[proposal.illustrationId] : undefined
    const gray = raster?.projection === 'gray' ? { id: `generated-${index}`, name: proposal.subject ?? '', src: `data:image/png;base64,${raster.pngBase64}` }
      : proposal.template === 'illustration' && trace?.projection === 'gray' ? getDrawingIllustration(proposal.illustrationId!) : undefined
    const strokes = ['illustration', 'generated'].includes(proposal.template)
      ? trace && !gray ? illustrationTracePaths(trace, proposal, projection.aspect).map(points => ({ points })) : []
      : proposalStrokes(proposal, projection.aspect)
    return { proposal, object: scene.plan.objects[index], strokes, gray }
  }), [proposals, projection.aspect, scene.plan.objects, traces])
  const failed = illustrationIds.some(id => traces[id] === null) || objects.some(({ gray }) => gray && failedImages.includes(gray.id))
  const loading = illustrationIds.some(id => traces[id] === undefined)
  const selected = objects.find(item => item.object.id === scene.selectedId)
  return <div className="nilo-scene-projection pointer-events-none absolute inset-0" aria-label="Nilo 的场景描画轮廓">
    <svg className="nilo-scene-picture absolute inset-0 size-full" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true">
      {objects.map(({ object, strokes }) => <g key={object.id} data-scene-object={object.id}>
        {strokes.map((stroke, index) => {
          const points = stroke.points.map(point => `${(point.x * 1000).toFixed(2)},${(point.y * 1000).toFixed(2)}`).join(' ')
          return <polyline key={index} points={points} fill="none" stroke="#9ca3af" strokeWidth="1.5"
            vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="6 5" />
        })}
      </g>)}
    </svg>
    {objects.flatMap(({ object, proposal: p, gray }) => gray ? [<img key={object.id} src={gray.src} alt={gray.name} draggable={false}
      className="nilo-illustration-guide nilo-illustration-gray-projection" data-illustration-projection="gray" data-scene-image={object.id}
      style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%`, width: `${p.width * 100}%`, height: `${p.height * 100}%`, transform: `rotate(${p.rotation}deg)` }}
      onError={() => setFailedImages(ids => ids.includes(gray.id) ? ids : [...ids, gray.id])}
      onLoad={() => setFailedImages(ids => ids.filter(id => id !== gray.id))} />] : [])}
    {selected && onEdit && <div className="nilo-scene-controls absolute inset-0">
      <CompanionProjection proposal={selected.proposal} aspect={projection.aspect} tracing controlsOnly
        onEdit={patch => onEdit(selected.object.id, patch)} onInteractionStart={onInteractionStart} />
    </div>}
    {(failed || loading) && <span className="nilo-illustration-notice" role="status">{failed
      ? locale === 'en' ? 'Some outlines could not load. Your drawing is safe; you can keep drawing.' : '有些轮廓暂时没加载好，你的画还在，可以接着画。'
      : locale === 'en' ? 'Preparing the outlines. You can keep drawing.' : '轮廓正在准备，你可以先接着画。'}</span>}
  </div>
}
