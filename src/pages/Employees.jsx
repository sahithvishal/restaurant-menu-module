import { useState } from 'react'
import { supabase, rpc, q } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useUI } from '../contexts/UIContext'
import { useLoad } from '../hooks/useLoad'
import { useSaver } from '../hooks/useSaver'
import { Page, Table, Modal, Field, Loading, ErrorBox } from '../components/ui'
import { fmtDate } from '../lib/utils'

const DEPTS = ['Kitchen', 'Cashier', 'Inventory', 'Store', 'Delivery', 'Administration', 'Other']
export default function Employees() {
  const { isOwner } = useAuth(); const { confirm, toast } = useUI(); const [open, setOpen] = useState(false)
  const { data, loading, error, reload } = useLoad(async () => {
    const [p, r, d] = await Promise.all([q(supabase.from('profiles').select('*').order('full_name')), q(supabase.from('user_roles').select('*')), q(supabase.from('employee_details').select('*'))])
    return p.map((x) => ({ ...x, role: r.find((y) => y.user_id === x.id)?.role, ...(d.find((y) => y.user_id === x.id) || {}), id: x.id })) }, [])
  if (loading && !data) return <Loading />
  if (error) return <ErrorBox msg={error} retry={reload} />
  const toggle = async (u) => { if (await confirm(`${u.active ? 'Stop' : 'Allow'} ${u.full_name} from signing in?`)) { try { await rpc('set_user_active', { p_user: u.id, p_active: !u.active }); reload() } catch (e) { toast(e.message, 'err') } } }
  const reset = async (u) => { try { const { data: d, error: e } = await supabase.functions.invoke('admin-users', { body: { action: 'reset', user_id: u.id, redirectTo: window.location.origin } }); if (e || d?.error) throw new Error(d?.error || e.message); toast('Password reset email sent') } catch (e) { toast(e.message, 'err') } }
  return (
    <Page title="Employees" actions={<button className="btn" onClick={() => setOpen(true)}>+ Add employee</button>}>
      <Table rows={data} cols={[{ label: 'ID', key: 'employee_code' }, { label: 'Name', key: 'full_name' }, { label: 'Role', render: (u) => <span className="capitalize">{u.role}</span> }, { label: 'Department', key: 'department' }, { label: 'Mobile', key: 'mobile' }, { label: 'Joined', render: (u) => (u.joining_date ? fmtDate(u.joining_date) : '') }, { label: 'Status', render: (u) => <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${u.active ? 'bg-brand-100 text-brand-700' : 'bg-slate-200 text-slate-600'}`}>{u.active ? 'Active' : 'Stopped'}</span> }, { label: '', render: (u) => u.role !== 'owner' && <span className="flex gap-1"><button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => toggle(u)}>{u.active ? 'Deactivate' : 'Activate'}</button><button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => reset(u)}>Reset password</button></span> }]} />
      {open && <Add isOwner={isOwner} onClose={() => setOpen(false)} onDone={() => { setOpen(false); reload() }} />}
    </Page>
  )
}
function Add({ isOwner, onClose, onDone }) {
  const [f, setF] = useState({ full_name: '', email: '', mobile: '', designation: '', department: 'Kitchen', joining_date: '', role: 'employee' }); const { run, state } = useSaver(); const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const save = async (e) => { e.preventDefault(); const r = await run(async () => { const { data, error } = await supabase.functions.invoke('admin-users', { body: { action: 'create', ...f } }); if (error || data?.error) throw new Error(data?.error || error.message); return data }, 'Invitation email sent. They set their own password.'); if (r) onDone() }
  return <Modal title="Add employee" onClose={onClose}><form onSubmit={save} className="space-y-3">
    <Field label="Full name"><input required className="inp" value={f.full_name} onChange={set('full_name')} /></Field>
    <Field label="Login email" hint="They will get an email to set their own password."><input required type="email" className="inp" value={f.email} onChange={set('email')} /></Field>
    <div className="grid grid-cols-2 gap-3"><Field label="Mobile"><input className="inp" value={f.mobile} onChange={set('mobile')} /></Field><Field label="Job title"><input className="inp" value={f.designation} onChange={set('designation')} /></Field></div>
    <div className="grid grid-cols-2 gap-3"><Field label="Department"><select className="inp" value={f.department} onChange={set('department')}>{DEPTS.map((d) => <option key={d}>{d}</option>)}</select></Field><Field label="Joining date"><input type="date" className="inp" value={f.joining_date} onChange={set('joining_date')} /></Field></div>
    {isOwner && <Field label="Access level"><select className="inp" value={f.role} onChange={set('role')}><option value="employee">Employee (limited)</option><option value="manager">Manager (full operations)</option></select></Field>}
    <button className="btn w-full" disabled={state === 'saving'}>{state === 'saving' ? 'Sending...' : 'Add and send invitation'}</button></form></Modal>
}
