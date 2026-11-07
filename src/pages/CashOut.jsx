import { useState } from 'react'
import { supabase, rpc, q } from '../lib/supabase'
import { useUI } from '../contexts/UIContext'
import { useLoad } from '../hooks/useLoad'
import { useSaver } from '../hooks/useSaver'
import { Page, Table, Modal, Field, Loading, ErrorBox, PAY_METHODS } from '../components/ui'
import { nowLocalInput, localInputToISO, fmtDT, money, uid } from '../lib/utils'

const UNITS = ['KG', 'GM', 'L', 'ML', 'PCS', 'PKT', 'BOX', 'BTL', 'DOZ', 'BAG', 'TRY', 'CTN', 'SET', 'BDL', 'CAN']

export default function CashOut() {
  const { confirm, toast } = useUI(); const [open, setOpen] = useState(false)
  const { data, loading, error, reload } = useLoad(async () => {
    const [purchases, suppliers, master] = await Promise.all([
      q(supabase.from('purchases').select('*,suppliers(name),purchase_items(item_name,qty,unit,rate,amount)').is('deleted_at', null).order('txn_at', { ascending: false }).limit(100)),
      q(supabase.from('suppliers').select('id,name').eq('active', true).order('name')),
      q(supabase.from('purchase_items_master').select('*').eq('active', true).order('name')),
    ])
    return { purchases, suppliers, master }
  }, [])
  if (loading && !data) return <Loading />
  if (error) return <ErrorBox msg={error} retry={reload} />
  const del = async (id) => { if (await confirm('Remove this purchase? It stays in history but is not counted.')) { try { await rpc('void_record', { p_table: 'purchases', p_id: id }); toast('Removed'); reload() } catch (e) { toast(e.message, 'err') } } }
  return (
    <Page title="Money Out (Purchases)" actions={<button className="btn" onClick={() => setOpen(true)}>+ Add purchase</button>}>
      <Table rows={data.purchases} cols={[
        { label: 'Date', render: (p) => fmtDT(p.txn_at) }, { label: 'Bought from', render: (p) => p.suppliers?.name || '-' },
        { label: 'Items', render: (p) => p.purchase_items.map((i) => `${i.item_name} ${i.qty}${i.unit}`).join(', ') },
        { label: 'Total', right: true, render: (p) => money(p.total) }, { label: 'Still to pay', right: true, render: (p) => (Number(p.total) - Number(p.paid) > 0 ? <span className="font-medium text-red-600">{money(p.total - p.paid)}</span> : 'Paid') },
        { label: '', render: (p) => <button className="btn-danger" onClick={() => del(p.id)}>Remove</button> }]} empty="No purchases yet." />
      {open && <PurchaseForm {...data} onClose={() => setOpen(false)} onDone={() => { setOpen(false); reload() }} />}
    </Page>
  )
}

function PurchaseForm({ suppliers, master, onClose, onDone }) {
  const [key] = useState(uid())
  const [f, setF] = useState({ supplier_id: '', txn_at: nowLocalInput(), invoice_no: '', payment_method: 'Cash', paid_now: '', due_date: '', notes: '' })
  const [items, setItems] = useState([{ item_name: '', qty: '', unit: 'KG', rate: '' }])
  const { run, state } = useSaver(); const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const upd = (i, k, v) => setItems(items.map((x, j) => (j === i ? { ...x, [k]: v } : x)))
  const total = items.reduce((a, x) => a + (Number(x.qty) || 0) * (Number(x.rate) || 0), 0)
  const credit = f.payment_method === 'Credit / Udhaar'
  const save = async (e) => {
    e.preventDefault()
    const r = await run(async () => {
      for (const it of items) if (it.item_name && !master.some((m) => m.name.toLowerCase() === it.item_name.toLowerCase())) { const b = (await supabase.from('profiles').select('business_id').single()).data.business_id; await supabase.from('purchase_items_master').insert({ business_id: b, name: it.item_name }) }
      return rpc('add_purchase', { p: { ...f, supplier_id: f.supplier_id || null, txn_at: localInputToISO(f.txn_at), paid_now: Number(f.paid_now || 0), client_key: key, items: items.filter((x) => x.item_name).map((x) => ({ ...x, qty: Number(x.qty), rate: Number(x.rate) })) } })
    }, 'Purchase saved')
    if (r) onDone()
  }
  return (
    <Modal title="Add a purchase" onClose={onClose} wide><form onSubmit={save} className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Bought from"><select className="inp" value={f.supplier_id} onChange={set('supplier_id')}><option value="">Choose supplier</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
        <Field label="Date and time"><input type="datetime-local" className="inp" value={f.txn_at} onChange={set('txn_at')} /></Field>
      </div>
      <datalist id="items">{master.map((m) => <option key={m.id} value={m.name} />)}</datalist>
      <div className="space-y-2">{items.map((it, i) => (
        <div key={i} className="grid grid-cols-12 gap-2">
          <input list="items" required placeholder="Item (type to search or add new)" className="inp col-span-12 md:col-span-5" value={it.item_name} onChange={(e) => upd(i, 'item_name', e.target.value)} />
          <input required type="number" step="any" min="0" placeholder="Qty" className="inp col-span-4 md:col-span-2" value={it.qty} onChange={(e) => upd(i, 'qty', e.target.value)} />
          <select className="inp col-span-4 md:col-span-2" value={it.unit} onChange={(e) => upd(i, 'unit', e.target.value)}>{UNITS.map((u) => <option key={u}>{u}</option>)}</select>
          <input required type="number" step="any" min="0" placeholder="Rate ₹" className="inp col-span-4 md:col-span-2" value={it.rate} onChange={(e) => upd(i, 'rate', e.target.value)} />
          {items.length > 1 && <button type="button" className="btn-danger col-span-12 md:col-span-1" onClick={() => setItems(items.filter((_, j) => j !== i))}>X</button>}
        </div>))}
        <button type="button" className="btn-ghost" onClick={() => setItems([...items, { item_name: '', qty: '', unit: 'KG', rate: '' }])}>+ Add another item</button></div>
      <div className="text-right text-lg font-semibold">Total: {money(total)}</div>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="How did you pay?"><select className="inp" value={f.payment_method} onChange={set('payment_method')}>{PAY_METHODS.map((m) => <option key={m}>{m}</option>)}</select></Field>
        <Field label="Bill number (optional)"><input className="inp" value={f.invoice_no} onChange={set('invoice_no')} /></Field>
        {credit && <><Field label="Paid now (₹, if any)" hint="The rest is added to what you owe the supplier."><input type="number" className="inp" value={f.paid_now} onChange={set('paid_now')} /></Field><Field label="Pay by date"><input type="date" className="inp" value={f.due_date} onChange={set('due_date')} /></Field></>}
      </div>
      <button className="btn w-full" disabled={state === 'saving' || total <= 0}>{state === 'saving' ? 'Saving...' : 'Save purchase'}</button></form></Modal>
  )
}
