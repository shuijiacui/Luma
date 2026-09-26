import type { ArtworkMemory, ParentChatInput, ParentChatSnapshot, ParentChatTurn } from '@/lib/api/communicationApi'
import type { ArtworkKind } from '../components/dashboard/artworks'

type Locale = 'zh' | 'en'
type Topic = 'repair' | 'school' | 'homework' | 'screens' | 'art'
const STORAGE_PREFIX = 'luma_parent_chat_demo_v1:'
const MAX_TURNS = 30
const KIND: Record<string, ArtworkKind> = { 'demo-boat': 'boat', 'demo-tree': 'nature', 'demo-family': 'family', 'demo-animal': 'animal' }
export const demoArtworkKind = (sourceId: string) => KIND[sourceId]

export function demoArtworkMemory(locale: Locale): ArtworkMemory[] {
  const en = locale === 'en'
  return [
    { sourceId: 'demo-boat', createdAt: '2026-09-08T00:00:00Z', title: en ? 'A little boat going far away' : '一艘去远方的小船', observation: en ? 'A sailboat, water and the sun appear in the picture.' : '画面里有一艘帆船、水面和太阳。' },
    { sourceId: 'demo-tree', createdAt: '2026-09-06T00:00:00Z', title: en ? 'A little forest' : '一片小森林', observation: en ? 'Trees and small flowers appear in the picture.' : '画面里有树和小花。' },
    { sourceId: 'demo-family', createdAt: '2026-09-03T00:00:00Z', title: en ? 'Together' : '我们在一起', observation: en ? 'Several people stand together in the picture.' : '画面里有几个人物站在一起。' },
    { sourceId: 'demo-animal', createdAt: '2026-08-29T00:00:00Z', title: en ? 'An animal friend' : '我的动物朋友', observation: en ? 'An orange animal appears in the picture.' : '画面里有一只橙色的动物。' },
  ].map(work => ({ ...work, imageUrl: null, evidenceIds: [], provenance: 'child' }))
}

const storageKey = (scope: string, locale: Locale) => `${STORAGE_PREFIX}${encodeURIComponent(scope)}:${locale}`

export function loadDemoChat(scope: string, locale: Locale): ParentChatSnapshot {
  const works = demoArtworkMemory(locale)
  const empty: ParentChatSnapshot = { revision: 0, available: true, turns: [], memory: { works, scannedCount: works.length, limit: works.length } }
  try {
    const saved = sessionStorage.getItem(storageKey(scope, locale))
    if (!saved || saved.length > 200_000) return empty
    const value = JSON.parse(saved)
    if (!Array.isArray(value.turns) || !Number.isSafeInteger(value.revision) || value.revision < 0) return empty
    const ids = new Set<string>()
    const turns: ParentChatTurn[] = []
    for (const turn of value.turns.slice(-MAX_TURNS)) {
      if (typeof turn?.id !== 'string' || ids.has(turn.id) || typeof turn.userText !== 'string' || turn.userText.length > 2000
        || typeof turn.reply !== 'string' || turn.reply.length > 2400 || typeof turn.createdAt !== 'string'
        || !Number.isFinite(Date.parse(turn.createdAt)) || !Array.isArray(turn.sourceIds)) continue
      ids.add(turn.id)
      turns.push({ id: turn.id, userText: turn.userText, reply: turn.reply, createdAt: turn.createdAt,
        sourceId: works.some(work => work.sourceId === turn.sourceId) ? turn.sourceId : null,
        sources: works.filter(work => turn.sourceIds.includes(work.sourceId)) })
    }
    return { ...empty, revision: value.revision, turns }
  } catch { return empty }
}

export function saveDemoChat(scope: string, locale: Locale, snapshot: ParentChatSnapshot) {
  try {
    sessionStorage.setItem(storageKey(scope, locale), JSON.stringify({ revision: snapshot.revision,
      turns: snapshot.turns.slice(-MAX_TURNS).map(({ sources, ...turn }) => ({ ...turn, sourceIds: sources.map(work => work.sourceId) })) }))
  } catch { /* Chat still works when session storage is unavailable. */ }
}

