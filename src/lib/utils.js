const TZ = 'Asia/Kolkata'
const p2 = (n) => String(n).padStart(2, '0')
export function istParts(d = new Date()) {
  const f = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  const o = Object.fromEntries(f.formatToParts(new Date(d)).map((x) => [x.type, x.value]))
  return o
}
export const nowLocalInput = () => { const o = istParts(); return `${o.year}-${o.month}-${o.day}T${o.hour}:${o.minute}` }
export const todayISO = () => nowLocalInput().slice(0, 10)
export const localInputToISO = (v) => (v ? new Date(`${v}:00+05:30`).toISOString() : new Date().toISOString())
export const fmtDate = (d) => { if (!d) return ''; const o = istParts(d); return `${o.day}-${o.month}-${o.year}` }
export const fmtTime = (d) => new Date(d).toLocaleTimeString('en-IN', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: true })
export const fmtDT = (d) => (d ? `${fmtDate(d)} ${fmtTime(d)}` : '')
export const money = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const num = (n, dp = 3) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: dp })
export const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random())

export function rangeFor(kind, anchor = todayISO(), custom = {}) {
  const t = anchor
  if (kind === 'daily') return { from: t, to: t }
  if (kind === 'weekly') return { from: addDays(t, -6), to: t }
  if (kind === 'monthly') { const [y, m] = t.split('-'); const last = new Date(Number(y), Number(m), 0).getDate(); return { from: `${y}-${m}-01`, to: `${y}-${m}-${p2(last)}` } }
  if (kind === 'quarterly') return { from: addDays(t, -91), to: t }
  if (kind === 'half') return { from: addDays(t, -182), to: t }
  return { from: custom.from || t, to: custom.to || t }
}
export const istDayStart = (iso) => new Date(`${iso}T00:00:00+05:30`).toISOString()
export const istDayEnd = (iso) => new Date(`${addDays(iso, 1)}T00:00:00+05:30`).toISOString()

// units: {CODE:{dimension,to_base,base_code}}
export const toBase = (qty, unit, units) => Number(qty) * Number(units[unit]?.to_base || 1)
export const fromBase = (base, unit, units) => Number(base) / Number(units[unit]?.to_base || 1)
export const compatible = (units, dimension) => Object.entries(units).filter(([, u]) => u.dimension === dimension).map(([c]) => c)
export function niceQty(base, item, units) {
  // show in display_unit, falling back to base unit
  const u = item.display_unit || item.base_unit
  return `${num(fromBase(base, u, units))} ${u}`
}
