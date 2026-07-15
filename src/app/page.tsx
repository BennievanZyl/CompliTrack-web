'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

const PRIMARY = '#1a5c38'
const DARK = '#0a1f12'

const INDUSTRIES = [
  { id: 'restaurant', emoji: '🍕', title: 'Restaurant & Fast Food', desc: 'Stock, compliance, cashup, staff', active: true },
  { id: 'guest_house', emoji: '🏨', title: 'Guest House & B&B', desc: 'Bookings, housekeeping, maintenance', active: false },
  { id: 'retail', emoji: '🛒', title: 'Retail Shop', desc: 'Stock, POS integration, suppliers', active: false },
  { id: 'salon', emoji: '💇', title: 'Salon & Spa', desc: 'Appointments, staff, stock', active: false },
  { id: 'clinic', emoji: '🏥', title: 'Clinic & Pharmacy', desc: 'Compliance, stock, staff', active: false },
  { id: 'car_wash', emoji: '🚗', title: 'Car Wash', desc: 'Staff, daily counts, chemicals', active: false },
]

const FEATURES = [
  { emoji: '📦', title: 'Stock Management', desc: 'Track every item, GRV, adjustments, food cost %' },
  { emoji: '✅', title: 'Compliance', desc: 'Daily checklists, photo evidence, franchisor view' },
  { emoji: '💰', title: 'Finances', desc: 'Invoices, expenses, P&L, breakeven analysis' },
  { emoji: '👥', title: 'Staff & Attendance', desc: 'Face recognition kiosk, payroll, leave' },
  { emoji: '📊', title: 'Analytics', desc: 'Daily sales tracker, food cost, trend reports' },
  { emoji: '💬', title: 'Chat & Notifications', desc: 'In-app messaging with push notifications' },
  { emoji: '📱', title: 'Mobile App', desc: 'Android app, device linking, role-based access' },
  { emoji: '🏢', title: 'Multi-Store', desc: 'Franchisor dashboard, all stores in one view' },
]

const QUESTIONS: Record<string, { q: string; options: string[] }[]> = {
  restaurant: [
    { q: 'How many staff do you have?', options: ['1–5', '6–15', '16–30', '30+'] },
    { q: 'How many locations?', options: ['1 location', '2–5 locations', '5+ locations'] },
    { q: 'Do you manage stock and food cost?', options: ['Yes, daily', 'Weekly', 'Not really'] },
    { q: 'Are you part of a franchise?', options: ['Yes, franchisor', 'Yes, franchisee', 'Independent'] },
    { q: 'What is your biggest challenge?', options: ['Staff compliance', 'Stock wastage', 'Finances & reporting', 'All of the above'] },
  ],
}

