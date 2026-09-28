import { createHash } from 'node:crypto'

// Reserved acceptance cases. Do not use these prompts for implementation,
// retrieval, prompt tuning or cherry-picked retries. Once inspected/executed,
// record exposure and retain the original first run, including its failures.
export const holdoutSceneVersion = 'open-scenes-holdout-v1'
export const holdoutSceneCases = [
  { id: 'holdout_01', group: 'open_place', utterance: '画一个漂浮在茶杯里的小小群岛',
    checklist: ['茶杯是可辨认的容器，群岛确实在其内部', '岛屿形成同一个微型地方，而非茶杯旁的独立贴纸'] },
  { id: 'holdout_02', group: 'material_world', utterance: '画一个由积木搭成的森林',
    checklist: ['森林中的形态具有可见积木结构', '不能仅给普通树改名，且多棵树形成森林'] },
  { id: 'holdout_03', group: 'connection', utterance: '画一座小桥从一只大乌龟的背上连到河岸',
    checklist: ['乌龟与河岸可辨认', '桥的两端分别接到龟背和河岸，不能是邻近摆放'] },
  { id: 'holdout_04', group: 'containment', utterance: '画一个树洞里的音乐教室',
    checklist: ['教室位于可辨认树洞内部', '有可读的音乐学习活动或器物组织，不是单独乐器改名'] },
  { id: 'holdout_05', group: 'abstract_mood', utterance: '画一个刚睡醒、充满好奇的早晨',
    checklist: ['可见清晨或醒来的线索', '主体关系表达探索或好奇，而非只写情绪词'] },
  { id: 'holdout_06', group: 'negation', utterance: '画一个住在沙漠里的小镇，不要仙人掌，也不要汽车',
    checklist: ['沙漠与聚居小镇的关系可见', '没有仙人掌或汽车，仍保留小镇的生活空间'] },
  { id: 'holdout_07', group: 'preservation', utterance: '在我已经画好的小船左边画一个漂浮邮局，别动小船', childDrawing: 'boat',
    checklist: ['孩子原有小船逐像素保留且没有被新底图覆盖', '新邮局在小船左侧，且浮空与邮局含义可见'] },
  { id: 'holdout_08', group: 'modification', utterance: '把城堡变得更矮一点，月亮和小路都别动', previous: 'castle_path_moon', unchangedObjectIds: ['moon', 'path'],
    checklist: ['城堡高度确实变小而不是换成别的主体', '月亮和小路的身份、形状与位置完全保留'] },
].map(fixture => ({ ...fixture, locale: 'zh' }))
export const holdoutSceneHash = createHash('sha256').update(JSON.stringify(holdoutSceneCases)).digest('hex')
