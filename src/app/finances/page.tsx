'use client'
import { useStoreContext } from '@/lib/store-context'
import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const VAT_RATE = 0.15

const TABS = ['Summary', 'Cash-Ups / Sales', 'Supplier Bills', 'Quick Expenses', 'Food Cost', 'History']

const COLOUR_PALETTE = ['#10b981','#ef4444','#3b82f6','#f59e0b','#8b5cf6','#06b6d4','#f97316','#ec4899','#84cc16','#6b7280','#dc2626','#0ea5e9','#a855f7','#22c55e','#1d4ed8']


const PAYMENT_METHODS = ['bank_transfer', 'cash', 'credit_card', 'debit_order', 'eft', 'cheque']
const INVOICE_STATUSES = ['draft', 'received', 'paid']

type CashUp = {
  id: string; cash_up_date: string; cash_up_total: number; total_cash: number
  eft_total: number; payouts: number; variance: number; customer_count: number
  average_spend: number; status: string; notes: string
}
type InvoiceLine = {
  id?: string; category_key: string; description: string
  qty: number; uom: string; unit_price: number
  amount: number; vat_amount: number
  case_size?: number | null; case_uom?: string | null
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
function addDays(dateStr: string, days: number) {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

// Suggest stock items whose name/description relates to the scanned invoice description.
// Handles both directions: "Avocado Pulp" -> "Avo" (item is a prefix/abbreviation of a word)
// and "Avo" -> "Avocado Pulp" (typed text is a prefix of the item word).
function matchStockItems(desc: string, items: {id:string;description:string;unit:string;supplier:string|null}[], limit = 4) {
  const words = desc.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 2)
  if (!words.length) return []
  const scored = items.map(item => {
    const itemWords = item.description.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 1)
    let score = 0
    for (const w of words) {
      for (const iw of itemWords) {
        if (w === iw) score += 3
        else if (w.startsWith(iw) || iw.startsWith(w)) score += 2
        else if (w.includes(iw) || iw.includes(w)) score += 1
      }
    }
    return { item, score }
  }).filter(s => s.score > 0)
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, limit).map(s => s.item)
}

const emptyLine = (firstKey = 'cost_of_sales'): InvoiceLine => ({ category_key: firstKey, description: '', qty: 1, uom: 'each', unit_price: 0, amount: 0, vat_amount: 0 })
const emptyInvoice = () => ({
  supplier: '', invoice_number: '', invoice_date: today(),
  due_date: '', status: 'draft', payment_method: 'bank_transfer', notes: ''
})
const emptyQLine = () => ({ category_key: 'other', description: '', amount: '' })
const emptyQuick = () => ({
  expense_date: today(), supplier: '', invoice_number: '',
  payment_method: 'cash', notes: '',
  lines: [emptyQLine()]
})

