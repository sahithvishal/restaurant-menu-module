import { supabase, q } from '../lib/supabase'
import { useLoad } from '../hooks/useLoad'
import { Page, Table, Loading, ErrorBox } from '../components/ui'
import { fmtDT } from '../lib/utils'

const NAMES = { sales_entries: 'Sale', purchases: 'Purchase', cash_transactions: 'Cash entry', suppliers: 'Supplier', supplier_payments: 'Supplier payment', inventory_items: 'Inventory item', restaurant_payments: 'Payment', staff_payments: 'Staff payment', platform_settlements: 'Online payout', user_roles: 'Role', profiles: 'User', daily_cash_closings: 'Daily closing' }
const ACT = { INSERT: 'Added', UPDATE: 'Changed', DELETE: 'Deleted' }
export default function Audit() {
  const { data, loading, error, reload } = useLoad(async () => {
    const [a, p] = await Promise.all([q(supabase.from('audit_logs').select('*').order('at', { ascending: false }).limit(300)), q(supabase.from('profiles').select('id,full_name'))])
    return a.map((x) => ({ ...x, who: p.find((y) => y.id === x.user_id)?.full_name || 'System' })) }, [])
  if (loading && !data) return <Loading />
  if (error) return <ErrorBox msg={error} retry={reload} />
  return <Page title="Audit Logs"><Table rows={data} cols={[{ label: 'When', render: (x) => fmtDT(x.at) }, { label: 'Who', key: 'who' }, { label: 'What', render: (x) => `${ACT[x.action]} ${NAMES[x.table_name] || x.table_name}` }, { label: 'Details', render: (x) => <code className="text-xs text-slate-500">{JSON.stringify(x.new_data || x.old_data).slice(0, 110)}…</code> }]} /></Page>
}
