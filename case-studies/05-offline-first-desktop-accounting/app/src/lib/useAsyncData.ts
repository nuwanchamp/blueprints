import { useCallback, useEffect, useState } from 'react'

/** Loads data once and exposes `reload` for after a write. `loader` must be a stable reference. */
export function useAsyncData<T>(loader: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      setData(await loader())
      setError(null)
    } catch (e) {
      setError(String(e))
    }
  }, [loader])

  useEffect(() => {
    void reload()
  }, [reload])

  return { data, error, reload }
}
