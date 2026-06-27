'use client'

import { useState, useEffect, useRef } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import Link from 'next/link'

const STORE_ID = '05328298-fc27-4c9f-b091-bb7f6598b601'

const CATEGORIES = [
  {
    key: 'fire_safety',
    label: 'Fire Safety',
    icon: '🔥',
    color: 'bg-red-50 border-red-200',
    headerColor: 'bg-red-100 text-red-800',
    required: ['Fire extinguisher certificate', 'Fire evacuation plan'],
  },
  {
    key: 'health_safety',
    label: 'Health & Safety',
    icon: '🏥',
    color: 'bg-blue-50 border-blue-200',
    headerColor: 'bg-blue-100 text-blue-800',
    required: ['Certificate of Occupancy (COC)', 'Health inspection certificate', 'Pest control certificate'],
  },
  {
    key: 'equipment',
    label: 'Equipment',
    icon: '⚙️',
    color: 'bg-gray-50 border-gray-200',
    headerColor: 'bg-gray-100 text-gray-800',
    required: ['Gas compliance certificate', 'Extraction cleaning certificate'],
  },
  {
    key: 'licenses',
    label: 'Licenses & Permits',
    icon: '📋',
    color: 'bg-purple-50 border-purple-200',
    headerColor: 'bg-purple-100 text-purple-800',
    required: ['Business license', 'Food handling permit'],
  },
  {
    key: 'insurance',
    label: 'Insurance',
    icon: '🛡️',
    color: 'bg-green-50 border-green-200',
    headerColor: 'bg-green-100 text-green-800',
    required: ['Public liability insurance'],
  },
  {
    key: 'staff',
    label: 'Staff Certificates',
    icon: '👤',
    color: 'bg-yellow-50 border-yellow-200',
    headerColor: 'bg-yellow-100 text-yellow-800',
    required: ['Food safety certificates', 'First aid certificates'],
  },
]

