'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

const { storeId, loading: storeLoading } = useStore();
const PRIMARY = '#1a5c38';
const DARK = '#0a1f12';

type SessionType = 'daily' | 'weekly' | 'monthly' | 'six_monthly' | 'annual';

type SessionReport = {
  id: string;
  session_date: string;
  session_type: string;
  status: string;
  signed_off_at: string | null;
  pdf_report_url: string | null;
  started_at: string | null;
  duration_seconds: number | null;
  total: number;
  completed: number;
  uniform_photos: number;
  temp_violations: number;
};

function formatDuration(seconds: number): string {
  if (seconds >= 3600) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

const SESSION_TYPE_LABELS: Record<string, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  six_monthly: '6-Monthly',
  annual: 'Annual',
};

const SESSION_TYPE_COLORS: Record<string, string> = {
  daily: PRIMARY,
  weekly: '#0369a1',
  monthly: '#7c3aed',
  six_monthly: '#b45309',
  annual: '#be185d',
};

export default function ReportsPage() {
  const router = useRouter();
  const [allReports, setAllReports] = useState<SessionReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeType, setActiveType] = useState<SessionType>('daily');
  const [filter, setFilter] = useState<'all' | 'signed_off' | 'open'>('all');

  useEffect(() => { checkAuthAndLoad(); }, []);

  async function checkAuthAndLoad() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push('/login'); return; }
    await loadReports();
  }

  async function loadReports() {
    setLoading(true);
    const { data: sessions } = await supabase
      .from('daily_sessions')
      .select('id, session_date, session_type, status, signed_off_at, pdf_report_url, started_at, duration_seconds')
      .eq('store_id', STORE_ID)
      .order('session_date', { ascending: false })
      .limit(60);

    if (!sessions) { setLoading(false); return; }

    const enriched = await Promise.all(sessions.map(async (s) => {
      const { count: total } = await supabase.from('checklist_items').select('*', { count: 'exact', head: true }).eq('session_id', s.id);
      const { count: completed } = await supabase.from('checklist_items').select('*', { count: 'exact', head: true }).eq('session_id', s.id).eq('completed', true);
      const { count: uniform_photos } = await supabase.from('uniform_sessions').select('*', { count: 'exact', head: true }).eq('session_id', s.id);
      const { count: temp_violations } = await supabase.from('temperature_logs').select('*', { count: 'exact', head: true }).eq('session_id', s.id).eq('is_compliant', false);
      return { ...s, session_type: s.session_type || 'daily', total: total || 0, completed: completed || 0, uniform_photos: uniform_photos || 0, temp_violations: temp_violations || 0 };
    }));

    setAllReports(enriched);
    setLoading(false);
  }

  const reports = allReports.filter(r => (r.session_type || 'daily') === activeType);
  const filtered = reports.filter(r => filter === 'all' ? true : r.status === filter);
  const availableTypes = [...new Set(allReports.map(r => r.session_type || 'daily'))] as SessionType[];

  const pct = (r: SessionReport) => r.total > 0 ? Math.round((r.completed / r.total) * 100) : 0;
  const pctColor = (p: number) => p === 100 ? PRIMARY : p >= 70 ? '#f59e0b' : '#ef4444';

  const avgCompliance = reports.length > 0 ? Math.round(reports.reduce((sum, r) => sum + pct(r), 0) / reports.length) : 0;
  const signedOffCount = reports.filter(r => r.status === 'signed_off').length;
  const totalUniforms = reports.reduce((sum, r) => sum + r.uniform_photos, 0);
  const totalViolations = reports.reduce((sum, r) => sum + r.temp_violations, 0);
  const timedSessions = reports.filter(r => r.duration_seconds);
  const avgDuration = timedSessions.length > 0
    ? Math.round(timedSessions.reduce((sum, r) => sum + (r.duration_seconds || 0), 0) / timedSessions.length)
    : 0;
  const last7 = [...reports].reverse().slice(-7);
  const typeColor = SESSION_TYPE_COLORS[activeType] || PRIMARY;

  const cardStyle = { background: '#fff', borderRadius: 20, padding: 24, border: '1px solid #eef2ee', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' };
  const labelStyle = { fontSize: 13, color: '#666', marginBottom: 8, fontWeight: 500 as const };

  return (
    <div style={{ minHeight: '100vh', background: '#f8faf8', fontFamily: 'system-ui, sans-serif' }}>

      <div style={{ background: `linear-gradient(135deg, ${DARK}, ${PRIMARY})`, padding: '0 32px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 64 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={() => router.push('/dashboard')} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 14 }}>Back</button>
            <span style={{ color: '#fff', fontWeight: 700, fontSize: 18 }}>Analytics & Reports</span>
          </div>
          <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14 }}>{reports.length} {SESSION_TYPE_LABELS[activeType]} sessions tracked</span>
        </div>
      </div>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 24px' }}>

        {loading && <div style={{ textAlign: 'center', padding: 80, color: '#666' }}>Loading analytics...</div>}

        {!loading && (
          <div>

            {/* Session Type Tabs */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 28, background: '#fff', padding: 4, borderRadius: 16, border: '1px solid #eef2ee', width: 'fit-content' }}>
              {(['daily', 'weekly', 'monthly', 'six_monthly', 'annual'] as SessionType[]).map(type => {
                const hasData = availableTypes.includes(type);
                const count = allReports.filter(r => (r.session_type || 'daily') === type).length;
                return (
                  <button key={type} onClick={() => { setActiveType(type); setFilter('all'); }} style={{ padding: '8px 16px', borderRadius: 12, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13, background: activeType === type ? SESSION_TYPE_COLORS[type] : 'transparent', color: activeType === type ? '#fff' : hasData ? '#444' : '#ccc', position: 'relative' as const }}>
                    {SESSION_TYPE_LABELS[type]}
                    {count > 0 && activeType !== type && (
                      <span style={{ marginLeft: 6, background: '#eef2ee', color: '#666', borderRadius: 20, padding: '1px 6px', fontSize: 10, fontWeight: 700 }}>{count}</span>
                    )}
                  </button>
                );
              })}
            </div>

            {reports.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 80, background: '#fff', borderRadius: 20, border: '1px solid #eef2ee' }}>
                <div style={{ fontSize: 40, marginBottom: 16 }}>📋</div>
                <div style={{ fontSize: 18, fontWeight: 600, color: '#333', marginBottom: 8 }}>No {SESSION_TYPE_LABELS[activeType]} sessions yet</div>
                <div style={{ color: '#aaa', fontSize: 14 }}>
                  {activeType === 'weekly' && 'Weekly sessions run on Mondays'}
                  {activeType === 'monthly' && 'Monthly sessions run on the 1st of each month'}
                  {activeType === 'six_monthly' && '6-Monthly sessions run every 6 months'}
                  {activeType === 'annual' && 'Annual sessions run once a year'}
                  {activeType === 'daily' && 'Start a daily compliance session on the mobile app'}
                </div>
              </div>
            ) : (
              <div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 20, marginBottom: 32 }}>

                  <div style={cardStyle}>
                    <div style={labelStyle}>AVG COMPLIANCE</div>
                    <div style={{ fontSize: 40, fontWeight: 800, color: pctColor(avgCompliance) }}>{avgCompliance}%</div>
                    <div style={{ fontSize: 13, color: '#888', marginTop: 4 }}>across {reports.length} sessions</div>
                    <div style={{ marginTop: 12, height: 6, background: '#eef2ee', borderRadius: 3 }}>
                      <div style={{ height: '100%', width: `${avgCompliance}%`, background: pctColor(avgCompliance), borderRadius: 3 }} />
                    </div>
                  </div>

                  <div style={cardStyle}>
                    <div style={labelStyle}>SIGNED OFF</div>
                    <div style={{ fontSize: 40, fontWeight: 800, color: typeColor }}>{signedOffCount}</div>
                    <div style={{ fontSize: 13, color: '#888', marginTop: 4 }}>of {reports.length} sessions</div>
                    <div style={{ marginTop: 12, height: 6, background: '#eef2ee', borderRadius: 3 }}>
                      <div style={{ height: '100%', width: `${reports.length > 0 ? (signedOffCount / reports.length) * 100 : 0}%`, background: typeColor, borderRadius: 3 }} />
                    </div>
                  </div>

                  <div style={cardStyle}>
                    <div style={labelStyle}>AVG DURATION</div>
                    <div style={{ fontSize: 28, fontWeight: 800, color: typeColor }}>{avgDuration > 0 ? formatDuration(avgDuration) : '-'}</div>
                    <div style={{ fontSize: 13, color: '#888', marginTop: 4 }}>per {SESSION_TYPE_LABELS[activeType].toLowerCase()} session</div>
                  </div>

                  <div style={cardStyle}>
                    <div style={labelStyle}>UNIFORM CHECKS</div>
                    <div style={{ fontSize: 40, fontWeight: 800, color: typeColor }}>{totalUniforms}</div>
                    <div style={{ fontSize: 13, color: '#888', marginTop: 4 }}>photos captured total</div>
                  </div>

                  <div style={cardStyle}>
                    <div style={labelStyle}>TEMP VIOLATIONS</div>
                    <div style={{ fontSize: 40, fontWeight: 800, color: totalViolations > 0 ? '#ef4444' : typeColor }}>{totalViolations}</div>
                    <div style={{ fontSize: 13, color: '#888', marginTop: 4 }}>out of range readings</div>
                  </div>

                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20, marginBottom: 32 }}>

                  <div style={cardStyle}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#333', marginBottom: 24 }}>Compliance Trend — Last 7 {SESSION_TYPE_LABELS[activeType]} Sessions</div>
                    {last7.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: 40, color: '#aaa' }}>No data yet</div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, height: 180, paddingBottom: 32, position: 'relative' }}>
                        {[0, 25, 50, 75, 100].map(v => (
                          <div key={v} style={{ position: 'absolute', left: 0, right: 0, bottom: 32 + (v / 100) * 148, borderTop: '1px dashed #eef2ee' }}>
                            <span style={{ fontSize: 10, color: '#ccc', position: 'absolute', left: 0, top: -8 }}>{v}%</span>
                          </div>
                        ))}
                        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, height: '100%', flex: 1, paddingLeft: 32 }}>
                          {last7.map((r) => {
                            const p = pct(r);
                            const barHeight = Math.max(4, (p / 100) * 148);
                            return (
                              <div key={r.id} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                                <span style={{ fontSize: 11, fontWeight: 700, color: pctColor(p) }}>{p}%</span>
                                <div style={{ width: '100%', height: barHeight, background: pctColor(p), borderRadius: '6px 6px 0 0', minHeight: 4 }} />
                                <span style={{ fontSize: 10, color: '#aaa', textAlign: 'center' as const }}>{new Date(r.session_date).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

                    <div style={cardStyle}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: '#333', marginBottom: 16 }}>Best vs Worst</div>
                      {reports.length === 0 ? (
                        <div style={{ color: '#aaa', fontSize: 13 }}>No data yet</div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                          {[
                            { label: 'Best', session: reports.reduce((a, b) => pct(a) > pct(b) ? a : b), bg: '#e8f5e9', color: PRIMARY },
                            { label: 'Worst', session: reports.reduce((a, b) => pct(a) < pct(b) ? a : b), bg: '#fdecea', color: '#ef4444' },
                          ].map(({ label, session, bg, color }) => (
                            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                              <div style={{ width: 36, height: 36, borderRadius: 10, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color, flexShrink: 0, fontSize: 13 }}>{label[0]}</div>
                              <div>
                                <div style={{ fontSize: 13, color: '#333', fontWeight: 600 }}>{new Date(session.session_date).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                                <div style={{ fontSize: 12, color }}>{pct(session)}% complete</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div style={cardStyle}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: '#333', marginBottom: 16 }}>Duration Range</div>
                      {timedSessions.length === 0 ? (
                        <div style={{ color: '#aaa', fontSize: 13 }}>No timed sessions yet</div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                          {[
                            { label: 'Fastest', session: timedSessions.reduce((a, b) => (a.duration_seconds || 0) < (b.duration_seconds || 0) ? a : b), color: typeColor },
                            { label: 'Slowest', session: timedSessions.reduce((a, b) => (a.duration_seconds || 0) > (b.duration_seconds || 0) ? a : b), color: '#f59e0b' },
                          ].map(({ label, session, color }) => (
                            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontSize: 13, color: '#666' }}>{label}</span>
                              <span style={{ fontSize: 14, fontWeight: 700, color }}>{session.duration_seconds ? formatDuration(session.duration_seconds) : '-'}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                  </div>

                </div>

                <div style={{ background: '#fff', borderRadius: 20, border: '1px solid #eef2ee', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                  <div style={{ padding: '20px 24px', borderBottom: '1px solid #eef2ee', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 16, fontWeight: 700, color: '#333' }}>{SESSION_TYPE_LABELS[activeType]} Session History</span>
                    <div style={{ display: 'flex', gap: 4, background: '#f8faf8', padding: 4, borderRadius: 10 }}>
                      {(['all', 'signed_off', 'open'] as const).map(f => (
                        <button key={f} onClick={() => setFilter(f)} style={{ padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 12, background: filter === f ? typeColor : 'transparent', color: filter === f ? '#fff' : '#666' }}>
                          {f === 'all' ? 'All' : f === 'signed_off' ? 'Signed Off' : 'In Progress'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {filtered.length === 0 && <div style={{ textAlign: 'center', padding: 60, color: '#aaa' }}>No sessions found.</div>}

                  {filtered.map((report, idx) => {
                    const p = pct(report);
                    const color = pctColor(p);
                    const isToday = report.session_date === new Date().toISOString().split('T')[0];
                    return (
                      <div key={report.id} onClick={() => router.push('/compliance')} style={{ padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 20, borderBottom: idx < filtered.length - 1 ? '1px solid #f0f4f0' : 'none', cursor: 'pointer' }}>

                        <div style={{ width: 44, height: 44, borderRadius: 12, background: report.status === 'signed_off' ? '#e8f5e9' : '#fff8e1', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontWeight: 800, fontSize: 15, color: report.status === 'signed_off' ? PRIMARY : '#f59e0b' }}>
                          {new Date(report.session_date).getDate()}
                        </div>

                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                            <span style={{ fontWeight: 700, color: '#333', fontSize: 15 }}>
                              {isToday ? 'Today' : new Date(report.session_date).toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                            </span>
                            <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: report.status === 'signed_off' ? '#e8f5e9' : '#fff8e1', color: report.status === 'signed_off' ? PRIMARY : '#f59e0b' }}>
                              {report.status === 'signed_off' ? 'SIGNED OFF' : 'IN PROGRESS'}
                            </span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' as const }}>
                            <div style={{ width: 140, height: 6, background: '#eef2ee', borderRadius: 3 }}>
                              <div style={{ height: '100%', width: `${p}%`, background: color, borderRadius: 3 }} />
                            </div>
                            <span style={{ fontSize: 13, color, fontWeight: 600 }}>{p}%</span>
                            <span style={{ fontSize: 12, color: '#aaa' }}>{report.completed}/{report.total} tasks</span>
                            {report.uniform_photos > 0 && <span style={{ fontSize: 12, color: '#aaa' }}>{report.uniform_photos} uniforms</span>}
                            {report.temp_violations > 0 && <span style={{ fontSize: 12, color: '#ef4444', fontWeight: 600 }}>{report.temp_violations} violations</span>}
                            {report.duration_seconds && <span style={{ fontSize: 12, color: typeColor, fontWeight: 600 }}>{formatDuration(report.duration_seconds)}</span>}
                          </div>
                        </div>

                        {report.pdf_report_url && (
                          <a href={report.pdf_report_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ display: 'inline-block', padding: '8px 16px', background: typeColor, color: '#fff', borderRadius: 10, fontWeight: 600, textDecoration: 'none', fontSize: 13, whiteSpace: 'nowrap' as const }}>Download PDF</a>
                        )}

                        <span style={{ color: '#ccc', fontSize: 18 }}>›</span>
                      </div>
                    );
                  })}
                </div>

              </div>
            )}

          </div>
        )}
      </div>
    </div>
  );
}
