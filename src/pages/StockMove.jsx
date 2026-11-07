import { useState } from 'react'
import { supabase, rpc, q } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useLoad } from '../hooks/useLoad'
import { useSaver } from '../hooks/useSaver'
import { Page, Field, SearchSelect, Loading, ErrorBox } from '../components/ui'
import { niceQty, compatible, nowLocalInput, localInputToISO, uid } from '../lib/utils'

const OUT_REASONS = ['Kitchen usage', 'Food preparation', 'Wastage', 'Damaged goods', 'Expired stock', 'Internal usage', 'Other']
const IN_REASONS = ['Purchased', 'Returned', 'Transferred in', 'Other']

export default function StockMove({ kind }) {
  const { units, isMgr } = useAuth(); const isIn = kind === 'IN'
  const { data, loading, error, reload } = useLoad(() => q(supabase.from('inventory_items').select('*').eq('active', true).is('deleted_at', null).order('name')), [])
  const blank = () => ({ item: '', qty: '', unit: '', at: nowLocalInput(), reason: isIn ? 'Purchased' : 'Kitchen usage', notes: '', neg: false })
  const [f, setF] = useState(blank()); const [key, setKey] = useState(uid()); const [done, setDone] = useState(null)
  const { run, state } = useSaver()
  if (loading && !data) return <Loading />
  if (error) return <ErrorBox msg={error} retry={reload} />
  const item = data.find((i) => i.id === f.item); const opts = item ? compatible(units, item.dimension) : []
  const save = async (e) => {
    e.preventDefault()
    const r = await run(() => rpc('stock_move', { p_item: f.item, p_kind: kind, p_qty: Number(f.qty), p_unit: f.unit || item.display_unit, p_at: localInputToISO(f.at), p_reason: f.reason, p_notes: f.notes, p_key: key, p_allow_negative: f.neg }))
    if (r) { setDone(`${isIn ? 'Added' : 'Reduced'} ${r.entered_qty} ${r.entered_unit} of ${item.name}. Stock is now ${niceQty(r.new_base, item, units)}.`); setF(blank()); setKey(uid()); reload() }
  }
  return (
    <Page title={isIn ? 'Add Stock (Stock IN)' : 'Use Stock (Stock OUT)'}>
      {done && <div className="card border-brand-500 text-sm text-brand-700">{done}</div>}
      <form onSubmit={save} className="card max-w-lg space-y-3">
        <Field label="Which item?"><SearchSelect value={f.item} onChange={(v) => { const it = data.find((i) => i.id === v); setF({ ...f, item: v, unit: it.display_unit }) }} options={data.map((i) => ({ value: i.id, label: i.name }))} placeholder="Tap to search item" /></Field>
        {item && <p className="text-sm text-slate-500">Now in stock: <b>{niceQty(item.qty_base, item, units)}</b></p>}
        <div className="grid grid-cols-2 gap-3">
          <Field label="How much?"><input required type="number" step="any" min="0.0001" className="inp text-lg" value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} /></Field>
          <Field label="Unit"><select className="inp" value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })} disabled={!item}>{opts.map((u) => <option key={u}>{u}</option>)}</select></Field>
        </div>
        <Field label="Reason"><select className="inp" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })}>{(isIn ? IN_REASONS : OUT_REASONS).map((r) => <option key={r}>{r}</option>)}</select></Field>
        <Field label="Date and time"><input type="datetime-local" className="inp" value={f.at} onChange={(e) => setF({ ...f, at: e.target.value })} /></Field>
        <Field label="Note (optional)"><input className="inp" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
        {!isIn && isMgr && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.neg} onChange={(e) => setF({ ...f, neg: e.target.checked })} />Allow stock to go below zero</label>}
        <button className="btn w-full py-3 text-base" disabled={!item || state === 'saving'}>{state === 'saving' ? 'Saving...' : isIn ? 'Add to stock' : 'Take out of stock'}</button>
      </form>
    </Page>
  )
}
