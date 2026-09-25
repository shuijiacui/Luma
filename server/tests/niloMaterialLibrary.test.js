import { afterEach, describe, expect, test } from 'vitest'
import { drawingRecipes, getDrawingRecipe } from '../../shared/niloRecipes.mjs'
import { drawingIllustrations } from '../../shared/niloIllustrations.mjs'
import { getMaterialCuration, setMaterialCuration, isMaterialEnabled, retiredMaterialIdentities } from '../../shared/niloCuration.mjs'
import { createMaterialProposal, getMaterial, getMaterialChoices, listMaterialSubjects,
  materialCategory, materialSubjectForProposal, rankMaterials } from '../../shared/niloMaterialLibrary.mjs'
import { validateProposal } from '../src/services/niloDialogue.js'

const originalCuration = getMaterialCuration()
afterEach(() => setMaterialCuration(originalCuration))
const frame = { template: 'illustration', illustrationId: 'illustration-medium-school', subject: '学校',
  x: .25, y: .25, width: .4, height: .4, rotation: 8, color: '#405b56', strokeWidth: 4, brushKind: 'pencil' }

describe('one reviewed material library for both media', () => {
  test('every eligible source appears once, vectors are beginner and retired art stays unavailable', () => {
    const groups = listMaterialSubjects(), all = groups.flatMap(group => group.materials)
    const expected = [...drawingRecipes, ...drawingIllustrations].filter(item => isMaterialEnabled(item.id))
    expect(all.map(item => item.id).sort()).toEqual(expected.map(item => item.id).sort())
    expect(new Set(all.map(item => item.id)).size).toBe(all.length)
    expect(new Set(groups.map(item => item.subject)).size).toBe(groups.length)
    for (const item of all.filter(item => item.kind === 'recipe')) expect(item.difficulty).toBe('beginner')
    for (const item of retiredMaterialIdentities) expect(getMaterial(item.id)).toBeUndefined()
  })

  test.each([['猫', 'cat'], ['小猫', 'cat'], ['CAT', 'cat'], ['狗狗', 'dog'], ['school', 'school'], ['学校', 'school']])('aliases %s reach only the concrete subject %s', (query, subject) => {
    const choices = getMaterialChoices(query)
    expect(choices.length).toBeGreaterThan(0)
    expect(choices.every(item => item.subject === subject)).toBe(true)
  })

  test('search aliases are not lost while grouping and associations are not mistaken for categories', () => {
    const groups = listMaterialSubjects()
    expect(groups.find(group => group.subject === 'cat').aliases).toEqual(expect.arrayContaining(['cat', '小猫', '猫']))
    expect(materialCategory({ subject: 'kite', related: ['character', 'person'] })).toBe('stilllife')
    expect(materialCategory('bench')).toBe('stilllife')
    expect(materialCategory('butterfly')).toBe('animals')
    expect(materialCategory('school')).toBe('architecture')
    expect(materialCategory('readingchild')).toBe('people')
    expect(materialCategory('hotairballoon')).toBe('vehicles')
    expect(getMaterialChoices('schoolbag')).toEqual([])
  })

  test('new review decisions affect lookups immediately without destroying raw saved identities', () => {
    const cat = getMaterialChoices('cat')[0]
    setMaterialCuration({ version: 1, decisions: { [cat.id]: 'reject' } })
    expect(getMaterial(cat.id)).toBeUndefined()
    expect(getMaterialChoices('cat').some(item => item.id === cat.id)).toBe(false)
    expect(createMaterialProposal(cat.id, frame)).toBeNull()
    expect(getDrawingRecipe(cat.id)).toBeTruthy()
    expect(materialSubjectForProposal({ template: 'custom', recipeId: cat.id, subject: '猫' })).toBe('cat')
    expect(materialSubjectForProposal({ template: 'custom', recipeId: 'school-4', subject: '学校' })).toBe('school')
  })

  test('explicit choice preferences reorder alternatives without filtering or mutating the input', () => {
    const choices = [
      { id: 'a', style: 'storybook', difficulty: 'beginner' },
      { id: 'b', style: 'realistic', difficulty: 'medium' },
      { id: 'c', style: 'storybook', difficulty: 'medium' },
    ]
    expect(rankMaterials(choices, { preferredStyle: 'realistic' }).map(item => item.id)).toEqual(['b', 'a', 'c'])
    expect(rankMaterials(choices, { preferredStyle: 'realistic', recentIds: ['c', 'a'] }).map(item => item.id)).toEqual(['c', 'a', 'b'])
    expect(choices.map(item => item.id)).toEqual(['a', 'b', 'c'])
    const material = getMaterialChoices('cat').find(item => item.kind === 'recipe')
    material.sketch.paths.length = 0
    expect(getMaterial(material.id).sketch.paths.length).toBeGreaterThan(0)
  })
})

