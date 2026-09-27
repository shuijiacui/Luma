import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { MaterialPicker } from '@/features/child/components/MaterialPicker'
import { listMaterialSubjects } from '../../shared/niloMaterialLibrary.mjs'
import { getMaterialCuration, setMaterialCuration } from '../../shared/niloCuration.mjs'

afterEach(cleanup)

test('opens on the concrete subject with real SVG previews and changes nothing until a card is chosen', () => {
  const choose = vi.fn(), close = vi.fn()
  render(<MaterialPicker subjects={listMaterialSubjects()} initialSubject="cat" currentMaterialId="cat-0" onChoose={choose} onClose={close} />)
  expect(screen.getByRole('heading', { name: '小猫' })).toBeTruthy()
  const options = screen.getByRole('region', { name: '可选画法' })
  expect(options.querySelector('svg polyline')?.getAttribute('points')?.length).toBeGreaterThan(20)
  expect(choose).not.toHaveBeenCalled()
  fireEvent.click(within(options).getByRole('button', { name: '选择小猫画法 2' }))
  expect(choose).toHaveBeenCalledWith('cat-2')
  expect(choose).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('button', { name: '关闭，不换底图' }))
  expect(close).toHaveBeenCalledOnce()
})

test('search finds a concrete subject alias and displays real raster choices without professional style labels', () => {
  const choose = vi.fn()
  render(<MaterialPicker subjects={listMaterialSubjects()} initialSubject="cat" onChoose={choose} onClose={() => {}} />)
  fireEvent.change(screen.getByLabelText('找找想画什么'), { target: { value: '校舍' } })
  expect(screen.getByRole('heading', { name: '学校' })).toBeTruthy()
  const options = screen.getByRole('region', { name: '可选画法' })
  expect(options.querySelector('img')?.getAttribute('src')).toBe('/nilo-illustrations/illustration-library-school-beginner-01.png')
  expect(options.textContent).toContain('线条少一些')
  expect(options.textContent).toContain('细节多一些')
  expect(options.textContent).not.toMatch(/realistic|storybook|写实|精美/)
  expect(choose).not.toHaveBeenCalled()
  fireEvent.click(within(options).getAllByRole('button')[0])
  expect(choose).toHaveBeenCalledWith('illustration-library-school-beginner-01')
})

test('rejected materials stay out of the picker and no search match has a useful empty state', () => {
  const previous = getMaterialCuration()
  try {
    const originalCount = listMaterialSubjects().find(item => item.subject === 'cat')!.materials.length
    setMaterialCuration({ version: 1, decisions: { 'cat-2': 'reject' } })
    render(<MaterialPicker subjects={listMaterialSubjects()} initialSubject="cat" onChoose={() => {}} onClose={() => {}} />)
    expect(within(screen.getByRole('region', { name: '可选画法' })).getAllByRole('button')).toHaveLength(originalCount - 1)
    fireEvent.change(screen.getByLabelText('找找想画什么'), { target: { value: 'not-a-drawing-subject' } })
    expect(screen.getByRole('status').textContent).toContain('换个词')
  } finally { setMaterialCuration(previous) }
})

test('keyboard focus stays in the dialog, Escape closes it, and focus returns to the opener', () => {
  const opener = document.createElement('button'); opener.textContent = 'open'; document.body.appendChild(opener); opener.focus()
  const close = vi.fn()
  const view = render(<MaterialPicker subjects={listMaterialSubjects().filter(item => item.subject === 'cat').map(item => ({ ...item, materials: item.materials.filter(material => ['cat-0', 'cat-2'].includes(material.id)) }))} initialSubject="cat" onChoose={() => {}} onClose={close} />)
  const dialog = screen.getByRole('dialog')
  expect(document.activeElement).toBe(dialog)
  fireEvent.keyDown(dialog, { key: 'Tab' })
  expect(document.activeElement).toBe(screen.getByRole('button', { name: '关闭，不换底图' }))
  fireEvent.keyDown(document.activeElement!, { key: 'Tab', shiftKey: true })
  expect(document.activeElement).toBe(screen.getByRole('button', { name: '选择小猫画法 2' }))
  fireEvent.keyDown(dialog, { key: 'Escape' })
  expect(close).toHaveBeenCalledOnce()
  view.unmount()
  expect(document.activeElement).toBe(opener)
  expect(opener.inert).not.toBe(true)
  opener.remove()
})

