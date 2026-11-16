'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { useStoreContext } from '@/lib/store-context'

// ─── Types ───────────────────────────────────────────────────────────────────
type SessionType = 'daily' | 'weekly' | 'monthly' | 'six_monthly' | 'annual'
const SESSION_TYPE_LABELS: Record<SessionType, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  six_monthly: '6-Monthly',
  annual: 'Annual',
}
const SESSION_TYPES: SessionType[] = ['daily', 'weekly', 'monthly', 'six_monthly', 'annual']

type HistoryItem = {
  id: string
  session_date: string
  session_type: string
  status: string
  pdf_report_url: string | null
  signed_off_at: string | null
  duration_seconds: number | null
}

type ChecklistItem = {
  id: string
  title: string
  description: string | null
  category: string | null
  is_required: boolean
  sort_order: number
  section_id: string | null
  section_title: string | null
}
type ChecklistCompletion = {
  id: string
  checklist_item_id: string
  status: 'completed' | 'failed' | 'skipped' | 'not_started'
  notes: string | null
  completed_at: string | null
  completed_by: string | null
  photo_url: string | null
}
type Comment = {
  id: string
  content: string
  created_at: string
  user_name: string | null
}
type Session = {
  id: string
  session_date: string
  session_type: string
  status: string
  store_id: string
  signed_off_by: string | null
  signed_off_at: string | null
  pdf_report_url: string | null
  duration_seconds: number | null
}
type UniformCheck = {
  id: string
  employee_name: string
  is_compliant: boolean
  issues: string | null
  checked_at: string
}
type TempLog = {
  id: string
  equipment_name: string
  equipment_type: string
  temperature_c: number
  period: string
  is_compliant: boolean
  logged_at: string
}

