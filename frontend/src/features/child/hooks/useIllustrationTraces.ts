import { useEffect, useState } from 'react'
import { loadIllustrationTrace, type IllustrationTrace } from '../companion/illustrationTracing'

/** IDs select bundled centerlines; a previous request cannot update a different guide. */
export function useIllustrationTraces(ids: string[]) {
  const key = JSON.stringify([...new Set(ids)])
  const [traces, setTraces] = useState<Record<string, IllustrationTrace | null>>({})
  useEffect(() => {
    let active = true
    for (const id of JSON.parse(key) as string[]) {
      void loadIllustrationTrace(id).then(trace => {
        if (active) setTraces(previous => previous[id] === trace ? previous : { ...previous, [id]: trace })
      })
    }
    return () => { active = false }
  }, [key])
  return traces
}
