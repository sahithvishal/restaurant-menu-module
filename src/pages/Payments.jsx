import { useState } from 'react'
import { supabase, rpc, q } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useUI } from '../contexts/UIContext'
import { useLoad } from '../hooks/useLoad'
import { useSaver } from '../hooks/useSaver'
import { Page, Table, Modal, Field, Loading, ErrorBox } from '../components/ui'
import { fmtDT, money, nowLocalInput, localInputToISO, uid } from '../lib/utils'

export default function Payments() {
  const { profile } = useAuth(); const { confirm, toast } = useUI(); const [open, setOpen] = useState(false); const [catOpen, setCatOpen] = useState(false)
  const { data, loading, error, reload } = useLoad(async () => {
    const [cats, rows] = await Promise.all([q(supabase.from('restaurant_expense_categories').select('*').eq('active', true).order('grp').order('name')), q(supabase.from('restaurant_payments').select('*,restaurant_expense_categories(name,grp)').is('deleted_at', null).order('paid_at', { ascending: false }).limit(200))])
    return { cats, rows } }, [])
  if (loading && !data) return <Loading />
  if (error) return <ErrorBox msg={error} retry={reload} />
  const del = async (id) => { if (await confirm('Remove this payment? It stays in history but is not counted.')) { try { await rpc('void_record', { p_table: 'restaurant_payments', p_id: id }); reload() } catch (e) { toast(e.message, 'err') } } }
  return (
    <Page title="Restaurant Payments" actions={<><button className="btn-ghost" onClick={() => setCatOpen(true)}>Manage types</button><button className="btn" onClick={() => setOpen(true)}>+ Add payment</button></>}>
      <Table rows={data.rows} cols={[{ label: 'Date', render: (r) => fmtDT(r.paid_at) }, { label: 'Type', render: (r) => r.restaurant_expense_categories?.name }, { label: 'Paid to', render: (r) => r.paid_to || r.description }, { label: 'Amount', right: true, render: (r) => money(r.amount) }, { label: 'Paid so far', right: true, render: (r) => money(r.paid_amount) }, { label: 'Status', render: (r) => <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${r.status === 'Paid' ? 'bg-brand-100 text-brand-700' : r.status === 'Overdue' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>{r.status}</span> }, { label: '', render: (r) => <button className="btn-danger" onClick={() => del(r.id)}>Remove</button> }]} empty="No payments yet." />
      {open && <Form cats={data.cats} onClose={() => setOpen(false)} onDone={() => { setOpen(false); reload() }} />}
      {catOpen && <Cats cats={data.cats} biz={profile.business_id} onClose={() => { setCatOpen(false); reload() }} />}
    </Page>
  )
}
function Form({ cats, onClose, onDone }) {
  const [key] = useState(uid()); const [f, setF] = useState({ category_id: cats[0]?.id, paid_at: nowLocalInput(), paid_to: '', description: '', amount: '', method: 'Cash', status: 'Paid', paid_amount: '', due_date: '', reference_no: '' }); const { run, state } = useSaver(); const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const save = async (e) => { e.preventDefault(); const r = await run(() => rpc('add_restaurant_payment', { p: { ...f, paid_at: localInputToISO(f.paid_at), amount: Number(f.amount), paid_amount: Number(f.paid_amount || 0), client_key: key } }), 'Payment saved'); if (r) onDone() }
  const groups = [...new Set(cats.map((c) => c.grp))]
  return <Modal title="Add payment" onClose={onClose}><form onSubmit={save} className="space-y-3">
    <Field label="What is it for?"><select className="inp" value={f.category_id} onChange={set('category_id')}>{groups.map((g) => <optgroup key={g} label={g}>{cats.filter((c) => c.grp === g).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>)}</select></Field>
    <Field label="Paid to"><input className="inp" value={f.paid_to} onChange={set('paid_to')} /></Field>
    <Field label="Amount (₹)"><input required type="number" min="1" className="inp text-lg" value={f.amount} onChange={set('amount')} /></Field>
    <div className="grid grid-cols-2 gap-3"><Field label="Status"><select className="inp" value={f.status} onChange={set('status')}>{['Paid', 'Partially Paid', 'Pending', 'Overdue'].map((s) => <option key={s}>{s}</option>)}</select></Field><Field label="Paid by"><select className="inp" value={f.method} onChange={set('method')}>{['Cash', 'UPI', 'Credit Card', 'Debit Card', 'Bank Transfer', 'Other'].map((m) => <option key={m}>{m}</option>)}</select></Field></div>
    {f.status === 'Partially Paid' && <Field label="Paid so far (₹)"><input type="number" className="inp" value={f.paid_amount} onChange={set('paid_amount')} /></Field>}
    {f.status !== 'Paid' && <Field label="Due date"><input type="date" className="inp" value={f.due_date} onChange={set('due_date')} /></Field>}
    <Field label="Date and time"><input type="datetime-local" className="inp" value={f.paid_at} onChange={set('paid_at')} /></Field>
    <button className="btn w-full" disabled={state === 'saving'}>Save payment</button></form></Modal>
}
function Cats({ cats, biz, onClose }) {
  const { toast } = useUI(); const [n, setN] = useState(''); const [g, setG] = useState('Other'); const [list, setList] = useState(cats)
  const add = async () => { try { const d = await q(supabase.from('restaurant_expense_categories').insert({ business_id: biz, grp: g, name: n }).select()); setList([...list, ...d]); setN('') } catch (e) { toast(e.message, 'err') } }
  const hide = async (c) => { try { await q(supabase.from('restaurant_expense_categories').update({ active: false }).eq('id', c.id)); setList(list.filter((x) => x.id !== c.id)) } catch (e) { toast(e.message, 'err') } }
  return <Modal title="Payment types" onClose={onClose}><div className="flex gap-2"><input className="inp" placeholder="New type" value={n} onChange={(e) => setN(e.target.value)} /><select className="inp w-40" value={g} onChange={(e) => setG(e.target.value)}>{['Staff', 'Lease & property', 'Parking & transport', 'Utilities', 'Operations', 'Other'].map((x) => <option key={x}>{x}</option>)}</select><button className="btn" disabled={!n} onClick={add}>Add</button></div>
    <div className="mt-3 max-h-72 space-y-1 overflow-y-auto">{list.map((c) => <div key={c.id} className="flex items-center justify-between rounded px-2 py-1 text-sm hover:bg-slate-50 dark:hover:bg-slate-800"><span>{c.name} <span className="text-xs text-slate-400">{c.grp}</span></span><button className="btn-danger" onClick={() => hide(c)}>Hide</button></div>)}</div></Modal>
}
