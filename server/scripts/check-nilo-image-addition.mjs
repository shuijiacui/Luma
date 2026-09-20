// Offline image-edit candidate verification only: no API, credentials or uploads.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { extractImageAddition, imageAdditionPolicy } from '../src/services/niloImageAddition.js'

export function checkImageAdditionFiles({ original, candidate, region, out }) {
  const spec = JSON.parse(readFileSync(region, 'utf8'))
  const result = extractImageAddition({ originalPng: readFileSync(original), candidatePng: readFileSync(candidate),
    roi: spec.roi, contact: spec.contact })
  // New result directory avoids overwriting or retaining a previous successful layer.
  const destination = resolve(out)
  if (existsSync(destination)) throw new Error('output_directory_already_exists')
  mkdirSync(destination, { recursive: true })
  const { layerPng, compositePng, ...report } = result
  writeFileSync(resolve(destination, 'report.json'), JSON.stringify({ version: 1, mode: 'offline-image-addition',
    ...report, policy: imageAdditionPolicy,
    reviewRequired: 'Pixel protection only. Independently inspect meaning, style, scale and placement; child acceptance is still required.',
  }, null, 2))
  if (result.ok) {
    writeFileSync(resolve(destination, 'addition.png'), layerPng)
    writeFileSync(resolve(destination, 'composite.png'), compositePng)
  }
  return { ok: result.ok, reason: result.reason, metrics: result.metrics, output: destination }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = Object.fromEntries(process.argv.slice(2).map(arg => {
    const at = arg.indexOf('='); return [arg.slice(0, at), arg.slice(at + 1)]
  }))
  if (process.argv.includes('--help')) {
    console.log('Offline only. node server/scripts/check-nilo-image-addition.mjs --original=before.png --candidate=edited.png --region=region.json --out=server/.tmp/new-result-folder')
    console.log('region.json: {"roi":{"x":0.25,"y":0.1,"width":0.3,"height":0.25},"contact":{"points":[{"x":0.35,"y":0.35},{"x":0.5,"y":0.35}],"radius":0.01}}. Contact is optional; normalized original-image coordinates. No API calls or real-child image collection.')
  } else if (Object.keys(args).some(key => !['--original', '--candidate', '--region', '--out'].includes(key))
    || ['--original', '--candidate', '--region', '--out'].some(key => !args[key])) {
    console.error('Specify --original, --candidate, --region and a new --out directory; see --help.'); process.exitCode = 2
  } else {
    try {
      const result = checkImageAdditionFiles({ original: args['--original'], candidate: args['--candidate'], region: args['--region'], out: args['--out'] })
      console.log(JSON.stringify(result, null, 2)); if (!result.ok) process.exitCode = 1
    } catch (error) {
      // No request headers, environment or image bytes are logged.
      console.error(error.message); process.exitCode = 2
    }
  }
}