function topicOf(text: string, sourceId: string | null): Topic | null {
  if (sourceId || /画|创作|小船|森林|天线|artwork|draw|painting|boat|forest/i.test(text)) return 'art'
  if (/作业|功课|写字|homework/i.test(text)) return 'homework'
  if (/手机|屏幕|游戏|平板|screen|phone|game|tablet/i.test(text)) return 'screens'
  if (/学校|放学|同学|幼儿园|school|classmate/i.test(text)) return 'school'
  if (/吼|发.{0,2}脾气|洗澡|道歉|大声|喊|生气|yell|shout|temper|bath|apolog/i.test(text)) return 'repair'
  return null
}

/** Authored demo dialogue only. No API client or network dependency. */
export function createDemoTurn(snapshot: ParentChatSnapshot, input: ParentChatInput): ParentChatTurn {
  const text = input.text.trim()
  const say = (zh: string, en: string) => input.locale === 'en' ? en : zh
  const history = snapshot.turns.slice(-12)
  const previousTopic = [...history].reverse().map(turn => topicOf(turn.userText, turn.sourceId)).find(Boolean)
  const topic = topicOf(text, input.sourceId) ?? previousTopic
  const sameTopic = history.some(turn => topicOf(turn.userText, turn.sourceId) === topic)
  const askingHow = /怎么|怎么办|开口|说什么|告诉我|给我一句|how|what (?:can|should) I say/i.test(text)
  const tried = /试过|没用|不管用|还是不|行不通|tried|didn.t work|still won.t/i.test(text)
  const lastSource = [...history].reverse().find(turn => turn.sources.length)?.sources[0]?.sourceId
  const explicitSource = /船|boat/i.test(text) ? 'demo-boat' : /树|森林|forest|tree/i.test(text) ? 'demo-tree'
    : /动物|animal/i.test(text) ? 'demo-animal' : /人物|全家|family picture/i.test(text) ? 'demo-family' : null
  const source = snapshot.memory.works.find(work => work.sourceId === (input.sourceId ?? explicitSource ?? lastSource))
  let reply: string
  let sources: ArtworkMemory[] = []

  if (/不想活|自杀|伤害自己|想死|打死|杀了|kill myself|suicid|kill my child/i.test(text)) {
    reply = say('先把眼前的安全顾好。如果你担心自己会伤害自己或孩子，请马上让一位信任的人过来陪着，把可能伤人的东西放远；有立即危险时联系当地急救。你现在和孩子在一起吗？', 'Please get someone you trust to stay with you now. If you might hurt yourself or your child, move away from anything that could cause harm and contact local emergency help if there is immediate danger. Are you with your child right now?')
  } else if (/想打|忍不住.{0,4}打|揍他|揍孩子|want to hit|might hit/i.test(text)) {
    reply = say('先别动手。如果孩子眼下是安全的，和他拉开一点距离，找个信任的人接手一会儿。现在先让你们俩都安全，洗澡、作业这些事可以往后放。', 'Please don’t act on that urge. If your child is safe, put some distance between you and ask someone you trust to take over for a while. Getting through this safely matters more right now than baths or homework.')
  } else if (/^(谢谢|谢了|好的|好吧|明白了|嗯嗯|好，我试试|我试试|thanks|thank you|okay|ok)[。！!,.，\s]*$/i.test(text)) {
    reply = say('好，先到这里。想接着说的时候，再慢慢聊。', 'Okay. We can leave it there for now and pick it up when you want to.')
  } else if (/不是好.{0,3}(妈|爸|家长)|不是个好|失败的|糟糕的.{0,3}(妈|爸)|bad (?:mother|father|parent)/i.test(text)) {
    reply = say('一次没忍住，不等于你就是个糟糕的家长。刚才的事可以认真补一句，但不用把整个人都否定掉。', 'Losing your temper once doesn’t sum you up as a parent. You can take responsibility for that moment without turning it into a verdict on yourself.')
  } else if (/我也.{0,4}累|很累|好累|累死|每次都.{0,8}我|不想再调整|tired|exhausted/i.test(text) && !askingHow) {
    reply = say('每次都得你先忍住，还得琢磨怎么把话说好，确实很累。你也会有不想再讲道理的时候。', 'Always having to be the one who holds back and finds the right words gets exhausting. Sometimes you just don’t have another careful explanation in you.')
  } else if (/只想.{0,6}(说说|倾诉)|不想听建议|别给建议|just (?:vent|listen)|no advice/i.test(text)) {
    reply = say('那就先不想办法。你接着说。', 'Then we can leave the advice aside. Go on.')
  } else if (/说不出口|肉麻|太正式|不像我|can.t say|too cheesy|too formal/i.test(text)) {
    reply = topic === 'school'
      ? say('那就一句：“今天有没有一点点好玩的事？”不用郑重坐下来聊，碰巧说到就说。', 'Try something smaller: “Anything even a little funny happen today?” It doesn’t need to be a big sit-down conversation.')
      : topic === 'art'
        ? say('那就指着画问一句：“这里画的什么呀？”用你平常的语气就好。', 'You could just point and ask, “What’s this bit?” In your usual voice.')
        : say('那就短一点：“刚才我说重了，对不起。咱们重新说。”不用讲得很漂亮，说得出口就好。', 'Keep it short: “I was too harsh. I’m sorry. Can we start again?” It doesn’t have to sound polished.')
  } else if (/心理咨询|像机器|正常说话|别分析|robotic|talk normally|stop analy/i.test(text)) {
    reply = say('好，不绕了。刚才那件事里，哪句话最让你堵得慌？', 'Okay. Which part of what happened is still bothering you most?')
  } else if (topic === 'art') {
    if (/孤独|焦虑|抑郁|心理|性格|lonely|anxi|depress|personality/i.test(text)) {
      reply = say('单凭一幅画，看不出这些。小船也好、用了什么颜色也好，都不能替他解释心里的事。你是还留意到了生活里的什么变化，才有这个担心吗？', 'A drawing on its own can’t tell us that. A boat or a particular colour can’t explain what’s going on inside him. Have you noticed something in everyday life that made you wonder?')
    } else if (/天线|antenna/i.test(text)) {
      reply = say('原来是他设计的天线。那可以顺着他的想法问：“这个天线能收到什么？”让他来讲自己的设计。', 'So it’s an antenna he designed. You could follow his idea: “What can this antenna pick up?” Let him tell you about his design.')
    } else if (/不是.{1,20}是|其实.{0,16}是|actually|isn.t a/i.test(text)) {
      reply = say('那就按他的说法来。可以接一句：“原来是这个，你再给我讲讲。”画里的意思，他最有发言权。', 'Then go with his description. “Oh, that’s what it is. Tell me a bit more.” He gets to say what his picture means.')
    } else if (/不想回家|不回家|not want to go home/i.test(text)) {
      reply = say('先顺着小船的故事听一听，可以问：“那它现在想去哪儿？”不用急着把小船和他本人画等号，等他把故事讲下去。', 'You can stay with the boat’s story: “Where does it want to go instead?” There’s no need to assume the boat stands for him. Let the story unfold.')
    } else if (tried || /不知道|不愿意|不想讲|不说|不回答|don.t know|won.t talk|doesn.t want/i.test(text)) {
      reply = say('那就先不追问了。可以说：“好，我陪你看看。”一起看画，也不一定非得聊出个故事。', 'Then you can let the question go. “Okay. I’ll just look with you.” Looking at a picture together doesn’t have to turn into a story.')
    } else if (source) {
      reply = source.sourceId === 'demo-tree'
        ? say('这幅小森林里有树和小花。可以指着一处问：“这里是个什么地方呀？”先听他的版本，不用替他把故事编好。', 'There are trees and little flowers in this forest. You could point to a spot and ask, “What kind of place is this?” Leave the story to him.')
        : source.sourceId === 'demo-family'
          ? say('这幅画里，几个人站在一起。可以问一句：“他们在一起做什么呀？”先听他讲，不急着猜哪个是爸爸、哪个是妈妈。', 'There are several people together here. “What are they doing together?” lets him tell you without you having to guess who is Mum or Dad.')
          : source.sourceId === 'demo-animal'
            ? say('可以从这只小动物聊起：“它有名字吗？”他愿意讲，你就听一听；不想讲，就一起看看它的样子。', 'You could start with the animal: “Does it have a name?” If he wants to tell you, listen. If not, you can just enjoy looking at it together.')
            : say('可以从那艘小船聊起：“这艘船想去哪里呀？”等他讲，你再顺着接一句。不用先问画得像不像，也不用急着把它变成一个道理。', 'You could start with the boat: “Where does this boat want to go?” Then follow what he says. There’s no need to judge how realistic it looks or turn it into a lesson.')
      sources = [source]
    } else {
      reply = say('最近有那幅小船，还有一片小森林。你可以先让他挑：“今天想给我讲哪一幅？”从他愿意讲的那张开始，会轻松一点。', 'There’s the little boat and the small forest. You could let him choose: “Which one would you like to tell me about today?” Start with the one he feels like sharing.')
      sources = snapshot.memory.works.filter(work => ['demo-boat', 'demo-tree'].includes(work.sourceId))
    }
  } else if (topic === 'school') {
    if (tried) reply = say('那先别再换着问法试了。除了不讲学校，他回家后还有什么跟以前不一样的吗？', 'Then there’s no need to keep trying a new way of asking. Apart from not talking about school, has anything else changed when he comes home?')
    else if (/最近|以前.{0,5}(会|愿意)|recent|used to/i.test(text) && sameTopic) reply = say('那让你在意的是这个变化。可以找个不赶时间的时刻，说一句：“最近你好像不太想聊学校，要是有不开心的事，可以跟我说。”说完先停一停。', 'It’s the change that’s worrying you. At an unhurried moment, you could say, “You haven’t felt like talking about school lately. If something’s bothering you, you can tell me.” Then leave some space.')
    else if (askingHow) reply = say('可以说：“我有点想听你今天的事，不过你现在不想讲也没关系。”说完就先停住，别紧接着补上一串问题。', 'You could say, “I’d like to hear about your day, but it’s okay if you don’t feel like talking right now.” Then pause without adding a string of questions.')
    else if (/一直|不知道|没什么|不回答|不说|always|don.t know|nothing/i.test(text) && sameTopic) reply = say('听到“不知道”或者“没什么”，可以先答一句“好”。你想听他说，不代表今天一定得问出点什么。', 'If the answer is “I don’t know” or “nothing,” it’s okay to say “alright” and leave it there. Wanting to hear from him doesn’t mean you have to get a story out of today.')
    else reply = say('想知道他过得好不好，又不想把见面变成盘问，这个分寸确实不好拿。他是一直不太聊学校，还是最近才这样？', 'You want to know how he’s doing without every afternoon feeling like an interview. Has he always been quiet about school, or is this recent?')
  } else if (topic === 'homework') {
    reply = askingHow ? say('可以先问：“哪一道最难开始？我陪你读一遍题。”把眼前卡住的地方找出来，先不谈整晚要完成多少。', 'Try, “Which question is hardest to start? I can read it with you.” Find the part that’s stuck before talking about everything that needs finishing tonight.')
      : tried ? say('那再催一遍，大概还是把刚才那段重演。先看看他卡在哪儿：是题目不会，还是一坐下就想做别的？', 'Another reminder may just repeat the same moment. Is he stuck on a question, or does he drift into something else as soon as he sits down?')
        : say('作业还没写多少，你已经跟着耗了很久，确实磨人。是坐下来很难，还是写着写着就停住了？', 'It can wear you out to spend so long on homework before much is done. Is getting started the difficult part, or does he get stuck once he begins?')
  } else if (topic === 'screens') {
    reply = askingHow || tried ? say('可以先把结束说具体：“这局结束就放下。下一次什么时候玩，我们提前说好。”他可能还是会不高兴，你可以听他抱怨，约定不用跟着一遍遍改。', 'Make the ending concrete: “We stop after this round. We’ll agree ahead of time when you can play again.” He may still be upset. You can hear him out without renegotiating the agreement each time.')
      : say('收手机的时候，很容易变成你催、他拖。你们通常会提前说好什么时候结束，还是玩着玩着才提醒？', 'Stopping screen time can become a cycle of reminders and delays. Do you usually agree on an ending beforehand, or bring it up while he’s playing?')
  } else if (topic === 'repair') {
    if (/原谅|不理我|不回应|forgive|ignores me/i.test(text) && /道歉|对不起|sorry|apolog/i.test(history.map(turn => turn.reply).join(' '))) reply = say('他没马上回应，也不用追着问原不原谅。把道歉说清楚，给他一点时间。', 'He doesn’t have to respond straight away. You can say you’re sorry clearly without asking him to forgive you on the spot.')
    else if (/惯着|得寸进尺|觉得.{0,6}(没错|对的)|lose authority|spoil/i.test(text)) reply = say('为刚才说话太冲道歉，不等于那件事就不用做了。可以分开说：“我不该那么大声。刚才那件事，我们好好说。”', 'Apologising for your tone doesn’t mean dropping the issue. You can separate them: “I shouldn’t have shouted. We still need to talk about what happened.”')
    else if (askingHow) reply = say('可以就说：“刚才我太大声了，对不起。我想把那件事重新说一遍。”说到这里就够了，不用急着把所有道理都补上。', 'You could say, “I was too loud earlier. I’m sorry. I’d like to start that conversation again.” That can be enough for now. You don’t have to add a whole explanation.')
    else if (/洗澡|喊|叫.{0,8}(遍|理)|bath|called/i.test(text)) reply = say('喊了几遍都没人应，火很容易就上来了。你当时是在他旁边说，还是隔着房间喊的？', 'Calling several times without an answer can really get to you. Were you beside him, or calling from another room?')
    else if (tried) reply = say('那先不照着刚才那句话说了。你试着开口的时候，他是怎么回应的？', 'Then let’s leave that wording aside. What happened when you tried to say it?')
    else reply = sameTopic ? say('你可以把当时的话原样说出来，不用先整理。我们就从最难受的那一句聊起。', 'You can tell it just as it happened. We can start with the part that’s hardest to shake off.')
      : say('那一下可能是气急了，吼完心里也不太舒服。刚才是发生了什么？', 'It may have come out in the heat of the moment and left you feeling unsettled. What happened just before that?')
  } else {
    reply = history.some(turn => /哪一件事|one moment/i.test(turn.reply))
      ? say('你可以把孩子说的、你回的那两句话讲给我听。不用先判断谁对谁错。', 'You can tell me what your child said and what you said back. No need to decide who was right first.')
      : say('最近是哪一件事，让你觉得不知道怎么和孩子开口？从那一件说起就好。', 'Is there one moment recently when you weren’t sure what to say to your child? We can start there.')
  }
  return { id: input.requestId, userText: text, reply, createdAt: new Date().toISOString(), sourceId: input.sourceId, sources }
}

export function sendDemoChat(snapshot: ParentChatSnapshot, input: ParentChatInput, signal: AbortSignal) {
  return new Promise<{ revision: number; turn: ParentChatTurn }>((resolve, reject) => {
    if (signal.aborted) { reject(new DOMException('Aborted', 'AbortError')); return }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort)
      resolve({ revision: snapshot.revision + 1, turn: createDemoTurn(snapshot, input) })
    }, 380)
    const abort = () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')) }
    signal.addEventListener('abort', abort, { once: true })
  })
}
