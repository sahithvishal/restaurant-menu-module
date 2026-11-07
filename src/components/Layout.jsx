import { NavLink, Outlet } from 'react-router-dom'
import { useState } from 'react'
import { LayoutDashboard, BookOpen, TrendingUp, ShoppingCart, Package, PackagePlus, PackageMinus, History, Truck, Receipt, Users, BarChart3, UserCog, ShieldCheck, ScrollText, Settings, Menu, Sun, Moon, LogOut, UtensilsCrossed } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useUI } from '../contexts/UIContext'

export const NAV = [
  { group: 'Overview', items: [{ to: '/', label: 'Dashboard', icon: LayoutDashboard, perm: 'dashboard.view' }] },
  { group: 'Money', items: [
    { to: '/cash-book', label: 'Cash Book', icon: BookOpen, mgr: true },
    { to: '/cash-in', label: 'Cash IN / Sales', icon: TrendingUp, mgr: true },
    { to: '/cash-out', label: 'Cash OUT / Purchases', icon: ShoppingCart, mgr: true },
    { to: '/suppliers', label: 'Suppliers', icon: Truck, mgr: true },
    { to: '/payments', label: 'Restaurant Payments', icon: Receipt, mgr: true },
    { to: '/staff-payments', label: 'Staff Payments', icon: Users, mgr: true }] },
  { group: 'Stock', items: [
    { to: '/inventory', label: 'Inventory', icon: Package, perm: 'inventory.view' },
    { to: '/stock-in', label: 'Stock IN', icon: PackagePlus, perm: 'stock.in' },
    { to: '/stock-out', label: 'Stock OUT', icon: PackageMinus, perm: 'stock.out' },
    { to: '/activity', label: 'Inventory Activity Log', icon: History, perm: 'inventory.activity' }] },
  { group: 'Manage', items: [
    { to: '/reports', label: 'Reports', icon: BarChart3, perm: 'inventory.reports' },
    { to: '/employees', label: 'Employee Management', icon: UserCog, mgr: true },
    { to: '/permissions', label: 'User Permissions', icon: ShieldCheck, mgr: true },
    { to: '/audit', label: 'Audit Logs', icon: ScrollText, mgr: true },
    { to: '/settings', label: 'Settings', icon: Settings }] },
]

export default function Layout() {
  const { can, isMgr, profile, role, business, signOut } = useAuth()
  const { dark, setDark } = useUI()
  const [open, setOpen] = useState(false)
  const show = (n) => (n.mgr ? isMgr : n.perm ? can(n.perm) : true)
  const initials = (profile?.full_name || '?').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()
  return (
    <div className="flex min-h-screen">
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-72 transform flex-col bg-[#0f1f1a] text-slate-300 shadow-xl transition-transform md:sticky md:top-0 md:h-screen md:translate-x-0 print:hidden ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center gap-3 px-5 py-5">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-brand-500 text-white"><UtensilsCrossed size={20} /></div>
          <div className="min-w-0"><div className="truncate font-semibold text-white">{business?.name || 'Restaurant'}</div><div className="text-xs capitalize text-emerald-200/60">{role} account</div></div>
        </div>
        <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-4">
          {NAV.map((g) => { const items = g.items.filter(show); if (!items.length) return null
            return <div key={g.group}><div className="mb-1 px-3 text-[11px] font-semibold text-emerald-200/40">{g.group}</div>
              {items.map(({ to, label, icon: Icon }) => (
                <NavLink key={to} to={to} end={to === '/'} onClick={() => setOpen(false)} className={({ isActive }) => `group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${isActive ? 'bg-white/10 font-semibold text-white shadow-[inset_3px_0_0_#34d399]' : 'hover:bg-white/5 hover:text-white'}`}><Icon size={18} className="opacity-80" />{label}</NavLink>))}</div> })}
        </nav>
        <div className="flex items-center gap-3 border-t border-white/10 p-4">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-emerald-700 text-xs font-bold text-white">{initials}</div>
          <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium text-white">{profile?.full_name}</div></div>
          <button onClick={() => setDark(!dark)} aria-label="Toggle theme" className="rounded-md p-1.5 hover:bg-white/10">{dark ? <Sun size={16} /> : <Moon size={16} />}</button>
          <button onClick={signOut} aria-label="Sign out" className="rounded-md p-1.5 hover:bg-white/10"><LogOut size={16} /></button>
        </div>
      </aside>
      {open && <div className="fixed inset-0 z-30 bg-black/50 md:hidden" onClick={() => setOpen(false)} />}
      <main className="min-w-0 flex-1">
        <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur md:hidden dark:border-white/10 dark:bg-[#0b1210]/90 print:hidden"><button onClick={() => setOpen(true)} aria-label="Menu" className="rounded-md p-1 hover:bg-slate-100"><Menu /></button><span className="font-semibold">{business?.name}</span></div>
        <Outlet />
      </main>
    </div>
  )
}
