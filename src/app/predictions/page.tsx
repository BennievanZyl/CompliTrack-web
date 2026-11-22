'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { useStoreContext } from '@/lib/store-context'

const PRIMARY = '#1a5c38'
const DARK    = '#0a1f12'

const DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const DOW_FULL = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']

type CashupRow = {
  cash_up_date: string
  cash_up_total: number
  customer_count: number
  average_spend: number
}

type DayPrediction = {
  dow: number
  label: string
  mid: number
  min: number
  max: number
  customers: number
  avgTicket: number
  confidence: number  // 0-100
  samples: number
  history: CashupRow[]
}

type AccuracyPoint = {
  date: string
  label: string
  predicted: number
  actual: number
  errorPct: number
}

/* ── weighted prediction for one day-of-week ─────────────────── */
function predictDow(rows: CashupRow[], dow: number, limitWeeks = 12): DayPrediction | null {
  const sameDow = rows
    .filter(r => new Date(r.cash_up_date + 'T12:00:00').getDay() === dow)
    .sort((a, b) => b.cash_up_date.localeCompare(a.cash_up_date))
    .slice(0, limitWeeks)

  if (sameDow.length === 0) return null

  // exponential decay weights — most recent week weights 1.0, each older week ×0.85
  const weights = sameDow.map((_, i) => Math.pow(0.85, i))
  const tw = weights.reduce((a, b) => a + b, 0)

  const wMean = sameDow.reduce((s, r, i) => s + r.cash_up_total * weights[i], 0) / tw
  const wVar  = sameDow.reduce((s, r, i) => s + weights[i] * Math.pow(r.cash_up_total - wMean, 2), 0) / tw
  const wStd  = Math.sqrt(wVar)

  const wCust = sameDow.reduce((s, r, i) => s + r.customer_count * weights[i], 0) / tw

  const round10 = (n: number) => Math.round(n / 10) * 10

  return {
    dow,
    label: DOW_FULL[dow],
    mid:       round10(wMean),
    min:       round10(Math.max(0, wMean - wStd)),
    max:       round10(wMean + wStd),
    customers: Math.round(wCust),
    avgTicket: wCust > 0 ? Math.round(wMean / wCust) : 0,
    confidence: Math.min(95, 30 + sameDow.length * 6),
    samples:   sameDow.length,
    history:   sameDow,
  }
}

/* ── build past-prediction accuracy using leave-one-out ─────── */
function buildAccuracy(rows: CashupRow[], weeksBack = 8): AccuracyPoint[] {
  const sorted = [...rows].sort((a, b) => b.cash_up_date.localeCompare(a.cash_up_date))
  const points: AccuracyPoint[] = []

  for (const target of sorted.slice(0, weeksBack)) {
    const dow = new Date(target.cash_up_date + 'T12:00:00').getDay()
    // exclude the target itself to simulate a true prediction
    const trainingRows = rows.filter(r => r.cash_up_date !== target.cash_up_date)
    const pred = predictDow(trainingRows, dow)
    if (!pred || pred.samples < 2) continue

    const errorPct = Math.round(Math.abs(target.cash_up_total - pred.mid) / pred.mid * 100)
    points.push({
      date: target.cash_up_date,
      label: `${DOW[dow]} ${target.cash_up_date.substring(5)}`,
      predicted: pred.mid,
      actual: target.cash_up_total,
      errorPct,
    })
  }
  return points
}

/* ── currency ───────────────────────────────────────────────── */
function cur(n: number) {
  return 'R ' + Math.round(n).toLocaleString('en-ZA')
}

/* ── confidence pill ─────────────────────────────────────────── */
function ConfPill({ pct }: { pct: number }) {
  const color = pct >= 70 ? '#166534' : pct >= 50 ? '#92400e' : '#6b7280'
  const bg    = pct >= 70 ? '#dcfce7' : pct >= 50 ? '#fef3c7' : '#f3f4f6'
  return (
    <span style={{ background: bg, color, borderRadius: 20, padding: '3px 10px', fontSize: 12, fontWeight: 700 }}>
      {pct}% confidence
    </span>
  )
}

