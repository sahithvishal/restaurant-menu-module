import { useState, useRef } from 'react'
import { supabase, rpc, q } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useUI, SaveBadge } from '../contexts/UIContext'
import { useLoad } from '../hooks/useLoad'
import { useSaver } from '../hooks/useSaver'
import { Page, Table, Modal, Field, Loading, ErrorBox } from '../components/ui'
import { niceQty, compatible, fromBase, toBase, nowLocalInput, localInputToISO, uid, money, fmtDate } from '../lib/utils'
import { Link } from 'react-router-dom'

export default function Inventory() {
  const { isMgr, units, profile, can } = useAuth(); const [search, setSearch] = useState(''); const [modal, setModal] = useState(null)
  const { data, loading, error, reload } = useLoad(async () => {
    const [items, cats] = await Promise.all([
      q(supabase.from('inventory_items').select('*').is('deleted_at', null).order('name')),
      q(supabase.from('inventory_categories').select('name').order('name')).catch(() => []),
    ])
    return { items, cats }
  }, [])
  if (loading && !data) return <Loading />
  if (error) return <ErrorBox msg={error} retry={reload} />
  const list = data.items.filter((i) => i.name.toLowerCase().includes(search.toLowerCase()))
  const status = (i) => (Number(i.qty_base) <= 0 ? ['Finished', 'text-red-600'] : Number(i.qty_base) <= Number(i.min_base) ? ['Running low', 'text-amber-600'] : ['OK', 'text-brand-700'])
  return (
    <Page title="Inventory" actions={<>
      <input className="inp w-48" placeholder="Search item" value={search} onChange={(e) => setSearch(e.target.value)} />
      {can('stock.in') && <Link to="/stock-in" className="btn-ghost">Add stock</Link>}{can('stock.out') && <Link to="/stock-out" className="btn-ghost">Use stock</Link>}
      {isMgr && <button className="btn" onClick={() => setModal({ type: 'new' })}>+ New item</button>}</>}>
      <Table rows={list} cols={[
        { label: 'Item', key: 'name' }, { label: 'Category', key: 'category' },
        { label: 'In stock', right: true, render: (i) => <b>{niceQty(i.qty_base, i, units)}</b> },
        { label: 'Status', render: (i) => <span className={`font-medium ${status(i)[1]}`}>{status(i)[0]}</span> },
        { label: 'Expiry', render: (i) => (i.expiry_date ? fmtDate(i.expiry_date) : '') },
        ...(isMgr ? [{ label: '', render: (i) => <span className="flex gap-1"><button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => setModal({ type: 'edit', item: i })}>Edit</button><button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => setModal({ type: 'fix', item: i })}>Fix count</button></span> }] : [])]} empty="No items yet." />
      {modal?.type === 'new' && <NewItem cats={data.cats} onClose={() => setModal(null)} onDone={() => { setModal(null); reload() }} />}
      {modal?.type === 'edit' && <EditItem item={modal.item} cats={data.cats} onClose={() => { setModal(null); reload() }} />}
      {modal?.type === 'fix' && <Fix item={modal.item} onClose={() => setModal(null)} onDone={() => { setModal(null); reload() }} />}
    </Page>
  )
}

function NewItem({ cats, onClose, onDone }) {
  const { units, profile } = useAuth(); const { run, state } = useSaver()
  const [f, setF] = useState({ name: '', category: 'Other', display_unit: 'KG', min: '' }); const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const save = async (e) => { e.preventDefault(); const u = units[f.display_unit]
    const r = await run(() => q(supabase.from('inventory_items').insert({ business_id: profile.business_id, outlet_id: profile.outlet_id, name: f.name.trim(), category: f.category, dimension: u.dimension, base_unit: u.base_code, display_unit: f.display_unit, min_base: toBase(f.min || 0, f.display_unit, units) })), 'Item added'); if (r !== undefined) onDone() }
  return <Modal title="New item" onClose={onClose}><form onSubmit={save} className="space-y-3">
    <Field label="Item name"><input required autoFocus className="inp" value={f.name} onChange={set('name')} /></Field>
    <Field label="Category"><select className="inp" value={f.category} onChange={set('category')}>{data0(cats).map((c) => <option key={c}>{c}</option>)}</select></Field>
    <Field label="Counted in" hint="Weight: KG/GM. Liquid: L/ML. Otherwise pieces, packets, boxes etc."><select className="inp" value={f.display_unit} onChange={set('display_unit')}>{Object.keys(units).map((u) => <option key={u}>{u}</option>)}</select></Field>
    <Field label="Tell me when stock goes below" hint={`In ${f.display_unit}`}><input type="number" step="any" className="inp" value={f.min} onChange={set('min')} /></Field>
    <p className="text-xs text-slate-500">Starting quantity: add it afterwards using “Add stock”, so it is recorded in history.</p>
    <button className="btn w-full" disabled={state === 'saving'}>Save item</button></form></Modal>
}
const data0 = (cats) => (cats?.length ? cats.map((c) => c.name) : ['Other'])

