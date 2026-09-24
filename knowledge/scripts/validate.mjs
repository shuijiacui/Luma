#!/usr/bin/env node
// 知识库四层校验脚本：entries.jsonl + constraints.json + dispatch.config.json
// 用法：node knowledge/scripts/validate.mjs  （退出码 1 = 校验失败，CI/提交前必跑）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../psychology/rules');
const errors = [];
const SIGNALS = ['乐观平稳', '焦虑倾向', '低落倾向'];
const CONDITIONS = ['elements', 'colors.darkRatioMin', 'colors.dominantIncludes', 'colors.darkRatioMinForDominant',
  'composition.size', 'composition.position', 'composition.pressure', 'distortions', 'erasureMarksMin'];
const TIER_R = { 1: [0.7, 0.9], 2: [0.4, 0.6], 3: [0.0, 0.3] };
const TIER_SCAP = { 1: 0.6, 2: 0.2, 3: 0.2 };
const R_ENUM = [0.1, 0.3, 0.5, 0.7, 0.9]; // v2.2：reliability 离散枚举

// ---- entries.jsonl ----
const entries = fs.readFileSync(path.join(KB, 'entries.jsonl'), 'utf8')
  .trim().split('\n').map((l, i) => {
    try { return { ...JSON.parse(l), _line: i + 1 }; }
    catch (e) { errors.push(`entries 第${i + 1}行 JSON 解析失败: ${e.message}`); return null; }
  }).filter(Boolean);

const ids = new Set();
for (const e of entries) {
  const where = `${e.id || `第${e._line}行`}`;
  for (const f of ['id', 'featureMatch', 'emotionSignal', 'strength', 'reliability', 'cluster', 'tier', 'source'])
    if (e[f] === undefined) errors.push(`${where}: 缺必填字段 ${f}`);
  if (ids.has(e.id)) errors.push(`${where}: ID 重复`);
  ids.add(e.id);
  if (e.emotionSignal && !SIGNALS.includes(e.emotionSignal))
    errors.push(`${where}: emotionSignal 非法 "${e.emotionSignal}"（"需要关注"/"信息不足"由评分逻辑产生，禁止作为条目信号）`);
  if (!(e.strength > 0 && e.strength <= 1)) errors.push(`${where}: strength 越界 ${e.strength}`);
  if (!(e.reliability >= 0 && e.reliability <= 1)) errors.push(`${where}: reliability 越界 ${e.reliability}`);
  if (!R_ENUM.includes(e.reliability)) errors.push(`${where}: reliability 必须取离散枚举 ${R_ENUM.join('/')}`);
  if (e.tier && TIER_R[e.tier]) {
    const [lo, hi] = TIER_R[e.tier];
    if (e.reliability < lo || e.reliability > hi)
      errors.push(`${where}: tier ${e.tier} 要求 reliability ∈ [${lo},${hi}]，实际 ${e.reliability}`);
    if (e.strength > TIER_SCAP[e.tier])
      errors.push(`${where}: tier ${e.tier} strength 上限 ${TIER_SCAP[e.tier]}，实际 ${e.strength}`);
  }
  if (e.source === 'TBD' && e.reliability !== 0.1)
    errors.push(`${where}: source=TBD 时 reliability 必须 = 0.1`);
  for (const k of Object.keys(e.featureMatch || {}))
    if (!CONDITIONS.includes(k)) errors.push(`${where}: featureMatch 含未知条件 "${k}"`);
}

const audit = JSON.parse(fs.readFileSync(path.join(KB, 'audit.json'), 'utf8'));
const audited = new Set();
for (const row of audit.rules ?? []) {
  if (!ids.has(row.entryId)) errors.push(`audit: 未知条目 ${row.entryId}`);
  if (audited.has(row.entryId)) errors.push(`audit: 重复条目 ${row.entryId}`);
  audited.add(row.entryId);
  if (row.runtimeStatus !== 'retired_from_new_parent_reports') errors.push(`audit: ${row.entryId} 不应进入新家长报告`);
  if (!['unverified', 'review_required'].includes(row.sourceStatus)) errors.push(`audit: ${row.entryId} 来源状态非法`);
}
for (const id of ids) if (!audited.has(id)) errors.push(`audit: 缺少 ${id}`);

