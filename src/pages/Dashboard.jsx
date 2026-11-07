import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, PieChart, Pie, Cell, LineChart, Line, Legend, CartesianGrid } from 'recharts'
import { supabase, rpc, q } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useLoad } from '../hooks/useLoad'
import { Page, Stat, Loading, ErrorBox } from '../components/ui'
import { todayISO, addDays, istDayStart, istDayEnd, money, num, fmtDate } from '../lib/utils'

const COLORS = ['#1f9d6b', '#e0a526', '#3b6fd4', '#c8503d', '#7b5cc4', '#2a9db0', '#8a8f98']
const dayKey = (d) => new Date(d).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })

export default function Dashboard() {
  const { isMgr } = useAuth()
  const { data, loading, error, reload } = useLoad(async () => {
    const t = todayISO(); const from7 = addDays(t, -6)
    const items = await q(supabase.from('inventory_items').select('id,name,qty_base,min_base,expiry_date,active').eq('active', true).is('deleted_at', null))
    const moves = await q(supabase.from('stock_transactions').select('kind,txn_at').gte('txn_at', istDayStart(from7)).lt('txn_at', istDayEnd(t)))
    let fin = null
    if (isMgr) {
      const [s, sales, cash] = await Promise.all([
        rpc('report_summary', { p_from: t, p_to: t }),
        q(supabase.from('sales_entries').select('gross,refund,txn_at,channel_id,sales_channels(name)').is('deleted_at', null).gte('txn_at', istDayStart(from7)).lt('txn_at', istDayEnd(t))),
        q(supabase.from('cash_transactions').select('direction,amount,txn_at').eq('reversed', false).gte('txn_at', istDayStart(from7)).lt('txn_at', istDayEnd(t))),
      ])
      fin = { s, sales, cash }
    }
    return { t, items, moves, fin }
  }, [isMgr])
  if (loading) return <Loading />
  if (error) return <ErrorBox msg={error} retry={reload} />
  const { t, items, moves, fin } = data
  const soon = addDays(t, 7)
  const today = moves.filter((m) => dayKey(m.txn_at) === t)

  const days = Array.from({ length: 7 }, (_, i) => addDays(t, i - 6))
  const invMove = days.map((d) => ({ d: d.slice(5), IN: moves.filter((m) => m.kind === 'IN' && dayKey(m.txn_at) === d).length, OUT: moves.filter((m) => m.kind === 'OUT' && dayKey(m.txn_at) === d).length }))
  let finCharts = null
  if (fin) {
    const daily = days.map((d) => ({ d: d.slice(5), Sales: fin.sales.filter((x) => dayKey(x.txn_at) === d).reduce((a, x) => a + Number(x.gross) - Number(x.refund), 0) }))
    const inc = days.map((d) => ({ d: d.slice(5), Income: fin.cash.filter((x) => x.direction === 'in' && dayKey(x.txn_at) === d).reduce((a, x) => a + Number(x.amount), 0), Expenses: fin.cash.filter((x) => x.direction === 'out' && dayKey(x.txn_at) === d).reduce((a, x) => a + Number(x.amount), 0) }))
    const byCh = {}; fin.sales.forEach((x) => { const n = x.sales_channels?.name || 'Other'; byCh[n] = (byCh[n] || 0) + Number(x.gross) })
    const cats = Object.entries(fin.s.out_by_source).map(([name, value]) => ({ name: name.replace('_', ' '), value: Number(value) }))
    finCharts = { daily, inc, ch: Object.entries(byCh).map(([name, value]) => ({ name, value })), cats }
  }
  const s = fin?.s
  return (
    <Page title="Dashboard">
      <p className="text-sm text-slate-500">{fmtDate(new Date())}</p>
      {s && (
        <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Today's sales" value={money(s.gross_sales)} />
          <Stat label="Today's income" value={money(Object.values(s.in_by_method).reduce((a, b) => a + Number(b), 0))} />
          <Stat label="Expenses paid" value={money(Object.values(s.out_by_method).reduce((a, b) => a + Number(b), 0))} />
          <Stat label="Cash received" value={money(s.in_by_method.Cash)} />
          <Stat label="UPI received" value={money(s.in_by_method.UPI)} />
          <Stat label="Card received" value={money(s.in_by_method.Card)} />
          <Stat label="Total purchases" value={money(s.purchases_total)} />
          <Stat label="Supplier credit due" value={money(s.credit_outstanding)} tone={Number(s.credit_outstanding) > 0 ? 'bad' : undefined} />
          <Stat label="Expected cash balance" value={money(Number(s.opening_cash) + Number(s.cash_in) - Number(s.cash_out) + Number(s.deposits) - Number(s.withdrawals))} />
        </section>)}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Inventory items" value={items.length} />
        <Stat label="Stock IN today" value={today.filter((m) => m.kind === 'IN').length} />
        <Stat label="Stock OUT today" value={today.filter((m) => m.kind === 'OUT').length} />
        <Stat label="Low-stock items" value={items.filter((i) => Number(i.qty_base) > 0 && Number(i.qty_base) <= Number(i.min_base)).length} tone="bad" />
        <Stat label="Out of stock" value={items.filter((i) => Number(i.qty_base) <= 0).length} tone="bad" />
        <Stat label="Expiring within 7 days" value={items.filter((i) => i.expiry_date && i.expiry_date <= soon).length} />
      </section>
      <section className="grid gap-4 md:grid-cols-2">
        {finCharts && <>
          <div className="card h-72"><h3 className="mb-2 text-sm font-semibold">Daily sales (last 7 days)</h3><ResponsiveContainer><BarChart data={finCharts.daily}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="d" /><YAxis /><Tooltip formatter={(v) => money(v)} /><Bar dataKey="Sales" fill="#1f9d6b" /></BarChart></ResponsiveContainer></div>
          <div className="card h-72"><h3 className="mb-2 text-sm font-semibold">Income vs expenses</h3><ResponsiveContainer><LineChart data={finCharts.inc}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="d" /><YAxis /><Tooltip formatter={(v) => money(v)} /><Legend /><Line dataKey="Income" stroke="#1f9d6b" /><Line dataKey="Expenses" stroke="#c8503d" /></LineChart></ResponsiveContainer></div>
          <div className="card h-72"><h3 className="mb-2 text-sm font-semibold">Sales by channel</h3><ResponsiveContainer><PieChart><Pie data={finCharts.ch} dataKey="value" nameKey="name" outerRadius={90} label>{finCharts.ch.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip formatter={(v) => money(v)} /></PieChart></ResponsiveContainer></div>
          <div className="card h-72"><h3 className="mb-2 text-sm font-semibold">Today's spending by type</h3><ResponsiveContainer><BarChart data={finCharts.cats}><XAxis dataKey="name" /><YAxis /><Tooltip formatter={(v) => money(v)} /><Bar dataKey="value" fill="#3b6fd4" /></BarChart></ResponsiveContainer></div>
        </>}
        <div className="card h-72"><h3 className="mb-2 text-sm font-semibold">Inventory movement (entries per day)</h3><ResponsiveContainer><BarChart data={invMove}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="d" /><YAxis allowDecimals={false} /><Tooltip /><Legend /><Bar dataKey="IN" fill="#1f9d6b" /><Bar dataKey="OUT" fill="#c8503d" /></BarChart></ResponsiveContainer></div>
      </section>
      <p className="text-xs text-slate-400">{num(items.length, 0)} active items tracked.</p>
    </Page>
  )
}
