'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

const STORE_ID = '05328298-fc27-4c9f-b091-bb7f6598b601'

type StockCategory = { id: string; name: string; color: string; sort_order: number }
type StockItem = { id: string; category: string | null; name: string; description: string; unit: string; cost_price: number; price: number; par_level: number; current_qty: number; is_active: boolean; sort_order: number; supplier: string | null; on_daily_sheet: boolean; is_catch_weight: boolean; kg_price: number; avg_weight_kg: number; parent_item_id: string | null; portion_size: number | null }
type StockAdjustment = { id: string; store_id: string; stock_item_id: string; item_name: string; qty_before: number; qty_after: number; adjustment: number; unit: string; reason: string; notes: string; created_at: string }
type InvoiceColumn = { name: string; maps_to: string | null }
type StockSupplier = { id: string; name: string; contact_name: string | null; phone: string | null; email: string | null; order_day: string | null; notes: string | null; payment_terms_days: number | null; is_active: boolean; sort_order: number; invoice_columns: InvoiceColumn[] | null; invoice_vat_included: boolean | null; delivers_stock: boolean }
const MAPS_TO_OPTIONS = [
  { value: '', label: '— ignore this column —' },
  { value: 'description', label: 'Item Description' },
  { value: 'qty', label: 'Quantity' },
  { value: 'uom', label: 'Unit of Measure' },
  { value: 'unit_price_excl', label: 'Unit Price (excl VAT) ← use this for pricing' },
  { value: 'unit_price_incl', label: 'Unit Price (incl VAT)' },
  { value: 'total_excl', label: 'Line Total (excl VAT)' },
  { value: 'vat_amount', label: 'VAT Amount' },
  { value: 'total_incl', label: 'Line Total (incl VAT)' },
]

type StockCount = { id: string; count_type: string; count_date: string; status: string; notes: string | null }
type StockCountLine = { id: string; stock_count_id: string; stock_item_id: string; expected_qty: number; actual_qty: number; unit_cost: number }
type StockPurchase = { id: string; purchase_date: string; supplier_name: string | null; item_name: string | null; quantity: number; unit: string | null; unit_cost: number; total_cost: number; invoice_number: string | null }
type StockWastage = { id: string; wastage_date: string; item_name: string | null; quantity: number; unit: string | null; unit_cost: number; total_cost: number; reason: string | null }
type StockIssue = { id: string; issue_date: string; item_name: string | null; quantity: number; unit: string | null; issued_to: string | null; notes: string | null }
type StockOrder = { id: string; supplier_name: string; order_date: string; expected_delivery: string | null; status: string; notes: string | null; total_value: number }

const TABS = [
  { key: 'counts', label: '📊 Stock Counts' },
  { key: 'purchases', label: '🛒 Purchases' },
  { key: 'issues', label: '🍳 Issue Stock' },
  { key: 'wastage', label: '🗑️ Wastage' },
  { key: 'orders', label: '📦 Orders' },
  { key: 'items', label: '⚙️ Stock Items' },
  { key: 'suppliers', label: '🚛 Suppliers' },
]

const ISSUE_DESTINATIONS = ['Kitchen', 'Fryer Station', 'Prep', 'Front Counter', 'Bar', 'Catering Order', 'Other']
function getCategoryIcon(name: string): string {
  const n = (name || '').toLowerCase()
  if (n.includes('cheese') || n.includes('dairy')) return '\u{1F9C0}'
  if (n.includes('chip') || n.includes('fries') || n.includes('potato')) return '\u{1F35F}'
  if (n.includes('veg') || n.includes('salad') || n.includes('lettuce')) return '\u{1F96C}'
  if (n.includes('fruit')) return '\u{1F34E}'
  if (n.includes('chicken') || n.includes('meat') || n.includes('beef') || n.includes('pork')) return '\u{1F357}'
  if (n.includes('fish') || n.includes('seafood') || n.includes('prawn')) return '\u{1F41F}'
  if (n.includes('bread') || n.includes('bun') || n.includes('bakery')) return '\u{1F35E}'
  if (n.includes('sauce') || n.includes('condiment') || n.includes('dressing')) return '\u{1F96B}'
  if (n.includes('spice') || n.includes('season')) return '\u{1F336}\u{FE0F}'
  if (n.includes('drink') || n.includes('beverage') || n.includes('soda') || n.includes('cola')) return '\u{1F964}'
  if (n.includes('frozen')) return '\u{1F9CA}'
  if (n.includes('oil') || n.includes('fat')) return '\u{1FAD7}'
  if (n.includes('clean')) return '\u{1F9FD}'
  if (n.includes('packag') || n.includes('disposable') || n.includes('box')) return '\u{1F4E6}'
  if (n.includes('dry') || n.includes('grocery') || n.includes('grain') || n.includes('rice') || n.includes('flour')) return '\u{1F33E}'
  return '\u{1F4E6}'
}

const COUNT_TYPES = [
  { key: 'daily', label: 'Daily', desc: 'Quick daily check — buy for the day', color: '#16a34a', bg: '#dcfce7' },
  { key: 'weekly', label: 'Weekly', desc: 'Weekly stocktake — calculate food cost', color: '#2563eb', bg: '#dbeafe' },
  { key: 'monthly', label: 'Monthly', desc: 'Full month stocktake — monthly food cost', color: '#7c3aed', bg: '#ede9fe' },
]

const UNITS = ['each', 'kg', 'g', 'L', 'ml', 'pack', 'box', 'bag', 'bottle', 'tin', 'tray', 'dozen']
const WASTAGE_REASONS = ['Expired', 'Damaged', 'Over-cooked', 'Dropped', 'Spillage', 'Wrong order', 'Other']

const INPUT: React.CSSProperties = { width: '100%', border: '1.5px solid #e5e7eb', borderRadius: '10px', padding: '10px 12px', fontSize: '14px', outline: 'none', boxSizing: 'border-box', background: '#fff', fontFamily: 'system-ui' }
const LABEL: React.CSSProperties = { display: 'block', fontSize: '12px', fontWeight: 700, color: '#374151', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }

function formatCurrency(v: number) { return `R ${v.toFixed(2)}` }
function formatDate(d: string) { return new Date(d).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }) }