export default function FinancesPage() {
  const { storeId: STORE_ID, orgId: ORG_ID, ready: ctxReady } = useStoreContext()
  const router = useRouter()
  const [tab, setTab] = useState(0)
  const [historyInvoices, setHistoryInvoices] = useState<Invoice[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyLoaded, setHistoryLoaded] = useState(false)
  const [historySupplier, setHistorySupplier] = useState('All')
  const [historySearch, setHistorySearch] = useState('')
  const [historyStatus, setHistoryStatus] = useState('All')
  const [month, setMonth] = useState(thisMonth())
  const [fcMode, setFcMode] = useState<'month' | 'week'>('month')
  const [fcWeekStart, setFcWeekStart] = useState(() => {
    const d = new Date(); const day = (d.getDay() + 6) % 7; d.setDate(d.getDate() - day)
    return d.toISOString().split('T')[0]
  })
  const [fcLoading, setFcLoading] = useState(false)
  const [fcLoaded, setFcLoaded] = useState(false)
  const [fcData, setFcData] = useState<{
    openingValue: number; openingDate: string | null; openingMissing: boolean; openingManual: boolean; openingReason: string | null
    closingValue: number; closingDate: string | null; closingMissing: boolean; closingManual: boolean; closingReason: string | null
    purchases: number; wastage: number; sales: number
  } | null>(null)
  const [fcOverrideField, setFcOverrideField] = useState<'opening' | 'closing' | null>(null)
  const [fcOverrideForm, setFcOverrideForm] = useState({ value: '', reason: '' })
  const [fcOverrideCountThisQuarter, setFcOverrideCountThisQuarter] = useState(0)

  const [categories, setCategories] = useState<{id:string;name:string;key:string;colour:string}[]>([])
  const [suppliers, setSuppliers] = useState<{id:string;name:string;payment_terms_days:number|null;invoice_columns:{name:string;maps_to:string|null}[]|null;invoice_vat_included:boolean|null;delivers_stock:boolean}[]>([])
  const [cashUps, setCashUps] = useState<CashUp[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [quickExp, setQuickExp] = useState<QuickExpense[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showGRV, setShowGRV] = useState(false)
  const [grvInvoice, setGrvInvoice] = useState<Invoice | null>(null)
  const [grvItems, setGrvItems] = useState<{id:string;description:string;unit:string;supplier:string|null}[]>([])
  const [grvLines, setGrvLines] = useState<{stock_item_id:string;description:string;unit:string;qty_received:string;unit_cost:string;units_per_case:string;case_qty:string;case_price:string;is_catch_weight:boolean}[]>([])
  const [savingGRV, setSavingGRV] = useState(false)
  const [editingValues, setEditingValues] = useState<Record<string, string>>({})
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState('')
  const [showScanChoice, setShowScanChoice] = useState(false)
  const [scanSupplier, setScanSupplier] = useState('')
  const scanSupplierRef = useRef('') // ref mirrors state — always readable in async closures without stale value issues
  const [deviceScanStatus, setDeviceScanStatus] = useState<'waiting' | 'received' | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState('')
  const [allStockItems, setAllStockItems] = useState<{id:string;description:string;unit:string;supplier:string|null}[]>([])

  // Category manager state
  const [showQuickCat, setShowQuickCat] = useState(false)
  const [quickCatForm, setQuickCatForm] = useState({ name: '', colour: '#10b981' })
  const [showCatManager, setShowCatManager] = useState(false)
  const [editingCat, setEditingCat] = useState<any>(null)
  const [catEditForm, setCatEditForm] = useState({ name: '', colour: '#10b981' })
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
  const defaultCatKey = categories.find(c => /stock|cogs/i.test(c.name))?.key || categories[0]?.key || 'cost_of_sales'
  // Stock/COGS is used daily (deliveries, packaging, cleaning) so it should always lead the dropdown,
  // ahead of monthly items like Rent.
  const sortedCategories = [...categories].sort((a, b) => {
    const aStock = /stock|cogs/i.test(a.name) ? 0 : 1
    const bStock = /stock|cogs/i.test(b.name) ? 0 : 1
    return aStock - bStock
  })

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
    if (!STORE_ID) return
    setLoading(true)
    try {
    const monthStart = `${month}-01`
    const [mYear, mMonth] = month.split('-').map(Number)
    const monthEnd = new Date(mYear, mMonth, 0).toISOString().split('T')[0]
    const [cuRes, invRes, catRes, suppRes, qRes, stockRes] = await Promise.all([
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
      supabase.from('stock_suppliers').select('id, name, payment_terms_days, invoice_columns, invoice_vat_included, delivers_stock').eq('store_id', STORE_ID).eq('is_active', true).order('sort_order'),
      supabase.from('expenses')
        .select('*').eq('store_id', STORE_ID)
        .gte('expense_date', monthStart).lte('expense_date', monthEnd)
        .order('expense_date', { ascending: false }),
      supabase.from('stock_items')
        .select('id, description, unit, supplier')
        .eq('store_id', STORE_ID).eq('is_active', true).order('description'),
    ])
    setCashUps(cuRes.data || [])
    setInvoices(invRes.data || [])
    const cats = catRes.data || []
    setCategories(cats.length ? cats : [])
    setSuppliers(suppRes?.data || [])
    setQuickExp(qRes.data || [])
    setAllStockItems(stockRes?.data || [])
    } catch(e) { console.error('[finances] load error', e) }
    finally { setLoading(false) }
  }, [month, STORE_ID, ORG_ID])

  useEffect(() => { load() }, [load])

  function fcPeriodRange(): [string, string] {
    if (fcMode === 'week') {
      const start = new Date(fcWeekStart + 'T00:00:00')
      const end = new Date(start); end.setDate(end.getDate() + 6)
      return [fcWeekStart, end.toISOString().split('T')[0]]
    }
    const [y, m] = month.split('-').map(Number)
    return [`${month}-01`, new Date(y, m, 0).toISOString().split('T')[0]]
  }

  async function loadFoodCost() {
    setFcLoading(true)
    const [periodStart, periodEnd] = fcPeriodRange()

    // Pull recent completed stock counts so we can find the closest one before/within this period
    const { data: counts } = await supabase.from('stock_counts')
      .select('id, count_date, status').eq('store_id', STORE_ID).eq('status', 'completed')
      .order('count_date', { ascending: false }).limit(100)

    const closing = (counts || []).find(c => c.count_date <= periodEnd) || null
    const opening = (counts || []).find(c => c.count_date < periodStart) || null

    async function countValue(countId: string | undefined) {
      if (!countId) return 0
      const { data: lines } = await supabase.from('stock_count_lines').select('actual_qty, unit_cost').eq('stock_count_id', countId)
      return (lines || []).reduce((s, l) => s + (Number(l.actual_qty) || 0) * (Number(l.unit_cost) || 0), 0)
    }

    // A manual override for this exact period takes precedence over whatever count we'd otherwise use.
    const { data: overrides } = await supabase.from('food_cost_overrides').select('*')
      .eq('store_id', STORE_ID).eq('period_start', periodStart).eq('period_end', periodEnd)
    const openingOverride = (overrides || []).find(o => o.field === 'opening')
    const closingOverride = (overrides || []).find(o => o.field === 'closing')

    const [countedOpeningValue, countedClosingValue] = await Promise.all([countValue(opening?.id), countValue(closing?.id)])
    const openingValue = openingOverride ? Number(openingOverride.value) : countedOpeningValue
    const closingValue = closingOverride ? Number(closingOverride.value) : countedClosingValue
    const openingMissing = !opening && !openingOverride
    const closingMissing = !closing && !closingOverride

    const [purchRes, wasteRes, salesRes, recentOverridesRes] = await Promise.all([
      supabase.from('stock_purchases').select('total_cost').eq('store_id', STORE_ID).gte('purchase_date', periodStart).lte('purchase_date', periodEnd),
      supabase.from('stock_wastage').select('total_cost').eq('store_id', STORE_ID).gte('wastage_date', periodStart).lte('wastage_date', periodEnd),
      supabase.from('cash_ups').select('cash_up_total').eq('store_id', STORE_ID).not('status', 'eq', 'draft').gte('cash_up_date', periodStart).lte('cash_up_date', periodEnd),
      supabase.from('food_cost_overrides').select('id', { count: 'exact', head: true }).eq('store_id', STORE_ID).gte('created_at', new Date(Date.now() - 90 * 86400000).toISOString()),
    ])
    const purchases = (purchRes.data || []).reduce((s, p) => s + (Number(p.total_cost) || 0), 0)
    const wastage = (wasteRes.data || []).reduce((s, w) => s + (Number(w.total_cost) || 0), 0)
    const sales = (salesRes.data || []).reduce((s, c) => s + (Number(c.cash_up_total) || 0), 0)
    setFcOverrideCountThisQuarter(recentOverridesRes.count || 0)

    setFcData({
      openingValue, openingDate: opening?.count_date || null, openingMissing, openingManual: !!openingOverride, openingReason: openingOverride?.reason || null,
      closingValue, closingDate: closing?.count_date || null, closingMissing, closingManual: !!closingOverride, closingReason: closingOverride?.reason || null,
      purchases, wastage, sales,
    })
    setFcLoading(false)
    setFcLoaded(true)
  }

  useEffect(() => { if (tab === 4 && STORE_ID) loadFoodCost() }, [tab, fcMode, fcWeekStart, month, STORE_ID])

  function startDeviceScan() {
    setShowScanChoice(false)
    setDeviceScanStatus('waiting')
    setScanError('')

    // Capture supplier template NOW — scanSupplierRef.current is already set
    // when the user clicks "Scan Invoice" (before choosing device vs file).
    const _supplierName = scanSupplierRef.current || ''
    const _matchedSup = suppliers.find(s => s.name === _supplierName)
    const _deviceTemplate = _matchedSup?.invoice_columns?.length ? {
      name: _matchedSup.name,
      columns: _matchedSup.invoice_columns,
      vatIncluded: _matchedSup.invoice_vat_included !== false,
    } : undefined

    // Mark any old pending scans for this store as done so they don't re-trigger
    supabase.from('pending_invoice_scans')
      .update({ status: 'done' })
      .eq('store_id', STORE_ID)
      .eq('status', 'uploaded')
      .then(() => {})

    // Listen for a new upload from the app via Realtime
    const channel = supabase
      .channel('invoice-scan-relay')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'pending_invoice_scans',
        filter: `store_id=eq.${STORE_ID}`,
      }, async (payload) => {
        const rowId = payload.new?.id
        if (!rowId) return
        setDeviceScanStatus('received')
        supabase.removeChannel(channel)

        // Mark as processing
        await supabase.from('pending_invoice_scans').update({ status: 'processing' }).eq('id', rowId)

        try {
          // Fetch full row — Realtime payload truncates large columns
          const { data: scanRow, error: fetchErr } = await supabase
            .from('pending_invoice_scans')
            .select('image_base64, image_url')
            .eq('id', rowId)
            .single()

          if (fetchErr) throw new Error('Could not retrieve scan row: ' + fetchErr.message)

          let b64 = scanRow?.image_base64 || ''

          if (!b64 && scanRow?.image_url) {
            // Old app version: uploaded to storage (bucket is now public, direct fetch works)
            const imgRes = await fetch(scanRow.image_url)
            if (!imgRes.ok) throw new Error(`Image fetch failed: ${imgRes.status} — try updating the app`)
            const buf = await imgRes.arrayBuffer()
            const uint8 = new Uint8Array(buf)
            const CHUNK = 8190  // must be divisible by 3 to avoid = padding mid-string
            for (let i = 0; i < uint8.length; i += CHUNK) {
              b64 += btoa(String.fromCharCode(...uint8.subarray(i, i + CHUNK)))
            }
            if (!b64) throw new Error('Image encoding failed')
          }

          if (!b64) throw new Error('No image data found in relay row')

          const response = await fetch('/api/scan-invoice', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ base64: b64, mediaType: 'image/jpeg', supplierTemplate: _deviceTemplate })
          })
          const data = await response.json()
          if (!response.ok) throw new Error(data.error || 'Scan failed')

          setShowInvForm(true)
          // Supplier is already set from pre-selection — never override it with AI-detected name.
          // Only fill in fields the user hasn't provided yet.
          if (data.invoice_number) setInvForm(f => ({ ...f, invoice_number: data.invoice_number }))
          if (data.invoice_date) setInvForm(f => ({ ...f, invoice_date: data.invoice_date }))
          if (data.due_date) {
            setInvForm(f => ({ ...f, due_date: data.due_date }))
          } else if (data.invoice_date) {
            // Use pre-selected supplier for due date calc, not AI-detected name
            setInvForm(f => {
              const sup = suppliers.find(s => s.name === f.supplier)
              return { ...f, due_date: sup ? addDays(data.invoice_date, sup.payment_terms_days ?? 7) : f.due_date }
            })
          }
          if (data.notes) setInvForm(f => ({ ...f, notes: data.notes }))
          if (data.lines?.length) {
            setInvLines(data.lines.map((l: {description?: string; qty?: number; uom?: string; unit_price?: number; amount?: number; vat_amount?: number; case_size?: number | null; case_uom?: string | null}) => ({
              category_key: defaultCatKey, description: l.description || '', qty: Number(l.qty) || 1,
              uom: l.uom || 'each', unit_price: Number(l.unit_price) || 0,
              amount: Number(l.amount) || 0, vat_amount: Number(l.vat_amount) || 0,
              case_size: l.case_size ?? null, case_uom: l.case_uom ?? null,
            })))
          }
          setScanError('')
          await supabase.from('pending_invoice_scans').update({ status: 'done' }).eq('id', rowId)
        } catch (err: unknown) {
          setScanError(err instanceof Error ? err.message : 'Device scan failed')
          await supabase.from('pending_invoice_scans').update({ status: 'error' }).eq('id', rowId)
        }
        setDeviceScanStatus(null)
      })
      .subscribe()

    // Auto-cancel after 3 minutes if nothing arrives
    setTimeout(() => {
      supabase.removeChannel(channel)
      setDeviceScanStatus(prev => {
        if (prev === 'waiting') { setScanError('No photo received from device — make sure you\'re logged into the same store on the app.'); return null; }
        return prev
      })
    }, 180000)
  }

  async function saveFoodCostOverride() {
    if (!fcOverrideField || !fcOverrideForm.value) return
    const [periodStart, periodEnd] = fcPeriodRange()
    await supabase.from('food_cost_overrides').upsert({
      store_id: STORE_ID, period_start: periodStart, period_end: periodEnd,
      field: fcOverrideField, value: parseFloat(fcOverrideForm.value) || 0, reason: fcOverrideForm.reason || null,
    }, { onConflict: 'store_id,period_start,period_end,field' })
    setFcOverrideField(null)
    setFcOverrideForm({ value: '', reason: '' })
    await loadFoodCost()
  }

  async function clearFoodCostOverride(field: 'opening' | 'closing') {
    const [periodStart, periodEnd] = fcPeriodRange()
    await supabase.from('food_cost_overrides').delete()
      .eq('store_id', STORE_ID).eq('period_start', periodStart).eq('period_end', periodEnd).eq('field', field)
    await loadFoodCost()
  }


  async function loadHistory() {
    setHistoryLoading(true)
    const { data } = await supabase.from('invoices')
      .select('*, invoice_lines(*)')
      .eq('store_id', STORE_ID)
      .order('invoice_date', { ascending: false })
      .limit(300)
    setHistoryInvoices(data || [])
    setHistoryLoading(false)
    setHistoryLoaded(true)
  }

  useEffect(() => { if (tab === 5 && !historyLoaded && STORE_ID) loadHistory() }, [tab, historyLoaded, STORE_ID])

  const filteredHistory = historyInvoices.filter(inv => {
    if (historySupplier !== 'All' && inv.supplier !== historySupplier) return false
    if (historyStatus !== 'All' && inv.status !== historyStatus) return false
    if (historySearch.trim()) {
      const q = historySearch.trim().toLowerCase()
      const hay = `${inv.supplier} ${inv.invoice_number} ${inv.notes || ''}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })

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
    setEditInv(null); setInvForm(emptyInvoice()); setInvLines([emptyLine(defaultCatKey)]); setShowInvForm(true)
  }
  function openEditInvoice(inv: Invoice) {
    setEditInv(inv)
    setInvForm({ supplier: inv.supplier, invoice_number: inv.invoice_number, invoice_date: inv.invoice_date, due_date: inv.due_date || '', status: inv.status, payment_method: inv.payment_method || 'bank_transfer', notes: inv.notes || '' })
    setInvLines(inv.invoice_lines?.length ? inv.invoice_lines.map(l => ({ id: l.id, category_key: l.category_key, description: l.description || '', qty: Number(l.qty) || 1, uom: l.uom || 'each', unit_price: Number(l.unit_price) || 0, amount: Number(l.amount), vat_amount: Number(l.vat_amount || 0) })) : [emptyLine(defaultCatKey)])
    setShowInvForm(true)
    setTab(2)
  }

  function addLine() { setInvLines(l => [...l, emptyLine(defaultCatKey)]) }
  function removeLine(i: number) { setInvLines(l => l.filter((_, idx) => idx !== i)) }

  // Maps a supplier template maps_to value to the internal InvoiceLine field and input type.
  type ColDef = { header: string; field: keyof InvoiceLine; type: 'text' | 'number' | 'readonly'; placeholder: string; compute?: (line: InvoiceLine) => number }
  const MAPS_TO_FIELD: Record<string, Omit<ColDef, 'header'>> = {
    'description':     { field: 'description', type: 'text',   placeholder: 'Item description' },
    'qty':             { field: 'qty',          type: 'number', placeholder: '1' },
    'uom':             { field: 'uom',          type: 'text',   placeholder: 'kg' },
    'unit_price_excl': { field: 'unit_price',   type: 'number', placeholder: '0.00' },
    'unit_price_incl': { field: 'amount',       type: 'number', placeholder: '0.00' },
    'vat_amount':      { field: 'vat_amount',   type: 'number', placeholder: '0.00' },
    'total_incl':      { field: 'amount',       type: 'number', placeholder: '0.00' },
    'total_excl':      { field: 'unit_price',   type: 'readonly', placeholder: '', compute: (l) => Number(l.qty) * Number(l.unit_price) },
  }
  const DEFAULT_COLS: ColDef[] = [
    { header: 'Description',       field: 'description', type: 'text',   placeholder: 'Item description' },
    { header: 'Qty',               field: 'qty',         type: 'number', placeholder: '1' },
    { header: 'Unit Price (excl)', field: 'unit_price',  type: 'number', placeholder: '0.00' },
    { header: 'Total (incl VAT)',  field: 'amount',      type: 'number', placeholder: '0.00' },
    { header: 'VAT Amount',        field: 'vat_amount',  type: 'number', placeholder: '0.00' },
  ]
  function getInvoiceColumns(): ColDef[] {
    const sup = suppliers.find(s => s.name === invForm.supplier)
    if (!sup?.invoice_columns?.length) return DEFAULT_COLS
    const cols: ColDef[] = []
    const seenMapsTo = new Set<string>()
    for (const c of sup.invoice_columns) {
      if (!c.maps_to || !MAPS_TO_FIELD[c.maps_to]) continue
      // Deduplicate by maps_to value — allows both unit_price_excl and total_excl
      // to appear even though they share the same internal field ('unit_price').
      // Without this, "Exclusive Value" (total_excl) was silently dropped whenever
      // "Unit Price (excl)" (unit_price_excl) appeared earlier in the list.
      if (seenMapsTo.has(c.maps_to)) continue
      seenMapsTo.add(c.maps_to)
      const def = MAPS_TO_FIELD[c.maps_to]
      cols.push({ header: c.name || c.maps_to, ...def })
    }
    return cols.length >= 2 ? cols : DEFAULT_COLS
  }

  function updateLine(i: number, field: keyof InvoiceLine, value: string | number) {
    setInvLines(lines => lines.map((l, idx) => {
      if (idx !== i) return l
      const updated = { ...l, [field]: value }
      // When amount (incl VAT) changes: back-calc VAT
      if (field === 'amount') {
        updated.vat_amount = Math.round(Number(value) / (1 + VAT_RATE) * VAT_RATE * 100) / 100
      }
      // When unit_price or qty changes: forward-calc totals
      if (field === 'unit_price' || field === 'qty') {
        const newPrice = Number(field === 'unit_price' ? value : l.unit_price) || 0
        const newQty   = Number(field === 'qty'        ? value : l.qty)        || 1
        const oldPrice = Number(l.unit_price) || 0
        const oldQty   = Number(l.qty)        || 1
        const oldExcl  = oldPrice * oldQty
        const newExcl  = newPrice * newQty
        const currentVat = Number(l.vat_amount) || 0
        // Only recalculate VAT if it was auto-calculated from the old values (within 2c rounding)
        // If the user manually set VAT (e.g. 0 for a zero-rated item), preserve it
        const expectedOldVat = Math.round(oldExcl * VAT_RATE * 100) / 100
        const vatWasAuto = oldExcl === 0 || Math.abs(currentVat - expectedOldVat) < 0.02
        if (vatWasAuto) {
          updated.vat_amount = Math.round(newExcl * VAT_RATE * 100) / 100
          updated.amount     = Math.round(newExcl * (1 + VAT_RATE) * 100) / 100
        } else {
          // VAT manually set — just update the total using existing VAT
          updated.amount = Math.round((newExcl + currentVat) * 100) / 100
        }
      }
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
      .select('id, description, unit, supplier, is_catch_weight, cost_price, price')
      .eq('store_id', STORE_ID)
      .eq('is_active', true)
      .eq('supplier', inv.supplier)
      .order('description')
    setGrvItems(items || [])
    // Pre-populate lines from stock items, pulling qty/price straight from this invoice's
    // line items wherever the description matches (the match chips on the invoice form
    // already standardize wording to the stock sheet's exact naming).
    const invLinesForMatch = inv.invoice_lines || []
    const BULK_UNITS = ['kg', 'g', 'l', 'liter', 'litre', 'liters', 'litres']
    const norm = (s: string) => s.trim().toLowerCase()

    const buildLine = (i: typeof items[0], match: typeof invLinesForMatch[0] | undefined) => {
      const matchQty = match ? Number(match.qty) || 0 : 0
      const matchAmount = match ? Number(match.amount) || 0 : 0
      const matchUnitCost = match?.unit_price && Number(match.unit_price) > 0
        ? Number(match.unit_price)
        : match && matchQty > 0 ? (matchAmount / matchQty) : 0
      const stockUnitIsBulk = BULK_UNITS.includes((i.unit || '').toLowerCase())
      const caseSize = match?.case_size ? Number(match.case_size) : null
      const caseSizeMatchesUnit = caseSize && match?.case_uom
        && BULK_UNITS.includes((match.case_uom || '').toLowerCase())
      if (match && matchQty > 0 && stockUnitIsBulk && caseSizeMatchesUnit && caseSize) {
        const totalQty = matchQty * caseSize
        const costPerUnit = matchUnitCost > 0 ? matchUnitCost / caseSize : 0
        return {
          stock_item_id: i.id, description: i.description || '', unit: i.unit || 'each',
          qty_received: totalQty.toFixed(3),
          unit_cost: costPerUnit > 0 ? costPerUnit.toFixed(4) : String(Number(i.cost_price || i.price || 0) || ''),
          units_per_case: String(caseSize), case_qty: String(matchQty),
          case_price: matchUnitCost > 0 ? matchUnitCost.toFixed(2) : '',
          is_catch_weight: !!(i as any).is_catch_weight,
        }
      }
      return {
        stock_item_id: i.id, description: i.description || '', unit: i.unit || 'each',
        qty_received: match && matchQty > 0 ? String(matchQty) : '',
        unit_cost: match && matchUnitCost > 0 ? matchUnitCost.toFixed(4) : String(Number(i.cost_price || i.price || 0) || ''),
        units_per_case: '', case_qty: '', case_price: '',
        is_catch_weight: !!(i as any).is_catch_weight,
      }
    }

    // Build GRV in INVOICE LINE ORDER (matching supplier's physical invoice layout)
    // then append any supplier stock items not on this invoice at the bottom
    const matchedStockIds = new Set<string>()
    const invoiceOrderedLines = invLinesForMatch
      .map(invLine => {
        const stockItem = (items || []).find(i => norm(i.description || '') === norm(invLine.description || ''))
        if (!stockItem) return null // invoice line has no stock item set up — skip
        matchedStockIds.add(stockItem.id)
        return buildLine(stockItem, invLine)
      })
      .filter(Boolean) as ReturnType<typeof buildLine>[]

    // Supplier stock items not on this invoice (available to receive at bottom)
    const unmatchedLines = (items || [])
      .filter(i => !matchedStockIds.has(i.id))
      .map(i => buildLine(i, undefined))

    setGrvLines([...invoiceOrderedLines, ...unmatchedLines])
    setShowGRV(true)
  }

  // Breaks a case/box delivery down into the stock-keeping unit (e.g. 1 case of 10kg avo -> 10kg @ R/kg).
  // Only overwrites qty_received/unit_cost when both case_qty and units_per_case are usable.
  function recalcGrvCase(line: {qty_received:string;unit_cost:string;units_per_case:string;case_qty:string;case_price:string}) {
    const perCase = parseFloat(line.units_per_case) || 0
    const cases = parseFloat(line.case_qty) || 0
    const casePrice = parseFloat(line.case_price) || 0
    const updated = { ...line }
    if (perCase > 0 && cases > 0) updated.qty_received = String(Number((cases * perCase).toFixed(3)))
    if (perCase > 0 && casePrice > 0) updated.unit_cost = (casePrice / perCase).toFixed(4)
    return updated
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
    // Add received quantities onto each item's running stock balance
    await Promise.all(linesToSave.map(l =>
      supabase.rpc('increment_stock_qty', { item_id: l.stock_item_id, amount: parseFloat(l.qty_received) })
    ))
    // Update invoice status to received
    await supabase.from('invoices').update({ status: 'received' }).eq('id', grvInvoice.id)
    setShowGRV(false)
    setGrvInvoice(null)
    setSavingGRV(false)
    load()
  }

  async function scanInvoice(file: File, supplierArg?: string) {
    setScanning(true)
    setScanError('')
    try {
      const mediaType = file.type === 'application/pdf' ? 'application/pdf'
        : file.type === 'image/png' ? 'image/png'
        : file.type === 'image/webp' ? 'image/webp'
        : 'image/jpeg'

      let arrayBuffer: ArrayBuffer
      try {
        arrayBuffer = await file.arrayBuffer()
      } catch {
        arrayBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result as ArrayBuffer)
          reader.onerror = () => reject(new Error(
            'Could not read this file from disk. Try selecting it again, or pick a different copy of the file.'
          ))
          reader.readAsArrayBuffer(file)
        })
      }
      const uint8Array = new Uint8Array(arrayBuffer)
      let b64 = ''
      const CHUNK = 8190
      for (let i = 0; i < uint8Array.length; i += CHUNK) {
        b64 += btoa(String.fromCharCode(...uint8Array.subarray(i, i + CHUNK)))
      }

      if (!b64) throw new Error('Could not read file')

      // supplierArg is passed directly from the call site — zero closure/ref ambiguity
      const supplierName = (supplierArg && supplierArg !== '__other__') ? supplierArg : ''
      const matchedSupplier = suppliers.find(s => s.name === supplierName)
      const supplierTemplate = matchedSupplier?.invoice_columns?.length ? {
        name: matchedSupplier.name,
        columns: matchedSupplier.invoice_columns,
        vatIncluded: matchedSupplier.invoice_vat_included !== false,
      } : undefined

      const response = await fetch('/api/scan-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64: b64, mediaType, supplierTemplate })
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Scan failed')

      // Pre-fill the invoice form — supplier is already set from pre-selection (modal onChange),
      // so we NEVER change it here. Only fill fields the user hasn't touched yet.
      setShowInvForm(true)
      setInvForm(f => ({
        ...f,
        // Keep whatever supplier is already set — don't let AI-detected name override pre-selection
        invoice_number: data.invoice_number || f.invoice_number,
        invoice_date: data.invoice_date || f.invoice_date,
        notes: data.notes || f.notes,
      }))
      if (data.due_date) {
        setInvForm(f => ({ ...f, due_date: data.due_date }))
      } else if (data.invoice_date) {
        // Calculate due date from the pre-selected supplier's payment terms
        setInvForm(f => {
          const sup = suppliers.find(s => s.name === f.supplier)
          return sup ? { ...f, due_date: addDays(data.invoice_date, sup.payment_terms_days ?? 7) } : f
        })
      }
      if (data.lines && data.lines.length > 0) {
        setInvLines(data.lines.map((l: {description?: string; qty?: number; uom?: string; unit_price?: number; amount?: number; vat_amount?: number; case_size?: number | null; case_uom?: string | null}) => ({
          category_key: defaultCatKey,
          description: l.description || '',
          qty: Number(l.qty) || 1,
          uom: l.uom || 'each',
          unit_price: Number(l.unit_price) || 0,
          amount: Number(l.amount) || 0,
          vat_amount: Number(l.vat_amount) || 0,
          case_size: l.case_size ?? null,
          case_uom: l.case_uom ?? null,
        })))
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Could not read invoice. Please try again.'
      const friendly = /could not be found|NotFoundError|NotReadableError/i.test(msg)
        ? 'Could not read this file from disk — this can happen if the file was just created/moved or is locked by another app. Wait a moment and try selecting it again.'
        : msg
      setScanError(friendly)
    }
    setScanning(false)
  }


  async function saveInvoice(andReceive: boolean) {
    if (!invForm.supplier) { setError('Supplier is required'); return }
    if (!invForm.invoice_date) { setError('Date is required'); return }
    if (invLines.every(l => !l.amount)) { setError('At least one line item with an amount is required'); return }
    setSaving(true); setError('')
    const payload = {
      store_id: STORE_ID,
      organisation_id: ORG_ID,
      ...invForm,
      status: andReceive ? invForm.status : 'draft',
      due_date: invForm.due_date || null,
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
      qty: Number(l.qty) || 1, uom: l.uom || 'each', unit_price: Number(l.unit_price) || 0,
      amount: Number(l.amount), vat_amount: Number(l.vat_amount || 0),
      case_size: l.case_size ?? null, case_uom: l.case_uom ?? null,
    }))
    if (lines.length) {
      const { error: le } = await supabase.from('invoice_lines').insert(lines)
      if (le) { setError(le.message); setSaving(false); return }
    }
    setSaving(false); setShowInvForm(false); setEditInv(null)
    await load()
    if (!andReceive) return
    // CRITICAL: never re-open GRV for invoices already received or paid
    if (editInv && (editInv.status === 'received' || editInv.status === 'paid')) return
    const savedInvoice: Invoice = {
      id: invoiceId!,
      supplier: invForm.supplier,
      invoice_number: invForm.invoice_number,
      invoice_date: invForm.invoice_date,
      due_date: invForm.due_date,
      status: payload.status,
      payment_method: invForm.payment_method,
      notes: invForm.notes,
      total_amount: lineTotal,
      total_vat: lineVatTotal,
      invoice_lines: lines as unknown as InvoiceLine[],
    }
    // Only open GRV if this supplier delivers stock
    const sup = suppliers.find(s => s.name === invForm.supplier)
    const deliversStock = !sup || sup.delivers_stock !== false
    if (deliversStock) {
      openGRV(savedInvoice)
    } else {
      // Non-stock supplier (rent, Micros, insurance, etc.) — just mark as received, no GRV
      await supabase.from('invoices').update({ status: 'received' }).eq('id', savedInvoice.id)
      setShowInvForm(false); setEditInv(null); await load()
    }
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
    const validLines = (qForm.lines || []).filter((l: any) => l.description?.trim() && parseFloat(l.amount) > 0)
    if (validLines.length === 0) { setError('Add at least one line with description and amount.'); setSaving(false); return }

    if (editQ) {
      // Single-line edit (legacy)
      const cat = categories.find(c => c.key === validLines[0].category_key)
      const res = await supabase.from('expenses').update({
        store_id: STORE_ID, expense_date: qForm.expense_date,
        category_key: validLines[0].category_key, category_name: cat?.name || '',
        description: validLines[0].description, amount: parseFloat(validLines[0].amount) || 0,
        supplier: qForm.supplier, payment_method: qForm.payment_method, notes: qForm.notes,
      }).eq('id', editQ.id)
      if (res.error) { setError(res.error.message); setSaving(false); return }
    } else {
      // Multi-line insert — one row per line
      const rows = validLines.map((l: any) => {
        const cat = categories.find(c => c.key === l.category_key)
        return {
          store_id: STORE_ID, expense_date: qForm.expense_date,
          category_key: l.category_key, category_name: cat?.name || '',
          description: l.description.trim(), amount: parseFloat(l.amount) || 0,
          supplier: qForm.supplier, payment_method: qForm.payment_method, notes: qForm.notes,
        }
      })
      const res = await supabase.from('expenses').insert(rows)
      if (res.error) { setError(res.error.message); setSaving(false); return }
    }
    setSaving(false)
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
                  {showInvForm && (
                    <div style={{ position: 'relative', display: 'inline-block' }}>
                      <button style={{ ...btn('#6366f1'), pointerEvents: scanning ? 'none' : 'auto', opacity: scanning ? 0.7 : 1 }} onClick={() => { if (!scanning) { const s = invForm.supplier || ''; setScanSupplier(s); scanSupplierRef.current = s; setShowScanChoice(true) } }}>
                        {scanning ? '⏳ Scanning...' : deviceScanStatus === 'waiting' ? '📡 Waiting for device...' : deviceScanStatus === 'received' ? '⚡ Processing...' : '📷 Scan Invoice'}
                      </button>
                      <input ref={fileInputRef} type="file" accept="image/*,application/pdf"
                        style={{ display: 'none' }}
                        onChange={e => {
                          const f = e.target.files?.[0]
                          // Pass the supplier directly as a parameter — no ref/closure ambiguity
                          if (f) scanInvoice(f, scanSupplierRef.current)
                        }} />
                    </div>
                  )}
                  <button style={btn()} onClick={openNewInvoice}>+ New Invoice</button>
                </div>
              </div>

              {scanError && (
                <div style={{ background: '#fef2f2', color: '#dc2626', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13, fontWeight: 600, border: '1px solid #fecaca' }}>
                  ⚠️ Scan failed: {scanError}
                </div>
              )}

              {deviceScanStatus === 'waiting' && (
                <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '14px 18px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 24 }}>📱</span>
                  <div>
                    <div style={{ fontWeight: 700, color: '#1d4ed8', fontSize: 14 }}>Waiting for photo from your device</div>
                    <div style={{ fontSize: 12, color: '#3b82f6', marginTop: 2 }}>Open the CompliTrack app → Supplier Bills → Scan Invoice. The photo will appear here automatically.</div>
                  </div>
                  <button onClick={() => setDeviceScanStatus(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#93c5fd', cursor: 'pointer', fontSize: 18 }}>×</button>
                </div>
              )}
              {deviceScanStatus === 'received' && (
                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '14px 18px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 24 }}>⚡</span>
                  <div style={{ fontWeight: 700, color: '#166534', fontSize: 14 }}>Photo received — running AI scan...</div>
                </div>
              )}

              {/* Invoice form */}
              {showInvForm && (
                <div style={{ ...card, border: '2px solid #1a5c38', marginBottom: 24 }}>
                  <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 700 }}>{editInv ? 'Edit' : 'New'} Supplier Invoice</h3>
                  {error && <div style={{ background: '#fef2f2', color: '#dc2626', padding: '8px 12px', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>{error}</div>}

                  {/* Header fields */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
                    <div>
                      <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Supplier *</label>
                      <select onChange={e => {
                        const name = e.target.value === '_other' ? '' : e.target.value
                        const sup = suppliers.find(s => s.name === name)
                        setInvForm(f => ({ ...f, supplier: name, due_date: sup && f.invoice_date ? addDays(f.invoice_date, sup.payment_terms_days ?? 7) : f.due_date }))
                      }} value={suppliers.some(s => s.name === invForm.supplier) ? invForm.supplier : (invForm.supplier ? '_other' : '')} style={inp}>
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
                      <input type="date" value={invForm.invoice_date} onChange={e => {
                        const date = e.target.value
                        const sup = suppliers.find(s => s.name === invForm.supplier)
                        setInvForm(f => ({ ...f, invoice_date: date, due_date: sup && date ? addDays(date, sup.payment_terms_days ?? 7) : f.due_date }))
                      }} style={inp} />
                    </div>
                    <div>
                      <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Due Date {suppliers.find(s => s.name === invForm.supplier) && <span style={{ fontWeight: 400, color: '#9ca3af' }}>(auto)</span>}</label>
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
                    {(() => {
                      const activeCols = getInvoiceColumns()
                      const sup = suppliers.find(s => s.name === invForm.supplier)
                      const hasTemplate = sup?.invoice_columns?.length && activeCols !== DEFAULT_COLS
                      // CSS grid: Category column + one per template col + delete button
                      const gridCols = `1.4fr ${activeCols.map(() => '1fr').join(' ')} auto`

                      return (
                        <>
                          {hasTemplate && (
                            <div style={{ fontSize: 12, color: '#16a34a', background: '#f0fdf4', borderRadius: 6, padding: '6px 12px', marginBottom: 10 }}>
                              ✓ Showing {sup!.name} invoice columns — matches their physical invoice layout
                            </div>
                          )}

                          {/* Column headers */}
                          <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: 8, marginBottom: 8 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Category</div>
                            {activeCols.map(col => (
                              <div key={col.header} style={{ fontSize: 12, fontWeight: 600, color: '#6b7280' }}>{col.header}</div>
                            ))}
                            <div />
                          </div>

                          {/* Line rows */}
                          {invLines.map((line, i) => {
                            const matches = line.description.trim().length > 2 ? matchStockItems(line.description, allStockItems) : []
                            const descCol = activeCols.find(c => c.field === 'description')
                            return (
                              <React.Fragment key={i}>
                                <div style={{ marginBottom: 8 }}>
                                <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: 8, alignItems: 'center' }}>
                                  <div>
                                    <select value={line.category_key} onChange={e => updateLine(i, 'category_key', e.target.value)} style={{ ...inp, padding: '8px 10px' }}>
                                      {sortedCategories.map(c => <option key={c.key} value={c.key}>{c.name}</option>)}
                                    </select>
                                    {i === 0 && <button type="button" onClick={() => setShowQuickCat(true)} style={{ fontSize: '11px', color: '#1a5c38', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0', fontWeight: '600' }}>+ New Category</button>}
                                  </div>
                                  {activeCols.map(col => {
                                    // Read-only computed columns (e.g. Exclusive Value = qty × unit_price)
                                    if (col.type === 'readonly') {
                                      const val = col.compute ? col.compute(line) : 0
                                      return (
                                        <div key={col.header} style={{ ...inp, padding: '8px 10px', background: '#f9fafb', color: '#374151', fontWeight: 700, display: 'flex', alignItems: 'center' }}>
                                          {val > 0 ? val.toFixed(2) : '—'}
                                        </div>
                                      )
                                    }
                                    // UoM column gets a dropdown for consistency
                                    if (col.field === 'uom') return (
                                      <select
                                        key={col.header}
                                        value={line.uom || ''}
                                        onChange={e => updateLine(i, 'uom', e.target.value)}
                                        style={{ ...inp, padding: '8px 10px' }}
                                      >
                                        <option value="">— select —</option>
                                        {['each','kg','g','L','ml','box','case','bag','bottle','can','tray','bunch','carton','pkt','pair','roll','sheet','set'].map(u => <option key={u} value={u}>{u}</option>)}
                                      </select>
                                    )
                                    // Number fields: controlled with separate editing state to allow free typing
                                    if (col.type === 'number') {
                                      const editKey = `${i}-${col.field}`
                                      const isEditing = editKey in editingValues
                                      const displayVal = isEditing
                                        ? editingValues[editKey]
                                        : (Number(line[col.field]) > 0 || Number(line[col.field]) < 0
                                            ? Number(line[col.field]).toFixed(2)
                                            : '')
                                      return (
                                        <input
                                          key={`${col.header}-${i}`}
                                          type="text"
                                          inputMode="decimal"
                                          placeholder={col.placeholder}
                                          value={displayVal}
                                          onChange={e => {
                                            const raw = e.target.value.replace(',', '.')
                                            setEditingValues(ev => ({ ...ev, [editKey]: raw }))
                                          }}
                                          onFocus={e => {
                                            // Enter editing mode with raw value
                                            const raw = Number(line[col.field]) > 0 || Number(line[col.field]) < 0
                                              ? String(line[col.field])
                                              : ''
                                            setEditingValues(ev => ({ ...ev, [editKey]: raw }))
                                            e.target.select()
                                          }}
                                          onBlur={e => {
                                            // Commit value and exit editing mode
                                            const val = parseFloat(e.target.value.replace(',', '.'))
                                            updateLine(i, col.field, isNaN(val) ? 0 : val)
                                            setEditingValues(ev => { const n = { ...ev }; delete n[editKey]; return n })
                                          }}
                                          style={{ ...inp, padding: '8px 10px' }}
                                        />
                                      )
                                    }
                                    // Text fields: controlled as normal
                                    return (
                                      <input
                                        key={col.header}
                                        type="text"
                                        placeholder={col.placeholder}
                                        value={line[col.field] as string || ''}
                                        onChange={e => updateLine(i, col.field, e.target.value)}
                                        style={{ ...inp, padding: '8px 10px' }}
                                      />
                                    )
                                  })}
                                  <button onClick={() => removeLine(i)} disabled={invLines.length === 1}
                                    style={{ background: '#fef2f2', color: '#dc2626', border: 'none', borderRadius: 6, padding: '8px 12px', cursor: 'pointer', fontSize: 16, fontWeight: 700 }}>×</button>
                                </div>
                              </div>
                              {matches.length > 0 && (
                                <div style={{ display: 'grid', gridTemplateColumns: `1.4fr ${activeCols.map(() => '1fr').join(' ')} auto`, gap: 8, marginTop: 4 }}>
                                  <div />
                                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', gridColumn: descCol ? '2' : '2' }}>
                                    <span style={{ fontSize: 11, color: '#9ca3af' }}>Match to your stock sheet:</span>
                                    {matches.map(m => (
                                      <button key={m.id} type="button" onClick={() => updateLine(i, 'description', m.description)}
                                        style={{ fontSize: 11, background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', borderRadius: 12, padding: '3px 10px', cursor: 'pointer', fontWeight: 600 }}>
                                        {m.description}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}
                              </React.Fragment>
                            )
                        })}
                        </>
                      )
                    })()}                    <div style={{ borderTop: '2px solid #e5e7eb', marginTop: 8, paddingTop: 12, display: 'flex', justifyContent: 'flex-end', gap: 24, fontSize: 14 }}>
                      <span style={{ color: '#6b7280' }}>VAT: <strong>{fmt(lineVatTotal)}</strong></span>
                      <span style={{ fontWeight: 800, fontSize: 16 }}>Total: <span style={{ color: '#1a5c38' }}>{fmt(lineTotal)}</span></span>
                    </div>
                  </div>

                  {/* Warning banner when editing an already-received invoice */}
                  {editInv && (editInv.status === 'received' || editInv.status === 'paid') && (
                    <div style={{ background: '#fef9c3', border: '1.5px solid #fde68a', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 13, color: '#92400e' }}>
                      ⚠️ <strong>This invoice has already been received.</strong> Saving will update the invoice record only — stock quantities and prices will <strong>not</strong> be changed again.
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 10 }}>
                    <button style={btn('#6b7280')} onClick={() => saveInvoice(false)} disabled={saving}>{saving ? 'Saving…' : '💾 Save as Draft'}</button>
                    {(() => {
                      const alreadyReceived = editInv && (editInv.status === 'received' || editInv.status === 'paid')
                      const sup = suppliers.find(s => s.name === invForm.supplier)
                      const deliversStock = !sup || sup.delivers_stock !== false
                      // Already received — show Save Changes only, never re-open GRV
                      if (alreadyReceived) return (
                        <button style={btn('#374151')} onClick={() => saveInvoice(false)} disabled={saving}>
                          {saving ? 'Saving…' : '✓ Save Changes'}
                        </button>
                      )
                      return (
                        <button style={btn()} onClick={() => saveInvoice(true)} disabled={saving}>
                          {saving ? 'Saving…' : deliversStock ? '✓ Submit & Receive Stock' : '✓ Submit Bill'}
                        </button>
                      )
                    })()}
                    <button style={btn('#6b7280')} onClick={() => { setShowInvForm(false); setEditInv(null) }}>Cancel</button>
                  </div>
                  <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 8 }}>
                    {(() => {
                      const alreadyReceived = editInv && (editInv.status === 'received' || editInv.status === 'paid')
                      if (alreadyReceived) return 'Editing a received invoice updates the record only — no stock changes will be made.'
                      const sup = suppliers.find(s => s.name === invForm.supplier)
                      return (!sup || sup.delivers_stock !== false)
                        ? 'Save as Draft keeps this invoice editable without touching your stock sheet. Submit & Receive Stock saves it and opens Receive Goods to update stock and pricing.'
                        : 'Save as Draft keeps this invoice editable. Submit Bill marks it as received — no stock update needed since this supplier delivers a service, not stock.'
                    })()}
                  </p>
                </div>
              )}

              {/* Invoice list */}
              {invoices.length === 0 && !showInvForm
                ? <div style={{ ...card, textAlign: 'center', padding: 48, color: '#6b7280' }}>
                  <div style={{ fontSize: 40, marginBottom: 8 }}>📄</div>
                  <p>No supplier invoices for {month}.</p>
                  <button style={{ ...btn(), marginTop: 12 }} onClick={openNewInvoice}>+ New Invoice</button>
                </div>
                : (() => {
                  const drafts = invoices.filter(i => i.status === 'draft')
                  const submitted = invoices.filter(i => i.status !== 'draft')
                  const renderInvoiceCard = (inv: Invoice) => (
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
                          {(inv.status === 'draft' || inv.status === 'approved') && <button onClick={() => openGRV(inv)} style={smBtn('#fef3c7', '#d97706')}>📦 Receive Goods</button>}
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
                  )
                  return (
                    <>
                      {drafts.length > 0 && (
                        <div style={{ marginBottom: 24 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                            <span style={{ fontSize: 15, fontWeight: 800, color: '#92400e' }}>📝 Drafts — not yet submitted</span>
                            <span style={{ fontSize: 12, background: '#fef3c7', color: '#92400e', padding: '2px 10px', borderRadius: 20, fontWeight: 700 }}>{drafts.length}</span>
                          </div>
                          {drafts.map(renderInvoiceCard)}
                        </div>
                      )}
                      {submitted.length > 0 && (
                        <div>
                          {drafts.length > 0 && <div style={{ fontSize: 15, fontWeight: 800, color: '#374151', marginBottom: 10 }}>Submitted Invoices</div>}
                          {submitted.map(renderInvoiceCard)}
                        </div>
                      )}
                    </>
                  )
                })()}
            </div>
          )}

          {/* ── QUICK EXPENSES ── */}
          {tab === 3 && (
            <div>
              {/* Header + actions */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Quick Expenses</h2>
                  <p style={{ margin: '4px 0 0', fontSize: 13, color: '#6b7280' }}>Small cash items without a formal invoice — petrol, airtime, staff meals, etc.</p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button style={btn('#6b7280')} onClick={() => setShowCatManager(true)}>⚙ Categories</button>
                  <button style={btn()} onClick={() => { setEditQ(null); setQForm(emptyQuick()); setShowQForm(true) }}>+ Add Expense</button>
                </div>
              </div>

              {/* Category Manager Modal */}
              {showCatManager && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ background: '#fff', borderRadius: 16, padding: 28, width: 520, maxHeight: '80vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                      <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Expense Categories</h3>
                      <button onClick={() => setShowCatManager(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#6b7280' }}>✕</button>
                    </div>
                    {/* Add new */}
                    <div style={{ background: '#f9fafb', borderRadius: 10, padding: 16, marginBottom: 20 }}>
                      <p style={{ margin: '0 0 10px', fontWeight: 600, fontSize: 14 }}>Add new category</p>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <input type="text" placeholder="Category name" value={quickCatForm.name}
                          onChange={e => setQuickCatForm(f => ({ ...f, name: e.target.value }))}
                          style={{ ...inp, flex: 1 }} />
                        <input type="color" value={quickCatForm.colour}
                          onChange={e => setQuickCatForm(f => ({ ...f, colour: e.target.value }))}
                          style={{ width: 44, height: 38, borderRadius: 8, border: '1px solid #e5e7eb', cursor: 'pointer', padding: 2 }} />
                        <button style={btn()} onClick={async () => { await saveQuickCategory(); load(); }}>Add</button>
                      </div>
                    </div>
                    {/* Existing categories */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {sortedCategories.map(cat => (
                        <div key={cat.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: '#f9fafb', borderRadius: 10, border: '1px solid #e5e7eb' }}>
                          {editingCat?.id === cat.id ? (
                            <>
                              <input type="text" value={catEditForm.name} onChange={e => setCatEditForm(f => ({ ...f, name: e.target.value }))}
                                style={{ ...inp, flex: 1, fontSize: 13 }} />
                              <input type="color" value={catEditForm.colour} onChange={e => setCatEditForm(f => ({ ...f, colour: e.target.value }))}
                                style={{ width: 36, height: 32, borderRadius: 6, border: 'none', cursor: 'pointer', padding: 2 }} />
                              <button style={btn(undefined, true)} onClick={() => updateCategoryInDB(cat)}>Save</button>
                              <button style={btn('#6b7280', true)} onClick={() => setEditingCat(null)}>Cancel</button>
                            </>
                          ) : (
                            <>
                              <span style={{ width: 12, height: 12, borderRadius: '50%', background: cat.colour, display: 'inline-block', flexShrink: 0 }} />
                              <span style={{ flex: 1, fontWeight: 600, fontSize: 14 }}>{cat.name}</span>
                              <span style={{ fontSize: 11, color: '#9ca3af', fontFamily: 'monospace' }}>{cat.key}</span>
                              <button style={btn('#1a5c38', true)} onClick={() => { setEditingCat(cat); setCatEditForm({ name: cat.name, colour: cat.colour }) }}>Edit</button>
                              <button style={btn('#dc2626', true)} onClick={() => { if (confirm('Archive this category?')) archiveCategoryInDB(cat.id) }}>Archive</button>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Multi-line quick expense form */}
              {showQForm && (
                <div style={{ ...card, border: '2px solid #1a5c38', marginBottom: 24, marginTop: 16 }}>
                  <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700 }}>{editQ ? 'Edit' : 'New'} Quick Expense</h3>
                  {error && <div style={{ background: '#fef2f2', color: '#dc2626', padding: '8px 12px', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>{error}</div>}

                  {/* Header fields */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
                    <div>
                      <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Date *</label>
                      <input type="date" value={qForm.expense_date} onChange={e => setQForm((f: any) => ({ ...f, expense_date: e.target.value }))} style={inp} />
                    </div>
                    <div>
                      <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Payment Method</label>
                      <select value={qForm.payment_method} onChange={e => setQForm((f: any) => ({ ...f, payment_method: e.target.value }))} style={inp}>
                        {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Supplier (optional)</label>
                      <select value={qForm.supplier} onChange={e => setQForm((f: any) => ({ ...f, supplier: e.target.value }))} style={inp}>
                        <option value="">— Select supplier —</option>
                        {suppliers.map((s: any) => <option key={s.id} value={s.name}>{s.name}</option>)}
                        <option value="other">Other</option>
                      </select>
                    </div>
                  </div>

                  {/* Line items */}
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr 120px 36px', gap: 8, marginBottom: 6 }}>
                      {['Category', 'Description', 'Amount (R)', ''].map(h => (
                        <div key={h} style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</div>
                      ))}
                    </div>
                    {(qForm.lines || []).map((line: any, idx: number) => (
                      <div key={idx} style={{ display: 'grid', gridTemplateColumns: '180px 1fr 120px 36px', gap: 8, marginBottom: 6 }}>
                        <select value={line.category_key} onChange={e => setQForm((f: any) => {
                          const lines = [...f.lines]; lines[idx] = { ...lines[idx], category_key: e.target.value }; return { ...f, lines }
                        })} style={{ ...inp, fontSize: 13 }}>
                          {sortedCategories.map((c: any) => <option key={c.key} value={c.key}>{c.name}</option>)}
                        </select>
                        <input type="text" placeholder="Description" value={line.description} onChange={e => setQForm((f: any) => {
                          const lines = [...f.lines]; lines[idx] = { ...lines[idx], description: e.target.value }; return { ...f, lines }
                        })} style={{ ...inp, fontSize: 13 }} />
                        <input type="number" step="0.01" placeholder="0.00" value={line.amount} onChange={e => setQForm((f: any) => {
                          const lines = [...f.lines]; lines[idx] = { ...lines[idx], amount: e.target.value }; return { ...f, lines }
                        })} style={{ ...inp, fontSize: 13 }} />
                        <button onClick={() => setQForm((f: any) => ({ ...f, lines: f.lines.filter((_: any, i: number) => i !== idx) }))}
                          style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#dc2626', cursor: 'pointer', fontWeight: 700 }}
                          disabled={(qForm.lines || []).length <= 1}>✕</button>
                      </div>
                    ))}
                    <button onClick={() => setQForm((f: any) => ({ ...f, lines: [...f.lines, emptyQLine()] }))}
                      style={{ background: 'none', border: '1px dashed #d1d5db', borderRadius: 8, padding: '7px 16px', cursor: 'pointer', color: '#1a5c38', fontWeight: 600, fontSize: 13, marginTop: 4 }}>
                      + Add line
                    </button>
                  </div>

                  {/* Total */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '10px 0', borderTop: '1px solid #e5e7eb', marginTop: 8, fontSize: 15, fontWeight: 700 }}>
                    Total: R {(qForm.lines || []).reduce((s: number, l: any) => s + (parseFloat(l.amount) || 0), 0).toFixed(2)}
                  </div>

                  <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                    <button style={btn()} onClick={saveQuick} disabled={saving}>{saving ? 'Saving…' : `Save ${(qForm.lines || []).filter((l: any) => l.description && l.amount).length} line(s)`}</button>
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
          {tab === 4 && (() => {
            const [periodStart, periodEnd] = fcPeriodRange()
            const costOfSales = fcData ? fcData.openingValue + fcData.purchases - fcData.closingValue - fcData.wastage : 0
            // Purchases and stock are ex-VAT — divide sales by 1.15 for apples-to-apples comparison
            const salesExclVat = fcData ? fcData.sales / 1.15 : 0
            const foodCostPct = fcData && salesExclVat > 0 ? (costOfSales / salesExclVat) * 100 : null
            const row = (label: string, value: number, sign: '+' | '-' | '=' | '') => (
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f3f4f6', fontSize: 14 }}>
                <span style={{ color: '#6b7280' }}>{sign && <span style={{ display: 'inline-block', width: 16, fontWeight: 700, color: '#9ca3af' }}>{sign}</span>}{label}</span>
                <span style={{ fontWeight: 700 }}>{fmt(value)}</span>
              </div>
            )
            return (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
                  <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Food Cost Analysis</h2>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <div style={{ display: 'flex', background: '#f3f4f6', borderRadius: 10, padding: 3 }}>
                      {(['month', 'week'] as const).map(m => (
                        <button key={m} onClick={() => setFcMode(m)} style={{ padding: '6px 16px', borderRadius: 8, border: 'none', background: fcMode === m ? '#1a5c38' : 'transparent', color: fcMode === m ? '#fff' : '#6b7280', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>{m === 'month' ? 'Month' : 'Week'}</button>
                      ))}
                    </div>
                    {fcMode === 'week' && <input type="date" value={fcWeekStart} onChange={e => setFcWeekStart(e.target.value)} style={inp} />}
                  </div>
                </div>
                <p style={{ fontSize: 13, color: '#9ca3af', marginBottom: 16 }}>
                  {fcMode === 'week' ? `Week of ${periodStart} — ${periodEnd}` : `${new Date(periodStart).toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' })}`}
                </p>

                {fcLoading ? (
                  <div style={{ textAlign: 'center', padding: 60, color: '#6b7280' }}>Calculating…</div>
                ) : !fcData ? null : (
                  <>
                    {fcOverrideCountThisQuarter >= 3 && (
                      <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '12px 16px', marginBottom: 16, fontSize: 13, color: '#991b1b', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 18 }}>🚩</span>
                        <span><b>Data quality flag:</b> this store has used {fcOverrideCountThisQuarter} manual stock value overrides in the last 90 days. Food Cost % here is being driven by estimates, not physical counts — worth flagging if reviewed from head office.</span>
                      </div>
                    )}
                    {(fcData.openingMissing || fcData.closingMissing) && (
                      <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 10, padding: '12px 16px', marginBottom: 16, fontSize: 13, color: '#c2410c' }}>
                        ⚠️ {fcData.openingMissing && 'No completed stock count found before this period — opening value is treated as R0, which will distort the result. '}
                        {fcData.closingMissing && 'No completed stock count found for this period — closing value is treated as R0. '}
                        Run a stock count in Stock Management close to the start and end of each period for an accurate Food Cost %, or set a manual opening/closing value below.
                      </div>
                    )}

                    <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 20 }}>
                      <div style={card}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 4 }}>Cost of Sales Breakdown</div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f3f4f6' }}>
                          <div>
                            <div style={{ fontSize: 14, color: '#6b7280' }}>Opening Stock Value</div>
                            <div style={{ fontSize: 11, color: fcData.openingManual ? '#c2410c' : '#9ca3af', fontWeight: fcData.openingManual ? 700 : 400 }}>
                              {fcData.openingManual ? `⚠️ Manual entry${fcData.openingReason ? ` — ${fcData.openingReason}` : ''}` : fcData.openingDate ? `From count on ${fcData.openingDate}` : 'No count found'}
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontWeight: 700 }}>{fmt(fcData.openingValue)}</span>
                            {fcData.openingManual ? (
                              <button onClick={() => clearFoodCostOverride('opening')} style={smBtn('#fef2f2', '#dc2626')}>Clear</button>
                            ) : (
                              <button onClick={() => { setFcOverrideField('opening'); setFcOverrideForm({ value: String(fcData.openingValue || ''), reason: '' }) }} style={smBtn('#f3f4f6', '#374151')}>Override</button>
                            )}
                          </div>
                        </div>

                        {row('Purchases (Stock module)', fcData.purchases, '+')}

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f3f4f6' }}>
                          <div>
                            <div style={{ fontSize: 14, color: '#6b7280' }}><span style={{ display: 'inline-block', width: 16, fontWeight: 700, color: '#9ca3af' }}>-</span>Closing Stock Value</div>
                            <div style={{ fontSize: 11, color: fcData.closingManual ? '#c2410c' : '#9ca3af', fontWeight: fcData.closingManual ? 700 : 400 }}>
                              {fcData.closingManual ? `⚠️ Manual entry${fcData.closingReason ? ` — ${fcData.closingReason}` : ''}` : fcData.closingDate ? `From count on ${fcData.closingDate}` : 'No count found'}
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontWeight: 700 }}>{fmt(fcData.closingValue)}</span>
                            {fcData.closingManual ? (
                              <button onClick={() => clearFoodCostOverride('closing')} style={smBtn('#fef2f2', '#dc2626')}>Clear</button>
                            ) : (
                              <button onClick={() => { setFcOverrideField('closing'); setFcOverrideForm({ value: String(fcData.closingValue || ''), reason: '' }) }} style={smBtn('#f3f4f6', '#374151')}>Override</button>
                            )}
                          </div>
                        </div>

                        {row('Wastage', fcData.wastage, '-')}
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 0 0', fontSize: 16, fontWeight: 800 }}>
                          <span>Cost of Sales</span>
                          <span style={{ color: '#1a5c38' }}>{fmt(costOfSales)}</span>
                        </div>
                      </div>

                      <div style={{ ...card, textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                        <div style={{ fontSize: 12, color: '#9ca3af', fontWeight: 600, marginBottom: 6 }}>FOOD COST %</div>
                        <div style={{ fontSize: 44, fontWeight: 800, color: foodCostPct === null ? '#9ca3af' : foodCostPct <= 33 ? '#16a34a' : foodCostPct <= 38 ? '#d97706' : '#dc2626' }}>
                          {foodCostPct === null ? '—' : `${foodCostPct.toFixed(1)}%`}
                        </div>
                        <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>{fmt(costOfSales)} ÷ {fmt(salesExclVat)} sales (ex-VAT)</div>
                        {fcData.sales === 0 && <div style={{ fontSize: 11, color: '#dc2626', marginTop: 8 }}>No sales recorded for this period</div>}
                        {(fcData.openingManual || fcData.closingManual) && <div style={{ fontSize: 11, color: '#c2410c', marginTop: 8, fontWeight: 600 }}>⚠️ Based on a manual entry, not a physical count</div>}
                        <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 16, borderTop: '1px solid #f3f4f6', paddingTop: 12 }}>Typical restaurant target: 28–35%</div>
                      </div>
                    </div>
                  </>
                )}

                <div style={{ marginTop: 20, textAlign: 'center' }}>
                  <button style={btn('#6b7280')} onClick={() => router.push('/stock')}>Go to Stock Management →</button>
                </div>

                {fcOverrideField && (
                  <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setFcOverrideField(null)}>
                    <div style={{ background: '#fff', borderRadius: 16, padding: 24, width: 420, maxWidth: '90vw' }} onClick={e => e.stopPropagation()}>
                      <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Manual {fcOverrideField === 'opening' ? 'Opening' : 'Closing'} Stock Value</div>
                      <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: '#c2410c', marginBottom: 16 }}>
                        ⚠️ This overrides the value from your stock counts. It's flagged on screen as a manual entry, and counts toward a data-quality flag if used often. Only use this to bootstrap a new store or correct a known bad count.
                      </div>
                      <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Value (R)</label>
                      <input type="number" step="0.01" value={fcOverrideForm.value} onChange={e => setFcOverrideForm(f => ({ ...f, value: e.target.value }))} style={{ ...inp, marginBottom: 12 }} autoFocus />
                      <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Reason</label>
                      <input type="text" placeholder="e.g. New store, no count yet" value={fcOverrideForm.reason} onChange={e => setFcOverrideForm(f => ({ ...f, reason: e.target.value }))} style={{ ...inp, marginBottom: 16 }} />
                      <div style={{ display: 'flex', gap: 10 }}>
                        <button style={btn('#6b7280')} onClick={() => setFcOverrideField(null)}>Cancel</button>
                        <button style={btn()} onClick={saveFoodCostOverride}>Save Override</button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })()}

          {tab === 5 && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Invoice History</h2>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <input type="text" placeholder="Search supplier, invoice #, notes…" value={historySearch} onChange={e => setHistorySearch(e.target.value)} style={{ ...inp, width: 220 }} />
                  <select value={historySupplier} onChange={e => setHistorySupplier(e.target.value)} style={inp}>
                    <option value="All">All Suppliers</option>
                    {suppliers.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                  </select>
                  <select value={historyStatus} onChange={e => setHistoryStatus(e.target.value)} style={inp}>
                    {['All', 'draft', 'received', 'paid'].map(s => <option key={s} value={s}>{s === 'All' ? 'All Statuses' : s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                  </select>
                </div>
              </div>
              <p style={{ fontSize: 12, color: '#9ca3af', marginBottom: 16 }}>Every invoice across all months, most recent first. Showing the last 300 — narrow the filters above for older records.</p>
              {historyLoading ? (
                <div style={{ textAlign: 'center', padding: 60, color: '#6b7280' }}>Loading…</div>
              ) : filteredHistory.length === 0 ? (
                <div style={{ ...card, textAlign: 'center', padding: 48, color: '#6b7280' }}>
                  <div style={{ fontSize: 40, marginBottom: 8 }}>📄</div>
                  <p>No invoices match these filters.</p>
                </div>
              ) : (
                <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                        {['Date', 'Supplier', 'Invoice #', 'Status', 'Due', 'Amount'].map(h => (
                          <th key={h} style={{ padding: '10px 14px', textAlign: h === 'Amount' ? 'right' : 'left', color: '#6b7280', fontWeight: 700, fontSize: 11, textTransform: 'uppercase' as const }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredHistory.map(inv => (
                        <tr key={inv.id} style={{ borderBottom: '1px solid #f3f4f6', cursor: 'pointer' }} onClick={() => openEditInvoice(inv)}>
                          <td style={{ padding: '10px 14px' }}>{inv.invoice_date}</td>
                          <td style={{ padding: '10px 14px', fontWeight: 600 }}>{inv.supplier}</td>
                          <td style={{ padding: '10px 14px', color: '#6b7280' }}>{inv.invoice_number || '—'}</td>
                          <td style={{ padding: '10px 14px' }}>{statusBadge(inv.status, 11)}</td>
                          <td style={{ padding: '10px 14px', color: '#6b7280' }}>{inv.due_date || '—'}</td>
                          <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700 }}>{fmt(Number(inv.total_amount))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
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
                  <div style={{ display: 'grid', gridTemplateColumns: '1.7fr 65px 65px 75px 70px 80px 90px', gap: 6, marginBottom: 4, fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' as const }}>
                    <div>Item</div><div style={{textAlign:'center'}}>Cases</div><div style={{textAlign:'center'}}>Kg/Case</div><div>Case Price</div><div style={{textAlign:'center'}}>→ Qty</div><div>→ R/unit</div><div></div>
                  </div>
                  <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 8 }}>For case/box items: fill in Cases, Kg per Case, and Case Price — Qty and R/unit will work out automatically. For simple items, just type Qty and R/unit directly.</div>
                  <div style={{ maxHeight: 420, overflowY: 'auto' }}>
                    {grvLines.map((line, i) => {
                       // Catch weight: stock tracked in "each" but received/priced by kg
                       // e.g. Chicken - bought 141.46 kg at R38.70/kg, but you received 100 birds
                       const isCatchWeight = ['each','unit','units','pcs','pieces'].includes((line.unit||'').toLowerCase())
                         && (line.case_qty === '' && parseFloat(line.qty_received) > 0 && parseFloat(line.qty_received) !== Math.round(parseFloat(line.qty_received)))
                       return (
                       <div key={line.stock_item_id} style={{ borderTop: '1px solid #f3f4f6', padding: '10px 0' }}>
                         <div style={{ display: 'grid', gridTemplateColumns: '1.7fr 65px 65px 75px 70px 80px 90px', gap: 6, alignItems: 'center' }}>
                           <div>
                             <div style={{ fontWeight: 600, fontSize: 14 }}>{line.description}</div>
                             <div style={{ fontSize: 12, color: '#6b7280' }}>{line.unit}</div>
                           </div>
                           <input type="number" step="1" min="0" placeholder="—"
                             value={line.case_qty}
                             onChange={e => setGrvLines(ls => ls.map((l,idx) => idx===i ? recalcGrvCase({ ...l, case_qty: e.target.value }) : l))}
                             title="Number of cases/boxes received"
                             style={{ width: '100%', padding: '6px 6px', border: '1.5px solid #fde68a', borderRadius: 8, fontSize: 13, outline: 'none', background: '#fefce8', textAlign: 'center' as const }} />
                           <input type="number" step="0.1" min="0" placeholder="—"
                             value={line.units_per_case}
                             onChange={e => setGrvLines(ls => ls.map((l,idx) => idx===i ? recalcGrvCase({ ...l, units_per_case: e.target.value }) : l))}
                             title="Kg (or units) per case/box"
                             style={{ width: '100%', padding: '6px 6px', border: '1.5px solid #fde68a', borderRadius: 8, fontSize: 13, outline: 'none', background: '#fefce8', textAlign: 'center' as const }} />
                           <input type="number" step="0.01" min="0" placeholder="R / case"
                             value={line.case_price}
                             onChange={e => setGrvLines(ls => ls.map((l,idx) => idx===i ? recalcGrvCase({ ...l, case_price: e.target.value }) : l))}
                             title="Total price paid for one case/box"
                             style={{ width: '100%', padding: '6px 6px', border: '1.5px solid #fde68a', borderRadius: 8, fontSize: 13, outline: 'none', background: '#fefce8' }} />
                           <input type="number" step="0.1" min="0" placeholder="0"
                             value={line.qty_received}
                             onChange={e => setGrvLines(ls => ls.map((l,idx) => idx===i ? {...l, qty_received: e.target.value} : l))}
                             title="Quantity that goes onto your stock sheet — for catch weight items, enter number of UNITS (birds/pieces), not kg"
                             style={{ padding: '6px 6px', border: `1.5px solid ${parseFloat(line.qty_received) > 0 ? '#16a34a' : '#e5e7eb'}`, borderRadius: 8, fontSize: 14, textAlign: 'center' as const, outline: 'none', background: parseFloat(line.qty_received) > 0 ? '#f0fdf4' : '#fff' }} />
                           <input type="number" step="0.01" min="0" placeholder="unit cost"
                             value={line.unit_cost}
                             onChange={e => setGrvLines(ls => ls.map((l,idx) => idx===i ? {...l, unit_cost: e.target.value} : l))}
                             title="Cost per unit on your stock sheet"
                             style={{ padding: '6px 6px', border: '1.5px solid #e5e7eb', borderRadius: 8, fontSize: 13, outline: 'none' }} />
                           {parseFloat(line.unit_cost) > 0 ? (
                             <button onClick={async () => {
                               const { createClient } = await import('@supabase/supabase-js')
                               const sb = createClient('https://fdixocuxhpafxkfytvxu.supabase.co', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '')
                               await sb.from('stock_items').update({ price: parseFloat(line.unit_cost), cost_price: parseFloat(line.unit_cost) }).eq('id', line.stock_item_id)
                               setGrvLines(ls => ls.map((l,idx) => idx===i ? {...l, price_updated: true} : l))
                               alert('Stock price updated to R' + parseFloat(line.unit_cost).toFixed(4) + ' per ' + line.unit)
                             }} style={{ background: line.price_updated ? '#1d4ed8' : '#1a5c38', color: 'white', border: 'none', borderRadius: 8, padding: '6px 8px', fontSize: 11, cursor: 'pointer', fontWeight: 700, transition: 'background 0.3s' }}>
                               {line.price_updated ? '✓ Updated' : 'Update price'}
                             </button>
                           ) : <div />}
                         </div>
                         {/* Catch weight toggle button — shown on any "each" item */}
                         {['each','unit','units','pcs'].includes((line.unit||'').toLowerCase()) && (
                           <button
                             onClick={() => setGrvLines(ls => ls.map((l,idx) => idx===i ? {...l, is_catch_weight: !l.is_catch_weight} : l))}
                             style={{ marginTop: 6, fontSize: 11, fontWeight: 700, color: line.is_catch_weight ? '#92400e' : '#6b7280', background: line.is_catch_weight ? '#fef9c3' : '#f9fafb', border: `1px solid ${line.is_catch_weight ? '#fde68a' : '#e5e7eb'}`, borderRadius: 6, padding: '3px 10px', cursor: 'pointer' }}
                             title="Toggle catch weight mode — use when item is bought by kg but counted by unit (e.g. whole chickens)"
                           >
                             ⚖️ {line.is_catch_weight ? 'Catch weight ON' : 'Catch weight?'}
                           </button>
                         )}
                         {/* Catch weight helper panel — only when toggled on */}
                         {line.is_catch_weight && (
                           <div style={{ marginTop: 8, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 12px' }}>
                             <div style={{ fontSize: 12, fontWeight: 700, color: '#92400e', marginBottom: 6 }}>
                               ⚖️ Catch Weight — stock tracked in <strong>{line.unit}</strong>
                             </div>
                             <div style={{ fontSize: 12, color: '#78350f', marginBottom: 8 }}>
                               Invoice qty shows <strong>{line.qty_received} kg</strong> at <strong>R{parseFloat(line.unit_cost||'0').toFixed(2)}/kg</strong>. 
                               How many actual {line.unit}s did you receive? Enter below to calculate cost per {line.unit}.
                             </div>
                             <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' as const }}>
                               <div>
                                 <div style={{ fontSize: 11, color: '#92400e', marginBottom: 2 }}>Total KG received</div>
                                 <input type="number" step="0.01"
                                   defaultValue={line.qty_received}
                                   placeholder="kg"
                                   onBlur={e => {
                                     const totalKg = parseFloat(e.target.value) || 0
                                     const unitInput = e.target.closest('div.catch-weight-row')?.querySelector('input.unit-count') as HTMLInputElement
                                     const units = unitInput ? parseFloat(unitInput.value) || 0 : 0
                                     if (units > 0 && totalKg > 0) {
                                       const kgPerUnit = totalKg / units
                                       const costPerUnit = parseFloat(line.unit_cost || '0') * kgPerUnit
                                       setGrvLines(ls => ls.map((l, idx) => idx === i ? { ...l, qty_received: String(units), unit_cost: costPerUnit.toFixed(4) } : l))
                                     }
                                   }}
                                   style={{ width: 80, padding: '6px 8px', border: '1.5px solid #fde68a', borderRadius: 8, fontSize: 13 }} />
                               </div>
                               <div style={{ color: '#92400e', fontSize: 16, marginTop: 14 }}>÷</div>
                               <div className="catch-weight-row">
                                 <div style={{ fontSize: 11, color: '#92400e', marginBottom: 2 }}>Number of {line.unit}s</div>
                                 <input type="number" step="1" min="1"
                                   className="unit-count"
                                   placeholder="e.g. 100"
                                   onChange={e => {
                                     const units = parseFloat(e.target.value) || 0
                                     const totalKg = parseFloat(line.qty_received) || 0
                                     const pricePerKg = parseFloat(line.unit_cost || '0')
                                     if (units > 0 && totalKg > 0 && pricePerKg > 0) {
                                       const kgPerUnit = totalKg / units
                                       const costPerUnit = pricePerKg * kgPerUnit
                                       setGrvLines(ls => ls.map((l, idx) => idx === i ? { ...l, qty_received: String(units), unit_cost: costPerUnit.toFixed(4) } : l))
                                     }
                                   }}
                                   style={{ width: 80, padding: '6px 8px', border: '1.5px solid #16a34a', borderRadius: 8, fontSize: 13, background: '#f0fdf4' }} />
                               </div>
                               <div style={{ color: '#92400e', fontSize: 16, marginTop: 14 }}>=</div>
                               <div>
                                 <div style={{ fontSize: 11, color: '#92400e', marginBottom: 2 }}>Cost per {line.unit}</div>
                                 <div style={{ padding: '6px 10px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, fontWeight: 700, minWidth: 80 }}>
                                   {parseFloat(line.unit_cost) > 0 && parseFloat(line.qty_received) > 0
                                     ? 'R' + parseFloat(line.unit_cost).toFixed(2)
                                     : '—'}
                                 </div>
                               </div>
                               <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 14 }}>
                                 Qty and unit cost above update automatically
                               </div>
                             </div>
                           </div>
                         )}
                       </div>
                       )
                    })}
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

      {showScanChoice && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: 20 }} onClick={() => setShowScanChoice(false)}>
          <div style={{ background: '#fff', borderRadius: 20, padding: 32, width: 440, maxWidth: '100%' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>📷 Scan Invoice</div>

            {/* Step 1 — Supplier selection */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 6 }}>
                1. Which supplier is this invoice from?
              </label>
              <select
                value={scanSupplier}
                onChange={e => {
                  const val = e.target.value
                  setScanSupplier(val)
                  scanSupplierRef.current = val
                  if (val && val !== '__other__') {
                    const sup = suppliers.find(s => s.name === val)
                    // Open the invoice form immediately and set supplier + payment terms
                    setShowInvForm(true)
                    setInvForm(f => ({
                      ...f,
                      supplier: val,
                      // Auto-set due date if invoice date is already filled
                      due_date: sup && f.invoice_date ? addDays(f.invoice_date, sup.payment_terms_days ?? 7) : f.due_date,
                    }))
                  } else if (val === '__other__') {
                    setInvForm(f => ({ ...f, supplier: '' }))
                  }
                }}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: `2px solid ${scanSupplier ? '#1a5c38' : '#e5e7eb'}`, fontSize: 14, background: '#fff' }}
                autoFocus
              >
                <option value="">— Select supplier first —</option>
                {suppliers.map(s => <option key={s.id} value={s.name}>{s.name}{s.invoice_columns?.length ? ' ✓' : ''}</option>)}
                <option value="__other__">Other / Unknown</option>
              </select>
              {scanSupplier && scanSupplier !== '__other__' && (() => {
                const sup = suppliers.find(s => s.name === scanSupplier)
                const priceCol = sup?.invoice_columns?.find(c => c.maps_to === 'unit_price_excl')
                return sup?.invoice_columns?.length ? (
                  <div style={{ fontSize: 12, color: '#16a34a', marginTop: 6, background: '#f0fdf4', borderRadius: 6, padding: '5px 10px' }}>
                    ✓ {sup.invoice_columns.length}-column template loaded{priceCol?.name ? ` — price from "${priceCol.name}" column` : ''}
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 6 }}>
                    No column template set for this supplier — AI will use general rules. Set one in Stock → Suppliers → Edit.
                  </div>
                )
              })()}
            </div>

            {/* Step 2 — Scan method */}
            <label style={{ fontSize: 13, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 8 }}>2. How do you want to capture it?</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                onClick={() => {
                  if (scanSupplierRef.current && scanSupplierRef.current !== '__other__') setInvForm(f => ({ ...f, supplier: scanSupplierRef.current }))
                  setShowScanChoice(false)
                  fileInputRef.current?.click()
                }}
                disabled={!scanSupplier}
                style={{ display: 'flex', alignItems: 'center', gap: 16, background: scanSupplier ? '#f8faf8' : '#f3f4f6', border: `1.5px solid ${scanSupplier ? '#e5e7eb' : '#f0f0f0'}`, borderRadius: 14, padding: '14px 18px', cursor: scanSupplier ? 'pointer' : 'not-allowed', textAlign: 'left', width: '100%', opacity: scanSupplier ? 1 : 0.5 }}
              >
                <span style={{ fontSize: 28 }}>🖥️</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#111' }}>Upload from PC / Drive</div>
                  <div style={{ fontSize: 12, color: '#888', marginTop: 1 }}>Pick a photo or PDF from your computer</div>
                </div>
              </button>

              <button
                onClick={() => {
                  if (scanSupplierRef.current && scanSupplierRef.current !== '__other__') setInvForm(f => ({ ...f, supplier: scanSupplierRef.current }))
                  startDeviceScan()
                }}
                disabled={!scanSupplier}
                style={{ display: 'flex', alignItems: 'center', gap: 16, background: scanSupplier ? '#eff6ff' : '#f3f4f6', border: `1.5px solid ${scanSupplier ? '#bfdbfe' : '#f0f0f0'}`, borderRadius: 14, padding: '14px 18px', cursor: scanSupplier ? 'pointer' : 'not-allowed', textAlign: 'left', width: '100%', opacity: scanSupplier ? 1 : 0.5 }}
              >
                <span style={{ fontSize: 28 }}>📱</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#1d4ed8' }}>Photo Scan from Device</div>
                  <div style={{ fontSize: 12, color: '#3b82f6', marginTop: 1 }}>Take a photo with your phone — appears here in seconds</div>
                </div>
              </button>
            </div>

            <button onClick={() => setShowScanChoice(false)} style={{ marginTop: 16, width: '100%', padding: '10px', background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: 10, fontWeight: 600, cursor: 'pointer', fontSize: 14 }}>Cancel</button>
          </div>
        </div>
      )}

    </div>
  )
}
