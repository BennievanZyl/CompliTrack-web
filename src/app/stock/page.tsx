'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

const STORE_ID = '05328298-fc27-4c9f-b091-bb7f6598b601'

type StockCategory = { id: string; name: string; color: string; sort_order: number }
type StockItem = { id: string; category: string | null; name: string; description: string; unit: string; cost_price: number; price: number; par_level: number; is_active: boolean; sort_order: number }
type StockCount = { id: string; count_type: string; count_date: string; status: string; notes: string | null }
type StockCountLine = { id: string; stock_count_id: string; stock_item_id: string; expected_qty: number; actual_qty: number; unit_cost: number }
type StockPurchase = { id: string; purchase_date: string; supplier_name: string | null; item_name: string | null; quantity: number; unit: string | null; unit_cost: number; total_cost: number; invoice_number: string | null }
type StockWastage = { id: string; wastage_date: string; item_name: string | null; quantity: number; unit: string | null; unit_cost: number; total_cost: number; reason: string | null }
type StockOrder = { id: string; supplier_name: string; order_date: string; expected_delivery: string | null; status: string; notes: string | null; total_value: number }

const TABS = [
  { key: 'counts', label: '📊 Stock Counts' },
  { key: 'purchases', label: '🛒 Purchases' },
  { key: 'wastage', label: '🗑️ Wastage' },
  { key: 'orders', label: '📦 Orders' },
  { key: 'items', label: '⚙️ Stock Items' },
]

const COUNT_TYPES = [
  { key: 'daily', label: 'Daily', desc: 'Perishables & quick items', color: '#16a34a', bg: '#dcfce7' },
  { key: 'weekly', label: 'Weekly', desc: 'Broader variance check', color: '#2563eb', bg: '#dbeafe' },
  { key: 'monthly', label: 'Monthly', desc: 'Full stocktake & food cost', color: '#7c3aed', bg: '#ede9fe' },
]

const UNITS = ['each', 'kg', 'g', 'L', 'ml', 'pack', 'box', 'bag', 'bottle', 'tin', 'tray', 'dozen']
const WASTAGE_REASONS = ['Expired', 'Damaged', 'Over-cooked', 'Dropped', 'Spillage', 'Wrong order', 'Other']

const INPUT: React.CSSProperties = { width: '100%', border: '1.5px solid #e5e7eb', borderRadius: '10px', padding: '10px 12px', fontSize: '14px', outline: 'none', boxSizing: 'border-box', background: '#fff', fontFamily: 'system-ui' }
const LABEL: React.CSSProperties = { display: 'block', fontSize: '12px', fontWeight: 700, color: '#374151', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }

function formatCurrency(v: number) { return `R ${v.toFixed(2)}` }
function formatDate(d: string) { return new Date(d).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }) }

