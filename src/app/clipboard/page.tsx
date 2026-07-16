'use client'
import { useState, useEffect, useCallback } from 'react'
import { getStoreContext } from '@/lib/store-context'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const STORE_ID_DEFAULT = '05328298-fc27-4c9f-b091-bb7f6598b601' // fallback only

type Invoice = {
  id: string; supplier: string; invoice_number: string; invoice_date: string
  due_date: string | null; status: string; payment_method: string; notes: string
  total_amount: number; total_vat: number
}

function fmt(n: number) {
  return 'R ' + (n ?? 0).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function formatDate(d: string | null) {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' })
}
function daysUntil(d: string | null) {
  if (!d) return null
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const due = new Date(d + 'T00:00:00')
  return Math.round((due.getTime() - today.getTime()) / 86400000)
}

export default function ClipboardPage() {
  const [storeId, setStoreId] = useState('')
  const router = useRouter()
  const [unpaid, setUnpaid] = useState<Invoice[]>([])
  const [unreceived, setUnreceived] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const [unpaidRes, unreceivedRes] = await Promise.all([
      // Stock has already landed (received), but not yet paid — this is the money you still owe.
      supabase.from('invoices').select('*')
        .eq('store_id', storeId).eq('status', 'received')
        .order('due_date', { ascending: true, nullsFirst: false }),
      // Drafts sitting around that were never submitted/received — easy to lose track of.
      supabase.from('invoices').select('*')
        .eq('store_id', storeId).eq('status', 'draft')
        .order('invoice_date', { ascending: false }),
    ])
    setUnpaid(unpaidRes.data || [])
    setUnreceived(unreceivedRes.data || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    getStoreContext().then(ctx => { if(ctx?.storeId) setStoreId(ctx.storeId) }); load() }, [load])

  async function markPaid(id: string) {
    await supabase.from('invoices').update({ status: 'paid' }).eq('id', id)
    load()
  }

  const totalOwed = unpaid.reduce((s, i) => s + Number(i.total_amount || 0), 0)
  const overdue = unpaid.filter(i => { const d = daysUntil(i.due_date); return d !== null && d < 0 })

  if (!storeId) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8faf8', fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ textAlign: 'center', maxWidth: 400, padding: 32 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🏪</div>
          <div style={{ fontWeight: 800, fontSize: 20, color: '#111', marginBottom: 8 }}>Select a Store First</div>
          <div style={{ color: '#6b7280', fontSize: 14, marginBottom: 24, lineHeight: '1.6' }}>This page is store-specific. Go to your organisation overview and click into a store.</div>
          <a href="/org" style={{ background: '#1a5c38', color: '#fff', borderRadius: 12, padding: '12px 24px', fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>← Organisation Overview</a>
        </div>
      </div>
    )
  }


  return (
    <div style={{ minHeight: '100vh', background: '#f0f4f0' }}>
      <div style={{ background: 'linear-gradient(135deg, #0a1f12, #1a5c38)', padding: '24px 24px 60px' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <button onClick={() => router.push('/dashboard')} style={{ background: 'rgba(255,255,255,0.1)', border: '1.5px solid rgba(255,255,255,0.2)', borderRadius: 10, padding: '8px 14px', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, marginBottom: 16 }}>← Back</button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span style={{ fontSize: 32 }}>📋</span>
            <div>
              <h1 style={{ color: '#fff', fontSize: 26, fontWeight: 800, margin: 0 }}>Clipboard</h1>
              <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, margin: 0 }}>Everything not finalised yet — across all months</p>
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1000, margin: '-40px auto 0', padding: '0 24px 60px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af' }}>Loading…</div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 24 }}>
              {[
                { label: 'Total Owed', value: fmt(totalOwed), color: '#dc2626' },
                { label: 'Overdue', value: String(overdue.length), color: overdue.length ? '#dc2626' : '#16a34a' },
                { label: 'Unsubmitted Drafts', value: String(unreceived.length), color: '#92400e' },
              ].map(c => (
                <div key={c.label} style={{ background: 'white', borderRadius: 16, padding: '18px 20px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                  <div style={{ fontSize: 12, color: '#9ca3af', fontWeight: 600, marginBottom: 4 }}>{c.label}</div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: c.color }}>{c.value}</div>
                </div>
              ))}
            </div>

            <div style={{ background: 'white', borderRadius: 20, border: '1.5px solid #eef2ee', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', marginBottom: 24 }}>
              <div style={{ padding: '18px 24px', borderBottom: '1px solid #f3f4f6' }}>
                <div style={{ fontSize: 17, fontWeight: 800, color: '#111' }}>💰 Unpaid Bills</div>
                <div style={{ fontSize: 13, color: '#9ca3af' }}>Stock has been received — payment still owed to the supplier</div>
              </div>
              {unpaid.length === 0 ? (
                <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>Nothing outstanding 🎉</div>
              ) : unpaid.map(inv => {
                const days = daysUntil(inv.due_date)
                const isOverdue = days !== null && days < 0
                const isDueSoon = days !== null && days >= 0 && days <= 2
                return (
                  <div key={inv.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', borderTop: '1px solid #f3f4f6' }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 15 }}>{inv.supplier}</div>
                      <div style={{ fontSize: 12, color: '#6b7280' }}>
                        {inv.invoice_number && <span style={{ marginRight: 10 }}>#{inv.invoice_number}</span>}
                        Received {formatDate(inv.invoice_date)}
                        {inv.due_date && <span style={{ marginLeft: 10 }}>Due: {formatDate(inv.due_date)}</span>}
                        {isOverdue && <span style={{ marginLeft: 10, color: '#dc2626', fontWeight: 700 }}>{Math.abs(days!)} days overdue</span>}
                        {isDueSoon && <span style={{ marginLeft: 10, color: '#d97706', fontWeight: 700 }}>Due in {days} day{days === 1 ? '' : 's'}</span>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      <span style={{ fontWeight: 800, fontSize: 17, color: isOverdue ? '#dc2626' : '#111' }}>{fmt(Number(inv.total_amount))}</span>
                      <button onClick={() => markPaid(inv.id)} style={{ background: '#1a5c38', color: 'white', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Mark Paid</button>
                    </div>
                  </div>
                )
              })}
            </div>

            <div style={{ background: 'white', borderRadius: 20, border: '1.5px solid #eef2ee', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
              <div style={{ padding: '18px 24px', borderBottom: '1px solid #f3f4f6' }}>
                <div style={{ fontSize: 17, fontWeight: 800, color: '#111' }}>📝 Unsubmitted Drafts</div>
                <div style={{ fontSize: 13, color: '#9ca3af' }}>Saved but not yet submitted — stock hasn&apos;t been updated for these</div>
              </div>
              {unreceived.length === 0 ? (
                <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>No pending drafts</div>
              ) : unreceived.map(inv => (
                <div key={inv.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', borderTop: '1px solid #f3f4f6' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{inv.supplier || 'Unnamed supplier'}</div>
                    <div style={{ fontSize: 12, color: '#6b7280' }}>
                      {inv.invoice_number && <span style={{ marginRight: 10 }}>#{inv.invoice_number}</span>}
                      {formatDate(inv.invoice_date)}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <span style={{ fontWeight: 800, fontSize: 17, color: '#92400e' }}>{fmt(Number(inv.total_amount))}</span>
                    <button onClick={() => router.push('/finances')} style={{ background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Open in Finances</button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
