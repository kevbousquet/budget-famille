import { useState, useEffect, useRef, useId } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { Plus, Trash2, Copy, Check, Users, Loader2, RefreshCw, LogOut, ChevronDown, ChevronUp, Archive, X } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Charge       { id: string; label: string; montant: number }
interface Transaction  { id: string; label: string; montant: number; date: string }

interface ArchivedMonth {
  mois: string
  transactions: Record<string, Transaction[]>
  totalRevenus: number
  totalCharges: number
  totalDepenses: number
  objectifEpargne: number
  epargneReelle: number
}

interface BudgetData {
  revenus:       { label1: string; montant1: number; label2: string; montant2: number }
  autresRevenus?: Charge[]
  charges:        Charge[]
  objectifEpargne: number
  depenses:       Record<string, number>        // legacy — migré automatiquement
  transactions:   Record<string, Transaction[]> // source de vérité
  history:        ArchivedMonth[]
  lastResetMonth: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORIES = [
  { id: 'courses',  emoji: '🛒', label: 'Courses',  pct: 0.46, color: '#34D399' },
  { id: 'loisirs',  emoji: '🎬', label: 'Loisirs',  pct: 0.25, color: '#60A5FA' },
  { id: 'shopping', emoji: '👕', label: 'Shopping', pct: 0.13, color: '#A78BFA' },
  { id: 'sante',    emoji: '💊', label: 'Santé',    pct: 0.08, color: '#2DD4BF' },
  { id: 'cadeaux',  emoji: '🎁', label: 'Imprévus', pct: 0.08, color: '#FB923C' },
] as const

const DEFAULT_CHARGES: Charge[] = [
  { id: 'c1',  label: 'Taxe foncière',              montant: 96 },
  { id: 'c2',  label: 'Crédit maison',               montant: 1039.81 },
  { id: 'c3',  label: 'Assurance crédit',            montant: 33.33 },
  { id: 'c4',  label: 'SFR (internet + téléphone)',  montant: 90 },
  { id: 'c5',  label: 'Électricité',                 montant: 120 },
  { id: 'c6',  label: 'Femme de ménage',             montant: 200 },
  { id: 'c7',  label: 'Eau (traitement)',             montant: 72.5 },
  { id: 'c8',  label: 'Essence',                     montant: 200 },
  { id: 'c9',  label: 'Assurance',                   montant: 109.76 },
  { id: 'c10', label: 'Crédit 2',                    montant: 180 },
  { id: 'c11', label: 'Cantine scolaire',            montant: 70 },
]

function currentMonth() { return new Date().toISOString().slice(0, 7) }

const DEFAULT_DATA: BudgetData = {
  revenus:        { label1: 'Mon prénom', montant1: 1800, label2: 'Prénom conjoint·e', montant2: 1500 },
  autresRevenus:  [],
  charges:        DEFAULT_CHARGES,
  objectifEpargne: 500,
  depenses:       {},
  transactions:   {},
  history:        [],
  lastResetMonth: currentMonth(),
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function monthLabel(m: string) {
  const [y, mo] = m.split('-')
  return new Date(+y, +mo - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
}

function txDate(iso: string) {
  const d = new Date(iso), now = new Date()
  const diff = Math.floor((now.setHours(0,0,0,0) - new Date(iso).setHours(0,0,0,0)) / 86400000)
  if (diff === 0) return "Auj."
  if (diff === 1) return "Hier"
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })
}

function fmt(n: number) {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}

function fmtShort(n: number) {
  const abs = Math.abs(n), sign = n < 0 ? '-' : ''
  if (abs >= 1000) return sign + (abs / 1000).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + 'k €'
  return sign + abs.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' €'
}

function generateCode() {
  const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let s = ''
  for (let i = 0; i < 8; i++) { if (i === 4) s += '-'; s += c[Math.floor(Math.random() * c.length)] }
  return s
}

function migrateData(raw: Record<string, unknown>): BudgetData {
  const base: BudgetData = { ...DEFAULT_DATA, ...(raw as Partial<BudgetData>) }
  // Migrate old depenses (Record<string,number>) → transactions
  if (!raw.transactions || Object.keys(raw.transactions as object).length === 0) {
    const t: Record<string, Transaction[]> = {}
    if (raw.depenses) {
      for (const [catId, amount] of Object.entries(raw.depenses as Record<string, number>)) {
        if (amount > 0) {
          t[catId] = [{ id: `migrated-${catId}`, label: 'Dépenses précédentes', montant: amount, date: new Date().toISOString() }]
        }
      }
    }
    base.transactions = t
  }
  if (!raw.history)        base.history = []
  if (!raw.lastResetMonth) base.lastResetMonth = currentMonth()
  return base
}

// ─── UI Atoms ─────────────────────────────────────────────────────────────────

function Num({ value, onChange, className = '' }: { value: number; onChange: (v: number) => void; className?: string }) {
  return (
    <input type="number" inputMode="decimal"
      value={value === 0 ? '' : value} placeholder="0"
      onChange={e => onChange(parseFloat(e.target.value) || 0)}
      className={`border border-slate-200 rounded-2xl px-3 py-2.5 text-right text-sm font-medium bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 transition ${className}`}
    />
  )
}

function Section({ title, icon, color, children, defaultOpen = true }: {
  title: string; icon: string; color: string; children: React.ReactNode; defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="bg-white rounded-3xl shadow-sm overflow-hidden">
      <button onClick={() => setOpen(v => !v)} className="w-full flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-3">
          <span className={`w-9 h-9 rounded-2xl flex items-center justify-center text-base ${color}`}>{icon}</span>
          <span className="font-bold text-slate-800 text-base">{title}</span>
        </div>
        {open ? <ChevronUp size={18} className="text-slate-400" /> : <ChevronDown size={18} className="text-slate-400" />}
      </button>
      {open && <div className="px-5 pb-5 space-y-3 border-t border-slate-50">{children}</div>}
    </div>
  )
}

// ─── Donut Chart ──────────────────────────────────────────────────────────────

interface ChartSeg { value: number; color: string; label: string }

function DonutChart({ segments, center }: { segments: ChartSeg[]; center: React.ReactNode }) {
  const R = 62, SW = 26, SZ = 190
  const C = 2 * Math.PI * R
  const total = segments.reduce((s, d) => s + Math.max(0, d.value), 0)
  if (total === 0) return null

  let cum = 0
  const slices = segments.filter(s => s.value > 0).map(s => {
    const pct = s.value / total
    const slice = { ...s, pct, dashOffset: C * (1 - cum) }
    cum += pct
    return slice
  })

  return (
    <svg viewBox={`0 0 ${SZ} ${SZ}`} className="w-full max-w-[190px] mx-auto">
      <g transform={`rotate(-90 ${SZ/2} ${SZ/2})`}>
        {slices.map((s, i) => (
          <circle key={i} cx={SZ/2} cy={SZ/2} r={R} fill="none"
            stroke={s.color} strokeWidth={SW}
            strokeDasharray={`${s.pct * C} ${C}`}
            strokeDashoffset={s.dashOffset}
          />
        ))}
      </g>
      <foreignObject x={SZ/2 - 44} y={SZ/2 - 28} width="88" height="56">
        <div className="flex flex-col items-center justify-center h-full text-center">
          {center}
        </div>
      </foreignObject>
    </svg>
  )
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

function AuthScreen() {
  const [tab,       setTab]       = useState<'login' | 'register'>('login')
  const [email,     setEmail]     = useState('')
  const [pass,      setPass]      = useState('')
  const [error,     setError]     = useState('')
  const [loading,   setLoading]   = useState(false)
  const [emailSent, setEmailSent] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError(''); setLoading(true)
    if (tab === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password: pass })
      setLoading(false)
      if (error) setError('Email ou mot de passe incorrect.')
    } else {
      const { error } = await supabase.auth.signUp({ email, password: pass })
      setLoading(false)
      if (error) setError(error.message)
      else setEmailSent(true)
    }
  }

  if (emailSent) return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-500 flex items-center justify-center p-5">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-8 text-center">
        <div className="w-16 h-16 bg-indigo-50 rounded-full flex items-center justify-center text-3xl mx-auto mb-4">📧</div>
        <h2 className="text-xl font-bold text-slate-800 mb-2">Vérifie ton email</h2>
        <p className="text-slate-500 text-sm mb-6 leading-relaxed">
          Un lien t'a été envoyé à <strong className="text-slate-700">{email}</strong>.<br />
          Clique dessus puis reviens te connecter.
        </p>
        <button onClick={() => { setEmailSent(false); setTab('login') }}
          className="w-full bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-bold py-3.5 rounded-2xl hover:opacity-90 transition">
          Aller à la connexion
        </button>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-500 flex flex-col items-center justify-center p-5">
      <div className="mb-8 text-center text-white">
        <div className="text-6xl mb-3">💰</div>
        <h1 className="text-3xl font-black tracking-tight">Budget Famille</h1>
        <p className="text-white/70 mt-1">Gérez votre budget ensemble</p>
      </div>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="flex">
          {(['login', 'register'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-4 text-sm font-bold transition-all ${tab === t ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-400'}`}>
              {t === 'login' ? 'Connexion' : 'Créer un compte'}
            </button>
          ))}
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Email</label>
            <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
              className="w-full border border-slate-200 rounded-2xl px-4 py-3 text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 transition" />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Mot de passe</label>
            <input type="password" required value={pass} onChange={e => setPass(e.target.value)}
              className="w-full border border-slate-200 rounded-2xl px-4 py-3 text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 transition" />
          </div>
          {error && <div className="bg-red-50 border border-red-100 rounded-2xl px-4 py-3 text-red-600 text-xs text-center">{error}</div>}
          <button type="submit" disabled={loading}
            className="w-full bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-bold py-3.5 rounded-2xl hover:opacity-90 transition disabled:opacity-60 flex items-center justify-center gap-2 mt-2">
            {loading && <Loader2 size={16} className="animate-spin" />}
            {tab === 'login' ? 'Se connecter' : 'Créer mon compte'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ─── Budget ───────────────────────────────────────────────────────────────────

function BudgetScreen({ session }: { session: Session }) {
  const uid = useId()
  const [foyerId,  setFoyerId]  = useState<string | null>(null)
  const [data,     setData]     = useState<BudgetData>(DEFAULT_DATA)
  const [loading,  setLoading]  = useState(true)
  const [syncing,  setSyncing]  = useState(false)
  const [lastSync, setLastSync] = useState<Date | null>(null)
  const [showNewMonthModal, setShowNewMonthModal] = useState(false)
  const skipSave  = useRef(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Supabase init ──────────────────────────────────────────────────────────
  useEffect(() => {
    ;(async () => {
      setLoading(true)
      const userId = session.user.id
      const { data: profile } = await supabase.from('profiles').select('budget_foyer_id').eq('id', userId).maybeSingle()
      let id: string = profile?.budget_foyer_id ?? ''
      if (!id) {
        id = generateCode()
        await supabase.from('budget_foyer').insert({ foyer_id: id, data: DEFAULT_DATA })
        await supabase.from('profiles').upsert(
          { id: userId, budget_foyer_id: id, prenom: '', sexe: 'homme', created_at: new Date().toISOString() },
          { onConflict: 'id' }
        )
      }
      const { data: foyer } = await supabase.from('budget_foyer').select('data').eq('foyer_id', id).single()
      if (foyer?.data && Object.keys(foyer.data).length > 0) {
        const migrated = migrateData(foyer.data as Record<string, unknown>)
        setData(migrated)
        // Détecter nouveau mois
        if (migrated.lastResetMonth !== currentMonth()) {
          const hasData = Object.values(migrated.transactions || {}).some(t => t.length > 0)
          if (hasData) setShowNewMonthModal(true)
        }
      }
      setFoyerId(id); setLoading(false)
    })()
  }, [session.user.id])

  // ── Realtime ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!foyerId) return
    const ch = supabase.channel(`budget-${foyerId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'budget_foyer', filter: `foyer_id=eq.${foyerId}` },
        p => { if (p.new?.data) { skipSave.current = true; setData(migrateData(p.new.data as Record<string, unknown>)); setLastSync(new Date()) } })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [foyerId])

  // ── Debounced save ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!foyerId || loading) return
    if (skipSave.current) { skipSave.current = false; return }
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      setSyncing(true)
      await supabase.from('budget_foyer').update({ data, updated_at: new Date().toISOString() }).eq('foyer_id', foyerId)
      setSyncing(false); setLastSync(new Date())
    }, 1200)
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
  }, [data, foyerId, loading])

  // ── Derived state ──────────────────────────────────────────────────────────
  const patch = (part: Partial<BudgetData>) => setData(p => ({ ...p, ...part }))
  const { revenus, autresRevenus = [], charges, objectifEpargne, transactions } = data

  const totalRevenus   = revenus.montant1 + revenus.montant2 + autresRevenus.reduce((s, r) => s + r.montant, 0)
  const totalCharges   = charges.reduce((s, c) => s + c.montant, 0)
  const budgetDispo    = totalRevenus - totalCharges
  const budgetFlex     = budgetDispo - objectifEpargne
  const catDeps        = Object.fromEntries(CATEGORIES.map(cat => [cat.id, (transactions[cat.id] || []).reduce((s, t) => s + t.montant, 0)]))
  const totalDep       = Object.values(catDeps).reduce((s, v) => s + v, 0)
  const resteTotal     = budgetFlex - totalDep
  const epargneReelle  = budgetDispo - totalDep
  const ecart          = epargneReelle - objectifEpargne
  const enTrack        = ecart >= 0
  const flexRatio      = budgetFlex > 0 ? Math.min(1, totalDep / budgetFlex) : 0

  const suggestionEpargne  = budgetDispo > 0 ? Math.round((budgetDispo * 0.20) / 10) * 10 : 0
  const suggestionOk       = suggestionEpargne > 0 && Math.abs(objectifEpargne - suggestionEpargne) / suggestionEpargne <= 0.1

  // ── Charges handlers ───────────────────────────────────────────────────────
  const modLabel   = (id: string, v: string) => patch({ charges: charges.map(c => c.id === id ? { ...c, label: v } : c) })
  const modMontant = (id: string, v: number) => patch({ charges: charges.map(c => c.id === id ? { ...c, montant: v } : c) })
  const supprimer  = (id: string) => patch({ charges: charges.filter(c => c.id !== id) })

  const [ajoutLabel,   setAjoutLabel]   = useState('')
  const [ajoutMontant, setAjoutMontant] = useState('')
  const [showAjout,    setShowAjout]    = useState(false)
  const ajouter = () => {
    if (!ajoutLabel.trim()) return
    patch({ charges: [...charges, { id: `${uid}-${Date.now()}`, label: ajoutLabel.trim(), montant: parseFloat(ajoutMontant) || 0 }] })
    setAjoutLabel(''); setAjoutMontant(''); setShowAjout(false)
  }

  // ── Revenus supplémentaires ────────────────────────────────────────────────
  const [ajoutRevLabel,   setAjoutRevLabel]   = useState('')
  const [ajoutRevMontant, setAjoutRevMontant] = useState('')
  const [showAjoutRev,    setShowAjoutRev]    = useState(false)
  const ajouterRevenu = () => {
    if (!ajoutRevLabel.trim()) return
    patch({ autresRevenus: [...autresRevenus, { id: `rev-${uid}-${Date.now()}`, label: ajoutRevLabel.trim(), montant: parseFloat(ajoutRevMontant) || 0 }] })
    setAjoutRevLabel(''); setAjoutRevMontant(''); setShowAjoutRev(false)
  }

  // ── Transactions ───────────────────────────────────────────────────────────
  const [activeCat,    setActiveCat]    = useState<string | null>(null)
  const [newTxLabel,   setNewTxLabel]   = useState('')
  const [newTxMontant, setNewTxMontant] = useState('')

  const addTransaction = (catId: string) => {
    if (!newTxMontant) return
    const tx: Transaction = {
      id: `tx-${uid}-${Date.now()}`,
      label: newTxLabel.trim() || 'Dépense',
      montant: parseFloat(newTxMontant) || 0,
      date: new Date().toISOString(),
    }
    patch({ transactions: { ...transactions, [catId]: [...(transactions[catId] || []), tx] } })
    setNewTxLabel(''); setNewTxMontant(''); setActiveCat(null)
  }

  const deleteTransaction = (catId: string, txId: string) => {
    patch({ transactions: { ...transactions, [catId]: (transactions[catId] || []).filter(t => t.id !== txId) } })
  }

  // ── Archivage mensuel ──────────────────────────────────────────────────────
  const archiveMonth = () => {
    const archived: ArchivedMonth = {
      mois:          data.lastResetMonth,
      transactions:  data.transactions || {},
      totalRevenus,
      totalCharges,
      totalDepenses: totalDep,
      objectifEpargne,
      epargneReelle,
    }
    patch({
      transactions:   {},
      depenses:       {},
      history:        [archived, ...(data.history || [])].slice(0, 12),
      lastResetMonth: currentMonth(),
    })
    setShowNewMonthModal(false)
  }

  // ── Code famille ───────────────────────────────────────────────────────────
  const [copied,      setCopied]      = useState(false)
  const [showJoin,    setShowJoin]    = useState(false)
  const [joinCode,    setJoinCode]    = useState('')
  const [joinError,   setJoinError]   = useState('')
  const [joinLoading, setJoinLoading] = useState(false)

  const copyCode = () => {
    if (!foyerId) return
    navigator.clipboard.writeText(foyerId).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
  }
  const joinFoyer = async () => {
    setJoinError(''); setJoinLoading(true)
    const clean = joinCode.trim().toUpperCase()
    const { data: foyer } = await supabase.from('budget_foyer').select('data').eq('foyer_id', clean).single()
    if (!foyer) { setJoinError('Code invalide.'); setJoinLoading(false); return }
    await supabase.from('profiles').update({ budget_foyer_id: clean }).eq('id', session.user.id)
    skipSave.current = true; setData(migrateData(foyer.data as Record<string, unknown>)); setFoyerId(clean)
    setShowJoin(false); setJoinCode(''); setJoinLoading(false)
  }

  // ── Chart segments ─────────────────────────────────────────────────────────
  const chartSegments = [
    { value: totalCharges,             color: '#F87171', label: 'Charges fixes' },
    { value: objectifEpargne,          color: '#FBBF24', label: 'Épargne' },
    ...CATEGORIES.map(cat => ({ value: catDeps[cat.id] ?? 0, color: cat.color, label: cat.label })),
    { value: Math.max(0, resteTotal),  color: '#CBD5E1', label: 'Reste' },
  ]
  const chartTotal = chartSegments.reduce((s, d) => s + Math.max(0, d.value), 0)

  if (loading) return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-500 flex items-center justify-center">
      <div className="text-center text-white"><div className="text-5xl mb-4">💰</div><Loader2 size={28} className="animate-spin mx-auto" /></div>
    </div>
  )

  return (
    <div className="min-h-screen bg-slate-100">

      {/* ── Modal nouveau mois ─────────────────────────────────────────────── */}
      {showNewMonthModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl">
            <div className="text-4xl text-center mb-3">🗓️</div>
            <h2 className="text-xl font-black text-slate-800 text-center mb-2">Nouveau mois !</h2>
            <p className="text-slate-500 text-sm text-center leading-relaxed mb-6">
              C'est <strong className="text-slate-700">{monthLabel(currentMonth())}</strong>.<br />
              Voulez-vous archiver <strong className="text-slate-700">{monthLabel(data.lastResetMonth)}</strong> et repartir à zéro ?
            </p>
            <div className="space-y-2">
              <button onClick={archiveMonth}
                className="w-full bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-bold py-3.5 rounded-2xl hover:opacity-90 transition flex items-center justify-center gap-2">
                <Archive size={16} /> Archiver et repartir à zéro
              </button>
              <button onClick={() => setShowNewMonthModal(false)}
                className="w-full bg-slate-100 hover:bg-slate-200 text-slate-600 font-medium py-3 rounded-2xl transition">
                Plus tard
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <div className="bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-500 px-5 pt-12 pb-20">
        <div className="flex items-center justify-between mb-8">
          <div>
            <p className="text-white/60 text-xs font-medium uppercase tracking-widest">Budget Famille</p>
            <h1 className="text-white text-xl font-black mt-0.5 capitalize">{monthLabel(currentMonth())}</h1>
          </div>
          <div className="flex items-center gap-2">
            {syncing ? <RefreshCw size={14} className="animate-spin text-white/60" /> : lastSync && <span className="text-white/50 text-xs">✓ synchro</span>}
            <button onClick={() => supabase.auth.signOut()} className="w-9 h-9 bg-white/10 hover:bg-white/20 rounded-2xl flex items-center justify-center transition">
              <LogOut size={16} className="text-white/70" />
            </button>
          </div>
        </div>
        <div className="text-center mb-6">
          <p className="text-white/60 text-sm mb-1">Reste à dépenser</p>
          <p className={`text-5xl font-black text-white ${resteTotal < 0 ? 'opacity-60' : ''}`}>
            {fmtShort(resteTotal)}
          </p>
          <p className="text-white/50 text-xs mt-1">sur {fmtShort(budgetFlex)} de budget flexible</p>
        </div>
        <div className="bg-white/20 rounded-full h-2.5 mb-4">
          <div className={`h-2.5 rounded-full transition-all ${resteTotal < 0 ? 'bg-red-400' : 'bg-white'}`}
            style={{ width: `${Math.min(100, flexRatio * 100)}%` }} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Revenus', value: totalRevenus, color: 'text-emerald-300' },
            { label: 'Charges', value: totalCharges, color: 'text-rose-300' },
            { label: 'Épargne', value: objectifEpargne, color: 'text-amber-300' },
          ].map(s => (
            <div key={s.label} className="bg-white/10 rounded-2xl p-3 text-center">
              <p className={`text-base font-black ${s.color}`}>{fmtShort(s.value)}</p>
              <p className="text-white/50 text-xs mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Content ───────────────────────────────────────────────────────── */}
      <div className="-mt-10 px-4 pb-10 space-y-4">

        {/* Code famille */}
        <div className="bg-white rounded-3xl shadow-sm p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-9 h-9 bg-indigo-50 rounded-2xl flex items-center justify-center"><Users size={16} className="text-indigo-500" /></div>
            <div>
              <p className="font-bold text-slate-800 text-sm">Budget partagé</p>
              <p className="text-slate-400 text-xs">Partage ce code avec ton/ta partenaire</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-indigo-50 border border-indigo-100 rounded-2xl px-4 py-3 font-mono text-lg font-black tracking-widest text-indigo-700 text-center">{foyerId}</div>
            <button onClick={copyCode} className={`w-12 h-12 rounded-2xl flex items-center justify-center transition font-bold ${copied ? 'bg-emerald-500 text-white' : 'bg-indigo-50 text-indigo-500 hover:bg-indigo-100'}`}>
              {copied ? <Check size={18} /> : <Copy size={18} />}
            </button>
          </div>
          {!showJoin
            ? <button onClick={() => setShowJoin(true)} className="w-full mt-3 text-indigo-400 hover:text-indigo-600 text-xs font-medium text-center transition">Rejoindre le budget d'un·e partenaire →</button>
            : <div className="mt-3 space-y-2">
                <input type="text" placeholder="Code partenaire" value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase())} onKeyDown={e => e.key === 'Enter' && joinFoyer()}
                  className="w-full border border-slate-200 rounded-2xl px-4 py-2.5 text-sm font-mono uppercase bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                {joinError && <p className="text-rose-500 text-xs text-center">{joinError}</p>}
                <div className="flex gap-2">
                  <button onClick={joinFoyer} disabled={joinLoading || !joinCode}
                    className="flex-1 bg-indigo-500 text-white font-bold rounded-2xl py-2.5 text-sm hover:bg-indigo-600 transition disabled:opacity-50">
                    {joinLoading ? <Loader2 size={14} className="animate-spin mx-auto" /> : 'Rejoindre'}
                  </button>
                  <button onClick={() => { setShowJoin(false); setJoinCode(''); setJoinError('') }}
                    className="px-4 bg-slate-100 hover:bg-slate-200 rounded-2xl py-2.5 text-sm text-slate-600 transition">Annuler</button>
                </div>
              </div>
          }
        </div>

        {/* Revenus */}
        <Section title="Revenus" icon="💳" color="bg-emerald-50 text-emerald-600">
          <div className="pt-3 space-y-2">
            {[
              { label: revenus.label1, montant: revenus.montant1, onLabel: (v: string) => patch({ revenus: { ...revenus, label1: v } }), onMontant: (v: number) => patch({ revenus: { ...revenus, montant1: v } }) },
              { label: revenus.label2, montant: revenus.montant2, onLabel: (v: string) => patch({ revenus: { ...revenus, label2: v } }), onMontant: (v: number) => patch({ revenus: { ...revenus, montant2: v } }) },
            ].map((r, i) => (
              <div key={i} className="flex items-center gap-2">
                <input type="text" value={r.label} placeholder="Prénom…" onChange={e => r.onLabel(e.target.value)}
                  className="flex-1 border border-slate-200 rounded-2xl px-3 py-2.5 text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 transition font-medium" />
                <Num value={r.montant} className="w-28" onChange={r.onMontant} />
                <span className="text-slate-400 text-sm shrink-0">€</span>
              </div>
            ))}
            {autresRevenus.length > 0 && (
              <div className="border-t border-dashed border-slate-200 pt-2 space-y-2">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider px-1">Autres rentrées</p>
                {autresRevenus.map(r => (
                  <div key={r.id} className="flex items-center gap-2">
                    <input type="text" value={r.label} onChange={e => patch({ autresRevenus: autresRevenus.map(x => x.id === r.id ? { ...x, label: e.target.value } : x) })}
                      className="flex-1 min-w-0 border border-slate-200 rounded-2xl px-3 py-2.5 text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 transition" />
                    <Num value={r.montant} className="w-24" onChange={v => patch({ autresRevenus: autresRevenus.map(x => x.id === r.id ? { ...x, montant: v } : x) })} />
                    <span className="text-slate-400 text-sm shrink-0">€</span>
                    <button onClick={() => patch({ autresRevenus: autresRevenus.filter(x => x.id !== r.id) })}
                      className="w-9 h-9 shrink-0 flex items-center justify-center rounded-xl text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition"><Trash2 size={15} /></button>
                  </div>
                ))}
              </div>
            )}
            {showAjoutRev && (
              <div className="flex items-center gap-2 pt-2 border-t border-dashed border-slate-200">
                <input type="text" placeholder="Ex : Loyer perçu, APL…" value={ajoutRevLabel} autoFocus
                  onChange={e => setAjoutRevLabel(e.target.value)} onKeyDown={e => e.key === 'Enter' && ajouterRevenu()}
                  className="flex-1 min-w-0 border border-emerald-300 rounded-2xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                <input type="number" inputMode="decimal" placeholder="0" value={ajoutRevMontant}
                  onChange={e => setAjoutRevMontant(e.target.value)} onKeyDown={e => e.key === 'Enter' && ajouterRevenu()}
                  className="w-24 border border-emerald-300 rounded-2xl px-3 py-2.5 text-right text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                <button onClick={ajouterRevenu} className="w-9 h-9 shrink-0 bg-emerald-500 text-white rounded-2xl flex items-center justify-center hover:bg-emerald-600 transition"><Check size={16} /></button>
              </div>
            )}
            <button onClick={() => setShowAjoutRev(v => !v)}
              className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-slate-200 rounded-2xl py-3 text-slate-400 hover:border-emerald-300 hover:text-emerald-500 transition text-sm font-medium">
              <Plus size={15} /> Ajouter une rentrée d'argent
            </button>
            <div className="flex items-center justify-between bg-emerald-50 rounded-2xl px-4 py-3 mt-1">
              <span className="text-emerald-700 font-bold text-sm">Total revenus</span>
              <span className="text-emerald-600 font-black text-lg">{fmt(totalRevenus)}</span>
            </div>
          </div>
        </Section>

        {/* Charges */}
        <Section title="Charges fixes" icon="🏠" color="bg-rose-50 text-rose-500" defaultOpen={false}>
          <div className="pt-3 space-y-2">
            {charges.map(c => (
              <div key={c.id} className="flex items-center gap-2">
                <input type="text" value={c.label} onChange={e => modLabel(c.id, e.target.value)}
                  className="flex-1 min-w-0 border border-slate-200 rounded-2xl px-3 py-2.5 text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 transition" />
                <Num value={c.montant} className="w-24" onChange={v => modMontant(c.id, v)} />
                <span className="text-slate-400 text-sm shrink-0">€</span>
                <button onClick={() => supprimer(c.id)} className="w-9 h-9 shrink-0 flex items-center justify-center rounded-xl text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition"><Trash2 size={15} /></button>
              </div>
            ))}
            {showAjout && (
              <div className="flex items-center gap-2 pt-2 border-t border-dashed border-slate-200">
                <input type="text" placeholder="Nom de la charge…" value={ajoutLabel} autoFocus
                  onChange={e => setAjoutLabel(e.target.value)} onKeyDown={e => e.key === 'Enter' && ajouter()}
                  className="flex-1 min-w-0 border border-indigo-300 rounded-2xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                <input type="number" inputMode="decimal" placeholder="0" value={ajoutMontant}
                  onChange={e => setAjoutMontant(e.target.value)} onKeyDown={e => e.key === 'Enter' && ajouter()}
                  className="w-24 border border-indigo-300 rounded-2xl px-3 py-2.5 text-right text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                <button onClick={ajouter} className="w-9 h-9 shrink-0 bg-indigo-500 text-white rounded-2xl flex items-center justify-center hover:bg-indigo-600 transition"><Check size={16} /></button>
              </div>
            )}
            <button onClick={() => setShowAjout(v => !v)}
              className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-slate-200 rounded-2xl py-3 text-slate-400 hover:border-indigo-300 hover:text-indigo-400 transition text-sm font-medium">
              <Plus size={15} /> Ajouter une charge
            </button>
            <div className="flex items-center justify-between bg-rose-50 rounded-2xl px-4 py-3">
              <span className="text-rose-700 font-bold text-sm">Total charges</span>
              <span className="text-rose-500 font-black text-lg">{fmt(totalCharges)}</span>
            </div>
          </div>
        </Section>

        {/* Épargne */}
        <div className="bg-white rounded-3xl shadow-sm p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="w-9 h-9 bg-amber-50 rounded-2xl flex items-center justify-center text-base">🏦</span>
              <div>
                <p className="font-bold text-slate-800 text-sm">Objectif épargne</p>
                <p className="text-slate-400 text-xs">Mis de côté chaque mois</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <Num value={objectifEpargne} className="w-24" onChange={v => patch({ objectifEpargne: v })} />
              <span className="text-slate-400 text-sm">€</span>
            </div>
          </div>
          {budgetDispo <= 0 ? (
            <div className="bg-rose-50 border border-rose-100 rounded-2xl px-4 py-3">
              <p className="text-rose-600 text-xs font-bold">⚠️ Impossible d'épargner</p>
              <p className="text-rose-500 text-xs mt-0.5">Vos charges dépassent vos revenus. Réduisez vos charges fixes d'abord.</p>
            </div>
          ) : suggestionOk ? (
            <div className="bg-emerald-50 border border-emerald-100 rounded-2xl px-4 py-3 flex items-center gap-3">
              <span className="text-xl">✅</span>
              <div>
                <p className="text-emerald-700 text-xs font-bold">Objectif réaliste</p>
                <p className="text-emerald-600 text-xs mt-0.5">Vos {fmt(objectifEpargne)} ≈ 20% du disponible — règle recommandée.</p>
              </div>
            </div>
          ) : (
            <div className="bg-amber-50 border border-amber-100 rounded-2xl px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2">
                  <span className="text-lg mt-0.5">💡</span>
                  <div>
                    <p className="text-amber-700 text-xs font-bold">Suggestion</p>
                    <p className="text-amber-600 text-xs mt-0.5 leading-relaxed">
                      Avec {fmt(budgetDispo)} disponible, épargner <strong>{fmt(suggestionEpargne)}/mois</strong> (20%) serait réaliste.
                      {objectifEpargne > suggestionEpargne && <span className="block mt-0.5 text-amber-500">Votre objectif est peut-être trop ambitieux.</span>}
                      {objectifEpargne < suggestionEpargne && <span className="block mt-0.5 text-amber-500">Vous pouvez viser plus haut.</span>}
                    </p>
                  </div>
                </div>
                <button onClick={() => patch({ objectifEpargne: suggestionEpargne })}
                  className="shrink-0 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold px-3 py-2 rounded-xl transition">
                  Appliquer
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Budget flexible */}
        <div className={`rounded-3xl p-5 ${budgetFlex >= 0 ? 'bg-indigo-600' : 'bg-rose-600'}`}>
          <p className="text-white/70 text-xs font-medium uppercase tracking-widest mb-1">Budget flexible</p>
          <p className="text-white text-4xl font-black">{fmt(budgetFlex)}</p>
          <p className="text-white/50 text-xs mt-1">à distribuer entre vos dépenses du mois</p>
        </div>

        {/* Graphique répartition */}
        <Section title="Répartition du budget" icon="📊" color="bg-indigo-50 text-indigo-500">
          <div className="pt-4">
            <DonutChart
              segments={chartSegments}
              center={
                <>
                  <p className="text-slate-800 font-black text-base leading-tight">{fmtShort(resteTotal)}</p>
                  <p className="text-slate-400 text-xs">restant</p>
                </>
              }
            />
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 mt-5">
              {chartSegments.filter(s => s.value > 0).map(s => (
                <div key={s.label} className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                  <span className="text-xs text-slate-500 truncate">{s.label}</span>
                  <span className="text-xs font-bold text-slate-700 ml-auto shrink-0">
                    {chartTotal > 0 ? Math.round(s.value / chartTotal * 100) : 0}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Section>

        {/* Dépenses par catégorie */}
        <Section title="Dépenses du mois" icon="🎯" color="bg-purple-50 text-purple-600">
          <div className="pt-3 space-y-3">
            {CATEGORIES.map(cat => {
              const seuil    = budgetFlex * cat.pct
              const dep      = catDeps[cat.id] ?? 0
              const reste    = seuil - dep
              const ratio    = seuil > 0 ? Math.min(1, dep / seuil) : dep > 0 ? 1 : 0
              const isOver   = dep > seuil
              const isWarn   = !isOver && seuil > 0 && dep / seuil >= 0.8
              const barColor = isOver ? '#F87171' : isWarn ? '#FBBF24' : cat.color
              const bgClass  = isOver ? 'bg-rose-50 border-rose-100' : isWarn ? 'bg-amber-50 border-amber-100' : 'bg-slate-50 border-slate-100'
              const catTxs   = transactions[cat.id] || []
              const isOpen   = activeCat === cat.id

              return (
                <div key={cat.id} className={`border rounded-2xl p-4 ${bgClass}`}>
                  {/* Header */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{cat.emoji}</span>
                      <span className="font-semibold text-slate-700 text-sm">{cat.label}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-white/80 text-slate-500">{(cat.pct * 100).toFixed(0)}%</span>
                      <span className="text-slate-400 text-xs">{fmt(seuil)}</span>
                    </div>
                  </div>

                  {/* Barre */}
                  <div className="bg-white/70 rounded-full h-2 mb-3 overflow-hidden">
                    <div className="h-2 rounded-full transition-all duration-500" style={{ width: `${ratio * 100}%`, backgroundColor: barColor }} />
                  </div>

                  {/* Journal de transactions */}
                  {catTxs.length > 0 && (
                    <div className="space-y-1.5 mb-3">
                      {[...catTxs].reverse().map(tx => (
                        <div key={tx.id} className="flex items-center justify-between bg-white/70 rounded-xl px-3 py-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-slate-400 text-xs shrink-0">{txDate(tx.date)}</span>
                            <span className="text-slate-600 text-xs truncate">{tx.label}</span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="font-bold text-sm text-slate-800">{fmt(tx.montant)}</span>
                            <button onClick={() => deleteTransaction(cat.id, tx.id)}
                              className="w-5 h-5 flex items-center justify-center rounded-lg text-slate-300 hover:text-rose-500 transition">
                              <X size={12} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Formulaire ajout / footer */}
                  {isOpen ? (
                    <div className="flex items-center gap-2 bg-white/80 rounded-xl p-2">
                      <input type="text" placeholder="Description…" value={newTxLabel} autoFocus
                        onChange={e => setNewTxLabel(e.target.value)} onKeyDown={e => e.key === 'Enter' && addTransaction(cat.id)}
                        className="flex-1 min-w-0 bg-transparent text-sm outline-none placeholder-slate-400" />
                      <input type="number" inputMode="decimal" placeholder="0 €" value={newTxMontant}
                        onChange={e => setNewTxMontant(e.target.value)} onKeyDown={e => e.key === 'Enter' && addTransaction(cat.id)}
                        className="w-20 bg-transparent text-right text-sm font-bold outline-none placeholder-slate-400" />
                      <button onClick={() => addTransaction(cat.id)}
                        className="w-7 h-7 bg-indigo-500 text-white rounded-lg flex items-center justify-center hover:bg-indigo-600 transition">
                        <Check size={14} />
                      </button>
                      <button onClick={() => { setActiveCat(null); setNewTxLabel(''); setNewTxMontant('') }}
                        className="w-7 h-7 text-slate-400 flex items-center justify-center rounded-lg hover:bg-slate-100 transition">
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <button onClick={() => { setActiveCat(cat.id); setNewTxLabel(''); setNewTxMontant('') }}
                        className="flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-indigo-500 transition">
                        <Plus size={13} /> Ajouter
                      </button>
                      <div>
                        <span className="text-xs text-slate-400">Dépensé </span>
                        <span className="font-black text-sm" style={{ color: barColor }}>{fmt(dep)}</span>
                        <span className="text-xs text-slate-300 mx-1">·</span>
                        <span className="text-xs text-slate-400">Reste </span>
                        <span className={`font-bold text-sm ${isOver ? 'text-rose-500' : 'text-slate-700'}`}>
                          {isOver ? `−${fmt(Math.abs(reste))}` : fmt(reste)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </Section>

        {/* Résumé */}
        <div className={`rounded-3xl p-5 ${enTrack ? 'bg-emerald-500' : 'bg-amber-500'}`}>
          <p className="text-white font-black text-lg mb-4">{enTrack ? '✅ Vous êtes en track !' : '⚠️ Épargne en retard'}</p>
          <div className="space-y-2">
            {[
              { label: 'Total dépensé',    value: totalDep,       color: 'text-white/90' },
              { label: 'Reste à dépenser', value: resteTotal,     color: 'text-white' },
              { label: 'Épargne réelle',   value: epargneReelle,  color: 'text-white' },
              { label: 'Écart vs objectif', value: ecart,         color: ecart >= 0 ? 'text-white' : 'text-white/60' },
            ].map(s => (
              <div key={s.label} className="flex items-center justify-between">
                <span className="text-white/70 text-sm">{s.label}</span>
                <span className={`font-black text-sm ${s.color}`}>
                  {s.label.includes('Écart') && ecart > 0 ? '+' : ''}{fmt(s.value)}
                </span>
              </div>
            ))}
          </div>
          <button onClick={() => setShowNewMonthModal(true)}
            className="mt-4 w-full flex items-center justify-center gap-2 bg-white/20 hover:bg-white/30 text-white font-bold py-3 rounded-2xl transition text-sm">
            <Archive size={15} /> Archiver ce mois
          </button>
        </div>

        {/* Historique */}
        {data.history && data.history.length > 0 && (
          <Section title="Mois précédents" icon="📅" color="bg-slate-100 text-slate-500" defaultOpen={false}>
            <div className="pt-3 space-y-3">
              {data.history.map(m => {
                const ok = m.epargneReelle >= m.objectifEpargne
                const mBudgetFlex = m.totalRevenus - m.totalCharges - m.objectifEpargne
                return (
                  <div key={m.mois} className="bg-slate-50 border border-slate-100 rounded-2xl p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-bold text-slate-700 capitalize text-sm">{monthLabel(m.mois)}</span>
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${ok ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-600'}`}>
                        {ok ? '✓ En track' : '✗ Dépassé'}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center mb-3">
                      {[
                        { label: 'Revenus',  value: m.totalRevenus,   color: 'text-emerald-600' },
                        { label: 'Dépensé',  value: m.totalDepenses,  color: 'text-slate-700' },
                        { label: 'Épargné',  value: m.epargneReelle,  color: ok ? 'text-emerald-600' : 'text-rose-500' },
                      ].map(s => (
                        <div key={s.label}>
                          <p className={`font-black text-sm ${s.color}`}>{fmtShort(s.value)}</p>
                          <p className="text-slate-400 text-xs">{s.label}</p>
                        </div>
                      ))}
                    </div>
                    <div className="space-y-1.5">
                      {CATEGORIES.map(cat => {
                        const catDep = (m.transactions[cat.id] || []).reduce((s, t) => s + t.montant, 0)
                        if (catDep === 0) return null
                        const budget = mBudgetFlex * cat.pct
                        const ratio  = budget > 0 ? Math.min(1, catDep / budget) : 0
                        return (
                          <div key={cat.id} className="flex items-center gap-2">
                            <span className="text-xs text-slate-500 w-16 shrink-0 truncate">{cat.label}</span>
                            <div className="flex-1 bg-slate-200 rounded-full h-1.5 overflow-hidden">
                              <div className="h-1.5 rounded-full" style={{ width: `${ratio * 100}%`, backgroundColor: cat.color }} />
                            </div>
                            <span className="text-xs font-bold text-slate-600 w-14 text-right shrink-0">{fmtShort(catDep)}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </Section>
        )}

        <button onClick={() => { if (!confirm('Remettre toutes les dépenses à zéro ?')) return; patch({ transactions: {}, depenses: {} }) }}
          className="w-full text-center text-xs text-slate-400 hover:text-rose-400 py-3 transition font-medium">
          Remettre les dépenses à zéro (sans archiver)
        </button>
      </div>
    </div>
  )
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function App() {
  const [session,  setSession]  = useState<Session | null>(null)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setChecking(false) })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => subscription.unsubscribe()
  }, [])

  if (checking) return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-500 flex items-center justify-center">
      <Loader2 size={40} className="animate-spin text-white" />
    </div>
  )

  return session ? <BudgetScreen session={session} /> : <AuthScreen />
}