// Edit details with debounced auto-save
function EditItem({ item, cats, onClose }) {
  const { units } = useAuth(); const { run, state, retry } = useSaver(); const timer = useRef()
  const [f, setF] = useState({ name: item.name, category: item.category || 'Other', min: fromBase(item.min_base, item.display_unit, units), expiry_date: item.expiry_date || '', location: item.location || '', purchase_price: item.purchase_price || 0 })
  const change = (k, v) => { const n = { ...f, [k]: v }; setF(n); clearTimeout(timer.current); timer.current = setTimeout(() => persist(n), 800) }
  const persist = (n) => run(() => q(supabase.from('inventory_items').update({ name: n.name, category: n.category, min_base: toBase(n.min || 0, item.display_unit, units), expiry_date: n.expiry_date || null, location: n.location, purchase_price: n.purchase_price || 0 }).eq('id', item.id)))
  return <Modal title={`Edit ${item.name}`} onClose={onClose}><div className="space-y-3">
    <div className="h-4"><SaveBadge state={state} retry={() => persist(f)} /></div>
    <Field label="Item name"><input className="inp" value={f.name} onChange={(e) => change('name', e.target.value)} /></Field>
    <Field label="Category"><select className="inp" value={f.category} onChange={(e) => change('category', e.target.value)}>{data0(cats).map((c) => <option key={c}>{c}</option>)}</select></Field>
    <Field label={`Tell me when stock goes below (${item.display_unit})`}><input type="number" step="any" className="inp" value={f.min} onChange={(e) => change('min', e.target.value)} /></Field>
    <Field label="Expiry date"><input type="date" className="inp" value={f.expiry_date} onChange={(e) => change('expiry_date', e.target.value)} /></Field>
    <Field label="Where is it kept?"><input className="inp" value={f.location} onChange={(e) => change('location', e.target.value)} /></Field>
    <Field label="Price per unit (₹)"><input type="number" className="inp" value={f.purchase_price} onChange={(e) => change('purchase_price', e.target.value)} /></Field>
    <p className="text-xs text-slate-500">Changes save automatically.</p></div></Modal>
}

function Fix({ item, onClose, onDone }) {
  const { units } = useAuth(); const { run, state } = useSaver()
  const [qty, setQty] = useState(fromBase(item.qty_base, item.display_unit, units)); const [reason, setReason] = useState(''); const [key] = useState(uid())
  const save = async (e) => { e.preventDefault(); const r = await run(() => rpc('stock_move', { p_item: item.id, p_kind: 'ADJUST', p_qty: Number(qty), p_unit: item.display_unit, p_at: new Date().toISOString(), p_reason: reason || 'Stock count correction', p_key: key }), 'Stock corrected'); if (r) onDone() }
  return <Modal title={`Fix count: ${item.name}`} onClose={onClose}><form onSubmit={save} className="space-y-3">
    <Field label={`Actual quantity you counted (${item.display_unit})`}><input required type="number" step="any" min="0" className="inp text-lg" value={qty} onChange={(e) => setQty(e.target.value)} /></Field>
    <Field label="Why?"><input className="inp" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. monthly stock check" /></Field>
    <button className="btn w-full" disabled={state === 'saving'}>Save correct count</button></form></Modal>
}
