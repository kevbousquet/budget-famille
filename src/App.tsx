import { useState, useEffect, useRef, useId } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { Plus, Trash2, Copy, Check, Users, Loader2, RefreshCw, LogOut } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Charge { id: string; label: string; montant: number }

interface BudgetData {
  revenus: { monSalaire: number; salaireFemme: number }
  charges: Charge[]
  objectifEpargne: number
  depenses: Record<string, number>
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORIES = [
  { id: 'courses',  emoji: '🛒', label: 'Courses alimentaires', pct: 0.46 },
  { id: 'loisirs',  emoji: '🎬', label: 'Loisirs / restaurants',  pct: 0.25 },
  { id: 'shopping', emoji: '👕', label: 'Shopping / vêtements',   pct: 0.13 },
  { id: 'sante',    emoji: '💊', label: 'Santé / médecin',        pct: 0.08 },
  { id: 'cadeaux',  emoji: '🎁', label: 'Cadeaux / imprévus',     pct: 0.08 },
] as const

const DEFAULT_CHARGES: Charge[] = [
  { id: 'c1',  label: 'Taxe foncière',             montant: 96 },
  { id: 'c2',  label: 'Crédit maison',              montant: 1039.81 },
  { id: 'c3',  label: 'Assurance crédit',           montant: 33.33 },
  { id: 'c4',  label: 'SFR (internet + téléphone)', montant: 90 },
  { id: 'c5',  label: 'Électricité',                montant: 120 },
  { id: 'c6',  label: 'Femme de ménage',            montant: 200 },
  { id: 'c7',  label: 'Eau (traitement)',            montant: 72.5 },
  { id: 'c8',  label: 'Essence',                    montant: 200 },
  { id: 'c9',  label: 'Assurance',                  montant: 109.76 },
  { id: 'c10', label: 'Crédit 2',                   montant: 180 },
  { id: 'c11', label: 'Cantine scolaire',           montant: 70 },
]

const DEFAULT_DATA: BudgetData = {
  revenus: { monSalaire: 1800, salaireFemme: 1500 },
  charges: DEFAULT_CHARGES,
  objectifEpargne: 500,
  depenses: {},
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}

function generateCode() {
  const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let s = ''
  for (let i = 0; i < 8; i++) {
    if (i === 4) s += '-'
    s += c[Math.floor(Math.random() * c.length)]
  }
  return s
}

// ─── Small UI helpers ─────────────────────────────────────────────────────────

function Num({ value, onChange, className = '' }: { value: number; onChange: (v: number) => void; className?: string }) {
  return (
    <input type="number" inputMode="decimal"
      value={value === 0 ? '' : value} placeholder="0"
      onChange={e => onChange(parseFloat(e.target.value) || 0)}
      className={`border border-slate-200 rounded-xl px-3 py-2 text-right text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-300 ${className}`}
    />
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm text-slate-600 flex-1">{label}</span>
      <div className="flex items-center gap-1 shrink-0">{children}</div>
    </div>
  )
}

// ─── AUTH SCREEN ──────────────────────────────────────────────────────────────

function AuthScreen() {
  const [tab,       setTab]       = useState<'login' | 'register'>('login')
  const [email,     setEmail]     = useState('')
  const [pass,      setPass]      = useState('')
  const [error,     setError]     = useState('')
  const [loading,   setLoading]   = useState(false)
  const [emailSent, setEmailSent] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setLoading(true)
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
    <div className="min-h-screen bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-8 text-center">
        <div className="text-5xl mb-4">📧</div>
        <h2 className="text-xl font-bold text-slate-800 mb-2">Vérifie ton email</h2>
        <p className="text-slate-500 text-sm mb-6">
          Un lien de confirmation a été envoyé à <strong>{email}</strong>.<br />
          Clique dessus pour activer ton compte, puis reviens te connecter.
        </p>
        <button onClick={() => { setEmailSent(false); setTab('login') }}
          className="w-full bg-gradient-to-r from-blue-500 to-violet-600 text-white font-bold py-3 rounded-xl hover:opacity-90 transition">
          Aller à la connexion
        </button>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-8">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">💰</div>
          <h1 className="text-2xl font-bold text-slate-800">Budget Famille</h1>
          <p className="text-slate-500 text-sm mt-1">Gérez votre budget à deux</p>
        </div>

        <div className="flex bg-slate-100 rounded-xl p-1 mb-6">
          {(['login', 'register'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all
                ${tab === t ? 'bg-white shadow text-slate-800' : 'text-slate-500'}`}>
              {t === 'login' ? 'Connexion' : 'Créer un compte'}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Email</label>
            <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
              className="w-full mt-1 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Mot de passe</label>
            <input type="password" required value={pass} onChange={e => setPass(e.target.value)}
              className="w-full mt-1 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
          </div>
          {error && <p className="text-red-500 text-xs text-center">{error}</p>}
          <button type="submit" disabled={loading}
            className="w-full bg-gradient-to-r from-blue-500 to-violet-600 text-white font-bold py-3 rounded-xl
                       hover:opacity-90 transition disabled:opacity-60 flex items-center justify-center gap-2">
            {loading && <Loader2 size={16} className="animate-spin" />}
            {tab === 'login' ? 'Se connecter' : 'Créer mon compte'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ─── BUDGET SCREEN ────────────────────────────────────────────────────────────

function BudgetScreen({ session }: { session: Session }) {
  const uid = useId()

  const [foyerId,  setFoyerId]  = useState<string | null>(null)
  const [data,     setData]     = useState<BudgetData>(DEFAULT_DATA)
  const [loading,  setLoading]  = useState(true)
  const [syncing,  setSyncing]  = useState(false)
  const [lastSync, setLastSync] = useState<Date | null>(null)

  const skipSave  = useRef(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Chargement initial ──────────────────────────────────────────────────────
  useEffect(() => {
    ;(async () => {
      setLoading(true)
      const userId = session.user.id

      // Chercher le foyer_id dans le profil
      const { data: profile } = await supabase
        .from('profiles').select('budget_foyer_id').eq('id', userId).maybeSingle()

      let id: string = profile?.budget_foyer_id ?? ''

      if (!id) {
        // Créer un nouveau foyer
        id = generateCode()
        await supabase.from('budget_foyer').insert({ foyer_id: id, data: DEFAULT_DATA })
        // Upsert profil minimal
        await supabase.from('profiles').upsert(
          { id: userId, budget_foyer_id: id, prenom: '', sexe: 'homme', created_at: new Date().toISOString() },
          { onConflict: 'id' }
        )
      }

      const { data: foyer } = await supabase
        .from('budget_foyer').select('data').eq('foyer_id', id).single()

      if (foyer?.data && Object.keys(foyer.data).length > 0) {
        setData(foyer.data as BudgetData)
      }
      setFoyerId(id)
      setLoading(false)
    })()
  }, [session.user.id])

  // ── Realtime ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!foyerId) return
    const ch = supabase.channel(`budget-${foyerId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'budget_foyer', filter: `foyer_id=eq.${foyerId}` },
        payload => {
          if (payload.new?.data) {
            skipSave.current = true
            setData(payload.new.data as BudgetData)
            setLastSync(new Date())
          }
        })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [foyerId])

  // ── Sauvegarde debounced ────────────────────────────────────────────────────
  useEffect(() => {
    if (!foyerId || loading) return
    if (skipSave.current) { skipSave.current = false; return }
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      setSyncing(true)
      await supabase.from('budget_foyer')
        .update({ data, updated_at: new Date().toISOString() })
        .eq('foyer_id', foyerId)
      setSyncing(false)
      setLastSync(new Date())
    }, 1200)
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
  }, [data, foyerId, loading])

