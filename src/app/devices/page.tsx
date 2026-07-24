'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

const PRIMARY = '#1a5c38'
const DARK = '#0a1f12'

const ROLES = [
  { value: 'manager', label: 'Manager', desc: 'Full store access', color: '#1a5c38' },
  { value: 'staff', label: 'Staff', desc: 'Cashup, compliance, issue stock, buy list', color: '#2563eb' },
  { value: 'clock_system', label: 'Clock System', desc: 'Kiosk only — clock in/out', color: '#7c3aed' },
  { value: 'kitchen', label: 'Kitchen', desc: 'Issue stock, buy list, clock in', color: '#d97706' },
  { value: 'buyer', label: 'Buyer', desc: 'Buy list only', color: '#059669' },
  { value: 'viewer', label: 'Viewer', desc: 'Analytics and reports — read only', color: '#6b7280' },
]

function roleInfo(role: string) {
  return ROLES.find(r => r.value === role) || { label: role, desc: '', color: '#6b7280' }
}

export default function DevicesPage() {
  const router = useRouter()
  const [devices, setDevices] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [storeId, setStoreId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [selectedRole, setSelectedRole] = useState('staff')
  const [generatedCode, setGeneratedCode] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [removing, setRemoving] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: profile } = await supabase.from('profiles').select('store_id, role').eq('id', user.id).single()
      if (!profile?.store_id) return
      if (!['owner', 'manager', 'franchisee_owner', 'store_manager', 'platform_admin'].includes(profile.role || '')) {
        router.push('/dashboard'); return
      }
      setStoreId(profile.store_id)
      // Linked devices = claimed invitations (used_at IS NOT NULL)
      const { data } = await supabase.from('device_invitations')
        .select('*').eq('store_id', profile.store_id).not('used_at', 'is', null).order('used_at', { ascending: false })
      setDevices(data || [])
      setLoading(false)
    }
    load()
  }, [router])

  async function generateCode() {
    if (!storeId) return
    setCreating(true)
    // Generate random 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString()
    const { error } = await supabase.from('device_invitations').insert({
      store_id: storeId,
      code,
      role: selectedRole,
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    })
    if (!error) setGeneratedCode(code)
    setCreating(false)
  }

  async function removeDevice(id: string) {
    setRemoving(id)
    // Call Edge Function to terminate the device session AND unlink
    const { data: { session } } = await supabase.auth.getSession()
    await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/revoke-device`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token}`,
        'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
      },
      body: JSON.stringify({ invitation_id: id }),
    })
    setDevices(d => d.filter(x => x.id !== id))
    setRemoving(null)
  }

  async function changeRole(id: string, role: string) {
    await supabase.from('device_invitations').update({ role }).eq('id', id)
    setDevices(d => d.map(x => x.id === id ? { ...x, role } : x))
  }

  const inp: React.CSSProperties = { width: '100%', padding: '10px 14px', border: '1.5px solid #e5e7eb', borderRadius: 10, fontSize: 14, outline: 'none', boxSizing: 'border-box' }

  return (
    <div style={{ minHeight: '100vh', background: '#f8faf8', fontFamily: 'system-ui, sans-serif' }}>
      {/* Header */}
      <div style={{ background: `linear-gradient(135deg, ${DARK}, ${PRIMARY})`, padding: '0 24px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', padding: '20px 0', display: 'flex', alignItems: 'center', gap: 16 }}>
          <button onClick={() => router.push('/dashboard')} style={{ background: 'rgba(255,255,255,0.1)', border: '1.5px solid rgba(255,255,255,0.2)', borderRadius: 10, padding: '8px 16px', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>← Dashboard</button>
          <div>
            <div style={{ color: '#fff', fontWeight: 800, fontSize: 22 }}>📱 Linked Devices</div>
            <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 13 }}>Manage devices and roles for your store</div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 24px' }}>

        {/* Link New Device */}
        <div style={{ background: '#fff', borderRadius: 20, border: '1.5px solid #eef2ee', padding: 24, marginBottom: 24, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: showCreate ? 20 : 0 }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 16, color: '#111' }}>Link a New Device</div>
              <div style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>Generate a code and enter it on the device to link it</div>
            </div>
            <button onClick={() => { setShowCreate(!showCreate); setGeneratedCode(null) }}
              style={{ background: showCreate ? '#f3f4f6' : PRIMARY, color: showCreate ? '#374151' : '#fff', border: 'none', borderRadius: 12, padding: '10px 20px', cursor: 'pointer', fontWeight: 700, fontSize: 14 }}>
              {showCreate ? 'Cancel' : '+ Link Device'}
            </button>
          </div>

          {showCreate && !generatedCode && (
            <div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontWeight: 700, fontSize: 13, color: '#374151', display: 'block', marginBottom: 8 }}>Select Role</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                  {ROLES.map(r => (
                    <div key={r.value} onClick={() => setSelectedRole(r.value)}
                      style={{ border: `2px solid ${selectedRole === r.value ? r.color : '#e5e7eb'}`, borderRadius: 12, padding: '12px 14px', cursor: 'pointer', background: selectedRole === r.value ? `${r.color}10` : '#fff', transition: 'all 0.15s' }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: selectedRole === r.value ? r.color : '#111' }}>{r.label}</div>
                      <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 3, lineHeight: 1.4 }}>{r.desc}</div>
                    </div>
                  ))}
                </div>
              </div>
              <button onClick={generateCode} disabled={creating}
                style={{ background: PRIMARY, color: '#fff', border: 'none', borderRadius: 12, padding: '12px 28px', cursor: 'pointer', fontWeight: 700, fontSize: 15, opacity: creating ? 0.6 : 1 }}>
                {creating ? 'Generating…' : 'Generate Code'}
              </button>
            </div>
          )}

          {generatedCode && (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <div style={{ fontSize: 14, color: '#6b7280', marginBottom: 20 }}>
                Link as <strong>{roleInfo(selectedRole).label}</strong> — scan the QR code or enter the number
              </div>
              <div style={{ display: 'flex', gap: 32, justifyContent: 'center', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                {/* QR Code using Google Charts API */}
                <div style={{ textAlign: 'center' }}>
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=complitrack-device:${generatedCode}&bgcolor=ffffff&color=1a5c38&margin=10`}
                    alt="QR Code"
                    style={{ borderRadius: 16, border: '2px solid #bbf7d0', width: 200, height: 200 }}
                  />
                  <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 8 }}>Scan with camera</div>
                </div>
                {/* Number code */}
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 52, fontWeight: 900, letterSpacing: 10, color: PRIMARY, fontFamily: 'monospace', background: '#f0fdf4', borderRadius: 16, padding: '20px 28px', border: '2px solid #bbf7d0' }}>
                    {generatedCode}
                  </div>
                  <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 8 }}>Or type this code</div>
                </div>
              </div>
              <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 16 }}>⏱ Expires in 24 hours · One use only</div>
              <div style={{ marginTop: 16, display: 'flex', gap: 10, justifyContent: 'center' }}>
                <button onClick={() => { setGeneratedCode(null); setShowCreate(false) }}
                  style={{ background: PRIMARY, color: '#fff', border: 'none', borderRadius: 10, padding: '10px 20px', cursor: 'pointer', fontWeight: 700 }}>
                  Done
                </button>
                <button onClick={generateCode}
                  style={{ background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: 10, padding: '10px 20px', cursor: 'pointer', fontWeight: 600 }}>
                  Generate Another
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Linked Devices List */}
        <div style={{ fontWeight: 800, fontSize: 16, color: '#111', marginBottom: 16 }}>
          Linked Devices ({devices.length})
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af' }}>Loading devices…</div>
        ) : devices.length === 0 ? (
          <div style={{ background: '#fff', borderRadius: 20, border: '1.5px solid #eef2ee', padding: 48, textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📱</div>
            <div style={{ fontWeight: 700, fontSize: 16, color: '#374151', marginBottom: 8 }}>No devices linked yet</div>
            <div style={{ color: '#9ca3af', fontSize: 14 }}>Generate a code above and enter it on a device to link it</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {devices.map(device => {
              const role = roleInfo(device.role)
              return (
                <div key={device.id} style={{ background: '#fff', borderRadius: 16, border: '1.5px solid #eef2ee', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16, boxShadow: '0 2px 6px rgba(0,0,0,0.04)' }}>
                  <div style={{ width: 48, height: 48, borderRadius: 14, background: `${role.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>
                    {device.role === 'clock_system' ? '🕐' : device.role === 'kitchen' ? '🍗' : device.role === 'buyer' ? '🛒' : device.role === 'viewer' ? '📊' : device.role === 'manager' ? '👔' : '👤'}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 15, color: '#111' }}>{device.device_name || 'Unnamed Device'}</div>
                    <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>
                      Linked {new Date(device.used_at).toLocaleDateString('en-ZA')}
                      {device.last_seen_at && ` · Last seen ${new Date(device.last_seen_at).toLocaleDateString('en-ZA')}`}
                    </div>
                  </div>
                  {/* Role selector */}
                  <select value={device.role} onChange={e => changeRole(device.id, e.target.value)}
                    style={{ padding: '6px 10px', border: `1.5px solid ${role.color}`, borderRadius: 8, fontSize: 13, fontWeight: 700, color: role.color, background: `${role.color}10`, cursor: 'pointer', outline: 'none' }}>
                    {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                  <button onClick={() => removeDevice(device.id)} disabled={removing === device.id}
                    style={{ background: '#fef2f2', color: '#dc2626', border: '1.5px solid #fecaca', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontWeight: 700, fontSize: 13, opacity: removing === device.id ? 0.5 : 1 }}>
                    {removing === device.id ? '…' : 'Remove'}
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
