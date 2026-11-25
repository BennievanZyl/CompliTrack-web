'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { useStoreContext } from '@/lib/store-context'

const PRIMARY = '#1a5c38'
const DARK    = '#0a1f12'

const DOW     = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const DOW_FULL = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']

/* ── types ───────────────────────────────────────────────────── */
type CashupRow = {
  cash_up_date: string
  cash_up_total: number
  customer_count: number
  average_spend: number
}

type SnapshotRow = {
  snapshot_date: string
  snapshot_time: string
  sales_at_time: number
  customer_count_at_time: number | null
  predicted_final: number | null
}

type DomCat = 'early' | 'mid' | 'late'

type DayPrediction = {
  dow: number
  label: string
  mid: number
  min: number
  max: number
  customers: number
  avgTicket: number
  confidence: number
  samples: number
  domCat: DomCat
  domEffect: number   // % adjustment (positive = boost, negative = drag)
  domSamples: number
}

type AccuracyPoint = {
  date: string
  label: string
  predicted: number
  actual: number
  errorPct: number
  predictedCustomers: number
  actualCustomers: number
}

/* ── DOM helpers ─────────────────────────────────────────────── */
function getDomCat(dateStr: string): DomCat {
  const day = parseInt(dateStr.split('-')[2], 10)
  if (day <= 10) return 'early'
  if (day <= 20) return 'mid'
  return 'late'
}

const DOM_LABEL: Record<DomCat, string> = {
  early: 'Early month (1–10)',
  mid:   'Mid-month (11–20)',
  late:  'Month-end (21–31)',
}

/* ── weighted prediction ─────────────────────────────────────── */
function predictDow(
  rows: CashupRow[],
  dow: number,
  targetDateStr: string,
  limitWeeks = 12
): DayPrediction | null {
  const sameDow = rows
    .filter(r => new Date(r.cash_up_date + 'T12:00:00').getDay() === dow)
    .sort((a, b) => b.cash_up_date.localeCompare(a.cash_up_date))
    .slice(0, limitWeeks)

  if (sameDow.length === 0) return null

  /* base weighted mean */
  const weights = sameDow.map((_, i) => Math.pow(0.85, i))
  const tw = weights.reduce((a, b) => a + b, 0)
  const wMean = sameDow.reduce((s, r, i) => s + r.cash_up_total * weights[i], 0) / tw
  const wVar  = sameDow.reduce((s, r, i) => s + weights[i] * Math.pow(r.cash_up_total - wMean, 2), 0) / tw
  const wStd  = Math.sqrt(wVar)
  const wCust = sameDow.reduce((s, r, i) => s + r.customer_count * weights[i], 0) / tw

  /* DOM adjustment */
  const targetCat = getDomCat(targetDateStr)
  const sameCat   = sameDow.filter(r => getDomCat(r.cash_up_date) === targetCat)
  let domEffect   = 0
  if (sameCat.length >= 2 && sameDow.length >= 4) {
    const avgAll = sameDow.reduce((s, r) => s + r.cash_up_total, 0) / sameDow.length
    const avgCat = sameCat.reduce((s, r) => s + r.cash_up_total, 0) / sameCat.length
    const rawMult    = avgCat / avgAll
    const blendWeight = Math.min(1, sameCat.length / 8)
    const effMult    = 1 + blendWeight * (rawMult - 1)
    domEffect = Math.round((effMult - 1) * 100)
  }

  const effMult = 1 + domEffect / 100
  const round10 = (n: number) => Math.round(n / 10) * 10

  return {
    dow,
    label:      DOW_FULL[dow],
    mid:        round10(wMean * effMult),
    min:        round10(Math.max(0, (wMean - wStd) * effMult)),
    max:        round10((wMean + wStd) * effMult),
    customers:  Math.round(wCust),
    avgTicket:  wCust > 0 ? Math.round((wMean * effMult) / wCust) : 0,
    confidence: Math.min(95, 30 + sameDow.length * 6),
    samples:    sameDow.length,
    domCat:     targetCat,
    domEffect,
    domSamples: sameCat.length,
  }
}

/* ── accuracy history ────────────────────────────────────────── */
function buildAccuracy(rows: CashupRow[], snaps: SnapshotRow[], weeksBack = 10): AccuracyPoint[] {
  const sorted = [...rows].sort((a, b) => b.cash_up_date.localeCompare(a.cash_up_date))
  const points: AccuracyPoint[] = []
  for (const target of sorted.slice(0, weeksBack)) {
    const dow      = new Date(target.cash_up_date + 'T12:00:00').getDay()
    const training = rows.filter(r => r.cash_up_date !== target.cash_up_date)
    const pred     = predictDow(training, dow, target.cash_up_date)
    if (!pred || pred.samples < 2) continue
    // Use snapshot-refined predicted_final if available — more accurate than Phase 1 alone
    const snapForDate    = snaps.find(s => s.snapshot_date === target.cash_up_date)
    const predictedValue = snapForDate?.predicted_final ?? pred.mid
    const errorPct = Math.round(Math.abs(target.cash_up_total - predictedValue) / predictedValue * 100)
    points.push({
      date:               target.cash_up_date,
      label:              `${DOW[dow]} ${target.cash_up_date.substring(5)}`,
      predicted:          predictedValue,
      actual:             target.cash_up_total,
      errorPct,
      predictedCustomers: pred.customers,
      actualCustomers:    target.customer_count,
    })
  }
  return points
}