  // ── Patch helper ────────────────────────────────────────────────────────────
  const patch = (part: Partial<BudgetData>) => setData(p => ({ ...p, ...part }))
  const { revenus, charges, objectifEpargne, depenses } = data

  // ── Calculs ─────────────────────────────────────────────────────────────────
  const totalRevenus   = revenus.monSalaire + revenus.salaireFemme
  const totalCharges   = charges.reduce((s, c) => s + c.montant, 0)
  const budgetDispo    = totalRevenus - totalCharges
  const budgetFlex     = budgetDispo - objectifEpargne
  const totalDep       = CATEGORIES.reduce((s, c) => s + (depenses[c.id] ?? 0), 0)
  const resteTotal     = budgetFlex - totalDep
  const epargneReelle  = budgetDispo - totalDep
  const ecart          = epargneReelle - objectifEpargne
  const enTrack        = ecart >= 0

  // ── Charges helpers ─────────────────────────────────────────────────────────
  const modLabel   = (id: string, v: string) => patch({ charges: charges.map(c => c.id === id ? { ...c, label: v } : c) })
  const modMontant = (id: string, v: number) => patch({ charges: charges.map(c => c.id === id ? { ...c, montant: v } : c) })
  const supprimer  = (id: string) => patch({ charges: charges.filter(c => c.id !== id) })

