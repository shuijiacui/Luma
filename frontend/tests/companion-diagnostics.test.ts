import { beforeEach, expect, test, vi } from 'vitest'
import { readTurnDiagnostics, recordTurnOutcome } from '@/features/child/companion/diagnostics'
beforeEach(() => sessionStorage.clear())
test('separates actual AI ink from local feedback and bounds stored metadata', () => {
  recordTurnOutcome('requested'); recordTurnOutcome('unclear_target'); recordTurnOutcome('local_committed')
  recordTurnOutcome('requested'); recordTurnOutcome('ai_committed'); recordTurnOutcome('nilo_undone')
  recordTurnOutcome('private child story')
  expect(readTurnDiagnostics()).toEqual({requested:2,unclear_target:1,local_committed:1,ai_committed:1,nilo_undone:1})
  expect(sessionStorage.getItem('luma:nilo-turn-diagnostics:v1')).not.toContain('private')
})
test('blocked storage never interrupts drawing', () => {
  const spy = vi.spyOn(Storage.prototype,'setItem').mockImplementation(() => { throw new Error('blocked') })
  expect(() => recordTurnOutcome('ai_committed')).not.toThrow()
  spy.mockRestore()
})
