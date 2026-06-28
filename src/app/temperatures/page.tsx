'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

const STORE_ID = '05328298-fc27-4c9f-b091-bb7f6598b601'

type TempLog = {
  id: string
  session_id: string
  equipment_name: string
  equipment_type: string
  temperature_c: number
  period: string
  logged_at: string
  logged_by: string | null
  is_compliant: boolean
}

type Session = {
  id: string
  session_date: string
  session_type: string
  status: string
}

const PERIOD_LABELS: Record<string, string> = {
  opening: '🌅 Opening',
  midday: '☀️ Midday',
  closing: '🌙 Closing',
}

const EQUIPMENT_RANGES: Record<string, { min: number; max: number; label: string }> = {
  Freezer: { min: -25, max: -15, label: '-25°C to -15°C' },
  Fridge: { min: 1, max: 4, label: '1°C to 4°C' },
  'Hot Hold': { min: 63, max: 85, label: '63°C+' },
  'Display Fridge': { min: 1, max: 8, label: '1°C to 8°C' },
}

function getTempStatus(log: TempLog) {
  if (log.is_compliant) return { color: '#16a34a', bg: '#dcfce7', label: 'Compliant' }
  return { color: '#dc2626', bg: '#fee2e2', label: 'Non-compliant' }
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}

function formatTime(d: string) {
  return new Date(d).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })
}

