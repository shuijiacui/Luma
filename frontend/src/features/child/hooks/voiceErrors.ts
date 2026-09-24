import { ApiError } from '@/lib/api/client'

export function voiceTranscriptionError(error:unknown,stage:'audio'|'asr') {
  if(stage==='audio')return '录音没能读取，请再录一次。'
  if(error instanceof ApiError){
    if(error.status===422&&error.message==='voice_no_speech')return '没有听到完整的话，点麦克风再说一次吧。'
    if(error.status===401||error.status===403)return '请大人帮忙重新登录，再来和我说话吧。'
    if(error.status===429)return '语音服务有点忙，等一小会儿再说吧。'
    if(error.status===504)return '语音识别等得有点久，请再试一次。'
    if(error.status>=500)return '语音服务暂时没连上，请稍后再试。'
    return '这次录音没能送去识别，请再试一次。'
  }
  return '语音识别连接中断，请检查网络后再试。'
}
