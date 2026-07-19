'use client'
import { useStoreContext } from '@/lib/store-context'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'


const CATEGORIES = [
  { key: 'fire_safety',  label: 'Fire Safety',        icon: '🔥', color: '#fef2f2', border: '#fecaca', headerBg: '#fee2e2', headerColor: '#991b1b', required: ['Fire extinguisher certificate', 'Fire evacuation plan'] },
  { key: 'health_safety',label: 'Health & Safety',     icon: '🏥', color: '#eff6ff', border: '#bfdbfe', headerBg: '#dbeafe', headerColor: '#1e40af', required: ['Certificate of Occupancy (COC)', 'Health inspection certificate', 'Pest control certificate'] },
  { key: 'equipment',    label: 'Equipment',           icon: '⚙️', color: '#f9fafb', border: '#e5e7eb', headerBg: '#f3f4f6', headerColor: '#374151', required: ['Gas compliance certificate', 'Extraction cleaning certificate'] },
  { key: 'licenses',     label: 'Licenses & Permits',  icon: '📋', color: '#faf5ff', border: '#e9d5ff', headerBg: '#ede9fe', headerColor: '#6d28d9', required: ['Business license', 'Food handling permit'] },
  { key: 'insurance',    label: 'Insurance',           icon: '🛡️', color: '#f0fdf4', border: '#bbf7d0', headerBg: '#dcfce7', headerColor: '#166534', required: ['Public liability insurance'] },
  { key: 'staff',        label: 'Staff Certificates',  icon: '👤', color: '#fffbeb', border: '#fde68a', headerBg: '#fef3c7', headerColor: '#92400e', required: ['Food safety certificates', 'First aid certificates'] },
  { key: 'uif',          label: 'UIF',                 icon: '🏦', color: '#f0f9ff', border: '#bae6fd', headerBg: '#e0f2fe', headerColor: '#075985', required: ['UIF registration certificate', 'UIF payment record'] },
  { key: 'workers_comp', label: 'Workers Compensation', icon: '🦺', color: '#fdf4ff', border: '#e9d5ff', headerBg: '#f3e8ff', headerColor: '#7e22ce', required: ['Good standing certificate', 'Proof of payment'] },
]

