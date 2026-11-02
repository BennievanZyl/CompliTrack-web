'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { useStoreContext } from '@/lib/store-context'

/* ── types ─────────────────────────────────────────────────── */
type MetricPair = { customers: number | null; sales: number | null }
type Criterion = { key: string; label: string; emoji: string }
type EvalRecord = {
  eval_date: string
  overall_score: number | null
  notes: string | null
  punctuality: number | null
  attitude: number | null
  performance: number | null
  appearance: number | null
  teamwork: number | null
  scores: Record<string, number> | null
}
type AttRecord = { work_date: string; is_late: boolean; clock_in: string | null }
type EmpDetail = { evals: EvalRecord[]; attendance: AttRecord[] }
type StaffStat = {
  id: string; name: string; role: string
  shifts: number; punctualityPct: number | null; lastScore: number | null
}

/* ── constants ─────────────────────────────────────────────── */
const DEFAULT_CRITERIA: Criterion[] = [
  { key: 'punctuality', label: 'Punctuality', emoji: '⏰' },
  { key: 'attitude',    label: 'Attitude',    emoji: '😊' },
  { key: 'performance', label: 'Performance', emoji: '🎯' },
  { key: 'appearance',  label: 'Appearance',  emoji: '👔' },
  { key: 'teamwork',    label: 'Teamwork',    emoji: '🤝' },
]

/* ── helpers ─────────────────────────────────────────────────── */
function fmt(d: Date): string { return d.toISOString().split('T')[0] }
function addDays(d: Date, n: number): Date { const r = new Date(d); r.setDate(r.getDate() + n); return r }
function addMonths(d: Date, n: number): Date { const r = new Date(d); r.setMonth(r.getMonth() + n); return r }
function addYears(d: Date, n: number): Date { const r = new Date(d); r.setFullYear(r.getFullYear() + n); return r }

function pctChange(now: number | null, prev: number | null): number | null {
  if (!prev || prev === 0 || now === null || now === undefined) return null
  return Math.round(((now - prev) / prev) * 100)
}

function getScore(ev: EvalRecord, crit: Criterion): number | null {
  if (ev.scores && crit.key in ev.scores) return (ev.scores as Record<string, number>)[crit.key]
  const lbl = crit.label.toLowerCase()
  if (lbl === 'punctuality') return ev.punctuality ?? null
  if (lbl === 'attitude')    return ev.attitude ?? null
  if (lbl === 'performance') return ev.performance ?? null
  if (lbl === 'appearance')  return ev.appearance ?? null
  if (lbl === 'teamwork')    return ev.teamwork ?? null
  return null
}

function scoreColor(s: number | null): string {
  if (s === null) return '#9ca3af'
  if (s >= 4) return '#16a34a'
  if (s >= 3) return '#d97706'
  return '#dc2626'
}

/* ── sub-components ──────────────────────────────────────────── */
function PctTile({ pct, label }: { pct: number | null; label: string }) {
  if (pct === null) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
        <div style={{ fontSize: 12, color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
        <div style={{ fontSize: 22, fontWeight: 900, color: '#d1d5db' }}>—</div>
        <div style={{ fontSize: 11, color: '#d1d5db' }}>No data</div>
      </div>
    )
  }
  const up = pct >= 0
  const color = up ? '#16a34a' : '#dc2626'
  const bg = up ? '#f0fdf4' : '#fef2f2'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, background: bg, borderRadius: 12, padding: '10px 14px' }}>
      <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 900, color, lineHeight: 1 }}>
        {up ? '↑' : '↓'}{Math.abs(pct)}%
      </div>
      <div style={{ fontSize: 11, fontWeight: 700, color }}>{up ? 'Growth' : 'Decline'}</div>
    </div>
  )
}