/* ── Phase 2 ratio ───────────────────────────────────────────── */
function buildPhase2Ratio(cashups: CashupRow[], snaps: SnapshotRow[], todayStr: string, todayDow: number) {
  const todayCat  = getDomCat(todayStr)
  const cashupMap = new Map(cashups.map(c => [c.cash_up_date, c.cash_up_total]))

  const pairs = snaps
    .filter(s => s.snapshot_date !== todayStr && s.sales_at_time > 0)
    .map(s => {
      const final = cashupMap.get(s.snapshot_date)
      if (!final) return null
      const dow = new Date(s.snapshot_date + 'T12:00:00').getDay()
      const cat = getDomCat(s.snapshot_date)
      return { dow, cat, ratio: final / s.sales_at_time }
    })
    .filter(Boolean) as { dow: number; cat: DomCat; ratio: number }[]

  // Primary: same weekday AND same DOM category (early/mid/late month)
  const primary   = pairs.filter(p => p.dow === todayDow && p.cat === todayCat)
  // Fallback: same weekday, any DOM category
  const fallback  = pairs.filter(p => p.dow === todayDow)
  // Universal: any day (ratio final/snapshot consistent across days — last resort)
  const universal = pairs

  const usingUniversal = primary.length < 2 && fallback.length === 0 && universal.length > 0
  const pool = primary.length >= 2 ? primary : fallback.length > 0 ? fallback : universal
  if (pool.length === 0) return { avgRatio: null, ratioSamples: 0, usingDomFilter: false, usingUniversal: false }

  const avgRatio = pool.reduce((s, p) => s + p.ratio, 0) / pool.length
  return { avgRatio, ratioSamples: pool.length, usingDomFilter: primary.length >= 2, usingUniversal }
}

/* ── date helpers ────────────────────────────────────────────── */
function nextDateForDow(targetDow: number): string {
  const today = new Date()
  const diff  = (targetDow - today.getDay() + 7) % 7
  const d     = new Date(today)
  d.setDate(d.getDate() + diff)
  return d.toISOString().split('T')[0]
}

/* ── currency ────────────────────────────────────────────────── */
function cur(n: number) {
  return 'R ' + Math.round(n).toLocaleString('en-ZA')
}

/* ── sub-components ──────────────────────────────────────────── */
function ConfPill({ pct }: { pct: number }) {
  const color = pct >= 70 ? '#166534' : pct >= 50 ? '#92400e' : '#6b7280'
  const bg    = pct >= 70 ? '#dcfce7' : pct >= 50 ? '#fef3c7' : '#f3f4f6'
  return (
    <span style={{ background: bg, color, borderRadius: 20, padding: '3px 10px', fontSize: 12, fontWeight: 700 }}>
      {pct}% confidence
    </span>
  )
}

function DomTag({ effect, samples }: { effect: number; samples: number }) {
  if (samples < 2 || Math.abs(effect) <= 2) return null
  const up = effect > 0
  return (
    <span style={{ background: up ? '#f0fdf4' : '#f9fafb', color: up ? '#166534' : '#6b7280', border: `1px solid ${up ? '#bbf7d0' : '#e5e7eb'}`, borderRadius: 20, padding: '3px 10px', fontSize: 12, fontWeight: 700, marginLeft: 6 }}>
      {up ? '↑' : '↓'} {up ? 'Month-end' : 'Early month'} {up ? '+' : ''}{effect}%
    </span>
  )
}

