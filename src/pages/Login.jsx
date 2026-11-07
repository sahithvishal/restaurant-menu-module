import { useState } from 'react'
import { supabase, rpc } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useLoad } from '../hooks/useLoad'
import { Field } from '../components/ui'
import { UtensilsCrossed } from 'lucide-react'

export default function Login() {
  const { session, profile, reload } = useAuth()
  const setup = useLoad(async () => { const { data } = await supabase.rpc('setup_needed'); return !!data }, [])
  const [mode, setMode] = useState('in')
  const [f, setF] = useState({ email: '', password: '', name: '', business: '' })
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false); const [info, setInfo] = useState('')
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  async function submit(e) {
    e.preventDefault(); setBusy(true); setErr(''); setInfo('')
    try {
      if (mode === 'in') { const { error } = await supabase.auth.signInWithPassword({ email: f.email, password: f.password }); if (error) throw error }
      else if (mode === 'setup') {
        const { data, error } = await supabase.auth.signUp({ email: f.email, password: f.password, options: { data: { full_name: f.name } } })
        if (error) throw error
        if (!data.session) { setInfo('Check your email to confirm the account, then sign in and finish setup.'); setMode('in'); return }
        await rpc('bootstrap_owner', { p_business: f.business, p_name: f.name }); await reload()
      } else if (mode === 'forgot') { const { error } = await supabase.auth.resetPasswordForEmail(f.email, { redirectTo: window.location.origin }); if (error) throw error; setInfo('Password reset email sent.') }
    } catch (x) { setErr(x.message) } finally { setBusy(false) }
  }
  async function finishSetup() { setBusy(true); try { await rpc('bootstrap_owner', { p_business: f.business, p_name: f.name || session.user.email }); await reload() } catch (x) { setErr(x.message) } finally { setBusy(false) } }

  // signed in but not yet set up (first owner after email confirmation)
  if (session && !profile && setup.data) return (
    <div className="grid min-h-screen place-items-center p-4"><div className="card w-full max-w-sm space-y-3"><h1 className="text-lg font-semibold">Finish setup</h1>
      <Field label="Restaurant name"><input className="inp" value={f.business} onChange={set('business')} /></Field>
      <Field label="Your name"><input className="inp" value={f.name} onChange={set('name')} /></Field>
      {err && <p className="text-sm text-red-600">{err}</p>}<button className="btn w-full" disabled={busy || !f.business} onClick={finishSetup}>Create restaurant</button></div></div>)
  if (session && !profile) return <div className="grid min-h-screen place-items-center p-4"><div className="card max-w-sm text-sm">Your account is not linked to a restaurant yet. Ask the Owner or Manager to add you.<button className="btn-ghost mt-3" onClick={() => supabase.auth.signOut()}>Sign out</button></div></div>

  return (
    <div className="grid min-h-screen md:grid-cols-2">
      <div className="hidden flex-col justify-between bg-[#0f1f1a] p-12 text-white md:flex">
        <div className="flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-xl bg-brand-500"><UtensilsCrossed size={22} /></div><span className="text-lg font-semibold">Restaurant Manager</span></div>
        <div><h2 className="max-w-md text-4xl font-bold leading-tight tracking-tight">Know your sales, stock and cash, every day.</h2><p className="mt-4 max-w-md text-emerald-100/70">Record sales, purchases and stock in a few taps. Your team works from any phone, and you see the full picture.</p></div>
        <p className="text-xs text-emerald-100/40">Secure sign-in. Every staff member has their own login.</p>
      </div>
      <div className="grid place-items-center p-6">
        <form onSubmit={submit} className="w-full max-w-sm space-y-4">
          <div><h1 className="text-2xl font-bold tracking-tight">{mode === 'setup' ? 'Set up your restaurant' : mode === 'forgot' ? 'Reset your password' : 'Welcome back'}</h1><p className="mt-1 text-sm text-slate-500">{mode === 'in' ? 'Sign in to continue.' : mode === 'setup' ? 'Create the Owner account. You can add staff afterwards.' : 'We will email you a reset link.'}</p></div>
          {mode === 'setup' && <><Field label="Restaurant name"><input required className="inp" value={f.business} onChange={set('business')} /></Field><Field label="Your name"><input required className="inp" value={f.name} onChange={set('name')} /></Field></>}
          <Field label="Email"><input required type="email" autoComplete="email" className="inp" value={f.email} onChange={set('email')} /></Field>
          {mode !== 'forgot' && <Field label="Password"><input required type="password" minLength={8} autoComplete={mode === 'in' ? 'current-password' : 'new-password'} className="inp" value={f.password} onChange={set('password')} /></Field>}
          {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}{info && <p className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700">{info}</p>}
          <button className="btn w-full py-2.5" disabled={busy}>{busy ? 'Please wait...' : mode === 'in' ? 'Sign in' : mode === 'setup' ? 'Create Owner account' : 'Send reset link'}</button>
          <div className="flex justify-between text-sm">
            <button type="button" className="text-brand-700 hover:underline" onClick={() => setMode(mode === 'forgot' ? 'in' : 'forgot')}>{mode === 'forgot' ? 'Back to sign in' : 'Forgot password?'}</button>
            {setup.data && mode !== 'setup' && <button type="button" className="text-brand-700 hover:underline" onClick={() => setMode('setup')}>First-time setup</button>}
          </div>
        </form>
      </div>
    </div>
  )
}
