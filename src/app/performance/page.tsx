'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { useStoreContext } from '@/lib/store-context'

/* ── helpers ─────────────────────────────────────────────── */
function fmt(d: Date): string { return d.toISOString().split('T')[0] }

function addDays(d: Date, n: number): Date {
  const r = new Date(d); r.setDate(r.getDate() + n); return r
}
function addMonths(d: Date, n: number): Date {
  const r = new Date(d); r.setMonth(r.getMonth() + n); return r
}
function addYears(d: Date, n: number): Date {
  const r = new Date(d); r.setFullYear(r.getFullYear() + n); return r
}

function pctChange(now: number | null, prev: number | null): number | null {
  if (!prev || prev === 0 || now === null || now === undefined) return null
  return Math.round(((now - prev) / prev) * 100)
}

/* ── sub-components ──────────────────────────────────────── */
type MetricPair = { customers: number | null; sales: number | null }

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

function CompareCard({
  title,
  todayData,
  prevData,
  noDataLabel,
}: {
  title: string
  todayData: MetricPair | null
  prevData: MetricPair | null
  noDataLabel: string
}) {
  const customerPct = todayData && prevData ? pctChange(todayData.customers, prevData.customers) : null
  const salesPct = todayData && prevData ? pctChange(todayData.sales, prevData.sales) : null
  const hasAny = todayData !== null && prevData !== null

  return (
    <div style={{
      background: '#fff',
      borderRadius: 16,
      padding: '20px 24px',
      border: '1.5px solid #e8f0e8',
      boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
    }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#6b7280', marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {title}
      </div>
      {!hasAny ? (
        <div style={{ textAlign: 'center', color: '#9ca3af', fontSize: 13, padding: '12px 0' }}>{noDataLabel}</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <PctTile pct={customerPct} label="Customers" />
          <PctTile pct={salesPct} label="Sales" />
        </div>
      )}
    </div>
  )
}

function TrendBar({ pct, day }: { pct: number | null; day: string }) {
  const up = pct === null ? null : pct >= 0
  const height = pct === null ? 4 : Math.max(4, Math.min(60, Math.abs(pct) * 1.5))
  const color = up === null ? '#e5e7eb' : up ? '#22c55e' : '#ef4444'
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

/* ── main page ───────────────────────────────────────────── */
export default function PerformancePage() {
  const { storeId: STORE_ID, ready: ctxReady } = useStoreContext() as { storeId: string; ready: boolean }
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [accessDenied, setAccessDenied] = useState(false)

  const [todayData, setTodayData] = useState<MetricPair | null>(null)
  const [lastWeekData, setLastWeekData] = useState<MetricPair | null>(null)
  const [lastMonthData, setLastMonthData] = useState<MetricPair | null>(null)
  const [lastYearData, setLastYearData] = useState<MetricPair | null>(null)

  const [weekTrend, setWeekTrend] = useState<{ day: string; pct: number | null }[]>([])
  const [punctualityPct, setPunctualityPct] = useState<number | null>(null)
  const [shiftsCount, setShiftsCount] = useState(0)

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
      setAccessDenied(true)
      setLoading(false)
      return
    }

    const today = new Date()
    const todayStr = fmt(today)
    const lwStr = fmt(addDays(today, -7))
    const lmStr = fmt(addMonths(today, -1))
    const lyStr = fmt(addYears(today, -1))

    const compareDates = [todayStr, lwStr, lmStr, lyStr]
    const { data: mainRows } = await supabase
      .from('cash_ups')
      .select('cash_up_date, customer_count, cash_up_total')
      .eq('store_id', STORE_ID)
      .in('cash_up_date', compareDates)

    const byDate = new Map((mainRows || []).map(r => [r.cash_up_date, r]))
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
    const trendDates = [...trendDays.map(d => d.thisDay), ...trendDays.map(d => d.prevDay)]
    const { data: trendRows } = await supabase
      .from('cash_ups')
      .select('cash_up_date, cash_up_total')
      .eq('store_id', STORE_ID)
      .in('cash_up_date', trendDates)

    const trendMap = new Map((trendRows || []).map(r => [r.cash_up_date, r.cash_up_total]))
    setWeekTrend(trendDays.map(d => ({
      day: d.label,
      pct: pctChange(trendMap.get(d.thisDay) ?? null, trendMap.get(d.prevDay) ?? null),
    })))

    const monthStart = todayStr.substring(0, 8) + '01'
    const { data: attRows } = await supabase
      .from('attendance')
      .select('is_late')
      .eq('store_id', STORE_ID)
      .gte('work_date', monthStart)
      .lte('work_date', todayStr)

    if (attRows && attRows.length > 0) {
      const lateCount = attRows.filter(a => a.is_late).length
      setPunctualityPct(Math.round(((attRows.length - lateCount) / attRows.length) * 100))
      setShiftsCount(attRows.length)
    }

    setLoading(false)
  }, [STORE_ID, router])

  useEffect(() => {
    if (ctxReady && STORE_ID) loadData()
  }, [ctxReady, STORE_ID, loadData])

  if (accessDenied) {
    return (
      <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0a1f12 0%, #1a5c38 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
        <span style={{ fontSize: 48 }}>🔒</span>
        <div style={{ color: '#fff', fontWeight: 700, fontSize: 18 }}>Performance access not enabled</div>
        <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14 }}>Contact your manager to enable Performance for your role.</div>
        <button onClick={() => router.back()} style={{ marginTop: 8, background: 'rgba(255,255,255,0.15)', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 24px', cursor: 'pointer', fontWeight: 600 }}>← Go Back</button>
      </div>
    )
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0a1f12 0%, #1a5c38 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#fff', fontSize: 16, fontWeight: 600 }}>Loading performance data…</div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f0f4f0' }}>

      <div style={{ background: 'linear-gradient(135deg, #0a1f12 0%, #1a5c38 100%)', padding: '0 20px' }}>
        <div style={{ maxWidth: 680, margin: '0 auto', paddingTop: 20, paddingBottom: 28 }}>
          <button
            onClick={() => router.back()}
            style={{ background: 'rgba(255,255,255,0.12)', border: 'none', color: '#fff', borderRadius: 8, padding: '6px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', marginBottom: 20 }}
          >
            ← Back
          </button>
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

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <span style={{ fontSize: 18 }}>🏪</span>
          <h2 style={{ fontSize: 17, fontWeight: 800, color: '#111', margin: 0 }}>Today vs. Previous Periods</h2>
        </div>

        {todayData === null && (
          <div style={{ background: '#fff', borderRadius: 14, padding: '20px 24px', marginBottom: 16, border: '1.5px solid #e8f0e8', color: '#9ca3af', fontSize: 13, textAlign: 'center' }}>
            No cash-up captured for today yet. Check back after today's cash-up is done.
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 32 }}>
          <CompareCard
            title="vs Same Day Last Week"
            todayData={todayData}
            prevData={lastWeekData}
            noDataLabel="No data for last week's same day"
          />
          <CompareCard
            title="vs Same Day Last Month"
            todayData={todayData}
            prevData={lastMonthData}
            noDataLabel="No data for last month's same day"
          />
          <CompareCard
            title="vs Same Day Last Year"
            todayData={todayData}
            prevData={lastYearData}
            noDataLabel="No data for last year's same day"
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <span style={{ fontSize: 18 }}>📊</span>
          <h2 style={{ fontSize: 17, fontWeight: 800, color: '#111', margin: 0 }}>7-Day Sales Trend vs Last Week</h2>
        </div>

        <div style={{ background: '#fff', borderRadius: 16, padding: '20px 24px 24px', border: '1.5px solid #e8f0e8', boxShadow: '0 1px 4px rgba(0,0,0,0.05)', marginBottom: 32 }}>
          <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 16 }}>
            Each bar shows sales % change vs the same day last week. Green = better · Red = down
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', justifyContent: 'space-between' }}>
            {weekTrend.map((d, i) => <TrendBar key={i} pct={d.pct} day={d.day} />)}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <span style={{ fontSize: 18 }}>👥</span>
          <h2 style={{ fontSize: 17, fontWeight: 800, color: '#111', margin: 0 }}>Team Performance This Month</h2>
        </div>

        <div style={{ background: '#fff', borderRadius: 16, padding: '24px', border: '1.5px solid #e8f0e8', boxShadow: '0 1px 4px rgba(0,0,0,0.05)', marginBottom: 16 }}>
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
                <div style={{
                  height: '100%',
                  width: `${punctualityPct ?? 0}%`,
                  background: punctualityPct !== null && punctualityPct >= 80 ? 'linear-gradient(90deg, #1a5c38, #22c55e)' : 'linear-gradient(90deg, #dc2626, #f87171)',
                  borderRadius: 100,
                  transition: 'width 0.5s ease',
                }} />
              </div>
              <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 8 }}>Based on {shiftsCount} shift{shiftsCount !== 1 ? 's' : ''} recorded this month</div>
            </>
          )}
        </div>

        <div style={{
          background: 'linear-gradient(135deg, #0a1f12 0%, #1a5c38 100%)',
          borderRadius: 16,
          padding: '20px 24px',
          display: 'flex',
          gap: 16,
          alignItems: 'flex-start',
        }}>
          <span style={{ fontSize: 28, flexShrink: 0 }}>👁️</span>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#fff', marginBottom: 6 }}>Individual Performance is Tracked</div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', lineHeight: 1.6 }}>
              Each team member's attendance, punctuality and compliance are monitored individually. Your manager reviews these in the Time &amp; Attendance and People modules. Regular performance evaluations are conducted to help every team member grow.
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
