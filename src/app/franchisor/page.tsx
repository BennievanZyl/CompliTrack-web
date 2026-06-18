'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

const PRIMARY = '#1a5c38';
const DARK = '#0a1f12';

type Organisation = { id: string; name: string; };
type Store = { id: string; name: string; city: string; manager_name: string | null; organisation_id: string; is_active: boolean; };
type StoreStats = { store_id: string; session_id: string | null; status: string | null; total: number; completed: number; uniform_photos: number; temp_violations: number; duration_seconds: number | null; };
type Profile = { full_name: string; franchisor_id: string; role: string; };
type HistorySession = { id: string; session_date: string; status: string; store_id: string; duration_seconds: number | null; total: number; completed: number; };

function formatDuration(seconds: number): string {
  if (seconds >= 3600) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

export default function FranchisorPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [franchisorName, setFranchisorName] = useState('');
  const [orgs, setOrgs] = useState<Organisation[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [stats, setStats] = useState<Record<string, StoreStats>>({});
  const [history, setHistory] = useState<HistorySession[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [selectedOrg, setSelectedOrg] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'today' | 'history'>('today');

  useEffect(() => { checkAuthAndLoad(); }, []);

  useEffect(() => {
    if (!stores.length) return;
    const channel = supabase
      .channel('franchisor-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_sessions' }, () => { loadStats(stores); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'checklist_items' }, () => { loadStats(stores); })
      .subscribe();
    const poll = setInterval(() => { loadStats(stores); }, 60000);
    return () => { supabase.removeChannel(channel); clearInterval(poll); };
  }, [stores]);

  async function checkAuthAndLoad() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push('/login'); return; }

    const { data: profileData } = await supabase
      .from('profiles').select('full_name, franchisor_id, role').eq('id', user.id).single();

    if (!profileData) { router.push('/login'); return; }
    if (profileData.role !== 'franchisor_admin' && profileData.role !== 'platform_admin') {
      router.push('/dashboard'); return;
    }

    setProfile(profileData);

    const { data: franchisorData } = await supabase
      .from('franchisors').select('name').eq('id', profileData.franchisor_id).single();
    setFranchisorName(franchisorData?.name || 'Franchisor');

    const { data: orgData } = await supabase
      .from('organisations').select('id, name')
      .eq('franchisor_id', profileData.franchisor_id).order('name');
    setOrgs(orgData || []);

    const orgIds = (orgData || []).map(o => o.id);
    if (orgIds.length === 0) { setLoading(false); return; }

    const { data: storeData } = await supabase
      .from('stores').select('id, name, city, manager_name, organisation_id, is_active')
      .in('organisation_id', orgIds).eq('is_active', true).order('name');

    setStores(storeData || []);
    if (storeData) {
      await Promise.all([loadStats(storeData), loadHistory(storeData)]);
    }
    setLoading(false);
  }

  async function loadStats(storeList: Store[]) {
    const today = new Date().toISOString().split('T')[0];
    const statsMap: Record<string, StoreStats> = {};

    await Promise.all(storeList.map(async (store) => {
      const { data: session } = await supabase
        .from('daily_sessions')
        .select('id, status, duration_seconds')
        .eq('store_id', store.id)
        .eq('session_date', today)
        .eq('session_type', 'daily')
        .maybeSingle();

      if (!session) {
        statsMap[store.id] = { store_id: store.id, session_id: null, status: null, total: 0, completed: 0, uniform_photos: 0, temp_violations: 0, duration_seconds: null };
        return;
      }

      // Use select('id') instead of HEAD count to avoid 503 errors
      const [totalRes, completedRes, uniformRes, violationRes] = await Promise.all([
        supabase.from('checklist_items').select('id').eq('session_id', session.id),
        supabase.from('checklist_items').select('id').eq('session_id', session.id).eq('completed', true),
        supabase.from('uniform_sessions').select('id').eq('session_id', session.id),
        supabase.from('temperature_logs').select('id').eq('session_id', session.id).eq('is_compliant', false),
      ]);

      statsMap[store.id] = {
        store_id: store.id,
        session_id: session.id,
        status: session.status,
        total: totalRes.data?.length || 0,
        completed: completedRes.data?.length || 0,
        uniform_photos: uniformRes.data?.length || 0,
        temp_violations: violationRes.data?.length || 0,
        duration_seconds: session.duration_seconds,
      };
    }));

    setStats(statsMap);
    setLastUpdated(new Date());
  }

  async function loadHistory(storeList: Store[]) {
    const storeIds = storeList.map(s => s.id);
    const { data: sessions } = await supabase
      .from('daily_sessions')
      .select('id, session_date, status, store_id, duration_seconds')
      .in('store_id', storeIds)
      .eq('session_type', 'daily')
      .order('session_date', { ascending: false })
      .limit(60);

    if (!sessions) return;

    const enriched = await Promise.all(sessions.map(async (s) => {
      const [totalRes, completedRes] = await Promise.all([
        supabase.from('checklist_items').select('id').eq('session_id', s.id),
        supabase.from('checklist_items').select('id').eq('session_id', s.id).eq('completed', true),
      ]);
      return { ...s, total: totalRes.data?.length || 0, completed: completedRes.data?.length || 0 };
    }));

    setHistory(enriched);
  }

  const pct = (s: StoreStats | HistorySession) => s.total > 0 ? Math.round((s.completed / s.total) * 100) : 0;
  const pctColor = (p: number) => p === 100 ? PRIMARY : p >= 70 ? '#f59e0b' : '#ef4444';
  const getStoreName = (storeId: string) => stores.find(s => s.id === storeId)?.name || '';
  const getOrgName = (orgId: string) => orgs.find(o => o.id === orgId)?.name || '';

  const filteredStores = stores
    .filter(s => selectedOrg === 'all' || s.organisation_id === selectedOrg)
    .filter(s => search === '' || s.name.toLowerCase().includes(search.toLowerCase()) || (s.city || '').toLowerCase().includes(search.toLowerCase()));

  const allStats = Object.values(stats);
  const sessionsToday = allStats.filter(s => s.session_id).length;
  const signedOff = allStats.filter(s => s.status === 'signed_off').length;
  const inProgress = allStats.filter(s => s.status === 'open' || s.status === 'in_progress').length;
  const noSession = stores.length - sessionsToday;
  const avgCompliance = sessionsToday > 0 ? Math.round(allStats.filter(s => s.session_id).reduce((sum, s) => sum + pct(s), 0) / sessionsToday) : 0;
  const totalViolations = allStats.reduce((sum, s) => sum + s.temp_violations, 0);

  const cardStyle = { background: '#fff', borderRadius: 20, padding: 24, border: '1px solid #eef2ee', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' };
  const labelStyle = { fontSize: 13, color: '#666', marginBottom: 8, fontWeight: 500 as const };

  return (
    <div style={{ minHeight: '100vh', background: '#f8faf8', fontFamily: 'system-ui, sans-serif' }}>

      <div style={{ background: `linear-gradient(135deg, ${DARK}, ${PRIMARY})`, padding: '0 32px' }}>
        <div style={{ maxWidth: 1400, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 64 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 32, height: 32, background: 'rgba(255,255,255,0.15)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <polyline points="2,9 7,14 16,4" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <span style={{ color: '#fff', fontWeight: 700, fontSize: 18 }}>CompliTrack</span>
            <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 18 }}>/</span>
            <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: 16 }}>{franchisorName}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {lastUpdated && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#4ade80', boxShadow: '0 0 6px #4ade80' }} />
                <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>Live — {lastUpdated.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
              </div>
            )}
            <button onClick={() => supabase.auth.signOut().then(() => router.push('/login'))} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 14 }}>Sign out</button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '32px 24px' }}>
        {loading && <div style={{ textAlign: 'center', padding: 80, color: '#666' }}>Loading franchise data...</div>}

        {!loading && (
          <div>
            <div style={{ marginBottom: 32 }}>
              <h1 style={{ fontSize: 28, fontWeight: 800, color: '#111', margin: '0 0 4px 0' }}>
                Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, {profile?.full_name?.split(' ')[0]}
              </h1>
              <p style={{ color: '#888', margin: 0, fontSize: 15 }}>{franchisorName} — {new Date().toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 20, marginBottom: 32 }}>
              <div style={cardStyle}>
                <div style={labelStyle}>TOTAL STORES</div>
                <div style={{ fontSize: 40, fontWeight: 800, color: PRIMARY }}>{stores.length}</div>
                <div style={{ fontSize: 13, color: '#888', marginTop: 4 }}>{orgs.length} organisations</div>
              </div>
              <div style={cardStyle}>
                <div style={labelStyle}>SIGNED OFF</div>
                <div style={{ fontSize: 40, fontWeight: 800, color: signedOff === stores.length && stores.length > 0 ? PRIMARY : '#f59e0b' }}>{signedOff}</div>
                <div style={{ fontSize: 13, color: '#888', marginTop: 4 }}>of {stores.length} stores</div>
                <div style={{ marginTop: 12, height: 6, background: '#eef2ee', borderRadius: 3 }}>
                  <div style={{ height: '100%', width: `${stores.length > 0 ? (signedOff / stores.length) * 100 : 0}%`, background: PRIMARY, borderRadius: 3 }} />
                </div>
              </div>
              <div style={cardStyle}>
                <div style={labelStyle}>IN PROGRESS</div>
                <div style={{ fontSize: 40, fontWeight: 800, color: '#f59e0b' }}>{inProgress}</div>
                <div style={{ fontSize: 13, color: '#888', marginTop: 4 }}>sessions active now</div>
              </div>
              <div style={cardStyle}>
                <div style={labelStyle}>NO SESSION</div>
                <div style={{ fontSize: 40, fontWeight: 800, color: noSession > 0 ? '#ef4444' : PRIMARY }}>{noSession}</div>
                <div style={{ fontSize: 13, color: '#888', marginTop: 4 }}>stores not started</div>
              </div>
              <div style={cardStyle}>
                <div style={labelStyle}>AVG COMPLIANCE</div>
                <div style={{ fontSize: 40, fontWeight: 800, color: pctColor(avgCompliance) }}>{avgCompliance}%</div>
                <div style={{ fontSize: 13, color: '#888', marginTop: 4 }}>across {sessionsToday} sessions</div>
                <div style={{ marginTop: 12, height: 6, background: '#eef2ee', borderRadius: 3 }}>
                  <div style={{ height: '100%', width: `${avgCompliance}%`, background: pctColor(avgCompliance), borderRadius: 3 }} />
                </div>
              </div>
              <div style={cardStyle}>
                <div style={labelStyle}>TEMP VIOLATIONS</div>
                <div style={{ fontSize: 40, fontWeight: 800, color: totalViolations > 0 ? '#ef4444' : PRIMARY }}>{totalViolations}</div>
                <div style={{ fontSize: 13, color: '#888', marginTop: 4 }}>out of range today</div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' as const, alignItems: 'center' }}>
              <input placeholder="Search stores..." value={search} onChange={e => setSearch(e.target.value)} style={{ padding: '10px 16px', borderRadius: 10, border: '1.5px solid #eef2ee', fontSize: 14, outline: 'none', fontFamily: 'inherit', minWidth: 220, background: '#fff' }} />
              <div style={{ display: 'flex', gap: 4, background: '#fff', padding: 4, borderRadius: 12, border: '1px solid #eef2ee' }}>
                <button onClick={() => setSelectedOrg('all')} style={{ padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13, background: selectedOrg === 'all' ? PRIMARY : 'transparent', color: selectedOrg === 'all' ? '#fff' : '#666' }}>All</button>
                {orgs.map(org => (
                  <button key={org.id} onClick={() => setSelectedOrg(org.id)} style={{ padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13, background: selectedOrg === org.id ? PRIMARY : 'transparent', color: selectedOrg === org.id ? '#fff' : '#666', whiteSpace: 'nowrap' as const }}>{org.name}</button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 4, background: '#fff', padding: 4, borderRadius: 12, border: '1px solid #eef2ee', marginLeft: 'auto' }}>
                <button onClick={() => setActiveTab('today')} style={{ padding: '6px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13, background: activeTab === 'today' ? PRIMARY : 'transparent', color: activeTab === 'today' ? '#fff' : '#666' }}>Today</button>
                <button onClick={() => setActiveTab('history')} style={{ padding: '6px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13, background: activeTab === 'history' ? PRIMARY : 'transparent', color: activeTab === 'history' ? '#fff' : '#666' }}>History</button>
              </div>
            </div>

            {activeTab === 'today' && (
              <div>
                <div style={{ marginBottom: 16 }}>
                  <h2 style={{ fontSize: 18, fontWeight: 700, color: '#333', margin: 0 }}>Store Health — Today ({filteredStores.length} stores)</h2>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
                  {filteredStores.map(store => {
                    const s = stats[store.id];
                    const p = s ? pct(s) : 0;
                    const color = pctColor(p);
                    const hasSession = s?.session_id != null;
                    const health = !hasSession ? 'none' : s?.status === 'signed_off' && p === 100 ? 'excellent' : p >= 70 ? 'good' : 'poor';
                    const borderColor = health === 'excellent' ? '#c8e6c9' : health === 'good' ? '#fde68a' : health === 'poor' ? '#fca5a5' : '#eef2ee';
                    return (
                      <div key={store.id} style={{ background: '#fff', borderRadius: 16, border: `1.5px solid ${borderColor}`, padding: 20, boxShadow: '0 2px 6px rgba(0,0,0,0.04)' }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
                          <div>
                            <div style={{ fontWeight: 700, color: '#333', fontSize: 15, marginBottom: 2 }}>{store.name}</div>
                            <div style={{ fontSize: 12, color: '#aaa' }}>{getOrgName(store.organisation_id)}</div>
                            {store.city && <div style={{ fontSize: 12, color: '#bbb' }}>{store.city}</div>}
                          </div>
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 20, whiteSpace: 'nowrap' as const, background: !hasSession ? '#f3f4f6' : s?.status === 'signed_off' ? '#e8f5e9' : '#fff8e1', color: !hasSession ? '#9ca3af' : s?.status === 'signed_off' ? PRIMARY : '#f59e0b' }}>
                            {!hasSession ? 'NO SESSION' : s?.status === 'signed_off' ? 'SIGNED OFF' : 'IN PROGRESS'}
                          </span>
                        </div>
                        {hasSession && s ? (
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                              <span style={{ fontSize: 12, color: '#888' }}>{s.completed}/{s.total} tasks</span>
                              <span style={{ fontSize: 15, fontWeight: 800, color }}>{p}%</span>
                            </div>
                            <div style={{ height: 8, background: '#eef2ee', borderRadius: 4, marginBottom: 12 }}>
                              <div style={{ height: '100%', width: `${p}%`, background: color, borderRadius: 4 }} />
                            </div>
                            <div style={{ display: 'flex', gap: 8 }}>
                              <div style={{ flex: 1, textAlign: 'center' as const, background: '#f8faf8', borderRadius: 8, padding: '6px 4px' }}>
                                <div style={{ fontSize: 14, fontWeight: 700, color: '#333' }}>{s.uniform_photos}</div>
                                <div style={{ fontSize: 10, color: '#aaa' }}>Uniforms</div>
                              </div>
                              <div style={{ flex: 1, textAlign: 'center' as const, background: s.temp_violations > 0 ? '#fdecea' : '#f8faf8', borderRadius: 8, padding: '6px 4px' }}>
                                <div style={{ fontSize: 14, fontWeight: 700, color: s.temp_violations > 0 ? '#ef4444' : '#333' }}>{s.temp_violations}</div>
                                <div style={{ fontSize: 10, color: '#aaa' }}>Violations</div>
                              </div>
                              {s.duration_seconds && (
                                <div style={{ flex: 1, textAlign: 'center' as const, background: '#f8faf8', borderRadius: 8, padding: '6px 4px' }}>
                                  <div style={{ fontSize: 11, fontWeight: 700, color: PRIMARY }}>{formatDuration(s.duration_seconds)}</div>
                                  <div style={{ fontSize: 10, color: '#aaa' }}>Duration</div>
                                </div>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div style={{ textAlign: 'center' as const, padding: '16px 0', color: '#ddd', fontSize: 13 }}>No session started today</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {activeTab === 'history' && (
              <div>
                <div style={{ marginBottom: 16 }}>
                  <h2 style={{ fontSize: 18, fontWeight: 700, color: '#333', margin: 0 }}>Compliance History — Last 60 Sessions</h2>
                </div>
                <div style={{ background: '#fff', borderRadius: 20, border: '1px solid #eef2ee', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                  {history.length === 0 && <div style={{ textAlign: 'center' as const, padding: 60, color: '#aaa' }}>No history yet</div>}
                  {history.map((session, idx) => {
                    const p = pct(session);
                    const color = pctColor(p);
                    const storeName = getStoreName(session.store_id);
                    const isToday = session.session_date === new Date().toISOString().split('T')[0];
                    return (
                      <div key={session.id} style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 16, borderBottom: idx < history.length - 1 ? '1px solid #f0f4f0' : 'none' }}>
                        <div style={{ width: 44, height: 44, borderRadius: 12, background: session.status === 'signed_off' ? '#e8f5e9' : '#fff8e1', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontWeight: 800, fontSize: 15, color: session.status === 'signed_off' ? PRIMARY : '#f59e0b' }}>
                          {new Date(session.session_date).getDate()}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            <span style={{ fontWeight: 700, color: '#333', fontSize: 14 }}>{storeName}</span>
                            <span style={{ fontSize: 11, color: '#aaa' }}>
                              {isToday ? 'Today' : new Date(session.session_date).toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                            </span>
                            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: session.status === 'signed_off' ? '#e8f5e9' : '#fff8e1', color: session.status === 'signed_off' ? PRIMARY : '#f59e0b' }}>
                              {session.status === 'signed_off' ? 'SIGNED OFF' : 'IN PROGRESS'}
                            </span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <div style={{ width: 120, height: 6, background: '#eef2ee', borderRadius: 3 }}>
                              <div style={{ height: '100%', width: `${p}%`, background: color, borderRadius: 3 }} />
                            </div>
                            <span style={{ fontSize: 13, color, fontWeight: 600 }}>{p}%</span>
                            <span style={{ fontSize: 12, color: '#aaa' }}>{session.completed}/{session.total} tasks</span>
                            {session.duration_seconds && <span style={{ fontSize: 12, color: PRIMARY, fontWeight: 600 }}>{formatDuration(session.duration_seconds)}</span>}
                          </div>
                        </div>
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
