'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const STORE_ID = '05328298-fc27-4c9f-b091-bb7f6598b601'
const PRIMARY = '#1a5c38'
const DARK = '#0a1f12'

type Period = { label: string; start: string; end: string; key: string }
type FixedCostItem = { name: string; amount: number }

function fmt(n: number) {
  return 'R ' + (n || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function pct(n: number, d: number) {
  if (!d) return '—'
  return (n / d * 100).toFixed(1) + '%'
}
function thisMonth(): string { return new Date().toISOString().slice(0, 7) }
function lastMonth(): string {
  const d = new Date(); d.setMonth(d.getMonth() - 1)
  return d.toISOString().slice(0, 7)
}
function monthRange(ym: string): [string, string] {
  const [y, m] = ym.split('-').map(Number)
  return [`${ym}-01`, new Date(y, m, 0).toISOString().slice(0, 10)]
}
function weekRange(monday: string): [string, string] {
  const d = new Date(monday + 'T00:00:00'); const end = new Date(d); end.setDate(d.getDate() + 6)
  return [monday, end.toISOString().slice(0, 10)]
}
function yearRange(year: number): [string, string] {
  return [`${year}-01-01`, `${year}-12-31`]
}
function getMonday(): string {
  const d = new Date(); const day = (d.getDay() + 6) % 7; d.setDate(d.getDate() - day)
  return d.toISOString().slice(0, 10)
}

export default function AnalyticsPage() {
  const router = useRouter()
  const [view, setView] = useState<'period' | 'compare'>('period')
  const [periodType, setPeriodType] = useState<'month' | 'week' | 'year'>('month')
  const [month, setMonth] = useState(thisMonth())
  const [weekStart, setWeekStart] = useState(getMonday())
  const [year, setYear] = useState(new Date().getFullYear())
  const [compareMonth, setCompareMonth] = useState(lastMonth())

  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<any>(null)
  const [compareData, setCompareData] = useState<any>(null)

  const [fixedCosts, setFixedCosts] = useState<FixedCostItem[]>([])
  const [editingFixed, setEditingFixed] = useState(false)
  const [fixedDraft, setFixedDraft] = useState<FixedCostItem[]>([])
  const [savingFixed, setSavingFixed] = useState(false)

  function getPeriodRange(): [string, string] {
    if (periodType === 'week') return weekRange(weekStart)
    if (periodType === 'year') return yearRange(year)
    return monthRange(month)
  }

  async function fetchAnalytics(start: string, end: string) {
    const [salesRes, expRes, wagesRes, purchRes, wastRes, countsRes, fixedRes] = await Promise.all([
      supabase.from('cash_ups').select('cash_up_total').eq('store_id', STORE_ID).neq('status', 'draft').gte('cash_up_date', start).lte('cash_up_date', end),
      supabase.from('expenses').select('amount, category_key, category_name').eq('store_id', STORE_ID).gte('expense_date', start).lte('expense_date', end),
      supabase.from('wage_payments').select('net_pay, gross_pay, uif_employer').eq('store_id', STORE_ID).gte('paid_date', start).lte('paid_date', end),
      supabase.from('stock_purchases').select('total_cost').eq('store_id', STORE_ID).gte('purchase_date', start).lte('purchase_date', end),
      supabase.from('stock_wastage').select('total_cost').eq('store_id', STORE_ID).gte('wastage_date', start).lte('wastage_date', end),
      supabase.from('stock_counts').select('id, count_date').eq('store_id', STORE_ID).eq('status', 'completed').order('count_date', { ascending: false }).limit(20),
      supabase.from('store_fixed_costs').select('items').eq('store_id', STORE_ID).eq('period', start.slice(0, 7)).maybeSingle(),
    ])

    const sales = (salesRes.data || []).reduce((s, r) => s + Number(r.cash_up_total || 0), 0)
    const purchases = (purchRes.data || []).reduce((s, r) => s + Number(r.total_cost || 0), 0)
    const wastage = (wastRes.data || []).reduce((s, r) => s + Number(r.total_cost || 0), 0)
    const wages = (wagesRes.data || []).reduce((s, r) => s + Number(r.net_pay || 0), 0)
    const wagesGross = (wagesRes.data || []).reduce((s, r) => s + Number(r.gross_pay || 0), 0)
    const uifEmployer = (wagesRes.data || []).reduce((s, r) => s + Number(r.uif_employer || 0), 0)

    // Stock count values for food cost
    const counts = countsRes.data || []
    const openingCount = counts.find(c => c.count_date < start)
    const closingCount = counts.find(c => c.count_date <= end)

    async function countValue(countId: string | undefined) {
      if (!countId) return 0
      const { data: lines } = await supabase.from('stock_count_lines').select('actual_qty, unit_cost').eq('stock_count_id', countId)
      return (lines || []).reduce((s, l) => s + Number(l.actual_qty || 0) * Number(l.unit_cost || 0), 0)
    }
    const [openingValue, closingValue] = await Promise.all([countValue(openingCount?.id), countValue(closingCount?.id)])
    const VAT_RATE = 0.15
    const salesExclVat = sales / (1 + VAT_RATE) // Convert incl-VAT sales to ex-VAT for apples-to-apples comparison
    const foodCostAmount = openingValue + purchases - closingValue - wastage
    const foodCostPct = salesExclVat > 0 ? foodCostAmount / salesExclVat * 100 : 0

    // Expenses by category (excluding wages which are tracked separately)
    const expByCategory: Record<string, { name: string; total: number }> = {}
    for (const e of expRes.data || []) {
      const key = e.category_key || 'other'
      if (key === 'wages') continue // shown separately
      if (!expByCategory[key]) expByCategory[key] = { name: e.category_name || key, total: 0 }
      expByCategory[key].total += Number(e.amount || 0)
    }

    // Fixed costs from DB or state
    const fixedItems: FixedCostItem[] = fixedRes.data?.items || []
    const totalFixed = fixedItems.reduce((s, i) => s + Number(i.amount || 0), 0)

    // All margin/% calculations use ex-VAT sales (apples-to-apples with ex-VAT costs)
    const grossProfit = salesExclVat - foodCostAmount
    const grossMarginPct = salesExclVat > 0 ? grossProfit / salesExclVat * 100 : 0

    // Total operating costs = food cost + wages + fixed + other expenses
    const otherExpenses = Object.values(expByCategory).reduce((s, c) => s + c.total, 0)
    const totalCosts = foodCostAmount + wagesGross + totalFixed + otherExpenses
    const netProfit = salesExclVat - totalCosts
    const netMarginPct = salesExclVat > 0 ? netProfit / salesExclVat * 100 : 0

    // Breakeven uses ex-VAT sales base — fixed costs ÷ gross margin %
    const fixedForBreakeven = wagesGross + totalFixed
    const breakeven = grossMarginPct > 0 ? fixedForBreakeven / (grossMarginPct / 100) : 0
    const salesAboveBreakeven = salesExclVat - breakeven
    const daysInPeriod = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86400000) + 1
    const dailySales = sales / daysInPeriod
    const daysToBreakeven = dailySales > 0 ? Math.ceil(breakeven / dailySales) : null

    return {
      sales, salesExclVat, purchases, wastage, wages, wagesGross, uifEmployer,
      openingValue, closingValue, foodCostAmount, foodCostPct,
      grossProfit, grossMarginPct,
      expByCategory, otherExpenses,
      fixedItems, totalFixed,
      totalCosts, netProfit, netMarginPct,
      fixedForBreakeven, breakeven, salesAboveBreakeven, daysToBreakeven,
      openingDate: openingCount?.count_date, closingDate: closingCount?.count_date,
    }
  }

  const load = useCallback(async () => {
    setLoading(true)
    const [s, e] = getPeriodRange()
    const result = await fetchAnalytics(s, e)
    setData(result)
    setFixedCosts(result.fixedItems)
    if (view === 'compare') {
      const [cs, ce] = monthRange(compareMonth)
      const comp = await fetchAnalytics(cs, ce)
      setCompareData(comp)
    }
    setLoading(false)
  }, [periodType, month, weekStart, year, view, compareMonth])

  useEffect(() => { load() }, [load])

  async function saveFixedCosts() {
    setSavingFixed(true)
    const period = periodType === 'month' ? month : periodType === 'year' ? `${year}-01` : weekStart.slice(0, 7)
    await supabase.from('store_fixed_costs').upsert({
      store_id: STORE_ID, period, items: fixedDraft
    }, { onConflict: 'store_id,period' })
    setFixedCosts(fixedDraft)
    setEditingFixed(false)
    setSavingFixed(false)
    load()
  }

  const card: React.CSSProperties = { background: '#fff', borderRadius: 16, border: '1px solid #eef2ee', padding: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }
  const [s, e] = getPeriodRange()
  const periodLabel = periodType === 'week' ? `Week of ${s}` : periodType === 'year' ? String(year) : new Date(s).toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' })

  function KPI({ label, value, sub, color, big }: { label: string; value: string; sub?: string; color?: string; big?: boolean }) {
    return (
      <div style={{ ...card, textAlign: 'center' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>{label}</div>
        <div style={{ fontSize: big ? 32 : 22, fontWeight: 800, color: color || '#111' }}>{value}</div>
        {sub && <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>{sub}</div>}
      </div>
    )
  }

  function Bar({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
    const pctVal = total > 0 ? value / total * 100 : 0
    return (
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontSize: 13, color: '#374151' }}>{label}</span>
          <div style={{ display: 'flex', gap: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>{fmt(value)}</span>
            <span style={{ fontSize: 12, color: '#9ca3af', width: 40, textAlign: 'right' }}>{pctVal.toFixed(1)}%</span>
          </div>
        </div>
        <div style={{ height: 8, background: '#f3f4f6', borderRadius: 4 }}>
          <div style={{ height: '100%', width: `${Math.min(100, pctVal)}%`, background: color, borderRadius: 4, transition: 'width 0.4s' }} />
        </div>
      </div>
    )
  }

  function CompareKPI({ label, curr, prev }: { label: string; curr: number; prev: number }) {
    const delta = curr - prev
    const deltaPct = prev > 0 ? delta / prev * 100 : 0
    const up = delta >= 0
    return (
      <div style={{ ...card }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', marginBottom: 8 }}>{label}</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, color: '#9ca3af' }}>{periodLabel}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#111' }}>{fmt(curr)}</div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: '#9ca3af' }}>{compareMonth}</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#6b7280' }}>{fmt(prev)}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: up ? '#16a34a' : '#dc2626' }}>
              {up ? '▲' : '▼'} {Math.abs(deltaPct).toFixed(1)}%
            </div>
            <div style={{ fontSize: 11, color: '#9ca3af' }}>{up ? '+' : ''}{fmt(delta)}</div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f8faf8', fontFamily: 'system-ui, sans-serif' }}>
      {/* Header */}
      <div style={{ background: `linear-gradient(135deg, ${DARK}, ${PRIMARY})`, padding: '20px 32px', display: 'flex', alignItems: 'center', gap: 16 }}>
        <button onClick={() => router.push('/dashboard')} style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 13 }}>← Back</button>
        <div>
          <div style={{ color: '#fff', fontWeight: 800, fontSize: 22 }}>📊 Store Analytics</div>
          <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 13 }}>Sales · Expenses · Breakeven · Profitability</div>
        </div>
      </div>

      <div style={{ padding: '24px 32px', maxWidth: 1200, margin: '0 auto' }}>
        {/* Period controls */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', background: '#f3f4f6', borderRadius: 10, padding: 3 }}>
            {(['period', 'compare'] as const).map(v => (
              <button key={v} onClick={() => setView(v)} style={{ padding: '7px 18px', borderRadius: 8, border: 'none', background: view === v ? PRIMARY : 'transparent', color: view === v ? '#fff' : '#6b7280', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                {v === 'period' ? 'Single Period' : 'Compare Months'}
              </button>
            ))}
          </div>

          {view === 'period' && (
            <>
              <div style={{ display: 'flex', background: '#f3f4f6', borderRadius: 10, padding: 3 }}>
                {(['month', 'week', 'year'] as const).map(pt => (
                  <button key={pt} onClick={() => setPeriodType(pt)} style={{ padding: '7px 14px', borderRadius: 8, border: 'none', background: periodType === pt ? PRIMARY : 'transparent', color: periodType === pt ? '#fff' : '#6b7280', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                    {pt.charAt(0).toUpperCase() + pt.slice(1)}
                  </button>
                ))}
              </div>
              {periodType === 'month' && <input type="month" value={month} onChange={e => setMonth(e.target.value)} style={{ padding: '8px 12px', borderRadius: 10, border: '1.5px solid #e5e7eb', fontSize: 14 }} />}
              {periodType === 'week' && <input type="date" value={weekStart} onChange={e => setWeekStart(e.target.value)} style={{ padding: '8px 12px', borderRadius: 10, border: '1.5px solid #e5e7eb', fontSize: 14 }} />}
              {periodType === 'year' && <select value={year} onChange={e => setYear(Number(e.target.value))} style={{ padding: '8px 12px', borderRadius: 10, border: '1.5px solid #e5e7eb', fontSize: 14 }}>
                {[2024, 2025, 2026, 2027].map(y => <option key={y}>{y}</option>)}
              </select>}
            </>
          )}

          {view === 'compare' && (
            <>
              <div>
                <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4 }}>Current</label>
                <input type="month" value={month} onChange={e => setMonth(e.target.value)} style={{ padding: '8px 12px', borderRadius: 10, border: '1.5px solid #e5e7eb', fontSize: 14 }} />
              </div>
              <div style={{ color: '#9ca3af', fontSize: 20, fontWeight: 700, alignSelf: 'flex-end', paddingBottom: 6 }}>vs</div>
              <div>
                <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4 }}>Compare to</label>
                <input type="month" value={compareMonth} onChange={e => setCompareMonth(e.target.value)} style={{ padding: '8px 12px', borderRadius: 10, border: '1.5px solid #e5e7eb', fontSize: 14 }} />
              </div>
            </>
          )}
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 80, color: '#9ca3af', fontSize: 16 }}>Calculating…</div>
        ) : !data ? null : (
          <>
            {/* COMPARE VIEW */}
            {view === 'compare' && compareData && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 32 }}>
                <CompareKPI label="Sales" curr={data.sales} prev={compareData.sales} />
                <CompareKPI label="Food Cost (ex-VAT)" curr={data.foodCostAmount} prev={compareData.foodCostAmount} />
                <CompareKPI label="Wages" curr={data.wagesGross} prev={compareData.wagesGross} />
                <CompareKPI label="Fixed Costs" curr={data.totalFixed} prev={compareData.totalFixed} />
                <CompareKPI label="Other Expenses" curr={data.otherExpenses} prev={compareData.otherExpenses} />
                <CompareKPI label="Net Profit / Loss" curr={data.netProfit} prev={compareData.netProfit} />
              </div>
            )}

            {/* PERIOD VIEW */}
            {/* Top KPIs */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
              <KPI label="Total Sales" value={fmt(data.sales)} sub={periodLabel} big />
              <KPI label="Gross Profit" value={fmt(data.grossProfit)} sub={`${data.grossMarginPct.toFixed(1)}% margin`} color={data.grossMarginPct >= 60 ? '#16a34a' : data.grossMarginPct >= 45 ? '#d97706' : '#dc2626'} big />
              <KPI label="Net Profit / Loss" value={fmt(data.netProfit)} sub={`${pct(data.netProfit, data.sales)} of sales`} color={data.netProfit >= 0 ? '#16a34a' : '#dc2626'} big />
              <KPI label="Food Cost %" value={data.sales > 0 ? data.foodCostPct.toFixed(1) + '%' : '—'} sub={data.foodCostPct <= 35 ? '✓ On target' : '⚠️ Above target'} color={data.foodCostPct <= 35 ? '#16a34a' : data.foodCostPct <= 40 ? '#d97706' : '#dc2626'} big />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 24, marginBottom: 24 }}>
              {/* P&L Breakdown */}
              <div style={{ ...card }}>
                <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>Profit & Loss Breakdown</div>
                <div style={{ borderBottom: '1px solid #f3f4f6', paddingBottom: 12, marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginBottom: 4 }}>
                    <span style={{ fontWeight: 600 }}>Sales Revenue (ex-VAT)</span><span style={{ fontWeight: 800, color: '#16a34a' }}>{fmt(data.salesExclVat)}</span>
                  </div>
                </div>
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', marginBottom: 8 }}>Cost of Goods Sold</div>
                  <Bar label="Food Cost (ex-VAT)" value={data.foodCostAmount} total={data.salesExclVat} color="#ef4444" />
                  <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8, borderTop: '1px solid #f3f4f6', fontSize: 14, fontWeight: 700 }}>
                    <span>Gross Profit</span><span style={{ color: '#16a34a' }}>{fmt(data.grossProfit)} ({data.grossMarginPct.toFixed(1)}%)</span>
                  </div>
                </div>
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', marginBottom: 8 }}>Operating Expenses</div>
                  <Bar label="Wages & Salaries" value={data.wagesGross} total={data.salesExclVat} color="#8b5cf6" />
                  {Object.entries(data.expByCategory).map(([key, cat]: any) => (
                    <Bar key={key} label={cat.name} value={cat.total} total={data.salesExclVat} color="#3b82f6" />
                  ))}
                  <Bar label="Fixed Costs (Rent, etc.)" value={data.totalFixed} total={data.salesExclVat} color="#f59e0b" />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderTop: '2px solid #111', fontSize: 15, fontWeight: 800 }}>
                  <span>Net {data.netProfit >= 0 ? 'Profit' : 'Loss'}</span>
                  <span style={{ color: data.netProfit >= 0 ? '#16a34a' : '#dc2626' }}>{fmt(data.netProfit)}</span>
                </div>
              </div>

              {/* Right column */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Breakeven */}
                <div style={{ ...card, border: `1.5px solid ${data.sales >= data.breakeven ? '#bbf7d0' : '#fecaca'}` }}>
                  <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Breakeven Analysis</div>
                  <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 16 }}>Fixed costs ÷ Gross margin %</div>
                  <div style={{ fontSize: 28, fontWeight: 800, color: '#111', marginBottom: 4 }}>{fmt(data.breakeven)}</div>
                  <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 12 }}>Required to cover all fixed costs</div>
                  <div style={{ height: 10, background: '#f3f4f6', borderRadius: 5, marginBottom: 8 }}>
                    <div style={{ height: '100%', width: `${Math.min(100, data.breakeven > 0 ? data.salesExclVat / data.breakeven * 100 : 0)}%`, background: data.sales >= data.breakeven ? '#16a34a' : '#ef4444', borderRadius: 5 }} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div style={{ background: '#f8faf8', borderRadius: 8, padding: '8px 12px' }}>
                      <div style={{ fontSize: 11, color: '#9ca3af' }}>Actual Sales</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#111' }}>{fmt(data.sales)}</div>
                    </div>
                    <div style={{ background: data.salesAboveBreakeven >= 0 ? '#f0fdf4' : '#fef2f2', borderRadius: 8, padding: '8px 12px' }}>
                      <div style={{ fontSize: 11, color: '#9ca3af' }}>{data.salesAboveBreakeven >= 0 ? 'Above breakeven' : 'Below breakeven'}</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: data.salesAboveBreakeven >= 0 ? '#16a34a' : '#dc2626' }}>{fmt(Math.abs(data.salesAboveBreakeven))}</div>
                    </div>
                  </div>
                  {data.daysToBreakeven && (
                    <div style={{ marginTop: 10, fontSize: 12, color: '#6b7280', textAlign: 'center', background: '#f8faf8', borderRadius: 8, padding: '6px 0' }}>
                      At current daily sales, breakeven reached in ~{data.daysToBreakeven} days
                    </div>
                  )}
                </div>

                {/* Fixed Costs */}
                <div style={{ ...card }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div style={{ fontSize: 15, fontWeight: 700 }}>Fixed Costs</div>
                    <button onClick={() => { setFixedDraft([...data.fixedItems, ...(!data.fixedItems.length ? [{ name: 'Rent', amount: 0 }, { name: 'Electricity', amount: 0 }, { name: 'Insurance', amount: 0 }] : [])].filter((_, i, a) => a.findIndex(x => x.name === _.name) === i)); setEditingFixed(true) }} style={{ fontSize: 12, color: PRIMARY, background: '#f0f7f4', border: 'none', borderRadius: 8, padding: '5px 12px', cursor: 'pointer', fontWeight: 700 }}>Edit</button>
                  </div>
                  {editingFixed ? (
                    <div>
                      {fixedDraft.map((item, i) => (
                        <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 6, marginBottom: 6, alignItems: 'center' }}>
                          <input value={item.name} onChange={e => setFixedDraft(d => d.map((x, idx) => idx === i ? { ...x, name: e.target.value } : x))} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13 }} />
                          <input type="number" step="0.01" value={item.amount || ''} onChange={e => setFixedDraft(d => d.map((x, idx) => idx === i ? { ...x, amount: parseFloat(e.target.value) || 0 } : x))} placeholder="0.00" style={{ width: 90, padding: '6px 10px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13 }} />
                          <button onClick={() => setFixedDraft(d => d.filter((_, idx) => idx !== i))} style={{ background: '#fef2f2', color: '#dc2626', border: 'none', borderRadius: 6, width: 26, height: 26, cursor: 'pointer', fontWeight: 700 }}>×</button>
                        </div>
                      ))}
                      <button onClick={() => setFixedDraft(d => [...d, { name: '', amount: 0 }])} style={{ fontSize: 12, color: PRIMARY, background: 'none', border: '1px dashed #1a5c38', borderRadius: 8, padding: '5px 12px', cursor: 'pointer', width: '100%', marginBottom: 8 }}>+ Add Item</button>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => setEditingFixed(false)} style={{ flex: 1, padding: '8px', background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
                        <button onClick={saveFixedCosts} disabled={savingFixed} style={{ flex: 2, padding: '8px', background: PRIMARY, color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700 }}>{savingFixed ? 'Saving…' : 'Save'}</button>
                      </div>
                    </div>
                  ) : (
                    data.fixedItems.length ? (
                      <>
                        {data.fixedItems.map((item: FixedCostItem, i: number) => (
                          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f3f4f6', fontSize: 13 }}>
                            <span style={{ color: '#374151' }}>{item.name}</span>
                            <span style={{ fontWeight: 700 }}>{fmt(item.amount)}</span>
                          </div>
                        ))}
                        <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8, fontWeight: 800, fontSize: 14 }}>
                          <span>Total Fixed</span><span style={{ color: '#f59e0b' }}>{fmt(data.totalFixed)}</span>
                        </div>
                      </>
                    ) : (
                      <div style={{ textAlign: 'center', color: '#9ca3af', fontSize: 13, padding: '12px 0' }}>
                        No fixed costs entered for {periodLabel} yet.<br />Click Edit to add rent, insurance, etc.
                      </div>
                    )
                  )}
                </div>

                {/* UIF summary */}
                {data.uifEmployer > 0 && (
                  <div style={{ ...card, background: '#f9fafb' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#6b7280', marginBottom: 8 }}>UIF Liability</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                      <span>Employer contribution</span><span style={{ fontWeight: 700 }}>{fmt(data.uifEmployer)}</span>
                    </div>
                    <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>Payable to SARS — not included in P&L above</div>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
