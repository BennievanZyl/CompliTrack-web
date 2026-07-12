'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

const PRIMARY = '#1a5c38';
const DARK = '#0a1f12';

type Organisation = { id: string; name: string; };
type Store = { id: string; name: string; city: string; manager_name: string | null; organisation_id: string; is_active: boolean; };
type StoreStats = { store_id: string; session_id: string | null; status: string | null; total: number; completed: number; uniform_photos: number; temp_violations: number; duration_seconds: number | null; sales_mtd: number; expenses_mtd: number; food_cost_pct: number | null; };
type Profile = { full_name: string; franchisor_id: string; role: string; };
type HistorySession = { id: string; session_date: string; status: string; store_id: string; duration_seconds: number | null; total: number; completed: number; };
type ChecklistItem = { id: string; completed: boolean; completed_at: string | null; notes: string | null; photo_url: string | null; checklist_templates: { task_name: string; section: string; } | null; };
type UniformSession = { id: string; photo_url: string; taken_at: string; ai_overall_result: string | null; };
type TempLog = { id: string; equipment_name: string; temperature_c: number; period: string; is_compliant: boolean; };

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

  // Store detail panel
  const [selectedStore, setSelectedStore] = useState<Store | null>(null);
  const [panelLoading, setPanelLoading] = useState(false);
  const [panelChecklist, setPanelChecklist] = useState<ChecklistItem[]>([]);
  const [panelUniforms, setPanelUniforms] = useState<UniformSession[]>([]);
  const [panelTemps, setPanelTemps] = useState<TempLog[]>([]);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

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
    const { data: profileData } = await supabase.from('profiles').select('full_name, franchisor_id, role').eq('id', user.id).single();
    if (!profileData) { router.push('/login'); return; }
    if (profileData.role !== 'franchisor_admin' && profileData.role !== 'platform_admin') { router.push('/dashboard'); return; }
    setProfile(profileData);
    const { data: franchisorData } = await supabase.from('franchisors').select('name').eq('id', profileData.franchisor_id).single();
    setFranchisorName(franchisorData?.name || 'Franchisor');
    const { data: orgData } = await supabase.from('organisations').select('id, name').eq('franchisor_id', profileData.franchisor_id).order('name');
    setOrgs(orgData || []);
    const orgIds = (orgData || []).map(o => o.id);
    if (orgIds.length === 0) { setLoading(false); return; }
    const { data: storeData } = await supabase.from('stores').select('id, name, city, manager_name, organisation_id, is_active').in('organisation_id', orgIds).eq('is_active', true).order('name');
    setStores(storeData || []);
    if (storeData) await Promise.all([loadStats(storeData), loadHistory(storeData)]);
    setLoading(false);
  }

  async function loadStats(storeList: Store[]) {
    const today = new Date().toISOString().split('T')[0];
    const monthStart = today.slice(0, 7) + '-01';
    const statsMap: Record<string, StoreStats> = {};
    await Promise.all(storeList.map(async (store) => {
      const [sessionRes, salesRes, expRes, purchRes, wastRes] = await Promise.all([
        supabase.from('daily_sessions').select('id, status, duration_seconds').eq('store_id', store.id).eq('session_date', today).eq('session_type', 'daily').maybeSingle(),
        supabase.from('cash_ups').select('cash_up_total').eq('store_id', store.id).neq('status', 'draft').gte('cash_up_date', monthStart).lte('cash_up_date', today),
        supabase.from('expenses').select('amount').eq('store_id', store.id).gte('expense_date', monthStart).lte('expense_date', today),
        supabase.from('stock_purchases').select('total_cost').eq('store_id', store.id).gte('purchase_date', monthStart).lte('purchase_date', today),
        supabase.from('stock_wastage').select('total_cost').eq('store_id', store.id).gte('wastage_date', monthStart).lte('wastage_date', today),
      ]);
      const session = sessionRes.data;
      const sales_mtd = (salesRes.data || []).reduce((s: number, r: any) => s + Number(r.cash_up_total || 0), 0);
      const expenses_mtd = (expRes.data || []).reduce((s: number, r: any) => s + Number(r.amount || 0), 0);
      const purchases = (purchRes.data || []).reduce((s: number, r: any) => s + Number(r.total_cost || 0), 0);
      const wastage = (wastRes.data || []).reduce((s: number, r: any) => s + Number(r.total_cost || 0), 0);
      const food_cost_pct = sales_mtd > 0 ? (purchases - wastage) / sales_mtd * 100 : null;
      if (!session) {
        statsMap[store.id] = { store_id: store.id, session_id: null, status: null, total: 0, completed: 0, uniform_photos: 0, temp_violations: 0, duration_seconds: null, sales_mtd, expenses_mtd, food_cost_pct };
        return;
      }
      const [totalRes, completedRes, uniformRes, violationRes] = await Promise.all([
        supabase.from('checklist_items').select('id').eq('session_id', session.id),
        supabase.from('checklist_items').select('id').eq('session_id', session.id).eq('completed', true),
        supabase.from('uniform_sessions').select('id').eq('session_id', session.id),
        supabase.from('temperature_logs').select('id').eq('session_id', session.id).eq('is_compliant', false),
      ]);
      statsMap[store.id] = { store_id: store.id, session_id: session.id, status: session.status, total: totalRes.data?.length || 0, completed: completedRes.data?.length || 0, uniform_photos: uniformRes.data?.length || 0, temp_violations: violationRes.data?.length || 0, duration_seconds: session.duration_seconds, sales_mtd, expenses_mtd, food_cost_pct };
    }));
    setStats(statsMap);
    setLastUpdated(new Date());
  }

  async function loadHistory(storeList: Store[]) {
    const storeIds = storeList.map(s => s.id);
    const { data: sessions } = await supabase.from('daily_sessions').select('id, session_date, status, store_id, duration_seconds').in('store_id', storeIds).eq('session_type', 'daily').order('session_date', { ascending: false }).limit(60);
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

  async function openStorePanel(store: Store) {
    setSelectedStore(store);
    setPanelLoading(true);
    setPanelChecklist([]);
    setPanelUniforms([]);
    setPanelTemps([]);
    const s = stats[store.id];
    if (!s?.session_id) { setPanelLoading(false); return; }
    const [checklistRes, uniformRes, tempRes] = await Promise.all([
      supabase.from('checklist_items').select('id, completed, completed_at, notes, photo_url, checklist_templates(task_name, section)').eq('session_id', s.session_id).order('created_at'),
      supabase.from('uniform_sessions').select('id, photo_url, taken_at, ai_overall_result').eq('session_id', s.session_id),
      supabase.from('temperature_logs').select('id, equipment_name, temperature_c, period, is_compliant').eq('session_id', s.session_id),
    ]);
    setPanelChecklist(checklistRes.data || []);
    setPanelUniforms(uniformRes.data || []);
    setPanelTemps(tempRes.data || []);
    setPanelLoading(false);
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

  // Group checklist by section
  const panelSections = panelChecklist.reduce<Record<string, ChecklistItem[]>>((acc, item) => {
    const sec = item.checklist_templates?.section || 'General';
    if (!acc[sec]) acc[sec] = [];
    acc[sec].push(item);
    return acc;
  }, {});
  const sortedPanelSections = Object.entries(panelSections).sort(([a], [b]) => a.localeCompare(b));

  return (
    <div style={{ minHeight: '100vh', background: '#f8faf8', fontFamily: 'system-ui, sans-serif' }}>

      {/* Lightbox */}
      {lightboxUrl && (
        <div onClick={() => setLightboxUrl(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <img src={lightboxUrl} alt="inspection" style={{ maxWidth: '90vw', maxHeight: '85vh', objectFit: 'contain', borderRadius: 12 }} />
          <div style={{ position: 'absolute', top: 20, right: 24, color: 'rgba(255,255,255,0.6)', fontSize: 14 }}>Tap anywhere to close</div>
        </div>
      )}

      {/* Store detail slide-in panel */}
      {selectedStore && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex' }}>
          <div onClick={() => setSelectedStore(null)} style={{ flex: 1, background: 'rgba(0,0,0,0.4)', cursor: 'pointer' }} />
          <div style={{ width: 500, background: '#fff', height: '100vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', boxShadow: '-4px 0 32px rgba(0,0,0,0.15)' }}>
            {/* Panel header */}
            <div style={{ background: `linear-gradient(135deg, ${DARK}, ${PRIMARY})`, padding: '20px 24px', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ color: '#fff', fontWeight: 700, fontSize: 17 }}>{selectedStore.name}</span>
                <button onClick={() => setSelectedStore(null)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 14 }}>Close</button>
              </div>
              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>{getOrgName(selectedStore.organisation_id)} {selectedStore.city ? `· ${selectedStore.city}` : ''}</div>
              {stats[selectedStore.id]?.session_id && (
                <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                  {[
                    { label: 'Tasks', value: `${stats[selectedStore.id].completed}/${stats[selectedStore.id].total}` },
                    { label: 'Compliance', value: `${pct(stats[selectedStore.id])}%` },
                    { label: 'Duration', value: stats[selectedStore.id].duration_seconds ? formatDuration(stats[selectedStore.id].duration_seconds!) : '—' },
                  ].map(item => (
                    <div key={item.label} style={{ flex: 1, background: 'rgba(255,255,255,0.15)', borderRadius: 10, padding: '8px 12px', textAlign: 'center' as const }}>
                      <div style={{ color: '#fff', fontWeight: 800, fontSize: 16 }}>{item.value}</div>
                      <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, marginTop: 2 }}>{item.label}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {panelLoading && <div style={{ textAlign: 'center', padding: 60, color: '#aaa' }}>Loading session data...</div>}

            {!panelLoading && !stats[selectedStore.id]?.session_id && (
              <div style={{ textAlign: 'center' as const, padding: 60, color: '#aaa' }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
                <div style={{ fontWeight: 600, color: '#555' }}>No session today</div>
                <div style={{ fontSize: 13, marginTop: 4 }}>This store hasn&apos;t started a compliance session yet</div>
              </div>
            )}

            {!panelLoading && stats[selectedStore.id]?.session_id && (
              <div style={{ flex: 1, padding: 24 }}>

                {/* Checklist */}
                {panelChecklist.length > 0 && (
                  <div style={{ marginBottom: 28 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#333', marginBottom: 16 }}>Checklist</div>
                    {sortedPanelSections.map(([section, items]) => {
                      const secDone = items.filter(i => i.completed).length;
                      return (
                        <div key={section} style={{ marginBottom: 16, background: '#f8faf8', borderRadius: 14, overflow: 'hidden', border: '1px solid #eef2ee' }}>
                          <div style={{ padding: '10px 16px', background: '#f0f4f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontWeight: 600, color: '#333', fontSize: 13 }}>{section}</span>
                            <span style={{ fontSize: 12, color: secDone === items.length ? PRIMARY : '#888', fontWeight: 600 }}>{secDone}/{items.length}</span>
                          </div>
                          {items.map((item, idx) => (
                            <div key={item.id} style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12, borderTop: idx === 0 ? 'none' : '1px solid #f0f4f0', background: '#fff' }}>
                              <div style={{ width: 22, height: 22, borderRadius: '50%', flexShrink: 0, background: item.completed ? PRIMARY : '#eef2ee', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12, fontWeight: 700 }}>
                                {item.completed ? '✓' : ''}
                              </div>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 13, color: item.completed ? '#333' : '#999', fontWeight: item.completed ? 500 : 400 }}>{item.checklist_templates?.task_name || 'Unknown task'}</div>
                                {item.notes && <div style={{ fontSize: 11, color: '#aaa', marginTop: 2, fontStyle: 'italic' }}>{item.notes}</div>}
                              </div>
                              {item.photo_url && (
                                <img onClick={() => setLightboxUrl(item.photo_url!)} src={item.photo_url} alt="evidence" style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'cover', cursor: 'zoom-in', border: '2px solid #eef2ee', flexShrink: 0 }} />
                              )}
                              {item.completed_at && <div style={{ fontSize: 10, color: '#bbb', whiteSpace: 'nowrap' as const }}>{new Date(item.completed_at).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}</div>}
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Uniforms */}
                {panelUniforms.length > 0 && (
                  <div style={{ marginBottom: 28 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#333', marginBottom: 16 }}>Uniform Checks ({panelUniforms.length})</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      {panelUniforms.map(u => (
                        <div key={u.id} style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid #eef2ee', cursor: 'zoom-in' }} onClick={() => setLightboxUrl(u.photo_url)}>
                          <img src={u.photo_url} alt="uniform" style={{ width: '100%', height: 120, objectFit: 'cover' }} />
                          <div style={{ padding: '8px 10px', background: '#f8faf8', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: 11, color: '#888' }}>{new Date(u.taken_at).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}</span>
                            {u.ai_overall_result && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 20, background: u.ai_overall_result === 'pass' ? '#e8f5e9' : '#fdecea', color: u.ai_overall_result === 'pass' ? PRIMARY : '#ef4444' }}>{u.ai_overall_result.toUpperCase()}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Temperature */}
                {panelTemps.length > 0 && (
                  <div style={{ marginBottom: 28 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#333', marginBottom: 16 }}>Temperature Logs</div>
                    {panelTemps.map(log => (
                      <div key={log.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', background: log.is_compliant ? '#f8faf8' : '#fdecea', borderRadius: 12, marginBottom: 8, border: `1px solid ${log.is_compliant ? '#eef2ee' : '#fca5a5'}` }}>
                        <div style={{ width: 40, height: 40, borderRadius: 10, background: log.is_compliant ? '#e8f5e9' : '#fdecea', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, color: log.is_compliant ? PRIMARY : '#ef4444', flexShrink: 0 }}>T</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600, color: '#333', fontSize: 14 }}>{log.equipment_name}</div>
                          <div style={{ fontSize: 12, color: '#888' }}>{log.period}</div>
                        </div>
                        <div style={{ textAlign: 'right' as const }}>
                          <div style={{ fontSize: 18, fontWeight: 800, color: log.is_compliant ? PRIMARY : '#ef4444' }}>{log.temperature_c}°C</div>
                          <div style={{ fontSize: 10, fontWeight: 700, color: log.is_compliant ? PRIMARY : '#ef4444' }}>{log.is_compliant ? 'OK' : 'OUT OF RANGE'}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

              </div>
            )}
          </div>
        </div>
      )}

      {/* Header */}
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
              {[
                { label: 'TOTAL STORES', value: stores.length, sub: `${orgs.length} organisations`, color: PRIMARY },
                { label: 'SIGNED OFF', value: signedOff, sub: `of ${stores.length} stores`, color: signedOff === stores.length && stores.length > 0 ? PRIMARY : '#f59e0b', progress: stores.length > 0 ? (signedOff / stores.length) * 100 : 0 },
                { label: 'IN PROGRESS', value: inProgress, sub: 'sessions active now', color: '#f59e0b' },
                { label: 'NO SESSION', value: noSession, sub: 'stores not started', color: noSession > 0 ? '#ef4444' : PRIMARY },
                { label: 'AVG COMPLIANCE', value: `${avgCompliance}%`, sub: `across ${sessionsToday} sessions`, color: pctColor(avgCompliance), progress: avgCompliance },
                { label: 'TEMP VIOLATIONS', value: totalViolations, sub: 'out of range today', color: totalViolations > 0 ? '#ef4444' : PRIMARY },
              ].map(item => (
                <div key={item.label} style={cardStyle}>
                  <div style={labelStyle}>{item.label}</div>
                  <div style={{ fontSize: 38, fontWeight: 800, color: item.color }}>{item.value}</div>
                  <div style={{ fontSize: 13, color: '#888', marginTop: 4 }}>{item.sub}</div>
                  {item.progress !== undefined && (
                    <div style={{ marginTop: 12, height: 6, background: '#eef2ee', borderRadius: 3 }}>
                      <div style={{ height: '100%', width: `${item.progress}%`, background: item.color, borderRadius: 3 }} />
                    </div>
                  )}
                </div>
              ))}
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
                  <p style={{ fontSize: 13, color: '#aaa', margin: '4px 0 0' }}>Click a store to view their compliance session detail</p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {filteredStores.map(store => {
                    const s = stats[store.id];
                    const p = s ? pct(s) : 0;
                    const color = pctColor(p);
                    const hasSession = s?.session_id != null;
                    const health = !hasSession ? 'none' : s?.status === 'signed_off' && p === 100 ? 'excellent' : p >= 70 ? 'good' : 'poor';
                    const borderColor = health === 'excellent' ? '#c8e6c9' : health === 'good' ? '#fde68a' : health === 'poor' ? '#fca5a5' : '#eef2ee';
                    const fmtR = (n: number) => 'R ' + (n || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                    const profitEst = (s?.sales_mtd || 0) - (s?.expenses_mtd || 0);
                    return (
                      <div key={store.id} onClick={() => window.open(`/dashboard?store=${store.id}`, '_blank')} style={{ background: '#fff', borderRadius: 16, border: `1.5px solid ${borderColor}`, padding: '16px 20px', cursor: 'pointer', boxShadow: '0 2px 6px rgba(0,0,0,0.04)', transition: 'transform 0.15s, box-shadow 0.15s', display: 'flex', alignItems: 'stretch', gap: 0 }}
                        onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.1)'; }}
                        onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 2px 6px rgba(0,0,0,0.04)'; }}
                      >
                        {/* Store identity + compliance */}
                        <div style={{ minWidth: 220, paddingRight: 20, borderRight: '1px solid #f0f0f0' }}>
                          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
                            <div>
                              <div style={{ fontWeight: 700, color: '#333', fontSize: 15, marginBottom: 2 }}>{store.name}</div>
                              <div style={{ fontSize: 11, color: '#aaa' }}>{getOrgName(store.organisation_id)}</div>
                              {store.city && <div style={{ fontSize: 11, color: '#bbb' }}>{store.city}</div>}
                            </div>
                            <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 20, whiteSpace: 'nowrap' as const, background: !hasSession ? '#f3f4f6' : s?.status === 'signed_off' ? '#e8f5e9' : '#fff8e1', color: !hasSession ? '#9ca3af' : s?.status === 'signed_off' ? PRIMARY : '#f59e0b' }}>
                              {!hasSession ? 'NO SESSION' : s?.status === 'signed_off' ? 'SIGNED OFF' : 'IN PROGRESS'}
                            </span>
                          </div>
                          {hasSession && s ? (
                            <>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                                <span style={{ fontSize: 11, color: '#888' }}>{s.completed}/{s.total} tasks</span>
                                <span style={{ fontSize: 14, fontWeight: 800, color }}>{p}%</span>
                              </div>
                              <div style={{ height: 6, background: '#eef2ee', borderRadius: 3, marginBottom: 8 }}>
                                <div style={{ height: '100%', width: `${p}%`, background: color, borderRadius: 3 }} />
                              </div>
                              <div style={{ display: 'flex', gap: 6 }}>
                                <div style={{ flex: 1, textAlign: 'center' as const, background: '#f8faf8', borderRadius: 6, padding: '4px 0' }}>
                                  <div style={{ fontSize: 13, fontWeight: 700 }}>{s.uniform_photos}</div>
                                  <div style={{ fontSize: 9, color: '#aaa' }}>Uniforms</div>
                                </div>
                                <div style={{ flex: 1, textAlign: 'center' as const, background: s.temp_violations > 0 ? '#fdecea' : '#f8faf8', borderRadius: 6, padding: '4px 0' }}>
                                  <div style={{ fontSize: 13, fontWeight: 700, color: s.temp_violations > 0 ? '#ef4444' : '#333' }}>{s.temp_violations}</div>
                                  <div style={{ fontSize: 9, color: '#aaa' }}>Violations</div>
                                </div>
                              </div>
                            </>
                          ) : (
                            <div style={{ color: '#ddd', fontSize: 12, marginTop: 8 }}>No session today</div>
                          )}
                        </div>

                        {/* Financial KPIs */}
                        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 0 }}>
                          {[
                            { label: 'Sales MTD', value: fmtR(s?.sales_mtd || 0), sub: new Date().toLocaleDateString('en-ZA', { month: 'short' }), color: '#111' },
                            { label: 'Expenses MTD', value: fmtR(s?.expenses_mtd || 0), sub: s?.sales_mtd ? ((s.expenses_mtd / s.sales_mtd) * 100).toFixed(1) + '% of sales' : '—', color: '#374151' },
                            { label: 'Food Cost', value: s?.food_cost_pct != null ? s.food_cost_pct.toFixed(1) + '%' : '—', sub: s?.food_cost_pct != null ? (s.food_cost_pct <= 35 ? '✓ On target' : '⚠️ Above target') : 'No data', color: s?.food_cost_pct != null ? (s.food_cost_pct <= 35 ? '#16a34a' : s.food_cost_pct <= 40 ? '#d97706' : '#dc2626') : '#9ca3af' },
                            { label: 'Est. Profit', value: fmtR(profitEst), sub: s?.sales_mtd ? ((profitEst / s.sales_mtd) * 100).toFixed(1) + '% margin' : '—', color: profitEst >= 0 ? '#16a34a' : '#dc2626' },
                            { label: 'Analytics', value: '📊', sub: 'View full report', color: PRIMARY, link: true },
                          ].map((kpi, ki) => (
                            <div key={ki} onClick={kpi.link ? (e) => { e.stopPropagation(); window.open('/analytics', '_blank'); } : undefined} style={{ textAlign: 'center' as const, padding: '8px 12px', borderLeft: '1px solid #f0f0f0', display: 'flex', flexDirection: 'column' as const, justifyContent: 'center', cursor: kpi.link ? 'pointer' : 'default' }}>
                              <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: 0.4, marginBottom: 4 }}>{kpi.label}</div>
                              <div style={{ fontSize: kpi.link ? 22 : 15, fontWeight: 800, color: kpi.color }}>{kpi.value}</div>
                              {kpi.sub && <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>{kpi.sub}</div>}
                            </div>
                          ))}
                        </div>
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
                            <span style={{ fontSize: 11, color: '#aaa' }}>{isToday ? 'Today' : new Date(session.session_date).toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</span>
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
