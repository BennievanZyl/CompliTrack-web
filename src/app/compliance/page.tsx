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
  session_id: string
  template_id: string | null
  completed: boolean | null
  completed_by: string | null
  completed_at: string | null
  photo_url: string | null
  notes: string | null
  // Columns that may be stored directly on the row (denormalized schema):
  name?: string | null
  title?: string | null
  section?: string | null
  section_title?: string | null
  category?: string | null
  sort_order?: number | null
  requires_photo?: boolean | null
  // Fallback: enriched from checklist_templates join
  checklist_templates: {
    task_name: string
    section: string | null
    sort_order: number | null
    requires_photo: boolean | null
  } | null
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

type UniformPhoto = {
  id: string
  session_id: string
  store_id: string
  schedule_id: string | null
  photo_url: string | null
  taken_at: string | null
  taken_by: string | null
  uniform_schedules: { label: string } | null
}

type TempLog = {
  id: string
  session_id: string
  equipment_id: string
  slot: string
  temperature_c: number | null
  is_compliant: boolean | null
  temperature_equipment: {
    equipment_name: string | null
    name: string | null
    equipment_type: string | null
  } | null
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
  const [comments, setComments] = useState<Comment[]>([])
  const [uniforms, setUniforms] = useState<UniformPhoto[]>([])
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
    // Step 1: parallel fetch of base tables (no joins — matches mobile app pattern)
    const [itemsRes, commentsRes, uniformsRes, tempsRes] = await Promise.all([
      supabase.from('checklist_items')
        .select('*')
        .eq('session_id', sessionId),
      supabase.from('session_comments')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at'),
      supabase.from('uniform_sessions')
        .select('id, session_id, store_id, schedule_id, photo_url, taken_at, taken_by')
        .eq('session_id', sessionId)
        .order('taken_at'),
      supabase.from('temperature_logs')
        .select('id, session_id, equipment_id, slot, temperature_c, is_compliant')
        .eq('session_id', sessionId)
        .order('slot'),
    ])

    const rawItems    = itemsRes.data    || []
    const rawUniforms = uniformsRes.data || []
    const rawTemps    = tempsRes.data    || []

    // Step 2: collect IDs for enrichment
    const templateIds = [...new Set(rawItems.map((i: any) => i.template_id).filter(Boolean))]
    const scheduleIds = [...new Set(rawUniforms.map((u: any) => u.schedule_id).filter(Boolean))]
    const equipIds    = [...new Set(rawTemps.map((t: any) => t.equipment_id).filter(Boolean))]

    const [templatesRes, schedulesRes, equipmentRes] = await Promise.all([
      templateIds.length > 0
        ? supabase.from('checklist_templates').select('id, task_name, section, sort_order, requires_photo').in('id', templateIds)
        : Promise.resolve({ data: [] }),
      scheduleIds.length > 0
        ? supabase.from('uniform_schedules').select('id, label').in('id', scheduleIds)
        : Promise.resolve({ data: [] }),
      equipIds.length > 0
        ? supabase.from('temperature_equipment').select('id, equipment_name, name, equipment_type').in('id', equipIds)
        : Promise.resolve({ data: [] }),
    ])

    const templateMap  = new Map((templatesRes.data  || []).map((t: any) => [t.id, t]))
    const scheduleMap  = new Map((schedulesRes.data  || []).map((s: any) => [s.id, s]))
    const equipmentMap = new Map((equipmentRes.data  || []).map((e: any) => [e.id, e]))

    // Step 3: merge and sort
    const enrichedItems: ChecklistItem[] = rawItems
      .map((item: any) => ({ ...item, checklist_templates: templateMap.get(item.template_id) || null }))
      .sort((a: any, b: any) => {
        const aOrd = a.sort_order ?? a.checklist_templates?.sort_order ?? 999
        const bOrd = b.sort_order ?? b.checklist_templates?.sort_order ?? 999
        return aOrd - bOrd
      })

    const enrichedUniforms: UniformPhoto[] = rawUniforms.map((u: any) => ({
      ...u, uniform_schedules: scheduleMap.get(u.schedule_id) || null,
    }))

    const enrichedTemps: TempLog[] = rawTemps.map((t: any) => ({
      ...t, temperature_equipment: equipmentMap.get(t.equipment_id) || null,
    }))

    setItems(enrichedItems)
    setComments(commentsRes.data || [])
    setUniforms(enrichedUniforms)
    setTemperatures(enrichedTemps)
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
  const completedCount     = items.filter(i => i.completed === true).length
  const totalItems         = items.length
  const progress           = totalItems > 0 ? Math.round((completedCount / totalItems) * 100) : 0
  const uniformsWithPhotos = uniforms.filter(u => u.photo_url)
  const tempCompliant      = temperatures.filter(t => t.is_compliant === true).length
  const tempNonCompliant   = temperatures.filter(t => t.is_compliant === false).length

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

  // ─── Item helpers (direct columns take priority over template join) ─────────
  const getItemName = (item: ChecklistItem) =>
    item.name || item.title || item.checklist_templates?.task_name || 'Checklist Item'
  const getItemSection = (item: ChecklistItem) =>
    item.section || item.section_title || item.category || item.checklist_templates?.section || 'General'
  const getItemRequiresPhoto = (item: ChecklistItem) =>
    item.requires_photo ?? item.checklist_templates?.requires_photo ?? false
  const formatCompletedBy = (id: string | null) => {
    if (!id) return '—'
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return 'Staff member'
    return id
  }

  const sections = [...new Set(items.map(i => getItemSection(i)))]

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
                { label: 'Uniforms', value: `${uniformsWithPhotos.length}/${uniforms.length}`, sub: `${uniforms.length - uniformsWithPhotos.length} pending`, color: uniforms.length > 0 && uniformsWithPhotos.length === uniforms.length ? '#16a34a' : '#d97706', border: uniforms.length > 0 && uniformsWithPhotos.length === uniforms.length ? '#bbf7d0' : '#fef3c7' },
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
                    {totalItems === 0 ? (
                      <div style={{ textAlign: 'center', padding: '40px 0', color: '#9ca3af' }}>
                        <div style={{ fontSize: 36, marginBottom: 10 }}>📋</div>
                        <div style={{ fontSize: 15, fontWeight: 600 }}>No checklist items for this session</div>
                      </div>
                    ) : (
                      <div style={{ display: 'grid', gridTemplateColumns: selectedItem ? '1fr 340px' : '1fr', gap: 16 }}>
                        <div>
                          {sections.map(section => {
                            const sectionItems = items.filter(i => getItemSection(i) === section)
                            return (
                              <div key={section} style={{ marginBottom: 20 }}>
                                <div style={{ fontSize: 12, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>{section}</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                  {sectionItems.map(item => {
                                    const isDone = item.completed === true
                                    const statusColor = isDone ? '#16a34a' : '#9ca3af'
                                    const statusBg    = isDone ? '#f0fdf4' : '#f9fafb'
                                    const statusIcon  = isDone ? '✓' : '○'
                                    return (
                                      <div key={item.id} onClick={() => setSelectedItem(selectedItem?.id === item.id ? null : item)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 10, border: `1.5px solid ${selectedItem?.id === item.id ? PRIMARY : '#e5e7eb'}`, background: selectedItem?.id === item.id ? '#f0fdf4' : statusBg, cursor: 'pointer', transition: 'all 0.1s' }}>
                                        <div style={{ width: 28, height: 28, borderRadius: '50%', background: statusColor, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, flexShrink: 0 }}>{statusIcon}</div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                          <div style={{ fontSize: 13, fontWeight: 600, color: '#111', display: 'flex', alignItems: 'center', gap: 6 }}>
                                            {getItemName(item)}
                                            {getItemRequiresPhoto(item) && <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: '#ede9fe', color: '#7c3aed' }}>📷</span>}
                                          </div>
                                        </div>
                                        <div style={{ fontSize: 11, fontWeight: 700, color: statusColor, flexShrink: 0 }}>
                                          {isDone ? 'done' : 'pending'}
                                        </div>
                                      </div>
                                    )
                                  })}
                                </div>
                              </div>
                            )
                          })}
                        </div>

                        {selectedItem && (
                          <div style={{ background: '#f9fafb', borderRadius: 14, padding: 20, border: '1.5px solid #e5e7eb', alignSelf: 'start', position: 'sticky', top: 100 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                              <div style={{ fontSize: 14, fontWeight: 700, color: '#111', flex: 1, paddingRight: 8 }}>{getItemName(selectedItem)}</div>
                              <button onClick={() => setSelectedItem(null)} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#9ca3af', lineHeight: 1 }}>×</button>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 14 }}>
                              {[
                                { label: 'Section', value: getItemSection(selectedItem) },
                                { label: 'Requires Photo', value: getItemRequiresPhoto(selectedItem) ? 'Yes' : 'No' },
                                { label: 'Status', value: selectedItem.completed === true ? 'Done' : 'Pending' },
                                { label: 'Completed', value: selectedItem.completed_at ? new Date(selectedItem.completed_at).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' }) : '—' },
                              ].map(row => (
                                <div key={row.label} style={{ background: '#fff', borderRadius: 8, padding: '8px 10px' }}>
                                  <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{row.label}</div>
                                  <div style={{ fontSize: 12, fontWeight: 600, color: '#111', marginTop: 2 }}>{row.value}</div>
                                </div>
                              ))}
                            </div>
                            {selectedItem.completed_by && (
                              <div style={{ background: '#fff', borderRadius: 8, padding: '8px 10px', marginBottom: 8 }}>
                                <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Completed by</div>
                                <div style={{ fontSize: 12, fontWeight: 600, color: '#111', marginTop: 2 }}>{formatCompletedBy(selectedItem.completed_by)}</div>
                              </div>
                            )}
                            {selectedItem.notes && (
                              <div style={{ background: '#fff', borderRadius: 8, padding: '10px 12px', marginBottom: 10 }}>
                                <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Notes</div>
                                <div style={{ fontSize: 12, color: '#374151', lineHeight: 1.5 }}>{selectedItem.notes}</div>
                              </div>
                            )}
                            {selectedItem.photo_url && (
                              <div style={{ marginTop: 10 }}>
                                <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>Photo evidence</div>
                                <img src={selectedItem.photo_url} alt="Evidence" style={{ width: '100%', borderRadius: 8, border: '1px solid #e5e7eb' }} />
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* ── Uniforms tab ── */}
                {activeTab === 'uniforms' && (
                  <div>
                    {uniforms.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '40px 0', color: '#9ca3af' }}>
                        <div style={{ fontSize: 36, marginBottom: 10 }}>👕</div>
                        <div style={{ fontSize: 15, fontWeight: 600 }}>No uniform photos recorded</div>
                      </div>
                    ) : (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14 }}>
                        {uniforms.map(u => (
                          <div key={u.id} style={{ borderRadius: 12, border: '1.5px solid #e5e7eb', background: '#fff', overflow: 'hidden' }}>
                            {u.photo_url ? (
                              <img src={u.photo_url} alt="Uniform" style={{ width: '100%', height: 180, objectFit: 'cover', display: 'block' }} />
                            ) : (
                              <div style={{ width: '100%', height: 180, background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32 }}>👕</div>
                            )}
                            <div style={{ padding: '10px 12px' }}>
                              <div style={{ fontSize: 13, fontWeight: 700, color: '#111' }}>{u.uniform_schedules?.label || 'Uniform check'}</div>
                              {u.taken_at && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 3 }}>{new Date(u.taken_at).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}</div>}
                              {u.taken_by && <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>by {u.taken_by}</div>}
                            </div>
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
                        {temperatures.map(t => {
                          const eqType = t.temperature_equipment?.equipment_type || ''
                          const eqName = t.temperature_equipment?.equipment_name || t.temperature_equipment?.name || 'Equipment'
                          return (
                            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderRadius: 12, border: `1.5px solid ${t.is_compliant ? '#bbf7d0' : '#fecaca'}`, background: t.is_compliant ? '#f0fdf4' : '#fff5f5' }}>
                              <div style={{ width: 36, height: 36, borderRadius: '50%', background: t.is_compliant ? '#dcfce7' : '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>
                                {eqType.toLowerCase().includes('freeze') ? '🧊' : eqType.toLowerCase().includes('fridge') || eqType.toLowerCase().includes('refriger') ? '❄️' : '♨️'}
                              </div>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 14, fontWeight: 700, color: '#111' }}>{eqName}</div>
                                <div style={{ fontSize: 11, color: '#9ca3af' }}>{eqType}{t.slot ? ` • ${t.slot}` : ''}</div>
                              </div>
                              <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: 20, fontWeight: 800, color: t.is_compliant ? '#16a34a' : '#dc2626' }}>
                                  {t.temperature_c != null ? `${Number(t.temperature_c).toFixed(1)}°C` : '—'}
                                </div>
                                <div style={{ fontSize: 10, color: t.is_compliant ? '#16a34a' : '#dc2626', fontWeight: 700 }}>
                                  {t.is_compliant ? 'OK' : 'OUT OF RANGE'}
                                </div>
                              </div>
                            </div>
                          )
                        })}
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
