import { useState } from 'react'
import { supabase, rpc, q } from '../lib/supabase'
import { useUI } from '../contexts/UIContext'
import { useLoad } from '../hooks/useLoad'
import { useSaver } from '../hooks/useSaver'
import { Page, Table, Modal, Field, Loading, ErrorBox } from '../components/ui'
import { fmtDT, money, nowLocalInput, localInputToISO, uid } from '../lib/utils'
import { exportXlsx } from '../lib/export'

const KINDS = ['Salary', 'Advance', 'Daily wages', 'Part-time wages', 'Overtime', 'Incentive', 'Reimbursement', 'Other']
export default function StaffPayments() {
  const { confirm, toast } = useUI(); const [open, setOpen] = useState(false); const [emp, setEmp] = useState('')
  const { data, loading, error, reload } = useLoad(async () => {
    const [staff, rows] = await Promise.all([q(supabase.from('profiles').select('id,full_name').eq('active', true).order('full_name')), q(supabase.from('staff_payments').select('*').is('deleted_at', null).order('paid_at', { ascending: false }).limit(500))]); return { staff, rows } }, [])
  if (loading && !data) return <Loading />
  if (error) return <ErrorBox msg={error} retry={reload} />
  const rows = data.rows.filter((r) => !emp || r.employee_id === emp)
  const totals = {}; data.rows.forEach((r) => { totals[r.employee_name || 'Other'] = (totals[r.employee_name || 'Other'] || 0) + Number(r.amount) })
  const del = async (id) => { if (await confirm('Remove this payment? It stays in history but is not counted.')) { try { await rpc('void_record', { p_table: 'staff_payments', p_id: id }); reload() } catch (e) { toast(e.message, 'err') } } }
  const statement = () => exportXlsx({ meta: { title: 'Salary statement', business: '' }, columns: [{ key: 'd', label: 'Date' }, { key: 'n', label: 'Employee' }, { key: 'k', label: 'Type' }, { key: 'a', label: 'Amount' }], rows: rows.map((r) => ({ d: fmtDT(r.paid_at), n: r.employee_name, k: r.kind, a: Number(r.amount) })), totals: { a: rows.reduce((a, r) => a + Number(r.amount), 0) }, filename: 'salary-statement' })
  return (
    <Page title="Staff Payments" actions={<><select className="inp w-auto" value={emp} onChange={(e) => setEmp(e.target.value)}><option value="">All staff</option>{data.staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}</select><button className="btn-ghost" onClick={statement}>Download statement</button><button className="btn" onClick={() => setOpen(true)}>+ Pay staff</button></>}>
      <div className="flex flex-wrap gap-2 text-sm">{Object.entries(totals).map(([n, v]) => <span key={n} className="rounded-full bg-white px-3 py-1 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700">{n}: <b>{money(v)}</b></span>)}</div>
      <Table rows={rows} cols={[{ label: 'Date', render: (r) => fmtDT(r.paid_at) }, { label: 'Employee', key: 'employee_name' }, { label: 'Type', key: 'kind' }, { label: 'Paid by', key: 'method' }, { label: 'Amount', right: true, render: (r) => money(r.amount) }, { label: '', render: (r) => <button className="btn-danger" onClick={() => del(r.id)}>Remove</button> }]} />
      {open && <Form staff={data.staff} onClose={() => setOpen(false)} onDone={() => { setOpen(false); reload() }} />}
    </Page>
  )
}
function Form({ staff, onClose, onDone }) {
  const [key] = useState(uid()); const [f, setF] = useState({ employee_id: staff[0]?.id, kind: 'Salary', amount: '', method: 'Cash', paid_at: nowLocalInput(), notes: '' }); const { run, state } = useSaver(); const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const save = async (e) => { e.preventDefault(); const r = await run(() => rpc('add_staff_payment', { p: { ...f, amount: Number(f.amount), paid_at: localInputToISO(f.paid_at), client_key: key } }), 'Payment saved'); if (r) onDone() }
  return <Modal title="Pay staff" onClose={onClose}><form onSubmit={save} className="space-y-3">
    <Field label="Who?"><select className="inp" value={f.employee_id} onChange={set('employee_id')}>{staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}</select></Field>
    <Field label="Type"><select className="inp" value={f.kind} onChange={set('kind')}>{KINDS.map((k) => <option key={k}>{k}</option>)}</select></Field>
    <Field label="Amount (₹)"><input required type="number" min="1" className="inp text-lg" value={f.amount} onChange={set('amount')} /></Field>
    <div className="grid grid-cols-2 gap-3"><Field label="Paid by"><select className="inp" value={f.method} onChange={set('method')}>{['Cash', 'UPI', 'Bank Transfer', 'Other'].map((m) => <option key={m}>{m}</option>)}</select></Field><Field label="Date and time"><input type="datetime-local" className="inp" value={f.paid_at} onChange={set('paid_at')} /></Field></div>
    <button className="btn w-full" disabled={state === 'saving'}>Save payment</button></form></Modal>
}
