'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const STORE_ID = '05328298-fc27-4c9f-b091-bb7f6598b601'

const TABS = ['Summary', 'Daily Sales', 'Expenses', 'Food Cost']

type DailySale = {
  id: string
  sale_date: string
  total_sales: number
  cash_sales: number
  card_sales: number
  online_sales: number
  delivery_sales: number
  transaction_count: number
  notes: string
}

type Expense = {
  id: string
  expense_date: string
  category_id: string | null
  category_name: string
  description: string
  amount: number
  vat_amount: number
  supplier: string
  invoice_number: string
  payment_method: string
  notes: string
}

type ExpenseCategory = {
  id: string
  name: string
  key: string
}

const CAT_COLOURS: Record<string, string> = {
  rent: '#3b82f6', utilities: '#f59e0b', stock_cogs: '#10b981', labour: '#8b5cf6',
  royalties: '#ef4444', marketing: '#06b6d4', repairs: '#f97316',
  insurance: '#6366f1', packaging: '#84cc16', other: '#6b7280'
}

const PAYMENT_METHODS = ['bank_transfer', 'cash', 'credit_card', 'debit_order', 'eft']

function fmt(n: number) {
  return 'R ' + (n ?? 0).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function thisMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function today() {
  return new Date().toISOString().split('T')[0]
}

export default function FinancesPage() {
  const router = useRouter()
  const [tab, setTab] = useState(0)
  const [month, setMonth] = useState(thisMonth())

  // Data
  const [sales, setSales] = useState<DailySale[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [categories, setCategories] = useState<ExpenseCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Sales form
  const [showSaleForm, setShowSaleForm] = useState(false)
  const [editSale, setEditSale] = useState<DailySale | null>(null)
  const [saleForm, setSaleForm] = useState({
    sale_date: today(), total_sales: '', cash_sales: '', card_sales: '',
    online_sales: '', delivery_sales: '', transaction_count: '', notes: ''
  })

  // Expense form
  const [showExpForm, setShowExpForm] = useState(false)
  const [editExp, setEditExp] = useState<Expense | null>(null)
  const [expForm, setExpForm] = useState({
    expense_date: today(), category_id: '', description: '', amount: '',
    vat_amount: '', supplier: '', invoice_number: '', payment_method: 'bank_transfer', notes: ''
  })

  const load = useCallback(async () => {
    setLoading(true)
    const [monthStart, monthEnd] = [`${month}-01`, `${month}-31`]
    const [salesRes, expRes, catRes] = await Promise.all([
      supabase.from('daily_sales').select('*').eq('store_id', STORE_ID)
        .gte('sale_date', monthStart).lte('sale_date', monthEnd).order('sale_date', { ascending: false }),
      supabase.from('expenses').select('*').eq('store_id', STORE_ID)
        .gte('expense_date', monthStart).lte('expense_date', monthEnd).order('expense_date', { ascending: false }),
      supabase.from('expense_categories').select('id, name, key')
        .eq('organisation_id', 'e903386b-133a-4bad-b054-ef7ef616a3ff')
        .eq('is_active', true).order('sort_order'),
    ])
    setSales(salesRes.data || [])
    setExpenses(expRes.data || [])
    setCategories(catRes.data || [])
    setLoading(false)
  }, [month])

  useEffect(() => { load() }, [load])

  // Summary calcs
  const totalSales = sales.reduce((s, r) => s + Number(r.total_sales), 0)
  const totalExpenses = expenses.reduce((s, r) => s + Number(r.amount), 0)
  const grossProfit = totalSales - totalExpenses
  const expByCategory: Record<string, number> = {}
  expenses.forEach(e => {
    const k = e.category_name || 'Other'
    expByCategory[k] = (expByCategory[k] || 0) + Number(e.amount)
  })

  // Sales CRUD
  async function saveSale() {
    setSaving(true); setError('')
    const payload = {
      store_id: STORE_ID,
      sale_date: saleForm.sale_date,
      total_sales: parseFloat(saleForm.total_sales) || 0,
      cash_sales: parseFloat(saleForm.cash_sales) || 0,
      card_sales: parseFloat(saleForm.card_sales) || 0,
      online_sales: parseFloat(saleForm.online_sales) || 0,
      delivery_sales: parseFloat(saleForm.delivery_sales) || 0,
      transaction_count: parseInt(saleForm.transaction_count) || 0,
      notes: saleForm.notes,
    }
    if (editSale) {
      const { error: e } = await supabase.from('daily_sales').update(payload).eq('id', editSale.id)
      if (e) setError(e.message)
    } else {
      const { error: e } = await supabase.from('daily_sales').upsert({ ...payload }, { onConflict: 'store_id,sale_date' })
      if (e) setError(e.message)
    }
    setSaving(false)
    if (!error) { setShowSaleForm(false); setEditSale(null); load() }
  }

  async function deleteSale(id: string) {
    if (!confirm('Delete this sales entry?')) return
    await supabase.from('daily_sales').delete().eq('id', id)
    load()
  }

  function openEditSale(s: DailySale) {
    setEditSale(s)
    setSaleForm({
      sale_date: s.sale_date, total_sales: String(s.total_sales), cash_sales: String(s.cash_sales),
      card_sales: String(s.card_sales), online_sales: String(s.online_sales),
      delivery_sales: String(s.delivery_sales), transaction_count: String(s.transaction_count), notes: s.notes || ''
    })
    setShowSaleForm(true)
  }

  // Expense CRUD
  async function saveExp() {
    setSaving(true); setError('')
    const cat = categories.find(c => c.id === expForm.category_id)
    const payload = {
      store_id: STORE_ID,
      expense_date: expForm.expense_date,
      category_id: expForm.category_id || null,
      category_name: cat?.name || expForm.description,
      description: expForm.description,
      amount: parseFloat(expForm.amount) || 0,
      vat_amount: parseFloat(expForm.vat_amount) || 0,
      supplier: expForm.supplier,
      invoice_number: expForm.invoice_number,
      payment_method: expForm.payment_method,
      notes: expForm.notes,
    }
    if (editExp) {
      const { error: e } = await supabase.from('expenses').update(payload).eq('id', editExp.id)
      if (e) setError(e.message)
    } else {
      const { error: e } = await supabase.from('expenses').insert({ ...payload })
      if (e) setError(e.message)
    }
    setSaving(false)
    if (!error) { setShowExpForm(false); setEditExp(null); load() }
  }

  async function deleteExp(id: string) {
    if (!confirm('Delete this expense?')) return
    await supabase.from('expenses').delete().eq('id', id)
    load()
  }

  function openEditExp(e: Expense) {
    setEditExp(e)
    setExpForm({
      expense_date: e.expense_date, category_id: e.category_id || '', description: e.description,
      amount: String(e.amount), vat_amount: String(e.vat_amount || ''), supplier: e.supplier || '',
      invoice_number: e.invoice_number || '', payment_method: e.payment_method || 'bank_transfer', notes: e.notes || ''
    })
    setShowExpForm(true)
  }

  const hdr: React.CSSProperties = {
    background: 'linear-gradient(135deg, #0a1f12 0%, #1a5c38 100%)',
    padding: '24px 32px', color: '#fff', display: 'flex', alignItems: 'center', gap: 16
  }
  const card: React.CSSProperties = {
    background: '#fff', borderRadius: 12, padding: 24,
    boxShadow: '0 1px 4px rgba(0,0,0,0.08)', marginBottom: 16
  }
  const inp: React.CSSProperties = {
    width: '100%', padding: '10px 12px', border: '1px solid #d1d5db',
    borderRadius: 8, fontSize: 14, boxSizing: 'border-box' as const
  }
  const btn = (color = '#1a5c38'): React.CSSProperties => ({
    background: color, color: '#fff', border: 'none', borderRadius: 8,
    padding: '10px 18px', cursor: 'pointer', fontSize: 14, fontWeight: 600
  })

  return (
    <div style={{ minHeight: '100vh', background: '#f0f4f0' }}>
      {/* Header */}
      <div style={hdr}>
        <button onClick={() => router.push('/dashboard')}
          style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8, color: '#fff', padding: '8px 14px', cursor: 'pointer', fontSize: 14 }}>
          ← Back
        </button>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>💰 Income &amp; Expenses</h1>
          <p style={{ margin: '2px 0 0', opacity: 0.7, fontSize: 13 }}>Track sales, costs and profitability</p>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          <input type="month" value={month} onChange={e => setMonth(e.target.value)}
            style={{ ...inp, width: 160, background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', color: '#fff' }} />
        </div>
      </div>

      {/* Tabs */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', display: 'flex', paddingLeft: 24 }}>
        {TABS.map((t, i) => (
          <button key={t} onClick={() => setTab(i)}
            style={{ padding: '14px 20px', border: 'none', background: 'none', cursor: 'pointer',
              fontWeight: tab === i ? 700 : 400, color: tab === i ? '#1a5c38' : '#6b7280', fontSize: 14,
              borderBottom: tab === i ? '2px solid #1a5c38' : '2px solid transparent' }}>
            {t}
          </button>
        ))}
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 16px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#6b7280' }}>Loading…</div>
        ) : (
          <>
            {/* ── SUMMARY ── */}
            {tab === 0 && (
              <div>
                {/* KPI row */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginBottom: 24 }}>
                  {[
                    { label: 'Total Sales', value: totalSales, color: '#16a34a', icon: '📈' },
                    { label: 'Total Expenses', value: totalExpenses, color: '#dc2626', icon: '📉' },
                    { label: grossProfit >= 0 ? 'Net Profit' : 'Net Loss', value: grossProfit, color: grossProfit >= 0 ? '#1a5c38' : '#ef4444', icon: grossProfit >= 0 ? '✅' : '⚠️' },
                  ].map(k => (
                    <div key={k.label} style={{ ...card, marginBottom: 0, textAlign: 'center' }}>
                      <div style={{ fontSize: 28 }}>{k.icon}</div>
                      <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>{k.label}</div>
                      <div style={{ fontSize: 24, fontWeight: 700, color: k.color, marginTop: 4 }}>{fmt(k.value)}</div>
                    </div>
                  ))}
                </div>

                {/* Expense breakdown */}
                <div style={card}>
                  <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700 }}>Expense Breakdown</h3>
                  {Object.keys(expByCategory).length === 0 ? (
                    <p style={{ color: '#6b7280', fontSize: 14 }}>No expenses recorded this month.</p>
                  ) : (
                    Object.entries(expByCategory).sort((a, b) => b[1] - a[1]).map(([cat, amt]) => {
                      const pct = totalExpenses > 0 ? (amt / totalExpenses) * 100 : 0
                      const catColor = CAT_COLOURS[categories.find(c => c.name === cat)?.key || 'other'] || '#6b7280'
                      return (
                        <div key={cat} style={{ marginBottom: 12 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 14 }}>
                            <span style={{ fontWeight: 600 }}>{cat}</span>
                            <span style={{ color: '#374151' }}>{fmt(amt)} <span style={{ color: '#9ca3af' }}>({pct.toFixed(1)}%)</span></span>
                          </div>
                          <div style={{ background: '#f3f4f6', borderRadius: 6, height: 8 }}>
                            <div style={{ background: catColor, width: `${pct}%`, height: 8, borderRadius: 6 }} />
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>

                {/* Sales trend */}
                <div style={card}>
                  <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700 }}>Daily Sales — {month}</h3>
                  {sales.length === 0 ? (
                    <p style={{ color: '#6b7280', fontSize: 14 }}>No sales captured this month.</p>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                          <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                            {['Date', 'Total', 'Cash', 'Card', 'Online', 'Delivery', 'Txns'].map(h => (
                              <th key={h} style={{ textAlign: 'right', padding: '6px 10px', color: '#6b7280', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {[...sales].sort((a,b) => a.sale_date.localeCompare(b.sale_date)).map(s => (
                            <tr key={s.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                              <td style={{ padding: '7px 10px', color: '#374151' }}>{s.sale_date}</td>
                              <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 600, color: '#16a34a' }}>{fmt(Number(s.total_sales))}</td>
                              <td style={{ padding: '7px 10px', textAlign: 'right', color: '#374151' }}>{fmt(Number(s.cash_sales))}</td>
                              <td style={{ padding: '7px 10px', textAlign: 'right', color: '#374151' }}>{fmt(Number(s.card_sales))}</td>
                              <td style={{ padding: '7px 10px', textAlign: 'right', color: '#374151' }}>{fmt(Number(s.online_sales))}</td>
                              <td style={{ padding: '7px 10px', textAlign: 'right', color: '#374151' }}>{fmt(Number(s.delivery_sales))}</td>
                              <td style={{ padding: '7px 10px', textAlign: 'right', color: '#374151' }}>{s.transaction_count}</td>
                            </tr>
                          ))}
                          <tr style={{ borderTop: '2px solid #e5e7eb', background: '#f9fafb' }}>
                            <td style={{ padding: '8px 10px', fontWeight: 700 }}>Total</td>
                            <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: '#16a34a' }}>{fmt(totalSales)}</td>
                            <td colSpan={5} />
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── DAILY SALES ── */}
            {tab === 1 && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Daily Sales / Cash-Up</h2>
                  <button style={btn()} onClick={() => { setEditSale(null); setSaleForm({ sale_date: today(), total_sales:'', cash_sales:'', card_sales:'', online_sales:'', delivery_sales:'', transaction_count:'', notes:'' }); setShowSaleForm(true) }}>
                    + Add Sales Entry
                  </button>
                </div>

                {/* Sales form */}
                {showSaleForm && (
                  <div style={{ ...card, border: '2px solid #1a5c38', marginBottom: 24 }}>
                    <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700 }}>{editSale ? 'Edit' : 'New'} Sales Entry</h3>
                    {error && <div style={{ background: '#fef2f2', color: '#dc2626', padding: '8px 12px', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>{error}</div>}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                      <div>
                        <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Date *</label>
                        <input type="date" value={saleForm.sale_date} onChange={e => setSaleForm(f => ({...f, sale_date: e.target.value}))} style={inp} />
                      </div>
                      <div>
                        <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Total Sales (R) *</label>
                        <input type="number" step="0.01" placeholder="0.00" value={saleForm.total_sales} onChange={e => setSaleForm(f => ({...f, total_sales: e.target.value}))} style={inp} />
                      </div>
                      <div>
                        <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Transactions</label>
                        <input type="number" placeholder="0" value={saleForm.transaction_count} onChange={e => setSaleForm(f => ({...f, transaction_count: e.target.value}))} style={inp} />
                      </div>
                      <div>
                        <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Cash Sales (R)</label>
                        <input type="number" step="0.01" placeholder="0.00" value={saleForm.cash_sales} onChange={e => setSaleForm(f => ({...f, cash_sales: e.target.value}))} style={inp} />
                      </div>
                      <div>
                        <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Card Sales (R)</label>
                        <input type="number" step="0.01" placeholder="0.00" value={saleForm.card_sales} onChange={e => setSaleForm(f => ({...f, card_sales: e.target.value}))} style={inp} />
                      </div>
                      <div>
                        <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Online Sales (R)</label>
                        <input type="number" step="0.01" placeholder="0.00" value={saleForm.online_sales} onChange={e => setSaleForm(f => ({...f, online_sales: e.target.value}))} style={inp} />
                      </div>
                      <div>
                        <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Delivery Sales (R)</label>
                        <input type="number" step="0.01" placeholder="0.00" value={saleForm.delivery_sales} onChange={e => setSaleForm(f => ({...f, delivery_sales: e.target.value}))} style={inp} />
                      </div>
                      <div style={{ gridColumn: 'span 2' }}>
                        <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Notes</label>
                        <input type="text" placeholder="e.g. Public holiday, load-shedding" value={saleForm.notes} onChange={e => setSaleForm(f => ({...f, notes: e.target.value}))} style={inp} />
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                      <button style={btn()} onClick={saveSale} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
                      <button style={{ ...btn('#6b7280') }} onClick={() => { setShowSaleForm(false); setEditSale(null) }}>Cancel</button>
                    </div>
                  </div>
                )}

                {/* Sales list */}
                {sales.length === 0 ? (
                  <div style={{ ...card, textAlign: 'center', padding: 48, color: '#6b7280' }}>
                    <div style={{ fontSize: 40, marginBottom: 8 }}>📊</div>
                    No sales captured for {month}. Click &quot;Add Sales Entry&quot; to start.
                  </div>
                ) : (
                  <div style={card}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                      <thead>
                        <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                          {['Date', 'Total', 'Cash', 'Card', 'Online', 'Delivery', 'Txns', 'Notes', ''].map(h => (
                            <th key={h} style={{ textAlign: h === 'Date' || h === 'Notes' || h === '' ? 'left' : 'right', padding: '8px 10px', color: '#6b7280', fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {sales.map(s => (
                          <tr key={s.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                            <td style={{ padding: '9px 10px', fontWeight: 600 }}>{s.sale_date}</td>
                            <td style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 700, color: '#16a34a' }}>{fmt(Number(s.total_sales))}</td>
                            <td style={{ padding: '9px 10px', textAlign: 'right' }}>{fmt(Number(s.cash_sales))}</td>
                            <td style={{ padding: '9px 10px', textAlign: 'right' }}>{fmt(Number(s.card_sales))}</td>
                            <td style={{ padding: '9px 10px', textAlign: 'right' }}>{fmt(Number(s.online_sales))}</td>
                            <td style={{ padding: '9px 10px', textAlign: 'right' }}>{fmt(Number(s.delivery_sales))}</td>
                            <td style={{ padding: '9px 10px', textAlign: 'right' }}>{s.transaction_count}</td>
                            <td style={{ padding: '9px 10px', color: '#6b7280', fontSize: 12 }}>{s.notes}</td>
                            <td style={{ padding: '9px 10px' }}>
                              <div style={{ display: 'flex', gap: 6 }}>
                                <button onClick={() => openEditSale(s)} style={{ background: '#eff6ff', color: '#2563eb', border: 'none', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 12 }}>Edit</button>
                                <button onClick={() => deleteSale(s.id)} style={{ background: '#fef2f2', color: '#dc2626', border: 'none', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 12 }}>Del</button>
                              </div>
                            </td>
                          </tr>
                        ))}
                        <tr style={{ borderTop: '2px solid #e5e7eb', background: '#f0fdf4' }}>
                          <td style={{ padding: '10px 10px', fontWeight: 700 }}>Month Total</td>
                          <td style={{ padding: '10px 10px', textAlign: 'right', fontWeight: 800, color: '#16a34a', fontSize: 16 }}>{fmt(totalSales)}</td>
                          <td colSpan={7} />
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* ── EXPENSES ── */}
            {tab === 2 && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Expenses</h2>
                  <button style={btn()} onClick={() => { setEditExp(null); setExpForm({ expense_date: today(), category_id: '', description: '', amount: '', vat_amount: '', supplier: '', invoice_number: '', payment_method: 'bank_transfer', notes: '' }); setShowExpForm(true) }}>
                    + Add Expense
                  </button>
                </div>

                {/* Expense form */}
                {showExpForm && (
                  <div style={{ ...card, border: '2px solid #1a5c38', marginBottom: 24 }}>
                    <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700 }}>{editExp ? 'Edit' : 'New'} Expense</h3>
                    {error && <div style={{ background: '#fef2f2', color: '#dc2626', padding: '8px 12px', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>{error}</div>}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                      <div>
                        <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Date *</label>
                        <input type="date" value={expForm.expense_date} onChange={e => setExpForm(f => ({...f, expense_date: e.target.value}))} style={inp} />
                      </div>
                      <div>
                        <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Category</label>
                        <select value={expForm.category_id} onChange={e => setExpForm(f => ({...f, category_id: e.target.value}))} style={inp}>
                          <option value="">— Select —</option>
                          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Payment Method</label>
                        <select value={expForm.payment_method} onChange={e => setExpForm(f => ({...f, payment_method: e.target.value}))} style={inp}>
                          {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}</option>)}
                        </select>
                      </div>
                      <div style={{ gridColumn: 'span 2' }}>
                        <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Description *</label>
                        <input type="text" placeholder="e.g. Monthly electricity bill" value={expForm.description} onChange={e => setExpForm(f => ({...f, description: e.target.value}))} style={inp} />
                      </div>
                      <div>
                        <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Amount (R) *</label>
                        <input type="number" step="0.01" placeholder="0.00" value={expForm.amount} onChange={e => setExpForm(f => ({...f, amount: e.target.value}))} style={inp} />
                      </div>
                      <div>
                        <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>VAT Amount (R)</label>
                        <input type="number" step="0.01" placeholder="0.00" value={expForm.vat_amount} onChange={e => setExpForm(f => ({...f, vat_amount: e.target.value}))} style={inp} />
                      </div>
                      <div>
                        <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Supplier</label>
                        <input type="text" placeholder="Supplier name" value={expForm.supplier} onChange={e => setExpForm(f => ({...f, supplier: e.target.value}))} style={inp} />
                      </div>
                      <div>
                        <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Invoice #</label>
                        <input type="text" placeholder="INV-001" value={expForm.invoice_number} onChange={e => setExpForm(f => ({...f, invoice_number: e.target.value}))} style={inp} />
                      </div>
                      <div>
                        <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Notes</label>
                        <input type="text" placeholder="Optional notes" value={expForm.notes} onChange={e => setExpForm(f => ({...f, notes: e.target.value}))} style={inp} />
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                      <button style={btn()} onClick={saveExp} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
                      <button style={{ ...btn('#6b7280') }} onClick={() => { setShowExpForm(false); setEditExp(null) }}>Cancel</button>
                    </div>
                  </div>
                )}

                {/* Expenses list */}
                {expenses.length === 0 ? (
                  <div style={{ ...card, textAlign: 'center', padding: 48, color: '#6b7280' }}>
                    <div style={{ fontSize: 40, marginBottom: 8 }}>🧾</div>
                    No expenses for {month}. Click &quot;Add Expense&quot; to start.
                  </div>
                ) : (
                  <div style={card}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                      <thead>
                        <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                          {['Date', 'Category', 'Description', 'Supplier', 'Inv #', 'VAT', 'Amount', 'Method', ''].map(h => (
                            <th key={h} style={{ textAlign: h === 'Amount' || h === 'VAT' ? 'right' : 'left', padding: '8px 10px', color: '#6b7280', fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {expenses.map(e => {
                          const catColor = CAT_COLOURS[categories.find(c => c.id === e.category_id)?.key || 'other'] || '#6b7280'
                          return (
                            <tr key={e.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                              <td style={{ padding: '9px 10px' }}>{e.expense_date}</td>
                              <td style={{ padding: '9px 10px' }}>
                                <span style={{ background: catColor + '20', color: catColor, padding: '2px 8px', borderRadius: 20, fontSize: 12, fontWeight: 600 }}>
                                  {e.category_name || '—'}
                                </span>
                              </td>
                              <td style={{ padding: '9px 10px' }}>{e.description}</td>
                              <td style={{ padding: '9px 10px', color: '#6b7280', fontSize: 12 }}>{e.supplier || '—'}</td>
                              <td style={{ padding: '9px 10px', color: '#6b7280', fontSize: 12 }}>{e.invoice_number || '—'}</td>
                              <td style={{ padding: '9px 10px', textAlign: 'right', color: '#6b7280', fontSize: 12 }}>{e.vat_amount ? fmt(Number(e.vat_amount)) : '—'}</td>
                              <td style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 700, color: '#dc2626' }}>{fmt(Number(e.amount))}</td>
                              <td style={{ padding: '9px 10px', color: '#6b7280', fontSize: 12 }}>{(e.payment_method || '').replace('_', ' ')}</td>
                              <td style={{ padding: '9px 10px' }}>
                                <div style={{ display: 'flex', gap: 6 }}>
                                  <button onClick={() => openEditExp(e)} style={{ background: '#eff6ff', color: '#2563eb', border: 'none', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 12 }}>Edit</button>
                                  <button onClick={() => deleteExp(e.id)} style={{ background: '#fef2f2', color: '#dc2626', border: 'none', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 12 }}>Del</button>
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                        <tr style={{ borderTop: '2px solid #e5e7eb', background: '#fef2f2' }}>
                          <td colSpan={6} style={{ padding: '10px 10px', fontWeight: 700 }}>Month Total</td>
                          <td style={{ padding: '10px 10px', textAlign: 'right', fontWeight: 800, color: '#dc2626', fontSize: 16 }}>{fmt(totalExpenses)}</td>
                          <td colSpan={2} />
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* ── FOOD COST ── */}
            {tab === 3 && (
              <div>
                <div style={{ ...card, textAlign: 'center', padding: 60 }}>
                  <div style={{ fontSize: 48, marginBottom: 12 }}>🍔</div>
                  <h3 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 700 }}>Food Cost Analysis</h3>
                  <p style={{ color: '#6b7280', fontSize: 14, maxWidth: 400, margin: '0 auto 16px' }}>
                    Compare theoretical vs actual food cost using your Stock Management data.
                    This tab links directly to stock purchases and wastage to calculate your food cost %.
                  </p>
                  <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '16px 24px', display: 'inline-block', textAlign: 'left' }}>
                    <p style={{ margin: '0 0 6px', fontWeight: 700, color: '#166534', fontSize: 14 }}>Coming in next session:</p>
                    <ul style={{ margin: 0, paddingLeft: 20, color: '#374151', fontSize: 13, lineHeight: 1.8 }}>
                      <li>Opening stock value</li>
                      <li>Purchases from stock module</li>
                      <li>Closing stock value</li>
                      <li>Wastage deduction</li>
                      <li>Food cost % vs Mochachos target</li>
                    </ul>
                  </div>
                  <div style={{ marginTop: 24 }}>
                    <button style={btn()} onClick={() => router.push('/stock')}>Go to Stock Management →</button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

