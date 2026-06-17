'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

const STORE_ID = '05328298-fc27-4c9f-b091-bb7f6598b601';
const PRIMARY = '#1a5c38';
const DARK = '#0a1f12';

type SessionReport = {
  id: string;
  session_date: string;
  status: string;
  signed_off_at: string | null;
  pdf_report_url: string | null;
  total: number;
  completed: number;
  uniform_photos: number;
  temp_logs: number;
  temp_violations: number;
};

export default function ReportsPage() {
  const router = useRouter();
  const [reports, setReports] = useState<SessionReport[]>([]);
  const [loading, setLoading] = useState(true);
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
      .select('id, session_date, status, signed_off_at, pdf_report_url')
      .eq('store_id', STORE_ID)
      .order('session_date', { ascending: false })
      .limit(30);

    if (!sessions) { setLoading(false); return; }

    const enriched = await Promise.all(sessions.map(async (s) => {
      const { count: total } = await supabase.from('checklist_items').select('*', { count: 'exact', head: true }).eq('session_id', s.id);
      const { count: completed } = await supabase.from('checklist_items').select('*', { count: 'exact', head: true }).eq('session_id', s.id).eq('completed', true);
      const { count: uniform_photos } = await supabase.from('uniform_sessions').select('*', { count: 'exact', head: true }).eq('session_id', s.id);
      const { count: temp_logs } = await supabase.from('temperature_logs').select('*', { count: 'exact', head: true }).eq('session_id', s.id);
      const { count: temp_violations } = await supabase.from('temperature_logs').select('*', { count: 'exact', head: true }).eq('session_id', s.id).eq('is_compliant', false);
      return { ...s, total: total || 0, completed: completed || 0, uniform_photos: uniform_photos || 0, temp_logs: temp_logs || 0, temp_violations: temp_violations || 0 };
    }));

    setReports(enriched);
    setLoading(false);
  }

  const filtered = reports.filter(r => filter === 'all' ? true : r.status === filter);
  const pct = (r: SessionReport) => r.total > 0 ? Math.round((r.completed / r.total) * 100) : 0;
  const pctColor = (p: number) => p === 100 ? PRIMARY : p >= 70 ? '#f59e0b' : '#ef4444';

  const avgCompliance = reports.length > 0 ? Math.round(reports.reduce((sum, r) => sum + pct(r), 0) / reports.length) : 0;
  const signedOffCount = reports.filter(r => r.status === 'signed_off').length;
  const totalUniforms = reports.reduce((sum, r) => sum + r.uniform_photos, 0);
  const totalViolations = reports.reduce((sum, r) => sum + r.temp_violations, 0);

  const last7 = [...reports].reverse().slice(-7);
  const barMax = 100;

  const cardStyle = { background: '#fff', borderRadius: 20, padding: 24, border: '1px solid #eef2ee', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' };

  return (
    <div style={{ minHeight: '100vh', background: '#f8faf8', fontFamily: 'system-ui, sans-serif' }}>

      <div style={{ background: `linear-gradient(135deg, ${DARK}, ${PRIMARY})`, padding: '0 32px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 64 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={() => router.push('/dashboard')} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 14 }}>Back</button>
            <span style={{ color: '#fff', fontWeight: 700, fontSize: 18 }}>Analytics & Reports</span>
          </div>
          <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14 }}>{reports.length} sessions tracked</span>
        </div>
      </div>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 24px' }}>

        {loading && <div style={{ textAlign: 'center', padding: 80, color: '#666' }}>Loading analytics...</div>}

        {!loading && (
          <div>

            {/* KPI Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 20, marginBottom: 32 }}>

              <div style={cardStyle}>
                <div style={{ fontSize: 13, color: '#666', marginBottom: 8, fontWeight: 500 }}>AVG COMPLIANCE</div>
                <div style={{ fontSize: 40, fontWeight: 800, color: pctColor(avgCompliance) }}>{avgCompliance}%</div>
                <div style={{ fontSize: 13, color: '#888', marginTop: 4 }}>across {reports.length} sessions</div>
                <div style={{ marginTop: 12, height: 6, background: '#eef2ee', borderRadius: 3 }}>
                  <div style={{ height: '100%', width: `${avgCompliance}%`, background: pctColor(avgCompliance), borderRadius: 3 }} />
                </div>
              </div>

              <div style={cardStyle}>
                <div style={{ fontSize: 13, color: '#666', marginBottom: 8, fontWeight: 500 }}>SESSIONS SIGNED OFF</div>
                <div style={{ fontSize: 40, fontWeight: 800, color: PRIMARY }}>{signedOffCount}</div>
                <div style={{ fontSize: 13, color: '#888', marginTop: 4 }}>of {reports.length} total sessions</div>
                <div style={{ marginTop: 12, height: 6, background: '#eef2ee', borderRadius: 3 }}>
                  <div style={{ height: '100%', width: `${reports.length > 0 ? (signedOffCount / reports.length) * 100 : 0}%`, background: PRIMARY, borderRadius: 3 }} />
                </div>
              </div>

              <div style={cardStyle}>
                <div style={{ fontSize: 13, color: '#666', marginBottom: 8, fontWeight: 500 }}>UNIFORM CHECKS</div>
                <div style={{ fontSize: 40, fontWeight: 800, color: PRIMARY }}>{totalUniforms}</div>
                <div style={{ fontSize: 13, color: '#888', marginTop: 4 }}>photos captured total</div>
              </div>

              <div style={cardStyle}>
                <div style={{ fontSize: 13, color: '#666', marginBottom: 8, fontWeight: 500 }}>TEMP VIOLATIONS</div>
                <div style={{ fontSize: 40, fontWeight: 800, color: totalViolations > 0 ? '#ef4444' : PRIMARY }}>{totalViolations}</div>
                <div style={{ fontSize: 13, color: '#888', marginTop: 4 }}>out of range readings</div>
              </div>

            </div>

            {/* Compliance Trend Chart */}
            <div style={{ ...cardStyle, marginBottom: 32 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#333', marginBottom: 24 }}>Compliance Trend — Last 7 Sessions</div>
              {last7.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40, color: '#aaa' }}>No data yet</div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, height: 180, paddingBottom: 32, position: 'relative' }}>
                  {/* Y axis lines */}
                  {[0, 25, 50, 75, 100].map(v => (
                    <div key={v} style={{ position: 'absolute', left: 0, right: 0, bottom: 32 + (v / barMax) * 148, borderTop: '1px dashed #eef2ee', display: 'flex', alignItems: 'center' }}>
                      <span style={{ fontSize: 10, color: '#ccc', marginTop: -8, width: 28, flexShrink: 0 }}>{v}%</span>
                    </div>
                  ))}
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, height: '100%', flex: 1, paddingLeft: 32 }}>
                    {last7.map((r) => {
                      const p = pct(r);
                      const barHeight = Math.max(4, (p / barMax) * 148);
                      const date = new Date(r.session_date);
                      return (
                        <div key={r.id} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: pctColor(p) }}>{p}%</span>
                          <div style={{ width: '100%', height: barHeight, background: pctColor(p), borderRadius: '6px 6px 0 0', transition: 'height 0.5s', minHeight: 4 }} />
                          <span style={{ fontSize: 10, color: '#aaa', textAlign: 'center', lineHeight: 1.2 }}>{date.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Session breakdown */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 32 }}>

              <div style={cardStyle}>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#333', marginBottom: 16 }}>Sign-off Rate</div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 24 }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 32, fontWeight: 800, color: PRIMARY }}>{signedOffCount}</div>
                    <div style={{ fontSize: 12, color: '#888' }}>Signed Off</div>
                  </div>
                  <div style={{ width: 1, height: 48, background: '#eef2ee' }} />
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 32, fontWeight: 800, color: '#f59e0b' }}>{reports.length - signedOffCount}</div>
                    <div style={{ fontSize: 12, color: '#888' }}>In Progress</div>
                  </div>
                </div>
                <div style={{ marginTop: 16, height: 12, background: '#eef2ee', borderRadius: 6, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${reports.length > 0 ? (signedOffCount / reports.length) * 100 : 0}%`, background: PRIMARY, borderRadius: 6 }} />
                </div>
              </div>

              <div style={cardStyle}>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#333', marginBottom: 16 }}>Best vs Worst Session</div>
                {reports.length === 0 ? (
                  <div style={{ color: '#aaa', fontSize: 13 }}>No data yet</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {[
                      { label: 'Best', session: reports.reduce((a, b) => pct(a) > pct(b) ? a : b), icon: 'B', bg: '#e8f5e9', color: PRIMARY },
                      { label: 'Worst', session: reports.reduce((a, b) => pct(a) < pct(b) ? a : b), icon: 'W', bg: '#fdecea', color: '#ef4444' },
                    ].map(({ label, session, icon, bg, color }) => (
                      <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 36, height: 36, borderRadius: 10, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color, flexShrink: 0 }}>{icon}</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, color: '#333', fontWeight: 600 }}>{label}: {new Date(session.session_date).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })}</div>
                          <div style={{ fontSize: 12, color }}>  {pct(session)}% complete</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>

            {/* Reports List */}
            <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '20px 24px', borderBottom: '1px solid #eef2ee', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 16, fontWeight: 700, color: '#333' }}>Session History</span>
                <div style={{ display: 'flex', gap: 4, background: '#f8faf8', padding: 4, borderRadius: 10 }}>
                  {(['all', 'signed_off', 'open'] as const).map(f => (
                    <button key={f} onClick={() => setFilter(f)} style={{ padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 12, background: filter === f ? PRIMARY : 'transparent', color: filter === f ? '#fff' : '#666' }}>
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
                  <div key={report.id} style={{ padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 20, borderBottom: idx < filtered.length - 1 ? '1px solid #f0f4f0' : 'none', cursor: 'pointer' }} onClick={() => router.push('/compliance')}>
                    <div style={{ width: 44, height: 44, borderRadius: 12, background: report.status === 'signed_off' ? '#e8f5e9' : '#fff8e1', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontWeight: 700, fontSize: 13, color: report.status === 'signed_off' ? PRIMARY : '#f59e0b' }}>
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
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 160, height: 6, background: '#eef2ee', borderRadius: 3 }}>
                          <div style={{ height: '100%', width: `${p}%`, background: color, borderRadius: 3 }} />
                        </div>
                        <span style={{ fontSize: 13, color, fontWeight: 600 }}>{p}%</span>
                        <span style={{ fontSize: 12, color: '#aaa' }}>{report.completed}/{report.total} tasks</span>
                        {report.uniform_photos > 0 && <span style={{ fontSize: 12, color: '#aaa' }}>{report.uniform_photos} uniform photos</span>}
                      </div>
                    </div>
                    {report.pdf_report_url && (
                      <a href={report.pdf_report_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ display: 'inline-block', padding: '8px 16px', background: PRIMARY, color: '#fff', borderRadius: 10, fontWeight: 600, textDecoration: 'none', fontSize: 13, whiteSpace: 'nowrap' }}>Download PDF</a>
                    )}
                    <span style={{ color: '#ccc', fontSize: 18 }}>›</span>
                  </div>
                );
              })}
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