export default function StockPage() {
  const router = useRouter()
  const [tab, setTab] = useState('counts')
  const [categories, setCategories] = useState<StockCategory[]>([])
  const [items, setItems] = useState<StockItem[]>([])
  const [counts, setCounts] = useState<StockCount[]>([])
  const [purchases, setPurchases] = useState<StockPurchase[]>([])
  const [wastage, setWastage] = useState<StockWastage[]>([])
  const [orders, setOrders] = useState<StockOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activeCount, setActiveCount] = useState<StockCount | null>(null)
  const [countLines, setCountLines] = useState<StockCountLine[]>([])
  const [countTypeFilter, setCountTypeFilter] = useState('daily')
  const [showAIImport, setShowAIImport] = useState(false)
  const [aiText, setAIText] = useState('')
  const [aiLoading, setAILoading] = useState(false)
  const [aiResults, setAIResults] = useState<{ name: string; qty: number; unit: string }[]>([])
  const [showAddItem, setShowAddItem] = useState(false)
  const [showAddPurchase, setShowAddPurchase] = useState(false)
  const [showAddWastage, setShowAddWastage] = useState(false)
  const [showAddOrder, setShowAddOrder] = useState(false)
  const [showAddCategory, setShowAddCategory] = useState(false)
  const [editItem, setEditItem] = useState<StockItem | null>(null)
  const [itemForm, setItemForm] = useState({ name: '', description: '', category_id: 'goods', unit: 'each', cost_price: '', par_level: '' })
  const [purchaseForm, setPurchaseForm] = useState({ purchase_date: new Date().toISOString().split('T')[0], supplier_name: '', stock_item_id: '', item_name: '', quantity: '', unit: 'each', unit_cost: '', invoice_number: '' })
  const [wastageForm, setWastageForm] = useState({ wastage_date: new Date().toISOString().split('T')[0], stock_item_id: '', item_name: '', quantity: '', unit: 'each', unit_cost: '', reason: 'Expired' })
  const [orderForm, setOrderForm] = useState({ supplier_name: '', order_date: new Date().toISOString().split('T')[0], expected_delivery: '', notes: '' })
  const [categoryForm, setCategoryForm] = useState({ name: '', color: '#1a5c38' })

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [catRes, itemRes, countRes, purchRes, wastRes, ordRes] = await Promise.all([
      supabase.from('stock_categories').select('*').eq('store_id', STORE_ID).order('sort_order'),
      supabase.from('stock_items').select('*').eq('store_id', STORE_ID).eq('is_active', true).order('sort_order', { nullsFirst: false }),
      supabase.from('stock_counts').select('*').eq('store_id', STORE_ID).order('count_date', { ascending: false }).limit(30),
      supabase.from('stock_purchases').select('*').eq('store_id', STORE_ID).order('purchase_date', { ascending: false }).limit(50),
      supabase.from('stock_wastage').select('*').eq('store_id', STORE_ID).order('wastage_date', { ascending: false }).limit(50),
      supabase.from('stock_orders').select('*').eq('store_id', STORE_ID).order('order_date', { ascending: false }).limit(30),
    ])
    setCategories(catRes.data || [])
    setItems(itemRes.data || [])
    setCounts(countRes.data || [])
    setPurchases(purchRes.data || [])
    setWastage(wastRes.data || [])
    setOrders(ordRes.data || [])
    setLoading(false)
  }

  async function startCount(type: string) {
    setSaving(true)
    const today = new Date().toISOString().split('T')[0]
    const { data: existing } = await supabase.from('stock_counts').select('*').eq('store_id', STORE_ID).eq('count_type', type).eq('count_date', today).eq('status', 'draft').maybeSingle()
    let count = existing
    if (!count) {
      const { data } = await supabase.from('stock_counts').insert({ store_id: STORE_ID, count_type: type, count_date: today, status: 'draft' }).select().single()
      count = data
    }
    if (count) {
      setActiveCount(count)
      const { data: lines } = await supabase.from('stock_count_lines').select('*').eq('stock_count_id', count.id)
      const existingItemIds = (lines || []).map((l: StockCountLine) => l.stock_item_id)
      const missingItems = (itemRes: StockItem[]) => itemRes.filter((i: StockItem) => !existingItemIds.includes(i.id))
      const missing = missingItems(items)
      if (missing.length > 0) {
        await supabase.from('stock_count_lines').insert(missing.map((i: StockItem) => ({ stock_count_id: count.id, stock_item_id: i.id, expected_qty: 0, actual_qty: 0, unit_cost: i.cost_price ?? i.price ?? 0 })))
      }
      const { data: freshLines } = await supabase.from('stock_count_lines').select('*').eq('stock_count_id', count.id)
      setCountLines(freshLines || [])
    }
    setShowAddItem(false)
    setSaving(false)
  }

  async function updateCountLine(lineId: string, qty: number) {
    setCountLines(prev => prev.map(l => l.id === lineId ? { ...l, actual_qty: qty } : l))
    await supabase.from('stock_count_lines').update({ actual_qty: qty }).eq('id', lineId)
  }

  async function completeCount() {
    if (!activeCount) return
    await supabase.from('stock_counts').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', activeCount.id)
    setActiveCount(null); setCountLines([]); await loadAll()
  }

  async function savePurchase() {
    setSaving(true)
    const total = parseFloat(purchaseForm.quantity || '0') * parseFloat(purchaseForm.unit_cost || '0')
    await supabase.from('stock_purchases').insert({ store_id: STORE_ID, purchase_date: purchaseForm.purchase_date, supplier_name: purchaseForm.supplier_name || null, stock_item_id: purchaseForm.stock_item_id || null, item_name: purchaseForm.item_name || (items.find(i => i.id === purchaseForm.stock_item_id)?.name ?? items.find(i => i.id === purchaseForm.stock_item_id)?.description) || null, quantity: parseFloat(purchaseForm.quantity || '0'), unit: purchaseForm.unit, unit_cost: parseFloat(purchaseForm.unit_cost || '0'), total_cost: total, invoice_number: purchaseForm.invoice_number || null })
    setPurchaseForm({ purchase_date: new Date().toISOString().split('T')[0], supplier_name: '', stock_item_id: '', item_name: '', quantity: '', unit: 'each', unit_cost: '', invoice_number: '' })
    setShowAddPurchase(false); await loadAll(); setSaving(false)
  }

  async function saveWastage() {
    setSaving(true)
    const total = parseFloat(wastageForm.quantity || '0') * parseFloat(wastageForm.unit_cost || '0')
    await supabase.from('stock_wastage').insert({ store_id: STORE_ID, wastage_date: wastageForm.wastage_date, stock_item_id: wastageForm.stock_item_id || null, item_name: wastageForm.item_name || (items.find(i => i.id === wastageForm.stock_item_id)?.name ?? items.find(i => i.id === wastageForm.stock_item_id)?.description) || null, quantity: parseFloat(wastageForm.quantity || '0'), unit: wastageForm.unit, unit_cost: parseFloat(wastageForm.unit_cost || '0'), total_cost: total, reason: wastageForm.reason })
    setWastageForm({ wastage_date: new Date().toISOString().split('T')[0], stock_item_id: '', item_name: '', quantity: '', unit: 'each', unit_cost: '', reason: 'Expired' })
    setShowAddWastage(false); await loadAll(); setSaving(false)
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

  async function saveItem() {
    if (!itemForm.name && !itemForm.description) return
    setSaving(true)
    const payload = { store_id: STORE_ID, name: itemForm.name, description: itemForm.name, category: itemForm.category_id || 'goods', unit: itemForm.unit, price: parseFloat(itemForm.cost_price || '0'), is_active: true }
    if (editItem) { await supabase.from('stock_items').update(payload).eq('id', editItem.id) }
    else { await supabase.from('stock_items').insert(payload) }
    setItemForm({ name: '', description: '', category_id: 'goods', unit: 'each', cost_price: '', par_level: '' })
    setShowAddItem(false); setEditItem(null); await loadAll(); setSaving(false)
  }

  async function saveCategory() {
    if (!categoryForm.name) return
    await supabase.from('stock_categories').insert({ store_id: STORE_ID, name: categoryForm.name, color: categoryForm.color, sort_order: categories.length + 1 })
    setCategoryForm({ name: '', color: '#1a5c38' }); setShowAddCategory(false); await loadAll()
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

  const groupedItems = categories.reduce((acc, cat) => {
                    const catItems = items.filter(i => i.category === catKey)
    if (catItems.length) acc[cat.id] = { cat, items: catItems }
    return acc
  }, {} as Record<string, { cat: StockCategory; items: StockItem[] }>)

                    // uncategorised items shown under other
  const todayStr = new Date().toISOString().split('T')[0]
  const todayPurchases = purchases.filter(p => p.purchase_date === todayStr)
  const todayWastage = wastage.filter(w => w.wastage_date === todayStr)
  const pendingOrders = orders.filter(o => o.status === 'pending')
  const sc = (s: string) => s === 'delivered' ? { bg: '#dcfce7', color: '#166534' } : s === 'pending' ? { bg: '#fef3c7', color: '#92400e' } : s === 'partial' ? { bg: '#dbeafe', color: '#1e40af' } : { bg: '#fee2e2', color: '#dc2626' }

  const Modal = ({ show, onClose, title, children, maxWidth = '480px' }: { show: boolean; onClose: () => void; title: string; children: React.ReactNode; maxWidth?: string }) => !show ? null : (
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
                  {Object.values(groupedItems).map(({ key, label, color, items: catItems }) => (
                    <div key={key}>
                      <div style={{ padding: '10px 24px', background: '#f9fafb', borderTop: '1px solid #e5e7eb', fontWeight: 700, fontSize: '13px', color: color, display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: color }} />{label}
                      </div>
                      {catItems.map(item => {
                        const line = countLines.find(l => l.stock_item_id === item.id)
                        if (!line) return null
                        const variance = line.actual_qty - line.expected_qty
                        return (
                          <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '12px 24px', borderTop: '1px solid #f3f4f6' }}>
                            <div style={{ flex: 1 }}><div style={{ fontWeight: 600, fontSize: '14px', color: '#111' }}>{item.name || item.description}</div><div style={{ fontSize: '12px', color: '#9ca3af' }}>{item.unit} • {formatCurrency(item.cost_price ?? item.price ?? 0)}</div></div>
                            <div style={{ fontSize: '12px', color: '#9ca3af', minWidth: '80px', textAlign: 'right' }}>Expected: <strong>{line.expected_qty}</strong></div>
                            <input type="number" min="0" step="0.1" value={line.actual_qty || ''} onChange={e => updateCountLine(line.id, parseFloat(e.target.value) || 0)} placeholder="0" style={{ width: '100px', border: '1.5px solid #e5e7eb', borderRadius: '8px', padding: '8px 10px', fontSize: '14px', fontWeight: 700, textAlign: 'center', outline: 'none' }} />
                            <div style={{ minWidth: '70px', textAlign: 'right', fontSize: '13px', fontWeight: 700, color: variance < 0 ? '#dc2626' : variance > 0 ? '#d97706' : '#9ca3af' }}>{variance === 0 ? '—' : `${variance > 0 ? '+' : ''}${variance.toFixed(1)}`}</div>
                          </div>
                        )
                      })}
                    </div>
                  ))}
                  {uncategorised.map(item => {
                    const line = countLines.find(l => l.stock_item_id === item.id)
                    if (!line) return null
                    const variance = line.actual_qty - line.expected_qty
                    return (
                      <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '12px 24px', borderTop: '1px solid #f3f4f6' }}>
                        <div style={{ flex: 1 }}><div style={{ fontWeight: 600, fontSize: '14px', color: '#111' }}>{item.name || item.description}</div><div style={{ fontSize: '12px', color: '#9ca3af' }}>{item.unit}</div></div>
                        <input type="number" min="0" step="0.1" value={line.actual_qty || ''} onChange={e => updateCountLine(line.id, parseFloat(e.target.value) || 0)} placeholder="0" style={{ width: '100px', border: '1.5px solid #e5e7eb', borderRadius: '8px', padding: '8px 10px', fontSize: '14px', fontWeight: 700, textAlign: 'center', outline: 'none' }} />
                        <div style={{ minWidth: '70px', textAlign: 'right', fontSize: '13px', fontWeight: 700, color: variance < 0 ? '#dc2626' : variance > 0 ? '#d97706' : '#9ca3af' }}>{variance === 0 ? '—' : `${variance > 0 ? '+' : ''}${variance.toFixed(1)}`}</div>
                      </div>
                    )
                  })}
                </div>
              ) : (<>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                  {COUNT_TYPES.map(ct => (
                    <button key={ct.key} onClick={() => startCount(ct.key)} style={{ background: 'white', borderRadius: '20px', border: `2px solid ${ct.color}30`, padding: '24px', textAlign: 'left', cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                      <div style={{ fontSize: '28px', marginBottom: '10px' }}>{ct.key === 'daily' ? '🌅' : ct.key === 'weekly' ? '📅' : '📊'}</div>
                      <div style={{ fontWeight: 800, fontSize: '16px', color: ct.color }}>{ct.label} Count</div>
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
                  {purchases.map(p => (
                    <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '1fr 90px 90px 100px 110px 90px', padding: '14px 20px', borderTop: '1px solid #f3f4f6', alignItems: 'center' }}>
                      <div><div style={{ fontWeight: 700, fontSize: '14px', color: '#111' }}>{p.item_name}</div>{p.supplier_name && <div style={{ fontSize: '12px', color: '#9ca3af' }}>{p.supplier_name}</div>}</div>
                      <div style={{ fontSize: '12px', color: '#6b7280' }}>{formatDate(p.purchase_date)}</div>
                      <div style={{ fontSize: '13px', color: '#374151' }}>{p.quantity} {p.unit}</div>
                      <div style={{ fontSize: '13px', color: '#374151' }}>{formatCurrency(p.unit_cost)}</div>
                      <div style={{ fontSize: '14px', fontWeight: 800, color: '#1a5c38' }}>{formatCurrency(p.total_cost)}</div>
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
          {tab === 'wastage' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div><div style={{ fontSize: '18px', fontWeight: 800, color: '#111' }}>Wastage Log</div><div style={{ fontSize: '13px', color: '#9ca3af' }}>Track expired, damaged or discarded stock</div></div>
                <button onClick={() => setShowAddWastage(true)} style={{ padding: '10px 20px', background: '#dc2626', color: 'white', border: 'none', borderRadius: '10px', fontSize: '13px', fontWeight: 800, cursor: 'pointer' }}>+ Log Wastage</button>
              </div>
              <div style={{ background: 'white', borderRadius: '20px', border: '1.5px solid #eef2ee', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                {wastage.length === 0 ? <div style={{ padding: '48px', textAlign: 'center', color: '#9ca3af' }}>No wastage logged yet</div> : (<>
                  {wastage.map(w => (
                    <div key={w.id} style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '14px 20px', borderTop: '1px solid #f3f4f6' }}>
                      <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', flexShrink: 0 }}>🗑️</div>
                      <div style={{ flex: 1 }}><div style={{ fontWeight: 700, fontSize: '14px', color: '#111' }}>{w.item_name}</div><div style={{ fontSize: '12px', color: '#9ca3af' }}>{w.quantity} {w.unit} • {w.reason} • {formatDate(w.wastage_date)}</div></div>
                      <div style={{ fontWeight: 800, fontSize: '15px', color: '#dc2626' }}>{formatCurrency(w.total_cost)}</div>
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
          {tab === 'items' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div><div style={{ fontSize: '18px', fontWeight: 800, color: '#111' }}>Stock Items</div><div style={{ fontSize: '13px', color: '#9ca3af' }}>Build your stock sheet — add items per category</div></div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button onClick={() => setShowAddCategory(true)} style={{ padding: '10px 18px', background: 'white', color: '#1a5c38', border: '1.5px solid #1a5c38', borderRadius: '10px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>+ Category</button>
                  <button onClick={() => { setEditItem(null); setItemForm({ name: '', category_id: 'goods', unit: 'each', cost_price: '', par_level: '' }); setShowAddItem(true) }} style={{ padding: '10px 18px', background: '#1a5c38', color: 'white', border: 'none', borderRadius: '10px', fontSize: '13px', fontWeight: 800, cursor: 'pointer' }}>+ Add Item</button>
                </div>
              </div>
              {['goods','beverages','packaging','basting','other'].map(catKey => {
                const catLabels: Record<string,string> = { goods: 'Goods', beverages: 'Beverages', packaging: 'Packaging', basting: 'Basting & Sauces', other: 'Other' }
                const catColors: Record<string,string> = { goods: '#16a34a', beverages: '#2563eb', packaging: '#d97706', basting: '#dc2626', other: '#6b7280' }
                const catItems = items.filter(i => i.category === catKey)
                if (!catItems.length) return null
                return (
                  <div key={catKey} style={{ background: 'white', borderRadius: '20px', border: '1.5px solid #eef2ee', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                    <div style={{ padding: '12px 20px', background: '#f9fafb', display: 'flex', alignItems: 'center', gap: '10px', borderBottom: '1px solid #e5e7eb' }}>
                      <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: catColors[catKey] }} />
                      <div style={{ fontWeight: 700, fontSize: '14px', color: '#111' }}>{catLabels[catKey]}</div>
                      <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '100px', background: catColors[catKey] + '20', color: catColors[catKey] }}>{catItems.length}</span>
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead><tr style={{ background: '#fafafa' }}>{['Item', 'Unit', 'Cost Price', 'Par Level', ''].map(h => <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: '11px', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</th>)}</tr></thead>
                      <tbody>
                        {catItems.map(item => (
                          <tr key={item.id} style={{ borderTop: '1px solid #f3f4f6' }}>
                            <td style={{ padding: '12px 16px', fontWeight: 700, fontSize: '14px', color: '#111' }}>{item.name || item.description}</td>
                            <td style={{ padding: '12px 16px', fontSize: '13px', color: '#6b7280' }}>{item.unit}</td>
                            <td style={{ padding: '12px 16px', fontSize: '13px', color: '#374151' }}>{formatCurrency(item.cost_price ?? item.price ?? 0)}</td>
                            <td style={{ padding: '12px 16px', fontSize: '13px', color: '#374151' }}>{item.par_level} {item.unit}</td>
                            <td style={{ padding: '12px 16px' }}>
                              <div style={{ display: 'flex', gap: '6px' }}>
                                <button onClick={() => { setEditItem(item); setItemForm({ name: item.name, category_id: item.category || 'goods', unit: item.unit, cost_price: (item.cost_price ?? item.price ?? 0).toString(), par_level: (item.par_level ?? 0).toString() }); setShowAddItem(true) }} style={{ fontSize: '12px', color: '#1d4ed8', background: '#eff6ff', border: 'none', borderRadius: '8px', padding: '5px 10px', cursor: 'pointer', fontWeight: 600 }}>Edit</button>
                                <button onClick={() => deleteItem(item.id)} style={{ fontSize: '12px', color: '#dc2626', background: '#fee2e2', border: 'none', borderRadius: '8px', padding: '5px 8px', cursor: 'pointer', fontWeight: 700 }}>✕</button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
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
      <Modal show={showAddItem} onClose={() => { setShowAddItem(false); setEditItem(null) }} title={editItem ? 'Edit Item' : 'Add Stock Item'}>
        <div style={{ padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div><label style={LABEL}>Item Name *</label><input value={itemForm.name} onChange={e => setItemForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Chicken Breasts" style={INPUT} /></div>
          <div><label style={LABEL}>Category</label><select value={itemForm.category_id} onChange={e => setItemForm(f => ({ ...f, category_id: e.target.value }))} style={INPUT}><option value="">No category</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
            <div><label style={LABEL}>Unit</label><select value={itemForm.unit} onChange={e => setItemForm(f => ({ ...f, unit: e.target.value }))} style={INPUT}>{UNITS.map(u => <option key={u}>{u}</option>)}</select></div>
            <div><label style={LABEL}>Cost Price (R)</label><input type="number" step="0.01" value={itemForm.cost_price} onChange={e => setItemForm(f => ({ ...f, cost_price: e.target.value }))} placeholder="0.00" style={INPUT} /></div>
            <div><label style={LABEL}>Par Level</label><input type="number" step="0.1" value={itemForm.par_level} onChange={e => setItemForm(f => ({ ...f, par_level: e.target.value }))} placeholder="0" style={INPUT} /></div>
          </div>
        </div>
        <div style={{ padding: '16px 28px 24px', display: 'flex', gap: '12px' }}>
          <button onClick={() => { setShowAddItem(false); setEditItem(null) }} style={{ flex: 1, border: '1.5px solid #e5e7eb', color: '#374151', borderRadius: '12px', padding: '12px', fontSize: '14px', fontWeight: 700, cursor: 'pointer', background: 'white' }}>Cancel</button>
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
            <select value={purchaseForm.stock_item_id} onChange={e => { const item = items.find(i => i.id === e.target.value); setPurchaseForm(f => ({ ...f, stock_item_id: e.target.value, item_name: (item?.name || item?.description) || f.item_name, unit: item?.unit || f.unit, unit_cost: (item?.cost_price ?? item?.price ?? 0).toString() || f.unit_cost })) }} style={INPUT}>
              <option value="">Select from stock list</option>
              {['goods','beverages','packaging','basting','other'].map(cat => <optgroup key={cat} label={cat}>{items.filter(i => i.category === cat).map(i => <option key={i.id} value={i.id}>{i.name || i.description}</option>)}</optgroup>)}
            </select>
          </div>
          <div><label style={LABEL}>Item Name *</label><input value={purchaseForm.item_name} onChange={e => setPurchaseForm(f => ({ ...f, item_name: e.target.value }))} placeholder="or type manually" style={INPUT} /></div>
          <div><label style={LABEL}>Supplier</label><input value={purchaseForm.supplier_name} onChange={e => setPurchaseForm(f => ({ ...f, supplier_name: e.target.value }))} placeholder="e.g. Makro, Pick n Pay" style={INPUT} /></div>
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
          <div><label style={LABEL}>Stock Item</label><select value={wastageForm.stock_item_id} onChange={e => { const item = items.find(i => i.id === e.target.value); setWastageForm(f => ({ ...f, stock_item_id: e.target.value, item_name: (item?.name || item?.description) || '', unit: item?.unit || 'each', unit_cost: (item?.cost_price ?? item?.price ?? 0).toString() || '' })) }} style={INPUT}><option value="">Select item</option>{items.map(i => <option key={i.id} value={i.id}>{i.name || i.description}</option>)}</select></div>
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

      {/* New Order Modal */}
      <Modal show={showAddOrder} onClose={() => setShowAddOrder(false)} title="New Order" maxWidth="440px">
        <div style={{ padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div><label style={LABEL}>Supplier *</label><input value={orderForm.supplier_name} onChange={e => setOrderForm(f => ({ ...f, supplier_name: e.target.value }))} placeholder="e.g. Makro, Rainbow Chicken" style={INPUT} /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div><label style={LABEL}>Order Date</label><input type="date" value={orderForm.order_date} onChange={e => setOrderForm(f => ({ ...f, order_date: e.target.value }))} style={INPUT} /></div>
            <div><label style={LABEL}>Expected Delivery</label><input type="date" value={orderForm.expected_delivery} onChange={e => setOrderForm(f => ({ ...f, expected_delivery: e.target.value }))} style={INPUT} /></div>
          </div>
          <div><label style={LABEL}>Notes</label><textarea value={orderForm.notes} onChange={e => setOrderForm(f => ({ ...f, notes: e.target.value }))} rows={3} style={{ ...INPUT, resize: 'vertical' }} /></div>
        </div>
        <div style={{ padding: '16px 28px 24px', display: 'flex', gap: '12px' }}>
          <button onClick={() => setShowAddOrder(false)} style={{ flex: 1, border: '1.5px solid #e5e7eb', color: '#374151', borderRadius: '12px', padding: '12px', fontSize: '14px', fontWeight: 700, cursor: 'pointer', background: 'white' }}>Cancel</button>
          <button onClick={saveOrder} disabled={saving || !orderForm.supplier_name} style={{ flex: 1, background: !orderForm.supplier_name ? '#d1d5db' : '#1a5c38', color: 'white', border: 'none', borderRadius: '12px', padding: '12px', fontSize: '14px', fontWeight: 800, cursor: 'pointer' }}>Create Order</button>
        </div>
      </Modal>
    </div>
  )
}
