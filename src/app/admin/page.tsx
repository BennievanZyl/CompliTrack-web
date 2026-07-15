'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

const PRIMARY = '#1a5c38'
const DARK = '#0a1f12'

const PAYMENT_STATUS = {
  active: { label: 'Active', color: '#16a34a', bg: '#f0fdf4' },
  overdue: { label: 'Overdue', color: '#d97706', bg: '#fffbeb' },
  suspended: { label: 'Suspended', color: '#dc2626', bg: '#fef2f2' },
  cancelled: { label: 'Cancelled', color: '#6b7280', bg: '#f9fafb' },
}

const INDUSTRIES = {
  restaurant: '🍕', guest_house: '🏨', retail: '🛒',
  salon: '💇', clinic: '🏥', car_wash: '🚗', other: '🏢'
}

export default function PlatformAdminPage() {
  const router = useRouter()
  const [clients, setClients] = useState<any[]>([])
  const [leads, setLeads] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'clients' | 'leads' | 'new'>('clients')
  const [showNewClient, setShowNewClient] = useState(false)
  const [editClient, setEditClient] = useState<any | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    client_name: '', contact_name: '', contact_phone: '',
    contact_email: '', industry: 'restaurant', monthly_fee: '',
    payment_status: 'active', next_payment_date: '', notes: ''
  })

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: profile } = await supabase.from('profiles')
        .select('platform_admin').eq('id', user.id).single()
      if (!profile?.platform_admin) { router.push('/dashboard'); return }

      const [{ data: c }, { data: l }] = await Promise.all([
        supabase.from('platform_clients').select('*').order('created_at', { ascending: false }),
        supabase.from('leads').select('*').order('created_at', { ascending: false }),
      ])
      setClients(c || [])
      setLeads(l || [])
      setLoading(false)
    }
    load()
  }, [router])

  function openEdit(client: any) {
    setEditClient(client)
    setForm({
      client_name: client.client_name || '',
      contact_name: client.contact_name || '',
      contact_phone: client.contact_phone || '',
      contact_email: client.contact_email || '',
      industry: client.industry || 'restaurant',
      monthly_fee: String(client.monthly_fee || ''),
      payment_status: client.payment_status || 'active',
      next_payment_date: client.next_payment_date || '',
      notes: client.notes || '',
    })
    setShowNewClient(true)
    setActiveTab('clients')
  }

  function openNew() {
    setEditClient(null)
    setForm({ client_name: '', contact_name: '', contact_phone: '', contact_email: '', industry: 'restaurant', monthly_fee: '', payment_status: 'active', next_payment_date: '', notes: '' })
    setShowNewClient(true)
  }

  async function saveClient() {
    setSaving(true)
    const payload = { ...form, monthly_fee: parseFloat(form.monthly_fee) || 0 }
    if (editClient) {
      await supabase.from('platform_clients').update(payload).eq('id', editClient.id)
      setClients(c => c.map(x => x.id === editClient.id ? { ...x, ...payload } : x))
    } else {
      const { data } = await supabase.from('platform_clients').insert(payload).select().single()
      if (data) setClients(c => [data, ...c])
    }
    setShowNewClient(false)
    setSaving(false)
  }

  async function updateStatus(id: string, status: string) {
    await supabase.from('platform_clients').update({ payment_status: status }).eq('id', id)
    setClients(c => c.map(x => x.id === id ? { ...x, payment_status: status } : x))
  }

  async function updateLeadStatus(id: string, status: string) {
    await supabase.from('leads').update({ status }).eq('id', id)
    setLeads(l => l.map(x => x.id === id ? { ...x, status } : x))
  }

  const totalMRR = clients.filter(c => c.payment_status === 'active').reduce((s, c) => s + (c.monthly_fee || 0), 0)
  const overdue = clients.filter(c => c.payment_status === 'overdue').length
  const newLeads = leads.filter(l => l.status === 'new').length

  const inp: React.CSSProperties = { width: '100%', padding: '10px 14px', border: '1.5px solid #e5e7eb', borderRadius: 10, fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }
  const label: React.CSSProperties = { fontSize: 13, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 6 }

  return (
    <div style={{ minHeight: '100vh', background: '#f8faf8', fontFamily: 'system-ui, sans-serif' }}>
      {/* Header */}
      <div style={{ background: `linear-gradient(135deg, ${DARK}, ${PRIMARY})`, padding: '0 24px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '20px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 }}>Platform Admin</div>
            <div style={{ color: '#fff', fontWeight: 900, fontSize: 24 }}>CompliTrack HQ</div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={openNew} style={{ background: '#fff', color: PRIMARY, border: 'none', borderRadius: 12, padding: '10px 20px', cursor: 'pointer', fontWeight: 700, fontSize: 14 }}>+ New Client</button>
            <button onClick={() => supabase.auth.signOut().then(() => router.push('/login'))} style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', border: '1.5px solid rgba(255,255,255,0.2)', borderRadius: 12, padding: '10px 16px', cursor: 'pointer', fontWeight: 600, fontSize: 14 }}>Sign Out</button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px' }}>
        {/* KPI cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 32 }}>
          {[
            { label: 'Total Clients', value: clients.length, color: PRIMARY, bg: '#f0fdf4' },
            { label: 'Monthly Revenue', value: `R ${totalMRR.toLocaleString('en-ZA')}`, color: '#1d4ed8', bg: '#eff6ff' },
            { label: 'Overdue', value: overdue, color: '#dc2626', bg: '#fef2f2' },
            { label: 'New Leads', value: newLeads, color: '#d97706', bg: '#fffbeb' },
          ].map(k => (
            <div key={k.label} style={{ background: k.bg, borderRadius: 16, padding: '20px 24px', border: `1.5px solid ${k.color}20` }}>
              <div style={{ fontSize: 12, color: k.color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>{k.label}</div>
              <div style={{ fontSize: 28, fontWeight: 900, color: k.color }}>{k.value}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: '#f3f4f6', borderRadius: 12, padding: 4, width: 'fit-content' }}>
          {[['clients', `Clients (${clients.length})`], ['leads', `Leads (${newLeads} new)`]].map(([t, l]) => (
            <button key={t} onClick={() => setActiveTab(t as any)}
              style={{ padding: '8px 20px', borderRadius: 10, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 14, background: activeTab === t ? '#fff' : 'transparent', color: activeTab === t ? '#111' : '#6b7280', boxShadow: activeTab === t ? '0 1px 4px rgba(0,0,0,0.08)' : 'none' }}>
              {l}
            </button>
          ))}
        </div>

        {/* Clients Tab */}
        {activeTab === 'clients' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {loading ? <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af' }}>Loading…</div>
              : clients.length === 0 ? (
                <div style={{ background: '#fff', borderRadius: 20, padding: 60, textAlign: 'center', border: '1.5px solid #eef2ee' }}>
                  <div style={{ fontSize: 48, marginBottom: 12 }}>🏢</div>
                  <div style={{ fontWeight: 700, color: '#374151', fontSize: 16 }}>No clients yet</div>
                  <div style={{ color: '#9ca3af', marginTop: 8 }}>Add your first client above</div>
                </div>
              ) : clients.map(client => {
                const st = PAYMENT_STATUS[client.payment_status as keyof typeof PAYMENT_STATUS] || PAYMENT_STATUS.active
                return (
                  <div key={client.id} style={{ background: '#fff', borderRadius: 16, border: '1.5px solid #eef2ee', padding: '18px 24px', display: 'flex', alignItems: 'center', gap: 16, boxShadow: '0 2px 6px rgba(0,0,0,0.04)' }}>
                    <div style={{ fontSize: 32 }}>{INDUSTRIES[client.industry as keyof typeof INDUSTRIES] || '🏢'}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 800, fontSize: 16, color: '#111', marginBottom: 2 }}>{client.client_name}</div>
                      <div style={{ fontSize: 13, color: '#6b7280' }}>
                        {client.contact_name && `${client.contact_name} · `}
                        {client.contact_phone && `${client.contact_phone} · `}
                        R{(client.monthly_fee || 0).toLocaleString('en-ZA')}/mo
                        {client.next_payment_date && ` · Next: ${new Date(client.next_payment_date).toLocaleDateString('en-ZA')}`}
                      </div>
                    </div>
                    {/* Status badge */}
                    <div style={{ background: st.bg, color: st.color, borderRadius: 20, padding: '4px 12px', fontWeight: 700, fontSize: 12 }}>{st.label}</div>
                    {/* Quick status change */}
                    <select value={client.payment_status} onChange={e => updateStatus(client.id, e.target.value)}
                      style={{ padding: '6px 10px', border: '1.5px solid #e5e7eb', borderRadius: 8, fontSize: 13, cursor: 'pointer', outline: 'none' }}>
                      <option value="active">✅ Active</option>
                      <option value="overdue">⚠️ Overdue</option>
                      <option value="suspended">🚫 Suspend</option>
                      <option value="cancelled">❌ Cancel</option>
                    </select>
                    {client.organisation_id && (
                      <button onClick={() => router.push(`/org?org=${client.organisation_id}`)}
                        style={{ background: DARK, color: '#fff', border: 'none', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
                        Open →
                      </button>
                    )}
                    <button onClick={() => openEdit(client)} style={{ background: '#f0fdf4', color: PRIMARY, border: `1.5px solid #bbf7d0`, borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>Edit</button>
                  </div>
                )
              })}
          </div>
        )}

        {/* Leads Tab */}
        {activeTab === 'leads' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {leads.length === 0 ? (
              <div style={{ background: '#fff', borderRadius: 20, padding: 60, textAlign: 'center', border: '1.5px solid #eef2ee' }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>📋</div>
                <div style={{ fontWeight: 700, color: '#374151', fontSize: 16 }}>No leads yet</div>
                <div style={{ color: '#9ca3af', marginTop: 8 }}>Leads from the landing page will appear here</div>
              </div>
            ) : leads.map(lead => (
              <div key={lead.id} style={{ background: '#fff', borderRadius: 16, border: `1.5px solid ${lead.status === 'new' ? '#fde68a' : '#eef2ee'}`, padding: '18px 24px', display: 'flex', alignItems: 'center', gap: 16, boxShadow: '0 2px 6px rgba(0,0,0,0.04)' }}>
                <div style={{ fontSize: 28 }}>{INDUSTRIES[lead.industry as keyof typeof INDUSTRIES] || '🏢'}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 800, fontSize: 15, color: '#111', marginBottom: 2 }}>{lead.name} {lead.business_name && `· ${lead.business_name}`}</div>
                  <div style={{ fontSize: 13, color: '#6b7280' }}>
                    {lead.contact_email && `${lead.contact_email} · `}{lead.contact_phone}
                    {lead.industry && ` · ${lead.industry}`}
                    {lead.staff_count && ` · ${lead.staff_count} staff`}
                  </div>
                  {lead.message && <div style={{ fontSize: 13, color: '#374151', marginTop: 4, fontStyle: 'italic' }}>"{lead.message}"</div>}
                  <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>{new Date(lead.created_at).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
                </div>
                {lead.status === 'new' && <div style={{ background: '#fef9c3', color: '#92400e', borderRadius: 20, padding: '4px 12px', fontWeight: 700, fontSize: 12 }}>🆕 New</div>}
                <select value={lead.status} onChange={e => updateLeadStatus(lead.id, e.target.value)}
                  style={{ padding: '6px 10px', border: '1.5px solid #e5e7eb', borderRadius: 8, fontSize: 13, cursor: 'pointer', outline: 'none' }}>
                  <option value="new">New</option>
                  <option value="contacted">Contacted</option>
                  <option value="converted">Converted</option>
                  <option value="lost">Lost</option>
                </select>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* New/Edit Client Modal */}
      {showNewClient && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 24 }}>
          <div style={{ background: '#fff', borderRadius: 24, padding: 32, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ fontWeight: 800, fontSize: 20, color: '#111', marginBottom: 24 }}>{editClient ? 'Edit Client' : 'New Client'}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
              <div style={{ gridColumn: '1/-1' }}>
                <label style={label}>Business Name *</label>
                <input style={inp} value={form.client_name} onChange={e => setForm(f => ({ ...f, client_name: e.target.value }))} placeholder="e.g. Mochachos Hartswater" />
              </div>
              <div><label style={label}>Contact Name</label><input style={inp} value={form.contact_name} onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))} placeholder="John Smith" /></div>
              <div><label style={label}>Phone</label><input style={inp} value={form.contact_phone} onChange={e => setForm(f => ({ ...f, contact_phone: e.target.value }))} placeholder="082 123 4567" /></div>
              <div><label style={label}>Email</label><input style={inp} value={form.contact_email} onChange={e => setForm(f => ({ ...f, contact_email: e.target.value }))} placeholder="john@business.co.za" /></div>
              <div>
                <label style={label}>Industry</label>
                <select style={inp} value={form.industry} onChange={e => setForm(f => ({ ...f, industry: e.target.value }))}>
                  <option value="restaurant">🍕 Restaurant</option>
                  <option value="guest_house">🏨 Guest House</option>
                  <option value="retail">🛒 Retail</option>
                  <option value="salon">💇 Salon</option>
                  <option value="clinic">🏥 Clinic</option>
                  <option value="car_wash">🚗 Car Wash</option>
                  <option value="other">🏢 Other</option>
                </select>
              </div>
              <div><label style={label}>Monthly Fee (R)</label><input style={inp} type="number" value={form.monthly_fee} onChange={e => setForm(f => ({ ...f, monthly_fee: e.target.value }))} placeholder="1500" /></div>
              <div>
                <label style={label}>Payment Status</label>
                <select style={inp} value={form.payment_status} onChange={e => setForm(f => ({ ...f, payment_status: e.target.value }))}>
                  <option value="active">✅ Active</option>
                  <option value="overdue">⚠️ Overdue</option>
                  <option value="suspended">🚫 Suspended</option>
                  <option value="cancelled">❌ Cancelled</option>
                </select>
              </div>
              <div><label style={label}>Next Payment Date</label><input style={inp} type="date" value={form.next_payment_date} onChange={e => setForm(f => ({ ...f, next_payment_date: e.target.value }))} /></div>
              <div style={{ gridColumn: '1/-1' }}>
                <label style={label}>Notes</label>
                <textarea style={{ ...inp, height: 80, resize: 'vertical' }} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Any notes about this client..." />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowNewClient(false)} style={{ background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: 12, padding: '12px 24px', cursor: 'pointer', fontWeight: 700 }}>Cancel</button>
              <button onClick={saveClient} disabled={saving || !form.client_name}
                style={{ background: PRIMARY, color: '#fff', border: 'none', borderRadius: 12, padding: '12px 24px', cursor: 'pointer', fontWeight: 700, opacity: saving || !form.client_name ? 0.6 : 1 }}>
                {saving ? 'Saving…' : editClient ? 'Save Changes' : 'Add Client'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
