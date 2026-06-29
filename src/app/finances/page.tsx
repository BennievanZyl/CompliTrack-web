'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const STORE_ID = '05328298-fc27-4c9f-b091-bb7f6598b601'
const ORG_ID = 'e903386b-133a-4bad-b054-ef7ef616a3ff'
const VAT_RATE = 0.15

const TABS = ['Summary', 'Cash-Ups / Sales', 'Supplier Bills', 'Quick Expenses', 'Food Cost']

const COLOUR_PALETTE = ['#10b981','#ef4444','#3b82f6','#f59e0b','#8b5cf6','#06b6d4','#f97316','#ec4899','#84cc16','#6b7280','#dc2626','#0ea5e9','#a855f7','#22c55e','#1d4ed8']


const PAYMENT_METHODS = ['bank_transfer', 'cash', 'credit_card', 'debit_order', 'eft', 'cheque']
const INVOICE_STATUSES = ['draft', 'approved', 'paid']

type CashUp = {
  id: string; cash_up_date: string; cash_up_total: number; total_cash: number
  eft_total: number; payouts: number; variance: number; customer_count: number
  average_spend: number; status: string; notes: string
}
type InvoiceLine = {
  id?: string; category_key: string; description: string
  amount: number; vat_amount: number
}
type Invoice = {
  id: string; supplier: string; invoice_number: string; invoice_date: string
  due_date: string; status: string; payment_method: string; notes: string
  total_amount: number; total_vat: number
  invoice_lines?: InvoiceLine[]
}
type QuickExpense = {
  id: string; expense_date: string; category_key: string; category_name: string
  description: string; amount: number; vat_amount: number
  supplier: string; invoice_number: string; payment_method: string; notes: string
}

function fmt(n: number) {
  return 'R ' + (n ?? 0).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function thisMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}
function today() { return new Date().toISOString().split('T')[0] }

const emptyLine = (firstKey = 'cost_of_sales'): InvoiceLine => ({ category_key: firstKey, description: '', amount: 0, vat_amount: 0 })
const emptyInvoice = () => ({
  supplier: '', invoice_number: '', invoice_date: today(),
  due_date: '', status: 'draft', payment_method: 'bank_transfer', notes: ''
})
const emptyQuick = () => ({
  expense_date: today(), category_key: 'other', description: '',
  amount: '', vat_amount: '', supplier: '', invoice_number: '',
  payment_method: 'cash', notes: ''
})

