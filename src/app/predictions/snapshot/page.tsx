'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { useStoreContext } from '@/lib/store-context'

const PRIMARY = '#1a5c38'
const DARK    = '#0a1f12'

const DOW_FULL = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']

function cur(n: number) {
  return 'R ' + Math.round(n).toLocaleString('en-ZA')
}

type Snapshot = {
  id: string
  snapshot_date: string
  snapshot_time: string
  sales_at_time: number
  customer_count_at_time: number | null
  photo_url: string | null
  notes: string | null
  predicted_final: number | null
}

export default function SnapshotPage() {
  const { storeId: STORE_ID, ready: ctxReady } = useStoreContext() as { storeId: string; ready: boolean }
  const router = useRouter()

  const [loading,     setLoading]     = useState(true)
  const [submitting,  setSubmitting]  = useState(false)
  const [submitted,   setSubmitted]   = useState(false)
  const [existingSnap, setExistingSnap] = useState<Snapshot | null>(null)

  // form fields
  const [salesInput,    setSalesInput]    = useState('')
  const [custInput,     setCustInput]     = useState('')
  const [notes,         setNotes]         = useState('')
  const [photoFile,     setPhotoFile]     = useState<File | null>(null)
  const [photoPreview,  setPhotoPreview]  = useState<string | null>(null)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)

  // prediction data
  const [refinedPred,   setRefinedPred]  = useState<number | null>(null)
  const [ratioSamples,  setRatioSamples] = useState(0)
  const [basePred,      setBasePred]     = useState<number | null>(null)

  const fileRef = useRef<HTMLInputElement>(null)

  const todayStr = new Date().toISOString().split('T')[0]
  const todayDow = new Date().getDay()

  const loadData = useCallback(async () => {
    if (!STORE_ID) return
    setLoading(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    // Check for existing snapshot today
    const { data: snap } = await supabase
      .from('sales_snapshots')
      .select('*')
      .eq('store_id', STORE_ID)
      .eq('snapshot_date', todayStr)
      .maybeSingle()

    if (snap) {
      setExistingSnap(snap)
      setSalesInput(String(snap.sales_at_time))
      if (snap.customer_count_at_time) setCustInput(String(snap.customer_count_at_time))
      if (snap.notes) setNotes(snap.notes)
      if (snap.photo_url) setPhotoPreview(snap.photo_url)
      setRefinedPred(snap.predicted_final)
    }

    // Fetch historical data for ratio calculation
    const since = new Date()
    since.setDate(since.getDate() - 100)
    const sinceStr = since.toISOString().split('T')[0]

    const [{ data: cashups }, { data: snaps }] = await Promise.all([
      supabase.from('cash_ups')
        .select('cash_up_date, cash_up_total, customer_count, average_spend')
        .eq('store_id', STORE_ID)
        .gte('cash_up_date', sinceStr)
        .gt('cash_up_total', 0),
      supabase.from('sales_snapshots')
        .select('snapshot_date, sales_at_time')
        .eq('store_id', STORE_ID)
        .gte('snapshot_date', sinceStr)
        .gt('sales_at_time', 0),
    ])

    if (cashups && snaps && snaps.length > 0) {
      // Build ratio pairs: for each snapshot, find the matching cashup
      const cashupMap = new Map((cashups || []).map(c => [c.cash_up_date, c.cash_up_total]))
      const pairs = snaps
        .filter(s => s.snapshot_date !== todayStr)  // exclude today
        .map(s => {
          const final = cashupMap.get(s.snapshot_date)
          if (!final || s.sales_at_time <= 0) return null
          const dow = new Date(s.snapshot_date + 'T12:00:00').getDay()
          return { dow, ratio: final / s.sales_at_time }
        })
        .filter(Boolean) as { dow: number; ratio: number }[]

      const sameDowPairs = pairs.filter(p => p.dow === todayDow)
      setRatioSamples(sameDowPairs.length)

      if (sameDowPairs.length >= 1) {
        const avgRatio = sameDowPairs.reduce((s, p) => s + p.ratio, 0) / sameDowPairs.length
        // Live update if sales input already filled
        const sales = parseFloat(salesInput)
        if (sales > 0) setRefinedPred(Math.round(sales * avgRatio / 10) * 10)
        // Store ratio for live calculation
        ;(window as any).__snapshotRatio = avgRatio
      }

      // Base prediction from weekday average (for comparison)
      const sameDowCashups = (cashups || []).filter(c =>
        new Date(c.cash_up_date + 'T12:00:00').getDay() === todayDow
      )
      if (sameDowCashups.length > 0) {
        const weights = sameDowCashups.map((_, i) => Math.pow(0.85, i))
        const tw = weights.reduce((a, b) => a + b, 0)
        const wMean = sameDowCashups.reduce((s, r, i) => s + r.cash_up_total * weights[i], 0) / tw
        setBasePred(Math.round(wMean / 10) * 10)
      }
    }

    setLoading(false)
  }, [STORE_ID, router, todayStr, todayDow, salesInput])

  useEffect(() => { if (ctxReady) loadData() }, [ctxReady]) // eslint-disable-line

  // Live refined prediction as user types
  useEffect(() => {
    const sales = parseFloat(salesInput)
    const ratio = (window as any).__snapshotRatio as number | undefined
    if (sales > 0 && ratio && ratio > 0) {
      setRefinedPred(Math.round(sales * ratio / 10) * 10)
    } else if (!sales) {
      setRefinedPred(existingSnap?.predicted_final ?? null)
    }
  }, [salesInput, existingSnap])

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoFile(file)
    const reader = new FileReader()
    reader.onload = ev => setPhotoPreview(ev.target?.result as string)
    reader.readAsDataURL(file)
  }

  async function handleSubmit() {
    const sales = parseFloat(salesInput)
    if (!sales || sales <= 0 || !STORE_ID) return
    setSubmitting(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    let photoUrl = existingSnap?.photo_url || null

    // Upload photo if provided
    if (photoFile) {
      setUploadingPhoto(true)
      try {
        const ext = photoFile.name.split('.').pop() || 'jpg'
        const path = `${STORE_ID}/${todayStr}.${ext}`
        const { data: uploadData, error: uploadErr } = await supabase.storage
          .from('sales-snapshots')
          .upload(path, photoFile, { upsert: true })
        if (!uploadErr && uploadData) {
          const { data: urlData } = supabase.storage.from('sales-snapshots').getPublicUrl(path)
          photoUrl = urlData?.publicUrl || null
        }
      } catch {}
      setUploadingPhoto(false)
    }

    const payload = {
      store_id: STORE_ID,
      snapshot_date: todayStr,
      snapshot_time: new Date().toTimeString().substring(0, 5),
      sales_at_time: sales,
      customer_count_at_time: custInput ? parseInt(custInput) : null,
      notes: notes || null,
      photo_url: photoUrl,
      predicted_final: refinedPred,
      created_by: user.id,
    }

    if (existingSnap) {
      await supabase.from('sales_snapshots').update(payload).eq('id', existingSnap.id)
    } else {
      await supabase.from('sales_snapshots').insert(payload)
    }

    setSubmitted(true)
    setSubmitting(false)
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f0f4f0' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>📸</div>
        <p style={{ color: '#6b7280', fontSize: 14 }}>Loading…</p>
      </div>
    </div>
  )

  if (submitted) return (
    <div style={{ minHeight: '100vh', background: '#f0f4f0', fontFamily: 'system-ui, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', borderRadius: 24, padding: 48, textAlign: 'center', maxWidth: 440, margin: '0 20px', border: '1.5px solid #bbf7d0', boxShadow: '0 8px 40px rgba(0,0,0,0.08)' }}>
        <div style={{ fontSize: 72, marginBottom: 16 }}>✅</div>
        <h2 style={{ fontSize: 24, fontWeight: 900, color: '#166534', marginBottom: 8 }}>Snapshot saved!</h2>
        {refinedPred && (
          <div style={{ background: '#f0fdf4', border: '1.5px solid #bbf7d0', borderRadius: 16, padding: '16px 24px', marginBottom: 20 }}>
            <div style={{ fontSize: 12, color: '#6b7280', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Refined prediction for today</div>
            <div style={{ fontSize: 36, fontWeight: 900, color: PRIMARY }}>{cur(refinedPred)}</div>
            {basePred && (
              <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>
                vs {cur(basePred)} weekday baseline
                {refinedPred > basePred
                  ? <span style={{ color: '#16a34a', fontWeight: 700 }}> (+{Math.round((refinedPred/basePred-1)*100)}%)</span>
                  : <span style={{ color: '#dc2626', fontWeight: 700 }}> ({Math.round((refinedPred/basePred-1)*100)}%)</span>
                }
              </div>
            )}
          </div>
        )}
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <button onClick={() => router.push('/predictions')}
            style={{ background: PRIMARY, color: '#fff', border: 'none', borderRadius: 12, padding: '12px 24px', cursor: 'pointer', fontWeight: 700, fontSize: 15, fontFamily: 'inherit' }}>
            View full forecast →
          </button>
          <button onClick={() => { setSubmitted(false); loadData() }}
            style={{ background: '#f0f4f0', color: '#374151', border: 'none', borderRadius: 12, padding: '12px 20px', cursor: 'pointer', fontWeight: 600, fontSize: 14, fontFamily: 'inherit' }}>
            Update
          </button>
        </div>
      </div>
    </div>
  )

  const salesVal = parseFloat(salesInput) || 0
  const ratio = (window as any).__snapshotRatio as number | undefined

  return (
    <div style={{ minHeight: '100vh', background: '#f0f4f0', fontFamily: 'system-ui, sans-serif', color: '#111' }}>

      {/* Header */}
      <div style={{ background: `linear-gradient(135deg, ${DARK}, ${PRIMARY})`, padding: '0 24px' }}>
        <div style={{ maxWidth: 600, margin: '0 auto', height: 72, display: 'flex', alignItems: 'center', gap: 14 }}>
          <button onClick={() => router.push('/predictions')}
            style={{ background: 'rgba(255,255,255,0.12)', border: '1.5px solid rgba(255,255,255,0.25)', borderRadius: 10, padding: '7px 14px', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
            ← Forecast
          </button>
          <div>
            <div style={{ color: '#fff', fontWeight: 900, fontSize: 18 }}>📸 15:00 Snapshot</div>
            <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 12 }}>
              {DOW_FULL[todayDow]}, {new Date().toLocaleDateString('en-ZA', { day: 'numeric', month: 'long' })}
            </div>
          </div>
        </div>
      </div>

      <main style={{ maxWidth: 600, margin: '0 auto', padding: '32px 24px 60px' }}>

        {existingSnap && (
          <div style={{ background: '#fffbeb', border: '1.5px solid #fde68a', borderRadius: 14, padding: '12px 18px', marginBottom: 20, fontSize: 13, color: '#92400e', fontWeight: 600 }}>
            ✏️ Updating today's snapshot — captured at {existingSnap.snapshot_time}
          </div>
        )}

        {/* Live prediction preview */}
        {salesVal > 0 && refinedPred && (
          <div style={{ background: '#fff', borderRadius: 20, border: '2px solid #bbf7d0', padding: '24px', marginBottom: 24, boxShadow: '0 4px 20px rgba(26,92,56,0.10)' }}>
            <div style={{ fontSize: 12, color: '#6b7280', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
              Refined prediction for today
            </div>
            <div style={{ fontSize: 44, fontWeight: 900, color: PRIMARY, lineHeight: 1, letterSpacing: '-1px' }}>{cur(refinedPred)}</div>
            {basePred && (
              <div style={{ fontSize: 14, color: '#9ca3af', marginTop: 8 }}>
                Weekday baseline: {cur(basePred)}
                {refinedPred !== basePred && (
                  <span style={{ marginLeft: 8, fontWeight: 700, color: refinedPred > basePred ? '#16a34a' : '#dc2626' }}>
                    {refinedPred > basePred ? '▲' : '▼'} {Math.abs(Math.round((refinedPred/basePred-1)*100))}%
                  </span>
                )}
              </div>
            )}
            {ratioSamples > 0 && (
              <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>
                Based on {ratioSamples} historical {DOW_FULL[todayDow]} ratio{ratioSamples !== 1 ? 's' : ''}
              </div>
            )}
          </div>
        )}

        {!ratio && !existingSnap && (
          <div style={{ background: '#fffbeb', border: '1.5px solid #fde68a', borderRadius: 14, padding: '14px 18px', marginBottom: 20, fontSize: 13, color: '#92400e', lineHeight: 1.6 }}>
            <strong>Building ratio model</strong> — once you've submitted a few snapshots and their cashups are complete, the system will learn the typical 15:00-to-close multiplier for each weekday and show you a live refined prediction here.
          </div>
        )}

        {/* Form */}
        <div style={{ background: '#fff', borderRadius: 24, border: '1.5px solid #e8f0e8', padding: '32px', boxShadow: '0 2px 12px rgba(0,0,0,0.05)' }}>

          {/* Sales at this time */}
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 8 }}>
              Current sales total (from your till) *
            </label>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', fontSize: 18, fontWeight: 700, color: '#6b7280' }}>R</span>
              <input
                type="number"
                value={salesInput}
                onChange={e => setSalesInput(e.target.value)}
                placeholder="0.00"
                style={{ width: '100%', padding: '16px 16px 16px 36px', border: '2px solid #e5e7eb', borderRadius: 14, fontSize: 22, fontWeight: 800, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', color: PRIMARY }}
                onFocus={e => e.target.style.borderColor = PRIMARY}
                onBlur={e => e.target.style.borderColor = '#e5e7eb'}
                autoFocus
              />
            </div>
            <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 6 }}>
              Read the total from your POS or till at {new Date().toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>

          {/* Customer count */}
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 8 }}>
              Customer count so far <span style={{ color: '#9ca3af', fontWeight: 400 }}>(optional)</span>
            </label>
            <input
              type="number"
              value={custInput}
              onChange={e => setCustInput(e.target.value)}
              placeholder="e.g. 45"
              style={{ width: '100%', padding: '12px 16px', border: '1.5px solid #e5e7eb', borderRadius: 12, fontSize: 16, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
              onFocus={e => e.target.style.borderColor = PRIMARY}
              onBlur={e => e.target.style.borderColor = '#e5e7eb'}
            />
          </div>

          {/* Photo */}
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 8 }}>
              Photo <span style={{ color: '#9ca3af', fontWeight: 400 }}>(optional — capture your trading area or till screen)</span>
            </label>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={handlePhotoChange} style={{ display: 'none' }} />

            {photoPreview ? (
              <div style={{ position: 'relative' }}>
                <img src={photoPreview} alt="Snapshot" style={{ width: '100%', borderRadius: 14, maxHeight: 240, objectFit: 'cover', border: '1.5px solid #e8f0e8' }} />
                <button onClick={() => { setPhotoFile(null); setPhotoPreview(null) }}
                  style={{ position: 'absolute', top: 10, right: 10, background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', borderRadius: '50%', width: 32, height: 32, cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  ×
                </button>
              </div>
            ) : (
              <button onClick={() => fileRef.current?.click()}
                style={{ width: '100%', padding: '32px', border: '2px dashed #d1d5db', borderRadius: 14, background: '#f9fafb', cursor: 'pointer', textAlign: 'center', fontFamily: 'inherit' }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>📷</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#374151' }}>Tap to take photo or upload</div>
                <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>Capture your store / till at this moment</div>
              </button>
            )}
          </div>

          {/* Notes */}
          <div style={{ marginBottom: 28 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 8 }}>
              Notes <span style={{ color: '#9ca3af', fontWeight: 400 }}>(optional — e.g. "busy lunch, rain keeping people away")</span>
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Any factors affecting today's trading…"
              rows={3}
              style={{ width: '100%', padding: '12px 16px', border: '1.5px solid #e5e7eb', borderRadius: 12, fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', resize: 'vertical' }}
              onFocus={e => e.target.style.borderColor = PRIMARY}
              onBlur={e => e.target.style.borderColor = '#e5e7eb'}
            />
          </div>

          <button
            onClick={handleSubmit}
            disabled={!salesVal || salesVal <= 0 || submitting}
            style={{ width: '100%', background: salesVal > 0 ? PRIMARY : '#d1d5db', color: '#fff', border: 'none', borderRadius: 14, padding: '16px', cursor: salesVal > 0 ? 'pointer' : 'default', fontWeight: 800, fontSize: 17, fontFamily: 'inherit', transition: 'background 0.2s' }}>
            {submitting ? (uploadingPhoto ? '📤 Uploading photo…' : '💾 Saving…') : existingSnap ? '✓ Update snapshot' : '✓ Save snapshot'}
          </button>
        </div>

        <div style={{ marginTop: 20, padding: '14px 18px', background: '#f0f9ff', borderRadius: 14, border: '1.5px solid #bae6fd', fontSize: 13, color: '#0369a1', lineHeight: 1.6 }}>
          <strong>How it works:</strong> Once you submit a few of these at ~15:00 and the day's cashup is done, the system learns the typical afternoon-to-close multiplier for each weekday. The more snapshots, the sharper the same-day prediction becomes.
        </div>
      </main>
    </div>
  )
}