function RangeBar({ min, mid, max, globalMax }: { min: number; mid: number; max: number; globalMax: number }) {
  const pMin = (min / globalMax) * 100
  const pMid = (mid / globalMax) * 100
  const pMax = (max / globalMax) * 100
  return (
    <div style={{ position: 'relative', height: 8, background: '#f0f4f0', borderRadius: 100, overflow: 'visible', marginTop: 8 }}>
      <div style={{ position: 'absolute', top: 0, left: `${pMin}%`, width: `${pMax - pMin}%`, height: '100%', background: 'rgba(26,92,56,0.18)', borderRadius: 100 }} />
      <div style={{ position: 'absolute', top: -3, left: `${pMid}%`, transform: 'translateX(-50%)', width: 14, height: 14, borderRadius: '50%', background: PRIMARY, border: '2px solid #fff', boxShadow: '0 1px 4px rgba(0,0,0,0.18)' }} />
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════ */
export default function PredictionsPage() {
  const { storeId: STORE_ID, ready: ctxReady } = useStoreContext() as { storeId: string; ready: boolean }
  const router = useRouter()

  const [loading,       setLoading]       = useState(true)
  const [history,       setHistory]       = useState<CashupRow[]>([])
  const [weekPreds,     setWeekPreds]     = useState<(DayPrediction | null)[]>([])
  const [accuracy,      setAccuracy]      = useState<AccuracyPoint[]>([])
  const [todayPred,     setTodayPred]     = useState<DayPrediction | null>(null)
  const [bestDay,       setBestDay]       = useState<DayPrediction | null>(null)
  const [slowDay,       setSlowDay]       = useState<DayPrediction | null>(null)
  const [trend4w,       setTrend4w]       = useState<number | null>(null)
  const [accessDenied,  setAccessDenied]  = useState(false)

  /* Phase 2 */
  const [todaySnap,     setTodaySnap]     = useState<SnapshotRow | null>(null)
  const [phase2Pred,    setPhase2Pred]    = useState<number | null>(null)
  const [ratioSamples,  setRatioSamples]  = useState(0)
  const [usingDomFilter, setUsingDomFilter] = useState(false)
  const [usingUniversal, setUsingUniversal] = useState(false)
  const [avgRatioState, setAvgRatioState] = useState<number | null>(null)
  const [phase2CustPred, setPhase2CustPred] = useState<number | null>(null)

  const todayStr = new Date().toISOString().split('T')[0]
  const todayDow = new Date().getDay()

  const loadData = useCallback(async () => {
    if (!STORE_ID) return
    setLoading(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    // Role check intentionally removed: store_devices is a kiosk device table (no user_id).
    // Predictions page is accessible to all authenticated web users.

    const since = new Date()
    since.setDate(since.getDate() - 100)
    const sinceStr = since.toISOString().split('T')[0]

    const [{ data: rows }, { data: snapRows }] = await Promise.all([
      supabase.from('cash_ups')
        .select('cash_up_date, cash_up_total, customer_count, average_spend')
        .eq('store_id', STORE_ID)
        .gte('cash_up_date', sinceStr)
        .order('cash_up_date', { ascending: false }),
      supabase.from('sales_snapshots')
        .select('snapshot_date, snapshot_time, sales_at_time, customer_count_at_time, predicted_final')
        .eq('store_id', STORE_ID)
        .gte('snapshot_date', sinceStr)
        .order('snapshot_date', { ascending: false }),
    ])

    const data  = (rows      || []).filter(r => r.cash_up_total > 0)
    const snaps = (snapRows  || []).filter(s => s.sales_at_time > 0)
    setHistory(data)

    if (data.length === 0) { setLoading(false); return }

    /* today's snapshot */
    const todaySnapshot = snaps.find(s => s.snapshot_date === todayStr) || null
    setTodaySnap(todaySnapshot)

    /* Phase 2 ratio */
    const { avgRatio, ratioSamples: rs, usingDomFilter: domF, usingUniversal: uniF } = buildPhase2Ratio(data, snaps, todayStr, todayDow)
    setRatioSamples(rs)
    setUsingDomFilter(domF)
    setUsingUniversal(uniF)
    setAvgRatioState(avgRatio)
    if (todaySnapshot) {
      // Always prefer live ratio when we have enough samples; stored is fallback only.
      const liveRatio = avgRatio && rs >= 2
        ? Math.round(todaySnapshot.sales_at_time * avgRatio / 10) * 10
        : null
      setPhase2Pred(liveRatio ?? todaySnapshot.predicted_final)

      // Customer ratio: same-DOW snapshot customer_count → cashup customer_count pairs
      if (todaySnapshot.customer_count_at_time && todaySnapshot.customer_count_at_time > 0) {
        const cashupMap = new Map(data.map(c => [c.cash_up_date, c.customer_count]))
        const custPairs = snaps
          .filter(s => s.snapshot_date !== todayStr && s.customer_count_at_time && s.customer_count_at_time > 0)
          .map(s => {
            const finalCust = cashupMap.get(s.snapshot_date)
            if (!finalCust || finalCust <= 0) return null
            const dow = new Date(s.snapshot_date + 'T12:00:00').getDay()
            return { dow, ratio: finalCust / s.customer_count_at_time! }
          })
          .filter(Boolean) as { dow: number; ratio: number }[]
        const sameDowCust = custPairs.filter(p => p.dow === todayDow)
        const allCust     = custPairs
        const custRatioPairs = sameDowCust.length >= 2 ? sameDowCust : allCust.length >= 2 ? allCust : []
        if (custRatioPairs.length >= 2) {
          const avgCustRatio = custRatioPairs.reduce((s, p) => s + p.ratio, 0) / custRatioPairs.length
          setPhase2CustPred(Math.round(todaySnapshot.customer_count_at_time * avgCustRatio))
        }
      }
    }

    /* predictions for each DOW using next occurrence of that day */
    const preds = Array.from({ length: 7 }, (_, i) => {
      const dateStr = nextDateForDow(i)
      return predictDow(data, i, dateStr)
    })

    setTodayPred(predictDow(data, todayDow, todayStr))
    setWeekPreds(preds)
    setAccuracy(buildAccuracy(data, snaps, 10))

    const valid = preds.filter(Boolean) as DayPrediction[]
    if (valid.length > 0) {
      setBestDay(valid.reduce((a, b) => a.mid > b.mid ? a : b))
      setSlowDay(valid.reduce((a, b) => a.mid < b.mid ? a : b))
    }

    /* 4-week trend */
    const fourWMs  = 28 * 24 * 60 * 60 * 1000
    const now      = Date.now()
    const last4w   = data.filter(r => now - new Date(r.cash_up_date + 'T12:00:00').getTime() < fourWMs)
    const prior4w  = data.filter(r => { const ms = now - new Date(r.cash_up_date + 'T12:00:00').getTime(); return ms >= fourWMs && ms < 2 * fourWMs })
    if (last4w.length > 0 && prior4w.length > 0) {
      const avg4 = last4w.reduce((s, r)  => s + r.cash_up_total, 0) / last4w.length
      const avgP = prior4w.reduce((s, r) => s + r.cash_up_total, 0) / prior4w.length
      setTrend4w(Math.round(((avg4 - avgP) / avgP) * 100))
    }

    setLoading(false)
  }, [STORE_ID, router, todayStr, todayDow])

  useEffect(() => { if (ctxReady) loadData() }, [ctxReady, loadData])

  /* ── loading / access ──────────────────────────────────────── */
  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f0f4f0' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🔮</div>
        <p style={{ color: '#6b7280', fontSize: 14 }}>Analysing your trading patterns…</p>
      </div>
    </div>
  )

  if (accessDenied) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', color: '#6b7280' }}>Access restricted</div>
    </div>
  )

  const noData    = history.length === 0
  const globalMax = Math.max(...(weekPreds.filter(Boolean) as DayPrediction[]).map(p => p.max), 1)
  const avgAccuracy = accuracy.length > 0
    ? Math.round(accuracy.reduce((s, a) => s + (100 - a.errorPct), 0) / accuracy.length)
    : null

  const todayCat = getDomCat(todayStr)

  // Blend weights:
  // - stored predicted_final from snapshot page → use 100% (most accurate: today's sales + ratios)
  // - same-DOW runtime ratio samples → blend linearly up to 100% at 8 samples
  // - universal cross-day ratio fallback → blend up to 50% max (less specific but beats ignoring snapshot)
  const hasStoredSnapPred = !!(todaySnap?.predicted_final)
  // Conservative blend: live ratio capped at 40% (same-DOW) or 20% (universal).
  // Phase 1 (historical pattern) always retains at least 60% influence.
  const hasLiveRatio = ratioSamples >= 2 && !!avgRatioState
  const phase2BlendWeight = !todaySnap
    ? 0
    : hasLiveRatio
      ? usingUniversal
        ? Math.min(0.2, ratioSamples * 0.04)   // cross-day: 4% per sample, max 20%
        : Math.min(0.4, ratioSamples * 0.08)   // same-DOW:  8% per sample, max 40%
      : (hasStoredSnapPred ? 0.15 : 0)          // stored only: modest 15% nudge
  const finalPred = todayPred
    ? (phase2Pred && phase2BlendWeight > 0
        ? Math.round((todayPred.mid * (1 - phase2BlendWeight) + phase2Pred * phase2BlendWeight) / 10) * 10
        : todayPred.mid)
    : null
  const snapshotPacing = (phase2Pred && todayPred)
    ? Math.round((phase2Pred / todayPred.mid - 1) * 100)
    : null

  return (
    <div style={{ minHeight: '100vh', background: '#f0f4f0', fontFamily: 'system-ui, sans-serif', color: '#111' }}>

      {/* Header */}
      <div style={{ background: `linear-gradient(135deg, ${DARK}, ${PRIMARY})`, padding: '0 40px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', height: 72, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <button onClick={() => router.push('/dashboard')}
              style={{ background: 'rgba(255,255,255,0.12)', border: '1.5px solid rgba(255,255,255,0.25)', borderRadius: 10, padding: '7px 14px', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
              ← Back
            </button>
            <div>
              <div style={{ color: '#fff', fontWeight: 900, fontSize: 20 }}>🔮 Sales Forecast</div>
              <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 12 }}>AI-powered predictions · {DOM_LABEL[todayCat]}</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={() => router.push('/predictions/snapshot')}
              style={{ background: 'rgba(255,255,255,0.12)', border: '1.5px solid rgba(255,255,255,0.3)', borderRadius: 10, padding: '8px 16px', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
              📸 15:00 Snapshot
            </button>
            {avgAccuracy !== null && (
              <div style={{ textAlign: 'right' }}>
                <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Model Accuracy</div>
                <div style={{ color: '#fff', fontSize: 24, fontWeight: 900 }}>{avgAccuracy}%</div>
              </div>
            )}
          </div>
        </div>
      </div>

      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 40px 60px' }}>

        {noData ? (
          <div style={{ background: '#fff', borderRadius: 20, padding: '60px 40px', textAlign: 'center', border: '1.5px solid #e8f0e8' }}>
            <div style={{ fontSize: 64, marginBottom: 16 }}>📊</div>
            <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Not enough data yet</h2>
            <p style={{ color: '#6b7280', fontSize: 15, lineHeight: 1.6, maxWidth: 480, margin: '0 auto' }}>
              Keep capturing daily cash-ups and predictions will start appearing within a week.
            </p>
          </div>
        ) : (
          <>
            {/* ── Snapshot status strip ── */}
            {phase2Pred ? (
              <div style={{ background: '#f0fdf4', border: '1.5px solid #86efac', borderRadius: 14, padding: '12px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                <div style={{ fontSize: 13, color: '#166534', fontWeight: 600 }}>
                  📸 Snapshot at {todaySnap!.snapshot_time} · {cur(todaySnap!.sales_at_time)} trading so far
                  {phase2BlendWeight > 0 ? (
                    hasStoredSnapPred && !usingUniversal ? (
                      <span style={{ marginLeft: 8 }}>
                        · snapshot-based prediction
                        {snapshotPacing !== null && (
                          <span style={{ marginLeft: 6, fontWeight: 700, color: snapshotPacing >= 0 ? '#15803d' : '#6b7280' }}>
                            {snapshotPacing >= 0 ? `▲ +${snapshotPacing}%` : `▼ ${snapshotPacing}%`} vs baseline
                          </span>
                        )}
                      </span>
                    ) : usingUniversal ? (
                      <span style={{ marginLeft: 8 }}>
                        · blended {Math.round(phase2BlendWeight * 100)}% with snapshot ({ratioSamples} cross-day ratio{ratioSamples !== 1 ? 's' : ''}, building {DOW_FULL[todayDow]} data)
                        {snapshotPacing !== null && (
                          <span style={{ marginLeft: 6, fontWeight: 700, color: snapshotPacing >= 0 ? '#15803d' : '#6b7280' }}>
                            {snapshotPacing >= 0 ? `▲ +${snapshotPacing}%` : `▼ ${snapshotPacing}%`} vs baseline
                          </span>
                        )}
                      </span>
                    ) : (
                      <span style={{ marginLeft: 8 }}>
                        · blended with {ratioSamples} {usingDomFilter ? `${getDomCat(todayStr)}-month ` : ''}{DOW_FULL[todayDow]} ratio sample{ratioSamples !== 1 ? 's' : ''} ({Math.round(phase2BlendWeight * 100)}% weight)
                      </span>
                    )
                  ) : (
                    <>
                      {snapshotPacing !== null && (
                        <span style={{ marginLeft: 8, fontWeight: 700, color: snapshotPacing >= 0 ? '#15803d' : '#6b7280' }}>
                          {snapshotPacing >= 0 ? `▲ +${snapshotPacing}%` : `▼ ${snapshotPacing}%`} vs baseline
                        </span>
                      )}
                      <span style={{ marginLeft: 8, color: '#6b7280', fontWeight: 400 }}>· ratio data building</span>
                    </>
                  )}
                </div>
                <button onClick={() => router.push('/predictions/snapshot')}
                  style={{ background: '#dcfce7', color: '#166534', border: '1.5px solid #86efac', borderRadius: 10, padding: '7px 14px', cursor: 'pointer', fontWeight: 700, fontSize: 13, fontFamily: 'inherit' }}>
                  Update →
                </button>
              </div>
            ) : (
              /* no snapshot yet — prompt */
              <div onClick={() => router.push('/predictions/snapshot')}
                style={{ background: '#fffbeb', borderRadius: 20, border: '2px solid #fde68a', padding: '20px 28px', marginBottom: 28, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', flexWrap: 'wrap', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ fontSize: 36 }}>📸</div>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: '#92400e' }}>Take your 15:00 Snapshot</div>
                    <div style={{ fontSize: 13, color: '#b45309', marginTop: 2 }}>Enter your running sales total to get a refined same-day prediction</div>
                  </div>
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#d97706' }}>Open →</span>
              </div>
            )}

            {/* ── Today's forecast ── */}
            <div style={{ marginBottom: 32 }}>
              <h2 style={{ fontSize: 15, fontWeight: 800, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 16 }}>
                Today — {DOW_FULL[todayDow]}
              </h2>

              {todayPred ? (
                <div style={{ background: '#fff', borderRadius: 24, padding: '32px', border: '1.5px solid #e8f0e8', boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 20 }}>
                    <div>
                      <div style={{ fontSize: 13, color: '#6b7280', fontWeight: 600, marginBottom: 6 }}>
                        {phase2BlendWeight > 0 ? "Today's refined forecast" : "Today's forecast"}
                      </div>
                      <div style={{ fontSize: 48, fontWeight: 900, color: PRIMARY, lineHeight: 1, letterSpacing: '-1px' }}>{cur(finalPred ?? todayPred.mid)}</div>
                      {phase2BlendWeight > 0 && (
                        <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
                          {hasStoredSnapPred && !usingUniversal
                            ? 'Refined with today\'s snapshot sales'
                            : `${Math.round(phase2BlendWeight * 100)}% snapshot · ${Math.round((1 - phase2BlendWeight) * 100)}% historical pattern`
                          }
                        </div>
                      )}
                      <div style={{ fontSize: 15, color: '#9ca3af', marginTop: 6 }}>Range: {cur(todayPred.min)} — {cur(todayPred.max)}</div>
                      <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                        <ConfPill pct={todayPred.confidence} />
                        <DomTag effect={todayPred.domEffect} samples={todayPred.domSamples} />
                        <span style={{ fontSize: 12, color: '#9ca3af' }}>based on {todayPred.samples} previous {DOW_FULL[todayDow]}s</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                      {todaySnap && (
                        <div style={{ background: '#f0fdf4', borderRadius: 16, padding: '16px 20px', minWidth: 120, border: '1px solid #bbf7d0' }}>
                          <div style={{ fontSize: 11, color: '#166534', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>📸 {todaySnap.snapshot_time} Sales</div>
                          <div style={{ fontSize: 24, fontWeight: 900, color: '#166534' }}>{cur(todaySnap.sales_at_time)}</div>
                          <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>captured at {todaySnap.snapshot_time}</div>
                        </div>
                      )}
                      <div style={{ background: todaySnap?.customer_count_at_time ? '#f0fdf4' : '#f8faf8', borderRadius: 16, padding: '16px 20px', minWidth: 120, border: todaySnap?.customer_count_at_time ? '1px solid #bbf7d0' : undefined }}>
                        <div style={{ fontSize: 11, color: todaySnap?.customer_count_at_time ? '#166534' : '#6b7280', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>
                          {todaySnap?.customer_count_at_time ? '👥 Customers' : 'Customers'}
                        </div>
                        <div style={{ fontSize: 28, fontWeight: 900, color: todaySnap?.customer_count_at_time ? '#166534' : undefined }}>
                          ~{phase2CustPred ?? todayPred.customers}
                        </div>
                        {todaySnap?.customer_count_at_time ? (
                          <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
                            {todaySnap.customer_count_at_time} at {todaySnap.snapshot_time} · projected
                          </div>
                        ) : (
                          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>historical avg</div>
                        )}
                      </div>
                      <div style={{ background: '#f8faf8', borderRadius: 16, padding: '16px 20px', minWidth: 120 }}>
                        <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Avg Ticket</div>
                        <div style={{ fontSize: 28, fontWeight: 900 }}>{cur(todayPred.avgTicket)}</div>
                      </div>
                      {trend4w !== null && (
                        <div style={{ background: trend4w >= 0 ? '#f0fdf4' : '#fef2f2', borderRadius: 16, padding: '16px 20px', minWidth: 120 }}>
                          <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>4-Week Trend</div>
                          <div style={{ fontSize: 28, fontWeight: 900, color: trend4w >= 0 ? '#16a34a' : '#dc2626' }}>{trend4w > 0 ? '+' : ''}{trend4w}%</div>
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{ marginTop: 24 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#9ca3af', marginBottom: 4 }}>
                      <span>{cur(todayPred.min)}</span>
                      <span style={{ fontWeight: 700, color: PRIMARY }}>Most likely: {cur(finalPred ?? todayPred.mid)}</span>
                      <span>{cur(todayPred.max)}</span>
                    </div>
                    <RangeBar min={todayPred.min} mid={todayPred.mid} max={todayPred.max} globalMax={todayPred.max * 1.1} />
                  </div>
                  {/* DOM context note */}
                  {todayPred.domSamples >= 2 && Math.abs(todayPred.domEffect) > 2 && (
                    <div style={{ marginTop: 16, padding: '10px 14px', background: todayPred.domEffect > 0 ? '#f0fdf4' : '#f9fafb', borderRadius: 10, fontSize: 13, color: todayPred.domEffect > 0 ? '#166534' : '#6b7280', border: `1px solid ${todayPred.domEffect > 0 ? '#bbf7d0' : '#e5e7eb'}` }}>
                      {todayPred.domEffect > 0
                        ? `📅 Month-end effect: historically ${DOW_FULL[todayDow]}s in the last 10 days of the month trade ${todayPred.domEffect}% above average.`
                        : `📅 Early-month pattern: historically ${DOW_FULL[todayDow]}s in the first 10 days trade ${Math.abs(todayPred.domEffect)}% below average.`
                      }
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ background: '#fff', borderRadius: 20, padding: '24px', border: '1.5px solid #e8f0e8', color: '#9ca3af', textAlign: 'center' }}>
                  Not enough {DOW_FULL[todayDow]} data yet — keep capturing cash-ups.
                </div>
              )}
            </div>

            {/* ── Week outlook ── */}
            <div style={{ marginBottom: 32 }}>
              <h2 style={{ fontSize: 15, fontWeight: 800, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 16 }}>
                Weekly Outlook
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 10 }}>
                {weekPreds.map((pred, dow) => {
                  const isToday = dow === todayDow
                  if (!pred) return (
                    <div key={dow} style={{ background: '#fff', borderRadius: 16, padding: '16px 12px', textAlign: 'center', border: '1.5px solid #e8f0e8', opacity: 0.5 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>{DOW[dow]}</div>
                      <div style={{ fontSize: 11, color: '#9ca3af' }}>No data</div>
                    </div>
                  )
                  return (
                    <div key={dow} style={{ background: isToday ? PRIMARY : '#fff', borderRadius: 16, padding: '16px 12px', textAlign: 'center', border: `1.5px solid ${isToday ? PRIMARY : '#e8f0e8'}`, boxShadow: isToday ? '0 4px 20px rgba(26,92,56,0.25)' : 'none' }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: isToday ? '#fff' : '#111', marginBottom: 2 }}>{DOW[dow]}</div>
                      {isToday && <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)', marginBottom: 6, fontWeight: 600 }}>TODAY</div>}
                      {!isToday && <div style={{ marginBottom: 6 }} />}
                      <div style={{ fontSize: 15, fontWeight: 900, color: isToday ? '#fff' : PRIMARY }}>{cur(isToday && finalPred ? finalPred : pred.mid)}</div>
                      <div style={{ fontSize: 11, color: isToday ? 'rgba(255,255,255,0.65)' : '#9ca3af', marginTop: 2 }}>~{pred.customers} cust</div>
                      <RangeBar min={pred.min} mid={pred.mid} max={pred.max} globalMax={globalMax} />
                      <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                        <span style={{ fontSize: 10, background: isToday ? 'rgba(255,255,255,0.15)' : '#f0f4f0', color: isToday ? '#fff' : '#6b7280', borderRadius: 20, padding: '2px 7px', fontWeight: 700 }}>
                          {pred.confidence}%
                        </span>
                        {pred.domSamples >= 2 && Math.abs(pred.domEffect) > 2 && (
                          <span style={{ fontSize: 9, color: isToday ? 'rgba(255,255,255,0.8)' : (pred.domEffect > 0 ? '#16a34a' : '#9ca3af'), fontWeight: 700 }}>
                            {pred.domEffect > 0 ? `↑ +${pred.domEffect}%` : `↓ ${pred.domEffect}%`}
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* ── Insights row ── */}
            {(bestDay || slowDay || trend4w !== null) && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 32 }}>
                {bestDay && (
                  <div style={{ background: '#fff', borderRadius: 20, padding: '24px', border: '1.5px solid #bbf7d0' }}>
                    <div style={{ fontSize: 24, marginBottom: 8 }}>🏆</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Best Trading Day</div>
                    <div style={{ fontSize: 22, fontWeight: 900, color: '#166534' }}>{bestDay.label}</div>
                    <div style={{ fontSize: 15, color: '#16a34a', fontWeight: 700 }}>{cur(bestDay.mid)} avg</div>
                  </div>
                )}
                {slowDay && slowDay.dow !== bestDay?.dow && (
                  <div style={{ background: '#fff', borderRadius: 20, padding: '24px', border: '1.5px solid #e8f0e8' }}>
                    <div style={{ fontSize: 24, marginBottom: 8 }}>📉</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Quietest Day</div>
                    <div style={{ fontSize: 22, fontWeight: 900, color: '#374151' }}>{slowDay.label}</div>
                    <div style={{ fontSize: 15, color: '#9ca3af', fontWeight: 700 }}>{cur(slowDay.mid)} avg</div>
                  </div>
                )}
                {trend4w !== null && (
                  <div style={{ background: trend4w >= 0 ? '#f0fdf4' : '#fef2f2', borderRadius: 20, padding: '24px', border: `1.5px solid ${trend4w >= 0 ? '#bbf7d0' : '#fecaca'}` }}>
                    <div style={{ fontSize: 24, marginBottom: 8 }}>{trend4w >= 0 ? '📈' : '📉'}</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Sales Trend</div>
                    <div style={{ fontSize: 22, fontWeight: 900, color: trend4w >= 0 ? '#166534' : '#dc2626' }}>{trend4w > 0 ? '+' : ''}{trend4w}%</div>
                    <div style={{ fontSize: 13, color: '#6b7280' }}>Last 4 weeks vs prior 4 weeks</div>
                  </div>
                )}
              </div>
            )}

            {/* ── Accuracy history ── */}
            {accuracy.length >= 3 && (
              <div style={{ marginBottom: 32 }}>
                <h2 style={{ fontSize: 15, fontWeight: 800, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 16 }}>
                  Prediction Accuracy — Last {accuracy.length} Completed Days
                </h2>
                <div style={{ background: '#fff', borderRadius: 20, border: '1.5px solid #e8f0e8', overflow: 'hidden' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', padding: '12px 24px', background: '#f8faf8', borderBottom: '1px solid #e8f0e8' }}>
                    {['Date','Predicted','Actual','Error'].map(h => (
                      <div key={h} style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</div>
                    ))}
                  </div>
                  {accuracy.map((pt, i) => {
                    const good     = pt.errorPct <= 10
                    const ok       = pt.errorPct <= 20
                    const custDiff = pt.actualCustomers && pt.predictedCustomers
                      ? pt.actualCustomers - pt.predictedCustomers : null
                    const custGood = custDiff !== null && Math.abs(custDiff) <= Math.round(pt.predictedCustomers * 0.1)
                    return (
                      <div key={i} style={{ padding: '14px 24px', borderBottom: i < accuracy.length - 1 ? '1px solid #f0f4f0' : 'none' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', alignItems: 'center' }}>
                          <div style={{ fontSize: 13, color: '#6b7280' }}>{pt.label}</div>
                          <div style={{ fontSize: 13, fontWeight: 600 }}>{cur(pt.predicted)}</div>
                          <div style={{ fontSize: 13, fontWeight: 700 }}>{cur(pt.actual)}</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 13, fontWeight: 700, color: good ? '#16a34a' : ok ? '#d97706' : '#dc2626' }}>{pt.errorPct}% off</span>
                            <span style={{ fontSize: 11, background: good ? '#dcfce7' : ok ? '#fef3c7' : '#fee2e2', color: good ? '#166534' : ok ? '#92400e' : '#991b1b', borderRadius: 20, padding: '2px 8px', fontWeight: 700 }}>
                              {good ? '✓ Good' : ok ? '~ Fair' : '\u00d7 Wide'}
                            </span>
                          </div>
                        </div>
                        {pt.actualCustomers > 0 && (
                          <div style={{ marginTop: 4, fontSize: 11, color: '#9ca3af', display: 'flex', gap: 10 }}>
                            <span>&#128101; ~{pt.predictedCustomers} predicted</span>
                            <span style={{ color: '#6b7280', fontWeight: 600 }}>{pt.actualCustomers} actual</span>
                            {custDiff !== null && (
                              <span style={{ color: custGood ? '#16a34a' : '#d97706', fontWeight: 700 }}>
                                {custDiff >= 0 ? `+${custDiff}` : custDiff}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
                {avgAccuracy !== null && (
                  <div style={{ marginTop: 12, fontSize: 13, color: '#6b7280', textAlign: 'right' }}>
                    Overall accuracy: <strong style={{ color: avgAccuracy >= 85 ? '#16a34a' : avgAccuracy >= 70 ? '#d97706' : '#dc2626' }}>{avgAccuracy}%</strong>
                    {' '}— model improves as more cash-ups are captured.
                  </div>
                )}
              </div>
            )}

            {/* ── Day-by-day breakdown ── */}
            <div style={{ marginBottom: 32 }}>
              <h2 style={{ fontSize: 15, fontWeight: 800, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 16 }}>
                Historical Averages by Day
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
                {weekPreds.map((pred, dow) => {
                  if (!pred) return null
                  return (
                    <div key={dow} style={{ background: '#fff', borderRadius: 16, padding: '20px 24px', border: '1.5px solid #e8f0e8', display: 'flex', alignItems: 'center', gap: 16 }}>
                      <div style={{ width: 48, height: 48, borderRadius: 14, background: dow === todayDow ? PRIMARY : '#f0f4f0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <span style={{ fontSize: 14, fontWeight: 900, color: dow === todayDow ? '#fff' : '#374151' }}>{DOW[dow]}</span>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                          <span style={{ fontSize: 16, fontWeight: 800 }}>{cur(pred.mid)}</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            {pred.domSamples >= 2 && Math.abs(pred.domEffect) > 2 && (
                              <span style={{ fontSize: 11, color: pred.domEffect > 0 ? '#16a34a' : '#9ca3af', fontWeight: 700 }}>
                                {pred.domEffect > 0 ? `↑ +${pred.domEffect}%` : `↓ ${pred.domEffect}%`}
                              </span>
                            )}
                            <span style={{ fontSize: 12, color: '#9ca3af' }}>{pred.samples} pts</span>
                          </div>
                        </div>
                        <div style={{ fontSize: 12, color: '#6b7280' }}>~{pred.customers} customers · {cur(pred.avgTicket)} avg ticket</div>
                        <RangeBar min={pred.min} mid={pred.mid} max={pred.max} globalMax={globalMax} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div style={{ padding: '14px 20px', background: '#fffbeb', borderRadius: 14, border: '1.5px solid #fde68a', fontSize: 13, color: '#92400e', lineHeight: 1.6 }}>
              <strong>How this works:</strong> Phase 1 uses weighted weekday averages + day-of-month adjustments (early/mid/month-end). Phase 2 activates when you submit a 15:00 snapshot — the model learns your store's afternoon-to-close ratio and refines the same-day prediction automatically.
            </div>
          </>
        )}
      </main>
    </div>
  )
}
