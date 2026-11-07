import { useState } from 'react'
import { supabase, rpc, q } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useUI } from '../contexts/UIContext'
import { useLoad } from '../hooks/useLoad'
import { useSaver } from '../hooks/useSaver'
import { Page, Table, Modal, Field, Stat, Loading, ErrorBox } from '../components/ui'
import { nowLocalInput, localInputToISO, todayISO, istDayStart, istDayEnd, fmtDT, fmtDate, money, uid } from '../lib/utils'

export default function CashIn() {
  const { profile } = useAuth(); const { confirm, toast } = useUI()
  const [day, setDay] = useState(todayISO()); const [modal, setModal] = useState(null)
  const { data, loading, error, reload } = useLoad(async () => {
    const [channels, sales, settles] = await Promise.all([
      q(supabase.from('sales_channels').select('*').eq('active', true).order('name')),
      q(supabase.from('sales_entries').select('*,sales_channels(name,is_platform)').is('deleted_at', null).gte('txn_at', istDayStart(day)).lt('txn_at', istDayEnd(day)).order('txn_at', { ascending: false })),
      q(supabase.from('platform_settlements').select('*,sales_channels(name)').is('deleted_at', null).order('settled_on', { ascending: false }).limit(30)),
    ])
    return { channels, sales, settles }
  }, [day])
  if (loading && !data) return <Loading />
  if (error) return <ErrorBox msg={error} retry={reload} />
  const { channels, sales, settles } = data
  const byCh = {}; sales.forEach((s) => { const n = s.sales_channels.name; byCh[n] = (byCh[n] || 0) + Number(s.gross) - Number(s.refund) })
  const total = Object.values(byCh).reduce((a, b) => a + b, 0)
  const del = async (table, id) => { if (await confirm('Remove this entry? It stays in history but is not counted.')) { try { await rpc('void_record', { p_table: table, p_id: id }); toast('Removed'); reload() } catch (e) { toast(e.message, 'err') } } }
  return (
    <Page title="Money In (Sales)" actions={<><input type="date" className="inp w-auto" value={day} onChange={(e) => setDay(e.target.value)} /><button className="btn" onClick={() => setModal('sale')}>+ Add sale</button><button className="btn-ghost" onClick={() => setModal('settle')}>+ Online payout received</button></>}>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4"><Stat label={`Total sales ${fmtDate(day)}`} value={money(total)} />{channels.map((c) => <Stat key={c.id} label={c.name} value={money(byCh[c.name] || 0)} />)}</div>
      <Table rows={sales} cols={[{ label: 'Time', render: (s) => fmtDT(s.txn_at) }, { label: 'Where', render: (s) => s.sales_channels.name }, { label: 'Paid by', key: 'payment_method' }, { label: 'Amount', right: true, render: (s) => money(s.gross) }, { label: 'Commission', right: true, render: (s) => (Number(s.commission) ? money(s.commission) : '') }, { label: 'Refund', right: true, render: (s) => (Number(s.refund) ? money(s.refund) : '') }, { label: '', render: (s) => <button className="btn-danger" onClick={() => del('sales_entries', s.id)}>Remove</button> }]} empty="No sales added for this day." />
      <h2 className="pt-2 font-semibold">Online payouts received</h2>
      <p className="-mt-2 text-xs text-slate-500">Zomato, Swiggy etc. pay you later. Enter the payout here when the money reaches your bank. It is not counted as a new sale.</p>
      <Table rows={settles} cols={[{ label: 'Date', render: (s) => fmtDate(s.settled_on) }, { label: 'Platform', render: (s) => s.sales_channels.name }, { label: 'Sales covered', right: true, render: (s) => money(s.gross) }, { label: 'Commission', right: true, render: (s) => money(s.commission) }, { label: 'Money received', right: true, render: (s) => money(s.received) }, { label: '', render: (s) => <button className="btn-danger" onClick={() => del('platform_settlements', s.id)}>Remove</button> }]} />
      {modal === 'sale' && <SaleForm channels={channels} onClose={() => setModal(null)} onDone={() => { setModal(null); reload() }} />}
      {modal === 'settle' && <SettleForm channels={channels.filter((c) => c.is_platform)} onClose={() => setModal(null)} onDone={() => { setModal(null); reload() }} />}
    </Page>
  )
}

