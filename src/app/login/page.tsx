'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';

const PRIMARY = '#1a5c38';
const DARK = '#0a1f12';

function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  useEffect(() => {
    if (searchParams.get('confirm') === '1') {
      setInfo('Check your email to confirm your account, then sign in here to finish setting up your business.');
    }
  }, [searchParams]);

  async function handleLogin() {
    setLoading(true);
    setError('');

    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });

    if (authError || !authData.user) {
      setError('Invalid email or password. Please try again.');
      setLoading(false);
      return;
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, organisation_id, store_id, franchisor_id')
      .eq('id', authData.user.id)
      .single();

    if (!profile) {
      // Account exists (e.g. they just confirmed their email after signing up) but the
      // organisation/store/profile bootstrap from signup hasn't run yet — send them to finish it.
      router.push('/onboarding');
      return;
    }

    switch (profile.role) {
      case 'platform_admin':
        router.push('/admin');
        break;
      case 'franchisor_admin':
        router.push('/franchisor');
        break;
      case 'franchisee_owner':
        router.push('/org');
        break;
      case 'store_manager':
        router.push('/dashboard');
        break;
      case 'staff':
        router.push('/dashboard');
        break;
      default:
        router.push('/dashboard');
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', fontFamily: 'system-ui, sans-serif' }}>

      <div style={{ width: '45%', background: `linear-gradient(135deg, ${DARK}, ${PRIMARY})`, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '60px 64px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 48 }}>
          <div style={{ width: 40, height: 40, background: 'rgba(255,255,255,0.15)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <polyline points="3,11 9,17 19,5" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <span style={{ color: '#fff', fontWeight: 700, fontSize: 22 }}>CompliTrack</span>
        </div>

        <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, letterSpacing: 2, marginBottom: 16, textTransform: 'uppercase' }}>Store Management Platform</div>
        <h1 style={{ color: '#fff', fontSize: 42, fontWeight: 800, lineHeight: 1.2, margin: '0 0 24px 0' }}>Compliance made simple.</h1>
        <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 16, lineHeight: 1.6, margin: '0 0 48px 0' }}>Daily operations, compliance tracking, financial management and AI-powered insights — all in one place.</p>

        <div style={{ display: 'flex', gap: 32, marginBottom: 48 }}>
          {[['100%', 'Digital trail'], ['AI', 'Insights'], ['24/7', 'Visibility']].map(([val, label]) => (
            <div key={label}>
              <div style={{ color: '#fff', fontWeight: 800, fontSize: 24 }}>{val}</div>
              <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>{label}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {['Daily Compliance', 'Cash Up', 'Temperature Logs', 'PDF Reports', 'AI Analytics', 'Photo Proof'].map(tag => (
            <span key={tag} style={{ background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.8)', padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 500 }}>{tag}</span>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', padding: 48 }}>
        <div style={{ width: '100%', maxWidth: 400 }}>

          <div style={{ width: 56, height: 56, background: PRIMARY, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 32 }}>
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <polyline points="4,14 11,21 24,7" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>

          <h2 style={{ fontSize: 28, fontWeight: 800, color: '#111', margin: '0 0 8px 0' }}>Welcome back</h2>
          <p style={{ color: '#888', margin: '0 0 32px 0', fontSize: 15 }}>Sign in to your CompliTrack account</p>

          {error && (
            <div style={{ background: '#fdecea', border: '1px solid #f5c6c6', borderRadius: 10, padding: '12px 16px', marginBottom: 20, color: '#c62828', fontSize: 14 }}>
              {error}
            </div>
          )}

          {info && (
            <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '12px 16px', marginBottom: 20, color: '#1d4ed8', fontSize: 14 }}>
              {info}
            </div>
          )}

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: '#333', marginBottom: 8 }}>Email address</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              placeholder="you@company.com"
              style={{ width: '100%', padding: '12px 16px', borderRadius: 10, border: '1.5px solid #e0e0e0', fontSize: 15, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
            />
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <label style={{ fontSize: 14, fontWeight: 600, color: '#333' }}>Password</label>
              <span style={{ fontSize: 13, color: PRIMARY, cursor: 'pointer', fontWeight: 500 }}>Forgot password?</span>
            </div>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              placeholder="••••••••"
              style={{ width: '100%', padding: '12px 16px', borderRadius: 10, border: '1.5px solid #e0e0e0', fontSize: 15, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
            />
          </div>

          <button
            onClick={handleLogin}
            disabled={loading}
            style={{ width: '100%', padding: '14px', background: loading ? '#ccc' : PRIMARY, color: '#fff', border: 'none', borderRadius: 12, fontSize: 16, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', marginTop: 24, fontFamily: 'inherit' }}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>

          <div style={{ marginTop: 32, textAlign: 'center' }}>
            <span style={{ fontSize: 13, color: '#aaa' }}>New to CompliTrack? </span>
            <span onClick={() => router.push('/')} style={{ fontSize: 13, color: PRIMARY, fontWeight: 600, cursor: 'pointer' }}>Learn more about CompliTrack</span>
          </div>

          <div style={{ marginTop: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, color: '#ccc' }}>ZA</span>
            <div style={{ width: 1, height: 12, background: '#eee' }} />
            <span style={{ fontSize: 11, color: '#ccc' }}>South Africa</span>
            <div style={{ width: 1, height: 12, background: '#eee' }} />
            <span style={{ fontSize: 11, color: '#ccc' }}>2026</span>
          </div>

        </div>
      </div>
    </div>
  );}

export default function LoginPageWrapper() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading...</div>}>
      <LoginPage />
    </Suspense>
  );
}