export default function FinancesPage() {
  const router = useRouter()
  const [tab, setTab] = useState(0)
  const [month, setMonth] = useState(thisMonth())

  const [categories, setCategories] = useState<{id:string;name:string;key:string;colour:string}[]>([])
  const [suppliers, setSuppliers] = useState<{id:string;name:string}[]>([])
  const [cashUps, setCashUps] = useState<CashUp[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [quickExp, setQuickExp] = useState<QuickExpense[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showGRV, setShowGRV] = useState(false)
  const [grvInvoice, setGrvInvoice] = useState<Invoice | null>(null)
  const [grvItems, setGrvItems] = useState<{id:string;description:string;unit:string;supplier:string|null}[]>([])
  const [grvLines, setGrvLines] = useState<{stock_item_id:string;description:string;unit:string;qty_received:string;unit_cost:string}[]>([])
  const [savingGRV, setSavingGRV] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState('')
  const [error, setError] = useState('')

  // Category quick-add state
  const [showQuickCat, setShowQuickCat] = useState(false)
  const [quickCatForm, setQuickCatForm] = useState({ name: '', colour: '#10b981' })
  const [savingCat, setSavingCat] = useState(false)

  // Invoice form state
  const [showInvForm, setShowInvForm] = useState(false)
  const [editInv, setEditInv] = useState<Invoice | null>(null)
  const [invForm, setInvForm] = useState(emptyInvoice())
  const [invLines, setInvLines] = useState<InvoiceLine[]>([emptyLine()])
  const [expandedInv, setExpandedInv] = useState<string | null>(null)

  // Quick expense form state
  const [showQForm, setShowQForm] = useState(false)
  const [editQ, setEditQ] = useState<QuickExpense | null>(null)
  const [qForm, setQForm] = useState(emptyQuick())

  const CAT_MAP = Object.fromEntries(categories.map(c => [c.key, c]))

  async function saveQuickCategory() {
    if (!quickCatForm.name) return
    setSavingCat(true)
    const key = quickCatForm.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
    await supabase.from('expense_categories').insert({
      organisation_id: ORG_ID, name: quickCatForm.name, key,
      colour: quickCatForm.colour, is_active: true, sort_order: categories.length + 1
    })
    setQuickCatForm({ name: '', colour: '#10b981' })
    setShowQuickCat(false)
    setSavingCat(false)
    await load()
  }

  const load = useCallback(async () => {
    setLoading(true)
    const monthStart = `${month}-01`
    const [mYear, mMonth] = month.split('-').map(Number)
    const monthEnd = new Date(mYear, mMonth, 0).toISOString().split('T')[0]
    const [cuRes, invRes, catRes, qRes, suppRes] = await Promise.all([
      supabase.from('cash_ups')
        .select('id,cash_up_date,cash_up_total,total_cash,eft_total,payouts,variance,customer_count,average_spend,status,notes')
        .eq('store_id', STORE_ID)
        .gte('cash_up_date', monthStart).lte('cash_up_date', monthEnd)
        .not('status', 'eq', 'draft')
        .order('cash_up_date', { ascending: false }),
      supabase.from('invoices')
        .select('*, invoice_lines(*)')
        .eq('store_id', STORE_ID)
        .gte('invoice_date', monthStart).lte('invoice_date', monthEnd)
        .order('invoice_date', { ascending: false }),
      supabase.from('expense_categories').select('id, name, key, colour, sort_order').eq('organisation_id', ORG_ID).eq('is_active', true).order('sort_order'),
      supabase.from('stock_suppliers').select('id, name').eq('store_id', STORE_ID).eq('is_active', true).order('sort_order'),
      supabase.from('expenses')
        .select('*').eq('store_id', STORE_ID)
        .gte('expense_date', monthStart).lte('expense_date', monthEnd)
        .order('expense_date', { ascending: false }),
    ])
    setCashUps(cuRes.data || [])
    setInvoices(invRes.data || [])
    const cats = catRes.data || []
    setCategories(cats.length ? cats : [])
    setQuickExp(qRes.data || [])
    setLoading(false)
  }, [month])

  useEffect(() => { load() }, [load])

  // ── Summary calcs ──
  const totalSales = cashUps.reduce((s, r) => s + Number(r.cash_up_total || 0), 0)
  const totalInvoices = invoices.reduce((s, r) => s + Number(r.total_amount || 0), 0)
  const totalQuick = quickExp.reduce((s, r) => s + Number(r.amount || 0), 0)
  const totalExpenses = totalInvoices + totalQuick
  const netProfit = totalSales - totalExpenses
  const totalVariance = cashUps.reduce((s, r) => s + Number(r.variance || 0), 0)
  const totalCustomers = cashUps.reduce((s, r) => s + Number(r.customer_count || 0), 0)

  // Category breakdown across invoices + quick
  const expByCategory: Record<string, number> = {}
  invoices.forEach(inv => {
    (inv.invoice_lines || []).forEach(line => {
      const k = CAT_MAP[line.category_key]?.name || line.category_key
      expByCategory[k] = (expByCategory[k] || 0) + Number(line.amount)
    })
  })
  quickExp.forEach(e => {
    const k = CAT_MAP[e.category_key]?.name || e.category_name || 'Other'
    expByCategory[k] = (expByCategory[k] || 0) + Number(e.amount)
  })

  // ── Invoice CRUD ──
  function openNewInvoice() {
    setEditInv(null); setInvForm(emptyInvoice()); setInvLines([emptyLine()]); setShowInvForm(true)
  }
  function openEditInvoice(inv: Invoice) {
    setEditInv(inv)
    setInvForm({ supplier: inv.supplier, invoice_number: inv.invoice_number, invoice_date: inv.invoice_date, due_date: inv.due_date || '', status: inv.status, payment_method: inv.payment_method || 'bank_transfer', notes: inv.notes || '' })
    setInvLines(inv.invoice_lines?.length ? inv.invoice_lines.map(l => ({ id: l.id, category_key: l.category_key, description: l.description || '', amount: Number(l.amount), vat_amount: Number(l.vat_amount || 0) })) : [emptyLine()])
    setShowInvForm(true)
  }

  function addLine() { setInvLines(l => [...l, emptyLine()]) }
  function removeLine(i: number) { setInvLines(l => l.filter((_, idx) => idx !== i)) }
  function updateLine(i: number, field: keyof InvoiceLine, value: string | number) {
    setInvLines(lines => lines.map((l, idx) => {
      if (idx !== i) return l
      const updated = { ...l, [field]: value }
      // Auto-calc VAT when amount changes
      if (field === 'amount') updated.vat_amount = Math.round(Number(value) / (1 + VAT_RATE) * VAT_RATE * 100) / 100
      return updated
    }))
  }

  const lineTotal = invLines.reduce((s, l) => s + Number(l.amount || 0), 0)
  const lineVatTotal = invLines.reduce((s, l) => s + Number(l.vat_amount || 0), 0)

  async function openGRV(inv: Invoice) {
    setGrvInvoice(inv)
    // Load supplier's stock items
    const { data: items } = await supabase
      .from('stock_items')
      .select('id, description, unit, supplier')
      .eq('store_id', STORE_ID)
      .eq('is_active', true)
      .eq('supplier', inv.supplier)
      .order('description')
    setGrvItems(items || [])
    // Pre-populate lines from stock items
    setGrvLines((items || []).map(i => ({
      stock_item_id: i.id,
      description: i.description || '',
      unit: i.unit || 'each',
      qty_received: '',
      unit_cost: ''
    })))
    setShowGRV(true)
  }

  async function saveGRV() {
    if (!grvInvoice) return
    setSavingGRV(true)
    // Only save lines where qty was entered
    const linesToSave = grvLines.filter(l => parseFloat(l.qty_received) > 0)
    if (linesToSave.length === 0) {
      alert('Enter at least one received quantity')
      setSavingGRV(false)
      return
    }
    // Insert stock purchases
    const purchases = linesToSave.map(l => ({
      store_id: STORE_ID,
      purchase_date: grvInvoice.invoice_date,
      supplier_name: grvInvoice.supplier,
      stock_item_id: l.stock_item_id,
      item_name: l.description,
      quantity: parseFloat(l.qty_received),
      unit: l.unit,
      unit_cost: parseFloat(l.unit_cost) || 0,
      total_cost: parseFloat(l.qty_received) * (parseFloat(l.unit_cost) || 0),
      invoice_number: grvInvoice.invoice_number || null,
      invoice_id: grvInvoice.id,
    }))
    const { error } = await supabase.from('stock_purchases').insert(purchases)
    if (error) { alert('Error saving GRV: ' + error.message); setSavingGRV(false); return }
    // Update invoice status to received
    await supabase.from('invoices').update({ status: 'received' }).eq('id', grvInvoice.id)
    setShowGRV(false)
    setGrvInvoice(null)
    setSavingGRV(false)
    load()
  }

  async function scanInvoice(file: File) {
    setScanning(true)
    setScanError('')
    try {
      const mediaType = file.type === 'application/pdf' ? 'application/pdf'
        : file.type === 'image/png' ? 'image/png'
        : file.type === 'image/webp' ? 'image/webp'
        : 'image/jpeg'

      // Read file as ArrayBuffer first, then convert to base64
      const arrayBuffer = await file.arrayBuffer()
      const uint8Array = new Uint8Array(arrayBuffer)
      let binary = ''
      for (let i = 0; i < uint8Array.byteLength; i++) {
        binary += String.fromCharCode(uint8Array[i])
      }
      const b64 = btoa(binary)

      if (!b64) throw new Error('Could not read file')

      const response = await fetch('/api/scan-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64: b64, mediaType })
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Scan failed')

      // Pre-fill the invoice form
      setShowInvForm(true)
      if (data.supplier) setInvForm(f => ({ ...f, supplier: data.supplier }))
      if (data.invoice_number) setInvForm(f => ({ ...f, invoice_number: data.invoice_number }))
      if (data.invoice_date) setInvForm(f => ({ ...f, invoice_date: data.invoice_date }))
      if (data.due_date) setInvForm(f => ({ ...f, due_date: data.due_date }))
      if (data.notes) setInvForm(f => ({ ...f, notes: data.notes }))
      if (data.lines && data.lines.length > 0) {
        setInvLines(data.lines.map((l: {category_key?: string; description?: string; amount?: number; vat_amount?: number}) => ({
          category_key: l.category_key || 'cost_of_sales',
          description: l.description || '',
          amount: Number(l.amount) || 0,
          vat_amount: Number(l.vat_amount) || 0,
        })))
      }
    } catch (e: unknown) {
      setScanError(e instanceof Error ? e.message : 'Could not read invoice. Please try again.')
    }
    setScanning(false)
  }


  async function saveInvoice() {
    if (!invForm.supplier) { setError('Supplier is required'); return }
    if (!invForm.invoice_date) { setError('Date is required'); return }
    if (invLines.every(l => !l.amount)) { setError('At least one line item with an amount is required'); return }
    setSaving(true); setError('')
    const payload = {
      store_id: STORE_ID,
      organisation_id: ORG_ID,
      ...invForm,
      total_amount: lineTotal,
      total_vat: lineVatTotal,
    }
    let invoiceId = editInv?.id
    if (editInv) {
      const { error: e } = await supabase.from('invoices').update(payload).eq('id', editInv.id)
      if (e) { setError(e.message); setSaving(false); return }
      await supabase.from('invoice_lines').delete().eq('invoice_id', editInv.id)
    } else {
      const { data, error: e } = await supabase.from('invoices').insert(payload).select().single()
      if (e) { setError(e.message); setSaving(false); return }
      invoiceId = data.id
    }
    const lines = invLines.filter(l => Number(l.amount) > 0).map(l => ({
      invoice_id: invoiceId, store_id: STORE_ID,
      category_key: l.category_key, description: l.description,
      amount: Number(l.amount), vat_amount: Number(l.vat_amount || 0),
    }))
    if (lines.length) {
      const { error: le } = await supabase.from('invoice_lines').insert(lines)
      if (le) { setError(le.message); setSaving(false); return }
    }
    setSaving(false); setShowInvForm(false); setEditInv(null); load()
  }

  async function deleteInvoice(id: string) {
    if (!confirm('Delete this invoice and all its lines?')) return
    await supabase.from('invoice_lines').delete().eq('invoice_id', id)
    await supabase.from('invoices').delete().eq('id', id)
    load()
  }

  async function updateInvoiceStatus(id: string, status: string) {
    await supabase.from('invoices').update({ status }).eq('id', id)
    load()
  }

  // ── Quick expense CRUD ──
  async function saveQuick() {
    setSaving(true); setError('')
    const cat = categories.find(c => c.key === qForm.category_key)
    const payload = {
      store_id: STORE_ID, expense_date: qForm.expense_date,
      category_key: qForm.category_key, category_name: cat?.name || '',
      description: qForm.description, amount: parseFloat(String(qForm.amount)) || 0,
      vat_amount: parseFloat(String(qForm.vat_amount)) || 0,
      supplier: qForm.supplier, invoice_number: qForm.invoice_number,
      payment_method: qForm.payment_method, notes: qForm.notes,
    }
    let err = null
    if (editQ) {
      const res = await supabase.from('expenses').update(payload).eq('id', editQ.id)
      err = res.error
    } else {
      const res = await supabase.from('expenses').insert(payload)
      err = res.error
    }
    setSaving(false)
    if (err) { setError(err.message); return }
    setShowQForm(false); setEditQ(null); load()
  }

  async function deleteQuick(id: string) {
    if (!confirm('Delete this expense?')) return
    await supabase.from('expenses').delete().eq('id', id)
    load()
  }

  // ── Styles ──
  const hdr: React.CSSProperties = { background: 'linear-gradient(135deg, #0a1f12 0%, #1a5c38 100%)', padding: '24px 32px', color: '#fff', display: 'flex', alignItems: 'center', gap: 16 }
  const card: React.CSSProperties = { background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 1px 4px rgba(0,0,0,0.08)', marginBottom: 16 }
  const inp: React.CSSProperties = { width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' as const }
  const btn = (color = '#1a5c38'): React.CSSProperties => ({ background: color, color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', cursor: 'pointer', fontSize: 14, fontWeight: 600 })
  const smBtn = (bg: string, color: string): React.CSSProperties => ({ background: bg, color, border: 'none', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 12, fontWeight: 600 })

  const statusBadge = (status: string, size = 12) => {
    const map: Record<string, { bg: string; color: string }> = {
      submitted: { bg: '#f0fdf4', color: '#16a34a' }, pending: { bg: '#fffbeb', color: '#d97706' },
      approved: { bg: '#eff6ff', color: '#2563eb' }, draft: { bg: '#f3f4f6', color: '#6b7280' },
      paid: { bg: '#f0fdf4', color: '#15803d' }, signed_off: { bg: '#f0fdf4', color: '#15803d' },
    }
    const s = map[status] || { bg: '#f3f4f6', color: '#6b7280' }
    return <span style={{ background: s.bg, color: s.color, padding: '2px 10px', borderRadius: 20, fontSize: size, fontWeight: 600, textTransform: 'capitalize' as const }}>{status || 'draft'}</span>
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f0f4f0' }}>
      {/* Header */}
      <div style={hdr}>
        <button onClick={() => router.push('/dashboard')} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8, color: '#fff', padding: '8px 14px', cursor: 'pointer', fontSize: 14 }}>← Back</button>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>💰 Income &amp; Expenses</h1>
          <p style={{ margin: '2px 0 0', opacity: 0.7, fontSize: 13 }}>Track sales, supplier bills and expenses</p>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <input type="month" value={month} onChange={e => setMonth(e.target.value)}
            style={{ ...inp, width: 160, background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', color: '#fff' }} />
        </div>
      </div>

      {/* Tabs */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', display: 'flex', paddingLeft: 24, overflowX: 'auto' }}>
        {TABS.map((t, i) => (
          <button key={t} onClick={() => setTab(i)}
            style={{ padding: '14px 20px', border: 'none', background: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
              fontWeight: tab === i ? 700 : 400, color: tab === i ? '#1a5c38' : '#6b7280', fontSize: 14,
              borderBottom: tab === i ? '2px solid #1a5c38' : '2px solid transparent' }}>
            {t}
          </button>
        ))}
      </div>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 16px' }}>
        {loading ? <div style={{ textAlign: 'center', padding: 60, color: '#6b7280' }}>Loading…</div> : (<>

          {/* ── SUMMARY ── */}
          {tab === 0 && (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 16, marginBottom: 24 }}>
                {[
                  { label: 'Total Sales', value: fmt(totalSales), color: '#16a34a', icon: '📈', sub: `${cashUps.length} cash-ups` },
                  { label: 'Supplier Bills', value: fmt(totalInvoices), color: '#dc2626', icon: '🧾', sub: `${invoices.length} invoices` },
                  { label: 'Quick Expenses', value: fmt(totalQuick), color: '#f97316', icon: '💵', sub: `${quickExp.length} entries` },
                  { label: netProfit >= 0 ? 'Net Profit' : 'Net Loss', value: fmt(netProfit), color: netProfit >= 0 ? '#1a5c38' : '#ef4444', icon: netProfit >= 0 ? '✅' : '⚠️', sub: totalSales > 0 ? `${((netProfit / totalSales) * 100).toFixed(1)}% margin` : '' },
                  { label: 'Variance', value: fmt(totalVariance), color: Math.abs(totalVariance) > 500 ? '#dc2626' : '#6b7280', icon: '⚖️', sub: `${totalCustomers} customers` },
                ].map(k => (
                  <div key={k.label} style={{ ...card, marginBottom: 0, textAlign: 'center', padding: 18 }}>
                    <div style={{ fontSize: 24 }}>{k.icon}</div>
                    <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>{k.label}</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: k.color, marginTop: 4 }}>{k.value}</div>
                    {k.sub && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{k.sub}</div>}
                  </div>
                ))}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div style={card}>
                  <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700 }}>Expense Breakdown by Category</h3>
                  {Object.keys(expByCategory).length === 0
                    ? <p style={{ color: '#6b7280', fontSize: 14 }}>No expenses recorded this month.</p>
                    : Object.entries(expByCategory).sort((a, b) => b[1] - a[1]).map(([cat, amt]) => {
                      const pct = totalExpenses > 0 ? (amt / totalExpenses) * 100 : 0
                      const catEntry = categories.find(c => c.name === cat)
                      return (
                        <div key={cat} style={{ marginBottom: 12 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 13 }}>
                            <span style={{ fontWeight: 600 }}>{cat}</span>
                            <span>{fmt(amt)} <span style={{ color: '#9ca3af' }}>({pct.toFixed(1)}%)</span></span>
                          </div>
                          <div style={{ background: '#f3f4f6', borderRadius: 6, height: 7 }}>
                            <div style={{ background: catEntry?.colour || '#6b7280', width: `${pct}%`, height: 7, borderRadius: 6 }} />
                          </div>
                        </div>
                      )
                    })}
                </div>
                <div style={card}>
                  <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700 }}>Sales vs Expenses — {month}</h3>
                  {[
                    { label: 'Total Sales', value: totalSales, color: '#16a34a', pct: 100 },
                    { label: 'Supplier Bills', value: totalInvoices, color: '#dc2626', pct: totalSales > 0 ? (totalInvoices / totalSales) * 100 : 0 },
                    { label: 'Quick Expenses', value: totalQuick, color: '#f97316', pct: totalSales > 0 ? (totalQuick / totalSales) * 100 : 0 },
                  ].map(row => (
                    <div key={row.label} style={{ marginBottom: 16 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginBottom: 4 }}>
                        <span style={{ fontWeight: 600 }}>{row.label}</span>
                        <span style={{ color: row.color, fontWeight: 700 }}>{fmt(row.value)}</span>
                      </div>
                      <div style={{ background: '#f3f4f6', borderRadius: 6, height: 10 }}>
                        <div style={{ background: row.color, width: `${Math.min(row.pct, 100)}%`, height: 10, borderRadius: 6 }} />
                      </div>
                    </div>
                  ))}
                  <div style={{ borderTop: '2px solid #e5e7eb', paddingTop: 12, marginTop: 4, display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 700 }}>
                    <span>{netProfit >= 0 ? 'Net Profit' : 'Net Loss'}</span>
                    <span style={{ color: netProfit >= 0 ? '#16a34a' : '#dc2626' }}>{fmt(netProfit)}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── CASH-UPS / SALES ── */}
          {tab === 1 && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Cash-Ups / Sales</h2>
                <button style={btn()} onClick={() => router.push('/cashup')}>+ New Cash-Up →</button>
              </div>
              <div style={{ ...card, background: '#fffbeb', border: '1px solid #fde68a', padding: '12px 16px', marginBottom: 16 }}>
                <p style={{ margin: 0, fontSize: 13, color: '#92400e' }}>
                  💡 Sales figures are pulled directly from submitted cash-ups. Submit cash-ups via the mobile app or <a href="/cashup" style={{ color: '#92400e' }}>/cashup</a>.
                </p>
              </div>
              {cashUps.length === 0
                ? <div style={{ ...card, textAlign: 'center', padding: 48, color: '#6b7280' }}>
                  <div style={{ fontSize: 40, marginBottom: 8 }}>🧾</div>
                  <p>No cash-ups submitted for {month}.</p>
                  <button style={{ ...btn(), marginTop: 12 }} onClick={() => router.push('/cashup')}>Go to Cash-Up →</button>
                </div>
                : <div style={card}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                        {['Date', 'POS Total', 'Cash', 'EFT', 'Payouts', 'Variance', 'Customers', 'Avg Spend', 'Status'].map(h => (
                          <th key={h} style={{ padding: '8px 10px', textAlign: h === 'Date' || h === 'Status' ? 'left' : 'right', color: '#6b7280', fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {cashUps.map(c => (
                        <tr key={c.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                          <td style={{ padding: '9px 10px', fontWeight: 600 }}>{c.cash_up_date}</td>
                          <td style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 700, color: '#16a34a' }}>{fmt(Number(c.cash_up_total))}</td>
                          <td style={{ padding: '9px 10px', textAlign: 'right' }}>{fmt(Number(c.total_cash))}</td>
                          <td style={{ padding: '9px 10px', textAlign: 'right' }}>{fmt(Number(c.eft_total))}</td>
                          <td style={{ padding: '9px 10px', textAlign: 'right', color: '#dc2626' }}>{fmt(Number(c.payouts))}</td>
                          <td style={{ padding: '9px 10px', textAlign: 'right', color: Math.abs(Number(c.variance)) > 50 ? '#dc2626' : '#16a34a', fontWeight: 600 }}>{fmt(Number(c.variance))}</td>
                          <td style={{ padding: '9px 10px', textAlign: 'right' }}>{c.customer_count || '—'}</td>
                          <td style={{ padding: '9px 10px', textAlign: 'right' }}>{c.average_spend ? fmt(Number(c.average_spend)) : '—'}</td>
                          <td style={{ padding: '9px 10px' }}>{statusBadge(c.status)}</td>
                        </tr>
                      ))}
                      <tr style={{ borderTop: '2px solid #e5e7eb', background: '#f0fdf4' }}>
                        <td style={{ padding: '10px', fontWeight: 700 }}>Month Total</td>
                        <td style={{ padding: '10px', textAlign: 'right', fontWeight: 800, color: '#16a34a', fontSize: 15 }}>{fmt(totalSales)}</td>
                        <td colSpan={7} />
                      </tr>
                    </tbody>
                  </table>
                </div>}
            </div>
          )}

          {/* ── SUPPLIER BILLS ── */}
          {tab === 2 && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Supplier Bills</h2>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <div style={{ position: 'relative' }}>
                    <input id="scan-file-input" type="file" accept="image/*,application/pdf"
                      style={{ position: 'absolute', opacity: 0, width: 0, height: 0, overflow: 'hidden' }}
                      onChange={e => {
                      const files = e.target.files
                      if (files && files.length > 0) {
                        const f = files[0]
                        scanInvoice(f)
                      }
                    }} />
                    <button disabled={scanning} onClick={() => { const el = document.getElementById('scan-file-input') as HTMLInputElement; if (el) el.click() }}
                      style={{ ...btn('#6366f1'), cursor: scanning ? 'wait' : 'pointer', opacity: scanning ? 0.7 : 1 }}>
                      {scanning ? '⏳ Scanning...' : '📷 Scan Invoice'}
                    </button>
                  </div>
                  <button style={btn()} onClick={openNewInvoice}>+ New Invoice</button>
                </div>
              </div>

              {/* Invoice form */}
              {showInvForm && (
                <div style={{ ...card, border: '2px solid #1a5c38', marginBottom: 24 }}>
                  <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 700 }}>{editInv ? 'Edit' : 'New'} Supplier Invoice</h3>
                  {error && <div style={{ background: '#fef2f2', color: '#dc2626', padding: '8px 12px', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>{error}</div>}

                  {/* Header fields */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
                    <div>
                      <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Supplier *</label>
                      <select onChange={e => setInvForm(f => ({ ...f, supplier: e.target.value === '_other' ? '' : e.target.value }))} value={suppliers.some(s => s.name === invForm.supplier) ? invForm.supplier : (invForm.supplier ? '_other' : '')} style={inp}>
                        <option value="">— Select Supplier —</option>
                        {suppliers.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                        <option value="_other">+ Other (type name below)</option>
                      </select>
                      {!suppliers.some(s => s.name === invForm.supplier) && (
                        <input type="text" placeholder="Type supplier name" value={invForm.supplier} onChange={e => setInvForm(f => ({ ...f, supplier: e.target.value }))} style={{ ...inp, marginTop: 8 }} />
                      )}
                    </div>
                    <div>
                      <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Invoice Number</label>
                      <input type="text" placeholder="INV-001" value={invForm.invoice_number} onChange={e => setInvForm(f => ({ ...f, invoice_number: e.target.value }))} style={inp} />
                    </div>
                    <div>
                      <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Status</label>
                      <select value={invForm.status} onChange={e => setInvForm(f => ({ ...f, status: e.target.value }))} style={inp}>
                        {INVOICE_STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Invoice Date *</label>
                      <input type="date" value={invForm.invoice_date} onChange={e => setInvForm(f => ({ ...f, invoice_date: e.target.value }))} style={inp} />
                    </div>
                    <div>
                      <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Due Date</label>
                      <input type="date" value={invForm.due_date} onChange={e => setInvForm(f => ({ ...f, due_date: e.target.value }))} style={inp} />
                    </div>
                    <div>
                      <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Payment Method</label>
                      <select value={invForm.payment_method} onChange={e => setInvForm(f => ({ ...f, payment_method: e.target.value }))} style={inp}>
                        {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</option>)}
                      </select>
                    </div>
                    <div style={{ gridColumn: 'span 3' }}>
                      <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Notes</label>
                      <input type="text" placeholder="Optional notes" value={invForm.notes} onChange={e => setInvForm(f => ({ ...f, notes: e.target.value }))} style={inp} />
                    </div>
                  </div>

                  {/* Line items */}
                  <div style={{ background: '#f9fafb', borderRadius: 10, padding: 16, marginBottom: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Line Items</h4>
                      <button style={btn()} onClick={addLine}>+ Add Line</button>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr 1fr auto', gap: 8, marginBottom: 8 }}>
                      {['Category', 'Description', 'Amount (incl VAT)', 'VAT Amount', ''].map(h => (
                        <div key={h} style={{ fontSize: 12, fontWeight: 600, color: '#6b7280' }}>{h}</div>
                      ))}
                    </div>
                    {invLines.map((line, i) => (
                      <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr 1fr auto', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                        <div>
                          <select value={line.category_key} onChange={e => updateLine(i, 'category_key', e.target.value)} style={{ ...inp, padding: '8px 10px' }}>
                            {categories.map(c => <option key={c.key} value={c.key}>{c.name}</option>)}
                          </select>
                          {i === 0 && <button type="button" onClick={() => setShowQuickCat(true)} style={{ fontSize: '11px', color: '#1a5c38', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0', fontWeight: '600' }}>+ New Category</button>}
                        </div>
                        <input type="text" placeholder="Description" value={line.description} onChange={e => updateLine(i, 'description', e.target.value)} style={{ ...inp, padding: '8px 10px' }} />
                        <input type="number" step="0.01" placeholder="0.00" value={line.amount || ''} onChange={e => updateLine(i, 'amount', e.target.value)} style={{ ...inp, padding: '8px 10px' }} />
                        <input type="number" step="0.01" placeholder="0.00" value={line.vat_amount || ''} onChange={e => updateLine(i, 'vat_amount', e.target.value)} style={{ ...inp, padding: '8px 10px' }} />
                        <button onClick={() => removeLine(i)} disabled={invLines.length === 1}
                          style={{ background: '#fef2f2', color: '#dc2626', border: 'none', borderRadius: 6, padding: '8px 12px', cursor: 'pointer', fontSize: 16, fontWeight: 700 }}>×</button>
                      </div>
                    ))}
                    <div style={{ borderTop: '2px solid #e5e7eb', marginTop: 8, paddingTop: 12, display: 'flex', justifyContent: 'flex-end', gap: 24, fontSize: 14 }}>
                      <span style={{ color: '#6b7280' }}>VAT: <strong>{fmt(lineVatTotal)}</strong></span>
                      <span style={{ fontWeight: 800, fontSize: 16 }}>Total: <span style={{ color: '#1a5c38' }}>{fmt(lineTotal)}</span></span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 10 }}>
                    <button style={btn()} onClick={saveInvoice} disabled={saving}>{saving ? 'Saving…' : 'Save Invoice'}</button>
                    <button style={btn('#6b7280')} onClick={() => { setShowInvForm(false); setEditInv(null) }}>Cancel</button>
                  </div>
                </div>
              )}

              {/* Invoice list */}
              {invoices.length === 0 && !showInvForm
                ? <div style={{ ...card, textAlign: 'center', padding: 48, color: '#6b7280' }}>
                  <div style={{ fontSize: 40, marginBottom: 8 }}>📄</div>
                  <p>No supplier invoices for {month}.</p>
                  <button style={{ ...btn(), marginTop: 12 }} onClick={openNewInvoice}>+ New Invoice</button>
                </div>
                : invoices.map(inv => (
                  <div key={inv.id} style={card}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 15 }}>{inv.supplier}</div>
                          <div style={{ fontSize: 12, color: '#6b7280' }}>
                            {inv.invoice_number && <span style={{ marginRight: 10 }}>#{inv.invoice_number}</span>}
                            {inv.invoice_date}
                            {inv.due_date && <span style={{ marginLeft: 10 }}>Due: {inv.due_date}</span>}
                          </div>
                        </div>
                        {statusBadge(inv.status, 13)}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{ fontWeight: 800, fontSize: 17, color: '#dc2626' }}>{fmt(Number(inv.total_amount))}</span>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {inv.status === 'draft' && <button onClick={() => updateInvoiceStatus(inv.id, 'approved')} style={smBtn('#f0fdf4', '#16a34a')}>Approve</button>}
                          {inv.status === 'approved' && <button onClick={() => openGRV(inv)} style={smBtn('#fef3c7', '#d97706')}>📦 Receive Goods</button>}
                          {inv.status === 'approved' && <button onClick={() => updateInvoiceStatus(inv.id, 'paid')} style={smBtn('#eff6ff', '#2563eb')}>Mark Paid</button>}
                          {inv.status === 'received' && <button onClick={() => updateInvoiceStatus(inv.id, 'paid')} style={smBtn('#eff6ff', '#2563eb')}>Mark Paid</button>}
                          <button onClick={() => openEditInvoice(inv)} style={smBtn('#f3f4f6', '#374151')}>Edit</button>
                          <button onClick={() => setExpandedInv(expandedInv === inv.id ? null : inv.id)} style={smBtn('#f3f4f6', '#374151')}>
                            {expandedInv === inv.id ? '▲ Hide' : '▼ Lines'}
                          </button>
                          <button onClick={() => deleteInvoice(inv.id)} style={smBtn('#fef2f2', '#dc2626')}>Del</button>
                        </div>
                      </div>
                    </div>

                    {/* Expanded lines */}
                    {expandedInv === inv.id && (
                      <div style={{ marginTop: 16, borderTop: '1px solid #f3f4f6', paddingTop: 12 }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                          <thead>
                            <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                              {['Category', 'Description', 'Amount', 'VAT'].map(h => (
                                <th key={h} style={{ padding: '6px 10px', textAlign: h === 'Amount' || h === 'VAT' ? 'right' : 'left', color: '#6b7280', fontWeight: 600 }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {(inv.invoice_lines || []).map((line, i) => {
                              const cat = CAT_MAP[line.category_key]
                              return (
                                <tr key={i} style={{ borderBottom: '1px solid #f9fafb' }}>
                                  <td style={{ padding: '7px 10px' }}>
                                    <span style={{ background: (cat?.colour || '#6b7280') + '20', color: cat?.colour || '#6b7280', padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600 }}>
                                      {cat?.name || line.category_key}
                                    </span>
                                  </td>
                                  <td style={{ padding: '7px 10px', color: '#374151' }}>{line.description || '—'}</td>
                                  <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 600 }}>{fmt(Number(line.amount))}</td>
                                  <td style={{ padding: '7px 10px', textAlign: 'right', color: '#6b7280' }}>{fmt(Number(line.vat_amount || 0))}</td>
                                </tr>
                              )
                            })}
                            <tr style={{ borderTop: '2px solid #e5e7eb', background: '#f9fafb' }}>
                              <td colSpan={2} style={{ padding: '8px 10px', fontWeight: 700 }}>Total</td>
                              <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 800, color: '#dc2626' }}>{fmt(Number(inv.total_amount))}</td>
                              <td style={{ padding: '8px 10px', textAlign: 'right', color: '#6b7280' }}>{fmt(Number(inv.total_vat || 0))}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ))}
            </div>
          )}

          {/* ── QUICK EXPENSES ── */}
          {tab === 3 && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Quick Expenses</h2>
                  <p style={{ margin: '4px 0 0', fontSize: 13, color: '#6b7280' }}>Small cash items without a formal invoice — petrol, airtime, staff meals, etc.</p>
                </div>
                <button style={btn()} onClick={() => { setEditQ(null); setQForm(emptyQuick()); setShowQForm(true) }}>+ Add Expense</button>
              </div>

              {showQForm && (
                <div style={{ ...card, border: '2px solid #1a5c38', marginBottom: 24, marginTop: 16 }}>
                  <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700 }}>{editQ ? 'Edit' : 'New'} Quick Expense</h3>
                  {error && <div style={{ background: '#fef2f2', color: '#dc2626', padding: '8px 12px', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>{error}</div>}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                    <div>
                      <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Date *</label>
                      <input type="date" value={qForm.expense_date} onChange={e => setQForm(f => ({ ...f, expense_date: e.target.value }))} style={inp} />
                    </div>
                    <div>
                      <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Category *</label>
                      <select value={qForm.category_key} onChange={e => setQForm(f => ({ ...f, category_key: e.target.value }))} style={inp}>
                        {categories.map(c => <option key={c.key} value={c.key}>{c.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Amount (R) *</label>
                      <input type="number" step="0.01" placeholder="0.00" value={qForm.amount} onChange={e => setQForm(f => ({ ...f, amount: e.target.value }))} style={inp} />
                    </div>
                    <div style={{ gridColumn: 'span 2' }}>
                      <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Description *</label>
                      <input type="text" placeholder="e.g. Petrol for delivery" value={qForm.description} onChange={e => setQForm(f => ({ ...f, description: e.target.value }))} style={inp} />
                    </div>
                    <div>
                      <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Payment Method</label>
                      <select value={qForm.payment_method} onChange={e => setQForm(f => ({ ...f, payment_method: e.target.value }))} style={inp}>
                        {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Supplier (optional)</label>
                      <input type="text" placeholder="Supplier name" value={qForm.supplier} onChange={e => setQForm(f => ({ ...f, supplier: e.target.value }))} style={inp} />
                    </div>
                    <div>
                      <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Notes</label>
                      <input type="text" placeholder="Optional notes" value={qForm.notes} onChange={e => setQForm(f => ({ ...f, notes: e.target.value }))} style={inp} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                    <button style={btn()} onClick={saveQuick} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
                    <button style={btn('#6b7280')} onClick={() => { setShowQForm(false); setEditQ(null) }}>Cancel</button>
                  </div>
                </div>
              )}

              {quickExp.length === 0
                ? <div style={{ ...card, textAlign: 'center', padding: 48, color: '#6b7280', marginTop: 16 }}>
                  <div style={{ fontSize: 40, marginBottom: 8 }}>💵</div>
                  <p>No quick expenses for {month}.</p>
                </div>
                : <div style={{ ...card, marginTop: 16 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                        {['Date', 'Category', 'Description', 'Supplier', 'Method', 'Amount', ''].map(h => (
                          <th key={h} style={{ textAlign: h === 'Amount' ? 'right' : 'left', padding: '8px 10px', color: '#6b7280', fontWeight: 600, fontSize: 12 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {quickExp.map(e => {
                        const cat = CAT_MAP[e.category_key] || categories.find(c => c.name === e.category_name)
                        return (
                          <tr key={e.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                            <td style={{ padding: '9px 10px' }}>{e.expense_date}</td>
                            <td style={{ padding: '9px 10px' }}>
                              <span style={{ background: (cat?.colour || '#6b7280') + '20', color: cat?.colour || '#6b7280', padding: '2px 8px', borderRadius: 20, fontSize: 12, fontWeight: 600 }}>
                                {cat?.name || e.category_name || '—'}
                              </span>
                            </td>
                            <td style={{ padding: '9px 10px' }}>{e.description}</td>
                            <td style={{ padding: '9px 10px', color: '#6b7280', fontSize: 12 }}>{e.supplier || '—'}</td>
                            <td style={{ padding: '9px 10px', color: '#6b7280', fontSize: 12 }}>{(e.payment_method || '').replace(/_/g, ' ')}</td>
                            <td style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 700, color: '#dc2626' }}>{fmt(Number(e.amount))}</td>
                            <td style={{ padding: '9px 10px' }}>
                              <div style={{ display: 'flex', gap: 6 }}>
                                <button onClick={() => { setEditQ(e); setQForm({ expense_date: e.expense_date, category_key: e.category_key || 'other', description: e.description, amount: String(e.amount), vat_amount: String(e.vat_amount || ''), supplier: e.supplier || '', invoice_number: e.invoice_number || '', payment_method: e.payment_method || 'cash', notes: e.notes || '' }); setShowQForm(true) }} style={smBtn('#eff6ff', '#2563eb')}>Edit</button>
                                <button onClick={() => deleteQuick(e.id)} style={smBtn('#fef2f2', '#dc2626')}>Del</button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                      <tr style={{ borderTop: '2px solid #e5e7eb', background: '#fef2f2' }}>
                        <td colSpan={5} style={{ padding: '10px', fontWeight: 700 }}>Month Total</td>
                        <td style={{ padding: '10px', textAlign: 'right', fontWeight: 800, color: '#dc2626', fontSize: 15 }}>{fmt(totalQuick)}</td>
                        <td />
                      </tr>
                    </tbody>
                  </table>
                </div>}
            </div>
          )}

          {/* ── FOOD COST ── */}
          {tab === 4 && (
            <div style={{ ...card, textAlign: 'center', padding: 60 }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>🍔</div>
              <h3 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 700 }}>Food Cost Analysis</h3>
              <p style={{ color: '#6b7280', fontSize: 14, maxWidth: 400, margin: '0 auto 16px' }}>
                Compare theoretical vs actual food cost using your Stock Management data.
              </p>
              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '16px 24px', display: 'inline-block', textAlign: 'left' }}>
                <p style={{ margin: '0 0 6px', fontWeight: 700, color: '#166534', fontSize: 14 }}>Formula (matches your Excel):</p>
                <ul style={{ margin: 0, paddingLeft: 20, color: '#374151', fontSize: 13, lineHeight: 2 }}>
                  <li>Opening Stock Value</li>
                  <li>+ Purchases (from Stock module)</li>
                  <li>− Closing Stock Value</li>
                  <li>− Wastage</li>
                  <li>= Cost of Sales → Food Cost %</li>
                </ul>
              </div>
              <div style={{ marginTop: 24 }}>
                <button style={btn()} onClick={() => router.push('/stock')}>Go to Stock Management →</button>
              </div>
            </div>
          )}
        </>)}
      </div>
      {/* Quick Add Category Modal */}
      {showQuickCat && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '16px' }}>
          <div style={{ background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '400px', boxShadow: '0 24px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h2 style={{ fontSize: '16px', fontWeight: '800', color: '#111', margin: 0 }}>🏷️ New Expense Category</h2>
              <button onClick={() => setShowQuickCat(false)} style={{ background: '#f3f4f6', border: 'none', borderRadius: '8px', width: '32px', height: '32px', cursor: 'pointer', fontSize: '16px' }}>✕</button>
            </div>
            <div style={{ padding: '20px 24px' }}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600', display: 'block', marginBottom: '6px' }}>Category Name *</label>
                <input type="text" placeholder="e.g. Royalties, Cleaning, Gas" value={quickCatForm.name}
                  onChange={e => setQuickCatForm(f => ({ ...f, name: e.target.value }))}
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' as const }} />
              </div>
              <div style={{ marginBottom: '20px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600', display: 'block', marginBottom: '8px' }}>Colour</label>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                  <input type="color" value={quickCatForm.colour} onChange={e => setQuickCatForm(f => ({ ...f, colour: e.target.value }))}
                    style={{ width: '40px', height: '40px', border: '1.5px solid #e5e7eb', borderRadius: '8px', cursor: 'pointer', padding: '2px' }} />
                  {COLOUR_PALETTE.map(c => (
                    <div key={c} onClick={() => setQuickCatForm(f => ({ ...f, colour: c }))}
                      style={{ width: '22px', height: '22px', borderRadius: '4px', background: c, cursor: 'pointer', border: quickCatForm.colour === c ? '2px solid #111' : '2px solid transparent' }} />
                  ))}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={saveQuickCategory} disabled={savingCat || !quickCatForm.name}
                  style={{ flex: 1, background: quickCatForm.name ? '#1a5c38' : '#d1d5db', color: '#fff', border: 'none', borderRadius: '8px', padding: '12px', cursor: quickCatForm.name ? 'pointer' : 'not-allowed', fontSize: '14px', fontWeight: '700' }}>
                  {savingCat ? 'Saving…' : 'Add Category'}
                </button>
                <button onClick={() => setShowQuickCat(false)}
                  style={{ background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: '8px', padding: '12px 16px', cursor: 'pointer', fontSize: '14px', fontWeight: '700' }}>
                  Cancel
                </button>
              </div>
              <p style={{ margin: '12px 0 0', fontSize: '12px', color: '#9ca3af', textAlign: 'center' }}>
                Manage all categories in <a href="/settings" style={{ color: '#1a5c38' }}>Settings → Expense Categories</a>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* GRV Modal */}
      {showGRV && grvInvoice && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '16px' }}>
          <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 800, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 24px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>📦 Receive Goods — {grvInvoice.supplier}</h2>
                <p style={{ margin: '4px 0 0', fontSize: 13, color: '#6b7280' }}>Invoice {grvInvoice.invoice_number || '—'} • {grvInvoice.invoice_date} • Enter quantities received</p>
              </div>
              <button onClick={() => setShowGRV(false)} style={{ background: '#f3f4f6', border: 'none', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', fontSize: 16 }}>✕</button>
            </div>
            <div style={{ padding: '16px 24px' }}>
              {grvLines.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40, color: '#6b7280' }}>
                  <div style={{ fontSize: 36, marginBottom: 8 }}>📦</div>
                  <p>No stock items found for <strong>{grvInvoice.supplier}</strong>.</p>
                  <p style={{ fontSize: 13 }}>Go to Stock Items tab and assign items to this supplier first.</p>
                </div>
              ) : (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 8, marginBottom: 8, fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' as const }}>
                    <div>Item</div><div>Unit</div><div>Qty Received</div><div>Unit Cost (R)</div>
                  </div>
                  <div style={{ maxHeight: 400, overflowY: 'auto' }}>
                    {grvLines.map((line, i) => (
                      <div key={line.stock_item_id} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{line.description}</div>
                        <div style={{ fontSize: 13, color: '#6b7280' }}>{line.unit}</div>
                        <input type="number" step="0.1" min="0" placeholder="0"
                          value={line.qty_received}
                          onChange={e => setGrvLines(ls => ls.map((l,idx) => idx===i ? {...l, qty_received: e.target.value} : l))}
                          style={{ padding: '8px 10px', border: '1.5px solid #e5e7eb', borderRadius: 8, fontSize: 14, outline: 'none',
                            background: parseFloat(line.qty_received) > 0 ? '#f0fdf4' : '#fff',
                            borderColor: parseFloat(line.qty_received) > 0 ? '#16a34a' : '#e5e7eb' }} />
                        <input type="number" step="0.01" min="0" placeholder="0.00"
                          value={line.unit_cost}
                          onChange={e => setGrvLines(ls => ls.map((l,idx) => idx===i ? {...l, unit_cost: e.target.value} : l))}
                          style={{ padding: '8px 10px', border: '1.5px solid #e5e7eb', borderRadius: 8, fontSize: 14, outline: 'none' }} />
                      </div>
                    ))}
                  </div>
                  <div style={{ borderTop: '2px solid #e5e7eb', marginTop: 16, paddingTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 13, color: '#6b7280' }}>
                      {grvLines.filter(l => parseFloat(l.qty_received) > 0).length} of {grvLines.length} items received
                    </span>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <button onClick={() => setShowGRV(false)} style={{ background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: 10, padding: '10px 18px', cursor: 'pointer', fontWeight: 700 }}>Cancel</button>
                      <button onClick={saveGRV} disabled={savingGRV}
                        style={{ background: '#1a5c38', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 18px', cursor: 'pointer', fontWeight: 700, fontSize: 14 }}>
                        {savingGRV ? 'Saving...' : '✓ Confirm Receipt & Update Stock'}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
