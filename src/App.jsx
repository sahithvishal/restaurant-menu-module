import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import { configured } from './lib/supabase'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import CashBook from './pages/CashBook'
import CashIn from './pages/CashIn'
import CashOut from './pages/CashOut'
import Inventory from './pages/Inventory'
import StockMove from './pages/StockMove'
import Activity from './pages/Activity'
import Suppliers from './pages/Suppliers'
import Payments from './pages/Payments'
import StaffPayments from './pages/StaffPayments'
import Reports from './pages/Reports'
import Employees from './pages/Employees'
import Permissions from './pages/Permissions'
import Audit from './pages/Audit'
import Settings from './pages/Settings'

const Guard = ({ perm, mgr, children }) => {
  const { can, isMgr } = useAuth()
  if (mgr ? !isMgr : perm && !can(perm)) return <div className="p-6 text-sm">You do not have access to this page.</div>
  return children
}

export default function App() {
  const { loading, session, profile } = useAuth()
  if (!configured) return <div className="grid min-h-screen place-items-center p-6"><div className="card max-w-md text-sm">Supabase is not configured. Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to <code>.env.local</code> (or Vercel project settings) and restart.</div></div>
  if (loading) return <div className="grid min-h-screen place-items-center text-sm text-slate-500">Loading...</div>
  if (!session || !profile) return <Login />
  if (!profile.active) return <div className="grid min-h-screen place-items-center p-6"><div className="card max-w-sm text-sm">This account is deactivated. Contact the Owner.</div></div>
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Guard perm="dashboard.view"><Dashboard /></Guard>} />
        <Route path="cash-book" element={<Guard mgr><CashBook /></Guard>} />
        <Route path="cash-in" element={<Guard mgr><CashIn /></Guard>} />
        <Route path="cash-out" element={<Guard mgr><CashOut /></Guard>} />
        <Route path="inventory" element={<Guard perm="inventory.view"><Inventory /></Guard>} />
        <Route path="stock-in" element={<Guard perm="stock.in"><StockMove kind="IN" /></Guard>} />
        <Route path="stock-out" element={<Guard perm="stock.out"><StockMove kind="OUT" /></Guard>} />
        <Route path="activity" element={<Guard perm="inventory.activity"><Activity /></Guard>} />
        <Route path="suppliers" element={<Guard mgr><Suppliers /></Guard>} />
        <Route path="payments" element={<Guard mgr><Payments /></Guard>} />
        <Route path="staff-payments" element={<Guard mgr><StaffPayments /></Guard>} />
        <Route path="reports" element={<Guard perm="inventory.reports"><Reports /></Guard>} />
        <Route path="employees" element={<Guard mgr><Employees /></Guard>} />
        <Route path="permissions" element={<Guard mgr><Permissions /></Guard>} />
        <Route path="audit" element={<Guard mgr><Audit /></Guard>} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Route>
    </Routes>
  )
}
