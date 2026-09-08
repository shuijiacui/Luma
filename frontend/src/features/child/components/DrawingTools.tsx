import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { t, useLocale } from '@/i18n'
import { BRUSHES, PALETTE, type BrushKind } from '../brushes'
import '../styles/drawing-tools.css'

interface Props {
  children?: ReactNode
  color: string
  brushKind: BrushKind
  brushSize: number
  isEraser: boolean
  disabled: boolean
  shapeLabel: string
  onColor: (color: string) => void
  onBrush: (kind: BrushKind) => void
  onSize: (size: number) => void
  onEraser: () => void
  onNextShape: () => void
  onClearShape: () => void
  onUndo: () => void
  onClear: () => void
  onSave: () => void
  onFinish: () => void
}

/** Actual brush footprints also appear in the selector, before touching the canvas. */
function BrushPreview({ kind }: { kind: BrushKind }) {
  return <svg viewBox="0 0 54 22" width="48" height="22" fill="none" aria-hidden="true">
    {kind === 'star' ? <text x="3" y="18" fill="currentColor" fontSize="21">✦ ✦</text> :
      <path d="M5 16C16 0 29 23 49 7" stroke="currentColor" strokeWidth={kind === 'pencil' ? 2 : kind === 'marker' ? 10 : 5} strokeLinecap={kind === 'marker' ? 'square' : 'round'} strokeDasharray={kind === 'crayon' ? '1 3' : undefined} />}
  </svg>
}