const observation = JSON.parse(fs.readFileSync(path.resolve(KB, '../../observation/catalog.json'), 'utf8'));
const conversation = JSON.parse(fs.readFileSync(path.resolve(KB, '../../child-development/conversation.json'), 'utf8'));
if (JSON.stringify(observation.ageRange) !== '[5,12]' || JSON.stringify(conversation.ageRange) !== '[5,12]')
  errors.push('新观察与沟通知识范围必须为 5–12 岁');
for (const band of ['5-7', '8-9', '10-12']) {
  const prompts = conversation.ageBands?.[band];
  for (const key of ['withSubject', 'withoutSubject', 'context', 'niloGuidance', 'niloClarify'])
    if (!prompts?.[key]?.zh || !prompts?.[key]?.en) errors.push(`年龄分层缺少 ${band}.${key} 的中英文内容`);
}
if (!conversation.niloGuidance?.zh || !conversation.niloGuidance?.en) errors.push('年龄未知时缺少 Nilo 通用对话指引');
for (const row of observation.observations ?? [])
  if (!row.id?.startsWith('OBS-') || !row.input || !row.meaning) errors.push('观察条目字段不完整');
const context = JSON.parse(fs.readFileSync(path.resolve(KB, '../literature/curated-context.json'), 'utf8'));
for (const source of context.sources ?? []) {
  if (!source.url?.startsWith('https://') || !source.reviewStatus?.endsWith('_checked')
    || !source.checkedSection || !source.population || !source.task
    || !source.text?.zh || !source.text?.en || !source.limitation?.zh || !source.limitation?.en)
    errors.push(`文献背景条目不完整或未经核对: ${source.id}`);
}

// ---- constraints.json ----
const constraints = JSON.parse(fs.readFileSync(path.join(KB, 'constraints.json'), 'utf8'));
if (!(constraints.validityCeiling?.value > 0 && constraints.validityCeiling.value < 1))
  errors.push('constraints: validityCeiling 必须在 (0,1)');
for (const id of constraints.ageMods?.affectedEntries || [])
  if (!ids.has(id)) errors.push(`constraints: ageMods 引用不存在的条目 ${id}`);
for (const c of constraints.conflictRegistry || [])
  for (const id of c.entries || [])
    if (!ids.has(id)) errors.push(`constraints: ${c.id} 引用不存在的条目 ${id}`);
for (const n of constraints.negativeEvidence || [])
  for (const id of n.appliedTo || [])
    if (id !== '*' && !ids.has(id)) errors.push(`constraints: negativeEvidence 引用不存在的条目 ${id}`);
if (!Array.isArray(constraints.redLineWords) || constraints.redLineWords.length === 0)
  errors.push('constraints: redLineWords 不能为空');

// ---- dispatch.config.json ----
const dispatch = JSON.parse(fs.readFileSync(path.join(KB, 'dispatch.config.json'), 'utf8'));
for (const [t, pol] of Object.entries(dispatch.tiers || {})) {
  const [lo, hi] = pol.reliabilityRange || [];
  const [elo, ehi] = TIER_R[t] || [];
  if (lo !== elo || hi !== ehi)
    errors.push(`dispatch: tier ${t} reliabilityRange [${lo},${hi}] 与校验规则 [${elo},${ehi}] 不一致`);
}
if (!(dispatch.decision?.threshold > 0 && dispatch.decision.threshold < 1))
  errors.push('dispatch: decision.threshold 必须在 (0,1)');

// ---- 结果 ----
const count = { 1: 0, 2: 0, 3: 0 };
entries.forEach(e => count[e.tier] !== undefined && count[e.tier]++);
if (errors.length) {
  console.error(`❌ 校验失败（${errors.length} 处）：`);
  errors.forEach(e => console.error('  - ' + e));
  process.exit(1);
}
console.log(`✅ 知识库校验通过：${entries.length} 条历史规则（L1 ${count[1]} / L2 ${count[2]} / L3 ${count[3]}）均已审计并退出新家长报告；5–12 岁观察词表有效`);