function SaleForm({ channels, onClose, onDone }) {
  const [f, setF] = useState({ channel_id: channels[0]?.id, txn_at: nowLocalInput(), gross: '', payment_method: 'Cash', reference_no: '', commission: '', refund: '', notes: '' })
  const { run, state } = useSaver(); const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const ch = channels.find((c) => c.id === f.channel_id)
  const save = async (e) => { e.preventDefault(); const r = await run(() => rpc('add_sale', { p: { ...f, txn_at: localInputToISO(f.txn_at), gross: Number(f.gross), commission: Number(f.commission || 0), refund: Number(f.refund || 0) } }), 'Sale saved'); if (r) onDone() }
  return (
    <Modal title="Add a sale" onClose={onClose}><form onSubmit={save} className="space-y-3">
      <Field label="Where was it sold?"><select className="inp" value={f.channel_id} onChange={set('channel_id')}>{channels.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
      <Field label="Amount (₹)"><input required type="number" min="0" step="0.01" className="inp text-lg" autoFocus value={f.gross} onChange={set('gross')} /></Field>
      <Field label="Customer paid by"><select className="inp" value={f.payment_method} onChange={set('payment_method')}>{['Cash', 'UPI', 'Card', 'Other'].map((m) => <option key={m}>{m}</option>)}</select></Field>
      <Field label="Date and time"><input type="datetime-local" className="inp" value={f.txn_at} onChange={set('txn_at')} /></Field>
      {ch?.is_platform && <div className="grid grid-cols-2 gap-3"><Field label="Platform commission (₹)"><input type="number" className="inp" value={f.commission} onChange={set('commission')} /></Field><Field label="Refund (₹)"><input type="number" className="inp" value={f.refund} onChange={set('refund')} /></Field></div>}
      <Field label="Note (optional)"><input className="inp" value={f.notes} onChange={set('notes')} /></Field>
      <button className="btn w-full" disabled={state === 'saving'}>{state === 'saving' ? 'Saving...' : 'Save sale'}</button></form></Modal>
  )
}

function SettleForm({ channels, onClose, onDone }) {
  const [f, setF] = useState({ channel_id: channels[0]?.id, settled_on: todayISO(), received: '', gross: '', commission: '', reference_no: '' })
  const { run, state } = useSaver(); const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const save = async (e) => { e.preventDefault(); const r = await run(() => rpc('add_settlement', { p: { ...f, received: Number(f.received), gross: Number(f.gross || 0), commission: Number(f.commission || 0) } }), 'Payout saved'); if (r) onDone() }
  return (
    <Modal title="Online payout received" onClose={onClose}><form onSubmit={save} className="space-y-3">
      <Field label="Which platform?"><select className="inp" value={f.channel_id} onChange={set('channel_id')}>{channels.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
      <Field label="Money received in bank (₹)"><input required type="number" min="1" className="inp text-lg" value={f.received} onChange={set('received')} /></Field>
      <Field label="Date received"><input type="date" className="inp" value={f.settled_on} onChange={set('settled_on')} /></Field>
      <div className="grid grid-cols-2 gap-3"><Field label="Sales covered (₹)"><input type="number" className="inp" value={f.gross} onChange={set('gross')} /></Field><Field label="Commission cut (₹)"><input type="number" className="inp" value={f.commission} onChange={set('commission')} /></Field></div>
      <button className="btn w-full" disabled={state === 'saving'}>Save payout</button></form></Modal>
  )
}
