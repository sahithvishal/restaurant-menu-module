import { useState } from 'react'
import { supabase, rpc, q } from '../lib/supabase'
import { useLoad } from '../hooks/useLoad'
import { useSaver } from '../hooks/useSaver'
import { SaveBadge } from '../contexts/UIContext'
import { Page, Loading, ErrorBox } from '../components/ui'
import { ASSIGNABLE } from '../lib/perms'

export default function Permissions() {
  const { data, loading, error, reload } = useLoad(async () => {
    const [p, r, perms] = await Promise.all([q(supabase.from('profiles').select('id,full_name,active')), q(supabase.from('user_roles').select('*')), q(supabase.from('employee_permissions').select('*'))])
    return p.filter((x) => r.find((y) => y.user_id === x.id)?.role === 'employee').map((x) => ({ ...x, perms: perms.filter((y) => y.user_id === x.id).map((y) => y.permission) })) }, [])
  if (loading && !data) return <Loading />
  if (error) return <ErrorBox msg={error} retry={reload} />
  return <Page title="User Permissions"><p className="text-sm text-slate-500">Choose what each employee can do. Money, sales and salary pages are only for the Owner and Managers.</p>
    {data.length === 0 && <div className="card text-sm">No employees yet. Add one from Employee Management.</div>}
    <div className="grid gap-4 md:grid-cols-2">{data.map((u) => <Card key={u.id} u={u} />)}</div></Page>
}
function Card({ u }) {
  const [perms, setPerms] = useState(u.perms); const { run, state, retry } = useSaver()
  const toggle = (p) => { const n = perms.includes(p) ? perms.filter((x) => x !== p) : [...perms, p]; setPerms(n); run(() => rpc('set_employee_permissions', { p_user: u.id, p_perms: n })) }
  return <div className="card"><div className="mb-3 flex items-center justify-between"><b>{u.full_name}</b><SaveBadge state={state} retry={retry} /></div>
    <div className="space-y-2">{ASSIGNABLE.map(([k, l]) => <label key={k} className="flex items-center gap-3 text-sm"><input type="checkbox" className="h-4 w-4 accent-[#188257]" checked={perms.includes(k)} onChange={() => toggle(k)} />{l}</label>)}</div></div>
}
