'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

const STORE_ID = '05328298-fc27-4c9f-b091-bb7f6598b601'

type Store = {
  id: string; name: string; city: string; phone: string | null; email: string | null
  address: string | null; logo_url: string | null; registration_number: string | null
  vat_number: string | null; uif_reference: string | null; liquor_licence_number: string | null
  liquor_licence_expiry: string | null; health_cert_number: string | null; health_cert_expiry: string | null
  fire_cert_number: string | null; fire_cert_expiry: string | null; sdl_number: string | null
  paye_number: string | null; coid_number: string | null; bank_name: string | null
  bank_account: string | null; bank_branch: string | null; default_pay_frequency: string | null
  default_uif_rate: number | null; manager_name: string | null; manager_phone: string | null
  manager_email: string | null; opening_time: string | null; closing_time: string | null
  trading_days: string | null
}

type ExpenseCategory = {
  id: string; name: string; key: string; colour: string; sort_order: number; is_active: boolean
}

type ChecklistTemplate = {
  id: string; task_name: string; section: string; sort_order: number
  requires_photo: boolean; is_active: boolean
}

const TABS = [
  { key: 'profile', label: '🏪 Store Profile' },
  { key: 'licences', label: '📋 Licences & Compliance' },
  { key: 'payroll', label: '💰 Payroll Defaults' },
  { key: 'checklist', label: '✅ Checklist Templates' },
  { key: 'categories', label: '🏷️ Expense Categories' },
]

const INPUT = { width: '100%', border: '1.5px solid #e5e7eb', borderRadius: '10px', padding: '10px 12px', fontSize: '14px', outline: 'none', boxSizing: 'border-box' as const, background: '#fff', fontFamily: 'system-ui' }
const LABEL = { display: 'block', fontSize: '12px', fontWeight: '700', color: '#374151', marginBottom: '6px', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }
const SECTION = { fontSize: '13px', fontWeight: '700', color: '#1a5c38', borderBottom: '2px solid #e5e7eb', paddingBottom: '8px', marginBottom: '16px', marginTop: '8px' }

function expiryBadge(dateStr: string | null) {
  if (!dateStr) return null
  const days = Math.floor((new Date(dateStr).getTime() - Date.now()) / 86400000)
  if (days < 0) return { label: `Expired ${Math.abs(days)}d ago`, bg: '#fee2e2', color: '#dc2626' }
  if (days <= 30) return { label: `Expires in ${days}d`, bg: '#fef3c7', color: '#d97706' }
  return { label: `Valid until ${new Date(dateStr).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}`, bg: '#dcfce7', color: '#166534' }
}

