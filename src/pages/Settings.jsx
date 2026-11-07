import { useState } from 'react'
import { supabase, q } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useUI } from '../contexts/UIContext'
import { useSaver } from '../hooks/useSaver'
import { Page, Field } from '../components/ui'

export default function Settings() {
  const { business, isOwner, profile, reload } = useAuth(); const { dark, setDark } = useUI()
  const [name, setName] = useState(business?.name || ''); const [pw, setPw] = useState(''); const a = useSaver(); const b = useSaver()
  return <Page title="Settings"><div className="grid gap-4 md:grid-cols-2">
    <div className="card space-y-3"><h3 className="font-semibold">Appearance</h3><label className="flex items-center gap-3 text-sm"><input type="checkbox" className="h-4 w-4 accent-[#188257]" checked={dark} onChange={(e) => setDark(e.target.checked)} />Dark mode</label></div>
    <div className="card space-y-3"><h3 className="font-semibold">Change my password</h3><Field label="New password"><input type="password" minLength={8} className="inp" value={pw} onChange={(e) => setPw(e.target.value)} /></Field><button className="btn" disabled={pw.length < 8} onClick={() => b.run(async () => { const { error } = await supabase.auth.updateUser({ password: pw }); if (error) throw error; setPw('') }, 'Password changed')}>Change password</button></div>
    {isOwner && <div className="card space-y-3"><h3 className="font-semibold">Restaurant</h3><Field label="Restaurant name"><input className="inp" value={name} onChange={(e) => setName(e.target.value)} /></Field><button className="btn" onClick={() => a.run(async () => { await q(supabase.from('businesses').update({ name }).eq('id', profile.business_id)); await reload() }, 'Saved')}>Save</button></div>}
  </div></Page>
}
