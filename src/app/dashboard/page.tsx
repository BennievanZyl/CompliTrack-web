'use client'
import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Suspense } from 'react'

interface Store { id: string; name: string; city: string }
interface DailySession { id: string; session_date: string; status: string; signed_off_at: string | null }
interface Profile { full_name: string; role: string; organisation_id: string }

function DashboardContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const storeParam = searchParams.get('store')

  const [profile, setProfile] = useState<Profile | null>(null)
  const [stores, setStores] = useState<Store[]>([])
  const [selectedStore, setSelectedStore] = useState<Store | null>(null)
  const [todaySession, setTodaySession] = useState<DailySession | null>(null)
  const [completedTasks, setCompletedTasks] = useState(0)
  const [totalTasks, setTotalTasks] = useState(0)
  const [loading, setLoading] = useState(true)
  const [unreadMessages, setUnreadMessages] = useState(0)
  const [viewingAsStore, setViewingAsStore] = useState<Store | null>(null)

  useEffect(() => { loadDashboard() }, [])
  useEffect(() => { if (selectedStore) loadStoreData(selectedStore.id) }, [selectedStore])

  async function loadDashboard() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const { data: profileData } = await supabase
      .from('profiles').select('full_name, role, organisation_id').eq('id', user.id).single()

    if (!profileData) { setLoading(false); return }
    setProfile(profileData)

    const isFranchisor = profileData.role === 'franchisor_admin' || profileData.role === 'platform_admin'

    if (storeParam && isFranchisor) {
      // Franchisor viewing a specific store
      const { data: storeData } = await supabase
        .from('stores').select('id, name, city').eq('id', storeParam).single()
      if (storeData) {
        setViewingAsStore(storeData)
        setStores([storeData])
        setSelectedStore(storeData)
      }
    } else {
      // Normal user — load their own stores
      const { data: storesData } = await supabase
        .from('stores').select('id, name, city')
        .eq('organisation_id', profileData.organisation_id)
        .eq('is_active', true).order('name')
      if (storesData?.length) { setStores(storesData); setSelectedStore(storesData[0]) }
    }

    const { count } = await supabase
      .from('chat_messages').select('*', { count: 'exact', head: true })
      .eq('recipient_id', user.id).is('read_at', null)
    setUnreadMessages(count || 0)
    setLoading(false)
  }

  async function loadStoreData(storeId: string) {
    const today = new Date().toISOString().split('T')[0]
    const { data: session } = await supabase
      .from('daily_sessions').select('*')
      .eq('store_id', storeId).eq('session_date', today).maybeSingle()
    setTodaySession(session)
    if (session) {
      const { data: items } = await supabase
        .from('checklist_items').select('completed').eq('session_id', session.id)
      if (items) { setTotalTasks(items.length); setCompletedTasks(items.filter(i => i.completed).length) }
    } else {
      setTodaySession(null)
      setTotalTasks(0)
      setCompletedTasks(0)
    }
  }

  const handleSignOut = async () => { await supabase.auth.signOut(); router.push('/login') }

  const greeting = () => {
    const h = new Date().getHours()
    return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f0f4f0' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: '56px', height: '56px', borderRadius: '16px', background: 'linear-gradient(135deg, #1a5c38, #2d8653)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
              <path d="M5 13L10.5 18.5L21 8" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <p style={{ color: '#9ca3af', fontSize: '14px' }}>Loading dashboard...</p>
        </div>
      </div>
    )
  }

  const isSignedOff = todaySession?.status === 'signed_off'
  const hasSession = !!todaySession
  const completionPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0
  const isFranchisor = profile?.role === 'franchisor_admin' || profile?.role === 'platform_admin'

  const cards = [
    {
      icon: (
        <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
          <path d="M5 13L10.5 18.5L21 8" stroke="#1a5c38" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      ),
      iconBg: '#e8f5ee',
      title: 'Compliance',
      subtitle: 'Daily checklist and sign-off',
      href: '/compliance',
      badge: isSignedOff ? 'Complete' : hasSession ? 'In Progress' : 'Not Started',
      badgeColor: isSignedOff ? '#166534' : hasSession ? '#92400e' : '#6b7280',
      badgeBg: isSignedOff ? '#dcfce7' : hasSession ? '#fef3c7' : '#f3f4f6',
      extra: hasSession ? (
        <div style={{ marginTop: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#6b7280', marginBottom: '8px' }}>
            <span>Tasks complete</span>
            <span style={{ fontWeight: '700', color: '#111' }}>{completedTasks}/{totalTasks}</span>
          </div>
          <div style={{ height: '6px', background: '#f0f0f0', borderRadius: '100px', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${completionPercent}%`, background: 'linear-gradient(90deg, #1a5c38, #2d8653)', borderRadius: '100px' }}/>
          </div>
        </div>
      ) : null
    },
    { icon: <span style={{ fontSize: '26px' }}>💰</span>, iconBg: '#eff6ff', title: 'Cash Up', subtitle: 'Daily cash reconciliation', href: '/cashup' },
    { icon: <span style={{ fontSize: '26px' }}>📊</span>, iconBg: '#f5f3ff', title: 'Analytics & Reports', subtitle: 'View reports and compliance analytics', href: '/reports' },
    { icon: <span style={{ fontSize: '26px' }}>📈</span>, iconBg: '#ecfdf5', title: 'Income & Expenses', subtitle: 'Financial tracking and food cost', href: '/finances' },
    { icon: <span style={{ fontSize: '26px' }}>🌡️</span>, iconBg: '#fff1f2', title: 'Temperature Logs', subtitle: 'Equipment temperature monitoring', href: '/temperatures' },
    { icon: <span style={{ fontSize: '26px' }}>📦</span>, iconBg: '#faf5ff', title: 'Stock', subtitle: 'Stock counts and orders', href: '/stock' },
    { icon: <span style={{ fontSize: '26px' }}>🕐</span>, iconBg: '#eff6ff', title: 'Time & Attendance', subtitle: 'Staff shifts and wages', href: '/attendance' },
    { icon: <span style={{ fontSize: '26px' }}>🔧</span>, iconBg: '#fff7ed', title: 'Equipment', subtitle: 'Service schedules and alerts', href: '/equipment' },
    {
      icon: (
        <div style={{ position: 'relative' }}>
          <span style={{ fontSize: '26px' }}>💬</span>
          {unreadMessages > 0 && (
            <span style={{ position: 'absolute', top: -6, right: -6, background: '#ef4444', color: '#fff', borderRadius: '50%', width: 18, height: 18, fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{unreadMessages}</span>
          )}
        </div>
      ),
      iconBg: '#eff6ff',
      title: 'Messages',
      subtitle: 'Chat with your team and franchisor',
      href: '/chat',
      badge: unreadMessages > 0 ? `${unreadMessages} unread` : undefined,
      badgeColor: '#ef4444',
      badgeBg: '#fdecea',
    },
    { icon: <span style={{ fontSize: '26px' }}>⚙️</span>, iconBg: '#f8fafc', title: 'Settings', subtitle: 'Company, stores and checklist', href: '/settings' },
  ]

  return (
    <div style={{ minHeight: '100vh', background: '#f0f4f0' }}>

      {/* Franchisor viewing banner */}
      {viewingAsStore && (
        <div style={{ background: '#0a1f12', padding: '10px 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 18 }}>👁️</span>
            <span style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>Viewing store as Franchisor: <strong>{viewingAsStore.name}</strong></span>
          </div>
          <button onClick={() => window.close()} style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', color: '#fff', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
            ← Close Store View
          </button>
        </div>
      )}

      <header style={{ background: 'linear-gradient(135deg, #0a1f12 0%, #1a5c38 100%)', position: 'sticky', top: 0, zIndex: 10, padding: '0 40px' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '72px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M3 10L8 15L17 6" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div>
              <div style={{ fontWeight: '800', fontSize: '16px', color: 'white', letterSpacing: '-0.3px' }}>CompliTrack</div>
              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.55)' }}>{profile?.full_name}</div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {isFranchisor && (
              <button
                onClick={() => viewingAsStore ? window.close() : router.push('/franchisor')}
                style={{ padding: '8px 16px', border: '1.5px solid rgba(255,255,255,0.4)', borderRadius: '10px', fontSize: '13px', fontWeight: '700', color: 'white', background: 'rgba(255,255,255,0.15)', cursor: 'pointer' }}
              >
                ← Franchisor Portal
              </button>
            )}
            {unreadMessages > 0 && (
              <button onClick={() => router.push('/chat')} style={{ position: 'relative', background: 'rgba(255,255,255,0.1)', border: '1.5px solid rgba(255,255,255,0.2)', borderRadius: '10px', padding: '8px 14px', color: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>
                💬 {unreadMessages} unread
              </button>
            )}
            {stores.length > 1 && (
              <select
                value={selectedStore?.id}
                onChange={(e) => setSelectedStore(stores.find(s => s.id === e.target.value) || null)}
                style={{ padding: '8px 12px', border: '1.5px solid rgba(255,255,255,0.2)', borderRadius: '10px', fontSize: '13px', color: 'white', outline: 'none', background: 'rgba(255,255,255,0.1)', cursor: 'pointer' }}
              >
                {stores.map(s => <option key={s.id} value={s.id} style={{ color: '#111', background: 'white' }}>{s.name}</option>)}
              </select>
            )}
            <button onClick={handleSignOut} style={{ padding: '8px 16px', border: '1.5px solid rgba(255,255,255,0.25)', borderRadius: '10px', fontSize: '13px', fontWeight: '600', color: 'white', background: 'rgba(255,255,255,0.1)', cursor: 'pointer' }}>Sign out</button>
          </div>
        </div>
      </header>

      <div style={{ background: 'linear-gradient(135deg, #0a1f12 0%, #1a5c38 100%)', padding: '40px 40px 100px' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <h1 style={{ fontSize: '32px', fontWeight: '800', color: 'white', margin: '0 0 6px', letterSpacing: '-0.5px' }}>
            {greeting()}, {viewingAsStore ? viewingAsStore.name : profile?.full_name?.split(' ')[0]} 👋
          </h1>
          <p style={{ fontSize: '15px', color: 'rgba(255,255,255,0.6)', margin: 0 }}>
            {selectedStore?.name} • {new Date().toLocaleDateString('en-ZA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
      </div>

      <main style={{ maxWidth: '1200px', margin: '-60px auto 0', padding: '0 40px 60px', position: 'relative', zIndex: 1 }}>

        {isSignedOff && (
          <div style={{ background: 'white', border: '1.5px solid #bbf7d0', borderRadius: '16px', padding: '18px 24px', display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '24px', boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}>
            <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M3 9L7 13L15 5" stroke="#166534" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div>
              <p style={{ fontWeight: '700', color: '#166534', margin: '0 0 2px', fontSize: '14px' }}>Today&apos;s session is complete</p>
              <p style={{ fontSize: '12px', color: '#16a34a', margin: 0 }}>Signed off at {todaySession?.signed_off_at ? new Date(todaySession.signed_off_at).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' }) : ''}</p>
            </div>
          </div>
        )}

        {!hasSession && (
          <div style={{ background: 'white', border: '1.5px solid #fde68a', borderRadius: '16px', padding: '18px 24px', display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '24px', boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}>
            <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '18px' }}>⚠️</div>
            <div>
              <p style={{ fontWeight: '700', color: '#92400e', margin: '0 0 2px', fontSize: '14px' }}>No session started today</p>
              <p style={{ fontSize: '12px', color: '#b45309', margin: 0 }}>Open the CompliTrack app to start today&apos;s compliance session</p>
            </div>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
          {cards.map((card, i) => (
            <div
              key={i}
              onClick={() => router.push(card.href)}
              style={{ background: 'white', borderRadius: '20px', border: '1.5px solid #eef2ee', padding: '28px', cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}
              onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 8px 32px rgba(26,92,56,0.12)'; e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.borderColor = '#bbf7d0' }}
              onMouseLeave={(e) => { e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.04)'; e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.borderColor = '#eef2ee' }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px' }}>
                <div style={{ width: '52px', height: '52px', borderRadius: '14px', background: card.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {card.icon}
                </div>
                {card.badge && (
                  <span style={{ fontSize: '11px', fontWeight: '700', padding: '4px 10px', borderRadius: '100px', color: card.badgeColor, background: card.badgeBg }}>
                    {card.badge}
                  </span>
                )}
              </div>
              <h3 style={{ fontSize: '16px', fontWeight: '800', color: '#111', margin: '0 0 6px' }}>{card.title}</h3>
              <p style={{ fontSize: '13px', color: '#9ca3af', margin: 0, lineHeight: '1.5' }}>{card.subtitle}</p>
              {card.extra}
            </div>
          ))}
        </div>

        <div style={{ marginTop: '48px', textAlign: 'center' }}>
          <p style={{ fontSize: '12px', color: '#9ca3af' }}>CompliTrack © 2026 • Store Management Platform • South Africa 🇿🇦</p>
        </div>
      </main>
    </div>
  )
}

export default function DashboardPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f0f4f0' }}>
        <p style={{ color: '#9ca3af' }}>Loading...</p>
      </div>
    }>
      <DashboardContent />
    </Suspense>
  )
}