export function DrawingTools(props: Props) {
  useLocale()
  const [paletteOpen, setPaletteOpen] = useState(false)
  const paletteRef = useRef<HTMLDivElement>(null)
  const paletteTrigger = useRef<HTMLButtonElement>(null)
  const id = useId()
  const sizeId = useId()
  const selectedColor = PALETTE.find(([hex]) => hex === props.color)
  const quickColors = [PALETTE[0], PALETTE[4], PALETTE[6], PALETTE[7], PALETTE[14], PALETTE[17], PALETTE[20], PALETTE[10], PALETTE[1]]

  useEffect(() => {
    if (!paletteOpen) return
    const panel = paletteRef.current
    const focusTarget = panel?.querySelector<HTMLButtonElement>('[aria-pressed="true"]') ?? panel?.querySelector<HTMLButtonElement>('button')
    focusTarget?.focus()
    function dismiss(event: PointerEvent) {
      if (!paletteRef.current?.contains(event.target as Node) && !paletteTrigger.current?.contains(event.target as Node)) setPaletteOpen(false)
    }
    function onEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') { setPaletteOpen(false); paletteTrigger.current?.focus() }
    }
    document.addEventListener('pointerdown', dismiss)
    document.addEventListener('keydown', onEscape)
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', onEscape) }
  }, [paletteOpen])

  function chooseColor(value: string) { props.onColor(value) }
  function swatch(hex: string, label: string) {
    return <button type="button" key={hex} className="drawing-swatch" onClick={() => chooseColor(hex)} aria-label={t(label)} aria-pressed={!props.isEraser && props.color === hex} title={t(label)} disabled={props.disabled}>
      <span style={{ backgroundColor: hex }}>{!props.isEraser && props.color === hex && <span className="drawing-color-check">✓</span>}</span>
    </button>
  }

  return <div className="drawing-workspace" role="group" aria-label={t('绘画工具')}>
      <aside className="drawing-tools drawing-tool-rail" aria-label={t('绘画工具')}>
      <div className="drawing-color-section" role="group" aria-label={t('选择颜色')}>
        <span className="drawing-rail-title">{t('选择颜色')}</span>
        <div className="drawing-colors">{quickColors.map(([hex, label]) => swatch(hex, label))}</div>
        <button type="button" ref={paletteTrigger} aria-expanded={paletteOpen} aria-controls={id} aria-haspopup="dialog" className="drawing-tool-button drawing-palette-trigger" onClick={() => setPaletteOpen(value => !value)} disabled={props.disabled}>
          <span className="drawing-active-color" style={{ background: props.color }} aria-hidden="true" />{t('更多颜色')}
        </button>
        {paletteOpen && <div ref={paletteRef} id={id} role="dialog" aria-label={t('我的调色盘')} className="drawing-palette">
          <div className="drawing-palette-heading"><strong>{t('我的调色盘')}</strong><button type="button" className="drawing-tool-button" aria-label={t('关闭调色盘')} onClick={() => { setPaletteOpen(false); paletteTrigger.current?.focus() }}>×</button></div>
          <div className="drawing-palette-grid">{PALETTE.map(([hex, label]) => swatch(hex, label))}</div>
          <div className="drawing-custom-color"><label><input type="color" value={props.color} onChange={event => chooseColor(event.target.value)} disabled={props.disabled} aria-label={t('自选颜色')} />{t('自选颜色')}</label><span aria-live="polite">{t(selectedColor?.[1] ?? '我的颜色')}</span></div>
        </div>}
      </div>
      <div className="drawing-brush-section">
      <span className="drawing-rail-title">{t('选择画笔')}</span>
      <div className="drawing-brushes" role="group" aria-label={t('选择画笔')}>
        {BRUSHES.map(brush => <button key={brush.id} type="button" className="drawing-brush" aria-pressed={!props.isEraser && props.brushKind === brush.id} title={t(brush.hint)} onClick={() => props.onBrush(brush.id)} disabled={props.disabled}>
          <BrushPreview kind={brush.id} /><span>{t(brush.label)}</span>
        </button>)}
        <button type="button" className="drawing-brush drawing-eraser" aria-pressed={props.isEraser} onClick={props.onEraser} disabled={props.disabled}>
          <svg viewBox="0 0 54 22" width="48" height="22" fill="none" aria-hidden="true"><path d="m18 17-5-5a2 2 0 0 1 0-3l8-7a2 2 0 0 1 3 0l10 9a2 2 0 0 1 0 3l-3 3H18Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /><path d="m18 5 12 11M18 17h24" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          <span>{t('橡皮')}</span>
        </button>
      </div>
      <div className="drawing-sizes" role="group" aria-label={t('画笔粗细')}>
        <div className="drawing-size-heading">
          <label htmlFor={sizeId}>{t('画笔粗细')}</label>
          <output htmlFor={sizeId}>{props.brushSize}</output>
        </div>
        <div className="drawing-size-control">
          <input id={sizeId} className="drawing-size-slider" type="range" min={1} max={32} step={1}
            value={props.brushSize} onChange={event => props.onSize(event.currentTarget.valueAsNumber)} disabled={props.disabled}
            style={{ backgroundImage: `linear-gradient(to right, #168a78 ${(props.brushSize - 1) / 31 * 100}%, #dce8df ${(props.brushSize - 1) / 31 * 100}%)` }} />
          <span className="drawing-size-preview" aria-hidden="true"><span className="drawing-size-dot" style={{ width: props.brushSize, height: props.brushSize }} /></span>
        </div>
      </div>
      </div>
      </aside>
      <div className="drawing-canvas-region">{props.children}</div>
    <footer className="drawing-tools drawing-tools-bottom">
      <div className="drawing-shapes" role="group" aria-label={t('引导图形')}>
        <span className="drawing-shape-name">{t(props.shapeLabel)}</span>
        <button type="button" className="drawing-tool-button" onClick={props.onNextShape} disabled={props.disabled}>{t('换图形')}</button>
        <button type="button" className="drawing-tool-button" onClick={props.onClearShape} disabled={props.disabled}>{t('清除图形')}</button>
      </div>
      <div className="drawing-actions" role="group" aria-label={t('画作操作')}>
        <button type="button" className="drawing-tool-button" onClick={props.onUndo} disabled={props.disabled}>{t('撤销')}</button>
        <button type="button" className="drawing-tool-button" onClick={props.onClear} disabled={props.disabled}>{t('清空')}</button>
        <button type="button" className="drawing-tool-button" onClick={props.onSave} disabled={props.disabled}>{t('保存')}</button>
        <button type="button" className="drawing-tool-button drawing-finish" onClick={props.onFinish} disabled={props.disabled}>{t(props.disabled ? 'Nilo 在看…' : '完成')}</button>
      </div>
    </footer>
  </div>
}
