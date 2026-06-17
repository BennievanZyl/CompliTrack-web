'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

const PRIMARY = '#1a5c38';
const DARK = '#0a1f12';

type Store = {
  id: string;
  name: string;
  address: string;
  city: string;
  is_active: boolean;
  manager_name: string | null;
};

type StoreStats = {
  store_id: string;
  session_id: string | null;
  status: string | null;
  total: number;
  completed: number;
  uniform_photos: number;
  temp_violations: number;
  started_at: string | null;
  duration_seconds: number | null;
};

type Profile = {
  organisation_id: string;
  full_name: string;
  franchisor_id: string;
};

function formatDuration(seconds: number): string {
  if (seconds >= 3600) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

export default function OrgPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [stores, setStores] = useState<Store[]>([]);
  const [stats, setStats] = useState<Record<string, StoreStats>>({});
  const [loading, setLoading] = useState(true);
  const [orgName, setOrgName] = useState('');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => { checkAuthAndLoad(); }, []);

  useEffect(() => {
    if (!stores.length) return;
    const channel = supabase
      .channel('org-live')
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
      .from('profiles')
      .select('organisation_id, full_name, franchisor_id, role')
      .eq('id', user.id)
      .single();

    if (!profileData) { router.push('/login'); return; }
    if (profileData.role === 'store_manager' || profileData.role === 'staff') { router.push('/dashboard'); return; }

    setProfile(profileData);

    const { data: orgData } = await supabase
      .from('organisations')
      .select('name')
      .eq('id', profileData.organisation_id)
      .single();

    setOrgName(orgData?.name || 'Your Organisation');

    const { data: storeData } = await supabase
      .from('stores')
      .select('id, name, address, city, is_active, manager_name')
      .eq('organisation_id', profileData.organisation_id)
      .eq('is_active', true)
      .order('name');

    setStores(storeData || []);
    if (storeData) await loadStats(storeData);
    setLoading(false);
  }

  async function loadStats(storeList: Store[]) {
    const today = new Date().toISOString().split('T')[0];
    const statsMap: Record<string, StoreStats> = {};

    await Promise.all(storeList.map(async (store) => {
      const { data: session } = await supabase
        .from('daily_sessions')
        .select('id, status, started_at, duration_seconds')
        .eq('store_id', store.id)
        .eq('session_date', today)
        .single();

      if (!session) {
        statsMap[store.id] = { store_id: store.id, session_id: null, status: null, total: 0, completed: 0, uniform_photos: 0, temp_violations: 0, started_at: null, duration_seconds: null };
        return;
      }

      const { count: total } = await supabase.from('checklist_items').select('*', { count: 'exact', head: true }).eq('session_id', session.id);
      const { count: completed } = await supabase.from('checklist_items').select('*', { count: 'exact', head: true }).eq('session_id', session.id).eq('completed', true);
      const { count: uniform_photos } = await supabase.from('uniform_sessions').select('*', { count: 'exact', head: true }).eq('session_id', session.id);
      const { count: temp_violations } = await supabase.from('temperature_logs').select('*', { count: 'exact', head: true }).eq('session_id', session.id).eq('is_compliant', false);

      statsMap[store.id] = {
        store_id: store.id,
        session_id: session.id,
        status: session.status,
        total: total || 0,
        completed: completed || 0,
        uniform_photos: uniform_photos || 0,
        temp_violations: temp_violations || 0,
        started_at: session.started_at,
        duration_seconds: session.duration_seconds,
      };
    }));

    setStats(statsMap);
    setLastUpdated(new Date());
  }

  const pct = (s: StoreStats) => s.total > 0 ? Math.round((s.completed / s.total) * 100) : 0;
  const pctColor = (p: number) => p === 100 ? PRIMARY : p >= 70 ? '#f59e0b' : '#ef4444';

  const allStats = Object.values(stats);
  const sessionsToday = allStats.filter(s => s.session_id).length;
  const signedOff = allStats.filter(s => s.status === 'signed_off').length;
  const avgCompliance = allStats.length > 0 ? Math.round(allStats.filter(s => s.session_id).reduce((sum, s) => sum + pct(s), 0) / Math.max(sessionsToday, 1)) : 0;
  const totalViolations = allStats.reduce((sum, s) => sum + s.temp_violations, 0);

  const cardStyle = { background: '#fff', borderRadius: 20, padding: 24, border: '1px solid #eef2ee', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' };
  const labelStyle = { fontSize: 13, color: '#666', marginBottom: 8, fontWeight: 500 as const };

  return (
    <div style={{ minHeight: '100vh', background: '#f8faf8', fontFamily: 'system-ui, sans-serif' }}>

      <div style={{ background: `linear-gradient(135deg, ${DARK}, ${PRIMARY})`, padding: '0 32px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 64 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 32, height: 32, background: 'rgba(255,255,255,0.15)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <polyline points="2,9 7,14 16,4" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <span style={{ color: '#fff', fontWeight: 700, fontSize: 18 }}>CompliTrack</span>
            <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 18 }}>/</span>
            <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: 16 }}>{orgName}</span>
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

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 24px' }}>

        {loading && <div style={{ textAlign: 'center', padding: 80, color: '#666' }}>Loading stores...</div>}

        {!loading && (
          <div>

            <div style={{ marginBottom: 32 }}>
              <h1 style={{ fontSize: 28, fontWeight: 800, color: '#111', margin: '0 0 4px 0' }}>Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, {profile?.full_name?.split(' ')[0]}</h1>
              <p style={{ color: '#888', margin: 0, fontSize: 15 }}>{orgName} — {new Date().toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 20, marginBottom: 32 }}>

              <div style={cardStyle}>
                <div style={labelStyle}>TOTAL STORES</div>
                <div style={{ fontSize: 40, fontWeight: 800, color: PRIMARY }}>{stores.length}</div>
                <div style={{ fontSize: 13, color: '#888', marginTop: 4 }}>active stores</div>
              </div>

              <div style={cardStyle}>
                <div style={labelStyle}>SESSIONS TODAY</div>
                <div style={{ fontSize: 40, fontWeight: 800, color: PRIMARY }}>{sessionsToday}</div>
                <div style={{ fontSize: 13, color: '#888', marginTop: 4 }}>of {stores.length} stores</div>
                <div style={{ marginTop: 12, height: 6, background: '#eef2ee', borderRadius: 3 }}>
                  <div style={{ height: '100%', width: `${stores.length > 0 ? (sessionsToday / stores.length) * 100 : 0}%`, background: PRIMARY, borderRadius: 3 }} />
                </div>
              </div>

              <div style={cardStyle}>
                <div style={labelStyle}>SIGNED OFF</div>
                <div style={{ fontSize: 40, fontWeight: 800, color: signedOff === stores.length && stores.length > 0 ? PRIMARY : '#f59e0b' }}>{signedOff}</div>
                <div style={{ fontSize: 13, color: '#888', marginTop: 4 }}>of {sessionsToday} sessions</div>
                <div style={{ marginTop: 12, height: 6, background: '#eef2ee', borderRadius: 3 }}>
                  <div style={{ height: '100%', width: `${sessionsToday > 0 ? (signedOff / sessionsToday) * 100 : 0}%`, background: signedOff === sessionsToday && sessionsToday > 0 ? PRIMARY : '#f59e0b', borderRadius: 3 }} />
                </div>
              </div>

              <div style={cardStyle}>
                <div style={labelStyle}>AVG COMPLIANCE</div>
                <div style={{ fontSize: 40, fontWeight: 800, color: pctColor(avgCompliance) }}>{avgCompliance}%</div>
                <div style={{ fontSize: 13, color: '#888', marginTop: 4 }}>across active sessions</div>
                <div style={{ marginTop: 12, height: 6, background: '#eef2ee', borderRadius: 3 }}>
                  <div style={{ height: '100%', width: `${avgCompliance}%`, background: pctColor(avgCompliance), borderRadius: 3 }} />
                </div>
              </div>

              <div style={cardStyle}>
                <div style={labelStyle}>TEMP VIOLATIONS</div>
                <div style={{ fontSize: 40, fontWeight: 800, color: totalViolations > 0 ? '#ef4444' : PRIMARY }}>{totalViolations}</div>
                <div style={{ fontSize: 13, color: '#888', marginTop: 4 }}>out of range readings</div>
              </div>

            </div>

            <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: '#333', margin: 0 }}>Store Overview — Today</h2>
              <span style={{ fontSize: 13, color: '#aaa' }}>{new Date().toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 20 }}>
              {stores.map(store => {
                const s = stats[store.id];
                const p = s ? pct(s) : 0;
                const color = pctColor(p);
                const hasSession = s?.session_id != null;

                return (
                  <div key={store.id} onClick={() => router.push('/dashboard')} style={{ background: '#fff', borderRadius: 20, border: '1px solid #eef2ee', padding: 24, cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', transition: 'box-shadow 0.2s' }}>

                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
                      <div>
                        <div style={{ fontWeight: 700, color: '#333', fontSize: 16, marginBottom: 4 }}>{store.name}</div>
                        <div style={{ fontSize: 13, color: '#888' }}>{store.city || store.address}</div>
                        {store.manager_name && <div style={{ fontSize: 12, color: '#aaa', marginTop: 2 }}>Manager: {store.manager_name}</div>}
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 20, whiteSpace: 'nowrap', background: !hasSession ? '#f3f4f6' : s?.status === 'signed_off' ? '#e8f5e9' : '#fff8e1', color: !hasSession ? '#9ca3af' : s?.status === 'signed_off' ? PRIMARY : '#f59e0b' }}>
                        {!hasSession ? 'NO SESSION' : s?.status === 'signed_off' ? 'SIGNED OFF' : 'IN PROGRESS'}
                      </span>
                    </div>

                    {hasSession && s ? (
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                          <span style={{ fontSize: 13, color: '#666' }}>Compliance</span>
                          <span style={{ fontSize: 14, fontWeight: 700, color }}>{p}%</span>
                        </div>
                        <div style={{ height: 8, background: '#eef2ee', borderRadius: 4, marginBottom: 16 }}>
                          <div style={{ height: '100%', width: `${p}%`, background: color, borderRadius: 4, transition: 'width 0.5s' }} />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                          <div style={{ textAlign: 'center', background: '#f8faf8', borderRadius: 10, padding: '8px 4px' }}>
                            <div style={{ fontSize: 16, fontWeight: 800, color: '#333' }}>{s.completed}/{s.total}</div>
                            <div style={{ fontSize: 10, color: '#aaa', marginTop: 2 }}>Tasks</div>
                          </div>
                          <div style={{ textAlign: 'center', background: '#f8faf8', borderRadius: 10, padding: '8px 4px' }}>
                            <div style={{ fontSize: 16, fontWeight: 800, color: '#333' }}>{s.uniform_photos}</div>
                            <div style={{ fontSize: 10, color: '#aaa', marginTop: 2 }}>Uniforms</div>
                          </div>
                          <div style={{ textAlign: 'center', background: s.temp_violations > 0 ? '#fdecea' : '#f8faf8', borderRadius: 10, padding: '8px 4px' }}>
                            <div style={{ fontSize: 16, fontWeight: 800, color: s.temp_violations > 0 ? '#ef4444' : '#333' }}>{s.temp_violations}</div>
                            <div style={{ fontSize: 10, color: '#aaa', marginTop: 2 }}>Violations</div>
                          </div>
                        </div>
                        {s.duration_seconds && (
                          <div style={{ marginTop: 12, fontSize: 12, color: '#aaa', textAlign: 'right' }}>Completed in {formatDuration(s.duration_seconds)}</div>
                        )}
                      </div>
                    ) : (
                      <div style={{ textAlign: 'center', padding: '24px 0', color: '#ccc', fontSize: 14 }}>No compliance session started today</div>
                    )}

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
