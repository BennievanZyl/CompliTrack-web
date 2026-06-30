'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

const PRIMARY = '#1a5c38';
const DARK = '#0a1f12';

type StoreDraft = { name: string; address: string; city: string };

export default function OnboardingPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [step, setStep] = useState<1 | 2>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fullName, setFullName] = useState('');
  const [orgName, setOrgName] = useState('');
  const [stores, setStores] = useState<StoreDraft[]>([{ name: '', address: '', city: '' }]);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }
      const { data: profile } = await supabase.from('profiles').select('id').eq('id', user.id).maybeSingle();
      if (profile) { router.push('/dashboard'); return; }
      setFullName(user.user_metadata?.full_name || '');
      setChecking(false);
    })();
  }, [router]);

  function updateStore(i: number, field: keyof StoreDraft, value: string) {
    setStores(s => s.map((store, idx) => idx === i ? { ...store, [field]: value } : store));
  }
  function addStoreRow() { setStores(s => [...s, { name: '', address: '', city: '' }]); }
  function removeStoreRow(i: number) { setStores(s => s.filter((_, idx) => idx !== i)); }

  async function handleNext() {
    setError('');
    if (step === 1) {
      if (!fullName.trim()) { setError('Your name is required'); return; }
      if (!orgName.trim()) { setError('Business name is required'); return; }
      setStep(2);
      return;
    }
    if (stores.some(s => !s.name.trim())) { setError('Every store needs a name'); return; }
    setLoading(true);
    const first = stores[0];
    const { error: rpcError } = await supabase.rpc('create_organisation_and_store', {
      p_org_name: orgName, p_store_name: first.name, p_store_address: first.address, p_store_city: first.city, p_full_name: fullName,
    });
    if (rpcError) { setError(rpcError.message); setLoading(false); return; }
    for (const extra of stores.slice(1)) {
      await supabase.rpc('add_store_to_org', { p_store_name: extra.name, p_store_address: extra.address, p_store_city: extra.city });
    }
    router.push('/org');
  }

  const inputStyle: React.CSSProperties = { width: '100%', padding: '12px 16px', borderRadius: 10, border: '1.5px solid #e0e0e0', fontSize: 15, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' };
  const labelStyle: React.CSSProperties = { display: 'block', fontSize: 14, fontWeight: 600, color: '#333', marginBottom: 8 };

  if (checking) {
    return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888' }}>Loading…</div>;
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8faf8', fontFamily: 'system-ui, sans-serif', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 460, background: '#fff', borderRadius: 20, boxShadow: '0 8px 30px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
        <div style={{ background: `linear-gradient(135deg, ${DARK}, ${PRIMARY})`, padding: '28px 32px' }}>
          <div style={{ color: '#fff', fontWeight: 800, fontSize: 20 }}>Welcome to CompliTrack 👋</div>
          <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, marginTop: 4 }}>Let's get your business set up</div>
        </div>
        <div style={{ padding: 32 }}>
          {error && <div style={{ background: '#fdecea', border: '1px solid #f5c6c6', borderRadius: 10, padding: '12px 16px', marginBottom: 20, color: '#c62828', fontSize: 14 }}>{error}</div>}

          {step === 1 ? (
            <>
              <div style={{ marginBottom: 18 }}>
                <label style={labelStyle}>Your Name</label>
                <input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Jane Smith" style={inputStyle} />
              </div>
              <div style={{ marginBottom: 24 }}>
                <label style={labelStyle}>Business / Franchise Name</label>
                <input value={orgName} onChange={e => setOrgName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleNext()} placeholder="e.g. Mochachos Hartswater (Pty) Ltd" style={inputStyle} />
              </div>
            </>
          ) : (
            <>
              <p style={{ color: '#888', margin: '0 0 18px 0', fontSize: 14 }}>Add every location you're running today — you can always add more later.</p>
              {stores.map((store, i) => (
                <div key={i} style={{ border: '1.5px solid #f0f0f0', borderRadius: 12, padding: 16, marginBottom: 14, position: 'relative' }}>
                  {stores.length > 1 && (
                    <button onClick={() => removeStoreRow(i)} style={{ position: 'absolute', top: 10, right: 10, background: '#fef2f2', color: '#dc2626', border: 'none', borderRadius: 6, width: 24, height: 24, cursor: 'pointer', fontSize: 14, fontWeight: 700 }}>×</button>
                  )}
                  <div style={{ fontSize: 12, fontWeight: 700, color: PRIMARY, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>Store {i + 1}</div>
                  <div style={{ marginBottom: 10 }}>
                    <input value={store.name} onChange={e => updateStore(i, 'name', e.target.value)} placeholder="Store name" style={inputStyle} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <input value={store.address} onChange={e => updateStore(i, 'address', e.target.value)} placeholder="Address" style={inputStyle} />
                    <input value={store.city} onChange={e => updateStore(i, 'city', e.target.value)} placeholder="City" style={inputStyle} />
                  </div>
                </div>
              ))}
              <button onClick={addStoreRow} style={{ width: '100%', padding: '12px', background: '#f0f4f0', color: PRIMARY, border: '1.5px dashed #bbd9c8', borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: 'pointer', marginBottom: 24 }}>+ Add Another Store</button>
            </>
          )}

          <div style={{ display: 'flex', gap: 10 }}>
            {step === 2 && <button onClick={() => setStep(1)} disabled={loading} style={{ padding: '14px 20px', background: '#f0f0f0', color: '#333', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>Back</button>}
            <button onClick={handleNext} disabled={loading} style={{ flex: 1, padding: '14px', background: loading ? '#ccc' : PRIMARY, color: '#fff', border: 'none', borderRadius: 12, fontSize: 16, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer' }}>
              {loading ? 'Setting up…' : step === 1 ? 'Continue' : 'Finish Setup'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
