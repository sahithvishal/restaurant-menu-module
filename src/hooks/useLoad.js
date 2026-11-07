import { useEffect, useState, useCallback, useRef } from 'react'
export function useLoad(fn, deps = []) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const ref = useRef(fn); ref.current = fn
  const reload = useCallback(async () => {
    setLoading(true); setError(null)
    try { setData(await ref.current()) } catch (e) { setError(e.message) } finally { setLoading(false) }
  }, [])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { reload() }, deps)
  return { data, loading, error, reload }
}