function getExpiryStatus(expiryDate: string | null) {
  if (!expiryDate) return { label: 'No expiry', bg: '#f3f4f6', color: '#6b7280' }
  const today = new Date()
  const expiry = new Date(expiryDate)
  const daysLeft = Math.floor((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  if (daysLeft < 0)   return { label: `Expired ${Math.abs(daysLeft)}d ago`, bg: '#fee2e2', color: '#dc2626' }
  if (daysLeft <= 30) return { label: `Expires in ${daysLeft}d`,            bg: '#fef3c7', color: '#d97706' }
  return { label: `Expires ${expiry.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}`, bg: '#dcfce7', color: '#166534' }
}

export default function DocumentsPage() {
  const { storeId: STORE_ID, orgId: ORG_ID, ready: ctxReady } = useStoreContext()

  const router = useRouter()
  const [documents, setDocuments]         = useState<any[]>([])
  const [loading, setLoading]             = useState(true)
  const [showUpload, setShowUpload]       = useState(false)
  const [uploading, setUploading]         = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [viewerUrl, setViewerUrl]         = useState<string | null>(null)
  const [viewerType, setViewerType]       = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState({
    category: 'fire_safety', document_name: '', expiry_date: '',
    issued_date: '', issued_by: '', notes: '', file: null as File | null,
  })

  useEffect(() => { loadDocuments() }, [])

  async function loadDocuments() {
    setLoading(true)
    const { data, error } = await supabase.from('store_documents').select('*').eq('store_id', STORE_ID).order('created_at', { ascending: false })
    if (!error) setDocuments(data || [])
    setLoading(false)
  }

  async function handleUpload() {
    if (!form.file || !form.document_name || !form.category) return
    setUploading(true)
    try {
      const ext = form.file.name.split('.').pop()
      const path = `${STORE_ID}/${form.category}/${Date.now()}.${ext}`
      const { error: storageError } = await supabase.storage.from('store-documents').upload(path, form.file, { upsert: false })
      if (storageError) throw storageError
      const { error: dbError } = await supabase.from('store_documents').insert({
        store_id: STORE_ID, category: form.category, document_name: form.document_name,
        file_url: path, file_type: form.file.type.includes('pdf') ? 'pdf' : 'image',
        expiry_date: form.expiry_date || null, issued_date: form.issued_date || null,
        issued_by: form.issued_by || null, notes: form.notes || null,
      })
      if (dbError) throw dbError
      setForm({ category: 'fire_safety', document_name: '', expiry_date: '', issued_date: '', issued_by: '', notes: '', file: null })
      setShowUpload(false)
      loadDocuments()
    } catch (err: any) { alert('Upload failed: ' + err.message) }
    setUploading(false)
  }

  async function handleView(doc: any) {
    // file_url may be a full public URL (old app uploads) or just a path (new uploads)
    // createSignedUrl needs just the path within the bucket
    let storagePath = doc.file_url as string
    if (storagePath.startsWith('http')) {
      // Extract path after /store-documents/
      const match = storagePath.match(/\/store-documents\/(.+?)(\?|$)/)
      storagePath = match ? match[1] : storagePath
    }
    const { data } = await supabase.storage.from('store-documents').createSignedUrl(storagePath, 3600)
    if (data?.signedUrl) { setViewerUrl(data.signedUrl); setViewerType(doc.file_type) }
    else alert('Could not open file. The file may not exist in storage yet.')
  }

  async function handleDelete(id: string, fileUrl: string) {
    await supabase.storage.from('store-documents').remove([fileUrl])
    await supabase.from('store_documents').delete().eq('id', id)
    setDeleteConfirm(null)
    loadDocuments()
  }

  const docsByCategory = (key: string) => documents.filter(d => d.category === key)
  const expiringCount = documents.filter(d => { if (!d.expiry_date) return false; const days = Math.floor((new Date(d.expiry_date).getTime() - Date.now()) / 86400000); return days >= 0 && days <= 30 }).length
  const expiredCount  = documents.filter(d => d.expiry_date && new Date(d.expiry_date) < new Date()).length

  return (
    <div style={{ minHeight: '100vh', background: '#f0f4f0' }}>

      {/* Header */}
      <header style={{ background: 'linear-gradient(135deg, #0a1f12 0%, #1a5c38 100%)', position: 'sticky', top: 0, zIndex: 10, padding: '0 40px' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '72px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M3 10L8 15L17 6" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
            <div>
              <div style={{ fontWeight: '800', fontSize: '16px', color: 'white', letterSpacing: '-0.3px' }}>CompliTrack</div>
              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.55)' }}>Store Documents</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button onClick={() => router.push('/dashboard')} style={{ padding: '8px 16px', border: '1.5px solid rgba(255,255,255,0.4)', borderRadius: '10px', fontSize: '13px', fontWeight: '700', color: 'white', background: 'rgba(255,255,255,0.15)', cursor: 'pointer' }}>
              ← Dashboard
            </button>
            <button onClick={() => setShowUpload(true)} style={{ padding: '8px 18px', background: 'white', color: '#1a5c38', borderRadius: '10px', fontSize: '13px', fontWeight: '800', cursor: 'pointer', border: 'none' }}>
              + Upload Document
            </button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <div style={{ background: 'linear-gradient(135deg, #0a1f12 0%, #1a5c38 100%)', padding: '40px 40px 100px' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <h1 style={{ fontSize: '32px', fontWeight: '800', color: 'white', margin: '0 0 6px', letterSpacing: '-0.5px' }}>Store Documents 📁</h1>
          <p style={{ fontSize: '15px', color: 'rgba(255,255,255,0.6)', margin: 0 }}>COC, compliance certificates, licenses and more</p>
        </div>
      </div>

      <main style={{ maxWidth: '1200px', margin: '-60px auto 0', padding: '0 40px 60px', position: 'relative', zIndex: 1 }}>

        {/* KPI cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
          {[
            { label: 'Total Documents',        value: documents.length, color: '#111',    border: '#eef2ee' },
            { label: 'Expiring Soon (≤30 days)', value: expiringCount,  color: '#d97706', border: '#fde68a' },
            { label: 'Expired',                value: expiredCount,     color: '#dc2626', border: '#fecaca' },
          ].map((k, i) => (
            <div key={i} style={{ background: 'white', borderRadius: '20px', border: `1.5px solid ${k.border}`, padding: '24px', textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
              <div style={{ fontSize: '36px', fontWeight: '800', color: k.color }}>{k.value}</div>
              <div style={{ fontSize: '13px', color: '#9ca3af', marginTop: '4px' }}>{k.label}</div>
            </div>
          ))}
        </div>

        {/* Alert banner */}
        {(expiringCount > 0 || expiredCount > 0) && (
          <div style={{ background: 'white', border: '1.5px solid #fecaca', borderRadius: '16px', padding: '16px 24px', display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', flexShrink: 0 }}>⚠️</div>
            <div>
              <div style={{ fontWeight: '700', color: '#991b1b', fontSize: '14px', marginBottom: '2px' }}>Action required</div>
              <div style={{ fontSize: '12px', color: '#dc2626' }}>
                {expiredCount > 0 && `${expiredCount} document${expiredCount > 1 ? 's' : ''} expired. `}
                {expiringCount > 0 && `${expiringCount} document${expiringCount > 1 ? 's' : ''} expiring within 30 days.`}
              </div>
            </div>
          </div>
        )}

        {/* Category grid */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px', color: '#9ca3af', fontSize: '15px' }}>Loading documents…</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
            {CATEGORIES.map(cat => {
              const docs = docsByCategory(cat.key)
              return (
                <div key={cat.key} style={{ background: 'white', borderRadius: '20px', border: '1.5px solid #eef2ee', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                  <div style={{ background: cat.headerBg, padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '700', color: cat.headerColor, fontSize: '14px' }}>
                      <span>{cat.icon}</span><span>{cat.label}</span>
                    </div>
                    <span style={{ fontSize: '11px', fontWeight: '700', background: 'rgba(255,255,255,0.7)', color: cat.headerColor, padding: '3px 10px', borderRadius: '100px' }}>
                      {docs.length} file{docs.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div style={{ padding: '16px 20px 20px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: docs.length > 0 ? '12px' : '0' }}>
                      {cat.required.map(req => {
                        const match = docs.find(d => d.document_name.toLowerCase().includes(req.toLowerCase().split(' ')[0]))
                        return (
                          <div key={req} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                            <span style={{ color: match ? '#16a34a' : '#d1d5db', fontSize: '16px', flexShrink: 0 }}>{match ? '✓' : '○'}</span>
                            <span style={{ color: match ? '#374151' : '#9ca3af', fontStyle: match ? 'normal' : 'italic', flex: 1 }}>{req}</span>
                            {!match && (
                              <button onClick={() => { setForm(f => ({ ...f, category: cat.key, document_name: req })); setShowUpload(true) }} style={{ fontSize: '11px', color: '#dc2626', background: '#fee2e2', border: 'none', borderRadius: '6px', padding: '3px 8px', cursor: 'pointer', fontWeight: '600', flexShrink: 0 }}>
                                Upload
                              </button>
                            )}
                          </div>
                        )
                      })}
                    </div>
                    {docs.length > 0 && (
                      <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
                        {docs.map(doc => {
                          const expiry = getExpiryStatus(doc.expiry_date)
                          return (
                            <div key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#f9fafb', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '10px 14px' }}>
                              <span style={{ fontSize: '20px', flexShrink: 0 }}>{doc.file_type === 'pdf' ? '📄' : '🖼️'}</span>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: '13px', fontWeight: '600', color: '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.document_name}</div>
                                <span style={{ fontSize: '11px', fontWeight: '700', padding: '2px 8px', borderRadius: '100px', background: expiry.bg, color: expiry.color }}>{expiry.label}</span>
                              </div>
                              <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                                <button onClick={() => handleView(doc)} style={{ fontSize: '12px', color: '#1d4ed8', background: '#eff6ff', border: 'none', borderRadius: '8px', padding: '5px 10px', cursor: 'pointer', fontWeight: '600' }}>View</button>
                                <button onClick={() => setDeleteConfirm(doc.id)} style={{ fontSize: '12px', color: '#dc2626', background: '#fee2e2', border: 'none', borderRadius: '8px', padding: '5px 8px', cursor: 'pointer', fontWeight: '700' }}>✕</button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                    {docs.length === 0 && (
                      <div style={{ textAlign: 'center', padding: '12px 0 4px', fontSize: '12px', color: '#d1d5db' }}>No documents uploaded yet</div>
                    )}
                    <button
                      onClick={() => { setForm(f => ({ ...f, category: cat.key })); setShowUpload(true) }}
                      style={{ width: '100%', marginTop: '8px', border: '1.5px dashed #d1d5db', borderRadius: '12px', padding: '10px', fontSize: '12px', color: '#9ca3af', background: 'none', cursor: 'pointer', fontWeight: '600' }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = '#1a5c38'; e.currentTarget.style.color = '#1a5c38' }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = '#d1d5db'; e.currentTarget.style.color = '#9ca3af' }}
                    >
                      + Add document
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <div style={{ marginTop: '48px', textAlign: 'center' }}>
          <p style={{ fontSize: '12px', color: '#9ca3af' }}>CompliTrack © 2026 • Store Management Platform • South Africa 🇿🇦</p>
        </div>
      </main>

      {/* Upload Modal */}
      {showUpload && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '16px' }}>
          <div style={{ background: 'white', borderRadius: '24px', width: '100%', maxWidth: '480px', boxShadow: '0 24px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ padding: '24px 28px 16px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '800', color: '#111', margin: 0 }}>Upload Document</h2>
              <button onClick={() => setShowUpload(false)} style={{ background: '#f3f4f6', border: 'none', borderRadius: '8px', width: '32px', height: '32px', cursor: 'pointer', fontSize: '16px', color: '#6b7280' }}>✕</button>
            </div>
            <div style={{ padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#374151', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Category</label>
                <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} style={{ width: '100%', border: '1.5px solid #e5e7eb', borderRadius: '10px', padding: '10px 12px', fontSize: '14px', outline: 'none', background: 'white' }}>
                  {CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.icon} {c.label}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#374151', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Document Name *</label>
                <input type="text" value={form.document_name} onChange={e => setForm(f => ({ ...f, document_name: e.target.value }))} placeholder="e.g. Fire extinguisher certificate" style={{ width: '100%', border: '1.5px solid #e5e7eb', borderRadius: '10px', padding: '10px 12px', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#374151', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Issue Date</label>
                  <input type="date" value={form.issued_date} onChange={e => setForm(f => ({ ...f, issued_date: e.target.value }))} style={{ width: '100%', border: '1.5px solid #e5e7eb', borderRadius: '10px', padding: '10px 12px', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#374151', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Expiry Date</label>
                  <input type="date" value={form.expiry_date} onChange={e => setForm(f => ({ ...f, expiry_date: e.target.value }))} style={{ width: '100%', border: '1.5px solid #e5e7eb', borderRadius: '10px', padding: '10px 12px', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }} />
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#374151', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Issued By</label>
                <input type="text" value={form.issued_by} onChange={e => setForm(f => ({ ...f, issued_by: e.target.value }))} placeholder="e.g. City of Hartswater" style={{ width: '100%', border: '1.5px solid #e5e7eb', borderRadius: '10px', padding: '10px 12px', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#374151', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>File (PDF or Image) *</label>
                <div onClick={() => fileRef.current?.click()} style={{ border: '2px dashed #d1d5db', borderRadius: '12px', padding: '24px', textAlign: 'center', cursor: 'pointer' }} onMouseEnter={e => { e.currentTarget.style.borderColor = '#1a5c38'; e.currentTarget.style.background = '#f0fdf4' }} onMouseLeave={e => { e.currentTarget.style.borderColor = '#d1d5db'; e.currentTarget.style.background = 'transparent' }}>
                  {form.file ? (
                    <div>
                      <div style={{ fontSize: '28px', marginBottom: '6px' }}>{form.file.type.includes('pdf') ? '📄' : '🖼️'}</div>
                      <div style={{ fontSize: '13px', fontWeight: '600', color: '#374151' }}>{form.file.name}</div>
                      <div style={{ fontSize: '12px', color: '#9ca3af' }}>{(form.file.size / 1024).toFixed(0)} KB</div>
                    </div>
                  ) : (
                    <div>
                      <div style={{ fontSize: '32px', marginBottom: '8px' }}>📁</div>
                      <div style={{ fontSize: '13px', color: '#9ca3af', fontWeight: '600' }}>Click to select file</div>
                      <div style={{ fontSize: '11px', color: '#d1d5db', marginTop: '4px' }}>PDF, JPG, PNG supported</div>
                    </div>
                  )}
                </div>
                <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: 'none' }} onChange={e => { const file = e.target.files?.[0]; if (file) setForm(f => ({ ...f, file })) }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#374151', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Notes</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Any additional notes…" rows={2} style={{ width: '100%', border: '1.5px solid #e5e7eb', borderRadius: '10px', padding: '10px 12px', fontSize: '14px', outline: 'none', resize: 'none', boxSizing: 'border-box' }} />
              </div>
            </div>
            <div style={{ padding: '16px 28px 24px', display: 'flex', gap: '12px' }}>
              <button onClick={() => setShowUpload(false)} style={{ flex: 1, border: '1.5px solid #e5e7eb', color: '#374151', borderRadius: '12px', padding: '12px', fontSize: '14px', fontWeight: '700', cursor: 'pointer', background: 'white' }}>Cancel</button>
              <button onClick={handleUpload} disabled={uploading || !form.file || !form.document_name} style={{ flex: 1, background: uploading || !form.file || !form.document_name ? '#d1d5db' : '#1a5c38', color: 'white', border: 'none', borderRadius: '12px', padding: '12px', fontSize: '14px', fontWeight: '800', cursor: uploading || !form.file || !form.document_name ? 'not-allowed' : 'pointer' }}>
                {uploading ? 'Uploading…' : 'Upload'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '16px' }}>
          <div style={{ background: 'white', borderRadius: '24px', width: '100%', maxWidth: '360px', padding: '32px', textAlign: 'center', boxShadow: '0 24px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>🗑️</div>
            <h3 style={{ fontSize: '18px', fontWeight: '800', color: '#111', margin: '0 0 8px' }}>Delete document?</h3>
            <p style={{ fontSize: '13px', color: '#9ca3af', margin: '0 0 24px' }}>This will permanently remove the file and cannot be undone.</p>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button onClick={() => setDeleteConfirm(null)} style={{ flex: 1, border: '1.5px solid #e5e7eb', color: '#374151', borderRadius: '12px', padding: '12px', fontSize: '14px', fontWeight: '700', cursor: 'pointer', background: 'white' }}>Cancel</button>
              <button onClick={() => { const doc = documents.find(d => d.id === deleteConfirm); if (doc) handleDelete(doc.id, doc.file_url) }} style={{ flex: 1, background: '#dc2626', color: 'white', border: 'none', borderRadius: '12px', padding: '12px', fontSize: '14px', fontWeight: '800', cursor: 'pointer' }}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* File viewer */}
      {viewerUrl && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '16px' }}>
          <div style={{ background: 'white', borderRadius: '20px', width: '100%', maxWidth: '900px', maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '14px', fontWeight: '700', color: '#374151' }}>Document Viewer</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <a href={viewerUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: '13px', color: '#1d4ed8', fontWeight: '600', textDecoration: 'none' }}>Open in new tab ↗</a>
                <button onClick={() => setViewerUrl(null)} style={{ background: '#f3f4f6', border: 'none', borderRadius: '8px', width: '32px', height: '32px', cursor: 'pointer', fontSize: '16px', color: '#6b7280' }}>✕</button>
              </div>
            </div>
            <div style={{ flex: 1, overflow: 'auto' }}>
              {viewerType === 'pdf'
                ? <iframe src={viewerUrl} style={{ width: '100%', height: '100%', minHeight: '70vh', border: 'none' }} title="Document" />
                : <img src={viewerUrl} alt="Document" style={{ maxWidth: '100%', height: 'auto', display: 'block', margin: '0 auto', padding: '16px' }} />
              }
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