test('replacement mode displays only the target subject, with no catalogue navigation or cross-subject search', () => {
  const choose = vi.fn(), subjects = listMaterialSubjects()
  const cat = subjects.find(item => item.subject === 'cat')!
  const current = cat.materials.find(material => material.kind === 'illustration')!
  render(<MaterialPicker subjects={subjects} initialSubject="cat" targetName="小猫" currentMaterialId={current.id} variantsOnly onChoose={choose} onClose={() => {}} />)
  expect(screen.getByRole('dialog', { name: '给小猫换个画法' })).toBeTruthy()
  expect(screen.queryByRole('navigation')).toBeNull()
  expect(screen.queryByRole('textbox')).toBeNull()
  const choices = within(screen.getByRole('region', { name: '可选画法' })).getAllByRole('button')
  expect(choices).toHaveLength(cat.materials.length)
  expect(choices.every(button => button.getAttribute('aria-label')?.startsWith('选择小猫画法'))).toBe(true)
  const selected = choices.find(button => button.getAttribute('aria-pressed') === 'true') as HTMLButtonElement
  expect(selected.querySelector('img')?.getAttribute('src')).toBe(current.src)
  expect(selected.textContent).toContain('正在画')
  expect(selected.disabled).toBe(true)
  fireEvent.click(selected)
  expect(choose).not.toHaveBeenCalled()
  const alternative = choices.find(button => button !== selected)!
  fireEvent.click(alternative)
  expect(choose).toHaveBeenCalledExactlyOnceWith(cat.materials[choices.indexOf(alternative)].id)
})

test('an unavailable replacement subject has no fallback to another object and invites continuing the drawing', () => {
  render(<MaterialPicker subjects={listMaterialSubjects()} initialSubject="unregistered-subject" targetName="云朵小屋" variantsOnly onChoose={vi.fn()} onClose={() => {}} />)
  expect(screen.getByRole('dialog', { name: '给云朵小屋换个画法' })).toBeTruthy()
  expect(screen.getByRole('status').textContent).toContain('先接着画')
  expect(screen.queryByRole('textbox')).toBeNull()
  expect(within(screen.getByRole('region', { name: '可选画法' })).queryAllByRole('button')).toHaveLength(0)
  expect(screen.getByRole('dialog').textContent).not.toContain('换个词')
})

test('a target with only its current drawing keeps the current marker without suggesting a different object', () => {
  const choose = vi.fn(), cat = listMaterialSubjects().find(item => item.subject === 'cat')!
  const current = cat.materials[0]
  render(<MaterialPicker subjects={[{ ...cat, materials: [current] }]} initialSubject="cat" currentMaterialId={current.id} variantsOnly onChoose={choose} onClose={() => {}} />)
  expect(screen.getByRole('status').textContent).toContain('暂时没有别的画法')
  const button = within(screen.getByRole('region', { name: '可选画法' })).getByRole('button') as HTMLButtonElement
  expect(button.getAttribute('aria-pressed')).toBe('true')
  expect(button.textContent).toContain('正在画')
  expect(button.disabled).toBe(true)
  fireEvent.click(button)
  expect(choose).not.toHaveBeenCalled()
  expect(screen.queryByRole('navigation')).toBeNull()
})

test('replacement mode follows the new target prop instead of retaining a previously viewed object', () => {
  const subjects = listMaterialSubjects(), choose = vi.fn(), close = vi.fn()
  const view = render(<MaterialPicker subjects={subjects} initialSubject="cat" variantsOnly onChoose={choose} onClose={close} />)
  view.rerender(<MaterialPicker subjects={subjects} initialSubject="moon" targetName="天空里的月亮" variantsOnly onChoose={choose} onClose={close} />)
  expect(screen.getByRole('dialog', { name: '给天空里的月亮换个画法' })).toBeTruthy()
  expect(screen.queryByRole('heading', { name: '小猫' })).toBeNull()
  expect(screen.getByRole('heading', { name: '月亮' })).toBeTruthy()
  expect(choose).not.toHaveBeenCalled()
})
