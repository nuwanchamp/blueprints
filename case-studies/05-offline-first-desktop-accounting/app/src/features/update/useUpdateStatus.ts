import { useEffect, useState } from 'react'
import type { UpdateStatus } from '@/native'

/** The desktop app's update status, kept live. Null in the browser version, which has no updates. */
export function useUpdateStatus() {
  const [status, setStatus] = useState<UpdateStatus | null>(null)
  useEffect(() => {
    const update = window.daybookNative?.update
    if (!update) return
    let live = true
    void update.getStatus().then((s) => live && setStatus(s), () => undefined)
    const stop = update.onStatus((s) => live && setStatus(s))
    return () => {
      live = false
      stop()
    }
  }, [])
  return status
}
