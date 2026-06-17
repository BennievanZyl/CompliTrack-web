'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

const STORE_ID = '05328298-fc27-4c9f-b091-bb7f6598b601';
const PRIMARY = '#1a5c38';
const DARK = '#0a1f12';
const POLL_INTERVAL = 30000;

type Session = {
  id: string;
  session_date: string;
  status: string;
  signed_off_at: string | null;
  pdf_report_url: string | null;
  started_at: string | null;
  duration_seconds: number | null;
};

type ChecklistItem = {
  id: string;
  completed: boolean;
  completed_at: string | null;
  notes: string | null;
  photo_url: string | null;
  ai_photo_result: string | null;
  checklist_templates: {
    task_name: string;
    section: string;
    requires_photo: boolean;
  } | null;
};

type UniformSession = {
  id: string;
  photo_url: string;
  taken_at: string;
  ai_overall_result: string | null;
  ai_notes: string | null;
};

type TempLog = {
  id: string;
  equipment_name: string;
  equipment_type: string;
  temperature_c: number;
  period: string;
  is_compliant: boolean;
  logged_at: string;
};

type Tab = 'checklist' | 'uniforms' | 'temperature';

function formatDuration(seconds: number): string {
  if (seconds >= 3600) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function formatElapsed(startedAt: string): string {
  const elapsed = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
  const h = Math.floor(elapsed / 3600);
  const m = Math.floor((elapsed % 3600) / 60);
  const s = elapsed % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function CompliancePage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [uniforms, setUniforms] = useState<UniformSession[]>([]);
  const [tempLogs, setTempLogs] = useState<TempLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('checklist');
  const [elapsed, setElapsed] = useState('00:00:00');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const sessionRef = useRef<Session | null>(null);

  useEffect(() => {
    checkAuthAndLoad();
  }, []);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    if (!session?.started_at || session.status === 'signed_off') return;
    setElapsed(formatElapsed(session.started_at));
    const interval = setInterval(() => {
      if (sessionRef.current?.started_at) {
        setElapsed(formatElapsed(sessionRef.current.started_at));
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [session?.started_at, session?.status]);

  useEffect(() => {
    if (!session?.id) return;

    const channel = supabase
      .channel(`compliance-${session.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'checklist_items', filter: `session_id=eq.${session.id}` }, () => { loadSessionData(session.id); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_sessions', filter: `id=eq.${session.id}` }, () => { loadSessionData(session.id); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'uniform_sessions', filter: `session_id=eq.${session.id}` }, () => { loadSessionData(session.id); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'temperature_logs', filter: `session_id=eq.${session.id}` }, () => { loadSessionData(session.id); })
      .subscribe();

    const poll = setInterval(() => { loadSessionData(session.id); }, POLL_INTERVAL);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(poll);
    };
  }, [session?.id]);

  async function checkAuthAndLoad() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push('/login'); return; }
    await loadData();
  }

  async function loadData() {
    setLoading(true);
    const today = new Date().toISOString().split('T')[0];
    const { data: sessionData } = await supabase.from('daily_sessions').select('*').eq('store_id', STORE_ID).eq('session_date', today).single();
    setSession(sessionData);
    if (sessionData) await loadSessionData(sessionData.id);
    setLoading(false);
  }

  async function loadSessionData(sessionId: string) {
    const { data: sessionData } = await supabase.from('daily_sessions').select('*').eq('id', sessionId).single();
    if (sessionData) setSession(sessionData);

    const { data: checklistData } = await supabase.from('checklist_items').select('*, checklist_templates(task_name, section, requires_photo)').eq('session_id', sessionId).order('created_at');
    setChecklist(checklistData || []);

    const { data: uniformData } = await supabase.from('uniform_sessions').select('*').eq('session_id', sessionId).order('taken_at', { ascending: false });
    setUniforms(uniformData || []);

    const { data: tempData } = await supabase.from('temperature_logs').select('*').eq('session_id', sessionId).order('logged_at');
    setTempLogs(tempData || []);

    setLastUpdated(new Date());
  }

  const completed = checklist.filter(i => i.completed).length;
  const total = checklist.length;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const tempCompliant = tempLogs.filter(t => t.is_compliant).length;
  const pctColor = pct === 100 ? PRIMARY : pct >= 70 ? '#f59e0b' : '#ef4444';
  const tempColor = tempLogs.length === 0 ? '#ccc' : tempCompliant === tempLogs.length ? PRIMARY : '#ef4444';

  const sections = checklist.reduce<Record<string, ChecklistItem[]>>((acc, item) => {
    const sec = item.checklist_templates?.section || 'General';
    if (!acc[sec]) acc[sec] = [];
    acc[sec].push(item);
    return acc;
  }, {});

  const cardStyle = { background: '#fff', borderRadius: 20, padding: 24, border: '1px solid #eef2ee', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' };
  const labelStyle = { fontSize: 13, color: '#666', marginBottom: 8, fontWeight: 500 as const };

  return (
    <div style={{ minHeight: '100vh', background: '#f8faf8', fontFamily: 'system-ui, sans-serif' }}>

      <div style={{ background: `linear-gradient(135deg, ${DARK}, ${PRIMARY})`, padding: '0 32px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 64 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={() => router.push('/dashboard')} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 14 }}>Back</button>
            <span style={{ color: '#fff', fontWeight: 700, fontSize: 18 }}>Daily Compliance</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {lastUpdated && <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>Live</span>}
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#4ade80', boxShadow: '0 0 6px #4ade80' }} />
            <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14 }}>{new Date().toLocaleDateString('en-ZA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px' }}>

        {loading && <div style={{ textAlign: 'center', padding: 80, color: '#666' }}>Loading...</div>}

        {!loading && !session && (
          <div style={{ textAlign: 'center', padding: 80 }}>
            <div style={{ fontSize: 20, fontWeight: 600, color: '#333', marginBottom: 8 }}>No session today</div>
            <div style={{ color: '#666' }}>Open the mobile app to start a compliance session.</div>
          </div>
        )}

        {!loading && session && (
          <div>

            {session.started_at && session.status !== 'signed_off' && (
              <div style={{ background: PRIMARY, borderRadius: 16, padding: '16px 24px', marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, marginBottom: 2 }}>COMPLIANCE TIMER RUNNING</div>
                  <div style={{ color: '#fff', fontWeight: 600, fontSize: 14 }}>Started at {new Date(session.started_at).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}</div>
                </div>
                <span style={{ color: '#fff', fontWeight: 800, fontSize: 32, fontVariantNumeric: 'tabular-nums', letterSpacing: 3 }}>{elapsed}</span>
              </div>
            )}

            {!session.started_at && session.status !== 'signed_off' && (
              <div style={{ background: '#fff8e1', borderRadius: 16, padding: '16px 24px', marginBottom: 24, border: '1px solid #fde68a' }}>
                <span style={{ color: '#92400e', fontWeight: 600, fontSize: 14 }}>Timer not started — open the mobile app and tap Start Compliance Check to begin timing.</span>
              </div>
            )}

            {session.status === 'signed_off' && session.duration_seconds && (
              <div style={{ background: '#e8f5e9', borderRadius: 16, padding: '16px 24px', marginBottom: 24, border: '1px solid #c8e6c9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ color: PRIMARY, fontWeight: 600, fontSize: 15 }}>Compliance completed and signed off</span>
                <span style={{ color: PRIMARY, fontWeight: 800, fontSize: 20 }}>Completed in {formatDuration(session.duration_seconds)}</span>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 20, marginBottom: 32 }}>

              <div style={cardStyle}>
                <div style={labelStyle}>CHECKLIST</div>
                <div style={{ fontSize: 36, fontWeight: 800, color: pctColor }}>{pct}%</div>
                <div style={{ fontSize: 13, color: '#888', marginTop: 4 }}>{completed} of {total} tasks</div>
                <div style={{ marginTop: 12, height: 6, background: '#eef2ee', borderRadius: 3 }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: pctColor, borderRadius: 3 }} />
                </div>
              </div>

              <div style={cardStyle}>
                <div style={labelStyle}>STATUS</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: session.status === 'signed_off' ? PRIMARY : '#f59e0b' }}>
                  {session.status === 'signed_off' ? 'Signed Off' : 'In Progress'}
                </div>
                {session.signed_off_at && (
                  <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
                    {new Date(session.signed_off_at).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                )}
              </div>

              <div style={cardStyle}>
                <div style={labelStyle}>TIME TAKEN</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: PRIMARY }}>
                  {session.duration_seconds
                    ? formatDuration(session.duration_seconds)
                    : session.started_at && session.status !== 'signed_off'
                    ? elapsed
                    : 'Not started'}
                </div>
                <div style={{ fontSize: 13, color: '#888', marginTop: 4 }}>compliance duration</div>
              </div>

              <div style={cardStyle}>
                <div style={labelStyle}>UNIFORMS</div>
                <div style={{ fontSize: 36, fontWeight: 800, color: PRIMARY }}>{uniforms.length}</div>
                <div style={{ fontSize: 13, color: '#888', marginTop: 4 }}>photos captured</div>
              </div>

              <div style={cardStyle}>
                <div style={labelStyle}>TEMPERATURE</div>
                <div style={{ fontSize: 36, fontWeight: 800, color: tempColor }}>{tempLogs.length === 0 ? '-' : `${tempCompliant}/${tempLogs.length}`}</div>
                <div style={{ fontSize: 13, color: '#888', marginTop: 4 }}>readings compliant</div>
              </div>

            </div>

            <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: '#fff', padding: 4, borderRadius: 14, border: '1px solid #eef2ee', width: 'fit-content' }}>
              {(['checklist', 'uniforms', 'temperature'] as Tab[]).map(tab => (
                <button key={tab} onClick={() => setActiveTab(tab)} style={{ padding: '8px 20px', borderRadius: 10, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 14, background: activeTab === tab ? PRIMARY : 'transparent', color: activeTab === tab ? '#fff' : '#666' }}>
                  {tab === 'checklist' ? 'Checklist' : tab === 'uniforms' ? 'Uniforms' : 'Temperature'}
                </button>
              ))}
            </div>

            {activeTab === 'checklist' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                {checklist.length === 0 && <div style={{ textAlign: 'center', padding: 60, color: '#888' }}>No checklist items yet.</div>}
                {Object.entries(sections).map(([section, items]) => {
                  const secDone = items.filter(i => i.completed).length;
                  return (
                    <div key={section} style={{ background: '#fff', borderRadius: 20, border: '1px solid #eef2ee', overflow: 'hidden' }}>
                      <div style={{ padding: '16px 24px', background: '#f8faf8', borderBottom: '1px solid #eef2ee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 700, color: '#333' }}>{section}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <div style={{ width: 80, height: 6, background: '#eef2ee', borderRadius: 3 }}>
                            <div style={{ height: '100%', width: `${items.length > 0 ? (secDone / items.length) * 100 : 0}%`, background: secDone === items.length ? PRIMARY : '#f59e0b', borderRadius: 3 }} />
                          </div>
                          <span style={{ fontSize: 13, color: secDone === items.length ? PRIMARY : '#888', fontWeight: 600 }}>{secDone}/{items.length}</span>
                        </div>
                      </div>
                      {items.map((item, idx) => (
                        <div key={item.id} style={{ padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 14, borderBottom: idx < items.length - 1 ? '1px solid #f0f4f0' : 'none' }}>
                          <div style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, background: item.completed ? PRIMARY : '#eef2ee', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 14, fontWeight: 700 }}>
                            {item.completed ? 'v' : ''}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 500, color: item.completed ? '#333' : '#888', fontSize: 14 }}>{item.checklist_templates?.task_name || 'Unknown task'}</div>
                            {item.notes && <div style={{ fontSize: 12, color: '#888', fontStyle: 'italic', marginTop: 2 }}>Note: {item.notes}</div>}
                            {item.ai_photo_result && <div style={{ fontSize: 12, marginTop: 4, color: item.ai_photo_result === 'pass' ? PRIMARY : '#ef4444', fontWeight: 600 }}>AI: {item.ai_photo_result}</div>}
                          </div>
                          {item.completed_at && <div style={{ fontSize: 11, color: '#bbb', whiteSpace: 'nowrap' }}>{new Date(item.completed_at).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}</div>}
                          {item.photo_url && <img src={item.photo_url} alt="task" style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'cover' }} />}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}

            {activeTab === 'uniforms' && (
              <div>
                {uniforms.length === 0 && <div style={{ textAlign: 'center', padding: 60, color: '#888' }}>No uniform photos today.</div>}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 20 }}>
                  {uniforms.map(u => (
                    <div key={u.id} style={{ background: '#fff', borderRadius: 20, border: '1px solid #eef2ee', overflow: 'hidden' }}>
                      <img src={u.photo_url} alt="uniform" style={{ width: '100%', height: 220, objectFit: 'cover' }} />
                      <div style={{ padding: 16 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                          <span style={{ fontSize: 13, color: '#666' }}>{new Date(u.taken_at).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}</span>
                          {u.ai_overall_result && <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: u.ai_overall_result === 'pass' ? '#e8f5e9' : '#fdecea', color: u.ai_overall_result === 'pass' ? PRIMARY : '#ef4444' }}>{u.ai_overall_result.toUpperCase()}</span>}
                        </div>
                        {u.ai_notes && <div style={{ fontSize: 13, color: '#666', lineHeight: 1.4 }}>{u.ai_notes}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'temperature' && (
              <div style={{ background: '#fff', borderRadius: 20, border: '1px solid #eef2ee', overflow: 'hidden' }}>
                {tempLogs.length === 0 && <div style={{ textAlign: 'center', padding: 60, color: '#888' }}>No temperature logs today.</div>}
                {tempLogs.map((log, idx) => (
                  <div key={log.id} style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 16, borderBottom: idx < tempLogs.length - 1 ? '1px solid #f0f4f0' : 'none' }}>
                    <div style={{ width: 48, height: 48, borderRadius: 12, flexShrink: 0, background: log.is_compliant ? '#e8f5e9' : '#fdecea', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 18, color: log.is_compliant ? PRIMARY : '#ef4444' }}>T</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, color: '#333', fontSize: 14 }}>{log.equipment_name}</div>
                      <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{log.period} - {log.equipment_type}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 22, fontWeight: 800, color: log.is_compliant ? PRIMARY : '#ef4444' }}>{log.temperature_c}C</div>
                      <div style={{ fontSize: 11, color: log.is_compliant ? PRIMARY : '#ef4444', fontWeight: 600 }}>{log.is_compliant ? 'COMPLIANT' : 'OUT OF RANGE'}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {session.pdf_report_url && (
              <div style={{ marginTop: 32, textAlign: 'center' }}>
                <a href={session.pdf_report_url} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', padding: '14px 32px', background: PRIMARY, color: '#fff', borderRadius: 12, fontWeight: 700, textDecoration: 'none', fontSize: 15 }}>Download PDF Report</a>
              </div>
            )}

          </div>
        )}
      </div>
    </div>
  );
}