function Modal({ show, onClose, title, children, maxWidth = '480px' }: { show: boolean; onClose: () => void; title: string; children: React.ReactNode; maxWidth?: string }) {
  if (!show) return null
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '16px' }}>
      <div style={{ background: 'white', borderRadius: '24px', width: '100%', maxWidth, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 24px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ padding: '24px 28px 16px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#111', margin: 0 }}>{title}</h2>
          <button onClick={onClose} style={{ background: '#f3f4f6', border: 'none', borderRadius: '8px', width: '32px', height: '32px', cursor: 'pointer', fontSize: '16px' }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

export default function StockPage() {
  const router = useRouter()
  const [tab, setTab] = useState('counts')
  const [categories, setCategories] = useState<StockCategory[]>([])
  const [items, setItems] = useState<StockItem[]>([])
  const [counts, setCounts] = useState<StockCount[]>([])
  const [purchases, setPurchases] = useState<StockPurchase[]>([])
  const [wastage, setWastage] = useState<StockWastage[]>([])
  const [issues, setIssues] = useState<StockIssue[]>([])
  const [orders, setOrders] = useState<StockOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [suppliers, setSuppliers] = useState<StockSupplier[]>([])
  const [showSupplierForm, setShowSupplierForm] = useState(false)
  const [editSupplier, setEditSupplier] = useState<StockSupplier | null>(null)
  const [supplierForm, setSupplierForm] = useState({ name: '', contact_name: '', phone: '', email: '', order_day: '', notes: '', payment_terms_days: '7', delivers_stock: true })
  const [invoiceColumns, setInvoiceColumns] = useState<InvoiceColumn[]>([])
  const [invoiceVatIncluded, setInvoiceVatIncluded] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activeCount, setActiveCount] = useState<StockCount | null>(null)
  const [countLines, setCountLines] = useState<StockCountLine[]>([])
  const [countTypeFilter, setCountTypeFilter] = useState('daily')
  const [supplierFilter, setSupplierFilter] = useState('All')
  const [parentItemSearch, setParentItemSearch] = useState('')
  const [itemSearch, setItemSearch] = useState('')
  const [showAIImport, setShowAIImport] = useState(false)
  const [aiText, setAIText] = useState('')
  const [aiLoading, setAILoading] = useState(false)
  const [aiResults, setAIResults] = useState<{ name: string; qty: number; unit: string }[]>([])
  const [showAddItem, setShowAddItem] = useState(false)
  const [showInlineCat, setShowInlineCat] = useState(false)
  const [adjustItem, setAdjustItem] = useState<StockItem | null>(null)
  const [adjustQty, setAdjustQty] = useState('')
  const [adjustMode, setAdjustMode] = useState<'set' | 'add' | 'subtract'>('set')
  const [adjustReason, setAdjustReason] = useState('')
  const [adjustNotes, setAdjustNotes] = useState('')
  const [adjusting, setAdjusting] = useState(false)
  const [adjustHistory, setAdjustHistory] = useState<StockAdjustment[]>([])
  const [newCatName, setNewCatName] = useState('')
  const [savingCat, setSavingCat] = useState(false)
  const [showAddPurchase, setShowAddPurchase] = useState(false)
  const [showAddWastage, setShowAddWastage] = useState(false)
  const [showAddOrder, setShowAddOrder] = useState(false)
  const [showAddCategory, setShowAddCategory] = useState(false)
  const [editItem, setEditItem] = useState<StockItem | null>(null)
  const [itemForm, setItemForm] = useState({ name: '', description: '', category_id: 'goods', unit: 'each', cost_price: '', par_level: '', supplier: 'Other', on_daily_sheet: false, is_catch_weight: false, kg_price: '', avg_weight_kg: '', is_prepped_item: false, parent_item_id: '', portion_size: '' })
  const [purchaseForm, setPurchaseForm] = useState({ purchase_date: new Date().toISOString().split('T')[0], supplier_name: '', stock_item_id: '', item_name: '', quantity: '', unit: 'each', unit_cost: '', invoice_number: '' })
  const [wastageForm, setWastageForm] = useState({ wastage_date: new Date().toISOString().split('T')[0], stock_item_id: '', item_name: '', quantity: '', unit: 'each', unit_cost: '', reason: 'Expired' })
  const [issueForm, setIssueForm] = useState<{ stock_item_id: string; item_name: string; quantity: string; unit: string; issued_to: string; notes: string; preppedBreakdown: Record<string, string> }>({ stock_item_id: '', item_name: '', quantity: '', unit: 'each', issued_to: 'Kitchen', notes: '', preppedBreakdown: {} })
  const [issueCategory, setIssueCategory] = useState<string | null>(null)
  const [issueSearch, setIssueSearch] = useState('')
  const [orderForm, setOrderForm] = useState({ supplier_name: '', order_date: new Date().toISOString().split('T')[0], expected_delivery: '', notes: '' })
  const [categoryForm, setCategoryForm] = useState({ name: '', color: '#1a5c38' })

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    try {
    const [catRes, itemRes, countRes, purchRes, wastRes, ordRes, suppRes, issueRes] = await Promise.all([
      supabase.from('stock_categories').select('*').eq('store_id', STORE_ID).order('sort_order'),
      supabase.from('stock_items').select('*').eq('store_id', STORE_ID).eq('is_active', true).order('sort_order', { nullsFirst: false }),
      supabase.from('stock_counts').select('*').eq('store_id', STORE_ID).order('count_date', { ascending: false }).limit(30),
      supabase.from('stock_purchases').select('*').eq('store_id', STORE_ID).order('purchase_date', { ascending: false }).limit(50),
      supabase.from('stock_wastage').select('*').eq('store_id', STORE_ID).order('wastage_date', { ascending: false }).limit(50),
      supabase.from('stock_orders').select('*').eq('store_id', STORE_ID).order('order_date', { ascending: false }).limit(30),
      supabase.from('stock_suppliers').select('*').eq('store_id', STORE_ID).eq('is_active', true).order('sort_order'),
      supabase.from('stock_issues').select('*').eq('store_id', STORE_ID).order('issue_date', { ascending: false }).limit(50),
    ])
    setCategories(catRes.data || [])
    setItems(itemRes.data || [])
    setCounts(countRes.data || [])
    setPurchases(purchRes.data || [])
    setWastage(wastRes.data || [])
    setIssues(issueRes.data || [])
    if (suppRes?.error) console.error('suppliers error:', suppRes.error.message)
    setOrders(ordRes.data || [])
    setSuppliers(suppRes?.data || [])
    } catch(e) { console.error('loadAll error:', e) }
    setLoading(false)
  }

  async function saveSupplier() {
    if (!supplierForm.name) return
    setSaving(true)
    const payload = {
      store_id: STORE_ID, ...supplierForm,
      payment_terms_days: parseInt(supplierForm.payment_terms_days) || 7,
      is_active: true, sort_order: suppliers.length + 1,
      invoice_columns: invoiceColumns.length > 0 ? invoiceColumns : null,
      invoice_vat_included: invoiceVatIncluded,
      delivers_stock: supplierForm.delivers_stock,
    }
    if (editSupplier) {
      await supabase.from('stock_suppliers').update(payload).eq('id', editSupplier.id)
    } else {
      await supabase.from('stock_suppliers').insert(payload)
    }
    setShowSupplierForm(false); setEditSupplier(null)
    setSupplierForm({ name: '', contact_name: '', phone: '', email: '', order_day: '', notes: '', payment_terms_days: '7', delivers_stock: true }); setInvoiceColumns([]); setInvoiceVatIncluded(true)
    setSaving(false); await loadAll()
  }

  async function deleteSupplier(id: string) {
    if (!confirm('Delete this supplier? Items linked to them will lose their supplier assignment.')) return
    await supabase.from('stock_suppliers').update({ is_active: false }).eq('id', id)
    await loadAll()
  }

  async function startCount(type: string) {
    setSaving(true)
    try {
      const today = new Date().toISOString().split('T')[0]
      // Check for existing in-progress session
      const { data: existing } = await supabase
        .from('stock_counts')
        .select('*')
        .eq('store_id', STORE_ID)
        .eq('count_type', type)
        .eq('count_date', today)
        .eq('status', 'in_progress')
        .maybeSingle()
      if (existing) {
        const { data: existingLines } = await supabase
          .from('stock_count_lines')
          .select('*, stock_items(description, unit)')
          .eq('stock_count_id', existing.id)
        setActiveCount(existing)
        setCountLines(existingLines || [])
        setSaving(false)
        return
      }
      // Create new session header
      const { data: session, error: sessionErr } = await supabase
        .from('stock_counts')
        .insert({ store_id: STORE_ID, count_date: today, count_type: type, status: 'in_progress' })
        .select().single()
      if (sessionErr) { alert('Could not start count: ' + sessionErr.message); setSaving(false); return }
      // Filter items based on count type
      const countItems = type === 'daily' ? items.filter(i => i.on_daily_sheet) : items
      if (countItems.length === 0) {
        const msg = type === 'daily' ? 'No daily sheet items set up. Go to Stock Items tab and toggle Daily Sheet on items you buy locally every day.' : 'No stock items found. Add items in the Stock Items tab first.'
        alert(msg)
        await supabase.from('stock_counts').delete().eq('id', session.id)
        setSaving(false)
        return
      }
      const lines = countItems.map(i => ({
        stock_count_id: session.id,
        stock_item_id: i.id,
        expected_qty: 0,
        actual_qty: 0,
        unit_cost: Number(i.cost_price) || Number(i.price) || 0
      }))
      const { error: linesErr } = await supabase.from('stock_count_lines').insert(lines)
      if (linesErr) { alert('Could not create count lines: ' + linesErr.message); setSaving(false); return }
      const { data: freshLines } = await supabase
        .from('stock_count_lines')
        .select('*, stock_items(description, unit)')
        .eq('stock_count_id', session.id)
      setActiveCount(session)
      setCountLines(freshLines || [])
    } catch (e: unknown) {
      alert('Error: ' + (e instanceof Error ? e.message : String(e)))
    }
    setSaving(false)
  }
  async function updateCountLine(lineId: string, qty: number) {
    setCountLines(prev => prev.map(l => l.id === lineId ? { ...l, actual_qty: qty } : l))
    await supabase.from('stock_count_lines').update({ actual_qty: qty }).eq('id', lineId)
  }

  async function completeCount() {
    if (!activeCount) return
    await supabase.from('stock_counts').update({ status: 'completed' }).eq('id', activeCount.id)
    // Physical count is the source of truth — reconcile running stock balances to what was actually counted.
    await Promise.all(
      countLines
        .filter(l => l.stock_item_id)
        .map(l => supabase.from('stock_items').update({ current_qty: Number(l.actual_qty) || 0 }).eq('id', l.stock_item_id))
    )
    setActiveCount(null); setCountLines([]); await loadAll()
  }

  async function savePurchase() {
    setSaving(true)
    const total = parseFloat(purchaseForm.quantity || '0') * parseFloat(purchaseForm.unit_cost || '0')
    await supabase.from('stock_purchases').insert({ store_id: STORE_ID, purchase_date: purchaseForm.purchase_date, supplier_name: purchaseForm.supplier_name || null, stock_item_id: purchaseForm.stock_item_id || null, item_name: purchaseForm.item_name || items.find(i => i.id === purchaseForm.stock_item_id)?.description || null, quantity: parseFloat(purchaseForm.quantity || '0'), unit: purchaseForm.unit, unit_cost: parseFloat(purchaseForm.unit_cost || '0'), total_cost: total, invoice_number: purchaseForm.invoice_number || null })
    setPurchaseForm({ purchase_date: new Date().toISOString().split('T')[0], supplier_name: '', stock_item_id: '', item_name: '', quantity: '', unit: 'each', unit_cost: '', invoice_number: '' })
    setShowAddPurchase(false); await loadAll(); setSaving(false)
  }

  async function saveWastage() {
    setSaving(true)
    const total = parseFloat(wastageForm.quantity || '0') * parseFloat(wastageForm.unit_cost || '0')
    await supabase.from('stock_wastage').insert({ store_id: STORE_ID, wastage_date: wastageForm.wastage_date, stock_item_id: wastageForm.stock_item_id || null, item_name: wastageForm.item_name || items.find(i => i.id === wastageForm.stock_item_id)?.description || null, quantity: parseFloat(wastageForm.quantity || '0'), unit: wastageForm.unit, unit_cost: parseFloat(wastageForm.unit_cost || '0'), total_cost: total, reason: wastageForm.reason })
    if (wastageForm.stock_item_id && parseFloat(wastageForm.quantity || '0') > 0) {
      await supabase.rpc('increment_stock_qty', { item_id: wastageForm.stock_item_id, amount: -parseFloat(wastageForm.quantity) })
    }
    setWastageForm({ wastage_date: new Date().toISOString().split('T')[0], stock_item_id: '', item_name: '', quantity: '', unit: 'each', unit_cost: '', reason: 'Expired' })
    setShowAddWastage(false); await loadAll(); setSaving(false)
  }

  async function saveIssue() {
    if (!issueForm.stock_item_id || !(parseFloat(issueForm.quantity || '0') > 0)) { alert('Select an item and quantity'); return }
    setSaving(true)
    const allocations = Object.entries(issueForm.preppedBreakdown)
      .map(([childId, val]) => ({ childId, portions: parseFloat(val || '0') }))
      .filter(a => a.portions > 0)
    const breakdown = allocations.map(a => {
      const child = items.find(i => i.id === a.childId)
      return { item_id: a.childId, name: child?.description || child?.name || '', portions: a.portions }
    })
    await supabase.from('stock_issues').insert({
      store_id: STORE_ID, issue_date: new Date().toISOString(), stock_item_id: issueForm.stock_item_id || null,
      item_name: issueForm.item_name || items.find(i => i.id === issueForm.stock_item_id)?.description || null,
      quantity: parseFloat(issueForm.quantity || '0'), unit: issueForm.unit, issued_to: issueForm.issued_to, notes: issueForm.notes || null,
      prepped_breakdown: breakdown.length ? breakdown : null
    })
    await supabase.rpc('increment_stock_qty', { item_id: issueForm.stock_item_id, amount: -parseFloat(issueForm.quantity) })
    for (const a of allocations) {
      await supabase.rpc('increment_stock_qty', { item_id: a.childId, amount: a.portions })
    }
    setIssueForm({ stock_item_id: '', item_name: '', quantity: '', unit: 'each', issued_to: 'Kitchen', notes: '', preppedBreakdown: {} })
    setIssueCategory(null); setIssueSearch('')
    await loadAll(); setSaving(false)
  }

  function generateOrderText(supplierName: string, orderDate: string, deliveryDate: string, notes: string) {
    const orderItems = items
      .filter(i => (i.supplier || 'Other') === supplierName && !i.parent_item_id)
      .filter(i => parseFloat((orderForm as {[key:string]:string})[`qty_${i.id}`] || '0') > 0)
      .map(i => {
        const qty = (orderForm as {[key:string]:string})[`qty_${i.id}`] || '0'
        return `  • ${i.description || i.name}: ${qty} ${i.unit}`
      })
    if (orderItems.length === 0) return ''
    return [
      `ORDER — ${supplierName}`,
      `Date: ${orderDate}${deliveryDate ? `\nDeliver by: ${deliveryDate}` : ''}`,
      `Store: Mochachos Hartswater`,
      ``,
      `ITEMS:`,
      ...orderItems,
      notes ? `\nNotes: ${notes}` : '',
    ].filter(Boolean).join('\n')
  }

  function printOrder() {
    const text = generateOrderText(orderForm.supplier_name, orderForm.order_date, orderForm.expected_delivery, orderForm.notes)
    if (!text) { alert('Add quantities to at least one item first'); return }
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(`
      <html><head><title>Order — ${orderForm.supplier_name}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 40px; max-width: 600px; margin: 0 auto; }
        h1 { color: #1a5c38; font-size: 22px; margin-bottom: 4px; }
        .meta { color: #6b7280; font-size: 14px; margin-bottom: 24px; }
        table { width: 100%; border-collapse: collapse; margin-top: 16px; }
        th { background: #1a5c38; color: white; padding: 10px 12px; text-align: left; font-size: 13px; }
        td { padding: 9px 12px; border-bottom: 1px solid #e5e7eb; font-size: 14px; }
        tr:nth-child(even) td { background: #f9fafb; }
        .notes { margin-top: 24px; padding: 12px; background: #fef3c7; border-radius: 8px; font-size: 13px; }
        .footer { margin-top: 32px; font-size: 12px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 12px; }
        @media print { button { display: none; } }
      </style></head>
      <body>
        <button onclick="window.print()" style="background:#1a5c38;color:white;border:none;padding:10px 20px;border-radius:8px;cursor:pointer;font-size:14px;margin-bottom:20px;">🖨️ Print</button>
        <h1>Purchase Order — ${orderForm.supplier_name}</h1>
        <div class="meta">
          Order Date: ${orderForm.order_date} &nbsp;|&nbsp;
          ${orderForm.expected_delivery ? `Deliver By: ${orderForm.expected_delivery} &nbsp;|&nbsp;` : ''}
          Store: Mochachos Hartswater
        </div>
        <table>
          <tr><th>Item</th><th>Unit</th><th>Qty Ordered</th></tr>
          ${items
            .filter(i => (i.supplier || 'Other') === orderForm.supplier_name && !i.parent_item_id)
            .filter(i => parseFloat((orderForm as {[key:string]:string})[`qty_${i.id}`] || '0') > 0)
            .map(i => `<tr><td>${i.description || i.name}</td><td>${i.unit}</td><td><strong>${(orderForm as {[key:string]:string})[`qty_${i.id}`]}</strong></td></tr>`)
            .join('')}
        </table>
        ${orderForm.notes ? `<div class="notes">📝 Notes: ${orderForm.notes}</div>` : ''}
        <div class="footer">Generated by CompliTrack • ${new Date().toLocaleString('en-ZA')}</div>
      </body></html>
    `)
    win.document.close()
  }

  function shareOrderWhatsApp() {
    const text = generateOrderText(orderForm.supplier_name, orderForm.order_date, orderForm.expected_delivery, orderForm.notes)
    if (!text) { alert('Add quantities to at least one item first'); return }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank')
  }

  function copyOrder() {
    const text = generateOrderText(orderForm.supplier_name, orderForm.order_date, orderForm.expected_delivery, orderForm.notes)
    if (!text) { alert('Add quantities to at least one item first'); return }
    navigator.clipboard.writeText(text).then(() => alert('Order copied to clipboard!'))
  }

  async function saveOrder() {
    if (!orderForm.supplier_name) return
    setSaving(true)
    await supabase.from('stock_orders').insert({ store_id: STORE_ID, supplier_name: orderForm.supplier_name, order_date: orderForm.order_date, expected_delivery: orderForm.expected_delivery || null, notes: orderForm.notes || null, status: 'pending', total_value: 0 })
    setOrderForm({ supplier_name: '', order_date: new Date().toISOString().split('T')[0], expected_delivery: '', notes: '' })
    setShowAddOrder(false); await loadAll(); setSaving(false)
  }

  async function updateOrderStatus(id: string, status: string) {
    await supabase.from('stock_orders').update({ status }).eq('id', id); await loadAll()
  }

  async function saveAdjustment() {
    if (!adjustItem || !adjustQty || !adjustReason) { alert('Please fill in quantity and reason'); return }
    setAdjusting(true)
    const qtyBefore = Number(adjustItem.current_qty || 0)
    const entered = parseFloat(adjustQty) || 0
    const qtyAfter = adjustMode === 'set' ? entered : adjustMode === 'add' ? qtyBefore + entered : Math.max(0, qtyBefore - entered)
    const adjustment = qtyAfter - qtyBefore
    await supabase.from('stock_items').update({ current_qty: qtyAfter }).eq('id', adjustItem.id)
    await supabase.from('stock_adjustments').insert({ store_id: STORE_ID, stock_item_id: adjustItem.id, item_name: adjustItem.description || adjustItem.name, qty_before: qtyBefore, qty_after: qtyAfter, adjustment, unit: adjustItem.unit, reason: adjustReason, notes: adjustNotes })
    setAdjustItem(null); setAdjustQty(''); setAdjustReason(''); setAdjustNotes(''); setAdjusting(false)
    await loadAll()
  }

  async function loadAdjustHistory(itemId: string) {
    const { data } = await supabase.from('stock_adjustments').select('*').eq('stock_item_id', itemId).order('created_at', { ascending: false }).limit(10)
    setAdjustHistory((data || []) as StockAdjustment[])
  }

  async function saveItem() {
    if (!itemForm.name.trim() && !itemForm.description.trim()) { alert('Item name is required'); return }
    setSaving(true)
    const parentItem = itemForm.is_prepped_item ? items.find(i => i.id === itemForm.parent_item_id) : undefined
    const calcPrice = itemForm.is_catch_weight
      ? parseFloat(itemForm.kg_price || '0') * parseFloat(itemForm.avg_weight_kg || '0')
      : itemForm.is_prepped_item && parentItem
      ? (Number(parentItem.cost_price) || Number(parentItem.price) || 0) * parseFloat(itemForm.portion_size || '0')
      : parseFloat(itemForm.cost_price || '0')
    const payload = {
      store_id: STORE_ID,
      name: itemForm.name.trim() || itemForm.description.trim(),
      description: itemForm.name.trim() || itemForm.description.trim(),
      category: itemForm.category_id,
      unit: itemForm.unit,
      price: calcPrice,
      cost_price: calcPrice,
      par_level: parseFloat(itemForm.par_level || '0'),
      is_active: true,
      supplier: itemForm.is_prepped_item ? 'Instore' : (itemForm.supplier || 'Other'),
      on_daily_sheet: itemForm.on_daily_sheet,
      is_catch_weight: itemForm.is_catch_weight,
      kg_price: parseFloat(itemForm.kg_price || '0'),
      avg_weight_kg: parseFloat(itemForm.avg_weight_kg || '0'),
      parent_item_id: itemForm.is_prepped_item ? (itemForm.parent_item_id || null) : null,
      portion_size: itemForm.is_prepped_item ? parseFloat(itemForm.portion_size || '0') : null
    }
    let error = null
    if (editItem) { const res = await supabase.from('stock_items').update(payload).eq('id', editItem.id); error = res.error }
    else { const res = await supabase.from('stock_items').insert(payload); error = res.error }
    if (error) { alert('Error saving item: ' + error.message); setSaving(false); return }
    setItemForm({ name: '', description: '', category_id: categories[0]?.id || '', unit: 'each', cost_price: '', par_level: '', supplier: 'Other', on_daily_sheet: false, is_catch_weight: false, kg_price: '', avg_weight_kg: '', is_prepped_item: false, parent_item_id: '', portion_size: '' })
    setShowAddItem(false); setEditItem(null); setShowInlineCat(false); await loadAll(); setSaving(false)
  }

  async function saveCategory() {
    if (!categoryForm.name) return
    await supabase.from('stock_categories').insert({ store_id: STORE_ID, name: categoryForm.name, color: categoryForm.color, sort_order: categories.length + 1 })
    setCategoryForm({ name: '', color: '#1a5c38' }); setShowAddCategory(false); await loadAll()
  }

  async function saveInlineCategory() {
    if (!newCatName.trim()) return
    setSavingCat(true)
    const { data: newCat } = await supabase.from('stock_categories')
      .insert({ store_id: STORE_ID, name: newCatName.trim(), color: '#1a5c38', sort_order: categories.length + 1 })
      .select().single()
    await loadAll()
    // Auto-select the newly created category in the item form
    if (newCat) setItemForm(f => ({ ...f, category_id: newCat.id }))
    setNewCatName(''); setShowInlineCat(false); setSavingCat(false)
  }

  async function deleteItem(id: string) {
    if (!confirm('Deactivate this item?')) return
    await supabase.from('stock_items').update({ is_active: false }).eq('id', id); await loadAll()
  }

  async function runAIImport() {
    if (!aiText.trim()) return
    setAILoading(true)
    try {
      const resp = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 1000, messages: [{ role: 'user', content: `Extract stock items from this text. Return ONLY a JSON array. Each object: name (string), qty (number), unit (string from: each,kg,g,L,ml,pack,box,bag,bottle,tin,tray,dozen). Text:\n\n${aiText}` }] }) })
      const data = await resp.json()
      const text = data.content?.[0]?.text || '[]'
      setAIResults(JSON.parse(text.replace(/```json|```/g, '').trim()))
    } catch (e) { console.error(e) }
    setAILoading(false)
  }

  async function applyAIResults() {
    if (!activeCount) return
    for (const result of aiResults) {
      const matched = items.find(i => (i.name||i.description||'').toLowerCase().includes(result.name.toLowerCase()) || result.name.toLowerCase().includes((i.name||i.description||'').toLowerCase()))
      if (matched) { const line = countLines.find(l => l.stock_item_id === matched.id); if (line) await updateCountLine(line.id, result.qty) }
    }
    setShowAIImport(false); setAIText(''); setAIResults([])
  }

  const CAT_LABELS: Record<string,string> = { goods: 'Goods', beverages: 'Beverages', packaging: 'Packaging', basting: 'Basting & Sauces', other: 'Other' }
  // Group items by their actual category UUID — matching real categories
  const groupedItems = (categories || []).reduce((acc, cat) => {
    const catItems = (items || []).filter(i => i.category === cat.id)
    if (catItems.length) acc[cat.id] = { key: cat.id, label: cat.name, color: cat.color || '#6b7280', items: catItems }
    return acc
  }, {} as Record<string, { key: string; label: string; color: string; items: StockItem[] }>)
  // Also bucket any items with unmatched categories into 'Other'
  const matchedIds = new Set(Object.values(groupedItems).flatMap(g => g.items.map(i => i.id)))
  const uncategorised = (items || []).filter(i => !matchedIds.has(i.id))
  if (uncategorised.length) groupedItems['other'] = { key: 'other', label: 'Other', color: '#6b7280', items: uncategorised }
  const todayStr = new Date().toISOString().split('T')[0]
  const todayPurchases = (purchases || []).filter(p => p.purchase_date === todayStr)
  const todayWastage = (wastage || []).filter(w => w.wastage_date === todayStr)
  const pendingOrders = (orders || []).filter(o => o.status === 'pending')
  const sc = (s: string) => s === 'delivered' ? { bg: '#dcfce7', color: '#166534' } : s === 'pending' ? { bg: '#fef3c7', color: '#92400e' } : s === 'partial' ? { bg: '#dbeafe', color: '#1e40af' } : { bg: '#fee2e2', color: '#dc2626' }


  return (
    <div style={{ minHeight: '100vh', background: '#f0f4f0', fontFamily: 'system-ui, sans-serif' }}>
      <header style={{ background: 'linear-gradient(135deg, #0a1f12 0%, #1a5c38 100%)', position: 'sticky', top: 0, zIndex: 10, padding: '0 40px' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '72px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>📦</div>
            <div><div style={{ fontWeight: 800, fontSize: '16px', color: 'white' }}>CompliTrack</div><div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.55)' }}>Stock Management</div></div>
          </div>
          <button onClick={() => router.push('/dashboard')} style={{ padding: '8px 16px', border: '1.5px solid rgba(255,255,255,0.4)', borderRadius: '10px', fontSize: '13px', fontWeight: 700, color: 'white', background: 'rgba(255,255,255,0.15)', cursor: 'pointer' }}>← Dashboard</button>
        </div>
      </header>

      <div style={{ background: 'linear-gradient(135deg, #0a1f12 0%, #1a5c38 100%)', padding: '40px 40px 100px' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <h1 style={{ fontSize: '32px', fontWeight: 800, color: 'white', margin: '0 0 6px', letterSpacing: '-0.5px' }}>Stock Management 📦</h1>
          <p style={{ fontSize: '15px', color: 'rgba(255,255,255,0.6)', margin: 0 }}>Daily counts, purchases, wastage, orders and food cost tracking</p>
        </div>
      </div>

      <main style={{ maxWidth: '1200px', margin: '-60px auto 0', padding: '0 40px 60px', position: 'relative', zIndex: 1 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
          {[
            { label: "Today's Purchases", value: formatCurrency(todayPurchases.reduce((s, p) => s + p.total_cost, 0)), color: '#1a5c38' },
            { label: "Today's Wastage", value: formatCurrency(todayWastage.reduce((s, w) => s + w.total_cost, 0)), color: '#dc2626' },
            { label: 'Pending Orders', value: String(pendingOrders.length), color: '#d97706' },
            { label: 'Stock Items', value: String(items.length), color: '#7c3aed' },
          ].map((k, i) => (
            <div key={i} style={{ background: 'white', borderRadius: '20px', border: '1.5px solid #eef2ee', padding: '20px 24px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', textAlign: 'center' }}>
              <div style={{ fontSize: '26px', fontWeight: 800, color: k.color }}>{k.value}</div>
              <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '4px' }}>{k.label}</div>
            </div>
          ))}
        </div>

        <div style={{ background: 'white', borderRadius: '16px', padding: '6px', display: 'inline-flex', gap: '4px', marginBottom: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', flexWrap: 'wrap' }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{ padding: '10px 18px', borderRadius: '10px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', border: 'none', background: tab === t.key ? '#1a5c38' : 'transparent', color: tab === t.key ? '#fff' : '#6b7280' }}>{t.label}</button>
          ))}
        </div>

        {loading ? <div style={{ textAlign: 'center', padding: '60px', color: '#9ca3af' }}>Loading...</div> : (<>

          {/* STOCK COUNTS */}
          {tab === 'counts' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {activeCount ? (
                <div style={{ background: 'white', borderRadius: '20px', border: '1.5px solid #eef2ee', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                  <div style={{ background: COUNT_TYPES.find(c => c.key === activeCount.count_type)?.bg, padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: '18px', color: COUNT_TYPES.find(c => c.key === activeCount.count_type)?.color }}>{COUNT_TYPES.find(c => c.key === activeCount.count_type)?.label} Count — {formatDate(activeCount.count_date)}</div>
                      <div style={{ fontSize: '13px', color: '#6b7280', marginTop: '2px' }}>{countLines.length} items • Enter actual quantities</div>
                    </div>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button onClick={() => setShowAIImport(true)} style={{ padding: '8px 16px', background: '#7c3aed', color: 'white', border: 'none', borderRadius: '10px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>🤖 AI Import</button>
                      <button onClick={completeCount} style={{ padding: '8px 16px', background: '#1a5c38', color: 'white', border: 'none', borderRadius: '10px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>✓ Complete</button>
                      <button onClick={() => { setActiveCount(null); setCountLines([]) }} style={{ padding: '8px 14px', background: '#f3f4f6', color: '#6b7280', border: 'none', borderRadius: '10px', cursor: 'pointer' }}>✕</button>
                    </div>
                  </div>
                  {/* Group by supplier in count screen */}
                  {suppliers.map(s => s.name).map(supplier => {
                    const supplierLines = countLines.filter(l => {
                      const item = items.find(i => i.id === l.stock_item_id)
                      return (item?.supplier || 'Other') === supplier
                    })
                    if (!supplierLines.length) return null
                    return (
                  <div key={supplier}>
                    <div style={{ padding: '10px 24px', background: '#f9fafb', borderTop: '1px solid #e5e7eb', fontWeight: 700, fontSize: '13px', color: '#1a5c38', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#1a5c38' }} />{supplier} ({supplierLines.length} items)
                    </div>
                    {supplierLines.map(line => {
                      const item = items.find(i => i.id === line.stock_item_id)
                      if (!item) return null
                      const variance = (line.actual_qty || 0) - (line.expected_qty || 0)
                      return (
                        <div key={line.id} style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '12px 24px', borderTop: '1px solid #f3f4f6' }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 600, fontSize: '14px', color: '#111' }}>{item.description || item.name}</div>
                            <div style={{ fontSize: '12px', color: '#9ca3af' }}>{item.unit}</div>
                          </div>
                          <div style={{ fontSize: '12px', color: '#9ca3af', minWidth: '80px', textAlign: 'right' }}>Expected: <strong>{line.expected_qty || 0}</strong></div>
                          <input type="number" min="0" step="0.1" value={line.actual_qty || ''} onChange={e => updateCountLine(line.id, parseFloat(e.target.value) || 0)}
                            style={{ width: '90px', padding: '8px 10px', border: '1.5px solid #e5e7eb', borderRadius: '10px', fontSize: '16px', textAlign: 'center', outline: 'none' }} />
                          <div style={{ minWidth: '70px', textAlign: 'right', fontSize: '13px', fontWeight: 700, color: variance < 0 ? '#dc2626' : variance > 0 ? '#16a34a' : '#9ca3af' }}>
                            {variance > 0 ? '+' : ''}{variance.toFixed(1)}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                    )
                  })}
                  {/* OLD groupedItems render replaced */}
                  {false && Object.values(groupedItems).map(({ key, label, color, items: catItems }) => (
                    <div key={key}>
                      <div style={{ padding: '10px 24px', background: '#f9fafb', borderTop: '1px solid #e5e7eb', fontWeight: 700, fontSize: '13px', color: color, display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: color }} />{label}
                      </div>
                      {catItems.map(item => {
                        const line = countLines.find(l => l.stock_item_id === item.id)
                        if (!line) return null
                        const variance = (line.actual_qty || 0) - (line.expected_qty || 0)
                        return (
                          <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '12px 24px', borderTop: '1px solid #f3f4f6' }}>
                            <td style={{ padding: '12px 16px' }}><div style={{ fontWeight: 700, fontSize: '14px', color: '#111' }}>{item.description || item.name}</div>{item.supplier && <span style={{ fontSize: '11px', fontWeight: 600, background: '#eff6ff', color: '#2563eb', padding: '2px 8px', borderRadius: '20px', marginTop: '4px', display: 'inline-block' }}>{item.supplier}</span>}{item.on_daily_sheet && <span style={{ fontSize: '11px', fontWeight: 600, background: '#f0fdf4', color: '#16a34a', padding: '2px 8px', borderRadius: '20px', marginLeft: '4px', display: 'inline-block' }}>📋 Daily</span>}{item.is_catch_weight && <span style={{ fontSize: '11px', fontWeight: 600, background: '#fefce8', color: '#92400e', padding: '2px 8px', borderRadius: '20px', marginLeft: '4px', display: 'inline-block' }}>⚖️ Catch Wt</span>}</td>
                            <div style={{ fontSize: '12px', color: '#9ca3af', minWidth: '80px', textAlign: 'right' }}>Expected: <strong>{line.expected_qty}</strong></div>
                            <input type="number" min="0" step="0.1" value={line.actual_qty || ''} onChange={e => updateCountLine(line.id, parseFloat(e.target.value) || 0)} placeholder="0" style={{ width: '100px', border: '1.5px solid #e5e7eb', borderRadius: '8px', padding: '8px 10px', fontSize: '14px', fontWeight: 700, textAlign: 'center', outline: 'none' }} />
                            <div style={{ minWidth: '70px', textAlign: 'right', fontSize: '13px', fontWeight: 700, color: variance < 0 ? '#dc2626' : variance > 0 ? '#d97706' : '#9ca3af' }}>{variance === 0 ? '—' : `${variance > 0 ? '+' : ''}${variance.toFixed(1)}`}</div>
                          </div>
                        )
                      })}
                    </div>
                  ))}
                </div>
              ) : (<>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                  {COUNT_TYPES.map(ct => (
                    <button key={ct.key} onClick={() => startCount(ct.key)} style={{ background: 'white', borderRadius: '20px', border: `2px solid ${ct.color}30`, padding: '24px', textAlign: 'left', cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                      <div style={{ fontSize: '28px', marginBottom: '10px' }}>{ct.key === 'daily' ? '🌅' : ct.key === 'weekly' ? '📅' : '📊'}</div>
                      <div style={{ fontWeight: 800, fontSize: '16px', color: ct.color }}>{ct.label}</div>
                      <div style={{ fontSize: '13px', color: '#9ca3af', marginTop: '4px' }}>{ct.desc}</div>
                      <div style={{ marginTop: '14px', padding: '8px 14px', background: ct.bg, color: ct.color, borderRadius: '8px', fontSize: '12px', fontWeight: 700, display: 'inline-block' }}>Start Count →</div>
                    </button>
                  ))}
                </div>
                <div style={{ background: 'white', borderRadius: '20px', border: '1.5px solid #eef2ee', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                  <div style={{ padding: '16px 24px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ fontWeight: 800, fontSize: '15px', color: '#111' }}>Count History</div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {COUNT_TYPES.map(ct => <button key={ct.key} onClick={() => setCountTypeFilter(ct.key)} style={{ padding: '5px 12px', borderRadius: '8px', border: 'none', fontSize: '12px', fontWeight: 700, cursor: 'pointer', background: countTypeFilter === ct.key ? ct.color : '#f3f4f6', color: countTypeFilter === ct.key ? 'white' : '#6b7280' }}>{ct.label}</button>)}
                    </div>
                  </div>
                  {counts.filter(c => c.count_type === countTypeFilter).length === 0
                    ? <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>No {countTypeFilter} counts yet</div>
                    : counts.filter(c => c.count_type === countTypeFilter).map(count => (
                      <div key={count.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 24px', borderTop: '1px solid #f3f4f6' }}>
                        <div><div style={{ fontWeight: 700, fontSize: '14px', color: '#111' }}>{formatDate(count.count_date)}</div><div style={{ fontSize: '12px', color: '#9ca3af' }}>{count.count_type}</div></div>
                        <span style={{ fontSize: '11px', fontWeight: 700, padding: '3px 10px', borderRadius: '100px', background: count.status === 'completed' ? '#dcfce7' : '#fef3c7', color: count.status === 'completed' ? '#166534' : '#92400e' }}>{count.status}</span>
                      </div>
                    ))}
                </div>
              </>)}
            </div>
          )}

          {/* PURCHASES */}
          {tab === 'purchases' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div><div style={{ fontSize: '18px', fontWeight: 800, color: '#111' }}>Daily Purchases</div><div style={{ fontSize: '13px', color: '#9ca3af' }}>Log what you bought each day</div></div>
                <button onClick={() => setShowAddPurchase(true)} style={{ padding: '10px 20px', background: '#1a5c38', color: 'white', border: 'none', borderRadius: '10px', fontSize: '13px', fontWeight: 800, cursor: 'pointer' }}>+ Log Purchase</button>
              </div>
              <div style={{ background: 'white', borderRadius: '20px', border: '1.5px solid #eef2ee', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                {purchases.length === 0 ? <div style={{ padding: '48px', textAlign: 'center', color: '#9ca3af' }}>No purchases logged yet</div> : (<>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 90px 100px 110px 90px', padding: '12px 20px', background: '#f9fafb', fontSize: '11px', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    <span>Item</span><span>Date</span><span>Qty</span><span>Unit Cost</span><span>Total</span><span>Invoice</span>
                  </div>
                  {(purchases || []).map(p => (
                    <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '1fr 90px 90px 100px 110px 90px', padding: '14px 20px', borderTop: '1px solid #f3f4f6', alignItems: 'center' }}>
                      <div><div style={{ fontWeight: 700, fontSize: '14px', color: '#111' }}>{p.item_name}</div>{p.supplier_name && <div style={{ fontSize: '12px', color: '#9ca3af' }}>{p.supplier_name}</div>}</div>
                      <div style={{ fontSize: '12px', color: '#6b7280' }}>{formatDate(p.purchase_date)}</div>
                      <div style={{ fontSize: '13px', color: '#374151' }}>{p.quantity} {p.unit}</div>
                      <div style={{ fontSize: '13px', color: '#374151' }}>{formatCurrency(p.unit_cost)}</div>
                      <div style={{ fontSize: '14px', fontWeight: 800, color: '#1a5c38' }}>{formatCurrency(Number(p.total_cost) || 0)}</div>
                      <div style={{ fontSize: '12px', color: '#9ca3af' }}>{p.invoice_number || '—'}</div>
                    </div>
                  ))}
                  <div style={{ padding: '14px 20px', borderTop: '2px solid #e5e7eb', display: 'flex', justifyContent: 'flex-end', gap: '24px' }}>
                    <div style={{ fontSize: '13px', color: '#9ca3af' }}>Today: <strong style={{ color: '#1a5c38' }}>{formatCurrency(todayPurchases.reduce((s, p) => s + p.total_cost, 0))}</strong></div>
                    <div style={{ fontSize: '13px', color: '#9ca3af' }}>All shown: <strong style={{ color: '#111' }}>{formatCurrency(purchases.reduce((s, p) => s + p.total_cost, 0))}</strong></div>
                  </div>
                </>)}
              </div>
            </div>
          )}

          {/* WASTAGE */}
          {tab === 'issues' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div><div style={{ fontSize: '18px', fontWeight: 800, color: '#111' }}>Issue Stock</div><div style={{ fontSize: '13px', color: '#9ca3af' }}>Record stock taken out for use — kitchen, prep, front counter etc.</div></div>
              <div style={{ background: 'white', borderRadius: '20px', border: '1.5px solid #eef2ee', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                {!issueForm.stock_item_id ? (
                  <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <input
                      value={issueSearch}
                      onChange={e => { setIssueSearch(e.target.value); if (e.target.value.trim()) setIssueCategory(null) }}
                      placeholder="Search items..."
                      style={INPUT}
                    />
                    {issueSearch.trim() ? (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px' }}>
                        {items.filter(i => (i.description || i.name || '').toLowerCase().includes(issueSearch.toLowerCase())).map(item => {
                          const cat = categories.find(c => c.id === item.category)
                          return (
                            <button key={item.id} onClick={() => setIssueForm(f => ({ ...f, stock_item_id: item.id, item_name: item.description || item.name || '', unit: item.unit || f.unit, preppedBreakdown: {} }))}
                              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', padding: '16px 10px', border: '1.5px solid #e5e7eb', borderRadius: '14px', background: 'white', cursor: 'pointer', textAlign: 'center' as const }}>
                              <div style={{ fontSize: '30px' }}>{getCategoryIcon(cat?.name || '')}</div>
                              <div style={{ fontSize: '12px', fontWeight: 700, color: '#111827' }}>{item.description || item.name}</div>
                              <div style={{ fontSize: '11px', color: '#6b7280' }}>{Number(item.current_qty || 0)} {item.unit}</div>
                            </button>
                          )
                        })}
                      </div>
                    ) : !issueCategory ? (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px' }}>
                        {categories.map(cat => {
                          const count = items.filter(i => i.category === cat.id).length
                          if (!count) return null
                          return (
                            <button key={cat.id} onClick={() => setIssueCategory(cat.id)}
                              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', padding: '22px 10px', border: '1.5px solid #e5e7eb', borderRadius: '16px', background: '#f9fafb', cursor: 'pointer', textAlign: 'center' as const }}>
                              <div style={{ fontSize: '36px' }}>{getCategoryIcon(cat.name)}</div>
                              <div style={{ fontSize: '14px', fontWeight: 800, color: '#1a5c38' }}>{cat.name}</div>
                              <div style={{ fontSize: '11px', color: '#6b7280' }}>{count} item{count === 1 ? '' : 's'}</div>
                            </button>
                          )
                        })}
                      </div>
                    ) : (
                      <div>
                        <button onClick={() => setIssueCategory(null)} style={{ background: 'none', border: 'none', color: '#1a5c38', fontWeight: 700, fontSize: '13px', cursor: 'pointer', padding: 0, marginBottom: '14px' }}>&larr; Categories</button>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px' }}>
                          {items.filter(i => i.category === issueCategory).map(item => (
                            <button key={item.id} onClick={() => setIssueForm(f => ({ ...f, stock_item_id: item.id, item_name: item.description || item.name || '', unit: item.unit || f.unit, preppedBreakdown: {} }))}
                              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', padding: '16px 10px', border: '1.5px solid #e5e7eb', borderRadius: '14px', background: 'white', cursor: 'pointer', textAlign: 'center' as const }}>
                              <div style={{ fontSize: '30px' }}>{getCategoryIcon(categories.find(c => c.id === issueCategory)?.name || '')}</div>
                              <div style={{ fontSize: '12px', fontWeight: 700, color: '#111827' }}>{item.description || item.name}</div>
                              <div style={{ fontSize: '11px', color: '#6b7280' }}>{Number(item.current_qty || 0)} {item.unit}</div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '14px', maxWidth: '520px' }}>
                      <button onClick={() => setIssueForm(f => ({ ...f, stock_item_id: '', preppedBreakdown: {} }))} style={{ background: 'none', border: 'none', color: '#1a5c38', fontWeight: 700, fontSize: '13px', cursor: 'pointer', padding: 0, alignSelf: 'flex-start' }}>&larr; Change Item</button>
                      {(() => {
                        const sel = items.find(i => i.id === issueForm.stock_item_id)
                        const cat = categories.find(c => c.id === sel?.category)
                        return (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: '#f0fdf4', border: '1.5px solid #bbf7d0', borderRadius: '12px', padding: '12px 16px' }}>
                            <div style={{ fontSize: '28px' }}>{getCategoryIcon(cat?.name || '')}</div>
                            <div>
                              <div style={{ fontWeight: 800, fontSize: '14px', color: '#111827' }}>{issueForm.item_name}</div>
                              <div style={{ fontSize: '12px', color: '#6b7280' }}>On hand: <strong>{Number(sel?.current_qty || 0)} {sel?.unit}</strong></div>
                            </div>
                          </div>
                        )
                      })()}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        <div><label style={LABEL}>Quantity Issued</label><input type="number" step="0.1" value={issueForm.quantity} onChange={e => setIssueForm(f => ({ ...f, quantity: e.target.value }))} placeholder="0" style={INPUT} autoFocus /></div>
                        <div><label style={LABEL}>Unit</label><select value={issueForm.unit} onChange={e => setIssueForm(f => ({ ...f, unit: e.target.value }))} style={INPUT}>{UNITS.map(u => <option key={u}>{u}</option>)}</select></div>
                      </div>
                      {(() => {
                        const children = items.filter(i => i.parent_item_id === issueForm.stock_item_id)
                        if (!children.length) return null
                        const parentUnit = items.find(i => i.id === issueForm.stock_item_id)?.unit || ''
                        const portionedWeight = children.reduce((sum, c) => sum + (parseFloat(issueForm.preppedBreakdown[c.id] || '0') * Number(c.portion_size || 0)), 0)
                        return (
                          <div style={{ background: '#f5f3ff', border: '1.5px solid #ddd6fe', borderRadius: '12px', padding: '14px' }}>
                            <div style={{ fontWeight: 700, fontSize: '13px', color: '#6d28d9', marginBottom: '4px' }}>Prepped Into (optional)</div>
                            <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '10px' }}>How many of each portion did this make? Leave blank for any you didn't prep.</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              {children.map(c => (
                                <div key={c.id} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '10px', alignItems: 'center' }}>
                                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#374151' }}>{c.description || c.name} <span style={{ color: '#9ca3af', fontWeight: 400 }}>({c.portion_size}{parentUnit} each)</span></div>
                                  <input type="number" step="1" min="0" value={issueForm.preppedBreakdown[c.id] || ''} onChange={e => setIssueForm(f => ({ ...f, preppedBreakdown: { ...f.preppedBreakdown, [c.id]: e.target.value } }))} placeholder="0 portions" style={INPUT} />
                                </div>
                              ))}
                            </div>
                            {portionedWeight > 0 && (
                              <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '10px' }}>
                                Portioned: <strong>{portionedWeight.toFixed(2)}{parentUnit}</strong> of {parseFloat(issueForm.quantity || '0').toFixed(2)}{parentUnit} issued
                                {portionedWeight > parseFloat(issueForm.quantity || '0') && <span style={{ color: '#dc2626', fontWeight: 700 }}> — exceeds quantity issued</span>}
                              </div>
                            )}
                          </div>
                        )
                      })()}
                      <div><label style={LABEL}>Issued To</label><select value={issueForm.issued_to} onChange={e => setIssueForm(f => ({ ...f, issued_to: e.target.value }))} style={INPUT}>{ISSUE_DESTINATIONS.map(d => <option key={d}>{d}</option>)}</select></div>
                      <div><label style={LABEL}>Notes</label><input value={issueForm.notes} onChange={e => setIssueForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional" style={INPUT} /></div>
                      <button onClick={saveIssue} disabled={saving} style={{ background: '#1a5c38', color: 'white', border: 'none', borderRadius: '12px', padding: '12px', fontSize: '14px', fontWeight: 800, cursor: 'pointer', marginTop: '4px' }}>Issue Stock</button>
                    </div>
                  </>
                )}
              </div>

              <div>
                <div style={{ fontWeight: 800, fontSize: '15px', color: '#111', marginBottom: '10px' }}>History</div>
                <div style={{ background: 'white', borderRadius: '20px', border: '1.5px solid #eef2ee', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                  {issues.length === 0 ? <div style={{ padding: '48px', textAlign: 'center', color: '#9ca3af' }}>No stock issued yet</div> : (<>
                    {(issues || []).map(iss => (
                      <div key={iss.id} style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '14px 20px', borderTop: '1px solid #f3f4f6' }}>
                        <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', flexShrink: 0 }}>🍳</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 700, fontSize: '14px', color: '#111' }}>{iss.item_name}</div>
                          <div style={{ fontSize: '12px', color: '#9ca3af' }}>{iss.quantity} {iss.unit} → {iss.issued_to} • {formatDate(iss.issue_date)}{iss.notes ? ' • ' + iss.notes : ''}</div>
                        </div>
                      </div>
                    ))}
                  </>)}
                </div>
              </div>
            </div>
          )}

          {tab === 'wastage' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div><div style={{ fontSize: '18px', fontWeight: 800, color: '#111' }}>Wastage Log</div><div style={{ fontSize: '13px', color: '#9ca3af' }}>Track expired, damaged or discarded stock</div></div>
                <button onClick={() => setShowAddWastage(true)} style={{ padding: '10px 20px', background: '#dc2626', color: 'white', border: 'none', borderRadius: '10px', fontSize: '13px', fontWeight: 800, cursor: 'pointer' }}>+ Log Wastage</button>
              </div>
              <div style={{ background: 'white', borderRadius: '20px', border: '1.5px solid #eef2ee', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                {wastage.length === 0 ? <div style={{ padding: '48px', textAlign: 'center', color: '#9ca3af' }}>No wastage logged yet</div> : (<>
                  {(wastage || []).map(w => (
                    <div key={w.id} style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '14px 20px', borderTop: '1px solid #f3f4f6' }}>
                      <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', flexShrink: 0 }}>🗑️</div>
                      <div style={{ flex: 1 }}><div style={{ fontWeight: 700, fontSize: '14px', color: '#111' }}>{w.item_name}</div><div style={{ fontSize: '12px', color: '#9ca3af' }}>{w.quantity} {w.unit} • {w.reason} • {formatDate(w.wastage_date)}</div></div>
                      <div style={{ fontWeight: 800, fontSize: '15px', color: '#dc2626' }}>{formatCurrency(Number(w.total_cost) || 0)}</div>
                    </div>
                  ))}
                  <div style={{ padding: '14px 20px', borderTop: '2px solid #e5e7eb', display: 'flex', justifyContent: 'flex-end', gap: '24px' }}>
                    <div style={{ fontSize: '13px', color: '#9ca3af' }}>Today: <strong style={{ color: '#dc2626' }}>{formatCurrency(todayWastage.reduce((s, w) => s + w.total_cost, 0))}</strong></div>
                    <div style={{ fontSize: '13px', color: '#9ca3af' }}>All shown: <strong style={{ color: '#111' }}>{formatCurrency(wastage.reduce((s, w) => s + w.total_cost, 0))}</strong></div>
                  </div>
                </>)}
              </div>
            </div>
          )}

          {/* ORDERS */}
          {tab === 'orders' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div><div style={{ fontSize: '18px', fontWeight: 800, color: '#111' }}>Supplier Orders</div><div style={{ fontSize: '13px', color: '#9ca3af' }}>Track orders and deliveries</div></div>
                <button onClick={() => setShowAddOrder(true)} style={{ padding: '10px 20px', background: '#1a5c38', color: 'white', border: 'none', borderRadius: '10px', fontSize: '13px', fontWeight: 800, cursor: 'pointer' }}>+ New Order</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {orders.length === 0 ? <div style={{ background: 'white', borderRadius: '20px', border: '1.5px solid #eef2ee', padding: '48px', textAlign: 'center', color: '#9ca3af' }}>No orders yet</div>
                  : orders.map(order => {
                    const s = sc(order.status)
                    return (
                      <div key={order.id} style={{ background: 'white', borderRadius: '16px', border: '1.5px solid #eef2ee', padding: '18px 20px', display: 'flex', alignItems: 'center', gap: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 800, fontSize: '15px', color: '#111' }}>{order.supplier_name}</div>
                          <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '2px' }}>Ordered: {formatDate(order.order_date)}{order.expected_delivery ? ` • Expected: ${formatDate(order.expected_delivery)}` : ''}</div>
                          {order.notes && <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px', fontStyle: 'italic' }}>{order.notes}</div>}
                        </div>
                        <span style={{ fontSize: '11px', fontWeight: 700, padding: '4px 12px', borderRadius: '100px', background: s.bg, color: s.color }}>{order.status}</span>
                        {order.status === 'pending' && (
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button onClick={() => updateOrderStatus(order.id, 'delivered')} style={{ fontSize: '12px', color: '#166534', background: '#dcfce7', border: 'none', borderRadius: '8px', padding: '5px 10px', cursor: 'pointer', fontWeight: 600 }}>✓ Delivered</button>
                            <button onClick={() => updateOrderStatus(order.id, 'partial')} style={{ fontSize: '12px', color: '#1e40af', background: '#dbeafe', border: 'none', borderRadius: '8px', padding: '5px 10px', cursor: 'pointer', fontWeight: 600 }}>Partial</button>
                            <button onClick={() => updateOrderStatus(order.id, 'cancelled')} style={{ fontSize: '12px', color: '#dc2626', background: '#fee2e2', border: 'none', borderRadius: '8px', padding: '5px 8px', cursor: 'pointer', fontWeight: 600 }}>✕</button>
                          </div>
                        )}
                      </div>
                    )
                  })}
              </div>
            </div>
          )}

          {/* STOCK ITEMS */}

          {tab === 'suppliers' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '18px', fontWeight: 800, color: '#111' }}>Suppliers</div>
                  <div style={{ fontSize: '13px', color: '#9ca3af' }}>Manage your suppliers — used across stock items, orders and counts</div>
                </div>
                <button onClick={() => { setEditSupplier(null); setSupplierForm({ name: '', contact_name: '', phone: '', email: '', order_day: '', notes: '', payment_terms_days: '7', delivers_stock: true }); setInvoiceColumns([]); setInvoiceVatIncluded(true); setShowSupplierForm(true) }}
                  style={{ padding: '10px 18px', background: '#1a5c38', color: 'white', border: 'none', borderRadius: '10px', fontSize: '13px', fontWeight: 800, cursor: 'pointer' }}>+ Add Supplier</button>
              </div>
              {suppliers.length === 0 ? (
                <div style={{ background: 'white', borderRadius: '20px', padding: '48px', textAlign: 'center', color: '#9ca3af' }}>
                  <div style={{ fontSize: '40px', marginBottom: '12px' }}>🚛</div>
                  <div style={{ fontWeight: 700, marginBottom: '6px' }}>No suppliers yet</div>
                  <button onClick={() => setShowSupplierForm(true)} style={{ marginTop: '12px', padding: '10px 20px', background: '#1a5c38', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 700, cursor: 'pointer' }}>+ Add First Supplier</button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {suppliers.map(s => (
                    <div key={s.id} style={{ background: 'white', borderRadius: '16px', padding: '16px 20px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', gap: '16px' }}>
                      <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', flexShrink: 0 }}>🚛</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: '15px', color: '#111' }}>{s.name}</div>
                        <div style={{ fontSize: '13px', color: '#6b7280', marginTop: '2px' }}>
                          {s.contact_name && <span style={{ marginRight: '12px' }}>👤 {s.contact_name}</span>}
                          {s.phone && <span style={{ marginRight: '12px' }}>📞 {s.phone}</span>}
                          {s.order_day && <span style={{ marginRight: '12px' }}>📅 Orders: {s.order_day}</span>}
                          {s.email && <span>✉️ {s.email}</span>}
                        </div>
                        {s.notes && <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '4px' }}>{s.notes}</div>}
                      </div>
                      <div style={{ fontSize: '12px', color: '#9ca3af' }}>{items.filter(i => i.supplier === s.name).length} items</div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button onClick={() => { setEditSupplier(s); setSupplierForm({ name: s.name, contact_name: s.contact_name||'', phone: s.phone||'', email: s.email||'', order_day: s.order_day||'', notes: s.notes||'', payment_terms_days: String(s.payment_terms_days ?? 7) }); setInvoiceColumns(s.invoice_columns || []); setInvoiceVatIncluded(s.invoice_vat_included !== false); setSupplierForm(f => ({ ...f, delivers_stock: s.delivers_stock !== false })); setShowSupplierForm(true) }}
                          style={{ background: '#eff6ff', color: '#2563eb', border: 'none', borderRadius: '8px', padding: '6px 12px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}>Edit</button>
                        <button onClick={() => deleteSupplier(s.id)}
                          style={{ background: '#fef2f2', color: '#dc2626', border: 'none', borderRadius: '8px', padding: '6px 12px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}>Remove</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'items' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div><div style={{ fontSize: '18px', fontWeight: 800, color: '#111' }}>Stock Items</div><div style={{ fontSize: '13px', color: '#9ca3af' }}>{itemSearch ? (items.filter(i=>(i.description||i.name||'').toLowerCase().includes(itemSearch.toLowerCase())).length + ' results for ' + itemSearch) : (items.length + ' items')}</div></div>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <div style={{ position: 'relative' }}>
                    <input type="text" placeholder="Search items..." value={itemSearch} onChange={e => setItemSearch(e.target.value)}
                      style={{ padding: '10px 36px 10px 14px', border: '1.5px solid #e5e7eb', borderRadius: '10px', fontSize: '13px', width: '200px', outline: 'none' }} />
                    {itemSearch && <button onClick={() => setItemSearch('')} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: '16px' }}>✕</button>}
                  </div>
                <button onClick={() => { setEditItem(null); setItemForm({ name: '', description: '', category_id: categories[0]?.id || '', unit: 'each', cost_price: '', par_level: '', supplier: 'Other', on_daily_sheet: false, is_catch_weight: false, kg_price: '', avg_weight_kg: '', is_prepped_item: false, parent_item_id: '', portion_size: '' }); setShowAddItem(true) }} style={{ padding: '10px 18px', background: '#1a5c38', color: 'white', border: 'none', borderRadius: '10px', fontSize: '13px', fontWeight: 800, cursor: 'pointer' }}>+ Add Item</button>
                </div>
              </div>
              {/* Supplier filter — excludes non-stock suppliers (e.g. rent/landlord) since
                  they never have stock items to filter by */}
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {['All', ...suppliers.filter(s => s.delivers_stock !== false).map(s => s.name)].map(s => (
                  <button key={s} onClick={() => setSupplierFilter(s)}
                    style={{ padding: '6px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', border: 'none',
                      background: supplierFilter === s ? '#1a5c38' : '#f3f4f6', color: supplierFilter === s ? '#fff' : '#374151' }}>
                    {s} {s !== 'All' ? `(${items.filter(i => (i.supplier || 'Other') === s).length})` : `(${items.length})`}
                  </button>
                ))}
              </div>
              {(() => {
                // Instore / Prepped Items: pulled out of their normal category into their own
                // section, regardless of what category they're filed under, so the main stock
                // sheet only shows bulk/orderable stock. Still fully counted toward stock value.
                const filteredBySupplier = supplierFilter === 'All' ? items : items.filter(i => (i.supplier || 'Other') === supplierFilter)
                const searchFiltered = itemSearch ? (filteredBySupplier || []).filter(i => (i.description || i.name || '').toLowerCase().includes(itemSearch.toLowerCase())) : (filteredBySupplier || [])
                const preppedItems = searchFiltered.filter(i => i.parent_item_id)
                if (!preppedItems.length) return null
                const preppedStockValue = preppedItems.reduce((sum, item) => sum + Number(item.current_qty || 0) * (Number(item.cost_price) || Number(item.price) || 0), 0)
                return (
                  <div style={{ background: 'white', borderRadius: '20px', border: '1.5px solid #e9d5ff', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                    <div style={{ padding: '12px 20px', background: '#faf5ff', display: 'flex', alignItems: 'center', gap: '10px', borderBottom: '1px solid #e9d5ff' }}>
                      <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#7c3aed' }} />
                      <div style={{ fontWeight: 700, fontSize: '14px', color: '#111' }}>🍽️ Instore / Prepped Items</div>
                      <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '100px', background: '#7c3aed20', color: '#7c3aed' }}>{preppedItems.length}</span>
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead><tr style={{ background: '#fafafa' }}>{['Item', 'Unit', 'On Hand', 'Cost Price', 'Par Level', ''].map(h => <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: '11px', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</th>)}</tr></thead>
                      <tbody>
                        {preppedItems.map(item => {
                          const parent = items.find(i => i.id === item.parent_item_id)
                          return (
                            <tr key={item.id} style={{ borderTop: '1px solid #f3f4f6' }}>
                              <td style={{ padding: '12px 16px' }}>
                                <div style={{ fontWeight: 700, fontSize: '14px', color: '#111' }}>{item.description || item.name}</div>
                                <div style={{ display: 'flex', gap: '6px', marginTop: '4px', flexWrap: 'wrap' as const }}>
                                  {parent && <span style={{ fontSize: '11px', fontWeight: 600, background: '#f3e8ff', color: '#7c3aed', padding: '2px 8px', borderRadius: '20px' }}>🔗 from {parent.description || parent.name}</span>}
                                  {item.on_daily_sheet && <span style={{ fontSize: '11px', fontWeight: 600, background: '#f0fdf4', color: '#16a34a', padding: '2px 8px', borderRadius: '20px' }}>📋 Daily</span>}
                                </div>
                              </td>
                              <td style={{ padding: '12px 16px', fontSize: '13px', color: '#6b7280' }}>{item.unit}</td>
                              <td style={{ padding: '12px 16px', fontSize: '13px' }}>
                                <span style={{ fontWeight: 700, color: item.par_level && Number(item.current_qty || 0) < Number(item.par_level) ? '#dc2626' : '#111' }}>
                                  {Number(item.current_qty || 0)} {item.unit}
                                </span>
                              </td>
                              <td style={{ padding: '12px 16px', fontSize: '13px', color: '#374151' }}>{formatCurrency(Number(item.cost_price) || Number(item.price) || 0)}</td>
                              <td style={{ padding: '12px 16px', fontSize: '13px', color: '#374151' }}>{item.par_level ? `${Number(item.par_level)} ${item.unit}` : '—'}</td>
                              <td style={{ padding: '12px 16px' }}>
                                <div style={{ display: 'flex', gap: '6px' }}>
                                  <button onClick={() => {
                                    setEditItem(item)
                                    const catMatch = categories.find(c => c.id === item.category)
                                      || categories.find(c => c.name.toLowerCase() === (item.category || '').toLowerCase())
                                      || categories.find(c => c.name.toLowerCase().includes((item.category || '').toLowerCase().replace(/_/g,' ')))
                                    setItemForm({
                                      name: item.description || item.name || '',
                                      description: item.description || '',
                                      category_id: catMatch?.id || item.category || categories[0]?.id || '',
                                      unit: item.unit || 'each',
                                      cost_price: String(Number(item.price) || 0),
                                      par_level: String(Number(item.par_level) || 0),
                                      supplier: item.supplier || 'Other',
                                      on_daily_sheet: item.on_daily_sheet || false,
                                      is_catch_weight: item.is_catch_weight || false,
                                      kg_price: String(Number(item.kg_price) || ''),
                                      avg_weight_kg: String(Number(item.avg_weight_kg) || ''),
                                      is_prepped_item: !!item.parent_item_id,
                                      parent_item_id: item.parent_item_id || '',
                                      portion_size: item.portion_size != null ? String(item.portion_size) : ''
                                    })
                                    setShowAddItem(true)
                                  }} style={{ fontSize: '12px', color: '#1d4ed8', background: '#eff6ff', border: 'none', borderRadius: '8px', padding: '5px 10px', cursor: 'pointer', fontWeight: 600 }}>Edit</button>
                                  <button onClick={() => { setAdjustItem(item); setAdjustQty(''); setAdjustMode('set'); setAdjustReason(''); setAdjustNotes(''); loadAdjustHistory(item.id) }} style={{ fontSize: '12px', color: '#7c3aed', background: '#ede9fe', border: 'none', borderRadius: '8px', padding: '5px 10px', cursor: 'pointer', fontWeight: 600 }}>Adjust</button>
                                  <button onClick={() => deleteItem(item.id)} style={{ fontSize: '12px', color: '#dc2626', background: '#fee2e2', border: 'none', borderRadius: '8px', padding: '5px 8px', cursor: 'pointer', fontWeight: 700 }}>✕</button>
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                    <div style={{ padding: '12px 20px', background: '#faf5ff', borderTop: '1px solid #e9d5ff', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: '#a78bfa', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Section Stock Value</span>
                      <span style={{ fontSize: '15px', fontWeight: 800, color: '#111' }}>{formatCurrency(preppedStockValue)}</span>
                    </div>
                  </div>
                )
              })()}
              {categories.map(cat => {
                const filteredBySupplier = supplierFilter === 'All' ? items : items.filter(i => (i.supplier || 'Other') === supplierFilter)
                const searchFiltered = itemSearch ? (filteredBySupplier || []).filter(i => (i.description || i.name || '').toLowerCase().includes(itemSearch.toLowerCase())) : (filteredBySupplier || [])
                // Match items by UUID (new items) or by legacy name/slug (old items)
                const catItems = searchFiltered.filter(i =>
                  !i.parent_item_id && (
                  i.category === cat.id ||
                  (i.category && cat.name && i.category.toLowerCase() === cat.name.toLowerCase()) ||
                  (i.category && cat.name && cat.name.toLowerCase().replace(/[^a-z]/g,'').includes((i.category||'').toLowerCase().replace(/[^a-z]/g,'')))
                  )
                )
                if (!catItems.length) return null
                const catColor = cat.color || '#6b7280'
                // Stock value for this section = on-hand qty x cost price, summed across its items.
                const catStockValue = catItems.reduce((sum, item) => sum + Number(item.current_qty || 0) * (Number(item.cost_price) || Number(item.price) || 0), 0)
                return (
                  <div key={cat.id} style={{ background: 'white', borderRadius: '20px', border: '1.5px solid #eef2ee', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                    <div style={{ padding: '12px 20px', background: '#f9fafb', display: 'flex', alignItems: 'center', gap: '10px', borderBottom: '1px solid #e5e7eb' }}>
                      <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: catColor }} />
                      <div style={{ fontWeight: 700, fontSize: '14px', color: '#111' }}>{cat.name}</div>
                      <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '100px', background: catColor + '20', color: catColor }}>{catItems.length}</span>
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead><tr style={{ background: '#fafafa' }}>{['Item', 'Unit', 'On Hand', 'Cost Price', 'Par Level', ''].map(h => <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: '11px', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</th>)}</tr></thead>
                      <tbody>
                        {catItems.map(item => (
                          <tr key={item.id} style={{ borderTop: '1px solid #f3f4f6' }}>
                            <td style={{ padding: '12px 16px' }}>
                              <div style={{ fontWeight: 700, fontSize: '14px', color: '#111' }}>{item.description || item.name}</div>
                              <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                                {item.supplier && <span style={{ fontSize: '11px', fontWeight: 600, background: '#eff6ff', color: '#2563eb', padding: '2px 8px', borderRadius: '20px' }}>{item.supplier}</span>}
                                {item.on_daily_sheet && <span style={{ fontSize: '11px', fontWeight: 600, background: '#f0fdf4', color: '#16a34a', padding: '2px 8px', borderRadius: '20px' }}>📋 Daily</span>}
                              </div>
                            </td>
                            <td style={{ padding: '12px 16px', fontSize: '13px', color: '#6b7280' }}>{item.unit}</td>
                            <td style={{ padding: '12px 16px', fontSize: '13px' }}>
                              <span style={{
                                fontWeight: 700,
                                color: item.par_level && Number(item.current_qty || 0) < Number(item.par_level) ? '#dc2626' : '#111'
                              }}>
                                {Number(item.current_qty || 0)} {item.unit}
                              </span>
                            </td>
                            <td style={{ padding: '12px 16px', fontSize: '13px', color: '#374151' }}>{formatCurrency(Number(item.cost_price) || Number(item.price) || 0)}</td>
                            <td style={{ padding: '12px 16px', fontSize: '13px', color: '#374151' }}>
                              {item.par_level ? `${Number(item.par_level)} ${item.unit}` : '—'}
                            </td>
                            <td style={{ padding: '12px 16px' }}>
                              <div style={{ display: 'flex', gap: '6px' }}>
                                <button onClick={() => {
                                  setEditItem(item)
                                  // item.category may be a UUID (new) or a name/slug (old).
                                  // Try to match to a known category by id first, then by name.
                                  const catMatch = categories.find(c => c.id === item.category)
                                    || categories.find(c => c.name.toLowerCase() === (item.category || '').toLowerCase())
                                    || categories.find(c => c.name.toLowerCase().includes((item.category || '').toLowerCase().replace(/_/g,' ')))
                                  setItemForm({
                                    name: item.description || item.name || '',
                                    description: item.description || '',
                                    category_id: catMatch?.id || item.category || categories[0]?.id || '',
                                    unit: item.unit || 'each',
                                    cost_price: String(Number(item.cost_price) || Number(item.price) || 0),
                                    par_level: String(Number(item.par_level) || 0),
                                    supplier: item.supplier || 'Other',
                                    on_daily_sheet: item.on_daily_sheet || false,
                                    is_catch_weight: item.is_catch_weight || false,
                                    kg_price: String(Number(item.kg_price) || ''),
                                    avg_weight_kg: String(Number(item.avg_weight_kg) || ''),
                                    is_prepped_item: !!item.parent_item_id,
                                    parent_item_id: item.parent_item_id || '',
                                    portion_size: item.portion_size != null ? String(item.portion_size) : ''
                                  })
                                  setShowAddItem(true)
                                }} style={{ fontSize: '12px', color: '#1d4ed8', background: '#eff6ff', border: 'none', borderRadius: '8px', padding: '5px 10px', cursor: 'pointer', fontWeight: 600 }}>Edit</button>
                                <button onClick={() => { setAdjustItem(item); setAdjustQty(''); setAdjustMode('set'); setAdjustReason(''); setAdjustNotes(''); loadAdjustHistory(item.id) }} style={{ fontSize: '12px', color: '#7c3aed', background: '#ede9fe', border: 'none', borderRadius: '8px', padding: '5px 10px', cursor: 'pointer', fontWeight: 600 }}>Adjust</button>
                                <button onClick={() => deleteItem(item.id)} style={{ fontSize: '12px', color: '#dc2626', background: '#fee2e2', border: 'none', borderRadius: '8px', padding: '5px 8px', cursor: 'pointer', fontWeight: 700 }}>✕</button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div style={{ padding: '12px 20px', background: '#f9fafb', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Section Stock Value</span>
                      <span style={{ fontSize: '15px', fontWeight: 800, color: '#111' }}>{formatCurrency(catStockValue)}</span>
                    </div>
                  </div>
                )
              })}
              {items.length === 0 && <div style={{ background: 'white', borderRadius: '20px', border: '1.5px solid #eef2ee', padding: '48px', textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}><div style={{ fontSize: '48px', marginBottom: '12px' }}>📦</div><div style={{ fontSize: '16px', fontWeight: 700, color: '#111', marginBottom: '6px' }}>No stock items yet</div><div style={{ fontSize: '13px', color: '#9ca3af', marginBottom: '20px' }}>Add items to build your stock sheet</div><button onClick={() => setShowAddItem(true)} style={{ padding: '12px 24px', background: '#1a5c38', color: 'white', border: 'none', borderRadius: '12px', fontSize: '14px', fontWeight: 800, cursor: 'pointer' }}>+ Add First Item</button></div>}
            </div>
          )}
        </>)}

        <div style={{ marginTop: '48px', textAlign: 'center' }}><p style={{ fontSize: '12px', color: '#9ca3af' }}>CompliTrack © 2026 • Store Management Platform • South Africa 🇿🇦</p></div>
      </main>

      {/* AI Import Modal */}
      <Modal show={showAIImport} onClose={() => { setShowAIImport(false); setAIResults([]) }} title="🤖 AI Stock Import" maxWidth="560px">
        <div style={{ padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ fontSize: '13px', color: '#9ca3af' }}>Paste your paper stock sheet — AI will extract items and quantities automatically</div>
          <textarea value={aiText} onChange={e => setAIText(e.target.value)} placeholder="e.g. Chicken 5kg, Tomatoes 3kg, Cheese 2 pack..." rows={6} style={{ ...INPUT, resize: 'vertical' }} />
          {aiResults.length > 0 && (
            <div style={{ background: '#f0fdf4', borderRadius: '12px', padding: '14px 16px' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#166534', marginBottom: '10px' }}>✓ Found {aiResults.length} items</div>
              {aiResults.map((r, i) => <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#374151', padding: '4px 0', borderTop: i > 0 ? '1px solid #dcfce7' : 'none' }}><span>{r.name}</span><span style={{ fontWeight: 700 }}>{r.qty} {r.unit}</span></div>)}
            </div>
          )}
        </div>
        <div style={{ padding: '16px 28px 24px', display: 'flex', gap: '12px' }}>
          <button onClick={() => { setShowAIImport(false); setAIResults([]) }} style={{ flex: 1, border: '1.5px solid #e5e7eb', color: '#374151', borderRadius: '12px', padding: '12px', fontSize: '14px', fontWeight: 700, cursor: 'pointer', background: 'white' }}>Cancel</button>
          {aiResults.length === 0
            ? <button onClick={runAIImport} disabled={aiLoading || !aiText.trim()} style={{ flex: 1, background: aiLoading || !aiText.trim() ? '#d1d5db' : '#7c3aed', color: 'white', border: 'none', borderRadius: '12px', padding: '12px', fontSize: '14px', fontWeight: 800, cursor: aiLoading ? 'not-allowed' : 'pointer' }}>{aiLoading ? '🤖 Reading...' : '🤖 Extract Items'}</button>
            : <button onClick={applyAIResults} style={{ flex: 1, background: '#1a5c38', color: 'white', border: 'none', borderRadius: '12px', padding: '12px', fontSize: '14px', fontWeight: 800, cursor: 'pointer' }}>✓ Apply to Count Sheet</button>}
        </div>
      </Modal>

      {/* Add/Edit Item Modal */}
      <Modal show={showAddItem} onClose={() => { setShowAddItem(false); setEditItem(null); setShowInlineCat(false); setNewCatName(''); setParentItemSearch('') }} title={editItem ? 'Edit Item' : 'Add Stock Item'} maxWidth="680px">
        <div style={{ padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div><label style={LABEL}>Item Name *</label><input value={itemForm.name} onChange={e => setItemForm(f => ({ ...f, name: e.target.value, description: e.target.value }))} placeholder="e.g. Chicken Breasts" style={INPUT} /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={LABEL}>Category</label>
              <select value={itemForm.category_id} onChange={e => setItemForm(f => ({ ...f, category_id: e.target.value }))} style={INPUT}>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {!showInlineCat ? (
                <button type="button" onClick={() => setShowInlineCat(true)} style={{ fontSize: '11px', color: '#1a5c38', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', fontWeight: 700 }}>+ New Category</button>
              ) : (
                <div style={{ display: 'flex', gap: 6, marginTop: 6, alignItems: 'center' }}>
                  <input autoFocus value={newCatName} onChange={e => setNewCatName(e.target.value)} onKeyDown={e => e.key === 'Enter' && saveInlineCategory()} placeholder="Category name" style={{ ...INPUT, padding: '6px 10px', fontSize: '13px', flex: 1 }} />
                  <button onClick={saveInlineCategory} disabled={savingCat || !newCatName.trim()} style={{ background: '#1a5c38', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>{savingCat ? '…' : 'Add'}</button>
                  <button onClick={() => { setShowInlineCat(false); setNewCatName('') }} style={{ background: '#f0f0f0', color: '#666', border: 'none', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', fontSize: 13 }}>✕</button>
                </div>
              )}
            </div>
            <div>
              <label style={LABEL}>Supplier</label>
              {itemForm.is_prepped_item ? (
                <div style={{ ...INPUT, background: '#faf5ff', color: '#7c3aed', fontWeight: 700, display: 'flex', alignItems: 'center' }}>🍽️ Instore</div>
              ) : (
                <select value={itemForm.supplier} onChange={e => setItemForm(f => ({ ...f, supplier: e.target.value }))} style={INPUT}>
                  {suppliers.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                </select>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', background: '#f0fdf4', borderRadius: '10px', border: '1.5px solid #bbf7d0' }}>
            <input type="checkbox" id="dailySheet" checked={itemForm.on_daily_sheet} onChange={e => setItemForm(f => ({ ...f, on_daily_sheet: e.target.checked }))} style={{ width: '18px', height: '18px', cursor: 'pointer' }} />
            <label htmlFor="dailySheet" style={{ cursor: 'pointer', fontWeight: 600, fontSize: '14px', color: '#166534' }}>📋 Daily Sheet — include in daily buy list</label>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
            <div><label style={LABEL}>Unit</label><select value={itemForm.unit} onChange={e => setItemForm(f => ({ ...f, unit: e.target.value }))} style={INPUT}>{UNITS.map(u => <option key={u}>{u}</option>)}</select></div>
            <div>
              <label style={LABEL}>Unit Cost (R)</label>
              <input type="number" step="0.01" value={itemForm.cost_price} onChange={e => setItemForm(f => ({ ...f, cost_price: e.target.value }))} placeholder="0.00" style={INPUT} disabled={itemForm.is_catch_weight || itemForm.is_prepped_item} />
              {itemForm.is_catch_weight && <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px' }}>Auto-calculated from kg price × avg weight</div>}
              {itemForm.is_prepped_item && <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px' }}>Auto-calculated from source item price × portion size</div>}
            </div>
            <div><label style={LABEL}>Par Level</label><input type="number" step="0.1" value={itemForm.par_level} onChange={e => setItemForm(f => ({ ...f, par_level: e.target.value }))} placeholder="0" style={INPUT} /></div>
          </div>
          {/* Catch Weight */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', background: '#fefce8', borderRadius: '10px', border: '1.5px solid #fde68a' }}>
            <input type="checkbox" id="catchWeight" checked={itemForm.is_catch_weight} onChange={e => setItemForm(f => ({ ...f, is_catch_weight: e.target.checked, cost_price: e.target.checked ? String((parseFloat(f.kg_price||'0') * parseFloat(f.avg_weight_kg||'0')).toFixed(2)) : f.cost_price }))} style={{ width: '18px', height: '18px', cursor: 'pointer' }} />
            <label htmlFor="catchWeight" style={{ cursor: 'pointer', fontWeight: 600, fontSize: '14px', color: '#92400e' }}>⚖️ Catch Weight — bought by kg, counted by unit</label>
          </div>
          {itemForm.is_catch_weight && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', padding: '14px 16px', background: '#fefce8', borderRadius: '10px', border: '1px solid #fde68a' }}>
              <div>
                <label style={LABEL}>Supplier Kg Price (R)</label>
                <input type="number" step="0.01" placeholder="45.00" value={itemForm.kg_price} onChange={e => { const kg=e.target.value; const avg=itemForm.avg_weight_kg; setItemForm(f => ({ ...f, kg_price: kg, cost_price: kg && avg ? String((parseFloat(kg)*parseFloat(avg)).toFixed(2)) : f.cost_price })) }} style={INPUT} />
              </div>
              <div>
                <label style={LABEL}>Avg Weight (kg)</label>
                <input type="number" step="0.001" placeholder="1.425" value={itemForm.avg_weight_kg} onChange={e => { const avg=e.target.value; const kg=itemForm.kg_price; setItemForm(f => ({ ...f, avg_weight_kg: avg, cost_price: kg && avg ? String((parseFloat(kg)*parseFloat(avg)).toFixed(2)) : f.cost_price })) }} style={INPUT} />
              </div>
              <div>
                <label style={LABEL}>Calculated Unit Cost</label>
                <div style={{ padding: '10px 12px', background: '#fff', border: '1.5px solid #fde68a', borderRadius: '10px', fontWeight: 800, fontSize: '16px', color: '#92400e' }}>
                  R {itemForm.kg_price && itemForm.avg_weight_kg ? (parseFloat(itemForm.kg_price)*parseFloat(itemForm.avg_weight_kg)).toFixed(2) : '0.00'}
                </div>
              </div>
              <div style={{ gridColumn: 'span 3', fontSize: '12px', color: '#92400e', background: '#fef3c7', padding: '8px 12px', borderRadius: '8px' }}>
                💡 Unit cost auto-updates when you change kg price or avg weight. Update quarterly when supplier rates change.
              </div>
            </div>
          )}
          {/* Instore / Prepped Item */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', background: '#faf5ff', borderRadius: '10px', border: '1.5px solid #e9d5ff' }}>
            <input type="checkbox" id="preppedItem" checked={itemForm.is_prepped_item} onChange={e => setItemForm(f => ({ ...f, is_prepped_item: e.target.checked }))} style={{ width: '18px', height: '18px', cursor: 'pointer' }} />
            <label htmlFor="preppedItem" style={{ cursor: 'pointer', fontWeight: 600, fontSize: '14px', color: '#7c3aed' }}>🍽️ Instore / Prepped Item — portioned in-house from another stock item</label>
          </div>
          {itemForm.is_prepped_item && (() => {
            const parentOptions = items.filter(i => !i.parent_item_id && i.id !== editItem?.id)
            const selectedParent = parentOptions.find(i => i.id === itemForm.parent_item_id)
            const parentCost = selectedParent ? (Number(selectedParent.cost_price) || Number(selectedParent.price) || 0) : 0
            const calcCost = parentCost * (parseFloat(itemForm.portion_size || '0') || 0)
            return (
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '12px', padding: '14px 16px', background: '#faf5ff', borderRadius: '10px', border: '1px solid #e9d5ff' }}>
                <div>
                  <label style={LABEL}>Made From</label>
                  <input
                    type="text"
                    placeholder="🔍 Search stock items…"
                    value={parentItemSearch}
                    onChange={e => setParentItemSearch(e.target.value)}
                    style={{ ...INPUT, marginBottom: 6 }}
                  />
                  <select value={itemForm.parent_item_id} onChange={e => setItemForm(f => ({ ...f, parent_item_id: e.target.value }))} style={INPUT} size={parentItemSearch.trim() ? 6 : undefined}>
                    <option value="">— Select source item —</option>
                    {parentOptions
                      .filter(i => i.id === itemForm.parent_item_id || !parentItemSearch.trim() || (i.description || i.name || '').toLowerCase().includes(parentItemSearch.trim().toLowerCase()))
                      .sort((a, b) => (a.description || a.name || '').localeCompare(b.description || b.name || ''))
                      .map(i => <option key={i.id} value={i.id}>{i.description || i.name} ({i.unit})</option>)}
                  </select>
                </div>
                <div>
                  <label style={LABEL}>Portion Size {selectedParent ? `(${selectedParent.unit})` : ''}</label>
                  <input type="number" step="0.001" placeholder="0.03" value={itemForm.portion_size} onChange={e => setItemForm(f => ({ ...f, portion_size: e.target.value }))} style={INPUT} />
                </div>
                <div>
                  <label style={LABEL}>Calculated Unit Cost</label>
                  <div style={{ padding: '10px 12px', background: '#fff', border: '1.5px solid #e9d5ff', borderRadius: '10px', fontWeight: 800, fontSize: '16px', color: '#7c3aed' }}>
                    R {calcCost.toFixed(2)}
                  </div>
                </div>
                <div style={{ gridColumn: 'span 3', fontSize: '12px', color: '#7c3aed', background: '#f3e8ff', padding: '8px 12px', borderRadius: '8px' }}>
                  💡 Cost auto-updates from the source item's price × portion size. This item is excluded from Orders and Purchases (you order/purchase the source item instead) and is grouped under its own "Instore" section on the stock sheet — it still counts fully toward stock value and shows up in stock counts, wastage and issuing.
                </div>
              </div>
            )
          })()}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
          </div>
        </div>
        <div style={{ padding: '16px 28px 24px', display: 'flex', gap: '12px' }}>
          <button onClick={() => { setShowAddItem(false); setEditItem(null); setParentItemSearch('') }} style={{ flex: 1, border: '1.5px solid #e5e7eb', color: '#374151', borderRadius: '12px', padding: '12px', fontSize: '14px', fontWeight: 700, cursor: 'pointer', background: 'white' }}>Cancel</button>
          <button onClick={saveItem} disabled={saving || !itemForm.name} style={{ flex: 1, background: !itemForm.name ? '#d1d5db' : '#1a5c38', color: 'white', border: 'none', borderRadius: '12px', padding: '12px', fontSize: '14px', fontWeight: 800, cursor: 'pointer' }}>{editItem ? 'Save Changes' : 'Add Item'}</button>
        </div>
      </Modal>

      {/* Add Category Modal */}
      <Modal show={showAddCategory} onClose={() => setShowAddCategory(false)} title="Add Category" maxWidth="400px">
        <div style={{ padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div><label style={LABEL}>Category Name *</label><input value={categoryForm.name} onChange={e => setCategoryForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Frozen Items" style={INPUT} /></div>
          <div><label style={LABEL}>Colour</label><input type="color" value={categoryForm.color} onChange={e => setCategoryForm(f => ({ ...f, color: e.target.value }))} style={{ ...INPUT, height: '44px', padding: '4px 8px' }} /></div>
        </div>
        <div style={{ padding: '16px 28px 24px', display: 'flex', gap: '12px' }}>
          <button onClick={() => setShowAddCategory(false)} style={{ flex: 1, border: '1.5px solid #e5e7eb', color: '#374151', borderRadius: '12px', padding: '12px', fontSize: '14px', fontWeight: 700, cursor: 'pointer', background: 'white' }}>Cancel</button>
          <button onClick={saveCategory} disabled={!categoryForm.name} style={{ flex: 1, background: !categoryForm.name ? '#d1d5db' : '#1a5c38', color: 'white', border: 'none', borderRadius: '12px', padding: '12px', fontSize: '14px', fontWeight: 800, cursor: 'pointer' }}>Add Category</button>
        </div>
      </Modal>

      {/* Log Purchase Modal */}
      <Modal show={showAddPurchase} onClose={() => setShowAddPurchase(false)} title="Log Purchase">
        <div style={{ padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div><label style={LABEL}>Date</label><input type="date" value={purchaseForm.purchase_date} onChange={e => setPurchaseForm(f => ({ ...f, purchase_date: e.target.value }))} style={INPUT} /></div>
          <div><label style={LABEL}>Stock Item (optional)</label>
            <select value={purchaseForm.stock_item_id} onChange={e => { const item = items.find(i => i.id === e.target.value); setPurchaseForm(f => ({ ...f, stock_item_id: e.target.value, item_name: (item?.description || item?.name) || f.item_name, unit: item?.unit || f.unit, unit_cost: item ? String(Number(item.cost_price) || Number(item.price) || 0) : f.unit_cost })) }} style={INPUT}>
              <option value="">Select from stock list</option>
              {suppliers.map(sup => { const supItems = items.filter(i => (i.supplier||'Other')===sup.name && !i.parent_item_id); return supItems.length ? <optgroup key={sup.id} label={sup.name}>{supItems.map(i => <option key={i.id} value={i.id}>{i.description||i.name}</option>)}</optgroup> : null })}
            </select></div>
          <div><label style={LABEL}>Item Name *</label><input value={purchaseForm.item_name} onChange={e => setPurchaseForm(f => ({ ...f, item_name: e.target.value }))} placeholder="or type manually" style={INPUT} /></div>
          <div><label style={LABEL}>Supplier</label><select value={purchaseForm.supplier_name} onChange={e => setPurchaseForm(f => ({ ...f, supplier_name: e.target.value }))} style={INPUT}><option value="">— Select Supplier —</option>{suppliers.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}<option value="_other">Other</option></select></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
            <div><label style={LABEL}>Quantity</label><input type="number" step="0.1" value={purchaseForm.quantity} onChange={e => setPurchaseForm(f => ({ ...f, quantity: e.target.value }))} placeholder="0" style={INPUT} /></div>
            <div><label style={LABEL}>Unit</label><select value={purchaseForm.unit} onChange={e => setPurchaseForm(f => ({ ...f, unit: e.target.value }))} style={INPUT}>{UNITS.map(u => <option key={u}>{u}</option>)}</select></div>
            <div><label style={LABEL}>Unit Cost (R)</label><input type="number" step="0.01" value={purchaseForm.unit_cost} onChange={e => setPurchaseForm(f => ({ ...f, unit_cost: e.target.value }))} placeholder="0.00" style={INPUT} /></div>
          </div>
          {purchaseForm.quantity && purchaseForm.unit_cost && <div style={{ background: '#f0fdf4', borderRadius: '10px', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span style={{ fontSize: '13px', color: '#166534' }}>Total</span><span style={{ fontSize: '18px', fontWeight: 800, color: '#166534' }}>{formatCurrency(parseFloat(purchaseForm.quantity) * parseFloat(purchaseForm.unit_cost))}</span></div>}
          <div><label style={LABEL}>Invoice Number</label><input value={purchaseForm.invoice_number} onChange={e => setPurchaseForm(f => ({ ...f, invoice_number: e.target.value }))} style={INPUT} /></div>
        </div>
        <div style={{ padding: '16px 28px 24px', display: 'flex', gap: '12px' }}>
          <button onClick={() => setShowAddPurchase(false)} style={{ flex: 1, border: '1.5px solid #e5e7eb', color: '#374151', borderRadius: '12px', padding: '12px', fontSize: '14px', fontWeight: 700, cursor: 'pointer', background: 'white' }}>Cancel</button>
          <button onClick={savePurchase} disabled={saving} style={{ flex: 1, background: '#1a5c38', color: 'white', border: 'none', borderRadius: '12px', padding: '12px', fontSize: '14px', fontWeight: 800, cursor: 'pointer' }}>Log Purchase</button>
        </div>
      </Modal>

      {/* Log Wastage Modal */}
      <Modal show={showAddWastage} onClose={() => setShowAddWastage(false)} title="Log Wastage">
        <div style={{ padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div><label style={LABEL}>Date</label><input type="date" value={wastageForm.wastage_date} onChange={e => setWastageForm(f => ({ ...f, wastage_date: e.target.value }))} style={INPUT} /></div>
          <div><label style={LABEL}>Stock Item</label><select value={wastageForm.stock_item_id} onChange={e => { const item = items.find(i => i.id === e.target.value); setWastageForm(f => ({ ...f, stock_item_id: e.target.value, item_name: (item?.description||item?.name)||'', unit: item?.unit||f.unit, unit_cost: item ? String(Number(item.cost_price)||Number(item.price)||0) : f.unit_cost })) }} style={INPUT}><option value="">Select stock item</option>{suppliers.map(sup => { const supItems = items.filter(i => (i.supplier||'Other')===sup.name); return supItems.length ? <optgroup key={sup.id} label={sup.name}>{supItems.map(i => <option key={i.id} value={i.id}>{i.description||i.name}</option>)}</optgroup> : null })}</select></div>
          <div><label style={LABEL}>Item Name</label><input value={wastageForm.item_name} onChange={e => setWastageForm(f => ({ ...f, item_name: e.target.value }))} placeholder="or type manually" style={INPUT} /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
            <div><label style={LABEL}>Quantity</label><input type="number" step="0.1" value={wastageForm.quantity} onChange={e => setWastageForm(f => ({ ...f, quantity: e.target.value }))} placeholder="0" style={INPUT} /></div>
            <div><label style={LABEL}>Unit</label><select value={wastageForm.unit} onChange={e => setWastageForm(f => ({ ...f, unit: e.target.value }))} style={INPUT}>{UNITS.map(u => <option key={u}>{u}</option>)}</select></div>
            <div><label style={LABEL}>Unit Cost (R)</label><input type="number" step="0.01" value={wastageForm.unit_cost} onChange={e => setWastageForm(f => ({ ...f, unit_cost: e.target.value }))} placeholder="0.00" style={INPUT} /></div>
          </div>
          <div><label style={LABEL}>Reason</label><select value={wastageForm.reason} onChange={e => setWastageForm(f => ({ ...f, reason: e.target.value }))} style={INPUT}>{WASTAGE_REASONS.map(r => <option key={r}>{r}</option>)}</select></div>
        </div>
        <div style={{ padding: '16px 28px 24px', display: 'flex', gap: '12px' }}>
          <button onClick={() => setShowAddWastage(false)} style={{ flex: 1, border: '1.5px solid #e5e7eb', color: '#374151', borderRadius: '12px', padding: '12px', fontSize: '14px', fontWeight: 700, cursor: 'pointer', background: 'white' }}>Cancel</button>
          <button onClick={saveWastage} disabled={saving} style={{ flex: 1, background: '#dc2626', color: 'white', border: 'none', borderRadius: '12px', padding: '12px', fontSize: '14px', fontWeight: 800, cursor: 'pointer' }}>Log Wastage</button>
        </div>
      </Modal>


      {/* New Order Modal - Purchase Order */}
      <Modal show={showAddOrder} onClose={() => setShowAddOrder(false)} title="New Purchase Order" maxWidth="700px">
        <div style={{ padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
            <div><label style={LABEL}>Supplier *</label>
              <select value={orderForm.supplier_name} onChange={e => setOrderForm(f => ({ ...f, supplier_name: e.target.value }))} style={INPUT}>
                <option value="">— Select Supplier —</option>
                {suppliers.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
              </select>
            </div>
            <div><label style={LABEL}>Order Date</label><input type="date" value={orderForm.order_date} onChange={e => setOrderForm(f => ({ ...f, order_date: e.target.value }))} style={INPUT} /></div>
            <div><label style={LABEL}>Expected Delivery</label><input type="date" value={orderForm.expected_delivery} onChange={e => setOrderForm(f => ({ ...f, expected_delivery: e.target.value }))} style={INPUT} /></div>
          </div>
          {orderForm.supplier_name && (
            <div style={{ background: '#f9fafb', borderRadius: '12px', padding: '16px' }}>
              <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '12px', color: '#1a5c38' }}>
                Order Items — {orderForm.supplier_name}
                <span style={{ fontWeight: 400, fontSize: '12px', color: '#6b7280', marginLeft: '8px' }}>
                  {items.filter(i => (i.supplier || 'Other') === orderForm.supplier_name && !i.parent_item_id).length} items
                </span>
              </div>
              {items.filter(i => (i.supplier || 'Other') === orderForm.supplier_name && !i.parent_item_id).length === 0 ? (
                <p style={{ color: '#6b7280', fontSize: '13px', margin: 0 }}>No items assigned to this supplier. Go to Stock Items tab to assign items to suppliers.</p>
              ) : (
                <div>
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '8px', marginBottom: '8px', fontSize: '11px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' as const }}>
                    <div>Item</div><div>Unit</div><div>Order Qty</div>
                  </div>
                  <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                    {items.filter(i => (i.supplier || 'Other') === orderForm.supplier_name && !i.parent_item_id).map(item => (
                      <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '8px', marginBottom: '8px', alignItems: 'center' }}>
                        <div style={{ fontSize: '13px', fontWeight: 600 }}>{item.description || item.name}</div>
                        <div style={{ fontSize: '12px', color: '#6b7280' }}>{item.unit}</div>
                        <input type="number" min="0" step="0.1" placeholder="0"
                          value={(orderForm as Record<string,string>)[`qty_${item.id}`] || ''}
                          onChange={e => setOrderForm(f => ({ ...f, [`qty_${item.id}`]: e.target.value }))}
                          style={{ padding: '6px 10px', border: `1.5px solid ${parseFloat((orderForm as Record<string,string>)[`qty_${item.id}`] || '0') > 0 ? '#16a34a' : '#e5e7eb'}`, borderRadius: '8px', fontSize: '14px', outline: 'none', background: parseFloat((orderForm as Record<string,string>)[`qty_${item.id}`] || '0') > 0 ? '#f0fdf4' : '#fff' }} />
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: '8px', fontSize: '12px', color: '#6b7280', textAlign: 'right' as const }}>
                    {items.filter(i => (i.supplier||'Other')===orderForm.supplier_name && !i.parent_item_id && parseFloat((orderForm as Record<string,string>)[`qty_${i.id}`]||'0')>0).length} of {items.filter(i => (i.supplier||'Other')===orderForm.supplier_name && !i.parent_item_id).length} items ordered
                  </div>
                </div>
              )}
            </div>
          )}
          <div><label style={LABEL}>Notes</label><textarea value={orderForm.notes} onChange={e => setOrderForm(f => ({ ...f, notes: e.target.value }))} placeholder="Special instructions..." style={{ ...INPUT, height: '60px', resize: 'vertical' as const }} /></div>
        </div>
        <div style={{ padding: '16px 28px 24px', display: 'flex', gap: '12px' }}>
          <button onClick={() => setShowAddOrder(false)} style={{ flex: 1, border: '1.5px solid #e5e7eb', color: '#374151', borderRadius: '12px', padding: '12px', fontSize: '14px', fontWeight: 700, cursor: 'pointer', background: 'white' }}>Cancel</button>
          <button onClick={printOrder} disabled={!orderForm.supplier_name} style={{ flex: 1, background: !orderForm.supplier_name ? '#d1d5db' : '#f0fdf4', color: '#16a34a', border: '1.5px solid #16a34a', borderRadius: '12px', padding: '12px', fontSize: '14px', fontWeight: 700, cursor: 'pointer' }}>🖨️ Print</button>
          <button onClick={shareOrderWhatsApp} disabled={!orderForm.supplier_name} style={{ flex: 1, background: !orderForm.supplier_name ? '#d1d5db' : '#dcfce7', color: '#16a34a', border: '1.5px solid #16a34a', borderRadius: '12px', padding: '12px', fontSize: '14px', fontWeight: 700, cursor: 'pointer' }}>💬 WhatsApp</button>
          <button onClick={saveOrder} disabled={saving || !orderForm.supplier_name} style={{ flex: 1, background: !orderForm.supplier_name ? '#d1d5db' : '#1a5c38', color: 'white', border: 'none', borderRadius: '12px', padding: '12px', fontSize: '14px', fontWeight: 800, cursor: 'pointer' }}>{saving ? 'Saving…' : '✓ Save Order'}</button>
        </div>
      </Modal>
      {/* Supplier Management Modal */}
      <Modal show={showSupplierForm} onClose={() => { setShowSupplierForm(false); setEditSupplier(null) }} title={editSupplier ? 'Edit Supplier' : 'Add Supplier'} maxWidth="500px">
        <div style={{ padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div><label style={LABEL}>Supplier Name *</label><input value={supplierForm.name} onChange={e => setSupplierForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. SAR, Mochachos" style={INPUT} /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div><label style={LABEL}>Contact Name</label><input value={supplierForm.contact_name} onChange={e => setSupplierForm(f => ({ ...f, contact_name: e.target.value }))} placeholder="Rep name" style={INPUT} /></div>
            <div><label style={LABEL}>Phone</label><input value={supplierForm.phone} onChange={e => setSupplierForm(f => ({ ...f, phone: e.target.value }))} placeholder="e.g. 082 000 0000" style={INPUT} /></div>
          </div>
          <div><label style={LABEL}>Email</label><input type="email" value={supplierForm.email} onChange={e => setSupplierForm(f => ({ ...f, email: e.target.value }))} placeholder="orders@supplier.co.za" style={INPUT} /></div>
          <div><label style={LABEL}>Order Day</label>
            <select value={supplierForm.order_day} onChange={e => setSupplierForm(f => ({ ...f, order_day: e.target.value }))} style={INPUT}>
              <option value="">— Select —</option>
              {['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div><label style={LABEL}>Payment Terms (days)</label><input type="number" min="0" step="1" value={supplierForm.payment_terms_days} onChange={e => setSupplierForm(f => ({ ...f, payment_terms_days: e.target.value }))} placeholder="7" style={INPUT} /><div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '4px' }}>Used to auto-calculate the Due Date on invoices from this supplier</div></div>
          <div><label style={LABEL}>Notes</label><input value={supplierForm.notes} onChange={e => setSupplierForm(f => ({ ...f, notes: e.target.value }))} placeholder="e.g. Order by 10am" style={INPUT} /></div>

          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 16px', background: supplierForm.delivers_stock ? '#f0fdf4' : '#f8f9ff', borderRadius: 10, border: `1.5px solid ${supplierForm.delivers_stock ? '#bbf7d0' : '#e0e7ff'}` }}>
            <input type="checkbox" id="delivers_stock" checked={supplierForm.delivers_stock} onChange={e => setSupplierForm(f => ({ ...f, delivers_stock: e.target.checked }))} style={{ marginTop: 3, width: 16, height: 16, cursor: 'pointer', accentColor: '#1a5c38' }} />
            <label htmlFor="delivers_stock" style={{ cursor: 'pointer', flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#111', marginBottom: 3 }}>📦 Delivers stock</div>
              <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.4 }}>
                {supplierForm.delivers_stock
                  ? 'Submitting a bill from this supplier will open the Receive Goods screen to update your stock quantities and prices.'
                  : 'Bills from this supplier will be submitted without a GRV — no stock is received. Use this for rent, software, insurance, bank charges, etc.'}
              </div>
            </label>
          </div>

          <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 16, marginTop: 4 }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#1a5c38', marginBottom: 8 }}>📋 Invoice Column Template</div>
            <div style={{ fontSize: '12px', color: '#9ca3af', marginBottom: 12 }}>Define the columns on this supplier's invoice so the AI knows exactly where to find the excl-VAT price. Add columns left to right as they appear on the invoice.</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <label style={{ fontSize: '13px', fontWeight: 600, color: '#374151' }}>Prices on invoice are:</label>
              <select value={invoiceVatIncluded ? 'incl' : 'excl'} onChange={e => setInvoiceVatIncluded(e.target.value === 'incl')} style={{ ...INPUT, width: 'auto', padding: '6px 10px' }}>
                <option value="incl">Incl & Excl VAT shown (most common)</option>
                <option value="excl">Excl VAT only</option>
              </select>
            </div>
            {invoiceColumns.map((col, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr auto', gap: 6, marginBottom: 6, alignItems: 'center' }}>
                <input
                  value={col.name}
                  onChange={e => setInvoiceColumns(cols => cols.map((c, idx) => idx === i ? { ...c, name: e.target.value } : c))}
                  placeholder={`Column ${i + 1} name`}
                  style={{ ...INPUT, padding: '6px 10px', fontSize: '13px' }}
                />
                <select
                  value={col.maps_to || ''}
                  onChange={e => setInvoiceColumns(cols => cols.map((c, idx) => idx === i ? { ...c, maps_to: e.target.value || null } : c))}
                  style={{ ...INPUT, padding: '6px 10px', fontSize: '12px' }}
                >
                  {MAPS_TO_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <button onClick={() => setInvoiceColumns(cols => cols.filter((_, idx) => idx !== i))} style={{ background: '#fef2f2', color: '#dc2626', border: 'none', borderRadius: 8, width: 30, height: 30, cursor: 'pointer', fontWeight: 700 }}>×</button>
              </div>
            ))}
            <button onClick={() => setInvoiceColumns(cols => [...cols, { name: '', maps_to: null }])} style={{ fontSize: '13px', color: '#1a5c38', background: '#f0f7f4', border: '1px dashed #1a5c38', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontWeight: 600, marginTop: 4 }}>+ Add Column</button>
            {invoiceColumns.length > 0 && invoiceColumns.some(c => c.maps_to === 'unit_price_excl') && (
              <div style={{ fontSize: '12px', color: '#16a34a', marginTop: 8, background: '#f0fdf4', borderRadius: 6, padding: '6px 10px' }}>✓ AI will extract unit price from "{invoiceColumns.find(c => c.maps_to === 'unit_price_excl')?.name}" column</div>
            )}
          </div>
        </div>
        <div style={{ padding: '16px 28px 24px', display: 'flex', gap: '12px' }}>
          <button onClick={() => { setShowSupplierForm(false); setEditSupplier(null) }} style={{ flex: 1, border: '1.5px solid #e5e7eb', color: '#374151', borderRadius: '12px', padding: '12px', fontSize: '14px', fontWeight: 700, cursor: 'pointer', background: 'white' }}>Cancel</button>
          <button onClick={saveSupplier} disabled={saving || !supplierForm.name} style={{ flex: 1, background: !supplierForm.name ? '#d1d5db' : '#1a5c38', color: 'white', border: 'none', borderRadius: '12px', padding: '12px', fontSize: '14px', fontWeight: 800, cursor: 'pointer' }}>{saving ? 'Saving…' : editSupplier ? 'Save Changes' : 'Add Supplier'}</button>
        </div>
      </Modal>
      {adjustItem && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000, padding: 20 }} onClick={() => setAdjustItem(null)}>
          <div style={{ background: '#fff', borderRadius: 20, width: 480, maxWidth: '100%', maxHeight: '80vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #f0f0f0' }}>
              <div style={{ fontSize: 18, fontWeight: 800 }}>⚖️ Adjust Stock</div>
              <div style={{ fontSize: 14, color: '#6b7280', marginTop: 2 }}>{adjustItem.description || adjustItem.name}</div>
              <div style={{ marginTop: 8, display: 'inline-block', background: '#f3f4f6', borderRadius: 8, padding: '6px 12px', fontSize: 14 }}>Current qty: <strong>{Number(adjustItem.current_qty || 0).toFixed(3)} {adjustItem.unit}</strong></div>
            </div>
            <div style={{ padding: '20px 24px' }}>
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 6 }}>Adjustment type</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {(['set','add','subtract'] as const).map(mode => (
                    <button key={mode} onClick={() => setAdjustMode(mode)} style={{ flex: 1, padding: '8px 4px', borderRadius: 8, border: `2px solid ${adjustMode === mode ? '#7c3aed' : '#e5e7eb'}`, background: adjustMode === mode ? '#ede9fe' : '#fff', color: adjustMode === mode ? '#7c3aed' : '#6b7280', fontWeight: 700, fontSize: 11, cursor: 'pointer' }}>
                      {mode === 'set' ? 'Set exact qty' : mode === 'add' ? 'Add to current' : 'Subtract from current'}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 6 }}>{adjustMode === 'set' ? `New quantity (${adjustItem.unit})` : adjustMode === 'add' ? `Quantity to add (${adjustItem.unit})` : `Quantity to remove (${adjustItem.unit})`}</label>
                <input type="number" step="0.001" min="0" autoFocus value={adjustQty} onChange={e => setAdjustQty(e.target.value)} placeholder="0.000" style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid #e5e7eb', fontSize: 16, fontWeight: 700 }} />
                {adjustQty && <div style={{ marginTop: 6, fontSize: 13, color: '#7c3aed', fontWeight: 600 }}>
                  {adjustMode === 'set' && `Will set to ${parseFloat(adjustQty).toFixed(3)} ${adjustItem.unit} (${parseFloat(adjustQty) - Number(adjustItem.current_qty) >= 0 ? '+' : ''}${(parseFloat(adjustQty) - Number(adjustItem.current_qty)).toFixed(3)})`}
                  {adjustMode === 'add' && `New qty: ${(Number(adjustItem.current_qty) + parseFloat(adjustQty)).toFixed(3)} ${adjustItem.unit}`}
                  {adjustMode === 'subtract' && `New qty: ${Math.max(0, Number(adjustItem.current_qty) - parseFloat(adjustQty)).toFixed(3)} ${adjustItem.unit}`}
                </div>}
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 6 }}>Reason *</label>
                <select value={adjustReason} onChange={e => setAdjustReason(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid #e5e7eb', fontSize: 14 }}>
                  <option value="">— Select reason —</option>
                  <option value="Entry Error">Entry Error (GRV or count was wrong)</option>
                  <option value="Count Correction">Physical count correction</option>
                  <option value="Damaged">Damaged / unusable</option>
                  <option value="Expired">Expired / thrown out</option>
                  <option value="Theft">Theft / shrinkage</option>
                  <option value="Internal Use">Internal use / staff meal</option>
                  <option value="Transfer">Transfer to another location</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div style={{ marginBottom: 20 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 6 }}>Notes (optional)</label>
                <input value={adjustNotes} onChange={e => setAdjustNotes(e.target.value)} placeholder="e.g. Pita bread GRV was entered twice" style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid #e5e7eb', fontSize: 13 }} />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setAdjustItem(null)} style={{ flex: 1, padding: '11px', background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: 10, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
                <button onClick={saveAdjustment} disabled={adjusting || !adjustQty || !adjustReason} style={{ flex: 2, padding: '11px', background: (!adjustQty || !adjustReason) ? '#d1d5db' : '#7c3aed', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 800, cursor: 'pointer', fontSize: 14 }}>{adjusting ? 'Saving…' : '✓ Apply Adjustment'}</button>
              </div>
              {adjustHistory.length > 0 && (
                <div style={{ marginTop: 20, borderTop: '1px solid #f0f0f0', paddingTop: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', marginBottom: 8 }}>Recent adjustments</div>
                  {adjustHistory.map(h => (
                    <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f9fafb', fontSize: 12 }}>
                      <div>
                        <span style={{ color: h.adjustment >= 0 ? '#16a34a' : '#dc2626', fontWeight: 700 }}>{h.adjustment >= 0 ? '+' : ''}{Number(h.adjustment).toFixed(3)} {h.unit}</span>
                        <span style={{ color: '#6b7280', marginLeft: 8 }}>{h.reason}</span>
                        {h.notes && <span style={{ color: '#9ca3af', marginLeft: 8 }}>— {h.notes}</span>}
                      </div>
                      <span style={{ color: '#9ca3af' }}>{new Date(h.created_at).toLocaleDateString('en-ZA')}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