export default function LandingPage() {
  const router = useRouter()
  const [selectedIndustry, setSelectedIndustry] = useState<string | null>(null)
  const [questionIndex, setQuestionIndex] = useState(0)
  const [answers, setAnswers] = useState<string[]>([])
  const [showContact, setShowContact] = useState(false)
  const [contact, setContact] = useState({ name: '', email: '', phone: '', business: '', message: '' })
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const questions = selectedIndustry ? (QUESTIONS[selectedIndustry] || QUESTIONS.restaurant) : []
  const currentQ = questions[questionIndex]

  function selectIndustry(id: string, active: boolean) {
    if (!active) return
    setSelectedIndustry(id)
    setQuestionIndex(0)
    setAnswers([])
    setShowContact(false)
    document.getElementById('wizard')?.scrollIntoView({ behavior: 'smooth' })
  }

  function answerQuestion(answer: string) {
    const newAnswers = [...answers, answer]
    setAnswers(newAnswers)
    if (questionIndex < questions.length - 1) {
      setQuestionIndex(i => i + 1)
    } else {
      setShowContact(true)
    }
  }

  async function submitLead() {
    if (!contact.name || !contact.phone) return
    setSubmitting(true)
    const industry = INDUSTRIES.find(i => i.id === selectedIndustry)
    await supabase.from('leads').insert({
      name: contact.name,
      email: contact.email,
      phone: contact.phone,
      business_name: contact.business,
      industry: selectedIndustry,
      staff_count: answers[0] || '',
      locations: answers[1] || '',
      message: contact.message,
      status: 'new',
    })
    setSubmitted(true)
    setSubmitting(false)
  }

  const inp: React.CSSProperties = { width: '100%', padding: '12px 16px', border: '1.5px solid #e5e7eb', borderRadius: 12, fontSize: 15, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }

  return (
    <div style={{ minHeight: '100vh', fontFamily: 'system-ui, sans-serif', color: '#111' }}>

      {/* Nav */}
      <nav style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100, background: 'rgba(10,31,18,0.95)', backdropFilter: 'blur(10px)', padding: '0 24px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ color: '#fff', fontWeight: 900, fontSize: 20 }}>✓ CompliTrack</div>
          <button onClick={() => router.push('/login')}
            style={{ background: PRIMARY, color: '#fff', border: 'none', borderRadius: 10, padding: '9px 20px', cursor: 'pointer', fontWeight: 700, fontSize: 14 }}>
            Sign In
          </button>
        </div>
      </nav>

      {/* Hero */}
      <div style={{ background: `linear-gradient(135deg, ${DARK} 0%, ${PRIMARY} 100%)`, paddingTop: 120, paddingBottom: 80, paddingLeft: 24, paddingRight: 24 }}>
        <div style={{ maxWidth: 800, margin: '0 auto', textAlign: 'center' }}>
          <div style={{ display: 'inline-block', background: 'rgba(255,255,255,0.1)', borderRadius: 20, padding: '6px 16px', fontSize: 13, color: 'rgba(255,255,255,0.8)', fontWeight: 600, marginBottom: 24 }}>
            🇿🇦 Built for South African businesses
          </div>
          <h1 style={{ color: '#fff', fontSize: 52, fontWeight: 900, lineHeight: 1.1, marginBottom: 20, margin: '0 0 20px' }}>
            Run your business.<br />Not paperwork.
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: 18, lineHeight: 1.6, marginBottom: 40, maxWidth: 600, margin: '0 auto 40px' }}>
            CompliTrack gives you stock control, staff compliance, finances and analytics — all in one app. Set up in a day. No IT needed.
          </p>
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 15 }}>Select your industry below to see how it works for you ↓</p>
        </div>
      </div>

      {/* Industry Cards */}
      <div style={{ background: '#f8faf8', padding: '60px 24px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <h2 style={{ textAlign: 'center', fontSize: 28, fontWeight: 800, color: '#111', marginBottom: 8 }}>What type of business do you run?</h2>
          <p style={{ textAlign: 'center', color: '#6b7280', fontSize: 16, marginBottom: 40 }}>Click your industry to see how CompliTrack is built for you</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            {INDUSTRIES.map(ind => (
              <div key={ind.id} onClick={() => selectIndustry(ind.id, ind.active)}
                style={{ background: '#fff', borderRadius: 20, padding: '28px 24px', cursor: ind.active ? 'pointer' : 'default', border: `2px solid ${selectedIndustry === ind.id ? PRIMARY : '#eef2ee'}`, boxShadow: '0 2px 8px rgba(0,0,0,0.04)', transition: 'all 0.2s', opacity: ind.active ? 1 : 0.5, position: 'relative', textAlign: 'center' }}>
                {!ind.active && <div style={{ position: 'absolute', top: 12, right: 12, background: '#f3f4f6', color: '#9ca3af', borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 700 }}>COMING SOON</div>}
                <div style={{ fontSize: 40, marginBottom: 12 }}>{ind.emoji}</div>
                <div style={{ fontWeight: 800, fontSize: 16, color: '#111', marginBottom: 6 }}>{ind.title}</div>
                <div style={{ fontSize: 13, color: '#6b7280' }}>{ind.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Wizard */}
      {selectedIndustry && (
        <div id="wizard" style={{ background: '#fff', padding: '60px 24px', borderTop: '1.5px solid #eef2ee' }}>
          <div style={{ maxWidth: 640, margin: '0 auto' }}>
            {!showContact ? (
              <>
                {/* Progress */}
                <div style={{ display: 'flex', gap: 6, marginBottom: 32 }}>
                  {questions.map((_, i) => (
                    <div key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: i <= questionIndex ? PRIMARY : '#e5e7eb', transition: 'background 0.3s' }} />
                  ))}
                </div>
                <div style={{ fontSize: 13, color: '#6b7280', fontWeight: 600, marginBottom: 12 }}>Question {questionIndex + 1} of {questions.length}</div>
                <h3 style={{ fontSize: 24, fontWeight: 800, color: '#111', marginBottom: 28 }}>{currentQ?.q}</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {currentQ?.options.map(opt => (
                    <button key={opt} onClick={() => answerQuestion(opt)}
                      style={{ background: '#f8faf8', border: '2px solid #eef2ee', borderRadius: 14, padding: '16px 20px', cursor: 'pointer', textAlign: 'left', fontSize: 16, fontWeight: 600, color: '#111', transition: 'all 0.15s', fontFamily: 'inherit' }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = PRIMARY; e.currentTarget.style.background = '#f0fdf4' }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = '#eef2ee'; e.currentTarget.style.background = '#f8faf8' }}>
                      {opt}
                    </button>
                  ))}
                </div>
              </>
            ) : !submitted ? (
              <>
                <div style={{ textAlign: 'center', marginBottom: 32 }}>
                  <div style={{ fontSize: 48, marginBottom: 16 }}>🎉</div>
                  <h3 style={{ fontSize: 24, fontWeight: 800, color: '#111', marginBottom: 8 }}>CompliTrack is perfect for your business!</h3>
                  <p style={{ color: '#6b7280', fontSize: 16, lineHeight: 1.6 }}>Leave your details and we'll set everything up for you. No technical knowledge needed.</p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <input style={inp} placeholder="Your name *" value={contact.name} onChange={e => setContact(c => ({ ...c, name: e.target.value }))} />
                  <input style={inp} placeholder="Phone number *" value={contact.phone} onChange={e => setContact(c => ({ ...c, phone: e.target.value }))} />
                  <input style={inp} placeholder="Email address" value={contact.email} onChange={e => setContact(c => ({ ...c, email: e.target.value }))} />
                  <input style={inp} placeholder="Business name" value={contact.business} onChange={e => setContact(c => ({ ...c, business: e.target.value }))} />
                  <textarea style={{ ...inp, height: 100, resize: 'vertical' }} placeholder="Any questions or comments? (optional)" value={contact.message} onChange={e => setContact(c => ({ ...c, message: e.target.value }))} />
                  <button onClick={submitLead} disabled={submitting || !contact.name || !contact.phone}
                    style={{ background: PRIMARY, color: '#fff', border: 'none', borderRadius: 14, padding: '16px', cursor: 'pointer', fontWeight: 800, fontSize: 16, opacity: submitting || !contact.name || !contact.phone ? 0.6 : 1, fontFamily: 'inherit' }}>
                    {submitting ? 'Sending…' : 'Get in touch →'}
                  </button>
                  <p style={{ textAlign: 'center', fontSize: 13, color: '#9ca3af' }}>We'll contact you within 24 hours to get you set up.</p>
                </div>
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: '40px 0' }}>
                <div style={{ fontSize: 64, marginBottom: 20 }}>✓</div>
                <h3 style={{ fontSize: 26, fontWeight: 800, color: PRIMARY, marginBottom: 12 }}>We got your details!</h3>
                <p style={{ color: '#6b7280', fontSize: 16, lineHeight: 1.6 }}>We'll reach out within 24 hours to get CompliTrack set up for your business. No stress — we handle everything.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Features */}
      <div style={{ background: '#f8faf8', padding: '60px 24px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <h2 style={{ textAlign: 'center', fontSize: 28, fontWeight: 800, marginBottom: 8 }}>Everything in one place</h2>
          <p style={{ textAlign: 'center', color: '#6b7280', marginBottom: 40, fontSize: 16 }}>No more spreadsheets. No more WhatsApp groups. No more paper.</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
            {FEATURES.map(f => (
              <div key={f.title} style={{ background: '#fff', borderRadius: 16, padding: '24px 20px', border: '1.5px solid #eef2ee' }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>{f.emoji}</div>
                <div style={{ fontWeight: 700, fontSize: 15, color: '#111', marginBottom: 6 }}>{f.title}</div>
                <div style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.5 }}>{f.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer CTA */}
      <div style={{ background: `linear-gradient(135deg, ${DARK}, ${PRIMARY})`, padding: '60px 24px', textAlign: 'center' }}>
        <h2 style={{ color: '#fff', fontSize: 32, fontWeight: 900, marginBottom: 12 }}>Ready to simplify your business?</h2>
        <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 16, marginBottom: 32 }}>Select your industry above and leave your details. We'll handle the rest.</p>
        <button onClick={() => document.getElementById('wizard')?.scrollIntoView({ behavior: 'smooth' }) || window.scrollTo({ top: 400, behavior: 'smooth' })}
          style={{ background: '#fff', color: PRIMARY, border: 'none', borderRadius: 14, padding: '14px 32px', cursor: 'pointer', fontWeight: 800, fontSize: 16, fontFamily: 'inherit' }}>
          Get Started →
        </button>
      </div>

      {/* Footer */}
      <div style={{ background: DARK, padding: '24px', textAlign: 'center' }}>
        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>© {new Date().getFullYear()} CompliTrack · Bartholos Pty Ltd · South Africa</div>
      </div>
    </div>
  )
}
