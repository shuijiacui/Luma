#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = relative => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'))
const catalog = read('literature/catalog.json')
const mapping = read('literature/rule-source-map.json')
const config = read('retrieval/config.json')
const cases = read('retrieval/eval-cases.json')
const entries = fs.readFileSync(path.join(root, 'rules/entries.jsonl'), 'utf8').trim().split(/\r?\n/).map(JSON.parse)
const errors = []
const docIds = new Set()
const docFiles = new Set()

for (const doc of catalog.documents ?? []) {
  if (!/^[a-z0-9-]+$/.test(doc.id) || docIds.has(doc.id)) errors.push(`invalid/duplicate document ID: ${doc.id}`)
  docIds.add(doc.id)
  if (!/^[^\\/]+\.pdf$/i.test(doc.file) || docFiles.has(doc.file)) errors.push(`invalid/duplicate PDF filename: ${doc.file}`)
  docFiles.add(doc.file)
  const file = path.join(root, 'references', doc.file)
  if (!fs.existsSync(file)) { errors.push(`missing PDF: ${doc.file}`); continue }
  const hash = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
  if (doc.sha256 !== hash) errors.push(`changed PDF hash: ${doc.file}`)
  if (doc.role !== 'reference_only' || !['needs_full_text_review', 'reviewed'].includes(doc.reviewStatus)) errors.push(`invalid review/role: ${doc.id}`)
  if (!['unverified', 'reviewed'].includes(doc.licenseStatus)) errors.push(`invalid license status: ${doc.id}`)
  if (typeof doc.retrievalAllowed !== 'boolean') errors.push(`missing retrieval policy: ${doc.id}`)
}
const files = fs.readdirSync(path.join(root, 'references')).filter(file => file.toLowerCase().endsWith('.pdf'))
for (const file of files) if (!docFiles.has(file)) errors.push(`uncatalogued PDF: ${file}`)
const entryIds = new Set(entries.map(entry => entry.id))
const mapped = new Set()
for (const row of mapping.rules ?? []) {
  if (!entryIds.has(row.entryId) || mapped.has(row.entryId)) errors.push(`invalid/duplicate rule ID: ${row.entryId}`)
  mapped.add(row.entryId)
  if (row.relation !== 'citation_candidate_unverified') errors.push(`unreviewed relation promoted: ${row.entryId}`)
  for (const id of row.candidateDocumentIds ?? []) if (!docIds.has(id)) errors.push(`unknown document ${id} in ${row.entryId}`)
  if (!Array.isArray(row.reviewedRelations)) errors.push(`missing reviewed relation list: ${row.entryId}`)
  for (const review of row.reviewedRelations ?? []) {
    if (!docIds.has(review.documentId) || !['supports', 'contradicts', 'context_only', 'not_applicable'].includes(review.assessment)
      || !Number.isInteger(review.pdfPage) || review.pdfPage < 1
      || typeof review.excerpt !== 'string' || !review.excerpt.trim()
      || typeof review.reviewer !== 'string' || !review.reviewer.trim()
      || !/^\d{4}-\d{2}-\d{2}$/.test(review.reviewedAt ?? '')) errors.push(`incomplete reviewed relation: ${row.entryId}`)
  }
}
for (const id of entryIds) if (!mapped.has(id)) errors.push(`unmapped rule: ${id}`)
if (!(config.topK >= 1 && config.topK <= 10 && config.scoreThreshold > 0 && config.scoreThreshold < 1)) errors.push('invalid retrieval bounds')
for (const item of cases.cases ?? []) for (const id of item.expectedAnyDocumentIds ?? []) if (!docIds.has(id)) errors.push(`unknown evaluation document: ${id}`)

if (errors.length) {
  errors.forEach(error => console.error(error))
  process.exit(1)
}
console.log(`Literature catalog valid: ${docIds.size} PDFs, ${mapped.size} rules, ${cases.cases.length} evaluation cases`)
