import { X, Search } from 'lucide-react'
import { useState } from 'react'

export const Page = ({ title, actions, children }) => (
  <div className="mx-auto max-w-7xl space-y-5 p-4 md:p-8">
    <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-bold tracking-tight">{title}</h1><div className="flex flex-wrap items-center gap-2">{actions}</div></div>
    {children}
  </div>
)
export const Modal = ({ title, onClose, children, wide }) => (
  <div className="fixed inset-0 z-50 grid place-items-start overflow-y-auto bg-slate-900/50 p-4 backdrop-blur-sm md:place-items-center">
    <div className={`card w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} my-8`}>
      <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-semibold">{title}</h2><button onClick={onClose} aria-label="Close" className="rounded-md p-1 hover:bg-slate-100 dark:hover:bg-white/10"><X size={18} /></button></div>
      {children}
    </div>
  </div>
)
export const Field = ({ label, children, hint }) => (
  <label className="block text-sm"><span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">{label}</span>{children}{hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}</label>
)
export const Stat = ({ label, value, tone }) => (
  <div className="card relative overflow-hidden"><span className={`absolute inset-y-0 left-0 w-1 ${tone === 'bad' ? 'bg-red-500' : 'bg-brand-500'}`} /><div className="pl-2"><div className="text-xs font-medium text-slate-500">{label}</div><div className={`mt-1 text-2xl font-bold tracking-tight ${tone === 'bad' ? 'text-red-600' : ''}`}>{value}</div></div></div>
)
export function Table({ cols, rows, empty = 'Nothing here yet.', foot }) {
  return (
    <div className="card overflow-x-auto p-0">
      <table className="w-full min-w-[640px]">
        <thead className="border-b border-slate-200 dark:border-slate-800"><tr>{cols.map((c) => <th key={c.key || c.label} className={`th ${c.right ? 'text-right' : ''}`}>{c.label}</th>)}</tr></thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {rows.length === 0 && <tr><td className="px-4 py-10 text-center text-sm text-slate-500" colSpan={cols.length}>{empty}</td></tr>}
          {rows.map((r, i) => <tr key={r.id || i} className="transition hover:bg-slate-50/70 dark:hover:bg-white/5">{cols.map((c) => <td key={c.key || c.label} className={`td ${c.right ? 'text-right tabular-nums' : ''}`}>{c.render ? c.render(r) : r[c.key]}</td>)}</tr>)}
        </tbody>
        {foot && <tfoot className="border-t border-slate-200 font-semibold dark:border-slate-800"><tr>{foot.map((f, i) => <td key={i} className={`td ${cols[i]?.right ? 'text-right' : ''}`}>{f}</td>)}</tr></tfoot>}
      </table>
    </div>
  )
}
export const Loading = () => <div className="grid place-items-center p-16"><div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-100 border-t-brand-600" /></div>
export const ErrorBox = ({ msg, retry }) => <div className="card border-red-200 text-sm text-red-700">{msg} {retry && <button className="underline" onClick={retry}>Retry</button>}</div>

// Searchable dropdown
export function SearchSelect({ options, value, onChange, placeholder = 'Search...' }) {
  const [open, setOpen] = useState(false); const [s, setS] = useState('')
  const sel = options.find((o) => o.value === value)
  const list = options.filter((o) => o.label.toLowerCase().includes(s.toLowerCase())).slice(0, 50)
  return (
    <div className="relative">
      <button type="button" className="inp flex items-center justify-between text-left" onClick={() => setOpen(!open)}><span className={sel ? '' : 'text-slate-400'}>{sel?.label || placeholder}</span><Search size={14} /></button>
      {open && (
        <div className="absolute z-20 mt-1 w-full rounded-md border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-900">
          <input autoFocus className="inp mb-2" placeholder="Type to search" value={s} onChange={(e) => setS(e.target.value)} />
          <div className="max-h-48 overflow-y-auto">
            {list.map((o) => <button type="button" key={o.value} className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => { onChange(o.value); setOpen(false); setS('') }}>{o.label}</button>)}
            {list.length === 0 && <div className="px-2 py-1.5 text-sm text-slate-500">No match</div>}
          </div>
        </div>)}
    </div>
  )
}
export const PAY_METHODS = ['Cash', 'UPI', 'Credit Card', 'Debit Card', 'Bank Transfer', 'Credit / Udhaar', 'Other']