  // ── Ajout charge ────────────────────────────────────────────────────────────
  const [ajoutLabel,   setAjoutLabel]   = useState('')
  const [ajoutMontant, setAjoutMontant] = useState('')
  const [showAjout,    setShowAjout]    = useState(false)
  const ajouter = () => {
    if (!ajoutLabel.trim()) return
    patch({ charges: [...charges, { id: `${uid}-${Date.now()}`, label: ajoutLabel.trim(), montant: parseFloat(ajoutMontant) || 0 }] })
    setAjoutLabel(''); setAjoutMontant(''); setShowAjout(false)
  }

  // ── Code famille ────────────────────────────────────────────────────────────
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
    if (!foyer) { setJoinError('Code invalide. Vérifie avec ton/ta partenaire.'); setJoinLoading(false); return }
    await supabase.from('profiles').update({ budget_foyer_id: clean }).eq('id', session.user.id)
    skipSave.current = true
    setData(foyer.data as BudgetData)
    setFoyerId(clean)
    setShowJoin(false); setJoinCode(''); setJoinLoading(false)
  }

  // ── Status couleurs ─────────────────────────────────────────────────────────
  const palette = {
    red:    { card: 'bg-red-50 border-red-200',         badge: 'bg-red-100 text-red-700',         bar: 'bg-red-500',    reste: 'text-red-600' },
    yellow: { card: 'bg-amber-50 border-amber-200',     badge: 'bg-amber-100 text-amber-700',     bar: 'bg-amber-400',  reste: 'text-amber-600' },
    green:  { card: 'bg-emerald-50 border-emerald-200', badge: 'bg-emerald-100 text-emerald-700', bar: 'bg-emerald-500', reste: 'text-emerald-600' },
  }
  const color = (catId: string, pct: number) => {
    const s = budgetFlex * pct, d = depenses[catId] ?? 0
    if (d > s) return 'red' as const
    if (s > 0 && d / s >= 0.8) return 'yellow' as const
    return 'green' as const
  }

  if (loading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center gap-3 text-slate-400">
      <Loader2 size={28} className="animate-spin" />
      <span>Chargement…</span>
    </div>
  )

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white border-b border-slate-100 px-4 py-3 flex items-center justify-between">
        <h1 className="font-bold text-slate-800 text-lg">💰 Budget Famille</h1>
        <div className="flex items-center gap-2">
          {syncing && <RefreshCw size={14} className="animate-spin text-blue-400" />}
          {!syncing && lastSync && <span className="text-xs text-slate-400">✓ {lastSync.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>}
          <button onClick={() => supabase.auth.signOut()}
            className="w-8 h-8 flex items-center justify-center rounded-xl text-slate-400 hover:text-red-500 hover:bg-red-50 transition">
            <LogOut size={16} />
          </button>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 py-4 pb-20 space-y-4">

        {/* Code famille */}
        <div className="bg-gradient-to-br from-blue-500 to-violet-600 rounded-2xl p-5 text-white">
          <div className="flex items-center gap-2 mb-2">
            <Users size={16} />
            <span className="font-bold text-sm">Budget partagé</span>
          </div>
          <p className="text-white/75 text-xs mb-3">Partage ce code avec ton/ta partenaire pour synchroniser en temps réel.</p>
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-white/20 rounded-xl px-4 py-2.5 font-mono text-xl font-bold tracking-widest text-center">{foyerId}</div>
            <button onClick={copyCode} className="bg-white/20 hover:bg-white/30 rounded-xl p-2.5 transition">
              {copied ? <Check size={18} /> : <Copy size={18} />}
            </button>
          </div>
          {!showJoin
            ? <button onClick={() => setShowJoin(true)} className="w-full mt-2 text-white/60 hover:text-white text-xs underline">Rejoindre le budget d'un·e partenaire →</button>
            : <div className="mt-3 space-y-2">
                <input type="text" placeholder="Code partenaire (ex: ABCD-1234)" value={joinCode}
                  onChange={e => setJoinCode(e.target.value.toUpperCase())}
                  onKeyDown={e => e.key === 'Enter' && joinFoyer()}
                  className="w-full bg-white/20 border border-white/30 rounded-xl px-3 py-2 text-sm text-white placeholder-white/50 font-mono uppercase focus:outline-none" />
                {joinError && <p className="text-red-300 text-xs">{joinError}</p>}
                <div className="flex gap-2">
                  <button onClick={joinFoyer} disabled={joinLoading || !joinCode}
                    className="flex-1 bg-white text-violet-700 font-bold rounded-xl py-2 text-sm hover:bg-white/90 transition disabled:opacity-50">
                    {joinLoading ? <Loader2 size={14} className="animate-spin mx-auto" /> : 'Rejoindre'}
                  </button>
                  <button onClick={() => { setShowJoin(false); setJoinCode(''); setJoinError('') }}
                    className="px-4 bg-white/20 hover:bg-white/30 rounded-xl py-2 text-sm transition">Annuler</button>
                </div>
              </div>
          }
        </div>

        {/* Revenus */}
        <Card title="Revenus" emoji="€" emojiColor="bg-emerald-100 text-emerald-600">
          <Row label="Mon salaire net"><Num value={revenus.monSalaire} className="w-28" onChange={v => patch({ revenus: { ...revenus, monSalaire: v } })} /><Eur /></Row>
          <Row label="Salaire femme (ce mois)"><Num value={revenus.salaireFemme} className="w-28" onChange={v => patch({ revenus: { ...revenus, salaireFemme: v } })} /><Eur /></Row>
          <TotalRow label="Total revenus"><span className="text-xl font-bold text-emerald-600">{fmt(totalRevenus)}</span></TotalRow>
        </Card>

        {/* Charges */}
        <Card title="Charges" emoji="📋" emojiColor="bg-red-100">
          {charges.map(c => (
            <div key={c.id} className="flex items-center gap-2">
              <input type="text" value={c.label} onChange={e => modLabel(c.id, e.target.value)}
                className="flex-1 min-w-0 border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-300" />
              <Num value={c.montant} className="w-24" onChange={v => modMontant(c.id, v)} />
              <Eur />
              <button onClick={() => supprimer(c.id)} className="w-8 h-8 shrink-0 flex items-center justify-center rounded-xl text-red-400 hover:bg-red-50 hover:text-red-600 transition">
                <Trash2 size={15} />
              </button>
            </div>
          ))}
          {showAjout && (
            <div className="flex items-center gap-2 pt-2 border-t border-dashed border-slate-200">
              <input type="text" placeholder="Nom de la charge…" value={ajoutLabel} autoFocus
                onChange={e => setAjoutLabel(e.target.value)} onKeyDown={e => e.key === 'Enter' && ajouter()}
                className="flex-1 min-w-0 border border-blue-300 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400" />
              <input type="number" inputMode="decimal" placeholder="0" value={ajoutMontant}
                onChange={e => setAjoutMontant(e.target.value)} onKeyDown={e => e.key === 'Enter' && ajouter()}
                className="w-24 border border-blue-300 rounded-xl px-3 py-2 text-right text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400" />
              <Eur />
              <button onClick={ajouter} className="w-8 h-8 shrink-0 bg-blue-500 text-white rounded-xl flex items-center justify-center hover:bg-blue-600 transition font-bold">✓</button>
            </div>
          )}
          <TotalRow label="Total charges"><span className="text-xl font-bold text-red-500">{fmt(totalCharges)}</span></TotalRow>
          <button onClick={() => setShowAjout(v => !v)}
            className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-slate-200 rounded-xl py-2.5 text-slate-400 hover:border-blue-300 hover:text-blue-500 transition text-sm">
            <Plus size={15} />Ajouter une charge
          </button>
        </Card>

        {/* Calcul auto */}
        <Card title="Calcul automatique" emoji="📊" emojiColor="bg-blue-100 text-blue-600">
          <Row label="Revenus totaux"><span className="font-semibold text-emerald-600">{fmt(totalRevenus)}</span></Row>
          <Row label="Charges totales"><span className="font-semibold text-red-500">{fmt(totalCharges)}</span></Row>
          <TotalRow label="Budget disponible"><span className="text-xl font-bold text-blue-600">{fmt(budgetDispo)}</span></TotalRow>
          <Row label="Objectif épargne"><Num value={objectifEpargne} className="w-24" onChange={v => patch({ objectifEpargne: v })} /><Eur /></Row>
          <TotalRow label="Budget flexible"><span className={`text-2xl font-extrabold ${budgetFlex >= 0 ? 'text-violet-600' : 'text-red-600'}`}>{fmt(budgetFlex)}</span></TotalRow>
        </Card>

        {/* Seuils */}
        <Card title="Seuils proposés" emoji="🎯" emojiColor="bg-violet-100 text-violet-600">
          {CATEGORIES.map(cat => {
            const seuil = budgetFlex * cat.pct
            const dep   = depenses[cat.id] ?? 0
            const reste = seuil - dep
            const ratio = seuil > 0 ? Math.min(1, dep / seuil) : dep > 0 ? 1 : 0
            const pal   = palette[color(cat.id, cat.pct)]
            return (
              <div key={cat.id} className={`rounded-xl border p-4 ${pal.card}`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{cat.emoji}</span>
                    <span className="font-medium text-slate-700 text-sm">{cat.label}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${pal.badge}`}>{(cat.pct * 100).toFixed(0)}%</span>
                  </div>
                  <span className="text-xs text-slate-500">{fmt(seuil)}</span>
                </div>
                <div className="w-full bg-white/60 rounded-full h-1.5 mb-3">
                  <div className={`h-1.5 rounded-full transition-all ${pal.bar}`} style={{ width: `${ratio * 100}%` }} />
                </div>
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500 text-xs">Dépensé :</span>
                    <Num value={dep} className="w-24" onChange={v => patch({ depenses: { ...depenses, [cat.id]: v } })} />
                    <span className="text-slate-400 text-xs">€</span>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-slate-400">Reste : </span>
                    <span className={`font-bold text-sm ${pal.reste}`}>{fmt(reste)}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </Card>

        {/* Résumé */}
        <div className={`rounded-2xl border-2 p-5 space-y-2 ${enTrack ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
          <h2 className="font-bold text-slate-700 flex items-center gap-2 mb-3">
            <span className="w-7 h-7 bg-white rounded-lg flex items-center justify-center text-sm shadow-sm">📈</span>
            Résumé mensuel
          </h2>
          <Row label="Budget flexible total"><span className="font-semibold text-violet-600">{fmt(budgetFlex)}</span></Row>
          <Row label="Total dépensé"><span className="font-semibold text-red-500">{fmt(totalDep)}</span></Row>
          <Row label="Reste à dépenser"><span className={`font-semibold ${resteTotal >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{fmt(resteTotal)}</span></Row>
          <div className="border-t border-slate-200 pt-2 space-y-2">
            <Row label="Épargne réelle ce mois"><span className="font-bold text-blue-600">{fmt(epargneReelle)}</span></Row>
            <Row label="Écart épargne"><span className={`font-bold ${ecart >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{ecart >= 0 ? '+' : ''}{fmt(ecart)}</span></Row>
          </div>
          <div className={`mt-3 py-3 px-4 rounded-xl text-center font-bold ${enTrack ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
            {enTrack ? 'Vous êtes en track ✅' : 'Attention, épargne en retard ⚠️'}
          </div>
        </div>

        <button onClick={() => { if (!confirm('Remettre toutes les dépenses à zéro ?')) return; patch({ depenses: {} }) }}
          className="w-full text-center text-xs text-slate-400 hover:text-red-400 py-2 transition">
          Remettre les dépenses à zéro
        </button>
      </div>
    </div>
  )
}

// ─── Small layout helpers ─────────────────────────────────────────────────────

function Card({ title, emoji, emojiColor, children }: { title: string; emoji: string; emojiColor: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-5 space-y-3">
      <h2 className="font-bold text-slate-700 flex items-center gap-2">
        <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-sm ${emojiColor}`}>{emoji}</span>
        {title}
      </h2>
      {children}
    </div>
  )
}

function TotalRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-t border-slate-100 pt-3">
      <span className="font-semibold text-slate-700">{label}</span>
      {children}
    </div>
  )
}

function Eur() { return <span className="text-slate-400 text-sm shrink-0">€</span> }

// ─── ROOT APP ─────────────────────────────────────────────────────────────────

export default function App() {
  const [session,  setSession]  = useState<Session | null>(null)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setChecking(false) })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => subscription.unsubscribe()
  }, [])

  if (checking) return (
    <div className="min-h-screen bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center">
      <Loader2 size={40} className="animate-spin text-white" />
    </div>
  )

  return session ? <BudgetScreen session={session} /> : <AuthScreen />
}
