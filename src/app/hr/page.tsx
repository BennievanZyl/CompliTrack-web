'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function HRPortalPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [store, setStore] = useState('')

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: profile } = await supabase.from('profiles')
        .select('full_name, role, store_id').eq('id', user.id).single()
      if (!profile || profile.role !== 'hr_admin') { router.push('/dashboard'); return }
      setName(profile.full_name ?? 'HR Admin')
      if (profile.store_id) {
        const { data: s } = await supabase.from('stores').select('name').eq('id', profile.store_id).single()
        setStore(s?.name ?? '')
      }
    }
    load()
  }, [router])

  const now = new Date()
  const greeting = now.getHours() < 12 ? 'Good morning' : now.getHours() < 17 ? 'Good afternoon' : 'Good evening'

  const cards = [
    { href: '/people', emoji: '👥', title: 'People & Attendance', desc: 'Staff profiles, clock-in records, leave & warnings', color: '#1a5c38' },
    { href: '/wages', emoji: '💰', title: 'Payroll & Wages', desc: 'Hours worked, pay runs, advances & deductions', color: '#2563eb' },
    { href: '/reports', emoji: '📋', title: 'HR Reports', desc: 'Attendance, labour & payroll exports', color: '#7c3aed' },
    { href: '/devices', emoji: '📱', title: 'Linked Devices', desc: 'Link kiosk tablets for face clock-in/out', color: '#0891b2' },
  ]

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb', fontFamily: 'system-ui, sans-serif' }}>
      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, #0a2e1f, #1a5c38)', padding: '24px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <div style={{ width: 32, height: 32, background: '#fff', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 16 }}>✓</span>
            </div>
            <span style={{ color: '#fff', fontWeight: 800, fontSize: 18 }}>CompliTrack HR</span>
          </div>
          <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>{store}</div>
        </div>
        <button onClick={signOut} style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', color: '#fff', padding: '8px 18px', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
          Sign out
        </button>
      </div>

      {/* Welcome */}
      <div style={{ padding: '40px 32px 24px' }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: '#111', margin: 0 }}>{greeting}, {name.split(' ')[0]} 👋</h1>
        <p style={{ color: '#6b7280', marginTop: 6, fontSize: 15 }}>
          {store} — {now.toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      {/* Cards */}
      <div style={{ padding: '0 32px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20, maxWidth: 900 }}>
        {cards.map(card => (
          <a key={card.href} href={card.href} style={{ textDecoration: 'none' }}>
            <div style={{ background: '#fff', borderRadius: 16, padding: 28, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '1px solid #e5e7eb', cursor: 'pointer', transition: 'box-shadow 0.2s' }}
              onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.12)')}
              onMouseLeave={e => (e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)')}>
              <div style={{ width: 52, height: 52, background: card.color + '15', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16, fontSize: 26 }}>
                {card.emoji}
              </div>
              <div style={{ fontWeight: 800, fontSize: 17, color: '#111', marginBottom: 6 }}>{card.title}</div>
              <div style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.5 }}>{card.desc}</div>
            </div>
          </a>
        ))}
      </div>
    </div>
  )
}
