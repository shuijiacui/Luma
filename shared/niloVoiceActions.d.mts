export type VoiceAction = {type:'color';value:string}|{type:'scale';factor:number}|{type:'move';dx:number;dy:number}|{type:'place';x:number;y:number}|{type:'variant'}|{type:'delete'}|{type:'part';part:'tail'|'wing'|'sail';factor:number}
export type VoicePlan = {status:'edit';targetId:string;actions:VoiceAction[]}|{status:'redraw';targetId:string}|{status:'clarify';reason:'target'|'instruction';candidateIds:string[]}|{status:'noop'}|{status:'unhandled'}
export function validateVoiceActions(value:unknown): VoiceAction[] | null
export function validateAssistedActions(value:unknown): VoiceAction[] | null
export function validateVoicePlan(value:unknown,ids:string[]): VoicePlan | null
