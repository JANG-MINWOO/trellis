import { useCallback, useEffect, useState, type DependencyList } from 'react'

/**
 * Loads data from main whenever `deps` change, dropping replies that arrive for older deps (the
 * user may have switched project meanwhile). `load` is null while there is nothing to load.
 * Returns the latest value (kept while the next one loads) and a function to load again.
 */
export function useApi<T>(
  load: (() => Promise<T>) | null,
  deps: DependencyList,
): [T | null, () => void] {
  const [value, setValue] = useState<T | null>(null)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!load) return
    let cancelled = false
    void load().then((next) => {
      if (!cancelled) setValue(next)
    })
    return () => {
      cancelled = true
    }
    // The caller lists what `load` depends on; `load` itself is a new function every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])
  const reload = useCallback(() => setTick((n) => n + 1), [])
  return [value, reload]
}
