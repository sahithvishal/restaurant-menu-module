import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase, configured } from '../lib/supabase'

const Ctx = createContext(null)
export const useAuth = () => useContext(Ctx)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [state, setState] = useState({ loading: true, profile: null, role: null, perms: new Set(), business: null, units: {} })

  const load = useCallback(async (s) => {
    if (!s) return setState({ loading: false, profile: null, role: null, perms: new Set(), business: null, units: {} })
    const uid = s.user.id
    const [{ data: profile }, { data: role }, { data: perms }, { data: units }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', uid).maybeSingle(),
      supabase.from('user_roles').select('role').eq('user_id', uid).maybeSingle(),
      supabase.from('employee_permissions').select('permission').eq('user_id', uid),
      supabase.from('measurement_units').select('*'),
    ])
    let business = null
    if (profile?.business_id) business = (await supabase.from('businesses').select('*').eq('id', profile.business_id).maybeSingle()).data
    const um = Object.fromEntries((units || []).map((u) => [u.code, u]))
    setState({ loading: false, profile, role: role?.role || null, perms: new Set((perms || []).map((p) => p.permission)), business, units: um })
  }, [])

  useEffect(() => {
    if (!configured) return setState((s) => ({ ...s, loading: false }))
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); load(data.session) })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => { setSession(s); load(s) })
    return () => sub.subscription.unsubscribe()
  }, [load])

  const isMgr = state.role === 'owner' || state.role === 'manager'
  const can = (p) => state.profile?.active !== false && (isMgr || state.perms.has(p))
  const value = { session, ...state, isMgr, isOwner: state.role === 'owner', can, reload: () => load(session), signOut: () => supabase.auth.signOut() }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
