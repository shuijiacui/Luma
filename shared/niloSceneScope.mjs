/** Clear, single-object instructions keep the existing direct drawing path. */
export function needsCreativeScenePlanning(text) {
  if (typeof text !== 'string') return false
  const value = text.trim().replace(/^nilo[，,、\s]*/i, '')
  // A literal book remains one object even when its title contains a scene style.
  if (/^(?:请|帮我|给我|我想要?|我要|你|再|\s)*(?:画|绘制)(?:一?本)[^，,。！？!?]*(?:书|绘本)(?:吧|呀|啊)?[。！!？?]*$/u.test(value)
    || /^(?:please\s+)?(?:draw|paint)\s+(?:a|one|the)\s+[^,.!?]*(?:book|storybook)[.!?]*$/i.test(value)) return false
  // This is a scope gate, not a catalogue of supported themes. An unfamiliar
  // imagined place gets the same semantic planning as a familiar one. The noun
  // must be the setting being requested, not a modifier of one concrete object.
  if (/^(?:请|先|暂时|现在|帮我|\s)*(?:不要|别|不用|不想)(?:再)?(?:画|绘|创作)|^(?:please\s+)?(?:don't|do not|stop)\s+(?:draw|paint|create)/i.test(value)) return false
  const drawing = /画|绘|创作|设计|布置|添|加|\b(draw|paint|create|make|add)\b/i.test(value)
  // Exclusions and preservation clauses must not turn a literal single object
  // into a whole new scene (e.g. "draw a sun, don't change the world").
  const requested = value.split(/[，,。;；]\s*(?:不要|别|不用|保留|保持|别动|don't|do not|keep\b)/i)[0]
    .replace(/[吧呀啊。！!？?\s]+$/u, '')
  const listed = (requested.match(/(?:、|以及|还有|和|与|\band\b|\bplus\b)/gi)?.length ?? 0) >= 2
  if (!listed && /(?:画|绘制|添|加)(?:一|这|那)?(?:只|颗|朵|棵|条|辆|本|盏)/u.test(requested)) return false
  const subjectClause = requested.split(/[，,;；]/u)[0]
  const englishHead = requested.replace(/^(?:(?:please|can you|could you|i want to)\s+)*(?:draw|paint|create|make|add)\s+/i, '')
    .split(/\s+(?:in|on|under|above|inside|made of|like|with)\s+/i)[0]
  const place = /(?:场景|风景|世界|天地|国度|星球|星系|宇宙|地方|空间|花园|森林|丛林|海洋|海底|天空|村庄|村落|城市|小镇|山谷|仙境|乐园|梦境)(?:里|中|里面)?$/u
    .test(subjectClause)
    || /\b(?:scene|landscape|world|realm|planet|galaxy|universe|place|garden|forest|jungle|ocean|village|city|town|valley|wonderland|dreamscape)$/i.test(englishHead)
  if (place) {
    // Bare setting answers are accepted; a question/comment or local edit is
    // still handled by dialogue/editing instead of starting a new proposal.
    return drawing || !/[?？]|^(?:为什么|怎么|怎样|如何|你知道|你喜欢|把|移动|删除|删掉|缩小|放大)|\b(?:why|how|know|like|move|delete|remove|resize)\b/i.test(value)
  }
  if (!drawing) return false
  if (/整[幅张个].*(?:画|设计)|(?:画|绘|创作)(?:一)?(?:幅|张)|(?:画|绘|创作).*(?:感觉|氛围|风格)$|\b(?:whole|entire)\s+(?:picture|scene)|\b(?:scene|landscape)\b/i.test(requested)) return true
  // Three or more explicitly listed subjects require a compositional choice.
  // One invented object or a specified two-object relationship remains direct.
  return listed
}
