import { useState } from 'react'
import { supabase, rpc, q } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useLoad } from '../hooks/useLoad'
import { Page, Table, Loading, ErrorBox } from '../components/ui'
import { todayISO, rangeFor, istDayStart, istDayEnd, fmtDate, fmtDT, money, num, niceQty, fromBase } from '../lib/utils'
import { exportXlsx, exportPdf, printPage } from '../lib/export'

const INV = [['stock', 'Current stock'], ['in', 'Stock IN'], ['out', 'Stock OUT'], ['move', 'Stock movement'], ['waste', 'Wastage'], ['adjust', 'Corrections'], ['low', 'Low stock'], ['zero', 'Finished items'], ['expiry', 'Expiring items'], ['value', 'Stock value']]
const FIN = [['cash', 'Cash book'], ['sales', 'Sales'], ['expense', 'Expenses'], ['staff', 'Staff payments'], ['credit', 'Supplier credit'], ['pnl', 'Profit & loss']]
const PERIODS = [['daily', 'Daily'], ['weekly', 'Weekly'], ['monthly', 'Monthly'], ['quarterly', '3 months'], ['half', '6 months'], ['custom', 'Custom']]

export default function Reports() {
  const { isMgr, units, profile, business } = useAuth()
  const [group, setGroup] = useState('inv'); const [rep, setRep] = useState('stock'); const [kind, setKind] = useState('daily'); const [anchor, setAnchor] = useState(todayISO()); const [c, setC] = useState({ from: todayISO(), to: todayISO() })
  const r = rangeFor(kind, anchor, c); const list = group === 'inv' ? INV : FIN
  const title = list.find((x) => x[0] === rep)?.[1]
  const { data, loading, error, reload } = useLoad(() => build(rep, r, units), [rep, kind, anchor, c.from, c.to])
  const meta = { business: business?.name, outlet: 'Main outlet', title, from: fmtDate(r.from), to: fmtDate(r.to), by: profile?.full_name }
  const file = `${rep}-${r.from}-to-${r.to}`
  const log = async (format) => { try { await supabase.from('report_generation_logs').insert({ business_id: profile.business_id, user_id: profile.id, report: rep, period_from: r.from, period_to: r.to, format }) } catch {} }
  return (
    <Page title="Reports" actions={<>
      <button className="btn-ghost print:hidden" onClick={() => { log('print'); printPage() }}>Print</button>
      <button className="btn-ghost print:hidden" disabled={!data} onClick={() => { log('xlsx'); exportXlsx({ meta, ...data, filename: file }) }}>Excel</button>
      <button className="btn print:hidden" disabled={!data} onClick={() => { log('pdf'); exportPdf({ meta, ...data, filename: file }) }}>PDF</button></>}>
      <div className="flex flex-wrap gap-2 print:hidden">
        {isMgr && <div className="inline-flex rounded-lg bg-slate-200 p-1 text-sm dark:bg-slate-800">{[['inv', 'Inventory'], ['fin', 'Financial']].map(([k, l]) => <button key={k} onClick={() => { setGroup(k); setRep(k === 'inv' ? 'stock' : 'cash') }} className={`rounded-md px-3 py-1.5 font-medium ${group === k ? 'bg-white shadow-sm dark:bg-slate-700' : 'text-slate-600'}`}>{l}</button>)}</div>}
        <select className="inp w-auto" value={rep} onChange={(e) => setRep(e.target.value)}>{list.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <select className="inp w-auto" value={kind} onChange={(e) => setKind(e.target.value)}>{PERIODS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        {kind === 'custom' ? <><input type="date" className="inp w-auto" value={c.from} onChange={(e) => setC({ ...c, from: e.target.value })} /><input type="date" className="inp w-auto" value={c.to} onChange={(e) => setC({ ...c, to: e.target.value })} /></> : <input type="date" className="inp w-auto" value={anchor} onChange={(e) => setAnchor(e.target.value)} />}
      </div>
      <div className="card text-sm"><b>{business?.name}</b> · {title} · {fmtDate(r.from)} to {fmtDate(r.to)} · Generated {fmtDT(new Date())} by {profile?.full_name}</div>
      {loading ? <Loading /> : error ? <ErrorBox msg={error} retry={reload} /> : <Table rows={data.rows} cols={data.columns.map((x, i) => ({ key: x.key, label: x.label, right: x.right }))} foot={data.totals ? data.columns.map((x, i) => (i === 0 ? 'Total' : data.totals[x.key] ?? '')) : null} empty="No data for this period." />}
    </Page>
  )
}

async function build(rep, r, units) {
  const f = istDayStart(r.from), t = istDayEnd(r.to)
  const items = ['stock', 'low', 'zero', 'expiry', 'value'].includes(rep) ? await q(supabase.from('inventory_items').select('*').is('deleted_at', null).order('name')) : null
  const qty = (i, b) => `${num(fromBase(b, i.display_unit, units))} ${i.display_unit}`
  if (items) {
    const soon = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10)
    const set = rep === 'low' ? items.filter((i) => Number(i.qty_base) > 0 && Number(i.qty_base) <= Number(i.min_base)) : rep === 'zero' ? items.filter((i) => Number(i.qty_base) <= 0) : rep === 'expiry' ? items.filter((i) => i.expiry_date && i.expiry_date <= soon) : items
    if (rep === 'value') { const rows = set.map((i) => ({ name: i.name, qty: qty(i, i.qty_base), price: money(i.purchase_price), value: Number(fromBase(i.qty_base, i.display_unit, units)) * Number(i.purchase_price) })); const tot = rows.reduce((a, x) => a + x.value, 0); rows.forEach((x) => (x.value = money(x.value))); return { columns: [{ key: 'name', label: 'Item' }, { key: 'qty', label: 'In stock' }, { key: 'price', label: 'Price per unit' }, { key: 'value', label: 'Value', right: true }], rows, totals: { value: money(tot) } } }
    return { columns: [{ key: 'name', label: 'Item' }, { key: 'category', label: 'Category' }, { key: 'qty', label: 'In stock' }, { key: 'min', label: 'Alert below' }, { key: 'exp', label: 'Expiry' }], rows: set.map((i) => ({ name: i.name, category: i.category, qty: qty(i, i.qty_base), min: qty(i, i.min_base), exp: i.expiry_date ? fmtDate(i.expiry_date) : '' })) }
  }
  if (['in', 'out', 'move', 'waste', 'adjust'].includes(rep)) {
    let qy = supabase.from('stock_transactions').select('*,inventory_items(name)').gte('txn_at', f).lt('txn_at', t).order('txn_at', { ascending: false })
    if (rep === 'in') qy = qy.eq('kind', 'IN'); if (rep === 'out') qy = qy.eq('kind', 'OUT'); if (rep === 'adjust') qy = qy.eq('kind', 'ADJUST')
    let d = await q(qy); if (rep === 'waste') d = d.filter((x) => x.kind === 'OUT' && ['Wastage', 'Damaged goods', 'Expired stock'].includes(x.reason))
    return { columns: [{ key: 'at', label: 'Date & time' }, { key: 'emp', label: 'Staff' }, { key: 'item', label: 'Item' }, { key: 'act', label: 'Action' }, { key: 'qty', label: 'Quantity', right: true }, { key: 'reason', label: 'Reason' }], rows: d.map((x) => ({ at: fmtDT(x.txn_at), emp: x.employee_name, item: x.inventory_items?.name, act: x.kind, qty: `${x.kind === 'OUT' ? '-' : ''}${num(x.entered_qty)} ${x.entered_unit}`, reason: x.reason || '' })) }
  }
  // financial: owner/manager only (also enforced by RLS)
  const S = await rpc('report_summary', { p_from: r.from, p_to: r.to })
  if (rep === 'cash') {
    const open = Number(S.opening_cash), exp = open + Number(S.cash_in) - Number(S.cash_out) + Number(S.deposits) - Number(S.withdrawals)
    const rows = [['Opening cash', open], ['Cash received', S.cash_in], ...Object.entries(S.in_by_method).map(([k, v]) => [`Received by ${k}`, v]), ['Cash paid', S.cash_out], ...Object.entries(S.out_by_source).map(([k, v]) => [`Paid for ${k.replace('_', ' ')}`, v]), ['Cash deposits', S.deposits], ['Cash withdrawals', S.withdrawals], ['Unpaid supplier credit (not deducted)', S.credit_outstanding], ['Expected closing cash', exp]]
    return { columns: [{ key: 'a', label: 'Item' }, { key: 'b', label: 'Amount', right: true }], rows: rows.map(([a, b]) => ({ a, b: money(b) })) }
  }
  if (rep === 'sales') {
    const rows = S.sales_by_channel.map((x) => ({ a: x.channel, g: Number(x.gross), c: Number(x.commission), r: Number(x.refund) }))
    const tot = rows.reduce((o, x) => ({ g: o.g + x.g, c: o.c + x.c, r: o.r + x.r }), { g: 0, c: 0, r: 0 })
    return { columns: [{ key: 'a', label: 'Sales channel' }, { key: 'g', label: 'Sales', right: true }, { key: 'c', label: 'Commission', right: true }, { key: 'r', label: 'Refunds', right: true }, { key: 'n', label: 'Net', right: true }], rows: rows.map((x) => ({ a: x.a, g: money(x.g), c: money(x.c), r: money(x.r), n: money(x.g - x.c - x.r) })), totals: { g: money(tot.g), c: money(tot.c), r: money(tot.r), n: money(tot.g - tot.c - tot.r) } }
  }
  if (rep === 'expense' || rep === 'staff') {
    const tbl = rep === 'staff' ? 'staff_payments' : 'restaurant_payments'
    const d = await q(supabase.from(tbl).select(rep === 'staff' ? '*' : '*,restaurant_expense_categories(name)').is('deleted_at', null).gte('paid_at', f).lt('paid_at', t).order('paid_at', { ascending: false }))
    const rows = d.map((x) => ({ at: fmtDT(x.paid_at), t: rep === 'staff' ? x.kind : x.restaurant_expense_categories?.name, to: rep === 'staff' ? x.employee_name : x.paid_to, m: x.method, a: Number(x.amount) }))
    const tot = rows.reduce((a, x) => a + x.a, 0)
    return { columns: [{ key: 'at', label: 'Date & time' }, { key: 't', label: 'Type' }, { key: 'to', label: rep === 'staff' ? 'Employee' : 'Paid to' }, { key: 'm', label: 'Method' }, { key: 'a', label: 'Amount', right: true }], rows: rows.map((x) => ({ ...x, a: money(x.a) })), totals: { a: money(tot) } }
  }
  if (rep === 'credit') {
    const d = await q(supabase.from('purchases').select('*,suppliers(name)').is('deleted_at', null).order('txn_at'))
    const rows = d.filter((x) => Number(x.total) > Number(x.paid)).map((x) => ({ s: x.suppliers?.name, at: fmtDate(x.txn_at), inv: x.invoice_no, due: x.due_date ? fmtDate(x.due_date) : '', t: Number(x.total), p: Number(x.paid) }))
    return { columns: [{ key: 's', label: 'Supplier' }, { key: 'at', label: 'Bill date' }, { key: 'inv', label: 'Bill no.' }, { key: 'due', label: 'Pay by' }, { key: 'o', label: 'Still to pay', right: true }], rows: rows.map((x) => ({ ...x, o: money(x.t - x.p) })), totals: { o: money(rows.reduce((a, x) => a + x.t - x.p, 0)) } }
  }
  // profit & loss
  const [ex, st] = await Promise.all([
    q(supabase.from('restaurant_payments').select('amount').is('deleted_at', null).gte('paid_at', f).lt('paid_at', t)),
    q(supabase.from('staff_payments').select('amount').is('deleted_at', null).gte('paid_at', f).lt('paid_at', t))])
  const sum = (a) => a.reduce((s, x) => s + Number(x.amount), 0)
  const comm = S.sales_by_channel.reduce((a, x) => a + Number(x.commission), 0)
  const profit = Number(S.gross_sales) - comm - Number(S.purchases_total) - sum(ex) - sum(st)
  return { columns: [{ key: 'a', label: 'Item' }, { key: 'b', label: 'Amount', right: true }], rows: [['Sales (after refunds)', S.gross_sales], ['Platform commission', -comm], ['Purchases', -S.purchases_total], ['Restaurant expenses', -sum(ex)], ['Staff payments', -sum(st)], ['Profit / (loss)', profit]].map(([a, b]) => ({ a, b: money(b) })) }
}
