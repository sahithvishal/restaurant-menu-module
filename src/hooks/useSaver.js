import { useState, useCallback, useRef } from 'react'
import { useUI } from '../contexts/UIContext'
// Runs an async save; success is only reported after Supabase confirms.
export function useSaver() {
  const [state, setState] = useState('idle')
  const { toast } = useUI(); const last = useRef(null)
  const run = useCallback(async (fn, okMsg) => {
    last.current = fn; setState('saving')
    try { const r = await fn(); setState('saved'); if (okMsg) toast(okMsg); return r }
    catch (e) { setState('error'); toast(e.message || 'Save failed', 'err'); return undefined }
  }, [toast])
  return { state, run, retry: () => last.current && run(last.current) }
}
