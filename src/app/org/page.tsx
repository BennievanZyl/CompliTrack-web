'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

const PRIMARY = '#1a5c38';
const DARK = '#0a1f12';

type Store = { id: string; name: string; address: string; city: string; is_active: boolean; manager_name: string | null; };
type StoreStats = { store_id: string; session_id: string | null; status: string | null; total: number; completed: number; uniform_photos: number; temp_violations: number; started_at: string | null; duration_seconds: number | null; sales_mtd: number; expenses_mtd: number; food_cost_pct: number | null; };
type Profile = { organisation_id: string; full_name: string; franchisor_id: string; role: string; };

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

  const [showDistribute, setShowDistribute] = useState(false);
  const [distSourceId, setDistSourceId] = useState('');
  const [distTargets, setDistTargets] = useState<string[]>([]);
  const [distSending, setDistSending] = useState(false);
  const [distResult, setDistResult] = useState('');

  const [loginStore, setLoginStore] = useState<Store | null>(null);
  const [loginForm, setLoginForm] = useState({ full_name: '', email: '', password: '', role: 'store_manager' });
  const [loginSending, setLoginSending] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [loginSuccess, setLoginSuccess] = useState('');

  function generatePassword() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let pw = '';
    for (let i = 0; i < 10; i++) pw += chars[Math.floor(Math.random() * chars.length)];
    return pw;
  }

  async function createStoreLogin() {
    if (!loginStore) return;
    setLoginError(''); setLoginSuccess(''); setLoginSending(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setLoginError('Session expired — please refresh and try again.'); setLoginSending(false); return; }

    const res = await fetch('/api/admin/create-store-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ ...loginForm, store_id: loginStore.id }),
    });
    const result = await res.json();
    setLoginSending(false);
    if (!res.ok) { setLoginError(result.error || 'Could not create login'); return; }
    setLoginSuccess(`Login created. Email: ${loginForm.email} — Password: ${loginForm.password} (share this securely, they can change it once logged in).`);
  }

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

  async function runDistribute() {
    if (!distSourceId || distTargets.length === 0) return
    setDistSending(true)
    setDistResult('')

    const [{ data: sourceCats }, { data: sourceItems }] = await Promise.all([
      supabase.from('stock_categories').select('*').eq('store_id', distSourceId).order('sort_order'),
      supabase.from('stock_items').select('*').eq('store_id', distSourceId).eq('is_active', true),
    ])

    let storesDone = 0
    for (const targetId of distTargets) {
      // Recreate categories at the target store, keeping an old-id -> new-id map so items
      // can be re-linked correctly. Quantity, supplier, and local cost are deliberately NOT
      // copied — those are real per-store realities, not shared template data.
      const catIdMap: Record<string, string> = {}
      for (const cat of sourceCats || []) {
        const { data: newCat } = await supabase.from('stock_categories')
          .insert({ store_id: targetId, name: cat.name, color: cat.color, sort_order: cat.sort_order })
          .select().single()
        if (newCat) catIdMap[cat.id] = newCat.id
      }
      const newItems = (sourceItems || []).map(item => ({
        store_id: targetId,
        category: item.category ? (catIdMap[item.category] || null) : null,
        name: item.name, description: item.description, unit: item.unit,
        cost_price: item.cost_price, price: item.price, par_level: item.par_level,
        current_qty: 0, is_active: true, sort_order: item.sort_order,
        supplier: null, // each store picks their own local supplier
        on_daily_sheet: item.on_daily_sheet, is_catch_weight: item.is_catch_weight,
        kg_price: item.kg_price, avg_weight_kg: item.avg_weight_kg,
      }))
      if (newItems.length) await supabase.from('stock_items').insert(newItems)
      storesDone++
    }

    setDistResult(`Sent ${(sourceItems || []).length} stock items to ${storesDone} store${storesDone === 1 ? '' : 's'}. Each store still needs to assign their own local suppliers.`)
    setDistSending(false)
  }

  async function checkAuthAndLoad() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push('/login'); return; }

    const { data: profileData } = await supabase
      .from('profiles')
      .select('organisation_id, full_name, franchisor_id, role')
      .eq('id', user.id)
      .single();

    if (!profileData) { router.push('/login'); return; }
    if (profileData.role === 'store_manager' || profileData.role === 'staff') {
      router.push('/dashboard'); return;
    }

    setProfile(profileData);

    const { data: orgData } = await supabase
      .from('organisations').select('name')
      .eq('id', profileData.organisation_id).single();
    setOrgName(orgData?.name || 'Your Franchisee');

    const { data: storeData } = await supabase
      .from('stores').select('id, name, address, city, is_active, manager_name')
      .eq('organisation_id', profileData.organisation_id)
      .eq('is_active', true).order('name');

    setStores(storeData || []);
    if (storeData) await loadStats(storeData);
    setLoading(false);
  }

  async function loadStats(storeList: Store[]) {
    const today = new Date().toISOString().split('T')[0];
    const monthStart = today.slice(0, 7) + '-01';
    const statsMap: Record<string, StoreStats> = {};

    await Promise.all(storeList.map(async (store) => {
      const [sessionRes, salesRes, expRes, invoicesRes, purchRes, wastRes] = await Promise.all([
        supabase.from('daily_sessions').select('id, status, started_at, duration_seconds').eq('store_id', store.id).eq('session_date', today).eq('session_type', 'daily').maybeSingle(),
        supabase.from('cash_ups').select('cash_up_total').eq('store_id', store.id).neq('status', 'draft').gte('cash_up_date', monthStart).lte('cash_up_date', today),
        supabase.from('expenses').select('amount').eq('store_id', store.id).gte('expense_date', monthStart).lte('expense_date', today),
        supabase.from('invoices').select('total_amount').eq('store_id', store.id).in('status', ['received', 'paid']).gte('invoice_date', monthStart).lte('invoice_date', today),
        // stock_purchases used ONLY for food cost % — NOT included in expenses (invoices already capture that spend)
        supabase.from('stock_purchases').select('quantity, unit_cost').eq('store_id', store.id).gte('purchase_date', monthStart).lte('purchase_date', today),
        supabase.from('stock_wastage').select('total_cost').eq('store_id', store.id).gte('wastage_date', monthStart).lte('wastage_date', today),
      ]);
      const session = sessionRes.data;
      const sales_mtd = (salesRes.data || []).reduce((s: number, r: any) => s + Number(r.cash_up_total || 0), 0);
      const sales_excl_vat = sales_mtd / 1.15;
      const quickExp = (expRes.data || []).reduce((s: number, r: any) => s + Number(r.amount || 0), 0);
      const invExp = (invoicesRes.data || []).reduce((s: number, r: any) => s + Number(r.total_amount || 0), 0);
      // purchases = qty × unit_cost (no total_cost column on stock_purchases)
      const purchases = (purchRes.data || []).reduce((s: number, r: any) => s + (Number(r.quantity || 0) * Number(r.unit_cost || 0)), 0);
      const wastage = (wastRes.data || []).reduce((s: number, r: any) => s + Number(r.total_cost || 0), 0);
      // Expenses = supplier invoices + quick expenses (NOT stock_purchases — already captured in invoices)
      const expenses_mtd = quickExp + invExp;
      const food_cost_pct = sales_excl_vat > 0 ? (purchases - wastage) / sales_excl_vat * 100 : null;

      if (!session) {
        statsMap[store.id] = {
          store_id: store.id, session_id: null, status: null,
          total: 0, completed: 0, uniform_photos: 0,
          temp_violations: 0, started_at: null, duration_seconds: null,
          sales_mtd, expenses_mtd, food_cost_pct
        };
        return;
      }

      const [totalRes, completedRes, uniformRes, violationRes] = await Promise.all([
        supabase.from('checklist_items').select('id').eq('session_id', session.id),
        supabase.from('checklist_items').select('id').eq('session_id', session.id).eq('completed', true),
        supabase.from('uniform_sessions').select('id').eq('session_id', session.id),
        supabase.from('temperature_logs').select('id').eq('session_id', session.id).eq('is_compliant', false),
      ]);

      statsMap[store.id] = {
        store_id: store.id, session_id: session.id, status: session.status,
        total: totalRes.data?.length || 0,
        completed: completedRes.data?.length || 0,
        uniform_photos: uniformRes.data?.length || 0,
        temp_violations: violationRes.data?.length || 0,
        started_at: session.started_at,
        duration_seconds: session.duration_seconds,
        sales_mtd, expenses_mtd, food_cost_pct,
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
  const avgCompliance = sessionsToday > 0
    ? Math.round(allStats.filter(s => s.session_id).reduce((sum, s) => sum + pct(s), 0) / sessionsToday)
    : 0;
  const totalViolations = allStats.reduce((sum, s) => sum + s.temp_violations, 0);

  const cardStyle = { background: '#fff', borderRadius: 20, padding: 24, border: '1px solid #eef2ee', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' };
  const labelStyle = { fontSize: 13, color: '#666', marginBottom: 8, fontWeight: 500 as const };

  return (
    <div style={{ minHeight: '100vh', background: '#f8faf8', fontFamily: 'system-ui, sans-serif' }}>

      {/* Header */}
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {lastUpdated && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#4ade80', boxShadow: '0 0 6px #4ade80' }} />
                <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>
                  Live — {lastUpdated.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              </div>
            )}
            <button
              onClick={() => supabase.auth.signOut().then(() => router.push('/login'))}
              style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 14 }}
            >
              Sign out
            </button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 24px' }}>
        {loading && <div style={{ textAlign: 'center', padding: 80, color: '#666' }}>Loading stores...</div>}

        {!loading && (
          <div>
            {/* Page title */}
            <div style={{ marginBottom: 32 }}>
              <h1 style={{ fontSize: 28, fontWeight: 800, color: '#111', margin: '0 0 4px 0' }}>
                Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, {profile?.full_name?.split(' ')[0]}
              </h1>
              <p style={{ color: '#888', margin: 0, fontSize: 15 }}>
                {orgName} — {new Date().toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            </div>

            {/* KPI cards */}
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

            {/* Store cards */}
            <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' as const, gap: 10 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: '#333', margin: 0 }}>Store Overview — Today</h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <span style={{ fontSize: 13, color: '#aaa' }}>Click a store to open its full dashboard</span>
                <button onClick={() => { setShowDistribute(true); setDistSourceId(stores[0]?.id || ''); setDistTargets([]); setDistResult(''); }} style={{ padding: '10px 18px', background: PRIMARY, color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>📋 Distribute Stocksheet</button>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {stores.map(store => {
                const s = stats[store.id];
                const p = s ? pct(s) : 0;
                const color = pctColor(p);
                const hasSession = s?.session_id != null;
                const borderColor = !hasSession ? '#eef2ee'
                  : s?.status === 'signed_off' && p === 100 ? '#c8e6c9'
                  : p >= 70 ? '#fde68a'
                  : '#fca5a5';

                const fmtR = (n: number) => 'R\u00a0' + (n || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                const profitEst = (s?.sales_mtd || 0) / 1.15 - (s?.expenses_mtd || 0);
                return (
                  <div
                    key={store.id}
                    onClick={() => window.open(`/dashboard?store=${store.id}`, '_blank')}
                    style={{ background: '#fff', borderRadius: 20, border: `1.5px solid ${borderColor}`, padding: '16px 20px', cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', transition: 'transform 0.15s, box-shadow 0.15s', display: 'flex', alignItems: 'stretch', gap: 0 }}
                    onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.1)'; }}
                    onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.04)'; }}
                  >
                    {/* Left: store identity + compliance */}
                    <div style={{ minWidth: 240, paddingRight: 20, borderRight: '1px solid #f0f0f0' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                        <div>
                          <div style={{ fontWeight: 700, color: '#333', fontSize: 15, marginBottom: 2 }}>{store.name}</div>
                          <div style={{ fontSize: 12, color: '#888' }}>{store.city || store.address}</div>
                          {store.manager_name && <div style={{ fontSize: 11, color: '#aaa' }}>Manager: {store.manager_name}</div>}
                        </div>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 20, whiteSpace: 'nowrap' as const, background: !hasSession ? '#f3f4f6' : s?.status === 'signed_off' ? '#e8f5e9' : '#fff8e1', color: !hasSession ? '#9ca3af' : s?.status === 'signed_off' ? PRIMARY : '#f59e0b' }}>
                          {!hasSession ? 'NO SESSION' : s?.status === 'signed_off' ? 'SIGNED OFF' : 'IN PROGRESS'}
                        </span>
                      </div>
                      {hasSession && s ? (
                        <>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
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
                        <div style={{ color: '#ddd', fontSize: 12, marginTop: 8 }}>No compliance session today</div>
                      )}
                    </div>

                    {/* Right: Financial KPIs */}
                    <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 0 }}>
                      {[
                        { label: 'Sales MTD (incl VAT)', value: fmtR(s?.sales_mtd || 0), sub: 'Ex-VAT: ' + fmtR((s?.sales_mtd || 0) / 1.15), color: '#111' },
                        { label: 'Expenses MTD', value: fmtR(s?.expenses_mtd || 0), sub: s?.sales_mtd ? ((s.expenses_mtd / (s.sales_mtd / 1.15)) * 100).toFixed(1) + '% of sales' : '—', color: '#374151' },
                        { label: 'Food Cost', value: s?.food_cost_pct != null ? s.food_cost_pct.toFixed(1) + '%' : '—', sub: s?.food_cost_pct != null ? (s.food_cost_pct <= 35 ? '✓ On target' : '⚠️ Above target') : 'No stock data', color: s?.food_cost_pct != null ? (s.food_cost_pct <= 35 ? '#16a34a' : s.food_cost_pct <= 40 ? '#d97706' : '#dc2626') : '#9ca3af' },
                        { label: 'Est. Profit', value: fmtR(profitEst), sub: s?.sales_mtd ? ((profitEst / (s.sales_mtd / 1.15)) * 100).toFixed(1) + '% margin' : '—', color: profitEst >= 0 ? '#16a34a' : '#dc2626' },
                        { label: 'Analytics', value: '📊', sub: 'View full report', color: PRIMARY, link: true },
                      ].map((kpi, ki) => (
                        <div key={ki}
                          onClick={kpi.link ? (e) => { e.stopPropagation(); window.open('/analytics', '_blank'); } : undefined}
                          style={{ textAlign: 'center' as const, padding: '8px 12px', borderLeft: '1px solid #f0f0f0', display: 'flex', flexDirection: 'column' as const, justifyContent: 'center', cursor: kpi.link ? 'pointer' : 'default' }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: 0.4, marginBottom: 4 }}>{kpi.label}</div>
                          <div style={{ fontSize: kpi.link ? 22 : 15, fontWeight: 800, color: kpi.color }}>{kpi.value}</div>
                          {kpi.sub && <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>{kpi.sub}</div>}
                        </div>
                      ))}
                    </div>

                    {/* Create Login button */}
                    <div style={{ display: 'flex', flexDirection: 'column' as const, justifyContent: 'flex-end', paddingLeft: 12, borderLeft: '1px solid #f0f0f0' }}>
                      <button onClick={e => { e.stopPropagation(); setLoginStore(store); setLoginForm({ full_name: '', email: '', password: generatePassword(), role: 'store_manager' }); setLoginError(''); setLoginSuccess(''); }} style={{ fontSize: 11, fontWeight: 700, color: PRIMARY, background: '#f0f7f4', border: 'none', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', whiteSpace: 'nowrap' as const }}>+ Login</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {showDistribute && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }} onClick={() => setShowDistribute(false)}>
          <div style={{ background: '#fff', borderRadius: 20, padding: 28, width: 480, maxWidth: '100%', maxHeight: '85vh', overflowY: 'auto' as const }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>📋 Distribute Stocksheet</div>
            <p style={{ fontSize: 13, color: '#888', margin: '0 0 20px' }}>Copies stock categories and items from one store to others. Quantities start at zero and suppliers stay blank — each store sets those up locally.</p>

            <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>Copy from</label>
            <select value={distSourceId} onChange={e => setDistSourceId(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid #e5e7eb', fontSize: 14, marginBottom: 18 }}>
              {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>

            <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>Send to</label>
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8, marginBottom: 20 }}>
              {stores.filter(s => s.id !== distSourceId).map(s => (
                <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', border: '1.5px solid #f0f0f0', borderRadius: 10, cursor: 'pointer', fontSize: 14 }}>
                  <input type="checkbox" checked={distTargets.includes(s.id)} onChange={e => setDistTargets(t => e.target.checked ? [...t, s.id] : t.filter(id => id !== s.id))} />
                  {s.name} <span style={{ color: '#aaa', fontSize: 12 }}>— {s.city}</span>
                </label>
              ))}
              {stores.filter(s => s.id !== distSourceId).length === 0 && (
                <div style={{ fontSize: 13, color: '#aaa', textAlign: 'center' as const, padding: 12 }}>No other stores yet — add another store first.</div>
              )}
            </div>

            {distResult && (
              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#166534', marginBottom: 16 }}>{distResult}</div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowDistribute(false)} style={{ padding: '12px 18px', background: '#f0f0f0', color: '#333', border: 'none', borderRadius: 10, fontWeight: 700, cursor: 'pointer' }}>Close</button>
              <button onClick={runDistribute} disabled={distSending || distTargets.length === 0} style={{ flex: 1, padding: '12px', background: distSending || distTargets.length === 0 ? '#ccc' : PRIMARY, color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, cursor: distSending || distTargets.length === 0 ? 'not-allowed' : 'pointer' }}>
                {distSending ? 'Sending…' : `Send to ${distTargets.length || ''} Store${distTargets.length === 1 ? '' : 's'}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {loginStore && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }} onClick={() => setLoginStore(null)}>
          <div style={{ background: '#fff', borderRadius: 20, padding: 28, width: 440, maxWidth: '100%' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Create Login — {loginStore.name}</div>
            <p style={{ fontSize: 13, color: '#888', margin: '0 0 20px' }}>This account can log in immediately with the password below. They can change it themselves once logged in, under Settings.</p>

            {loginError && <div style={{ background: '#fdecea', border: '1px solid #f5c6c6', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#c62828', marginBottom: 16 }}>{loginError}</div>}
            {loginSuccess ? (
              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '14px', fontSize: 13, color: '#166534', marginBottom: 16, lineHeight: 1.6 }}>{loginSuccess}</div>
            ) : (
              <>
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>Name</label>
                  <input value={loginForm.full_name} onChange={e => setLoginForm(f => ({ ...f, full_name: e.target.value }))} placeholder="Store manager's name" style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid #e5e7eb', fontSize: 14, boxSizing: 'border-box' as const }} />
                </div>
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>Email</label>
                  <input type="email" value={loginForm.email} onChange={e => setLoginForm(f => ({ ...f, email: e.target.value }))} placeholder="store@business.com" style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid #e5e7eb', fontSize: 14, boxSizing: 'border-box' as const }} />
                </div>
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>Role</label>
                  <select value={loginForm.role} onChange={e => setLoginForm(f => ({ ...f, role: e.target.value }))} style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid #e5e7eb', fontSize: 14 }}>
                    <option value="store_manager">Store Manager</option>
                    <option value="staff">Staff</option>
                  </select>
                </div>
                <div style={{ marginBottom: 20 }}>
                  <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>Temporary Password</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input value={loginForm.password} onChange={e => setLoginForm(f => ({ ...f, password: e.target.value }))} style={{ flex: 1, padding: '10px 12px', borderRadius: 10, border: '1.5px solid #e5e7eb', fontSize: 14, fontFamily: 'monospace', boxSizing: 'border-box' as const }} />
                    <button onClick={() => setLoginForm(f => ({ ...f, password: generatePassword() }))} style={{ padding: '10px 14px', background: '#f0f0f0', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>↻</button>
                  </div>
                </div>
              </>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setLoginStore(null)} style={{ padding: '12px 18px', background: '#f0f0f0', color: '#333', border: 'none', borderRadius: 10, fontWeight: 700, cursor: 'pointer' }}>{loginSuccess ? 'Done' : 'Cancel'}</button>
              {!loginSuccess && (
                <button onClick={createStoreLogin} disabled={loginSending || !loginForm.full_name || !loginForm.email || loginForm.password.length < 8} style={{ flex: 1, padding: '12px', background: loginSending ? '#ccc' : PRIMARY, color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, cursor: loginSending ? 'not-allowed' : 'pointer' }}>
                  {loginSending ? 'Creating…' : 'Create Login'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