export default function SettingsPage() {
  const router = useRouter()
  const [tab, setTab] = useState('profile')
  const [store, setStore] = useState<Store | null>(null)
  const [form, setForm] = useState<Partial<Store>>({})
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [showAddTask, setShowAddTask] = useState(false)
  const [taskForm, setTaskForm] = useState({ task_name: '', section: 'Opening', requires_photo: false })
  const [editTask, setEditTask] = useState<ChecklistTemplate | null>(null)

  const [categories, setCategories] = useState<ExpenseCategory[]>([])
  const [showCatForm, setShowCatForm] = useState(false)
  const [editCat, setEditCat] = useState<ExpenseCategory | null>(null)
  const [catForm, setCatForm] = useState({ name: '', colour: '#10b981' })

  const SECTIONS = [...new Set(templates.map(t => t.section))], 'Opening', 'During Service', 'Closing', 'Cleaning', 'Safety'].filter((v, i, a) => a.indexOf(v) === i)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [storeRes, templRes, catRes] = await Promise.all([
      supabase.from('stores').select('*').eq('id', STORE_ID).single(),
      supabase.from('checklist_templates').select('*').eq('store_id', STORE_ID).order('section').order('sort_order'),
      supabase.from('expense_categories').select('*').eq('organisation_id', 'e903386b-133a-4bad-b054-ef7ef616a3ff').order('sort_order'),
    ])
    if (storeRes.data) { setStore(storeRes.data); setForm(storeRes.data) }
    setTemplates(templRes.data || [])
    setCategories(catRes.data || [])
    setLoading(false)
  }

  async function saveStore() {
    setSaving(true)
    await supabase.from('stores').update(form).eq('id', STORE_ID)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
    setSaving(false)
    loadAll()
  }

  async function saveTask() {
    if (!taskForm.task_name) return
    setSaving(true)
    const maxOrder = templates.filter(t => t.section === taskForm.section).length
    await supabase.from('checklist_templates').insert({
      store_id: STORE_ID, task_name: taskForm.task_name, section: taskForm.section,
      requires_photo: taskForm.requires_photo, sort_order: maxOrder + 1, is_active: true,
    })
    setTaskForm({ task_name: '', section: 'Opening', requires_photo: false })
    setShowAddTask(false)
    await loadAll()
    setSaving(false)
  }

  async function updateTask() {
    if (!editTask) return
    setSaving(true)
    await supabase.from('checklist_templates').update({ task_name: editTask.task_name, section: editTask.section, requires_photo: editTask.requires_photo }).eq('id', editTask.id)
    setEditTask(null)
    await loadAll()
    setSaving(false)
  }

  async function toggleTask(id: string, is_active: boolean) {
    await supabase.from('checklist_templates').update({ is_active: !is_active }).eq('id', id)
    await loadAll()
  }

  async function deleteTask(id: string) {
    if (!confirm('Delete this checklist item?')) return
    await supabase.from('checklist_templates').delete().eq('id', id)
    await loadAll()
  }

  function slugify(name: string) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
  }

  async function saveCat() {
    if (!catForm.name) return
    setSaving(true)
    const key = slugify(catForm.name)
    const maxOrder = categories.length
    if (editCat) {
      await supabase.from('expense_categories').update({ name: catForm.name, colour: catForm.colour }).eq('id', editCat.id)
      setEditCat(null)
    } else {
      await supabase.from('expense_categories').insert({ organisation_id: 'e903386b-133a-4bad-b054-ef7ef616a3ff', name: catForm.name, key, colour: catForm.colour, is_active: true, sort_order: maxOrder + 1 })
    }
    setCatForm({ name: '', colour: '#10b981' })
    setShowCatForm(false)
    await loadAll()
    setSaving(false)
  }

  async function toggleCat(id: string, is_active: boolean) {
    await supabase.from('expense_categories').update({ is_active: !is_active }).eq('id', id)
    await loadAll()
  }

  async function deleteCat(id: string) {
    if (!confirm('Delete this category? Any expenses using it will lose their category link.')) return
    await supabase.from('expense_categories').delete().eq('id', id)
    await loadAll()
  }

  async function moveCat(id: string, direction: 'up' | 'down') {
    const idx = categories.findIndex(c => c.id === id)
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= categories.length) return
    const a = categories[idx], b = categories[swapIdx]
    await Promise.all([
      supabase.from('expense_categories').update({ sort_order: b.sort_order }).eq('id', a.id),
      supabase.from('expense_categories').update({ sort_order: a.sort_order }).eq('id', b.id),
    ])
    await loadAll()
  }

  const f = (key: keyof Store) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(p => ({ ...p, [key]: e.target.value || null }))

  const grouped = SECTIONS.reduce((acc, sec) => {
    const items = templates.filter(t => t.section === sec)
    if (items.length) acc[sec] = items
    return acc
  }, {} as Record<string, ChecklistTemplate[]>)

  return (
    <div style={{ minHeight: '100vh', background: '#f0f4f0', fontFamily: 'system-ui, sans-serif' }}>

      {/* Header */}
      <header style={{ background: 'linear-gradient(135deg, #0a1f12 0%, #1a5c38 100%)', position: 'sticky', top: 0, zIndex: 10, padding: '0 40px' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '72px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M3 10L8 15L17 6" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
            <div>
              <div style={{ fontWeight: '800', fontSize: '16px', color: 'white' }}>CompliTrack</div>
              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.55)' }}>Settings</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            {saved && <span style={{ background: '#dcfce7', color: '#166534', padding: '6px 14px', borderRadius: '10px', fontSize: '13px', fontWeight: '700' }}>✓ Saved</span>}
            <button onClick={() => router.push('/dashboard')} style={{ padding: '8px 16px', border: '1.5px solid rgba(255,255,255,0.4)', borderRadius: '10px', fontSize: '13px', fontWeight: '700', color: 'white', background: 'rgba(255,255,255,0.15)', cursor: 'pointer' }}>← Dashboard</button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <div style={{ background: 'linear-gradient(135deg, #0a1f12 0%, #1a5c38 100%)', padding: '40px 40px 100px' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <h1 style={{ fontSize: '32px', fontWeight: '800', color: 'white', margin: '0 0 6px', letterSpacing: '-0.5px' }}>Settings ⚙️</h1>
          <p style={{ fontSize: '15px', color: 'rgba(255,255,255,0.6)', margin: 0 }}>Store profile, licences, payroll defaults and checklist management</p>
        </div>
      </div>

      <main style={{ maxWidth: '1100px', margin: '-60px auto 0', padding: '0 40px 60px', position: 'relative', zIndex: 1 }}>

        {/* Tabs */}
        <div style={{ background: 'white', borderRadius: '16px', padding: '6px', display: 'inline-flex', gap: '4px', marginBottom: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{ padding: '10px 20px', borderRadius: '10px', fontSize: '13px', fontWeight: '700', cursor: 'pointer', border: 'none', background: tab === t.key ? '#1a5c38' : 'transparent', color: tab === t.key ? '#fff' : '#6b7280' }}>
              {t.label}
            </button>
          ))}
        </div>

        {loading ? <div style={{ textAlign: 'center', padding: '60px', color: '#9ca3af' }}>Loading...</div> : (<>

          {/* ── STORE PROFILE ── */}
          {tab === 'profile' && (
            <div style={{ background: 'white', borderRadius: '20px', border: '1.5px solid #eef2ee', padding: '32px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

                <div style={SECTION}>Store Information</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div><label style={LABEL}>Store Name *</label><input value={form.name || ''} onChange={f('name')} style={INPUT} /></div>
                  <div><label style={LABEL}>City</label><input value={form.city || ''} onChange={f('city')} placeholder="e.g. Hartswater" style={INPUT} /></div>
                </div>
                <div><label style={LABEL}>Address</label><input value={form.address || ''} onChange={f('address')} placeholder="Full street address" style={INPUT} /></div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div><label style={LABEL}>Phone</label><input value={form.phone || ''} onChange={f('phone')} placeholder="+27 53 000 0000" style={INPUT} /></div>
                  <div><label style={LABEL}>Email</label><input type="email" value={form.email || ''} onChange={f('email')} placeholder="store@email.com" style={INPUT} /></div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                  <div><label style={LABEL}>Opening Time</label><input type="time" value={form.opening_time || ''} onChange={f('opening_time')} style={INPUT} /></div>
                  <div><label style={LABEL}>Closing Time</label><input type="time" value={form.closing_time || ''} onChange={f('closing_time')} style={INPUT} /></div>
                  <div><label style={LABEL}>Trading Days</label><input value={form.trading_days || ''} onChange={f('trading_days')} placeholder="Mon-Sun" style={INPUT} /></div>
                </div>

                <div style={SECTION}>Management</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                  <div><label style={LABEL}>Manager Name</label><input value={form.manager_name || ''} onChange={f('manager_name')} style={INPUT} /></div>
                  <div><label style={LABEL}>Manager Phone</label><input value={form.manager_phone || ''} onChange={f('manager_phone')} style={INPUT} /></div>
                  <div><label style={LABEL}>Manager Email</label><input type="email" value={form.manager_email || ''} onChange={f('manager_email')} style={INPUT} /></div>
                </div>

                <div style={SECTION}>Business Registration</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div><label style={LABEL}>Company Reg Number</label><input value={form.registration_number || ''} onChange={f('registration_number')} placeholder="e.g. 2020/123456/07" style={INPUT} /></div>
                  <div><label style={LABEL}>VAT Number</label><input value={form.vat_number || ''} onChange={f('vat_number')} placeholder="e.g. 4123456789" style={INPUT} /></div>
                  <div><label style={LABEL}>PAYE Number</label><input value={form.paye_number || ''} onChange={f('paye_number')} placeholder="e.g. 7123456789" style={INPUT} /></div>
                  <div><label style={LABEL}>SDL Number</label><input value={form.sdl_number || ''} onChange={f('sdl_number')} placeholder="SDL number" style={INPUT} /></div>
                  <div><label style={LABEL}>UIF Reference</label><input value={form.uif_reference || ''} onChange={f('uif_reference')} placeholder="UIF employer ref" style={INPUT} /></div>
                  <div><label style={LABEL}>COID Number</label><input value={form.coid_number || ''} onChange={f('coid_number')} placeholder="Compensation fund ref" style={INPUT} /></div>
                </div>

                <div style={SECTION}>Banking Details</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                  <div><label style={LABEL}>Bank Name</label><input value={form.bank_name || ''} onChange={f('bank_name')} placeholder="e.g. FNB" style={INPUT} /></div>
                  <div><label style={LABEL}>Branch Code</label><input value={form.bank_branch || ''} onChange={f('bank_branch')} placeholder="e.g. 250655" style={INPUT} /></div>
                  <div><label style={LABEL}>Account Number</label><input value={form.bank_account || ''} onChange={f('bank_account')} style={INPUT} /></div>
                </div>

                <button onClick={saveStore} disabled={saving} style={{ alignSelf: 'flex-start', padding: '12px 32px', background: saving ? '#d1d5db' : '#1a5c38', color: 'white', border: 'none', borderRadius: '12px', fontSize: '14px', fontWeight: '800', cursor: saving ? 'not-allowed' : 'pointer' }}>
                  {saving ? 'Saving...' : 'Save Store Profile'}
                </button>
              </div>
            </div>
          )}

          {/* ── LICENCES ── */}
          {tab === 'licences' && (
            <div style={{ background: 'white', borderRadius: '20px', border: '1.5px solid #eef2ee', padding: '32px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

                {/* Licence status overview */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                  {[
                    { label: 'Liquor Licence', expiry: form.liquor_licence_expiry },
                    { label: 'Health Certificate', expiry: form.health_cert_expiry },
                    { label: 'Fire Certificate', expiry: form.fire_cert_expiry },
                  ].map(item => {
                    const badge = expiryBadge(item.expiry || null)
                    return (
                      <div key={item.label} style={{ background: '#f9fafb', borderRadius: '12px', padding: '14px 16px', border: '1px solid #e5e7eb' }}>
                        <div style={{ fontSize: '12px', fontWeight: '700', color: '#6b7280', marginBottom: '6px' }}>{item.label}</div>
                        {badge
                          ? <span style={{ fontSize: '11px', fontWeight: '700', padding: '3px 10px', borderRadius: '100px', background: badge.bg, color: badge.color }}>{badge.label}</span>
                          : <span style={{ fontSize: '11px', color: '#d1d5db' }}>Not set</span>
                        }
                      </div>
                    )
                  })}
                </div>

                <div style={SECTION}>Liquor Licence</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div><label style={LABEL}>Licence Number</label><input value={form.liquor_licence_number || ''} onChange={f('liquor_licence_number')} placeholder="Liquor licence number" style={INPUT} /></div>
                  <div><label style={LABEL}>Expiry Date</label><input type="date" value={form.liquor_licence_expiry || ''} onChange={f('liquor_licence_expiry')} style={INPUT} /></div>
                </div>

                <div style={SECTION}>Health Certificate</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div><label style={LABEL}>Certificate Number</label><input value={form.health_cert_number || ''} onChange={f('health_cert_number')} placeholder="Health cert number" style={INPUT} /></div>
                  <div><label style={LABEL}>Expiry Date</label><input type="date" value={form.health_cert_expiry || ''} onChange={f('health_cert_expiry')} style={INPUT} /></div>
                </div>

                <div style={SECTION}>Fire Safety Certificate</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div><label style={LABEL}>Certificate Number</label><input value={form.fire_cert_number || ''} onChange={f('fire_cert_number')} placeholder="Fire cert number" style={INPUT} /></div>
                  <div><label style={LABEL}>Expiry Date</label><input type="date" value={form.fire_cert_expiry || ''} onChange={f('fire_cert_expiry')} style={INPUT} /></div>
                </div>

                <div style={{ background: '#eff6ff', borderRadius: '12px', padding: '14px 18px', fontSize: '13px', color: '#1e40af' }}>
                  💡 Upload the actual certificate documents in the <strong>Store Documents</strong> section. Use this page to track expiry dates for quick visibility.
                </div>

                <button onClick={saveStore} disabled={saving} style={{ alignSelf: 'flex-start', padding: '12px 32px', background: saving ? '#d1d5db' : '#1a5c38', color: 'white', border: 'none', borderRadius: '12px', fontSize: '14px', fontWeight: '800', cursor: saving ? 'not-allowed' : 'pointer' }}>
                  {saving ? 'Saving...' : 'Save Licence Details'}
                </button>
              </div>
            </div>
          )}

          {/* ── PAYROLL DEFAULTS ── */}
          {tab === 'payroll' && (
            <div style={{ background: 'white', borderRadius: '20px', border: '1.5px solid #eef2ee', padding: '32px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <div style={SECTION}>Default Payroll Settings</div>
                <div style={{ fontSize: '13px', color: '#9ca3af', marginTop: '-16px' }}>These defaults apply when setting up new employees. They can be overridden per employee in the Wages module.</div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={LABEL}>Default Pay Frequency</label>
                    <select value={form.default_pay_frequency || 'monthly'} onChange={f('default_pay_frequency')} style={INPUT}>
                      <option value="weekly">Weekly</option>
                      <option value="biweekly">Bi-weekly</option>
                      <option value="monthly">Monthly</option>
                    </select>
                  </div>
                  <div>
                    <label style={LABEL}>Default UIF Rate (%)</label>
                    <input type="number" step="0.01" value={((form.default_uif_rate || 0.01) * 100).toFixed(2)} onChange={e => setForm(p => ({ ...p, default_uif_rate: parseFloat(e.target.value) / 100 }))} placeholder="1.00" style={INPUT} />
                    <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>Standard is 1% employee + 1% employer. Total UIF = 2%</div>
                  </div>
                </div>

                <div style={{ background: '#f0fdf4', borderRadius: '12px', padding: '16px 20px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                  {[
                    { label: 'Employee UIF', value: `${((form.default_uif_rate || 0.01) * 100).toFixed(2)}%` },
                    { label: 'Employer UIF', value: `${((form.default_uif_rate || 0.01) * 100).toFixed(2)}%` },
                    { label: 'Total UIF', value: `${((form.default_uif_rate || 0.01) * 100 * 2).toFixed(2)}%` },
                  ].map(item => (
                    <div key={item.label} style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '20px', fontWeight: '800', color: '#1a5c38' }}>{item.value}</div>
                      <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>{item.label}</div>
                    </div>
                  ))}
                </div>

                <div style={{ background: '#fef3c7', borderRadius: '12px', padding: '14px 18px', fontSize: '13px', color: '#92400e' }}>
                  ⚠️ <strong>PAYE (income tax)</strong> varies per employee based on their annual earnings. Set PAYE per employee in the Wages module under Settings tab.
                </div>

                <button onClick={saveStore} disabled={saving} style={{ alignSelf: 'flex-start', padding: '12px 32px', background: saving ? '#d1d5db' : '#1a5c38', color: 'white', border: 'none', borderRadius: '12px', fontSize: '14px', fontWeight: '800', cursor: saving ? 'not-allowed' : 'pointer' }}>
                  {saving ? 'Saving...' : 'Save Payroll Defaults'}
                </button>
              </div>
            </div>
          )}

          {/* ── CHECKLIST TEMPLATES ── */}
          {tab === 'checklist' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '18px', fontWeight: '800', color: '#111' }}>Checklist Templates</div>
                  <div style={{ fontSize: '13px', color: '#9ca3af', marginTop: '2px' }}>Manage the daily compliance checklist tasks. Changes apply from the next session.</div>
                </div>
                <button onClick={() => setShowAddTask(true)} style={{ padding: '10px 20px', background: '#1a5c38', color: 'white', border: 'none', borderRadius: '10px', fontSize: '13px', fontWeight: '800', cursor: 'pointer' }}>+ Add Task</button>
              </div>

              <div style={{ background: 'white', borderRadius: '12px', border: '1.5px solid #eef2ee', padding: '14px 18px', display: 'flex', gap: '24px', fontSize: '13px', color: '#6b7280' }}>
                <span>📊 <strong style={{ color: '#111' }}>{templates.length}</strong> total tasks</span>
                <span>✅ <strong style={{ color: '#166534' }}>{templates.filter(t => t.is_active).length}</strong> active</span>
                <span>⏸ <strong style={{ color: '#6b7280' }}>{templates.filter(t => !t.is_active).length}</strong> inactive</span>
                <span>📸 <strong style={{ color: '#1d4ed8' }}>{templates.filter(t => t.requires_photo).length}</strong> require photo</span>
              </div>

              {Object.entries(grouped).map(([section, items]) => (
                <div key={section} style={{ background: 'white', borderRadius: '20px', border: '1.5px solid #eef2ee', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                  <div style={{ background: '#f0f4f0', padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ fontWeight: '700', color: '#1a5c38', fontSize: '14px' }}>{section}</div>
                    <span style={{ fontSize: '11px', fontWeight: '700', background: 'rgba(26,92,56,0.1)', color: '#1a5c38', padding: '3px 10px', borderRadius: '100px' }}>{items.length} task{items.length !== 1 ? 's' : ''}</span>
                  </div>
                  <div style={{ padding: '8px 0' }}>
                    {items.map(task => (
                      <div key={task.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 20px', borderBottom: '1px solid #f9fafb', opacity: task.is_active ? 1 : 0.5 }}>
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: task.is_active ? '#16a34a' : '#d1d5db', flexShrink: 0 }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '14px', fontWeight: '600', color: '#111' }}>{task.task_name}</div>
                          <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '2px', display: 'flex', gap: '8px' }}>
                            {task.requires_photo && <span style={{ color: '#1d4ed8', fontWeight: '600' }}>📸 Photo required</span>}
                            <span>Sort: {task.sort_order}</span>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                          <button onClick={() => setEditTask(task)} style={{ fontSize: '12px', color: '#1d4ed8', background: '#eff6ff', border: 'none', borderRadius: '8px', padding: '5px 10px', cursor: 'pointer', fontWeight: '600' }}>Edit</button>
                          <button onClick={() => toggleTask(task.id, task.is_active)} style={{ fontSize: '12px', color: task.is_active ? '#d97706' : '#166534', background: task.is_active ? '#fef3c7' : '#dcfce7', border: 'none', borderRadius: '8px', padding: '5px 10px', cursor: 'pointer', fontWeight: '600' }}>
                            {task.is_active ? 'Disable' : 'Enable'}
                          </button>
                          <button onClick={() => deleteTask(task.id)} style={{ fontSize: '12px', color: '#dc2626', background: '#fee2e2', border: 'none', borderRadius: '8px', padding: '5px 8px', cursor: 'pointer', fontWeight: '700' }}>✕</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {templates.length === 0 && (
                <div style={{ background: 'white', borderRadius: '20px', border: '1.5px solid #eef2ee', padding: '48px', textAlign: 'center', color: '#9ca3af' }}>
                  <div style={{ fontSize: '48px', marginBottom: '12px' }}>✅</div>
                  <div style={{ fontWeight: '700', color: '#111', marginBottom: '6px' }}>No checklist templates yet</div>
                  <div style={{ fontSize: '13px' }}>Add tasks to build your daily compliance checklist</div>
                </div>
              )}
            </div>
          )}
        </>)}

        <div style={{ marginTop: '48px', textAlign: 'center' }}>
          <p style={{ fontSize: '12px', color: '#9ca3af' }}>CompliTrack © 2026 • Store Management Platform • South Africa 🇿🇦</p>
        </div>

          {tab === 'categories' && (
            <div style={{ background: 'white', borderRadius: '20px', padding: '32px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <div>
                  <h2 style={{ fontSize: '20px', fontWeight: '800', color: '#111', margin: '0 0 4px' }}>Expense Categories</h2>
                  <p style={{ fontSize: '13px', color: '#6b7280', margin: 0 }}>Manage categories used for supplier bills and quick expenses. Changes apply immediately across all financial entries.</p>
                </div>
                <button onClick={() => { setEditCat(null); setCatForm({ name: '', colour: '#10b981' }); setShowCatForm(true) }}
                  style={{ background: '#1a5c38', color: '#fff', border: 'none', borderRadius: '10px', padding: '10px 18px', cursor: 'pointer', fontSize: '14px', fontWeight: '700' }}>
                  + Add Category
                </button>
              </div>

              {showCatForm && (
                <div style={{ background: '#f9fafb', border: '2px solid #1a5c38', borderRadius: '12px', padding: '20px', marginBottom: '20px' }}>
                  <h3 style={{ margin: '0 0 16px', fontSize: '15px', fontWeight: '700' }}>{editCat ? 'Edit Category' : 'New Category'}</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '12px', alignItems: 'end' }}>
                    <div>
                      <label style={LABEL}>Category Name *</label>
                      <input type="text" placeholder="e.g. Royalties, Cleaning, Gas" value={catForm.name}
                        onChange={e => setCatForm(f => ({ ...f, name: e.target.value }))} style={INPUT} />
                    </div>
                    <div>
                      <label style={LABEL}>Colour</label>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <input type="color" value={catForm.colour} onChange={e => setCatForm(f => ({ ...f, colour: e.target.value }))}
                          style={{ width: '44px', height: '44px', border: '1.5px solid #e5e7eb', borderRadius: '8px', cursor: 'pointer', padding: '2px' }} />
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', maxWidth: '200px' }}>
                          {['#10b981','#ef4444','#3b82f6','#f59e0b','#8b5cf6','#06b6d4','#f97316','#ec4899','#84cc16','#6b7280'].map(c => (
                            <div key={c} onClick={() => setCatForm(f => ({ ...f, colour: c }))}
                              style={{ width: '20px', height: '20px', borderRadius: '4px', background: c, cursor: 'pointer', border: catForm.colour === c ? '2px solid #111' : '2px solid transparent' }} />
                          ))}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button onClick={saveCat} disabled={saving || !catForm.name}
                        style={{ background: catForm.name ? '#1a5c38' : '#d1d5db', color: '#fff', border: 'none', borderRadius: '10px', padding: '10px 16px', cursor: catForm.name ? 'pointer' : 'not-allowed', fontSize: '14px', fontWeight: '700' }}>
                        {saving ? 'Saving…' : 'Save'}
                      </button>
                      <button onClick={() => { setShowCatForm(false); setEditCat(null) }}
                        style={{ background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: '10px', padding: '10px 16px', cursor: 'pointer', fontSize: '14px', fontWeight: '700' }}>
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {categories.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '48px', color: '#6b7280' }}>
                  <div style={{ fontSize: '40px', marginBottom: '8px' }}>🏷️</div>
                  <p>No categories yet. Click &quot;Add Category&quot; to create your first one.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {categories.map((cat, idx) => (
                    <div key={cat.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', background: cat.is_active ? '#fff' : '#f9fafb', border: '1.5px solid #e5e7eb', borderRadius: '10px', opacity: cat.is_active ? 1 : 0.6 }}>
                      <div style={{ width: '18px', height: '18px', borderRadius: '4px', background: cat.colour, flexShrink: 0 }} />
                      <span style={{ fontWeight: '600', fontSize: '14px', flex: 1 }}>{cat.name}</span>
                      <span style={{ fontSize: '11px', color: '#9ca3af', fontFamily: 'monospace' }}>{cat.key}</span>
                      {!cat.is_active && <span style={{ background: '#f3f4f6', color: '#6b7280', fontSize: '11px', fontWeight: '700', padding: '2px 8px', borderRadius: '20px' }}>Inactive</span>}
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button onClick={() => moveCat(cat.id, 'up')} disabled={idx === 0}
                          style={{ background: '#f3f4f6', border: 'none', borderRadius: '6px', padding: '4px 8px', cursor: idx === 0 ? 'not-allowed' : 'pointer', opacity: idx === 0 ? 0.4 : 1, fontSize: '12px' }}>▲</button>
                        <button onClick={() => moveCat(cat.id, 'down')} disabled={idx === categories.length - 1}
                          style={{ background: '#f3f4f6', border: 'none', borderRadius: '6px', padding: '4px 8px', cursor: idx === categories.length - 1 ? 'not-allowed' : 'pointer', opacity: idx === categories.length - 1 ? 0.4 : 1, fontSize: '12px' }}>▼</button>
                        <button onClick={() => { setEditCat(cat); setCatForm({ name: cat.name, colour: cat.colour }); setShowCatForm(true) }}
                          style={{ background: '#eff6ff', color: '#2563eb', border: 'none', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>Edit</button>
                        <button onClick={() => toggleCat(cat.id, cat.is_active)}
                          style={{ background: cat.is_active ? '#fffbeb' : '#f0fdf4', color: cat.is_active ? '#d97706' : '#16a34a', border: 'none', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>
                          {cat.is_active ? 'Disable' : 'Enable'}
                        </button>
                        <button onClick={() => deleteCat(cat.id)}
                          style={{ background: '#fef2f2', color: '#dc2626', border: 'none', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>Del</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

      </main>

      {/* Add Task Modal */}
      {showAddTask && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '16px' }}>
          <div style={{ background: 'white', borderRadius: '24px', width: '100%', maxWidth: '440px', boxShadow: '0 24px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ padding: '24px 28px 16px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '800', color: '#111', margin: 0 }}>Add Checklist Task</h2>
              <button onClick={() => setShowAddTask(false)} style={{ background: '#f3f4f6', border: 'none', borderRadius: '8px', width: '32px', height: '32px', cursor: 'pointer', fontSize: '16px' }}>✕</button>
            </div>
            <div style={{ padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={LABEL}>Task Name *</label>
                <input value={taskForm.task_name} onChange={e => setTaskForm(f => ({ ...f, task_name: e.target.value }))} placeholder="e.g. Check fridge temperatures" style={INPUT} />
              </div>
              <div>
                <label style={LABEL}>Section</label>
                <select value={taskForm.section} onChange={e => setTaskForm(f => ({ ...f, section: e.target.value }))} style={INPUT}>
                  {['Opening', 'During Service', 'Closing', 'Cleaning', 'Safety', 'Other'].map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 14px', background: '#f9fafb', borderRadius: '10px', cursor: 'pointer' }} onClick={() => setTaskForm(f => ({ ...f, requires_photo: !f.requires_photo }))}>
                <div style={{ width: '20px', height: '20px', borderRadius: '4px', border: '2px solid #1a5c38', background: taskForm.requires_photo ? '#1a5c38' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {taskForm.requires_photo && <span style={{ color: 'white', fontSize: '12px' }}>✓</span>}
                </div>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: '600', color: '#111' }}>Requires photo</div>
                  <div style={{ fontSize: '12px', color: '#9ca3af' }}>Staff must upload a photo to complete this task</div>
                </div>
              </div>
            </div>
            <div style={{ padding: '16px 28px 24px', display: 'flex', gap: '12px' }}>
              <button onClick={() => setShowAddTask(false)} style={{ flex: 1, border: '1.5px solid #e5e7eb', color: '#374151', borderRadius: '12px', padding: '12px', fontSize: '14px', fontWeight: '700', cursor: 'pointer', background: 'white' }}>Cancel</button>
              <button onClick={saveTask} disabled={saving || !taskForm.task_name} style={{ flex: 1, background: !taskForm.task_name ? '#d1d5db' : '#1a5c38', color: 'white', border: 'none', borderRadius: '12px', padding: '12px', fontSize: '14px', fontWeight: '800', cursor: !taskForm.task_name ? 'not-allowed' : 'pointer' }}>Add Task</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Task Modal */}
      {editTask && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '16px' }}>
          <div style={{ background: 'white', borderRadius: '24px', width: '100%', maxWidth: '440px', boxShadow: '0 24px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ padding: '24px 28px 16px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '800', color: '#111', margin: 0 }}>Edit Task</h2>
              <button onClick={() => setEditTask(null)} style={{ background: '#f3f4f6', border: 'none', borderRadius: '8px', width: '32px', height: '32px', cursor: 'pointer', fontSize: '16px' }}>✕</button>
            </div>
            <div style={{ padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={LABEL}>Task Name *</label>
                <input value={editTask.task_name} onChange={e => setEditTask(t => t ? ({ ...t, task_name: e.target.value }) : t)} style={INPUT} />
              </div>
              <div>
                <label style={LABEL}>Section</label>
                <select value={editTask.section} onChange={e => setEditTask(t => t ? ({ ...t, section: e.target.value }) : t)} style={INPUT}>
                  {['Opening', 'During Service', 'Closing', 'Cleaning', 'Safety', 'Other'].map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 14px', background: '#f9fafb', borderRadius: '10px', cursor: 'pointer' }} onClick={() => setEditTask(t => t ? ({ ...t, requires_photo: !t.requires_photo }) : t)}>
                <div style={{ width: '20px', height: '20px', borderRadius: '4px', border: '2px solid #1a5c38', background: editTask.requires_photo ? '#1a5c38' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {editTask.requires_photo && <span style={{ color: 'white', fontSize: '12px' }}>✓</span>}
                </div>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: '600', color: '#111' }}>Requires photo</div>
                  <div style={{ fontSize: '12px', color: '#9ca3af' }}>Staff must upload a photo to complete this task</div>
                </div>
              </div>
            </div>
            <div style={{ padding: '16px 28px 24px', display: 'flex', gap: '12px' }}>
              <button onClick={() => setEditTask(null)} style={{ flex: 1, border: '1.5px solid #e5e7eb', color: '#374151', borderRadius: '12px', padding: '12px', fontSize: '14px', fontWeight: '700', cursor: 'pointer', background: 'white' }}>Cancel</button>
              <button onClick={updateTask} disabled={saving} style={{ flex: 1, background: '#1a5c38', color: 'white', border: 'none', borderRadius: '12px', padding: '12px', fontSize: '14px', fontWeight: '800', cursor: 'pointer' }}>Save Changes</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
