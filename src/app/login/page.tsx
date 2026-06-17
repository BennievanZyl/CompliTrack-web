'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      router.push('/dashboard')
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', backgroundColor: 'white' }}>

      {/* Left Panel */}
      <div style={{
        width: '50%',
        background: 'linear-gradient(160deg, #0a1f12 0%, #1a5c38 100%)',
        display: 'flex',
        flexDirection: 'column',
        padding: '80px',
        gap: '60px',
      }}
        className="hidden lg:flex"
      >
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '40px', height: '40px',
            borderRadius: '10px',
            background: 'rgba(255,255,255,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0
          }}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M3 10L8 15L17 6" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <span style={{ color: 'white', fontWeight: '700', fontSize: '18px', letterSpacing: '-0.3px' }}>
            CompliTrack
          </span>
        </div>

        {/* Main content */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '24px' }}>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', fontWeight: '600', letterSpacing: '2px', textTransform: 'uppercase' }}>
            Store Management Platform
          </p>

          <h1 style={{ color: 'white', fontSize: '42px', fontWeight: '800', lineHeight: '1.2', margin: 0 }}>
            Compliance<br />made simple.
          </h1>

          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '16px', lineHeight: '1.7', maxWidth: '340px', margin: 0 }}>
            Daily operations, compliance tracking, financial management and AI-powered insights — all in one place.
          </p>

          {/* Stats */}
          <div style={{ display: 'flex', gap: '48px', marginTop: '16px' }}>
            {[
              { value: '100%', label: 'Digital trail' },
              { value: 'AI', label: 'Insights' },
              { value: '24/7', label: 'Visibility' },
            ].map((stat, i) => (
              <div key={i}>
                <div style={{ color: 'white', fontSize: '24px', fontWeight: '700', marginBottom: '4px' }}>
                  {stat.value}
                </div>
                <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: '12px' }}>
                  {stat.label}
                </div>
              </div>
            ))}
          </div>

          {/* Pills */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px' }}>
            {['Daily Compliance', 'Cash Up', 'Temperature Logs', 'PDF Reports', 'AI Analytics', 'Photo Proof'].map((f, i) => (
              <span key={i} style={{
                fontSize: '11px',
                padding: '6px 12px',
                borderRadius: '100px',
                background: 'rgba(255,255,255,0.08)',
                color: 'rgba(255,255,255,0.6)',
                border: '1px solid rgba(255,255,255,0.12)'
              }}>
                {f}
              </span>
            ))}
          </div>
        </div>

        {/* Footer */}
        <p style={{ color: 'rgba(255,255,255,0.25)', fontSize: '12px' }}>
          © 2026 CompliTrack • South Africa 🇿🇦
        </p>
      </div>

      {/* Right Panel */}
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f9fafb',
        padding: '40px',
      }}>
        <div style={{ width: '100%', maxWidth: '400px' }}>

          {/* Logo mark */}
          <div style={{ marginBottom: '48px' }}>
            <div style={{
              width: '56px', height: '56px',
              borderRadius: '16px',
              background: 'linear-gradient(135deg, #1a5c38, #2d8653)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              marginBottom: '24px',
              boxShadow: '0 8px 24px rgba(26,92,56,0.25)'
            }}>
              <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
                <path d="M5 13L10.5 18.5L21 8" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <h2 style={{ fontSize: '28px', fontWeight: '800', color: '#111', margin: '0 0 8px 0' }}>
              Welcome back
            </h2>
            <p style={{ fontSize: '14px', color: '#9ca3af', margin: 0 }}>
              Sign in to your CompliTrack account
            </p>
          </div>

          {error && (
            <div style={{
              background: '#fef2f2',
              border: '1px solid #fecaca',
              color: '#dc2626',
              padding: '12px 16px',
              borderRadius: '12px',
              marginBottom: '20px',
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              ⚠️ {error}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '8px' }}>
                Email address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{
                  width: '100%',
                  padding: '14px 16px',
                  border: '1.5px solid #e5e7eb',
                  borderRadius: '12px',
                  fontSize: '14px',
                  color: '#111',
                  outline: 'none',
                  background: 'white',
                  boxSizing: 'border-box',
                  transition: 'border-color 0.2s'
                }}
                placeholder="you@company.com"
                required
                onFocus={(e) => e.target.style.borderColor = '#1a5c38'}
                onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
              />
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600', color: '#374151' }}>
                  Password
                </label>
                <a href="#" style={{ fontSize: '12px', color: '#1a5c38', fontWeight: '500', textDecoration: 'none' }}>
                  Forgot password?
                </a>
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{
                  width: '100%',
                  padding: '14px 16px',
                  border: '1.5px solid #e5e7eb',
                  borderRadius: '12px',
                  fontSize: '14px',
                  color: '#111',
                  outline: 'none',
                  background: 'white',
                  boxSizing: 'border-box',
                  transition: 'border-color 0.2s'
                }}
                placeholder="••••••••"
                required
                onFocus={(e) => e.target.style.borderColor = '#1a5c38'}
                onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
              />
            </div>

            <button
              type="button"
              onClick={handleLogin}
              disabled={loading}
              style={{
                width: '100%',
                padding: '14px',
                background: 'linear-gradient(135deg, #1a5c38, #2d8653)',
                color: 'white',
                border: 'none',
                borderRadius: '12px',
                fontSize: '14px',
                fontWeight: '700',
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.7 : 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                marginTop: '4px'
              }}
            >
              {loading ? 'Signing in...' : 'Sign In →'}
            </button>
          </div>

          <div style={{
            marginTop: '32px',
            paddingTop: '24px',
            borderTop: '1px solid #f3f4f6',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <p style={{ fontSize: '12px', color: '#9ca3af' }}>
              Need access?{' '}
              <a href="mailto:support@complitrack.co.za"
                 style={{ color: '#1a5c38', fontWeight: '600', textDecoration: 'none' }}>
                Contact support
              </a>
            </p>
            <div style={{ display: 'flex', gap: '12px' }}>
              {['🔒', '🇿🇦', '⚡'].map((icon, i) => (
                <span key={i} style={{ fontSize: '14px' }}>{icon}</span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}