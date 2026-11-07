import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react'

const Ctx = createContext(null)
export const useUI = () => useContext(Ctx)

export function UIProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const [dark, setDark] = useState(() => localStorage.getItem('theme') === 'dark')
  const [confirmState, setConfirm] = useState(null)
  useEffect(() => { document.documentElement.classList.toggle('dark', dark); localStorage.setItem('theme', dark ? 'dark' : 'light') }, [dark])
  const toast = useCallback((msg, type = 'ok') => {
    const id = Math.random(); setToasts((t) => [...t, { id, msg, type }]); setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500)
  }, [])
  const confirm = useCallback((message) => new Promise((res) => setConfirm({ message, res })), [])
  return (
    <Ctx.Provider value={{ toast, dark, setDark, confirm }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[60] space-y-2">
        {toasts.map((t) => (
          <div key={t.id} className={`flex max-w-sm items-start gap-2 rounded-md px-4 py-3 text-sm shadow-lg ${t.type === 'err' ? 'bg-red-600 text-white' : 'bg-slate-900 text-white'}`}>
            {t.type === 'err' ? <AlertTriangle size={16} className="mt-0.5 shrink-0" /> : <CheckCircle2 size={16} className="mt-0.5 shrink-0" />}<span>{t.msg}</span>
          </div>))}
      </div>
      {confirmState && (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-black/50 p-4">
          <div className="card w-full max-w-sm">
            <p className="mb-4 text-sm">{confirmState.message}</p>
            <div className="flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => { confirmState.res(false); setConfirm(null) }}>Cancel</button>
              <button className="btn" onClick={() => { confirmState.res(true); setConfirm(null) }}>Confirm</button>
            </div>
          </div>
        </div>)}
    </Ctx.Provider>
  )
}

export function SaveBadge({ state, retry }) {
  if (state === 'saving') return <span className="inline-flex items-center gap-1 text-xs text-slate-500"><Loader2 size={12} className="animate-spin" />Saving...</span>
  if (state === 'saved') return <span className="text-xs text-brand-600">Saved successfully</span>
  if (state === 'error') return <button onClick={retry} className="text-xs font-medium text-red-600 underline">Save failed – Retry</button>
  return null
}