function CompareCard({ title, todayData, prevData, noDataLabel }: {
  title: string; todayData: MetricPair | null; prevData: MetricPair | null; noDataLabel: string
}) {
  const customerPct = todayData && prevData ? pctChange(todayData.customers, prevData.customers) : null
  const salesPct    = todayData && prevData ? pctChange(todayData.sales,     prevData.sales)     : null
  const hasAny = todayData !== null && prevData !== null
  return (
    <div style={{ background: '#fff', borderRadius: 16, padding: '20px 24px', border: '1.5px solid #e8f0e8', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#6b7280', marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{title}</div>
      {!hasAny ? (
        <div style={{ textAlign: 'center', color: '#9ca3af', fontSize: 13, padding: '12px 0' }}>{noDataLabel}</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <PctTile pct={customerPct} label="Customers" />
          <PctTile pct={salesPct}    label="Sales" />
        </div>
      )}
    </div>
  )
}

function TrendBar({ pct, day }: { pct: number | null; day: string }) {
  const up     = pct === null ? null : pct >= 0
  const height = pct === null ? 4 : Math.max(4, Math.min(60, Math.abs(pct) * 1.5))
  const color     = up === null ? '#e5e7eb' : up ? '#22c55e' : '#ef4444'
  const textColor = up === null ? '#9ca3af' : up ? '#16a34a' : '#dc2626'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flex: 1 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: textColor, height: 18 }}>
        {pct === null ? '' : `${pct > 0 ? '+' : ''}${pct}%`}
      </div>
      <div style={{ width: 32, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', height: 60 }}>
        <div style={{ width: '100%', height, background: color, borderRadius: 4, transition: 'height 0.3s' }} />
      </div>
      <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600 }}>{day}</div>
    </div>
  )
}