export default function TemperaturesPage() {
  const router = useRouter()
  const [sessions, setSessions] = useState<Session[]>([])
  const [logs, setLogs] = useState<TempLog[]>([])
  const [selectedSession, setSelectedSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [filterPeriod, setFilterPeriod] = useState('all')
  const [filterCompliance, setFilterCompliance] = useState('all')
  const [dateRange, setDateRange] = useState(7) // days

  useEffect(() => { loadSessions() }, [dateRange])
  useEffect(() => { if (selectedSession) loadLogs(selectedSession.id) }, [selectedSession])

  async function loadSessions() {
    setLoading(true)
    const from = new Date(Date.now() - dateRange * 86400000).toISOString().split('T')[0]
    const { data: sessionData } = await supabase
      .from('daily_sessions')
      .select('id, session_date, session_type, status')
      .eq('store_id', STORE_ID)
      .gte('session_date', from)
      .order('session_date', { ascending: false })

    // Only keep sessions that have temp logs
    if (sessionData && sessionData.length > 0) {
      const { data: tempSessions } = await supabase
        .from('temperature_logs')
        .select('session_id')
        .in('session_id', sessionData.map(s => s.id))

      const sessionsWithLogs = new Set(tempSessions?.map(t => t.session_id) || [])
      const filtered = sessionData.filter(s => sessionsWithLogs.has(s.id))
      setSessions(filtered)
      if (filtered.length > 0 && !selectedSession) {
        setSelectedSession(filtered[0])
      }
    } else {
      setSessions([])
    }
    setLoading(false)
  }

  async function loadLogs(sessionId: string) {
    const { data } = await supabase
      .from('temperature_logs')
      .select('*')
      .eq('session_id', sessionId)
      .order('logged_at')
    setLogs(data || [])
  }

  // Filter logs
  const filteredLogs = logs.filter(log => {
    if (filterPeriod !== 'all' && log.period !== filterPeriod) return false
    if (filterCompliance === 'compliant' && !log.is_compliant) return false
    if (filterCompliance === 'non-compliant' && log.is_compliant) return false
    return true
  })

  // Stats
  const totalLogs = filteredLogs.length
  const compliantCount = filteredLogs.filter(l => l.is_compliant).length
  const nonCompliantCount = totalLogs - compliantCount
  const complianceRate = totalLogs > 0 ? Math.round((compliantCount / totalLogs) * 100) : 0

  // Group by equipment
  const byEquipment = filteredLogs.reduce((acc, log) => {
    const key = log.equipment_name
    if (!acc[key]) acc[key] = []
    acc[key].push(log)
    return acc
  }, {} as Record<string, TempLog[]>)

  // Group by period
  const byPeriod = filteredLogs.reduce((acc, log) => {
    const key = log.period || 'unknown'
    if (!acc[key]) acc[key] = []
    acc[key].push(log)
    return acc
  }, {} as Record<string, TempLog[]>)

  const periods = [...new Set(logs.map(l => l.period))].filter(Boolean)

  return (
    <div style={{ minHeight: '100vh', background: '#f0f4f0', fontFamily: 'system-ui, sans-serif' }}>
      {/* Header */}
      <header style={{ background: 'linear-gradient(135deg, #0a1f12 0%, #1a5c38 100%)', position: 'sticky', top: 0, zIndex: 10, padding: '0 40px' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '72px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>🌡️</div>
            <div>
              <div style={{ fontWeight: 800, fontSize: '16px', color: 'white' }}>CompliTrack</div>
              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.55)' }}>Temperature Logs</div>
            </div>
          </div>
          <button onClick={() => router.push('/dashboard')} style={{ padding: '8px 16px', border: '1.5px solid rgba(255,255,255,0.4)', borderRadius: '10px', fontSize: '13px', fontWeight: 700, color: 'white', background: 'rgba(255,255,255,0.15)', cursor: 'pointer' }}>← Dashboard</button>
        </div>
      </header>

      {/* Hero */}
      <div style={{ background: 'linear-gradient(135deg, #0a1f12 0%, #1a5c38 100%)', padding: '40px 40px 100px' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <h1 style={{ fontSize: '32px', fontWeight: 800, color: 'white', margin: '0 0 6px', letterSpacing: '-0.5px' }}>Temperature Logs 🌡️</h1>
          <p style={{ fontSize: '15px', color: 'rgba(255,255,255,0.6)', margin: 0 }}>Equipment temperature monitoring and compliance tracking</p>
        </div>
      </div>

      <main style={{ maxWidth: '1200px', margin: '-60px auto 0', padding: '0 40px 60px', position: 'relative', zIndex: 1 }}>

        {/* KPI strip */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
          {[
            { label: 'Total Readings', value: String(totalLogs), color: '#111', border: '#eef2ee' },
            { label: 'Compliant', value: String(compliantCount), color: '#16a34a', border: '#bbf7d0' },
            { label: 'Non-Compliant', value: String(nonCompliantCount), color: '#dc2626', border: '#fecaca' },
            { label: 'Compliance Rate', value: `${complianceRate}%`, color: complianceRate >= 90 ? '#16a34a' : complianceRate >= 70 ? '#d97706' : '#dc2626', border: '#eef2ee' },
          ].map((k, i) => (
            <div key={i} style={{ background: 'white', borderRadius: '20px', border: `1.5px solid ${k.border}`, padding: '20px 24px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', textAlign: 'center' }}>
              <div style={{ fontSize: '28px', fontWeight: 800, color: k.color }}>{k.value}</div>
              <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '4px' }}>{k.label}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '24px' }}>

          {/* Session list sidebar */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* Date range filter */}
            <div style={{ background: 'white', borderRadius: '16px', border: '1.5px solid #eef2ee', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>Date Range</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {[
                  { label: 'Last 7 days', value: 7 },
                  { label: 'Last 14 days', value: 14 },
                  { label: 'Last 30 days', value: 30 },
                  { label: 'Last 90 days', value: 90 },
                ].map(opt => (
                  <button key={opt.value} onClick={() => setDateRange(opt.value)} style={{ padding: '8px 12px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 600, textAlign: 'left', background: dateRange === opt.value ? '#1a5c38' : '#f9fafb', color: dateRange === opt.value ? 'white' : '#374151' }}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Session list */}
            <div style={{ background: 'white', borderRadius: '16px', border: '1.5px solid #eef2ee', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
              <div style={{ padding: '12px 16px', background: '#f9fafb', fontWeight: 700, fontSize: '13px', color: '#111', borderBottom: '1px solid #e5e7eb' }}>
                Sessions ({sessions.length})
              </div>
              {loading ? (
                <div style={{ padding: '24px', textAlign: 'center', color: '#9ca3af', fontSize: '13px' }}>Loading...</div>
              ) : sessions.length === 0 ? (
                <div style={{ padding: '24px', textAlign: 'center', color: '#9ca3af', fontSize: '13px' }}>No temperature logs found</div>
              ) : sessions.map(session => (
                <div key={session.id} onClick={() => setSelectedSession(session)} style={{ padding: '12px 16px', borderTop: '1px solid #f3f4f6', cursor: 'pointer', background: selectedSession?.id === session.id ? '#f0fdf4' : 'white', borderLeft: selectedSession?.id === session.id ? '3px solid #1a5c38' : '3px solid transparent' }}>
                  <div style={{ fontWeight: 700, fontSize: '13px', color: '#111' }}>{formatDate(session.session_date)}</div>
                  <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                    <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '100px', background: '#e8f5e9', color: '#1a5c38' }}>{session.session_type}</span>
                    <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '100px', background: session.status === 'signed_off' ? '#dcfce7' : '#fef3c7', color: session.status === 'signed_off' ? '#166534' : '#92400e' }}>{session.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Main content */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

            {/* Filters */}
            {selectedSession && (
              <div style={{ background: 'white', borderRadius: '16px', border: '1.5px solid #eef2ee', padding: '16px 20px', display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>Period</div>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {['all', ...periods].map(p => (
                      <button key={p} onClick={() => setFilterPeriod(p)} style={{ padding: '5px 12px', borderRadius: '8px', border: 'none', fontSize: '12px', fontWeight: 700, cursor: 'pointer', background: filterPeriod === p ? '#1a5c38' : '#f3f4f6', color: filterPeriod === p ? 'white' : '#6b7280' }}>
                        {p === 'all' ? 'All' : PERIOD_LABELS[p] || p}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>Compliance</div>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {[
                      { key: 'all', label: 'All' },
                      { key: 'compliant', label: '✓ Compliant' },
                      { key: 'non-compliant', label: '✗ Non-compliant' },
                    ].map(f => (
                      <button key={f.key} onClick={() => setFilterCompliance(f.key)} style={{ padding: '5px 12px', borderRadius: '8px', border: 'none', fontSize: '12px', fontWeight: 700, cursor: 'pointer', background: filterCompliance === f.key ? '#1a5c38' : '#f3f4f6', color: filterCompliance === f.key ? 'white' : '#6b7280' }}>
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {!selectedSession ? (
              <div style={{ background: 'white', borderRadius: '20px', border: '1.5px solid #eef2ee', padding: '60px', textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                <div style={{ fontSize: '48px', marginBottom: '12px' }}>🌡️</div>
                <div style={{ fontSize: '16px', fontWeight: 700, color: '#111', marginBottom: '6px' }}>Select a session</div>
                <div style={{ fontSize: '13px', color: '#9ca3af' }}>Choose a session from the left to view temperature readings</div>
              </div>
            ) : filteredLogs.length === 0 ? (
              <div style={{ background: 'white', borderRadius: '20px', border: '1.5px solid #eef2ee', padding: '60px', textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                <div style={{ fontSize: '48px', marginBottom: '12px' }}>📭</div>
                <div style={{ fontSize: '16px', fontWeight: 700, color: '#111', marginBottom: '6px' }}>No readings found</div>
                <div style={{ fontSize: '13px', color: '#9ca3af' }}>No temperature logs match the current filters</div>
              </div>
            ) : (<>

              {/* Non-compliant alert */}
              {nonCompliantCount > 0 && (
                <div style={{ background: '#fef2f2', border: '1.5px solid #fecaca', borderRadius: '16px', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ fontSize: '24px' }}>⚠️</div>
                  <div>
                    <div style={{ fontWeight: 700, color: '#dc2626', fontSize: '14px' }}>{nonCompliantCount} non-compliant reading{nonCompliantCount > 1 ? 's' : ''} detected</div>
                    <div style={{ fontSize: '12px', color: '#b91c1c', marginTop: '2px' }}>Equipment may require attention — check temperatures immediately</div>
                  </div>
                </div>
              )}

              {/* Group by equipment */}
              {Object.entries(byEquipment).map(([equipName, equipLogs]) => {
                const allCompliant = equipLogs.every(l => l.is_compliant)
                const anyNonCompliant = equipLogs.some(l => !l.is_compliant)
                const borderColor = anyNonCompliant ? '#fecaca' : '#bbf7d0'
                const temps = equipLogs.map(l => Number(l.temperature_c))
                const avgTemp = temps.reduce((a, b) => a + b, 0) / temps.length
                const minTemp = Math.min(...temps)
                const maxTemp = Math.max(...temps)

                return (
                  <div key={equipName} style={{ background: 'white', borderRadius: '20px', border: `1.5px solid ${borderColor}`, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                    {/* Equipment header */}
                    <div style={{ padding: '16px 20px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: anyNonCompliant ? '#fee2e2' : '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>
                          {equipLogs[0]?.equipment_type === 'Freezer' ? '🧊' : equipLogs[0]?.equipment_type === 'Fridge' ? '❄️' : equipLogs[0]?.equipment_type === 'Hot Hold' ? '♨️' : '🌡️'}
                        </div>
                        <div>
                          <div style={{ fontWeight: 800, fontSize: '15px', color: '#111' }}>{equipName}</div>
                          <div style={{ fontSize: '12px', color: '#9ca3af' }}>{equipLogs[0]?.equipment_type} • {equipLogs.length} reading{equipLogs.length !== 1 ? 's' : ''}</div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: '18px', fontWeight: 800, color: '#111' }}>{avgTemp.toFixed(1)}°C</div>
                          <div style={{ fontSize: '11px', color: '#9ca3af' }}>Average</div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: '14px', fontWeight: 700, color: '#2563eb' }}>{minTemp.toFixed(1)}°C</div>
                          <div style={{ fontSize: '11px', color: '#9ca3af' }}>Min</div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: '14px', fontWeight: 700, color: '#dc2626' }}>{maxTemp.toFixed(1)}°C</div>
                          <div style={{ fontSize: '11px', color: '#9ca3af' }}>Max</div>
                        </div>
                        <span style={{ fontSize: '11px', fontWeight: 700, padding: '4px 12px', borderRadius: '100px', background: anyNonCompliant ? '#fee2e2' : '#dcfce7', color: anyNonCompliant ? '#dc2626' : '#166534' }}>
                          {anyNonCompliant ? '⚠ Non-compliant' : '✓ All compliant'}
                        </span>
                      </div>
                    </div>

                    {/* Readings table */}
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ background: '#f9fafb' }}>
                          {['Period', 'Temperature', 'Time', 'Status'].map(h => (
                            <th key={h} style={{ padding: '10px 20px', textAlign: 'left', fontSize: '11px', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {equipLogs.map(log => {
                          const status = getTempStatus(log)
                          return (
                            <tr key={log.id} style={{ borderTop: '1px solid #f3f4f6', background: !log.is_compliant ? '#fff5f5' : 'white' }}>
                              <td style={{ padding: '12px 20px', fontSize: '13px', color: '#374151', fontWeight: 600 }}>
                                {PERIOD_LABELS[log.period] || log.period}
                              </td>
                              <td style={{ padding: '12px 20px' }}>
                                <span style={{ fontSize: '20px', fontWeight: 800, color: log.is_compliant ? '#1a5c38' : '#dc2626' }}>
                                  {Number(log.temperature_c).toFixed(1)}°C
                                </span>
                              </td>
                              <td style={{ padding: '12px 20px', fontSize: '13px', color: '#6b7280' }}>
                                {formatTime(log.logged_at)}
                              </td>
                              <td style={{ padding: '12px 20px' }}>
                                <span style={{ fontSize: '11px', fontWeight: 700, padding: '4px 12px', borderRadius: '100px', background: status.bg, color: status.color }}>
                                  {status.label}
                                </span>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )
              })}
            </>)}
          </div>
        </div>

        <div style={{ marginTop: '48px', textAlign: 'center' }}>
          <p style={{ fontSize: '12px', color: '#9ca3af' }}>CompliTrack © 2026 • Store Management Platform • South Africa 🇿🇦</p>
        </div>
      </main>
    </div>
  )
}