/* ── range bar ───────────────────────────────────────────────── */
function RangeBar({ min, mid, max, globalMax }: { min: number; mid: number; max: number; globalMax: number }) {
  const pMin = (min / globalMax) * 100
  const pMid = (mid / globalMax) * 100
  const pMax = (max / globalMax) * 100
  return (
    <div style={{ position: 'relative', height: 8, background: '#f0f4f0', borderRadius: 100, overflow: 'visible', marginTop: 8 }}>
      {/* range band */}
      <div style={{ position: 'absolute', top: 0, left: `${pMin}%`, width: `${pMax - pMin}%`, height: '100%', background: 'rgba(26,92,56,0.18)', borderRadius: 100 }} />
      {/* mid marker */}
      <div style={{ position: 'absolute', top: -3, left: `${pMid}%`, transform: 'translateX(-50%)', width: 14, height: 14, borderRadius: '50%', background: PRIMARY, border: '2px solid #fff', boxShadow: '0 1px 4px rgba(0,0,0,0.18)' }} />
    </div>
  )
}

/* ── main page ───────────────────────────────────────────────── */
export default function PredictionsPage() {
  const { storeId: STORE_ID, ready: ctxReady } = useStoreContext() as { storeId: string; ready: boolean }
  const router = useRouter()

  const [loading,     setLoading]     = useState(true)
  const [history,     setHistory]     = useState<CashupRow[]>([])
  const [weekPreds,   setWeekPreds]   = useState<(DayPrediction | null)[]>([])
  const [accuracy,    setAccuracy]    = useState<AccuracyPoint[]>([])
  const [todayPred,   setTodayPred]   = useState<DayPrediction | null>(null)
  const [bestDay,     setBestDay]     = useState<DayPrediction | null>(null)
  const [slowDay,     setSlowDay]     = useState<DayPrediction | null>(null)
  const [trend4w,     setTrend4w]     = useState<number | null>(null)  // % change last 4w vs prior 4w
  const [accessDenied, setAccessDenied] = useState(false)

  const loadData = useCallback(async () => {
    if (!STORE_ID) return
    setLoading(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    // permission check (same pattern as performance page)
    const { data: device } = await supabase
      .from('store_devices').select('role').eq('store_id', STORE_ID).eq('user_id', user.id).maybeSingle()
    const userRole = device?.role || 'staff'
    const { data: permRow } = await supabase
      .from('store_role_permissions').select('permissions').eq('store_id', STORE_ID).eq('role', userRole).maybeSingle()
    const perms: Record<string, boolean> = permRow?.permissions || {}
    if (userRole !== 'manager' && userRole !== 'admin' && perms.performance === false) {
      setAccessDenied(true); setLoading(false); return
    }

    // fetch last ~90 days of cashups (enough for ~12 of each weekday)
    const ninetyDaysAgo = new Date()
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 100)
    const since = ninetyDaysAgo.toISOString().split('T')[0]

    const { data: rows } = await supabase
      .from('cash_ups')
      .select('cash_up_date, cash_up_total, customer_count, average_spend')
      .eq('store_id', STORE_ID)
      .gte('cash_up_date', since)
      .order('cash_up_date', { ascending: false })

    const data = (rows || []).filter(r => r.cash_up_total > 0)
    setHistory(data)

    if (data.length === 0) { setLoading(false); return }

    const todayDow = new Date().getDay()
    const preds = Array.from({ length: 7 }, (_, i) => predictDow(data, i))

    setTodayPred(predictDow(data, todayDow))
    setWeekPreds(preds)

    const acc = buildAccuracy(data, 10)
    setAccuracy(acc)

    // best / slowest day
    const validPreds = preds.filter(Boolean) as DayPrediction[]
    if (validPreds.length > 0) {
      setBestDay(validPreds.reduce((a, b) => a.mid > b.mid ? a : b))
      setSlowDay(validPreds.reduce((a, b) => a.mid < b.mid ? a : b))
    }

    // 4-week trend
    const sorted = [...data].sort((a, b) => a.cash_up_date.localeCompare(b.cash_up_date))
    const fourWeeksMs = 28 * 24 * 60 * 60 * 1000
    const now = Date.now()
    const last4w  = sorted.filter(r => now - new Date(r.cash_up_date + 'T12:00:00').getTime() < fourWeeksMs)
    const prior4w = sorted.filter(r => {
      const ms = now - new Date(r.cash_up_date + 'T12:00:00').getTime()
      return ms >= fourWeeksMs && ms < 2 * fourWeeksMs
    })
    if (last4w.length > 0 && prior4w.length > 0) {
      const avg4  = last4w.reduce((s, r)  => s + r.cash_up_total, 0) / last4w.length
      const avgP  = prior4w.reduce((s, r) => s + r.cash_up_total, 0) / prior4w.length
      setTrend4w(Math.round(((avg4 - avgP) / avgP) * 100))
    }

    setLoading(false)
  }, [STORE_ID, router])

  useEffect(() => { if (ctxReady) loadData() }, [ctxReady, loadData])

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

  const noData = history.length === 0
  const todayDow = new Date().getDay()
  const globalMax = Math.max(...(weekPreds.filter(Boolean) as DayPrediction[]).map(p => p.max), 1)

  // avg accuracy
  const avgAccuracy = accuracy.length > 0
    ? Math.round(accuracy.reduce((s, a) => s + (100 - a.errorPct), 0) / accuracy.length)
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
              <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 12 }}>AI-powered predictions from your trading history</div>
            </div>
          </div>
          {avgAccuracy !== null && (
            <div style={{ textAlign: 'right' }}>
              <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Model Accuracy</div>
              <div style={{ color: '#fff', fontSize: 24, fontWeight: 900 }}>{avgAccuracy}%</div>
            </div>
          )}
        </div>
      </div>

      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 40px 60px' }}>

        {noData ? (
          <div style={{ background: '#fff', borderRadius: 20, padding: '60px 40px', textAlign: 'center', border: '1.5px solid #e8f0e8' }}>
            <div style={{ fontSize: 64, marginBottom: 16 }}>📊</div>
            <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Not enough data yet</h2>
            <p style={{ color: '#6b7280', fontSize: 15, lineHeight: 1.6, maxWidth: 480, margin: '0 auto' }}>
              The forecast engine needs at least a few completed cash-ups to learn from. Keep capturing your daily cash-ups and predictions will start appearing within a week.
            </p>
          </div>
        ) : (
          <>
            {/* ── Today's forecast ── */}
            <div style={{ marginBottom: 32 }}>
              <h2 style={{ fontSize: 15, fontWeight: 800, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 16 }}>
                Today — {DOW_FULL[todayDow]}
              </h2>

              {todayPred ? (
                <div style={{ background: '#fff', borderRadius: 24, padding: '32px', border: '1.5px solid #e8f0e8', boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 20 }}>

                    {/* main number */}
                    <div>
                      <div style={{ fontSize: 13, color: '#6b7280', fontWeight: 600, marginBottom: 6 }}>Predicted sales today</div>
                      <div style={{ fontSize: 48, fontWeight: 900, color: PRIMARY, lineHeight: 1, letterSpacing: '-1px' }}>
                        {cur(todayPred.mid)}
                      </div>
                      <div style={{ fontSize: 15, color: '#9ca3af', marginTop: 6 }}>
                        Range: {cur(todayPred.min)} — {cur(todayPred.max)}
                      </div>
                      <div style={{ marginTop: 12 }}>
                        <ConfPill pct={todayPred.confidence} />
                        <span style={{ fontSize: 12, color: '#9ca3af', marginLeft: 8 }}>based on {todayPred.samples} previous {DOW_FULL[todayDow]}s</span>
                      </div>
                    </div>

                    {/* sub-metrics */}
                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                      <div style={{ background: '#f8faf8', borderRadius: 16, padding: '16px 20px', minWidth: 120 }}>
                        <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Customers</div>
                        <div style={{ fontSize: 28, fontWeight: 900, color: '#111' }}>~{todayPred.customers}</div>
                      </div>
                      <div style={{ background: '#f8faf8', borderRadius: 16, padding: '16px 20px', minWidth: 120 }}>
                        <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Avg Ticket</div>
                        <div style={{ fontSize: 28, fontWeight: 900, color: '#111' }}>{cur(todayPred.avgTicket)}</div>
                      </div>
                      {trend4w !== null && (
                        <div style={{ background: trend4w >= 0 ? '#f0fdf4' : '#fef2f2', borderRadius: 16, padding: '16px 20px', minWidth: 120 }}>
                          <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>4-Week Trend</div>
                          <div style={{ fontSize: 28, fontWeight: 900, color: trend4w >= 0 ? '#16a34a' : '#dc2626' }}>
                            {trend4w > 0 ? '+' : ''}{trend4w}%
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* range bar */}
                  <div style={{ marginTop: 24 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#9ca3af', marginBottom: 4 }}>
                      <span>{cur(todayPred.min)}</span>
                      <span style={{ fontWeight: 700, color: PRIMARY }}>Most likely: {cur(todayPred.mid)}</span>
                      <span>{cur(todayPred.max)}</span>
                    </div>
                    <RangeBar min={todayPred.min} mid={todayPred.mid} max={todayPred.max} globalMax={todayPred.max * 1.1} />
                  </div>
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
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#111', marginBottom: 8 }}>{DOW[dow]}</div>
                      <div style={{ fontSize: 11, color: '#9ca3af' }}>No data</div>
                    </div>
                  )
                  return (
                    <div key={dow} style={{ background: isToday ? PRIMARY : '#fff', borderRadius: 16, padding: '16px 12px', textAlign: 'center', border: `1.5px solid ${isToday ? PRIMARY : '#e8f0e8'}`, boxShadow: isToday ? '0 4px 20px rgba(26,92,56,0.25)' : 'none' }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: isToday ? '#fff' : '#111', marginBottom: 2 }}>{DOW[dow]}</div>
                      {isToday && <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)', marginBottom: 8, fontWeight: 600 }}>TODAY</div>}
                      {!isToday && <div style={{ marginBottom: 8 }} />}
                      <div style={{ fontSize: 15, fontWeight: 900, color: isToday ? '#fff' : PRIMARY }}>{cur(pred.mid)}</div>
                      <div style={{ fontSize: 11, color: isToday ? 'rgba(255,255,255,0.65)' : '#9ca3af', marginTop: 2 }}>~{pred.customers} cust</div>
                      <RangeBar min={pred.min} mid={pred.mid} max={pred.max} globalMax={globalMax} />
                      <div style={{ marginTop: 8 }}>
                        <span style={{ fontSize: 10, background: isToday ? 'rgba(255,255,255,0.15)' : '#f0f4f0', color: isToday ? '#fff' : '#6b7280', borderRadius: 20, padding: '2px 7px', fontWeight: 700 }}>
                          {pred.confidence}%
                        </span>
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
                    <div style={{ fontSize: 22, fontWeight: 900, color: trend4w >= 0 ? '#166534' : '#dc2626' }}>
                      {trend4w > 0 ? '+' : ''}{trend4w}%
                    </div>
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
                    const good = pt.errorPct <= 10
                    const ok   = pt.errorPct <= 20
                    return (
                      <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', padding: '14px 24px', borderBottom: i < accuracy.length - 1 ? '1px solid #f0f4f0' : 'none', alignItems: 'center' }}>
                        <div style={{ fontSize: 13, color: '#6b7280' }}>{pt.label}</div>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{cur(pt.predicted)}</div>
                        <div style={{ fontSize: 13, fontWeight: 700 }}>{cur(pt.actual)}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: good ? '#16a34a' : ok ? '#d97706' : '#dc2626' }}>
                            {pt.errorPct}% off
                          </span>
                          <span style={{ fontSize: 11, background: good ? '#dcfce7' : ok ? '#fef3c7' : '#fee2e2', color: good ? '#166534' : ok ? '#92400e' : '#991b1b', borderRadius: 20, padding: '2px 8px', fontWeight: 700 }}>
                            {good ? '✓ Good' : ok ? '~ Fair' : '× Wide'}
                          </span>
                        </div>
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
            <div>
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
                          <span style={{ fontSize: 12, color: '#9ca3af' }}>{pred.samples} data points</span>
                        </div>
                        <div style={{ fontSize: 12, color: '#6b7280' }}>
                          ~{pred.customers} customers · {cur(pred.avgTicket)} avg ticket
                        </div>
                        <RangeBar min={pred.min} mid={pred.mid} max={pred.max} globalMax={globalMax} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div style={{ marginTop: 24, padding: '14px 20px', background: '#fffbeb', borderRadius: 14, border: '1.5px solid #fde68a', fontSize: 13, color: '#92400e', lineHeight: 1.6 }}>
              <strong>How this works:</strong> Predictions use a weighted average of your last {Math.max(...weekPreds.filter(Boolean).map(p => p!.samples))} trading days on the same weekday, with more recent weeks given higher weight. The confidence score and accuracy improve automatically as more cash-ups are captured. Phase 2 (15:00 snapshot + AI photo analysis) unlocks once enough baseline data exists.
            </div>
          </>
        )}
      </main>
    </div>
  )
}
