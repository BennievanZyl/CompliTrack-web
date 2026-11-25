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
  shift_id: string | null
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

type ComplianceIssue = {
  id: string
  session_id: string
  checklist_item_id: string | null
  employee_id: string | null
  description: string
  photo_url: string | null
  is_uniform_violation: boolean | null
  status: string
  created_at: string
  resolved_at: string | null
  resolution_note: string | null
  resolution_photo_url: string | null
  resolved_by_employee_id: string | null
  employee_name?: string | null
  resolver_name?: string | null
  checklist_item_name?: string | null
}

type RosterMember = {
  employee_id: string
  full_name: string
  role: string | null
  avatar_url: string | null
}

type ShiftInfo = {
  id: string
  shift_name: string
  start_time: string
  end_time: string | null
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
  const [issues, setIssues] = useState<ComplianceIssue[]>([])
  const [roster, setRoster] = useState<RosterMember[]>([])
  const [pointsCalculated, setPointsCalculated] = useState(false)
  const [pointsCalculating, setPointsCalculating] = useState(false)
  const [pointsSummary, setPointsSummary] = useState<{ name: string; points: number; reason: string }[] | null>(null)
  const [shiftInfo, setShiftInfo] = useState<ShiftInfo | null>(null)

  // UI state
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'checklist' | 'uniforms' | 'temperatures' | 'issues' | 'comments' | 'alert'>('checklist')

  // ── Alert settings state ────────────────────────────────────────────────────
  type AlertSettings = { id?: string; is_enabled: boolean; alert_time: string; recipient_ids: string[] }
  type ContactProfile = { id: string; full_name: string; role: string }
  const [alertSettings, setAlertSettings] = useState<AlertSettings>({ is_enabled: false, alert_time: '15:30', recipient_ids: [] })
  const [alertContacts, setAlertContacts] = useState<ContactProfile[]>([])
  const [alertSaving, setAlertSaving] = useState(false)
  const [alertSaved, setAlertSaved] = useState(false)
  const [alertError, setAlertError] = useState<string | null>(null)
  const [selectedItem, setSelectedItem] = useState<ChecklistItem | null>(null)
  const [newComment, setNewComment] = useState('')
  const [postingComment, setPostingComment] = useState(false)

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  // ─── Load data ─────────────────────────────────────────────────────────────
  const loadData = useCallback(async (type: SessionType, silent = false) => {
    if (!STORE_ID) return
    if (!silent) setLoading(true)
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
    // Load shift info
    if (sessionData?.shift_id) {
      const { data: shiftData } = await supabase.from('store_shifts').select('id, shift_name, start_time, end_time').eq('id', sessionData.shift_id).single()
      setShiftInfo(shiftData || null)
    } else {
      setShiftInfo(null)
    }

    // Load history
    const { data: historyData } = await supabase
      .from('daily_sessions')
      .select('id, session_date, session_type, status, pdf_report_url, signed_off_at, duration_seconds')
      .eq('store_id', STORE_ID)
      .eq('session_type', type)
      .order('session_date', { ascending: false })
      .limit(25)

    setHistoryItems(historyData || [])
    if (!silent) setLoading(false)
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

    // Step 4: Load compliance issues + session roster (two-step, no FK joins needed)
    const [issuesRes, rosterRes] = await Promise.all([
      supabase.from('compliance_issues')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: false }),
      supabase.from('session_roster')
        .select('employee_id')
        .eq('session_id', sessionId),
    ])

    const rawIssues   = issuesRes.data  || []
    const rawRoster   = rosterRes.data  || []
    const rosterEmpIds = [...new Set(rawRoster.map((r: any) => r.employee_id).filter(Boolean))]

    const rosterEmpsRes = rosterEmpIds.length > 0
      ? await supabase.from('employees').select('id, full_name, role, avatar_url').in('id', rosterEmpIds)
      : { data: [] }

    const employeeMap = new Map((rosterEmpsRes.data || []).map((e: any) => [e.id, e]))

    // Also enrich issue employee names from same map + get employee IDs from issues
    const issueEmpIds = [...new Set(rawIssues.map((i: any) => i.employee_id).filter(Boolean))]
    const missingEmpIds = issueEmpIds.filter((id: string) => !employeeMap.has(id))
    if (missingEmpIds.length > 0) {
      const { data: extraEmps } = await supabase.from('employees').select('id, full_name, role, avatar_url').in('id', missingEmpIds)
      ;(extraEmps || []).forEach((e: any) => employeeMap.set(e.id, e))
    }

    const itemNameMap = new Map(enrichedItems.map((item: any) => [
      item.id,
      item.name || item.title || item.checklist_templates?.task_name || 'Checklist item'
    ]))

    // Fetch any resolver employees not already in the map
    const resolverIds = [...new Set(rawIssues.map((i: any) => i.resolved_by_employee_id).filter(Boolean))]
    const missingResolverIds = resolverIds.filter((id: string) => !employeeMap.has(id))
    if (missingResolverIds.length > 0) {
      const { data: resolverEmps } = await supabase.from('employees').select('id, full_name, role, avatar_url').in('id', missingResolverIds)
      ;(resolverEmps || []).forEach((e: any) => employeeMap.set(e.id, e))
    }

    const enrichedIssues: ComplianceIssue[] = rawIssues.map((issue: any) => ({
      ...issue,
      employee_name: issue.employee_id ? employeeMap.get(issue.employee_id)?.full_name || 'Unknown employee' : null,
      resolver_name: issue.resolved_by_employee_id ? employeeMap.get(issue.resolved_by_employee_id)?.full_name || null : null,
      checklist_item_name: issue.checklist_item_id ? itemNameMap.get(issue.checklist_item_id) || 'Checklist item' : null,
    }))

    const rosterMembers: RosterMember[] = rosterEmpIds
      .map((empId: string) => {
        const emp = employeeMap.get(empId)
        return emp ? { employee_id: empId, full_name: emp.full_name, role: emp.role || null, avatar_url: emp.avatar_url || null } : null
      })
      .filter(Boolean) as RosterMember[]

    setIssues(enrichedIssues)
    setRoster(rosterMembers)
    setPointsCalculated(false)
    setPointsSummary(null)
  }

  // Load on mount + when storeId ready
  useEffect(() => {
    if (ctxReady && STORE_ID) {
      loadData(sessionType)
      loadAlertSettings()
    }
  }, [ctxReady, STORE_ID])

  async function loadAlertSettings() {
    if (!STORE_ID) return
    // Load saved alert config
    const { data: saved } = await supabase
      .from('compliance_alert_settings')
      .select('*')
      .eq('store_id', STORE_ID)
      .single()
    if (saved) {
      setAlertSettings({
        id:            saved.id,
        is_enabled:    saved.is_enabled,
        alert_time:    saved.alert_time?.substring(0, 5) ?? '15:30',
        recipient_ids: saved.recipient_ids ?? [],
      })
    }
    // Load contacts (all profiles linked to this store)
    const { data: contacts } = await supabase
      .from('profiles')
      .select('id, full_name, role')
      .eq('store_id', STORE_ID)
      .order('full_name')
    const unique = (contacts || []).filter((p, i, arr) => arr.findIndex(x => x.full_name === p.full_name) === i)
    setAlertContacts(unique)
  }

  async function saveAlertSettings() {
    if (!STORE_ID) return
    setAlertSaving(true)
    setAlertError(null)
    const payload = {
      store_id:      STORE_ID,
      is_enabled:    alertSettings.is_enabled,
      alert_time:    alertSettings.alert_time + ':00',
      recipient_ids: alertSettings.recipient_ids,
      updated_at:    new Date().toISOString(),
    }
    let errMsg: string | null = null
    if (alertSettings.id) {
      const { error } = await supabase.from('compliance_alert_settings').update(payload).eq('id', alertSettings.id)
      if (error) errMsg = error.message
    } else {
      const { data, error } = await supabase.from('compliance_alert_settings').insert(payload).select('id').single()
      if (error) errMsg = error.message
      else if (data) setAlertSettings(p => ({ ...p, id: data.id }))
    }
    setAlertSaving(false)
    if (errMsg) {
      setAlertError(errMsg)
    } else {
      setAlertSaved(true)
      setTimeout(() => setAlertSaved(false), 2500)
    }
  }

  // Polling
  useEffect(() => {
    if (!ctxReady || !STORE_ID) return
    const iv = setInterval(() => {
      if (!isHistoricalView) loadData(sessionType, true)
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
      if (sessionData.shift_id) {
        const { data: shiftData } = await supabase.from('store_shifts').select('id, shift_name, start_time, end_time').eq('id', sessionData.shift_id).single()
        setShiftInfo(shiftData || null)
      } else {
        setShiftInfo(null)
      }
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
  const openIssuesCount    = issues.filter(i => i.status === 'open').length
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

  async function calculatePoints() {
    if (!currentSessionId || !STORE_ID) return
    setPointsCalculating(true)
    try {
      // Guard: skip if already calculated for this session
      const { data: existing } = await supabase
        .from('employee_compliance_points')
        .select('id')
        .eq('session_id', currentSessionId)
        .limit(1)
      if (existing && existing.length > 0) {
        setPointsCalculated(true)
        setPointsCalculating(false)
        return
      }

      const rows: {
        store_id: string; employee_id: string; issue_id: string | null;
        session_id: string; points: number; reason: string;
      }[] = []

      for (const issue of issues) {
        if (!issue.employee_id) continue
        if (issue.status === 'resolved' && issue.resolved_by_employee_id) {
          if (issue.resolved_by_employee_id === issue.employee_id) {
            rows.push({ store_id: STORE_ID, employee_id: issue.employee_id, issue_id: issue.id,
              session_id: currentSessionId, points: 0, reason: 'resolved_own_issue' })
          } else {
            rows.push({ store_id: STORE_ID, employee_id: issue.resolved_by_employee_id, issue_id: issue.id,
              session_id: currentSessionId, points: 3, reason: 'resolved_others_issue' })
            rows.push({ store_id: STORE_ID, employee_id: issue.employee_id, issue_id: issue.id,
              session_id: currentSessionId, points: -2, reason: 'cross_shift_fix' })
          }
        } else if (issue.status !== 'resolved') {
          rows.push({ store_id: STORE_ID, employee_id: issue.employee_id, issue_id: issue.id,
            session_id: currentSessionId, points: -3, reason: 'issue_left_unresolved' })
        }
      }

      // Clean shift bonus for anyone on the roster with no issues attributed to them
      const responsibleIds = new Set(issues.map(i => i.employee_id).filter(Boolean))
      for (const member of roster) {
        if (!responsibleIds.has(member.employee_id)) {
          rows.push({ store_id: STORE_ID, employee_id: member.employee_id, issue_id: null,
            session_id: currentSessionId, points: 1, reason: 'clean_shift_bonus' })
        }
      }

      if (rows.length > 0) {
        await supabase.from('employee_compliance_points').insert(rows)
      }

      // Build a tidy summary to show inline
      const empTotals = new Map<string, { name: string; points: number; tags: string[] }>()
      const findName = (id: string) =>
        roster.find(r => r.employee_id === id)?.full_name ||
        issues.find(i => i.employee_id === id)?.employee_name ||
        issues.find(i => i.resolved_by_employee_id === id)?.resolver_name ||
        'Unknown'
      for (const row of rows) {
        if (!empTotals.has(row.employee_id)) empTotals.set(row.employee_id, { name: findName(row.employee_id), points: 0, tags: [] })
        const e = empTotals.get(row.employee_id)!
        e.points += row.points
        const tag: Record<string, string> = {
          resolved_others_issue: "fixed another's issue (+3)",
          resolved_own_issue: 'fixed own issue',
          cross_shift_fix: 'left issue for next shift (-2)',
          issue_left_unresolved: 'issue not resolved (-3)',
          clean_shift_bonus: 'clean shift (+1)',
        }
        if (tag[row.reason]) e.tags.push(tag[row.reason])
      }
      setPointsSummary([...empTotals.values()].sort((a, b) => b.points - a.points).map(e => ({
        name: e.name, points: e.points, reason: [...new Set(e.tags)].join(' · ')
      })))
      setPointsCalculated(true)
    } catch (err) {
      console.error('Points calculation error:', err)
    } finally {
      setPointsCalculating(false)
    }
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

        {/* ── Shift + Roster strip ── */}
        {!loading && session && (shiftInfo || roster.length > 0) && (
          <div style={{ background: '#fff', border: '1.5px solid #eef2ee', borderRadius: 14, padding: '12px 20px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 16 }}>
            {shiftInfo && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 16 }}>🕐</span>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: PRIMARY }}>{shiftInfo.shift_name}</div>
                  <div style={{ fontSize: 11, color: '#9ca3af' }}>{shiftInfo.start_time?.slice(0,5)}{shiftInfo.end_time ? ` – ${shiftInfo.end_time.slice(0,5)}` : ''}</div>
                </div>
              </div>
            )}
            {shiftInfo && roster.length > 0 && <div style={{ width: 1, height: 32, background: '#e5e7eb' }} />}
            {roster.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af' }}>ON SHIFT:</span>
                {roster.map(m => (
                  <div key={m.employee_id} style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 100, padding: '3px 10px 3px 5px' }}>
                    <div style={{ width: 20, height: 20, borderRadius: '50%', background: PRIMARY, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                      {m.full_name.charAt(0).toUpperCase()}
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#166534' }}>{m.full_name.split(' ')[0]}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Open issues warning strip ── */}
        {!loading && session && openIssuesCount > 0 && (
          <div style={{ background: '#fff7ed', border: '1.5px solid #fed7aa', borderRadius: 14, padding: '12px 20px', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 20 }}>⚠️</span>
              <div>
                <div style={{ fontWeight: 700, color: '#9a3412', fontSize: 14 }}>{openIssuesCount} open issue{openIssuesCount !== 1 ? 's' : ''} flagged</div>
                <div style={{ fontSize: 12, color: '#ea580c' }}>Review the Issues tab for details and resolution status</div>
              </div>
            </div>
            <button onClick={() => setActiveTab('issues')} style={{ padding: '7px 16px', background: '#ea580c', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
              View Issues
            </button>
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
              <div style={{ display: 'flex', borderBottom: '1.5px solid #f3f4f6', overflowX: 'auto' }}>
                {(['checklist', 'uniforms', 'temperatures', 'issues', 'comments', 'alert'] as const).map(tab => (
                  <button key={tab} onClick={() => setActiveTab(tab)} style={{
                    flex: 1, padding: '14px 10px', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap',
                    background: activeTab === tab ? '#f0fdf4' : '#fff',
                    color: activeTab === tab ? PRIMARY : '#6b7280',
                    borderBottom: activeTab === tab ? `2px solid ${PRIMARY}` : '2px solid transparent',
                  }}>
                    {tab === 'checklist' ? `Checklist (${completedCount}/${totalItems})` : tab === 'uniforms' ? `Uniforms (${uniforms.length})` : tab === 'temperatures' ? `Temps (${temperatures.length})` : tab === 'issues' ? `Issues (${issues.length})` : tab === 'comments' ? `Comments (${comments.length})` : `🔔 Alert`}
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

                {/* ── Issues tab ── */}
                {activeTab === 'issues' && (
                  <div>
                    {/* Points calculation panel */}
                    <div style={{ marginBottom: 16, padding: '14px 16px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', marginBottom: 2 }}>🏆 Staff Points</div>
                        <div style={{ fontSize: 12, color: '#64748b' }}>
                          {pointsCalculated ? 'Points calculated for this session.' : 'Calculate staff points based on issues raised, resolved, and left open.'}
                        </div>
                        {pointsSummary && pointsSummary.length > 0 && (
                          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {pointsSummary.map(emp => (
                              <div key={emp.name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <div style={{ width: 24, height: 24, borderRadius: '50%', background: emp.points > 0 ? '#16a34a' : emp.points < 0 ? '#dc2626' : '#6b7280', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                                  {emp.name.charAt(0)}
                                </div>
                                <span style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', minWidth: 100 }}>{emp.name}</span>
                                <span style={{ fontSize: 14, fontWeight: 700, color: emp.points > 0 ? '#16a34a' : emp.points < 0 ? '#dc2626' : '#6b7280', minWidth: 36 }}>
                                  {emp.points > 0 ? '+' : ''}{emp.points}
                                </span>
                                <span style={{ fontSize: 11, color: '#94a3b8' }}>{emp.reason}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        {pointsCalculated && (!pointsSummary || pointsSummary.length === 0) && (
                          <div style={{ marginTop: 6, fontSize: 12, color: '#16a34a' }}>✓ No pointable events this session.</div>
                        )}
                      </div>
                      {!pointsCalculated && (
                        <button
                          onClick={calculatePoints}
                          disabled={pointsCalculating}
                          style={{ flexShrink: 0, padding: '8px 16px', borderRadius: 8, border: 'none', cursor: pointsCalculating ? 'default' : 'pointer', background: pointsCalculating ? '#94a3b8' : '#1a3a2a', color: '#fff', fontSize: 13, fontWeight: 600 }}
                        >
                          {pointsCalculating ? 'Calculating…' : 'Calculate Points'}
                        </button>
                      )}
                      {pointsCalculated && (
                        <div style={{ flexShrink: 0, padding: '8px 12px', borderRadius: 8, background: '#dcfce7', color: '#16a34a', fontSize: 12, fontWeight: 600 }}>✓ Done</div>
                      )}
                    </div>

                    {issues.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '40px 0', color: '#9ca3af' }}>
                        <div style={{ fontSize: 36, marginBottom: 10 }}>✅</div>
                        <div style={{ fontSize: 15, fontWeight: 600 }}>No issues flagged for this session</div>
                        <div style={{ fontSize: 13, marginTop: 6 }}>All checklist items and uniforms were compliant</div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {/* Open issues first */}
                        {issues.filter(i => i.status === 'open').length > 0 && (
                          <div style={{ fontSize: 12, fontWeight: 700, color: '#dc2626', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>⚠️ Open Issues</div>
                        )}
                        {issues.filter(i => i.status === 'open').map(issue => (
                          <div key={issue.id} style={{ background: '#fff5f5', border: '1.5px solid #fecaca', borderRadius: 14, padding: '14px 16px', display: 'flex', gap: 14 }}>
                            {issue.photo_url && (
                              <img src={issue.photo_url} alt="Issue" style={{ width: 72, height: 72, borderRadius: 10, objectFit: 'cover', flexShrink: 0, border: '1px solid #fca5a5' }} />
                            )}
                            <div style={{ flex: 1 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                {issue.is_uniform_violation && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 100, background: '#fee2e2', color: '#dc2626' }}>👕 UNIFORM</span>}
                                {issue.checklist_item_name && <span style={{ fontSize: 11, fontWeight: 700, color: '#6b7280' }}>{issue.checklist_item_name}</span>}
                              </div>
                              <div style={{ fontSize: 13, fontWeight: 600, color: '#111', marginBottom: 6 }}>{issue.description}</div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                {issue.employee_name && (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                    <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 700, color: '#fff' }}>
                                      {issue.employee_name.charAt(0)}
                                    </div>
                                    <span style={{ fontSize: 11, fontWeight: 600, color: '#dc2626' }}>{issue.employee_name}</span>
                                  </div>
                                )}
                                <span style={{ fontSize: 11, color: '#9ca3af' }}>{new Date(issue.created_at).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}</span>
                              </div>
                            </div>
                            <div style={{ flexShrink: 0 }}>
                              <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 100, background: '#fee2e2', color: '#dc2626' }}>OPEN</span>
                            </div>
                          </div>
                        ))}

                        {/* Resolved issues */}
                        {issues.filter(i => i.status === 'resolved').length > 0 && (
                          <div style={{ fontSize: 12, fontWeight: 700, color: '#16a34a', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '8px 0 4px' }}>✓ Resolved</div>
                        )}
                        {issues.filter(i => i.status === 'resolved').map(issue => (
                          <div key={issue.id} style={{ background: '#f0fdf4', border: '1.5px solid #bbf7d0', borderRadius: 14, padding: '14px 16px', display: 'flex', gap: 14 }}>
                            {issue.photo_url && (
                              <img src={issue.photo_url} alt="Issue" style={{ width: 72, height: 72, borderRadius: 10, objectFit: 'cover', flexShrink: 0, border: '1px solid #86efac' }} />
                            )}
                            <div style={{ flex: 1 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                {issue.is_uniform_violation && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 100, background: '#dcfce7', color: '#16a34a' }}>👕 UNIFORM</span>}
                                {issue.checklist_item_name && <span style={{ fontSize: 11, fontWeight: 700, color: '#6b7280' }}>{issue.checklist_item_name}</span>}
                              </div>
                              <div style={{ fontSize: 13, fontWeight: 600, color: '#111', marginBottom: 4 }}>{issue.description}</div>
                              {issue.resolution_note && (
                                <div style={{ fontSize: 12, color: '#16a34a', marginBottom: 6 }}>✓ {issue.resolution_note}</div>
                              )}
                              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                {issue.employee_name && (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                    <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#6b7280', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 700, color: '#fff' }}>
                                      {issue.employee_name.charAt(0)}
                                    </div>
                                    <span style={{ fontSize: 11, color: '#6b7280' }}>👤 {issue.employee_name}</span>
                                  </div>
                                )}
                                {issue.resolver_name && (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                    <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 700, color: '#fff' }}>
                                      {issue.resolver_name.charAt(0)}
                                    </div>
                                    <span style={{ fontSize: 11, fontWeight: 600, color: '#16a34a' }}>🔧 {issue.resolver_name}</span>
                                  </div>
                                )}
                                {issue.resolved_at && <span style={{ fontSize: 11, color: '#9ca3af' }}>Fixed {new Date(issue.resolved_at).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}</span>}
                              </div>
                            </div>
                            <div style={{ flexShrink: 0 }}>
                              <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 100, background: '#dcfce7', color: '#16a34a' }}>RESOLVED</span>
                            </div>
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

                {/* ── Alert settings tab ── */}
                {activeTab === 'alert' && (
                  <div>
                    <div style={{ marginBottom: 20 }}>
                      <div style={{ fontSize: 15, fontWeight: 800, color: '#111', marginBottom: 4 }}>Compliance Alert</div>
                      <div style={{ fontSize: 13, color: '#6b7280' }}>
                        Automatically notify selected staff when unresolved compliance issues exist at the chosen time.
                      </div>
                    </div>

                    {/* Enable toggle */}
                    <div style={{ background: alertSettings.is_enabled ? '#f0fdf4' : '#f9fafb', border: `1.5px solid ${alertSettings.is_enabled ? '#86efac' : '#e5e7eb'}`, borderRadius: 14, padding: '16px 18px', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14, color: '#111' }}>Enable daily alert</div>
                        <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>Sends a push notification and in-app message if issues are still open at the alert time</div>
                      </div>
                      <button
                        onClick={() => setAlertSettings(p => ({ ...p, is_enabled: !p.is_enabled }))}
                        style={{ width: 48, height: 26, borderRadius: 13, border: 'none', cursor: 'pointer', position: 'relative', background: alertSettings.is_enabled ? PRIMARY : '#d1d5db', transition: 'background 0.2s' }}
                      >
                        <span style={{ position: 'absolute', top: 3, left: alertSettings.is_enabled ? 24 : 3, width: 20, height: 20, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.3)', transition: 'left 0.2s', display: 'block' }} />
                      </button>
                    </div>

                    {/* Alert time */}
                    <div style={{ marginBottom: 16 }}>
                      <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 6 }}>Alert time</label>
                      <input
                        type="time"
                        value={alertSettings.alert_time}
                        onChange={e => setAlertSettings(p => ({ ...p, alert_time: e.target.value }))}
                        style={{ padding: '10px 14px', borderRadius: 10, border: '1.5px solid #d1d5db', fontSize: 14, fontWeight: 700, color: '#111', outline: 'none', background: '#fff' }}
                      />
                      <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>The alert fires at this time every day if there are open issues</div>
                    </div>

                    {/* Contact selector */}
                    <div style={{ marginBottom: 24 }}>
                      <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 10 }}>
                        Send alert to ({alertSettings.recipient_ids.length} selected)
                      </label>
                      {alertContacts.length === 0 ? (
                        <div style={{ fontSize: 13, color: '#9ca3af', padding: '12px 0' }}>No contacts found for this store</div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {alertContacts.map(contact => {
                            const selected = alertSettings.recipient_ids.includes(contact.id)
                            return (
                              <div
                                key={contact.id}
                                onClick={() => setAlertSettings(p => ({
                                  ...p,
                                  recipient_ids: selected
                                    ? p.recipient_ids.filter(id => id !== contact.id)
                                    : [...p.recipient_ids, contact.id],
                                }))}
                                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 10, border: `1.5px solid ${selected ? '#86efac' : '#e5e7eb'}`, background: selected ? '#f0fdf4' : '#fff', cursor: 'pointer' }}
                              >
                                <div style={{ width: 20, height: 20, borderRadius: 5, border: `2px solid ${selected ? PRIMARY : '#d1d5db'}`, background: selected ? PRIMARY : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                  {selected && <span style={{ color: '#fff', fontSize: 13, fontWeight: 900, lineHeight: 1 }}>✓</span>}
                                </div>
                                <div style={{ flex: 1 }}>
                                  <div style={{ fontSize: 13, fontWeight: 700, color: '#111' }}>{contact.full_name}</div>
                                  <div style={{ fontSize: 11, color: '#9ca3af', textTransform: 'capitalize' }}>{contact.role}</div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>

                    {/* Save button */}
                    <button
                      onClick={saveAlertSettings}
                      disabled={alertSaving}
                      style={{ padding: '12px 28px', background: alertSaved ? '#16a34a' : PRIMARY, color: '#fff', border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 800, cursor: alertSaving ? 'not-allowed' : 'pointer', opacity: alertSaving ? 0.7 : 1 }}
                    >
                      {alertSaving ? 'Saving…' : alertSaved ? '✓ Saved' : 'Save Alert Settings'}
                    </button>
                    {alertError && (
                      <div style={{ marginTop: 10, padding: '10px 14px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, color: '#dc2626', fontSize: 13 }}>
                        ⚠️ Save failed: {alertError}
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