function getExpiryStatus(expiryDate: string | null) {
  if (!expiryDate) return { label: 'No expiry', color: 'bg-gray-100 text-gray-600' }
  const today = new Date()
  const expiry = new Date(expiryDate)
  const daysLeft = Math.floor((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  if (daysLeft < 0) return { label: `Expired ${Math.abs(daysLeft)}d ago`, color: 'bg-red-100 text-red-700' }
  if (daysLeft <= 30) return { label: `Expires in ${daysLeft}d`, color: 'bg-amber-100 text-amber-700' }
  return { label: `Expires ${expiry.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}`, color: 'bg-green-100 text-green-700' }
}

export default function DocumentsPage() {
  const supabase = createClientComponentClient()
  const [documents, setDocuments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showUpload, setShowUpload] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [viewerUrl, setViewerUrl] = useState<string | null>(null)
  const [viewerType, setViewerType] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState({
    category: 'fire_safety',
    document_name: '',
    expiry_date: '',
    issued_date: '',
    issued_by: '',
    notes: '',
    file: null as File | null,
  })

  useEffect(() => {
    loadDocuments()
  }, [])

  async function loadDocuments() {
    setLoading(true)
    const { data, error } = await supabase
      .from('store_documents')
      .select('*')
      .eq('store_id', STORE_ID)
      .order('created_at', { ascending: false })
    if (!error) setDocuments(data || [])
    setLoading(false)
  }

  async function handleUpload() {
    if (!form.file || !form.document_name || !form.category) return
    setUploading(true)
    try {
      const ext = form.file.name.split('.').pop()
      const path = `${STORE_ID}/${form.category}/${Date.now()}.${ext}`
      const { error: storageError } = await supabase.storage
        .from('store-documents')
        .upload(path, form.file, { upsert: false })
      if (storageError) throw storageError

      const { error: dbError } = await supabase.from('store_documents').insert({
        store_id: STORE_ID,
        category: form.category,
        document_name: form.document_name,
        file_url: path,
        file_type: form.file.type.includes('pdf') ? 'pdf' : 'image',
        expiry_date: form.expiry_date || null,
        issued_date: form.issued_date || null,
        issued_by: form.issued_by || null,
        notes: form.notes || null,
      })
      if (dbError) throw dbError

      setForm({ category: 'fire_safety', document_name: '', expiry_date: '', issued_date: '', issued_by: '', notes: '', file: null })
      setShowUpload(false)
      loadDocuments()
    } catch (err: any) {
      alert('Upload failed: ' + err.message)
    }
    setUploading(false)
  }

  async function handleView(doc: any) {
    const { data } = await supabase.storage
      .from('store-documents')
      .createSignedUrl(doc.file_url, 300)
    if (data?.signedUrl) {
      setViewerUrl(data.signedUrl)
      setViewerType(doc.file_type)
    } else {
      alert('Could not open file.')
    }
  }

  async function handleDelete(id: string, fileUrl: string) {
    await supabase.storage.from('store-documents').remove([fileUrl])
    await supabase.from('store_documents').delete().eq('id', id)
    setDeleteConfirm(null)
    loadDocuments()
  }

  const docsByCategory = (key: string) => documents.filter(d => d.category === key)

  const expiringCount = documents.filter(d => {
    if (!d.expiry_date) return false
    const days = Math.floor((new Date(d.expiry_date).getTime() - Date.now()) / 86400000)
    return days >= 0 && days <= 30
  }).length

  const expiredCount = documents.filter(d => {
    if (!d.expiry_date) return false
    return new Date(d.expiry_date) < new Date()
  }).length

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-gray-400 hover:text-gray-600 text-sm">← Dashboard</Link>
            <span className="text-gray-300">|</span>
            <h1 className="text-xl font-semibold text-gray-900">Store Documents</h1>
          </div>
          <button
            onClick={() => setShowUpload(true)}
            className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700 flex items-center gap-2"
          >
            + Upload Document
          </button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">

        {/* KPI strip */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
            <div className="text-3xl font-bold text-gray-900">{documents.length}</div>
            <div className="text-sm text-gray-500 mt-1">Total Documents</div>
          </div>
          <div className="bg-white rounded-xl border border-amber-200 p-4 text-center">
            <div className="text-3xl font-bold text-amber-600">{expiringCount}</div>
            <div className="text-sm text-gray-500 mt-1">Expiring Soon (≤30 days)</div>
          </div>
          <div className="bg-white rounded-xl border border-red-200 p-4 text-center">
            <div className="text-3xl font-bold text-red-600">{expiredCount}</div>
            <div className="text-sm text-gray-500 mt-1">Expired</div>
          </div>
        </div>

        {/* Expiry alert banner */}
        {(expiringCount > 0 || expiredCount > 0) && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3">
            <span className="text-2xl">⚠️</span>
            <div>
              <div className="font-semibold text-red-800">Action required</div>
              <div className="text-sm text-red-700">
                {expiredCount > 0 && `${expiredCount} document${expiredCount > 1 ? 's' : ''} expired. `}
                {expiringCount > 0 && `${expiringCount} document${expiringCount > 1 ? 's' : ''} expiring within 30 days.`}
              </div>
            </div>
          </div>
        )}

        {/* Category sections */}
        {loading ? (
          <div className="text-center py-12 text-gray-400">Loading documents…</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {CATEGORIES.map(cat => {
              const docs = docsByCategory(cat.key)
              return (
                <div key={cat.key} className={`rounded-xl border ${cat.color} overflow-hidden`}>
                  <div className={`px-4 py-3 flex items-center justify-between ${cat.headerColor}`}>
                    <div className="flex items-center gap-2 font-semibold">
                      <span>{cat.icon}</span>
                      <span>{cat.label}</span>
                    </div>
                    <span className="text-xs font-medium bg-white bg-opacity-60 px-2 py-0.5 rounded-full">
                      {docs.length} file{docs.length !== 1 ? 's' : ''}
                    </span>
                  </div>

                  <div className="p-4 space-y-2">
                    {cat.required.map(req => {
                      const match = docs.find(d =>
                        d.document_name.toLowerCase().includes(req.toLowerCase().split(' ')[0])
                      )
                      return (
                        <div key={req} className="flex items-center gap-2 text-sm">
                          <span className={match ? 'text-green-500' : 'text-gray-300'}>
                            {match ? '✓' : '○'}
                          </span>
                          <span className={match ? 'text-gray-700' : 'text-gray-400 italic'}>{req}</span>
                          {!match && (
                            <button
                              onClick={() => {
                                setForm(f => ({ ...f, category: cat.key, document_name: req }))
                                setShowUpload(true)
                              }}
                              className="ml-auto text-xs text-red-600 hover:underline"
                            >
                              Upload
                            </button>
                          )}
                        </div>
                      )
                    })}

                    {docs.length > 0 && (
                      <div className="mt-3 space-y-2 border-t border-gray-200 pt-3">
                        {docs.map(doc => {
                          const expiry = getExpiryStatus(doc.expiry_date)
                          return (
                            <div key={doc.id} className="flex items-center gap-2 bg-white rounded-lg border border-gray-200 px-3 py-2 shadow-sm">
                              <span className="text-lg">{doc.file_type === 'pdf' ? '📄' : '🖼️'}</span>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-gray-800 truncate">{doc.document_name}</div>
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${expiry.color}`}>
                                  {expiry.label}
                                </span>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  onClick={() => handleView(doc)}
                                  className="text-blue-600 hover:text-blue-800 text-xs px-2 py-1 rounded hover:bg-blue-50"
                                >
                                  View
                                </button>
                                <button
                                  onClick={() => setDeleteConfirm(doc.id)}
                                  className="text-red-400 hover:text-red-600 text-xs px-2 py-1 rounded hover:bg-red-50"
                                >
                                  ✕
                                </button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}

                    {docs.length === 0 && (
                      <div className="mt-2 text-xs text-gray-400 text-center py-2">
                        No documents uploaded yet
                      </div>
                    )}

                    <button
                      onClick={() => {
                        setForm(f => ({ ...f, category: cat.key }))
                        setShowUpload(true)
                      }}
                      className="w-full mt-2 border border-dashed border-gray-300 rounded-lg py-2 text-xs text-gray-400 hover:text-gray-600 hover:border-gray-400 transition-colors"
                    >
                      + Add document
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Upload Modal */}
      {showUpload && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Upload Document</h2>
              <button onClick={() => setShowUpload(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <select
                  value={form.category}
                  onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                >
                  {CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.icon} {c.label}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Document Name *</label>
                <input
                  type="text"
                  value={form.document_name}
                  onChange={e => setForm(f => ({ ...f, document_name: e.target.value }))}
                  placeholder="e.g. Fire extinguisher certificate"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Issue Date</label>
                  <input
                    type="date"
                    value={form.issued_date}
                    onChange={e => setForm(f => ({ ...f, issued_date: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Expiry Date</label>
                  <input
                    type="date"
                    value={form.expiry_date}
                    onChange={e => setForm(f => ({ ...f, expiry_date: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Issued By</label>
                <input
                  type="text"
                  value={form.issued_by}
                  onChange={e => setForm(f => ({ ...f, issued_by: e.target.value }))}
                  placeholder="e.g. City of Hartswater"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">File (PDF or Image) *</label>
                <div
                  onClick={() => fileRef.current?.click()}
                  className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:border-red-400 hover:bg-red-50 transition-colors"
                >
                  {form.file ? (
                    <div className="text-sm text-gray-700">
                      <div className="text-2xl mb-1">{form.file.type.includes('pdf') ? '📄' : '🖼️'}</div>
                      <div className="font-medium">{form.file.name}</div>
                      <div className="text-gray-400">{(form.file.size / 1024).toFixed(0)} KB</div>
                    </div>
                  ) : (
                    <div className="text-gray-400">
                      <div className="text-3xl mb-2">📁</div>
                      <div className="text-sm">Click to select file</div>
                      <div className="text-xs mt-1">PDF, JPG, PNG supported</div>
                    </div>
                  )}
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  className="hidden"
                  onChange={e => {
                    const file = e.target.files?.[0]
                    if (file) setForm(f => ({ ...f, file }))
                  }}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Any additional notes…"
                  rows={2}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
                />
              </div>
            </div>
            <div className="px-6 pb-6 flex gap-3">
              <button
                onClick={() => setShowUpload(false)}
                className="flex-1 border border-gray-300 text-gray-700 rounded-lg py-2.5 text-sm font-medium hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleUpload}
                disabled={uploading || !form.file || !form.document_name}
                className="flex-1 bg-red-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {uploading ? 'Uploading…' : 'Upload'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center">
            <div className="text-4xl mb-3">🗑️</div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Delete document?</h3>
            <p className="text-sm text-gray-500 mb-6">This will permanently remove the file and cannot be undone.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 border border-gray-300 text-gray-700 rounded-lg py-2.5 text-sm font-medium hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const doc = documents.find(d => d.id === deleteConfirm)
                  if (doc) handleDelete(doc.id, doc.file_url)
                }}
                className="flex-1 bg-red-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* File viewer */}
      {viewerUrl && (
        <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">Document Viewer</span>
              <div className="flex items-center gap-2">
                <a href={viewerUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline">
                  Open in new tab
                </a>
                <button onClick={() => setViewerUrl(null)} className="text-gray-400 hover:text-gray-600 text-xl ml-2">✕</button>
              </div>
            </div>
            <div className="flex-1 overflow-auto">
              {viewerType === 'pdf' ? (
                <iframe src={viewerUrl} className="w-full h-full min-h-[70vh]" title="Document" />
              ) : (
                <img src={viewerUrl} alt="Document" className="max-w-full h-auto mx-auto p-4" />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
