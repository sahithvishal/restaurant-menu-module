import { useState } from 'react'
import { supabase, rpc, q } from '../lib/supabase'
import { useLoad } from '../hooks/useLoad'
import { useSaver } from '../hooks/useSaver'
import { Page, Table, Stat, Field, Loading, ErrorBox } from '../components/ui'
import { SaveBadge } from '../contexts/UIContext'
import { todayISO, rangeFor, istDayStart, istDayEnd, fmtDT, money } from '../lib/utils'

export default function CashBook() {
  const [kind, setKind] = useState('daily'); const [anchor, setAnchor] = useState(todayISO()); const [c, setC] = useState({ from: todayISO(), to: todayISO() })
  const r = rangeFor(kind, anchor, c)
  const { data, loading, error, reload } = useLoad(async () => {
    const [s, rows, close] = await Promise.all([
      rpc('report_summary', { p_from: r.from, p_to: r.to }),
      q(supabase.from('cash_transactions').select('*').gte('txn_at', istDayStart(r.from)).lt('txn_at', istDayEnd(r.to)).order('txn_at', { ascending: false }).limit(500)),
      q(supabase.from('daily_cash_closings').select('*').eq('closing_date', r.from).maybeSingle()),
    ])
    return { s, rows, close }
  }, [kind, anchor, c.from, c.to])
  const [cl, setCl] = useState(null); const { state, run, retry } = useSaver()
  if (loading && !data) return <Loading />
  if (error) return <ErrorBox msg={error} retry={reload} />
  const { s, rows, close } = data
  const form = cl || close || { opening_cash: 0, deposits: 0, withdrawals: 0, counted_cash: '' }
  const expected = Number(s.opening_cash) + Number(s.cash_in) - Number(s.cash_out) + Number(s.deposits) - Number(s.withdrawals)
  const saveClose = () => run(async () => {
    await q(supabase.from('daily_cash_closings').upsert({ business_id: (await supabase.from('profiles').select('business_id').single()).data.business_id, closing_date: r.from, opening_cash: form.opening_cash || 0, deposits: form.deposits || 0, withdrawals: form.withdrawals || 0, counted_cash: form.counted_cash === '' ? null : form.counted_cash, notes: form.notes }, { onConflict: 'business_id,closing_date' }))
    await reload()
  }, 'Daily closing saved')
  return (
    <Page title="Cash Book" actions={<>
      <select className="inp w-auto" value={kind} onChange={(e) => setKind(e.target.value)}>{[['daily', 'Daily'], ['weekly', 'Weekly'], ['monthly', 'Monthly'], ['quarterly', 'Quarterly'], ['half', 'Half-yearly'], ['custom', 'Custom']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
      {kind === 'custom' ? <><input type="date" className="inp w-auto" value={c.from} onChange={(e) => setC({ ...c, from: e.target.value })} /><input type="date" className="inp w-auto" value={c.to} onChange={(e) => setC({ ...c, to: e.target.value })} /></> : <input type="date" className="inp w-auto" value={anchor} onChange={(e) => setAnchor(e.target.value)} />}
    </>}>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Opening cash" value={money(s.opening_cash)} /><Stat label="Cash received" value={money(s.cash_in)} /><Stat label="Cash paid" value={money(s.cash_out)} /><Stat label="Expected cash" value={money(expected)} />
        {Object.entries(s.in_by_method).map(([k, v]) => <Stat key={'i' + k} label={`${k} received`} value={money(v)} />)}
        {Object.entries(s.out_by_source).map(([k, v]) => <Stat key={'o' + k} label={`${k.replace('_', ' ')} paid`} value={money(v)} />)}
        <Stat label="Credit purchases outstanding" value={money(s.credit_outstanding)} />
      </div>
      {kind === 'daily' && <div className="card space-y-3"><div className="flex items-center justify-between"><h3 className="font-semibold">Daily closing</h3><SaveBadge state={state} retry={retry} /></div>
        <div className="grid gap-3 md:grid-cols-4">
          <Field label="Opening cash override"><input type="number" className="inp" value={form.opening_cash} onChange={(e) => setCl({ ...form, opening_cash: e.target.value })} /></Field>
          <Field label="Cash deposits"><input type="number" className="inp" value={form.deposits} onChange={(e) => setCl({ ...form, deposits: e.target.value })} /></Field>
          <Field label="Cash withdrawals"><input type="number" className="inp" value={form.withdrawals} onChange={(e) => setCl({ ...form, withdrawals: e.target.value })} /></Field>
          <Field label="Counted cash" hint={form.counted_cash !== '' && form.counted_cash != null ? `Difference ${money(Number(form.counted_cash) - expected)}` : ''}><input type="number" className="inp" value={form.counted_cash ?? ''} onChange={(e) => setCl({ ...form, counted_cash: e.target.value })} /></Field>
        </div><button className="btn" onClick={saveClose}>Save closing</button></div>}
      <Table rows={rows} cols={[
        { label: 'Date & time', render: (x) => fmtDT(x.txn_at) }, { label: 'Type', render: (x) => (x.direction === 'in' ? 'Cash IN' : 'Cash OUT') }, { label: 'Source', render: (x) => `${x.source_type.replace('_', ' ')}${x.description ? ' – ' + x.description : ''}` },
        { label: 'Method', key: 'method' }, { label: 'Amount', right: true, render: (x) => <span className={x.reversed ? 'line-through opacity-50' : x.direction === 'in' ? 'text-brand-700' : 'text-red-600'}>{x.direction === 'in' ? '+' : '-'}{money(x.amount)}</span> }]} />
    </Page>
  )
}