describe('explicitly selected reference proposals', () => {
  test('every selectable material produces a trusted, server-valid standalone proposal', () => {
    for (const material of listMaterialSubjects().flatMap(group => group.materials)) {
      const proposal = createMaterialProposal(material.id, null, 1.5)
      expect(proposal, material.id).toBeTruthy()
      expect(validateProposal(proposal, { canvasAspect: 1.5 }), material.id).toBeTruthy()
      expect(materialSubjectForProposal(proposal)).toBe(material.subject)
      expect(proposal.target).toBe(material.name)
      expect(proposal.src).toBeUndefined()
    }
  })

  test('same-subject images keep frame and rotation with the new trusted identifier', () => {
    const proposal = createMaterialProposal('illustration-school', frame, 1)
    for (const key of ['x', 'y', 'width', 'height', 'rotation']) expect(proposal[key]).toBe(frame[key])
    expect(proposal).toMatchObject({ illustrationId: 'illustration-school', subject: '学校', brushKind: 'pencil' })
    expect(proposal.recipeId).toBeUndefined()
    expect(proposal.sketch).toBeUndefined()
  })

  test('a different subject clears old attachment and narrative metadata in either medium', () => {
    const cat = getMaterialChoices('cat').find(item => item.kind === 'recipe')
    const source = { ...frame, anchor: { x: .1, y: .1, width: .2, height: .2 }, placement: 'inside',
      attachment: { x: .2, y: .2 }, contact: {}, echoPoints: [], target: '旧学校的窗户', relation: '旧关系' }
    const vector = createMaterialProposal(cat.id, source)
    expect(vector).toMatchObject({ template: 'custom', recipeId: cat.id, subject: cat.name, target: cat.name, placementPolicy: 'free' })
    for (const key of ['illustrationId', 'anchor', 'placement', 'attachment', 'contact', 'echoPoints']) expect(vector[key]).toBeUndefined()
    expect(validateProposal(vector)).toBeTruthy()
    const image = createMaterialProposal('illustration-medium-school', vector)
    expect(image).toMatchObject({ template: 'illustration', subject: '学校' })
    expect(image.recipeId).toBeUndefined()
    expect(image.sketch).toBeUndefined()
    expect(source.attachment).toEqual({ x: .2, y: .2 })
  })

  test('large image to vector retains centre, rotation and proportions within unchanged vector limits', () => {
    const cat = getMaterialChoices('cat').find(item => item.kind === 'recipe')
    const source = { ...frame, x: .16, y: .16, width: .68, height: .68 }
    const proposal = createMaterialProposal(cat.id, source)
    expect(proposal.width).toBeLessThanOrEqual(.45)
    expect(proposal.height).toBeLessThanOrEqual(.45)
    expect(proposal.width * proposal.height).toBeLessThanOrEqual(.16)
    expect(proposal.width / proposal.height).toBeCloseTo(source.width / source.height)
    expect(proposal.x + proposal.width / 2).toBeCloseTo(source.x + source.width / 2)
    expect(proposal.y + proposal.height / 2).toBeCloseTo(source.y + source.height / 2)
    expect(proposal.rotation).toBe(source.rotation)
    expect(validateProposal(proposal)).toBeTruthy()
    expect(source.width).toBe(.68)
  })

  test('unknown authority and impossible layouts never become a selected proposal', () => {
    expect(createMaterialProposal('https://example.com/image.png', frame)).toBeNull()
    expect(createMaterialProposal('illustration-school', frame, 0)).toBeNull()
    expect(createMaterialProposal('illustration-school', { ...frame, x: 2 })).toBeNull()
  })
})
