import { useState } from 'react'
import { supabase, rpc, q } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useUI } from '../contexts/UIContext'
import { useLoad } from '../hooks/useLoad'
import { useSaver } from '../hooks/useSaver'
import { Page, Table, Modal, Field, Loading, ErrorBox, PAY_METHODS } from '../components/ui'
import { fmtDT, money, nowLocalInput, localInputToISO } from '../lib/utils'

export default function Suppliers() {
  const { profile } = useAuth(); const { confirm, toast } = useUI(); const [modal, setModal] = useState(null)
  const { data, loading, error, reload } = useLoad(async () => {
    const [sup, pur, pay] = await Promise.all([
      q(supabase.from('suppliers').select('*').is('deleted_at', null).order('name')),
      q(supabase.from('purchases').select('id,supplier_id,total,paid,txn_at,invoice_no,due_date').is('deleted_at', null).order('txn_at', { ascending: false })),
      q(supabase.from('supplier_payments').select('*').order('paid_at', { ascending: false })),
    ]); return { sup, pur, pay }
  }, [])
  if (loading && !data) return <Loading />
  if (error) return <ErrorBox msg={error} retry={reload} />
  const stat = (id) => { const p = data.pur.filter((x) => x.supplier_id === id); return { total: p.reduce((a, x) => a + Number(x.total), 0), due: p.reduce((a, x) => a + Number(x.total) - Number(x.paid), 0), bills: p.filter((x) => Number(x.total) > Number(x.paid)).length } }
  const deactivate = async (s) => { if (await confirm(`Hide ${s.name}? Past purchases are kept.`)) { try { await q(supabase.from('suppliers').update({ active: !s.active }).eq('id', s.id)); reload() } catch (e) { toast(e.message, 'err') } } }
  return (
    <Page title="Suppliers" actions={<button className="btn" onClick={() => setModal({ t: 'edit' })}>+ Add supplier</button>}>
      <Table rows={data.sup} cols={[
        { label: 'Supplier', render: (s) => <span className={s.active ? '' : 'opacity-50'}>{s.name}</span> }, { label: 'Phone', key: 'mobile' },
        { label: 'Total bought', right: true, render: (s) => money(stat(s.id).total) },
        { label: 'You owe', right: true, render: (s) => { const d = stat(s.id).due; return d > 0 ? <b className="text-red-600">{money(d)}</b> : <span className="text-brand-700">Nothing</span> } },
        { label: '', render: (s) => <span className="flex gap-1"><button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => setModal({ t: 'view', s })}>History</button>{stat(s.id).due > 0 && <button className="btn !px-2 !py-1 text-xs" onClick={() => setModal({ t: 'pay', s, due: stat(s.id).due })}>Pay</button>}<button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => setModal({ t: 'edit', s })}>Edit</button><button className="btn-danger" onClick={() => deactivate(s)}>{s.active ? 'Hide' : 'Show'}</button></span> }]} />
      {modal?.t === 'edit' && <Edit s={modal.s} biz={profile.business_id} onClose={() => setModal(null)} onDone={() => { setModal(null); reload() }} />}
      {modal?.t === 'pay' && <Pay s={modal.s} due={modal.due} onClose={() => setModal(null)} onDone={() => { setModal(null); reload() }} />}
      {modal?.t === 'view' && <Modal wide title={modal.s.name} onClose={() => setModal(null)}><h3 className="mb-1 text-sm font-semibold">Bills</h3>
        <Table rows={data.pur.filter((p) => p.supplier_id === modal.s.id)} cols={[{ label: 'Date', render: (p) => fmtDT(p.txn_at) }, { label: 'Bill', key: 'invoice_no' }, { label: 'Total', right: true, render: (p) => money(p.total) }, { label: 'Unpaid', right: true, render: (p) => money(p.total - p.paid) }]} />
        <h3 className="mb-1 mt-3 text-sm font-semibold">Payments made</h3>
        <Table rows={data.pay.filter((p) => p.supplier_id === modal.s.id)} cols={[{ label: 'Date', render: (p) => fmtDT(p.paid_at) }, { label: 'Method', key: 'method' }, { label: 'Amount', right: true, render: (p) => money(p.amount) }]} /></Modal>}
    </Page>
  )
}
function Edit({ s, biz, onClose, onDone }) {
  const [f, setF] = useState({ name: '', contact_person: '', mobile: '', email: '', address: '', gst_no: '', category: '', notes: '', ...s }); const { run, state } = useSaver(); const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const save = async (e) => { e.preventDefault(); const { id, created_at, deleted_at, ...rest } = f
    const r = await run(() => q(s ? supabase.from('suppliers').update(rest).eq('id', s.id) : supabase.from('suppliers').insert({ ...rest, business_id: biz })), 'Supplier saved'); if (r !== undefined) onDone() }
  return <Modal title={s ? 'Edit supplier' : 'Add supplier'} onClose={onClose}><form onSubmit={save} className="space-y-3">
    <Field label="Supplier name"><input required className="inp" value={f.name} onChange={set('name')} /></Field>
    <div className="grid grid-cols-2 gap-3"><Field label="Contact person"><input className="inp" value={f.contact_person || ''} onChange={set('contact_person')} /></Field><Field label="Mobile"><input className="inp" value={f.mobile || ''} onChange={set('mobile')} /></Field></div>
    <div className="grid grid-cols-2 gap-3"><Field label="Email"><input className="inp" value={f.email || ''} onChange={set('email')} /></Field><Field label="GST number"><input className="inp" value={f.gst_no || ''} onChange={set('gst_no')} /></Field></div>
    <Field label="Address"><input className="inp" value={f.address || ''} onChange={set('address')} /></Field>
    <button className="btn w-full" disabled={state === 'saving'}>Save supplier</button></form></Modal>
}
function Pay({ s, due, onClose, onDone }) {
  const [f, setF] = useState({ amount: due, method: 'Cash', at: nowLocalInput(), ref: '' }); const { run, state } = useSaver(); const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const save = async (e) => { e.preventDefault(); const r = await run(() => rpc('pay_supplier', { p_supplier: s.id, p_amount: Number(f.amount), p_method: f.method, p_at: localInputToISO(f.at), p_ref: f.ref }), 'Payment saved'); if (r) onDone() }
  return <Modal title={`Pay ${s.name}`} onClose={onClose}><form onSubmit={save} className="space-y-3">
    <p className="text-sm">You owe <b>{money(due)}</b>. You can pay part or all.</p>
    <Field label="Amount paying now (₹)"><input required type="number" step="0.01" max={due} className="inp text-lg" value={f.amount} onChange={set('amount')} /></Field>
    <Field label="Paid by"><select className="inp" value={f.method} onChange={set('method')}>{PAY_METHODS.filter((m) => m !== 'Credit / Udhaar').map((m) => <option key={m}>{m}</option>)}</select></Field>
    <Field label="Date and time"><input type="datetime-local" className="inp" value={f.at} onChange={set('at')} /></Field>
    <button className="btn w-full" disabled={state === 'saving'}>Save payment</button></form></Modal>
}
