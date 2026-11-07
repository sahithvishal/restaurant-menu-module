import { useState } from 'react'
import { supabase, q } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useLoad } from '../hooks/useLoad'
import { Page, Table, Loading, ErrorBox } from '../components/ui'
import { todayISO, addDays, istDayStart, istDayEnd, fmtDT, num } from '../lib/utils'

export default function Activity() {
  const { isMgr } = useAuth()
  const [range, setRange] = useState('today'); const [custom, setCustom] = useState(todayISO()); const [emp, setEmp] = useState(''); const [item, setItem] = useState(''); const [kind, setKind] = useState('')
  const t = todayISO()
  const r = range === 'today' ? [t, t] : range === 'yesterday' ? [addDays(t, -1), addDays(t, -1)] : range === '7' ? [addDays(t, -6), t] : [custom, custom]
  const { data, loading, error, reload } = useLoad(() => q(supabase.from('inventory_activity_logs').select('*').gte('txn_at', istDayStart(r[0])).lt('txn_at', istDayEnd(r[1])).order('txn_at', { ascending: false }).limit(1000)), [range, custom])
  if (loading && !data) return <Loading />
  if (error) return <ErrorBox msg={error} retry={reload} />
  const rows = data.filter((x) => (!emp || x.employee_name === emp) && (!item || x.item_name === item) && (!kind || x.kind === kind))
  const names = [...new Set(data.map((x) => x.employee_name))]; const items = [...new Set(data.map((x) => x.item_name))]
  return (
    <Page title="Inventory Activity Log" actions={<>
      <select className="inp w-auto" value={range} onChange={(e) => setRange(e.target.value)}><option value="today">Today</option><option value="yesterday">Yesterday</option><option value="7">Last 7 days</option><option value="custom">Pick a date</option></select>
      {range === 'custom' && <input type="date" className="inp w-auto" value={custom} onChange={(e) => setCustom(e.target.value)} />}
      {isMgr && <select className="inp w-auto" value={emp} onChange={(e) => setEmp(e.target.value)}><option value="">All staff</option>{names.map((n) => <option key={n}>{n}</option>)}</select>}
      <select className="inp w-auto" value={item} onChange={(e) => setItem(e.target.value)}><option value="">All items</option>{items.map((n) => <option key={n}>{n}</option>)}</select>
      <select className="inp w-auto" value={kind} onChange={(e) => setKind(e.target.value)}><option value="">All actions</option><option value="IN">Stock IN</option><option value="OUT">Stock OUT</option><option value="ADJUST">Corrections</option></select></>}>
      <p className="text-xs text-slate-500">The latest 7 days are shown here. Older entries are tidied up automatically; the permanent stock history is never deleted.</p>
      <Table rows={rows} cols={[
        { label: 'Date & time', render: (x) => fmtDT(x.txn_at) }, { label: 'Staff', render: (x) => x.employee_name }, { label: 'Item', key: 'item_name' },
        { label: 'Action', render: (x) => <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${x.kind === 'IN' ? 'bg-brand-100 text-brand-700' : x.kind === 'OUT' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>{x.kind === 'IN' ? 'Stock IN' : x.kind === 'OUT' ? 'Stock OUT' : 'Correction'}</span> },
        { label: 'Quantity', right: true, render: (x) => <b>{x.kind === 'OUT' ? '-' : x.kind === 'IN' ? '+' : ''}{num(x.entered_qty)} {x.entered_unit}</b> },
        { label: 'Before → After', render: (x) => `${num(x.prev_base)} → ${num(x.new_base)}` }, { label: 'Reason', render: (x) => [x.reason, x.notes].filter(Boolean).join(' – ') }]} empty="No activity for this selection." />
    </Page>
  )
}
