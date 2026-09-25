import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { useLocale } from '@/i18n'
import { compileSketch } from '../../../../../shared/niloSketch.mjs'
import type { Material, MaterialSubject } from '../../../../../shared/niloMaterialLibrary.mjs'

function MaterialPreview({ material }: { material: Material }) {
  const [failed, setFailed] = useState(false)
  const paths = useMemo(() => material.sketch ? compileSketch(material.sketch) ?? [] : [], [material.sketch])
  if (material.kind === 'illustration') return failed ? <span aria-hidden="true">◇</span>
    : <img src={material.src} alt="" loading="lazy" draggable={false} onError={() => setFailed(true)} />
  const aspect = material.aspect || 1
  return <svg viewBox={`-0.06 -0.06 ${aspect + .12} 1.12`} aria-hidden="true" fill="none" stroke="#36463f" strokeWidth=".008" strokeLinecap="round" strokeLinejoin="round">
    {paths.map((path, index) => <polyline key={index} points={path.map(point => `${point.x * aspect},${point.y}`).join(' ')} />)}
  </svg>
}

interface Props {
  subjects: MaterialSubject[]
  initialSubject: string | null
  currentMaterialId?: string
  busy?: boolean
  error?: string
  onChoose: (id: string) => void
  onClose: () => void
}

export function MaterialPicker({ subjects, initialSubject, currentMaterialId, busy = false, error, onChoose, onClose }: Props) {
  const locale = useLocale()
  const en = locale === 'en'
  const titleId = useId(), searchId = useId()
  const dialog = useRef<HTMLDivElement>(null)
  const navigation = useRef<HTMLElement>(null)
  const options = useRef<HTMLElement>(null)
  const [query, setQuery] = useState('')
  const [subject, setSubject] = useState(initialSubject ?? subjects[0]?.subject ?? '')
  const normalized = query.trim().toLocaleLowerCase()
  const shownSubjects = subjects.filter(item => !normalized || [item.subject, item.name, ...item.aliases]
    .some(value => value.toLocaleLowerCase().includes(normalized)))
  const selected = shownSubjects.find(item => item.subject === subject) ?? shownSubjects[0]

  useEffect(() => {
    navigation.current?.querySelector('[aria-pressed="true"]')?.scrollIntoView?.({ block: 'nearest' })
    if (options.current) options.current.scrollTop = 0
  }, [selected?.subject])

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const containers = [...document.body.children].filter(element => element instanceof HTMLElement && !element.contains(dialog.current)) as HTMLElement[]
    const previousInert = containers.map(element => element.inert)
    containers.forEach(element => { element.inert = true })
    dialog.current?.focus()
    return () => {
      containers.forEach((element, index) => { element.inert = previousInert[index] })
      if (previous?.isConnected) previous.focus()
    }
  }, [])

  function keyboard(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') { event.preventDefault(); onClose(); return }
    if (event.key !== 'Tab') return
    const focusable = [...(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),[tabindex="0"]') ?? [])]
    const first = focusable[0], last = focusable.at(-1)
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last?.focus() }
    else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) { event.preventDefault(); first?.focus() }
  }

  const subjectName = (item: MaterialSubject) => en ? item.subject.replace(/([a-z])([A-Z])/g, '$1 $2') : item.name
  return createPortal(<div className="nilo-material-backdrop" onClick={event => { if (event.target === event.currentTarget) onClose() }}>
    <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className="nilo-material-picker" onKeyDown={keyboard}>
      <header className="nilo-material-header">
        <div><h2 id={titleId}>{en ? 'Pick a drawing' : '挑一张来画'}</h2><p>{en ? 'Choose a picture you like. Your own drawing stays.' : '看看哪张喜欢，你画的线条都留着。'}</p></div>
        <button className="nilo-material-close" type="button" onClick={onClose} aria-label={en ? 'Close without changing' : '关闭，不换底图'}>×</button>
      </header>
      <div className="nilo-material-search">
        <label htmlFor={searchId}>{en ? 'Find something to draw' : '找找想画什么'}</label>
        <input id={searchId} value={query} onChange={event => setQuery(event.target.value)} placeholder={en ? 'Cat, dog, school…' : '小猫、小狗、学校…'} autoComplete="off" />
      </div>
      {error && <p className="nilo-material-error" role="alert">{error}</p>}
      <div className="nilo-material-body">
        <nav ref={navigation} className="nilo-material-subjects" aria-label={en ? 'Things to draw' : '想画的东西'}>
          {shownSubjects.map(item => <button type="button" key={item.subject} aria-pressed={selected?.subject === item.subject} onClick={() => setSubject(item.subject)}>
            <span>{subjectName(item)}</span><small>{item.materials.length}</small>
          </button>)}
        </nav>
        <section ref={options} className="nilo-material-options" aria-label={en ? 'Drawing choices' : '可选画法'} aria-busy={busy}>
          {selected ? <><h3>{subjectName(selected)}</h3><div className="nilo-material-grid">
            {selected.materials.map((material, index) => <button type="button" className="nilo-material-card" key={material.id} disabled={busy}
              aria-label={en ? `Choose ${subjectName(selected)} drawing ${index + 1}` : `选择${subjectName(selected)}画法 ${index + 1}`}
              aria-pressed={currentMaterialId === material.id} onClick={() => onChoose(material.id)}>
              <span className="nilo-material-preview"><MaterialPreview material={material} /></span>
              <span className="nilo-material-card-caption"><span>{material.difficulty === 'beginner' ? (en ? 'Fewer lines' : '线条少一些') : material.difficulty === 'detailed' ? (en ? 'Look more closely' : '仔细观察画') : (en ? 'A few more details' : '细节多一些')}</span>
                {currentMaterialId === material.id && <small>{en ? 'On your paper' : '正在画'}</small>}</span>
            </button>)}
          </div></> : <p className="nilo-material-empty" role="status">{en ? 'No pictures found. Try another word.' : '还没找到，换个词试试吧。'}</p>}
        </section>
      </div>
    </div>
  </div>, document.body)
}