// ─── Constants ────────────────────────────────────────────────────────────────
const PRIMARY = '#1a5c38'
const DARK    = '#0a1f12'
const LIGHT   = '#f0f4f0'

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}
function formatDateShort(d: string) {
  return new Date(d).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })
}
function formatDuration(s: number | null) {
  if (!s) return '—'
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function CompliancePage() {
  const router = useRouter()
  const { storeId: STORE_ID, ready: ctxReady } = useStoreContext()

  // Session type tabs
  const [sessionType, setSessionType] = useState<SessionType>('daily')
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const [isHistoricalView, setIsHistoricalView] = useState(false)
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([])

  // Core data
  const [session, setSession] = useState<Session | null>(null)
  const [items, setItems] = useState<ChecklistItem[]>([])
  const [completions, setCompletions] = useState<ChecklistCompletion[]>([])
  const [comments, setComments] = useState<Comment[]>([])
  const [uniforms, setUniforms] = useState<UniformCheck[]>([])
  const [temperatures, setTemperatures] = useState<TempLog[]>([])

  // UI state
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'checklist' | 'uniforms' | 'temperatures' | 'comments'>('checklist')
  const [selectedItem, setSelectedItem] = useState<ChecklistItem | null>(null)
  const [newComment, setNewComment] = useState('')
  const [postingComment, setPostingComment] = useState(false)

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  // ─── Load data ─────────────────────────────────────────────────────────────
  const loadData = useCallback(async (type: SessionType) => {
    if (!STORE_ID) return
    setLoading(true)
    setIsHistoricalView(false)

    const today = new Date().toISOString().split('T')[0]

    let sessionsQuery = supabase
      .from('daily_sessions')
      .select('*')
      .eq('store_id', STORE_ID)
      .eq('session_type', type)
      .order('session_date', { ascending: false })

    if (type === 'daily') {
      sessionsQuery = sessionsQuery.eq('session_date', today)
    }

    const { data: sessions } = await sessionsQuery.limit(5)

    const sessionData =
      sessions?.find(s => s.status === 'in_progress') ||
      sessions?.find(s => s.status === 'signed_off') ||
      sessions?.[0] ||
      null

    setSession(sessionData)
    setCurrentSessionId(sessionData?.id ?? null)
    if (sessionData) await loadSessionData(sessionData.id)

    // Load history
    const { data: historyData } = await supabase
      .from('daily_sessions')
      .select('id, session_date, session_type, status, pdf_report_url, signed_off_at, duration_seconds')
      .eq('store_id', STORE_ID)
      .eq('session_type', type)
      .order('session_date', { ascending: false })
      .limit(25)

    setHistoryItems(historyData || [])
    setLoading(false)
  }, [STORE_ID])

  const loadSessionData = async (sessionId: string) => {
    const [completionsRes, commentsRes, uniformsRes, tempsRes] = await Promise.all([
      supabase.from('checklist_completions')
        .select('*')
        .eq('session_id', sessionId),
      supabase.from('session_comments')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at'),
      supabase.from('uniform_checks')
        .select('*')
        .eq('session_id', sessionId)
        .order('checked_at'),
      supabase.from('temperature_logs')
        .select('*')
        .eq('session_id', sessionId)
        .order('logged_at'),
    ])
    const completionData = completionsRes.data || []
    const itemIds = completionData.map((c: any) => c.checklist_item_id).filter(Boolean)
    if (itemIds.length > 0) {
      const { data: itemsData } = await supabase
        .from('checklist_items')
        .select('id, title, description, category, is_required, sort_order, section_id, section_title')
        .in('id', itemIds)
        .order('sort_order')
      setItems(itemsData || [])
    } else {
      const { data: itemsData } = await supabase
        .from('checklist_items')
        .select('id, title, description, category, is_required, sort_order, section_id, section_title')
        .eq('store_id', STORE_ID)
        .order('sort_order')
      setItems(itemsData || [])
    }
    setCompletions(completionData)
    setComments(commentsRes.data || [])
    setUniforms(uniformsRes.data || [])
    setTemperatures(tempsRes.data || [])
  }

  // Load on mount + when storeId ready
  useEffect(() => {
    if (ctxReady && STORE_ID) loadData(sessionType)
  }, [ctxReady, STORE_ID])

  // Polling
  useEffect(() => {
    if (!ctxReady || !STORE_ID) return
    const iv = setInterval(() => {
      if (!isHistoricalView) loadData(sessionType)
    }, 30000)
    return () => clearInterval(iv)
  }, [ctxReady, STORE_ID, sessionType, isHistoricalView, loadData])

  // ─── Session type change ───────────────────────────────────────────────────
  function handleSessionTypeChange(type: SessionType) {
    setSessionType(type)
    setActiveTab('checklist')
    setSelectedItem(null)
    setComments([])
    setNewComment('')
    if (ctxReady && STORE_ID) loadData(type)
  }

  // ─── History navigation ────────────────────────────────────────────────────
  async function viewHistorySession(item: HistoryItem) {
    setIsHistoricalView(item.id !== currentSessionId)
    const { data: sessionData } = await supabase
      .from('daily_sessions')
      .select('*')
      .eq('id', item.id)
      .single()
    if (sessionData) {
      setSession(sessionData)
      await loadSessionData(item.id)
    }
    setActiveTab('checklist')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function returnToCurrentSession() {
    if (!currentSessionId) return
    const { data: sessionData } = await supabase
      .from('daily_sessions')
      .select('*')
      .eq('id', currentSessionId)
      .single()
    if (sessionData) {
      setSession(sessionData)
      await loadSessionData(currentSessionId)
    }
    setIsHistoricalView(false)
    setActiveTab('checklist')
  }

  // ─── Computed ──────────────────────────────────────────────────────────────
  const getCompletion = (itemId: string) =>
    completions.find(c => c.checklist_item_id === itemId)

  const completedCount = items.filter(i => {
    const c = getCompletion(i.id)
    return c?.status === 'completed'
  }).length
  const failedCount = items.filter(i => {
    const c = getCompletion(i.id)
    return c?.status === 'failed'
  }).length
  const totalItems   = items.length
  const progress     = totalItems > 0 ? Math.round((completedCount / totalItems) * 100) : 0

  const uniformCompliant    = uniforms.filter(u => u.is_compliant).length
  const uniformNonCompliant = uniforms.filter(u => !u.is_compliant).length
  const tempCompliant       = temperatures.filter(t => t.is_compliant).length
  const tempNonCompliant    = temperatures.filter(t => !t.is_compliant).length

  // ─── Post comment ──────────────────────────────────────────────────────────
  async function postComment() {
    if (!newComment.trim() || !session) return
    setPostingComment(true)
    await supabase.from('session_comments').insert({
      session_id: session.id,
      content: newComment.trim(),
      user_name: 'Manager',
    })
    setNewComment('')
    if (session) {
      const { data } = await supabase
        .from('session_comments')
        .select('*')
        .eq('session_id', session.id)
        .order('created_at')
      setComments(data || [])
    }
    setPostingComment(false)
  }

  const sections = [...new Set(items.map(i => i.section_title || 'General'))]

  // ─── Render ────────────────────────────────────────────────────────────────
  if (!ctxReady) {
    return (
      <div style={{ minHeight: '100vh', background: LIGHT, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ color: '#9ca3af', fontSize: '15px' }}>Loading…</div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: LIGHT, fontFamily: 'system-ui, sans-serif' }}>

      {/* ── Nav ── */}
      <header style={{ background: `linear-gradient(135deg, ${DARK}, ${PRIMARY})`, position: 'sticky', top: 0, zIndex: 10, padding: '0 32px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 68 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>✅</div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 15, color: '#fff' }}>CompliTrack</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>Compliance</div>
            </div>
          </div>
          <button onClick={() => router.push('/dashboard')} style={{ padding: '7px 16px', border: '1.5px solid rgba(255,255,255,0.4)', borderRadius: 10, fontSize: 13, fontWeight: 700, color: '#fff', background: 'rgba(255,255,255,0.12)', cursor: 'pointer' }}>
            ← Dashboard
          </button>
        </div>
      </header>

      {/* ── Session type tabs ── */}
      <div style={{ background: `linear-gradient(135deg, ${DARK}, ${PRIMARY})`, padding: '0 32px 14px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', gap: 4 }}>
          {SESSION_TYPES.map(type => (
            <button key={type} onClick={() => handleSessionTypeChange(type)} style={{
              padding: '8px 20px', borderRadius: 10, border: 'none', cursor: 'pointer',
              fontWeight: 700, fontSize: 13,
              background: sessionType === type ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.07)',
              color: sessionType === type ? '#fff' : 'rgba(255,255,255,0.55)',
              borderBottom: sessionType === type ? '2px solid #4ade80' : '2px solid transparent',
              transition: 'all 0.15s',
            }}>
              {SESSION_TYPE_LABELS[type]}
            </button>
          ))}
        </div>
      </div>

      {/* ── Hero ── */}
      <div style={{ background: `linear-gradient(135deg, ${DARK}, ${PRIMARY})`, padding: '32px 32px 90px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <h1 style={{ fontSize: 30, fontWeight: 800, color: '#fff', margin: '0 0 4px', letterSpacing: '-0.5px' }}>
            {SESSION_TYPE_LABELS[sessionType]} Compliance ✅
          </h1>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.55)', margin: 0 }}>
            {session ? formatDate(session.session_date) : 'No session found'}
          </p>
        </div>
      </div>

      <main style={{ maxWidth: 1100, margin: '-64px auto 0', padding: '0 32px 60px', position: 'relative', zIndex: 1 }}>

        {/* ── Historical view banner ── */}
        {!loading && isHistoricalView && session && (
          <div style={{ background: '#fffbeb', border: '1.5px solid #fde68a', borderRadius: 14, padding: '12px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 18 }}>📅</span>
              <span style={{ fontWeight: 600, color: '#92400e', fontSize: 14 }}>
                Viewing past session — {formatDate(session.session_date)}
              </span>
            </div>
            {currentSessionId && (
              <button onClick={returnToCurrentSession} style={{ padding: '7px 16px', background: '#92400e', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                ← Back to current
              </button>
            )}
          </div>
        )}

        {loading ? (
          <div style={{ background: '#fff', borderRadius: 20, padding: 60, textAlign: 'center' }}>
            <div style={{ fontSize: 15, color: '#9ca3af' }}>Loading compliance data…</div>
          </div>
        ) : !session ? (
          <div style={{ background: '#fff', borderRadius: 20, padding: 60, textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📋</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#111', marginBottom: 6 }}>No {SESSION_TYPE_LABELS[sessionType]} Session</div>
            <div style={{ fontSize: 14, color: '#9ca3af' }}>No {sessionType.replace('_', '-')} compliance session found. Start one from the mobile app.</div>
          </div>
        ) : (
          <>
            {/* ── Summary cards ── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
              {[
                { label: 'Progress', value: `${progress}%`, sub: `${completedCount}/${totalItems} items`, color: progress === 100 ? '#16a34a' : progress >= 70 ? '#d97706' : '#dc2626', border: '#eef2ee' },
                { label: 'Status', value: session.status === 'signed_off' ? 'Signed Off' : session.status === 'in_progress' ? 'In Progress' : session.status, sub: session.signed_off_at ? new Date(session.signed_off_at).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' }) : '—', color: session.status === 'signed_off' ? '#16a34a' : '#d97706', border: session.status === 'signed_off' ? '#bbf7d0' : '#fef3c7' },
                { label: 'Uniforms', value: `${uniformCompliant}/${uniforms.length}`, sub: uniformNonCompliant > 0 ? `${uniformNonCompliant} issues` : 'All OK', color: uniformNonCompliant > 0 ? '#dc2626' : '#16a34a', border: uniformNonCompliant > 0 ? '#fecaca' : '#bbf7d0' },
                { label: 'Temperatures', value: `${tempCompliant}/${temperatures.length}`, sub: tempNonCompliant > 0 ? `${tempNonCompliant} non-compliant` : 'All in range', color: tempNonCompliant > 0 ? '#dc2626' : '#16a34a', border: tempNonCompliant > 0 ? '#fecaca' : '#bbf7d0' },
              ].map((k, i) => (
                <div key={i} style={{ background: '#fff', borderRadius: 18, border: `1.5px solid ${k.border}`, padding: '18px 20px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                  <div style={{ fontSize: 24, fontWeight: 800, color: k.color }}>{k.value}</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#111', marginTop: 2 }}>{k.label}</div>
                  <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{k.sub}</div>
                </div>
              ))}
            </div>

            {/* ── Tabs ── */}
            <div style={{ background: '#fff', borderRadius: 16, border: '1.5px solid #eef2ee', marginBottom: 20, overflow: 'hidden' }}>
              <div style={{ display: 'flex', borderBottom: '1.5px solid #f3f4f6' }}>
                {(['checklist', 'uniforms', 'temperatures', 'comments'] as const).map(tab => (
                  <button key={tab} onClick={() => setActiveTab(tab)} style={{
                    flex: 1, padding: '14px 10px', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700,
                    background: activeTab === tab ? '#f0fdf4' : '#fff',
                    color: activeTab === tab ? PRIMARY : '#6b7280',
                    borderBottom: activeTab === tab ? `2px solid ${PRIMARY}` : '2px solid transparent',
                  }}>
                    {tab === 'checklist' ? `Checklist (${completedCount}/${totalItems})` : tab === 'uniforms' ? `Uniforms (${uniforms.length})` : tab === 'temperatures' ? `Temps (${temperatures.length})` : `Comments (${comments.length})`}
                  </button>
                ))}
              </div>

              <div style={{ padding: 24 }}>

                {/* ── Checklist tab ── */}
                {activeTab === 'checklist' && (
                  <div>
                    {failedCount > 0 && (
                      <div style={{ background: '#fef2f2', border: '1.5px solid #fecaca', borderRadius: 12, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 20 }}>⚠️</span>
                        <div>
                          <div style={{ fontWeight: 700, color: '#dc2626', fontSize: 13 }}>{failedCount} item{failedCount > 1 ? 's' : ''} failed</div>
                          <div style={{ fontSize: 12, color: '#b91c1c' }}>Review and address these issues</div>
                        </div>
                      </div>
                    )}
                    <div style={{ display: 'grid', gridTemplateColumns: selectedItem ? '1fr 340px' : '1fr', gap: 16 }}>
                      <div>
                        {sections.map(section => {
                          const sectionItems = items.filter(i => (i.section_title || 'General') === section)
                          return (
                            <div key={section} style={{ marginBottom: 20 }}>
                              <div style={{ fontSize: 12, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>{section}</div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {sectionItems.map(item => {
                                  const c = getCompletion(item.id)
                                  const statusColor = c?.status === 'completed' ? '#16a34a' : c?.status === 'failed' ? '#dc2626' : c?.status === 'skipped' ? '#d97706' : '#9ca3af'
                                  const statusBg = c?.status === 'completed' ? '#f0fdf4' : c?.status === 'failed' ? '#fff5f5' : c?.status === 'skipped' ? '#fffbeb' : '#f9fafb'
                                  const statusIcon = c?.status === 'completed' ? '✓' : c?.status === 'failed' ? '✗' : c?.status === 'skipped' ? '→' : '○'
                                  return (
                                    <div key={item.id} onClick={() => setSelectedItem(selectedItem?.id === item.id ? null : item)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 10, border: `1.5px solid ${selectedItem?.id === item.id ? PRIMARY : '#e5e7eb'}`, background: selectedItem?.id === item.id ? '#f0fdf4' : statusBg, cursor: 'pointer', transition: 'all 0.1s' }}>
                                      <div style={{ width: 28, height: 28, borderRadius: '50%', background: statusColor, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, flexShrink: 0 }}>{statusIcon}</div>
                                      <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 13, fontWeight: 600, color: '#111', display: 'flex', alignItems: 'center', gap: 6 }}>
                                          {item.title}
                                          {item.is_required && <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: '#fef3c7', color: '#d97706' }}>REQ</span>}
                                        </div>
                                        {item.description && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.description}</div>}
                                      </div>
                                      <div style={{ fontSize: 11, fontWeight: 700, color: statusColor, flexShrink: 0 }}>
                                        {c?.status ? c.status.replace('_', ' ') : 'pending'}
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          )
                        })}
                      </div>

                      {selectedItem && (() => {
                        const c = getCompletion(selectedItem.id)
                        return (
                          <div style={{ background: '#f9fafb', borderRadius: 14, padding: 20, border: '1.5px solid #e5e7eb', alignSelf: 'start', position: 'sticky', top: 100 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                              <div style={{ fontSize: 14, fontWeight: 700, color: '#111', flex: 1, paddingRight: 8 }}>{selectedItem.title}</div>
                              <button onClick={() => setSelectedItem(null)} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#9ca3af', lineHeight: 1 }}>×</button>
                            </div>
                            {selectedItem.description && <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 14, lineHeight: 1.5 }}>{selectedItem.description}</div>}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 14 }}>
                              {[
                                { label: 'Category', value: selectedItem.category || '—' },
                                { label: 'Required', value: selectedItem.is_required ? 'Yes' : 'No' },
                                { label: 'Status', value: c?.status?.replace('_', ' ') || 'pending' },
                                { label: 'Completed', value: c?.completed_at ? new Date(c.completed_at).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' }) : '—' },
                              ].map(row => (
                                <div key={row.label} style={{ background: '#fff', borderRadius: 8, padding: '8px 10px' }}>
                                  <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{row.label}</div>
                                  <div style={{ fontSize: 12, fontWeight: 600, color: '#111', marginTop: 2 }}>{row.value}</div>
                                </div>
                              ))}
                            </div>
                            {c?.notes && (
                              <div style={{ background: '#fff', borderRadius: 8, padding: '10px 12px', marginBottom: 10 }}>
                                <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Notes</div>
                                <div style={{ fontSize: 12, color: '#374151', lineHeight: 1.5 }}>{c.notes}</div>
                              </div>
                            )}
                            {c?.photo_url && (
                              <div style={{ marginTop: 10 }}>
                                <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>Photo evidence</div>
                                <img src={c.photo_url} alt="Evidence" style={{ width: '100%', borderRadius: 8, border: '1px solid #e5e7eb' }} />
                              </div>
                            )}
                          </div>
                        )
                      })()}
                    </div>
                  </div>
                )}

                {/* ── Uniforms tab ── */}
                {activeTab === 'uniforms' && (
                  <div>
                    {uniforms.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '40px 0', color: '#9ca3af' }}>
                        <div style={{ fontSize: 36, marginBottom: 10 }}>👕</div>
                        <div style={{ fontSize: 15, fontWeight: 600 }}>No uniform checks recorded</div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {uniforms.map(u => (
                          <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderRadius: 12, border: `1.5px solid ${u.is_compliant ? '#bbf7d0' : '#fecaca'}`, background: u.is_compliant ? '#f0fdf4' : '#fff5f5' }}>
                            <div style={{ width: 36, height: 36, borderRadius: '50%', background: u.is_compliant ? '#dcfce7' : '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>
                              {u.is_compliant ? '✓' : '✗'}
                            </div>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 14, fontWeight: 700, color: '#111' }}>{u.employee_name}</div>
                              {u.issues && <div style={{ fontSize: 12, color: '#dc2626', marginTop: 2 }}>{u.issues}</div>}
                            </div>
                            <div style={{ fontSize: 11, color: '#9ca3af' }}>{new Date(u.checked_at).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* ── Temperatures tab ── */}
                {activeTab === 'temperatures' && (
                  <div>
                    {temperatures.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '40px 0', color: '#9ca3af' }}>
                        <div style={{ fontSize: 36, marginBottom: 10 }}>🌡️</div>
                        <div style={{ fontSize: 15, fontWeight: 600 }}>No temperature readings</div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {temperatures.map(t => (
                          <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderRadius: 12, border: `1.5px solid ${t.is_compliant ? '#bbf7d0' : '#fecaca'}`, background: t.is_compliant ? '#f0fdf4' : '#fff5f5' }}>
                            <div style={{ width: 36, height: 36, borderRadius: '50%', background: t.is_compliant ? '#dcfce7' : '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>
                              {t.equipment_type === 'Freezer' ? '🧊' : t.equipment_type === 'Fridge' ? '❄️' : '♨️'}
                            </div>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 14, fontWeight: 700, color: '#111' }}>{t.equipment_name}</div>
                              <div style={{ fontSize: 11, color: '#9ca3af' }}>{t.equipment_type} • {t.period}</div>
                            </div>
                            <div style={{ fontSize: 20, fontWeight: 800, color: t.is_compliant ? '#16a34a' : '#dc2626' }}>{Number(t.temperature_c).toFixed(1)}°C</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* ── Comments tab ── */}
                {activeTab === 'comments' && (
                  <div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
                      {comments.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '30px 0', color: '#9ca3af' }}>
                          <div style={{ fontSize: 15, fontWeight: 600 }}>No comments yet</div>
                        </div>
                      ) : comments.map(c => (
                        <div key={c.id} style={{ background: '#f9fafb', borderRadius: 12, padding: '12px 14px', border: '1.5px solid #e5e7eb' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: PRIMARY }}>{c.user_name || 'Anonymous'}</span>
                            <span style={{ fontSize: 11, color: '#9ca3af' }}>{new Date(c.created_at).toLocaleString('en-ZA', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}</span>
                          </div>
                          <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.5 }}>{c.content}</div>
                        </div>
                      ))}
                    </div>
                    {!isHistoricalView && (
                      <div style={{ display: 'flex', gap: 10 }}>
                        <input
                          value={newComment}
                          onChange={e => setNewComment(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && postComment()}
                          placeholder="Add a comment…"
                          style={{ flex: 1, padding: '10px 14px', borderRadius: 10, border: '1.5px solid #d1d5db', fontSize: 13, outline: 'none' }}
                        />
                        <button onClick={postComment} disabled={postingComment || !newComment.trim()} style={{ padding: '10px 20px', background: PRIMARY, color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: postingComment || !newComment.trim() ? 0.5 : 1 }}>
                          {postingComment ? '…' : 'Post'}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* ── PDF download ── */}
            {session.pdf_report_url && (
              <div style={{ background: '#f0fdf4', border: '1.5px solid #bbf7d0', borderRadius: 14, padding: '14px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 20 }}>📄</span>
                  <div>
                    <div style={{ fontWeight: 700, color: '#166534', fontSize: 14 }}>Compliance Report Available</div>
                    <div style={{ fontSize: 12, color: '#16a34a' }}>PDF report generated for this session</div>
                  </div>
                </div>
                <a href={session.pdf_report_url} target="_blank" rel="noopener noreferrer" style={{ padding: '8px 18px', background: PRIMARY, color: '#fff', borderRadius: 10, fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
                  Download PDF ↗
                </a>
              </div>
            )}

            {/* ── Session history ── */}
            <div style={{ background: '#fff', borderRadius: 20, border: '1.5px solid #eef2ee', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontWeight: 800, fontSize: 15, color: '#111' }}>
                  {SESSION_TYPE_LABELS[sessionType]} Session History
                </div>
                <div style={{ fontSize: 12, color: '#9ca3af' }}>{historyItems.length} session{historyItems.length !== 1 ? 's' : ''}</div>
              </div>
              {historyItems.length === 0 ? (
                <div style={{ padding: '30px 20px', textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>No past sessions found</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#f9fafb' }}>
                      {['Date', 'Status', 'Duration', 'PDF Report', 'View'].map(h => (
                        <th key={h} style={{ padding: '10px 20px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {historyItems.map((item, i) => {
                      const isCurrentlyViewing = session?.id === item.id
                      return (
                        <tr key={item.id} style={{ borderTop: '1px solid #f3f4f6', background: isCurrentlyViewing ? '#f0fdf4' : i % 2 === 0 ? '#fff' : '#fafafa' }}>
                          <td style={{ padding: '12px 20px' }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#111' }}>{formatDateShort(item.session_date)}</div>
                            {item.signed_off_at && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>Signed off {new Date(item.signed_off_at).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}</div>}
                          </td>
                          <td style={{ padding: '12px 20px' }}>
                            <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 100, background: item.status === 'signed_off' ? '#dcfce7' : item.status === 'in_progress' ? '#fef3c7' : '#f3f4f6', color: item.status === 'signed_off' ? '#166534' : item.status === 'in_progress' ? '#92400e' : '#6b7280' }}>
                              {item.status === 'signed_off' ? '✓ Signed off' : item.status === 'in_progress' ? '⟳ In progress' : item.status}
                            </span>
                          </td>
                          <td style={{ padding: '12px 20px', fontSize: 13, color: '#6b7280' }}>{formatDuration(item.duration_seconds)}</td>
                          <td style={{ padding: '12px 20px' }}>
                            {item.pdf_report_url ? (
                              <a href={item.pdf_report_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, fontWeight: 700, color: PRIMARY, textDecoration: 'none' }}>Download ↗</a>
                            ) : (
                              <span style={{ fontSize: 12, color: '#d1d5db' }}>—</span>
                            )}
                          </td>
                          <td style={{ padding: '12px 20px' }}>
                            <button onClick={() => viewHistorySession(item)} style={{ padding: '5px 14px', border: `1.5px solid ${isCurrentlyViewing ? PRIMARY : '#d1d5db'}`, borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', background: isCurrentlyViewing ? '#f0fdf4' : '#fff', color: isCurrentlyViewing ? PRIMARY : '#6b7280' }}>
                              {isCurrentlyViewing ? 'Viewing' : 'View'}
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}

        <div style={{ marginTop: 48, textAlign: 'center' }}>
          <p style={{ fontSize: 12, color: '#9ca3af' }}>CompliTrack © 2026 • Store Management Platform • South Africa 🇿🇦</p>
        </div>
      </main>
    </div>
  )
}
