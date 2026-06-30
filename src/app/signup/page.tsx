'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

const PRIMARY = '#1a5c38';
const DARK = '#0a1f12';

type StoreDraft = { name: string; address: string; city: string };

export default function SignupPage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Step 1 — account
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Step 2 — business
  const [orgName, setOrgName] = useState('');

  // Step 3 — stores
  const [stores, setStores] = useState<StoreDraft[]>([{ name: '', address: '', city: '' }]);

  function updateStore(i: number, field: keyof StoreDraft, value: string) {
    setStores(s => s.map((store, idx) => idx === i ? { ...store, [field]: value } : store));
  }
  function addStoreRow() {
    setStores(s => [...s, { name: '', address: '', city: '' }]);
  }
  function removeStoreRow(i: number) {
    setStores(s => s.filter((_, idx) => idx !== i));
  }

  function validateStep1() {
    if (!fullName.trim()) return 'Your name is required';
    if (!email.trim()) return 'Email is required';
    if (password.length < 8) return 'Password must be at least 8 characters';
    if (password !== confirmPassword) return 'Passwords don\u2019t match';
    return '';
  }

  async function handleNext() {
    setError('');
    if (step === 1) {
      const v = validateStep1();
      if (v) { setError(v); return; }
      setStep(2);
      return;
    }
    if (step === 2) {
      if (!orgName.trim()) { setError('Business name is required'); return; }
      setStep(3);
      return;
    }
    // Step 3 — final submit
    if (stores.some(s => !s.name.trim())) { setError('Every store needs a name'); return; }
    setLoading(true);

    const { data: authData, error: authError } = await supabase.auth.signUp({ email, password });
    if (authError || !authData.user) {
      setError(authError?.message || 'Could not create account');
      setLoading(false);
      return;
    }

    // If email confirmation is required, there's no session yet — we can't safely run
    // the org/store creation under RLS until they're actually logged in. Send them to
    // confirm first; first login will pick up onboarding from there.
    if (!authData.session) {
      setLoading(false);
      router.push('/login?confirm=1');
      return;
    }

    const first = stores[0];
    const { data: created, error: rpcError } = await supabase.rpc('create_organisation_and_store', {
      p_org_name: orgName, p_store_name: first.name, p_store_address: first.address, p_store_city: first.city, p_full_name: fullName,
    });
    if (rpcError) { setError(rpcError.message); setLoading(false); return; }
    const orgId = Array.isArray(created) ? created[0]?.organisation_id : created?.organisation_id;

    for (const extra of stores.slice(1)) {
      await supabase.rpc('add_store_to_org', { p_store_name: extra.name, p_store_address: extra.address, p_store_city: extra.city });
    }

    setLoading(false);
    if (orgId) router.push('/org'); else router.push('/dashboard');
  }

  const inputStyle: React.CSSProperties = { width: '100%', padding: '12px 16px', borderRadius: 10, border: '1.5px solid #e0e0e0', fontSize: 15, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' };
  const labelStyle: React.CSSProperties = { display: 'block', fontSize: 14, fontWeight: 600, color: '#333', marginBottom: 8 };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ width: '40%', background: `linear-gradient(135deg, ${DARK}, ${PRIMARY})`, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '60px 56px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 48 }}>
          <div style={{ width: 40, height: 40, background: 'rgba(255,255,255,0.15)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none"><polyline points="3,11 9,17 19,5" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </div>
          <span style={{ color: '#fff', fontWeight: 700, fontSize: 22 }}>CompliTrack</span>
        </div>
        <h1 style={{ color: '#fff', fontSize: 36, fontWeight: 800, lineHeight: 1.25, margin: '0 0 20px 0' }}>Set up your business in minutes.</h1>
        <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 15, lineHeight: 1.6, margin: 0 }}>One account, every store. Add as many locations as you run today, and more whenever you grow.</p>
        <div style={{ marginTop: 48, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {[['1', 'Your account'], ['2', 'Your business'], ['3', 'Your stores']].map(([n, label], i) => (
            <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 12, opacity: step >= (i + 1) ? 1 : 0.4 }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: step > i + 1 ? '#fff' : step === i + 1 ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.1)', color: step > i + 1 ? PRIMARY : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, border: '1.5px solid rgba(255,255,255,0.3)' }}>
                {step > i + 1 ? '✓' : n}
              </div>
              <span style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', padding: 48 }}>
        <div style={{ width: '100%', maxWidth: 440 }}>
          {error && (
            <div style={{ background: '#fdecea', border: '1px solid #f5c6c6', borderRadius: 10, padding: '12px 16px', marginBottom: 20, color: '#c62828', fontSize: 14 }}>{error}</div>
          )}

          {step === 1 && (
            <>
              <h2 style={{ fontSize: 26, fontWeight: 800, color: '#111', margin: '0 0 6px 0' }}>Create your account</h2>
              <p style={{ color: '#888', margin: '0 0 28px 0', fontSize: 14 }}>You'll be the owner of this CompliTrack account.</p>
              <div style={{ marginBottom: 18 }}>
                <label style={labelStyle}>Your Name</label>
                <input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Jane Smith" style={inputStyle} />
              </div>
              <div style={{ marginBottom: 18 }}>
                <label style={labelStyle}>Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@business.com" style={inputStyle} />
              </div>
              <div style={{ marginBottom: 18 }}>
                <label style={labelStyle}>Password</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 8 characters" style={inputStyle} />
              </div>
              <div style={{ marginBottom: 24 }}>
                <label style={labelStyle}>Confirm Password</label>
                <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleNext()} placeholder="••••••••" style={inputStyle} />
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <h2 style={{ fontSize: 26, fontWeight: 800, color: '#111', margin: '0 0 6px 0' }}>Your business</h2>
              <p style={{ color: '#888', margin: '0 0 28px 0', fontSize: 14 }}>This is the name your stores will operate under.</p>
              <div style={{ marginBottom: 24 }}>
                <label style={labelStyle}>Business / Franchise Name</label>
                <input value={orgName} onChange={e => setOrgName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleNext()} placeholder="e.g. Mochachos Hartswater (Pty) Ltd" style={inputStyle} />
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <h2 style={{ fontSize: 26, fontWeight: 800, color: '#111', margin: '0 0 6px 0' }}>Add your store{stores.length > 1 ? 's' : ''}</h2>
              <p style={{ color: '#888', margin: '0 0 24px 0', fontSize: 14 }}>Add every location you're running today — you can always add more later.</p>
              {stores.map((store, i) => (
                <div key={i} style={{ border: '1.5px solid #f0f0f0', borderRadius: 12, padding: 16, marginBottom: 14, position: 'relative' }}>
                  {stores.length > 1 && (
                    <button onClick={() => removeStoreRow(i)} style={{ position: 'absolute', top: 10, right: 10, background: '#fef2f2', color: '#dc2626', border: 'none', borderRadius: 6, width: 24, height: 24, cursor: 'pointer', fontSize: 14, fontWeight: 700 }}>×</button>
                  )}
                  <div style={{ fontSize: 12, fontWeight: 700, color: PRIMARY, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>Store {i + 1}</div>
                  <div style={{ marginBottom: 10 }}>
                    <input value={store.name} onChange={e => updateStore(i, 'name', e.target.value)} placeholder="Store name (e.g. Mochachos Hartswater)" style={inputStyle} />
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
            {step > 1 && (
              <button onClick={() => setStep(s => (s - 1) as 1 | 2)} disabled={loading} style={{ padding: '14px 20px', background: '#f0f0f0', color: '#333', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>Back</button>
            )}
            <button onClick={handleNext} disabled={loading} style={{ flex: 1, padding: '14px', background: loading ? '#ccc' : PRIMARY, color: '#fff', border: 'none', borderRadius: 12, fontSize: 16, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer' }}>
              {loading ? 'Setting up…' : step === 3 ? 'Create My Account' : 'Continue'}
            </button>
          </div>

          <div style={{ marginTop: 28, textAlign: 'center' }}>
            <span style={{ fontSize: 13, color: '#aaa' }}>Already have an account? </span>
            <span onClick={() => router.push('/login')} style={{ fontSize: 13, color: PRIMARY, fontWeight: 600, cursor: 'pointer' }}>Sign in</span>
          </div>
        </div>
      </div>
    </div>
  );
}