/* ── main page ───────────────────────────────────────────────── */
export default function PerformancePage() {
  const { storeId: STORE_ID, ready: ctxReady } = useStoreContext() as { storeId: string; ready: boolean }
  const router = useRouter()

  const [loading,      setLoading]      = useState(true)
  const [accessDenied, setAccessDenied] = useState(false)

  const [todayData,     setTodayData]     = useState<MetricPair | null>(null)
  const [lastWeekData,  setLastWeekData]  = useState<MetricPair | null>(null)
  const [lastMonthData, setLastMonthData] = useState<MetricPair | null>(null)
  const [lastYearData,  setLastYearData]  = useState<MetricPair | null>(null)

  const [weekTrend,      setWeekTrend]      = useState<{ day: string; pct: number | null }[]>([])
  const [punctualityPct, setPunctualityPct] = useState<number | null>(null)
  const [shiftsCount,    setShiftsCount]    = useState(0)

  const [staffStats,    setStaffStats]    = useState<StaffStat[]>([])
  const [criteria,      setCriteria]      = useState<Criterion[]>(DEFAULT_CRITERIA)
  const [expandedId,    setExpandedId]    = useState<string | null>(null)
  const [empDetails,    setEmpDetails]    = useState<Record<string, EmpDetail>>({})
  const [detailLoading, setDetailLoading] = useState<string | null>(null)

  /* load per-employee detail on card tap */
  const loadEmpDetails = useCallback(async (empId: string) => {
    if (expandedId === empId) { setExpandedId(null); return }
    setExpandedId(empId)
    if (empDetails[empId]) return   // already cached

    setDetailLoading(empId)

    const [evalsRes, attRes] = await Promise.all([
      supabase
        .from('employee_evaluations')
        .select('eval_date, overall_score, notes, punctuality, attitude, performance, appearance, teamwork, scores')
        .eq('employee_id', empId)
        .eq('store_id', STORE_ID)
        .order('eval_date', { ascending: false }),
      supabase
        .from('attendance')
        .select('work_date, is_late, clock_in')
        .eq('employee_id', empId)
        .eq('store_id', STORE_ID)
        .order('work_date', { ascending: false })
        .limit(30),
    ])

    setEmpDetails(prev => ({
      ...prev,
      [empId]: { evals: evalsRes.data || [], attendance: attRes.data || [] },
    }))
    setDetailLoading(null)
  }, [expandedId, empDetails, STORE_ID])

  /* main data load */
  const loadData = useCallback(async () => {
    if (!STORE_ID) return
    setLoading(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const { data: device } = await supabase
      .from('store_devices').select('role').eq('store_id', STORE_ID).eq('user_id', user.id).maybeSingle()
    const userRole = device?.role || 'staff'

    const { data: permRow } = await supabase
      .from('store_role_permissions').select('permissions').eq('store_id', STORE_ID).eq('role', userRole).maybeSingle()
    const perms: Record<string, boolean> = permRow?.permissions || {}

    if (userRole !== 'manager' && userRole !== 'admin' && perms.performance === false) {
      setAccessDenied(true); setLoading(false); return
    }

    const today   = new Date()
    const todayStr = fmt(today)
    const lwStr    = fmt(addDays(today, -7))
    const lmStr    = fmt(addMonths(today, -1))
    const lyStr    = fmt(addYears(today, -1))

    const { data: mainRows } = await supabase
      .from('cash_ups')
      .select('cash_up_date, customer_count, cash_up_total')
      .eq('store_id', STORE_ID)
      .in('cash_up_date', [todayStr, lwStr, lmStr, lyStr])

    const byDate   = new Map((mainRows || []).map(r => [r.cash_up_date, r]))
    const toMetric = (r: { customer_count: number; cash_up_total: number } | undefined): MetricPair | null =>
      r ? { customers: r.customer_count ?? null, sales: r.cash_up_total ?? null } : null

    setTodayData(toMetric(byDate.get(todayStr)))
    setLastWeekData(toMetric(byDate.get(lwStr)))
    setLastMonthData(toMetric(byDate.get(lmStr)))
    setLastYearData(toMetric(byDate.get(lyStr)))

    const trendDays = Array.from({ length: 7 }, (_, i) => {
      const d = addDays(today, -(6 - i))
      return { thisDay: fmt(d), prevDay: fmt(addDays(d, -7)), label: d.toLocaleDateString('en-ZA', { weekday: 'short' }) }
    })
    const { data: trendRows } = await supabase
      .from('cash_ups').select('cash_up_date, cash_up_total').eq('store_id', STORE_ID)
      .in('cash_up_date', [...trendDays.map(d => d.thisDay), ...trendDays.map(d => d.prevDay)])

    const trendMap = new Map((trendRows || []).map(r => [r.cash_up_date, r.cash_up_total]))
    setWeekTrend(trendDays.map(d => ({
      day: d.label,
      pct: pctChange(trendMap.get(d.thisDay) ?? null, trendMap.get(d.prevDay) ?? null),
    })))

    const monthStart = todayStr.substring(0, 8) + '01'
    const { data: attRows } = await supabase
      .from('attendance').select('is_late')
      .eq('store_id', STORE_ID).gte('work_date', monthStart).lte('work_date', todayStr)

    if (attRows && attRows.length > 0) {
      const lateCount = attRows.filter(a => a.is_late).length
      setPunctualityPct(Math.round(((attRows.length - lateCount) / attRows.length) * 100))
      setShiftsCount(attRows.length)
    }

    /* load eval criteria (may not exist yet — silently fall back to defaults) */
    const { data: criteriaRows, error: criteriaErr } = await supabase
      .from('eval_criteria').select('id, label, emoji, sort_order')
      .eq('store_id', STORE_ID).eq('is_active', true).order('sort_order')
    if (!criteriaErr && criteriaRows && criteriaRows.length > 0) {
      setCriteria(criteriaRows.map(c => ({ key: c.id, label: c.label, emoji: c.emoji || '⭐' })))
    }

    /* individual staff stats */
    const [empsRes, allAttRes, evalsRes] = await Promise.all([
      supabase.from('employees').select('id, full_name, role').eq('store_id', STORE_ID).eq('is_active', true).order('full_name'),
      supabase.from('attendance').select('employee_id, is_late').eq('store_id', STORE_ID).gte('work_date', monthStart).lte('work_date', todayStr),
      supabase.from('employee_evaluations').select('employee_id, overall_score').eq('store_id', STORE_ID).order('eval_date', { ascending: false }),
    ])

    if (empsRes.data && empsRes.data.length > 0) {
      const attByEmp = new Map<string, { total: number; late: number }>()
      for (const a of (allAttRes.data || [])) {
        const cur = attByEmp.get(a.employee_id) || { total: 0, late: 0 }
        attByEmp.set(a.employee_id, { total: cur.total + 1, late: cur.late + (a.is_late ? 1 : 0) })
      }
      const evalByEmp = new Map<string, number>()
      for (const e of (evalsRes.data || [])) {
        if (!evalByEmp.has(e.employee_id)) evalByEmp.set(e.employee_id, e.overall_score)
      }
      setStaffStats(empsRes.data.map(emp => {
        const att = attByEmp.get(emp.id)
        const pct = att && att.total > 0 ? Math.round(((att.total - att.late) / att.total) * 100) : null
        return { id: emp.id, name: emp.full_name, role: emp.role, shifts: att?.total || 0, punctualityPct: pct, lastScore: evalByEmp.get(emp.id) ?? null }
      }))
    }

    setLoading(false)
  }, [STORE_ID, router])

  useEffect(() => { if (ctxReady && STORE_ID) loadData() }, [ctxReady, STORE_ID, loadData])

  /* ── early returns ── */
  if (accessDenied) return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0a1f12 0%, #1a5c38 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
      <span style={{ fontSize: 48 }}>🔒</span>
      <div style={{ color: '#fff', fontWeight: 700, fontSize: 18 }}>Performance access not enabled</div>
      <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14 }}>Contact your manager to enable Performance for your role.</div>
      <button onClick={() => router.back()} style={{ marginTop: 8, background: 'rgba(255,255,255,0.15)', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 24px', cursor: 'pointer', fontWeight: 600 }}>← Go Back</button>
    </div>
  )

  if (loading) return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0a1f12 0%, #1a5c38 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: '#fff', fontSize: 16, fontWeight: 600 }}>Loading performance data…</div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#f0f4f0' }}>

      {/* ── header ── */}
      <div style={{ background: 'linear-gradient(135deg, #0a1f12 0%, #1a5c38 100%)', padding: '0 20px' }}>
        <div style={{ maxWidth: 680, margin: '0 auto', paddingTop: 20, paddingBottom: 28 }}>
          <button onClick={() => router.back()} style={{ background: 'rgba(255,255,255,0.12)', border: 'none', color: '#fff', borderRadius: 8, padding: '6px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', marginBottom: 20 }}>← Back</button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ background: 'rgba(255,255,255,0.12)', borderRadius: 14, width: 52, height: 52, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26 }}>🏆</div>
            <div>
              <h1 style={{ color: '#fff', fontSize: 24, fontWeight: 900, margin: 0, lineHeight: 1.1 }}>Performance</h1>
              <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 13, marginTop: 4 }}>Store trends vs. previous periods — percentages only</div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 680, margin: '0 auto', padding: '24px 20px 48px' }}>

        {/* ── store comparisons ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <span style={{ fontSize: 18 }}>🏪</span>
          <h2 style={{ fontSize: 17, fontWeight: 800, color: '#111', margin: 0 }}>Today vs. Previous Periods</h2>
        </div>

        {todayData === null && (
          <div style={{ background: '#fff', borderRadius: 14, padding: '20px 24px', marginBottom: 16, border: '1.5px solid #e8f0e8', color: '#9ca3af', fontSize: 13, textAlign: 'center' }}>
            No cash-up captured for today yet. Check back after today&apos;s cash-up is done.
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 32 }}>
          <CompareCard title="vs Same Day Last Week"  todayData={todayData} prevData={lastWeekData}  noDataLabel="No data for last week's same day" />
          <CompareCard title="vs Same Day Last Month" todayData={todayData} prevData={lastMonthData} noDataLabel="No data for last month's same day" />
          <CompareCard title="vs Same Day Last Year"  todayData={todayData} prevData={lastYearData}  noDataLabel="No data for last year's same day" />
        </div>

        {/* ── 7-day trend ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <span style={{ fontSize: 18 }}>📊</span>
          <h2 style={{ fontSize: 17, fontWeight: 800, color: '#111', margin: 0 }}>7-Day Sales Trend vs Last Week</h2>
        </div>

        <div style={{ background: '#fff', borderRadius: 16, padding: '20px 24px 24px', border: '1.5px solid #e8f0e8', boxShadow: '0 1px 4px rgba(0,0,0,0.05)', marginBottom: 32 }}>
          <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 16 }}>Each bar shows sales % change vs the same day last week. Green = better · Red = down</div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', justifyContent: 'space-between' }}>
            {weekTrend.map((d, i) => <TrendBar key={i} pct={d.pct} day={d.day} />)}
          </div>
        </div>

        {/* ── team punctuality ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <span style={{ fontSize: 18 }}>👥</span>
          <h2 style={{ fontSize: 17, fontWeight: 800, color: '#111', margin: 0 }}>Team Performance This Month</h2>
        </div>

        <div style={{ background: '#fff', borderRadius: 16, padding: '24px', border: '1.5px solid #e8f0e8', boxShadow: '0 1px 4px rgba(0,0,0,0.05)', marginBottom: 32 }}>
          {shiftsCount === 0 ? (
            <div style={{ color: '#9ca3af', fontSize: 13, textAlign: 'center' }}>No attendance records captured this month yet.</div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#111' }}>Team Punctuality</div>
                  <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>Shifts started on time this month</div>
                </div>
                <div style={{ fontSize: 32, fontWeight: 900, color: punctualityPct !== null && punctualityPct >= 80 ? '#16a34a' : '#dc2626' }}>
                  {punctualityPct ?? '—'}%
                </div>
              </div>
              <div style={{ height: 8, background: '#f0f0f0', borderRadius: 100, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${punctualityPct ?? 0}%`, background: punctualityPct !== null && punctualityPct >= 80 ? 'linear-gradient(90deg, #1a5c38, #22c55e)' : 'linear-gradient(90deg, #dc2626, #f87171)', borderRadius: 100, transition: 'width 0.5s ease' }} />
              </div>
              <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 8 }}>Based on {shiftsCount} shift{shiftsCount !== 1 ? 's' : ''} recorded this month</div>
            </>
          )}
        </div>

        {/* ── individual staff ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 18 }}>👤</span>
          <h2 style={{ fontSize: 17, fontWeight: 800, color: '#111', margin: 0 }}>Individual Performance</h2>
        </div>
        <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 14 }}>Tap a card to see full evaluation history &amp; attendance log</div>

        {staffStats.length === 0 ? (
          <div style={{ background: '#fff', borderRadius: 14, padding: '20px 24px', border: '1.5px solid #e8f0e8', color: '#9ca3af', fontSize: 13, textAlign: 'center', marginBottom: 16 }}>
            No staff records found for this store.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
            {staffStats.map((s) => {
              const good = s.punctualityPct !== null && s.punctualityPct >= 80
              const bad  = s.punctualityPct !== null && s.punctualityPct < 80
              const pctColor = good ? '#16a34a' : bad ? '#dc2626' : '#9ca3af'
              const sc        = scoreColor(s.lastScore)
              const isExpanded    = expandedId === s.id
              const isLoadingThis = detailLoading === s.id
              const detail        = empDetails[s.id]

              return (
                <div key={s.id} style={{ background: '#fff', borderRadius: 14, border: `1.5px solid ${isExpanded ? '#1a5c38' : '#e8f0e8'}`, overflow: 'hidden', boxShadow: isExpanded ? '0 4px 16px rgba(26,92,56,0.12)' : '0 1px 3px rgba(0,0,0,0.04)', transition: 'border-color 0.2s, box-shadow 0.2s' }}>

                  {/* card header — always visible, clickable */}
                  <button
                    onClick={() => loadEmpDetails(s.id)}
                    style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, textAlign: 'left' }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 800, color: '#111', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</div>
                      <div style={{ fontSize: 12, color: '#9ca3af', textTransform: 'capitalize' }}>{s.role} · {s.shifts} shift{s.shifts !== 1 ? 's' : ''} this month</div>
                      {s.shifts > 0 && (
                        <div style={{ marginTop: 8 }}>
                          <div style={{ height: 5, background: '#f0f0f0', borderRadius: 100, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${s.punctualityPct ?? 0}%`, background: good ? '#22c55e' : bad ? '#ef4444' : '#e5e7eb', borderRadius: 100 }} />
                          </div>
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                      <div style={{ fontSize: 20, fontWeight: 900, color: pctColor }}>
                        {s.punctualityPct === null ? '—' : `${s.punctualityPct}%`}
                      </div>
                      {s.lastScore !== null && (
                        <div style={{ fontSize: 11, fontWeight: 700, color: sc, background: `${sc}18`, borderRadius: 6, padding: '2px 8px' }}>
                          ★ {s.lastScore.toFixed(1)}/5
                        </div>
                      )}
                    </div>
                    <div style={{ fontSize: 16, color: '#9ca3af', flexShrink: 0, transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▾</div>
                  </button>

                  {/* expanded detail */}
                  {isExpanded && (
                    <div style={{ borderTop: '1px solid #e8f0e8', background: '#f9fdf9' }}>
                      {isLoadingThis ? (
                        <div style={{ padding: '20px', textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>Loading history…</div>
                      ) : detail ? (
                        <div style={{ padding: '16px 20px 20px', display: 'flex', flexDirection: 'column', gap: 20 }}>

                          {/* recent shifts */}
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 10 }}>📅 Recent Shifts</div>
                            {detail.attendance.length === 0 ? (
                              <div style={{ fontSize: 12, color: '#9ca3af' }}>No attendance records found.</div>
                            ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                {detail.attendance.map((a, idx) => {
                                  const d = new Date(a.work_date + 'T00:00:00')
                                  const lbl = d.toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short' })
                                  return (
                                    <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 12px', background: '#fff', borderRadius: 8, border: '1px solid #e8f0e8' }}>
                                      <div style={{ fontSize: 12, color: '#374151', fontWeight: 600 }}>{lbl}</div>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        {a.clock_in && <div style={{ fontSize: 11, color: '#9ca3af' }}>{a.clock_in.slice(0, 5)}</div>}
                                        <div style={{ fontSize: 11, fontWeight: 700, color: a.is_late ? '#dc2626' : '#16a34a', background: a.is_late ? '#fef2f2' : '#f0fdf4', borderRadius: 6, padding: '2px 8px' }}>
                                          {a.is_late ? '⏰ Late' : '✅ On time'}
                                        </div>
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                          </div>

                          {/* evaluation history */}
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 10 }}>⭐ Evaluation History</div>
                            {detail.evals.length === 0 ? (
                              <div style={{ fontSize: 12, color: '#9ca3af' }}>No evaluations on record yet.</div>
                            ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                {detail.evals.map((ev, idx) => {
                                  const d = new Date(ev.eval_date + 'T00:00:00')
                                  const dateLabel = d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' })
                                  const ovColor   = scoreColor(ev.overall_score)
                                  return (
                                    <div key={idx} style={{ background: '#fff', borderRadius: 10, border: '1px solid #e8f0e8', overflow: 'hidden' }}>
                                      {/* eval header */}
                                      <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: `${ovColor}0d`, borderBottom: '1px solid #e8f0e8' }}>
                                        <div style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>{dateLabel}</div>
                                        <div style={{ fontSize: 15, fontWeight: 900, color: ovColor }}>★ {ev.overall_score?.toFixed(1) ?? '—'}/5</div>
                                      </div>
                                      {/* per-criterion scores */}
                                      <div style={{ padding: '12px 14px' }}>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))', gap: 8 }}>
                                          {criteria.map(crit => {
                                            const val = getScore(ev, crit)
                                            const c   = scoreColor(val)
                                            return (
                                              <div key={crit.key} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                                                <div style={{ fontSize: 10, color: '#6b7280', fontWeight: 600, textAlign: 'center', lineHeight: 1.3 }}>{crit.emoji}</div>
                                                <div style={{ fontSize: 10, color: '#6b7280', textAlign: 'center', lineHeight: 1.2 }}>{crit.label}</div>
                                                <div style={{ fontSize: 17, fontWeight: 800, color: c }}>{val !== null ? val : '—'}</div>
                                                <div style={{ width: '100%', height: 3, background: '#f0f0f0', borderRadius: 100, overflow: 'hidden' }}>
                                                  <div style={{ height: '100%', width: val !== null ? `${(val / 5) * 100}%` : '0%', background: c, borderRadius: 100 }} />
                                                </div>
                                              </div>
                                            )
                                          })}
                                        </div>
                                        {ev.notes && (
                                          <div style={{ marginTop: 10, padding: '8px 10px', background: '#f9fdf9', borderRadius: 8, fontSize: 12, color: '#6b7280', lineHeight: 1.5, fontStyle: 'italic' }}>
                                            &ldquo;{ev.notes}&rdquo;
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                          </div>

                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* monitoring notice */}
        <div style={{ background: 'linear-gradient(135deg, #0a1f12 0%, #1a5c38 100%)', borderRadius: 16, padding: '18px 22px', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
          <span style={{ fontSize: 22, flexShrink: 0 }}>👁️</span>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', lineHeight: 1.6 }}>
            <strong style={{ color: '#fff' }}>Performance is tracked individually.</strong> Attendance, punctuality and evaluation scores are visible to your manager in the Time &amp; Attendance and People modules. Regular evaluations are conducted to help every team member grow.
          </div>
        </div>

      </div>
    </div>
  )
}
