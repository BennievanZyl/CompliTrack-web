'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useRouter } from 'next/navigation'

const PRIMARY = '#386641'
const DANGER  = '#dc2626'
const WARN    = '#d97706'

type IssueRow = {
  id: string
  session_id: string
  checklist_item_id: string | null
  store_id: string
  employee_id: string | null
  description: string
  photo_url: string | null
  is_uniform_violation: boolean | null
  status: string
  created_at: string
  resolved_at: string | null
  resolution_note: string | null
  resolution_photo_url: string | null
  // enriched
  employee_name: string | null
  session_date: string | null
  shift_name: string | null
  store_name: string | null
  checklist_item_name: string | null
}

type SortKey = 'created_at' | 'employee_name' | 'store_name'
type FilterStatus = 'open' | 'resolved' | 'all'

export default function IssuesPage() {
  const supabase = createClientComponentClient()
  const router   = useRouter()

  const [issues,         setIssues]         = useState<IssueRow[]>([])
  const [loading,        setLoading]        = useState(true)
  const [filterStatus,   setFilterStatus]   = useState<FilterStatus>('open')
  const [filterType,     setFilterType]     = useState<'all' | 'uniform' | 'checklist'>('all')
  const [sortKey,        setSortKey]        = useState<SortKey>('created_at')
  const [selectedIssue,  setSelectedIssue]  = useState<IssueRow | null>(null)
  const [resolveNote,    setResolveNote]    = useState('')
  const [resolving,      setResolving]      = useState(false)

  const loadIssues = useCallback(async () => {
    setLoading(true)
    try {
      // Step 1: fetch base compliance_issues
      const { data: rawIssues, error } = await supabase
        .from('compliance_issues')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error
      if (!rawIssues || rawIssues.length === 0) { setIssues([]); return }

      // Step 2: collect IDs for enrichment
      const sessionIds  = [...new Set(rawIssues.map((i: any) => i.session_id).filter(Boolean))]
      const employeeIds = [...new Set(rawIssues.map((i: any) => i.employee_id).filter(Boolean))]
      const itemIds     = [...new Set(rawIssues.map((i: any) => i.checklist_item_id).filter(Boolean))]

      const [sessionsRes, employeesRes, itemsRes] = await Promise.all([
        sessionIds.length  > 0 ? supabase.from('daily_sessions').select('id, session_date, shift_id, store_id').in('id', sessionIds)        : { data: [] },
        employeeIds.length > 0 ? supabase.from('employees').select('id, full_name').in('id', employeeIds)                                    : { data: [] },
        itemIds.length     > 0 ? supabase.from('checklist_templates').select('id, task_name').in('id', itemIds)                              : { data: [] },
      ])

      const sessionMap  = new Map((sessionsRes.data  || []).map((s: any) => [s.id, s]))
      const employeeMap = new Map((employeesRes.data || []).map((e: any) => [e.id, e]))
      const itemMap     = new Map((itemsRes.data     || []).map((t: any) => [t.id, t]))

      // Step 3: get shift names for sessions that have shift_id
      const shiftIds  = [...new Set((sessionsRes.data || []).map((s: any) => s.shift_id).filter(Boolean))]
      const storeIds  = [...new Set((sessionsRes.data || []).map((s: any) => s.store_id).filter(Boolean))]

      const [shiftsRes, storesRes] = await Promise.all([
        shiftIds.length > 0 ? supabase.from('store_shifts').select('id, shift_name').in('id', shiftIds) : { data: [] },
        storeIds.length > 0 ? supabase.from('stores').select('id, name').in('id', storeIds)             : { data: [] },
      ])

      const shiftMap = new Map((shiftsRes.data || []).map((s: any) => [s.id, s]))
      const storeMap = new Map((storesRes.data || []).map((s: any) => [s.id, s]))

      // Step 4: also enrich checklist_items to get template ids
      const checklistItemIds = [...new Set(rawIssues.map((i: any) => i.checklist_item_id).filter(Boolean))]
      let checklistItemMap = new Map<string, string>()
      if (checklistItemIds.length > 0) {
        const { data: ciRows } = await supabase.from('checklist_items').select('id, template_id').in('id', checklistItemIds)
        ;(ciRows || []).forEach((ci: any) => {
          if (ci.template_id && itemMap.has(ci.template_id)) {
            checklistItemMap.set(ci.id, itemMap.get(ci.template_id)?.task_name || 'Checklist item')
          }
        })
      }

      const enriched: IssueRow[] = rawIssues.map((issue: any) => {
        const session  = sessionMap.get(issue.session_id)
        const shift    = session?.shift_id  ? shiftMap.get(session.shift_id)  : null
        const store    = session?.store_id  ? storeMap.get(session.store_id)  : null
        const employee = issue.employee_id  ? employeeMap.get(issue.employee_id) : null
        const itemName = issue.checklist_item_id ? checklistItemMap.get(issue.checklist_item_id) || null : null

        return {
          ...issue,
          employee_name:        employee?.full_name || null,
          session_date:         session?.session_date || null,
          shift_name:           shift?.shift_name || null,
          store_name:           store?.name || null,
          checklist_item_name:  itemName,
        }
      })

      setIssues(enriched)
    } catch (err) {
      console.error('loadIssues error', err)
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => { loadIssues() }, [loadIssues])

  const resolveIssue = async () => {
    if (!selectedIssue) return
    setResolving(true)
    try {
      const { error } = await supabase
        .from('compliance_issues')
        .update({
          status:          'resolved',
          resolved_at:     new Date().toISOString(),
          resolution_note: resolveNote.trim() || null,
        })
        .eq('id', selectedIssue.id)

      if (!error) {
        setSelectedIssue(null)
        setResolveNote('')
        await loadIssues()
      }
    } finally {
      setResolving(false)
    }
  }

  // ── Derived display list ────────────────────────────────────────────────────
  const filtered = issues
    .filter(i => filterStatus === 'all' || i.status === filterStatus)
    .filter(i => filterType   === 'all' || (filterType === 'uniform' ? i.is_uniform_violation : !i.is_uniform_violation))
    .sort((a, b) => {
      if (sortKey === 'created_at')   return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      if (sortKey === 'employee_name') return (a.employee_name || '').localeCompare(b.employee_name || '')
      return (a.store_name || '').localeCompare(b.store_name || '')
    })

  const openCount     = issues.filter(i => i.status === 'open').length
  const resolvedCount = issues.filter(i => i.status === 'resolved').length
  const uniformCount  = issues.filter(i => i.status === 'open' && i.is_uniform_violation).length

  // ── Styles ──────────────────────────────────────────────────────────────────
  const card = (extra?: object) => ({
    background: '#fff',
    borderRadius: 16,
    padding: '20px 24px',
    border: '1.5px solid #eef2ee',
    ...extra,
  })

  const badge = (bg: string, color: string) => ({
    display: 'inline-flex', alignItems: 'center', gap: 4,
    fontSize: 11, fontWeight: 700, padding: '3px 10px',
    borderRadius: 100, background: bg, color,
  })

  const btn = (bg: string, color: string, extra?: object) => ({
    padding: '8px 18px', background: bg, color,
    border: 'none', borderRadius: 10, cursor: 'pointer',
    fontSize: 13, fontWeight: 700, ...extra,
  })

  const formatDate = (d: string | null) => {
    if (!d) return '—'
    return new Date(d).toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short' })
  }

  const ageLabel = (d: string) => {
    const hours = Math.floor((Date.now() - new Date(d).getTime()) / 36e5)
    if (hours < 1)   return 'Just now'
    if (hours < 24)  return `${hours}h ago`
    const days = Math.floor(hours / 24)
    return `${days}d ago`
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f8faf8', fontFamily: "'Inter', system-ui, sans-serif" }}>

      {/* ── Top bar ── */}
      <div style={{ background: PRIMARY, color: '#fff', padding: '0 32px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', alignItems: 'center', height: 60, gap: 16 }}>
          <button
            onClick={() => router.back()}
            style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
          >
            ← Back
          </button>
          <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.3px' }}>Flagged Issues</span>
          {openCount > 0 && (
            <span style={{ background: DANGER, color: '#fff', fontSize: 12, fontWeight: 800, padding: '2px 10px', borderRadius: 100 }}>
              {openCount} open
            </span>
          )}
          <div style={{ flex: 1 }} />
          <button
            onClick={loadIssues}
            style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 13 }}
          >
            ↻ Refresh
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 24px' }}>

        {/* ── Summary cards ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, marginBottom: 24 }}>
          {[
            { label: 'Open Issues',     value: openCount,     bg: '#fff5f5', border: '#fecaca', val: DANGER },
            { label: 'Resolved',        value: resolvedCount, bg: '#f0fdf4', border: '#bbf7d0', val: '#16a34a' },
            { label: 'Uniform Issues',  value: uniformCount,  bg: '#fff7ed', border: '#fed7aa', val: WARN },
            { label: 'Total Logged',    value: issues.length, bg: '#f8faf8', border: '#e5e7eb', val: '#374151' },
          ].map(({ label, value, bg, border, val }) => (
            <div key={label} style={{ background: bg, border: `1.5px solid ${border}`, borderRadius: 14, padding: '14px 18px' }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: val }}>{value}</div>
              <div style={{ fontSize: 12, color: '#6b7280', fontWeight: 600, marginTop: 2 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* ── Filters ── */}
        <div style={{ ...card(), marginBottom: 20, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['open', 'resolved', 'all'] as FilterStatus[]).map(s => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                style={{ ...btn(filterStatus === s ? PRIMARY : '#f3f4f6', filterStatus === s ? '#fff' : '#374151') }}
              >
                {s === 'open' ? '⚠️ Open' : s === 'resolved' ? '✓ Resolved' : 'All'}
              </button>
            ))}
          </div>
          <div style={{ width: 1, height: 28, background: '#e5e7eb' }} />
          <div style={{ display: 'flex', gap: 6 }}>
            {(['all', 'uniform', 'checklist'] as const).map(t => (
              <button
                key={t}
                onClick={() => setFilterType(t)}
                style={{ ...btn(filterType === t ? '#1e40af' : '#f3f4f6', filterType === t ? '#fff' : '#374151') }}
              >
                {t === 'all' ? 'All types' : t === 'uniform' ? '👕 Uniform' : '☑ Checklist'}
              </button>
            ))}
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 600 }}>Sort:</span>
            <select
              value={sortKey}
              onChange={e => setSortKey(e.target.value as SortKey)}
              style={{ padding: '6px 12px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: 13, background: '#fff', cursor: 'pointer' }}
            >
              <option value="created_at">Newest first</option>
              <option value="employee_name">Employee A–Z</option>
              <option value="store_name">Store A–Z</option>
            </select>
          </div>
        </div>

        {/* ── Issues list ── */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af' }}>
            <div style={{ fontSize: 15 }}>Loading issues…</div>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ ...card(), textAlign: 'center', padding: 60 }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>✅</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#111' }}>
              {filterStatus === 'open' ? 'No open issues' : 'No issues found'}
            </div>
            <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 6 }}>
              {filterStatus === 'open' ? 'All flagged items have been resolved' : 'Try changing the filters above'}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filtered.map(issue => (
              <div
                key={issue.id}
                style={{
                  ...card(),
                  display: 'flex', gap: 16, alignItems: 'flex-start',
                  borderColor: issue.status === 'open' ? '#fecaca' : '#bbf7d0',
                  background: issue.status === 'open' ? '#fff5f5' : '#f0fdf4',
                  cursor: 'pointer',
                  transition: 'box-shadow 0.1s',
                }}
                onClick={() => { setSelectedIssue(issue); setResolveNote('') }}
              >
                {/* Photo */}
                {issue.photo_url ? (
                  <img
                    src={issue.photo_url}
                    alt="Issue"
                    style={{ width: 80, height: 80, borderRadius: 10, objectFit: 'cover', flexShrink: 0, border: `1.5px solid ${issue.status === 'open' ? '#fca5a5' : '#86efac'}` }}
                  />
                ) : (
                  <div style={{ width: 80, height: 80, borderRadius: 10, background: issue.status === 'open' ? '#fee2e2' : '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, flexShrink: 0 }}>
                    {issue.is_uniform_violation ? '👕' : '☑️'}
                  </div>
                )}

                {/* Body */}
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={badge(issue.status === 'open' ? '#fee2e2' : '#dcfce7', issue.status === 'open' ? DANGER : '#16a34a')}>
                      {issue.status === 'open' ? '⚠️ OPEN' : '✓ RESOLVED'}
                    </span>
                    {issue.is_uniform_violation && (
                      <span style={badge('#fff7ed', WARN)}>👕 UNIFORM</span>
                    )}
                    {issue.checklist_item_name && (
                      <span style={badge('#f3f4f6', '#374151')}>{issue.checklist_item_name}</span>
                    )}
                  </div>

                  <div style={{ fontSize: 15, fontWeight: 700, color: '#111', marginBottom: 6 }}>{issue.description}</div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
                    {issue.employee_name && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <div style={{ width: 20, height: 20, borderRadius: '50%', background: issue.status === 'open' ? DANGER : '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: '#fff' }}>
                          {issue.employee_name.charAt(0)}
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 600, color: issue.status === 'open' ? DANGER : '#16a34a' }}>{issue.employee_name}</span>
                      </div>
                    )}
                    {issue.shift_name && (
                      <span style={{ fontSize: 12, color: '#6b7280' }}>🕐 {issue.shift_name}</span>
                    )}
                    {issue.session_date && (
                      <span style={{ fontSize: 12, color: '#6b7280' }}>📅 {formatDate(issue.session_date)}</span>
                    )}
                    {issue.store_name && (
                      <span style={{ fontSize: 12, color: '#6b7280' }}>🏪 {issue.store_name}</span>
                    )}
                    <span style={{ fontSize: 12, color: '#9ca3af' }}>{ageLabel(issue.created_at)}</span>
                  </div>

                  {issue.resolution_note && (
                    <div style={{ marginTop: 8, fontSize: 12, color: '#16a34a', background: '#dcfce7', borderRadius: 8, padding: '5px 10px' }}>
                      ✓ {issue.resolution_note}
                    </div>
                  )}
                </div>

                {/* Action caret */}
                <div style={{ color: '#9ca3af', fontSize: 18, flexShrink: 0 }}>›</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Resolve modal ── */}
      {selectedIssue && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}
          onClick={() => setSelectedIssue(null)}
        >
          <div
            style={{ background: '#fff', borderRadius: 20, padding: 28, maxWidth: 540, width: '100%', maxHeight: '90vh', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#111' }}>Issue Detail</div>
                {selectedIssue.session_date && (
                  <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>
                    {formatDate(selectedIssue.session_date)}{selectedIssue.shift_name ? ` · ${selectedIssue.shift_name}` : ''}
                  </div>
                )}
              </div>
              <button onClick={() => setSelectedIssue(null)} style={{ background: '#f3f4f6', border: 'none', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 14, color: '#374151' }}>✕</button>
            </div>

            {selectedIssue.photo_url && (
              <img src={selectedIssue.photo_url} alt="Issue" style={{ width: '100%', borderRadius: 14, objectFit: 'cover', maxHeight: 240, marginBottom: 16, border: '1.5px solid #e5e7eb' }} />
            )}

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              <span style={badge(selectedIssue.status === 'open' ? '#fee2e2' : '#dcfce7', selectedIssue.status === 'open' ? DANGER : '#16a34a')}>
                {selectedIssue.status === 'open' ? '⚠️ OPEN' : '✓ RESOLVED'}
              </span>
              {selectedIssue.is_uniform_violation && <span style={badge('#fff7ed', WARN)}>👕 UNIFORM ISSUE</span>}
              {selectedIssue.checklist_item_name  && <span style={badge('#f3f4f6', '#374151')}>{selectedIssue.checklist_item_name}</span>}
            </div>

            <div style={{ fontSize: 16, fontWeight: 700, color: '#111', marginBottom: 12 }}>{selectedIssue.description}</div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
              {selectedIssue.employee_name && (
                <div style={{ background: '#f8faf8', borderRadius: 10, padding: '10px 14px' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Employee</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#111', marginTop: 2 }}>{selectedIssue.employee_name}</div>
                </div>
              )}
              {selectedIssue.session_date && (
                <div style={{ background: '#f8faf8', borderRadius: 10, padding: '10px 14px' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Session Date</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#111', marginTop: 2 }}>{formatDate(selectedIssue.session_date)}</div>
                </div>
              )}
              {selectedIssue.shift_name && (
                <div style={{ background: '#f8faf8', borderRadius: 10, padding: '10px 14px' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Shift</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#111', marginTop: 2 }}>{selectedIssue.shift_name}</div>
                </div>
              )}
              {selectedIssue.store_name && (
                <div style={{ background: '#f8faf8', borderRadius: 10, padding: '10px 14px' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Store</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#111', marginTop: 2 }}>{selectedIssue.store_name}</div>
                </div>
              )}
            </div>

            {selectedIssue.status === 'resolved' ? (
              <div>
                {selectedIssue.resolution_note && (
                  <div style={{ background: '#f0fdf4', border: '1.5px solid #bbf7d0', borderRadius: 12, padding: '12px 16px', marginBottom: 16 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#16a34a', marginBottom: 4 }}>RESOLUTION NOTE</div>
                    <div style={{ fontSize: 14, color: '#166534' }}>{selectedIssue.resolution_note}</div>
                  </div>
                )}
                {selectedIssue.resolved_at && (
                  <div style={{ fontSize: 12, color: '#9ca3af', textAlign: 'center' }}>
                    Resolved {new Date(selectedIssue.resolved_at).toLocaleString('en-ZA')}
                  </div>
                )}
                <button
                  onClick={() => setSelectedIssue(null)}
                  style={{ ...btn('#f3f4f6', '#374151', { width: '100%', marginTop: 16 }) }}
                >
                  Close
                </button>
              </div>
            ) : (
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 6 }}>
                  Resolution note <span style={{ color: '#9ca3af', fontWeight: 400 }}>(optional)</span>
                </label>
                <textarea
                  value={resolveNote}
                  onChange={e => setResolveNote(e.target.value)}
                  placeholder="Describe how this issue was resolved…"
                  rows={3}
                  style={{ width: '100%', padding: '10px 14px', border: '1.5px solid #e5e7eb', borderRadius: 10, fontSize: 14, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box', outline: 'none' }}
                />
                <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                  <button
                    onClick={() => setSelectedIssue(null)}
                    style={{ ...btn('#f3f4f6', '#374151', { flex: 1 }) }}
                    disabled={resolving}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={resolveIssue}
                    disabled={resolving}
                    style={{ ...btn('#16a34a', '#fff', { flex: 1, opacity: resolving ? 0.6 : 1 }) }}
                  >
                    {resolving ? 'Resolving…' : '✓ Mark as Resolved'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
