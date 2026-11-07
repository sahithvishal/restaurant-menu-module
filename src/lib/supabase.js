import { createClient } from '@supabase/supabase-js'
const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY
export const configured = Boolean(url && key)
export const supabase = createClient(url || 'http://localhost', key || 'missing', { auth: { persistSession: true, autoRefreshToken: true } })

// Throws on error so callers never show success before Supabase confirms.
export async function rpc(fn, args) {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw new Error(error.message)
  return data
}
export async function q(promise) {
  const { data, error } = await promise
  if (error) throw new Error(error.message)
  return data
}
