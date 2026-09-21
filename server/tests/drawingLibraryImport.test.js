import { test, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

test.each(['0', '13', 'NaN', '4.5'])('rejects candidate count %s before downloading reference data', count => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/build-drawing-library.mjs', import.meta.url)), `--candidates=${count}`], {
    encoding: 'utf8', timeout: 10000, windowsHide: true,
  })
  expect(result.status).not.toBe(0)
  expect(result.stderr).toContain('Candidate count must be an integer from 3 to 12')
})
