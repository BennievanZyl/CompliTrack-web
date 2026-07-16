'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

type Employee = { id: string; full_name: string; role: string }
type EmployeeWage = { id: string; employee_id: string; hourly_rate: number; uif_employee: number; uif_employer: number; tax_rate: number; pay_frequency: string; bank_name?: string; bank_account?: string; bank_branch?: string; id_number?: string }
type EmployeeAdvance = { id: string; employee_id: string; amount: number; reason?: string; advance_date: string; repayment_status: string; deduct_from_wages: boolean }

const TAB_STYLE = (active: boolean) => ({ padding: '10px 20px', borderRadius: '10px', fontSize: '13px', fontWeight: '700', cursor: 'pointer', border: 'none', background: active ? '#1a5c38' : 'transparent', color: active ? '#fff' : '#6b7280' })
const INPUT_STYLE = { width: '100%', border: '1.5px solid #e5e7eb', borderRadius: '10px', padding: '10px 12px', fontSize: '14px', outline: 'none', boxSizing: 'border-box' as const }
const LABEL_STYLE = { display: 'block', fontSize: '12px', fontWeight: '700', color: '#374151', marginBottom: '6px', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }

function formatCurrency(val: number) { return `R ${val.toFixed(2)}` }
function formatHours(val: number) { return `${Math.floor(val)}h ${Math.round((val % 1) * 60)}m` }


async function getStoreContext(): Promise<{ storeId: string; orgId: string; employerName: string }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not logged in');
  const { data: profile } = await supabase.from('profiles')
    .select('store_id, organisation_id').eq('id', user.id).single();
  if (!profile?.store_id) throw new Error('No store linked');
  const { data: store } = await supabase.from('stores')
    .select('name').eq('id', profile.store_id).single();
  return {
    storeId: profile.store_id,
    orgId: profile.organisation_id || '',
    employerName: store?.name || 'CompliTrack Store',
  };
}

export default function WagesPage() {
  const router = useRouter()
  const [storeId, setStoreId] = useState('05328298-fc27-4c9f-b091-bb7f6598b601')
  const [orgId, setOrgId] = useState('e903386b-133a-4bad-b054-ef7ef616a3ff')
  const [tab, setTab] = useState<'advances' | 'slips' | 'settings'>('advances')
  const [employees, setEmployees] = useState<Employee[]>([])
  const [wages, setWages] = useState<EmployeeWage[]>([])
  const [advances, setAdvances] = useState<EmployeeAdvance[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdvanceModal, setShowAdvanceModal] = useState(false)
  const [showWageModal, setShowWageModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [advanceForm, setAdvanceForm] = useState({ employee_id: '', amount: '', reason: '', advance_date: new Date().toISOString().split('T')[0] })
  const [wageForm, setWageForm] = useState({ employee_id: '', hourly_rate: '', uif_employee: '0.01', uif_employer: '0.01', tax_rate: '0', pay_frequency: 'monthly', bank_name: '', bank_account: '', bank_branch: '', id_number: '' })

  useEffect(() => {
    getStoreContext().then(ctx => {
      setStoreId(ctx.storeId)
      setOrgId(ctx.orgId)
    }).catch(() => {}).finally(() => loadAll())
  }, [])

  async function loadAll(sid?: string) {
    setLoading(true)
    const [empRes, wageRes, advRes] = await Promise.all([
      supabase.from('employees').select('id, full_name, role, hourly_rate, pay_frequency, id_number').eq('store_id', sid || storeId).eq('is_active', true).order('full_name'),
      supabase.from('employee_wages').select('*').eq('store_id', sid || storeId),
      supabase.from('employee_advances').select('*').eq('store_id', sid || storeId).order('advance_date', { ascending: false }),
    ])
    const emps = empRes.data || []
    let wageData = wageRes.data || []

    // Merge: for employees with hourly_rate on employees table but no wage record,
    // create a virtual wage record so the wages page shows the correct rate
    for (const emp of emps) {
      if (!emp.hourly_rate) continue
      const hasWage = wageData.find((w: any) => w.employee_id === emp.id)
      if (!hasWage) {
        wageData = [...wageData, {
          id: `virtual-${emp.id}`,
          employee_id: emp.id,
          store_id: sid || storeId,
          hourly_rate: emp.hourly_rate,
          pay_frequency: emp.pay_frequency || 'monthly',
          uif_employee: 0.01,
          uif_employer: 0.01,
          tax_rate: 0,
          id_number: emp.id_number || null,
        }]
      }
    }

    setEmployees(emps)
    setWages(wageData)
    setAdvances(advRes.data || [])
    setLoading(false)
  }

  async function saveAdvance() {
    if (!advanceForm.employee_id || !advanceForm.amount) return
    setSaving(true)
    await supabase.from('employee_advances').insert({
      store_id: sid || storeId,
      employee_id: advanceForm.employee_id,
      amount: parseFloat(advanceForm.amount),
      reason: advanceForm.reason || null,
      advance_date: advanceForm.advance_date,
      repayment_status: 'outstanding',
      deduct_from_wages: true,
    })
    setAdvanceForm({ employee_id: '', amount: '', reason: '', advance_date: new Date().toISOString().split('T')[0] })
    setShowAdvanceModal(false)
    await loadAll()
    setSaving(false)
  }

  async function saveWage() {
    if (!wageForm.employee_id || !wageForm.hourly_rate) return
    setSaving(true)
    const hourlyRate = parseFloat(wageForm.hourly_rate)
    const existing = wages.find(w => w.employee_id === wageForm.employee_id)
    const payload = {
      store_id: sid || storeId, employee_id: wageForm.employee_id,
      hourly_rate: hourlyRate,
      uif_employee: parseFloat(wageForm.uif_employee),
      uif_employer: parseFloat(wageForm.uif_employer),
      tax_rate: parseFloat(wageForm.tax_rate),
      pay_frequency: wageForm.pay_frequency,
      bank_name: wageForm.bank_name || null,
      bank_account: wageForm.bank_account || null,
      bank_branch: wageForm.bank_branch || null,
      id_number: wageForm.id_number || null,
    }
    // Save to employee_wages (for UIF, bank details etc.)
    if (existing) await supabase.from('employee_wages').update(payload).eq('id', existing.id)
    else await supabase.from('employee_wages').insert(payload)

    // ALSO update employees.hourly_rate so Time & Attendance stays in sync
    await supabase.from('employees').update({
      hourly_rate: hourlyRate,
      pay_frequency: wageForm.pay_frequency,
      id_number: wageForm.id_number || null,
    }).eq('id', wageForm.employee_id)

    setShowWageModal(false)
    setWageForm({ employee_id: '', hourly_rate: '', uif_employee: '0.01', uif_employer: '0.01', tax_rate: '0', pay_frequency: 'monthly', bank_name: '', bank_account: '', bank_branch: '', id_number: '' })
    await loadAll()
    setSaving(false)
  }

  const unpaidAdvances = advances.filter(a => a.repayment_status === 'outstanding' && a.deduct_from_wages)

  return (
    <div style={{ minHeight: '100vh', background: '#f0f4f0' }}>
      <header style={{ background: 'linear-gradient(135deg, #0a1f12 0%, #1a5c38 100%)', position: 'sticky', top: 0, zIndex: 10, padding: '0 40px' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '72px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M3 10L8 15L17 6" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
            <div>
              <div style={{ fontWeight: '800', fontSize: '16px', color: 'white' }}>CompliTrack</div>
              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.55)' }}>Wages & Payroll</div>
            </div>
          </div>
          <button onClick={() => router.push('/dashboard')} style={{ padding: '8px 16px', border: '1.5px solid rgba(255,255,255,0.4)', borderRadius: '10px', fontSize: '13px', fontWeight: '700', color: 'white', background: 'rgba(255,255,255,0.15)', cursor: 'pointer' }}>← Dashboard</button>
        </div>
      </header>

      <div style={{ background: 'linear-gradient(135deg, #0a1f12 0%, #1a5c38 100%)', padding: '40px 40px 100px' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <h1 style={{ fontSize: '32px', fontWeight: '800', color: 'white', margin: '0 0 6px', letterSpacing: '-0.5px' }}>Wages & Payroll 💰</h1>
          <p style={{ fontSize: '15px', color: 'rgba(255,255,255,0.6)', margin: 0 }}>Calculate hours from attendance, manage advances and generate wage slips</p>
        </div>
      </div>

      <main style={{ maxWidth: '1200px', margin: '-60px auto 0', padding: '0 40px 60px', position: 'relative', zIndex: 1 }}>
        <div style={{ background: 'white', borderRadius: '16px', padding: '6px', display: 'inline-flex', gap: '4px', marginBottom: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          {(['payroll', 'advances', 'slips', 'settings'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={TAB_STYLE(tab === t)}>
              {t === 'payroll' ? '📊 Payroll' : t === 'advances' ? '💵 Advances' : t === 'slips' ? '🧾 Wage Slips' : '⚙️ Settings'}
            </button>
          ))}
        </div>

        {loading ? <div style={{ textAlign: 'center', padding: '60px', color: '#9ca3af' }}>Loading...</div> : (<>

          {/* PAYROLL TAB */}

          {/* ADVANCES TAB */}
          {tab === 'advances' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '18px', fontWeight: '800', color: '#111' }}>Wage Advances</div>
                  <div style={{ fontSize: '13px', color: '#9ca3af', marginTop: '2px' }}>Advances marked &quot;deduct from wages&quot; are automatically deducted on next payroll run. This includes advances logged in Cash Up.</div>
                </div>
                <button onClick={() => setShowAdvanceModal(true)} style={{ padding: '10px 20px', background: '#1a5c38', color: 'white', border: 'none', borderRadius: '10px', fontSize: '13px', fontWeight: '800', cursor: 'pointer' }}>+ Log Advance</button>
              </div>

              {unpaidAdvances.length > 0 && (
                <div style={{ background: 'white', border: '1.5px solid #fde68a', borderRadius: '16px', padding: '16px 24px', display: 'flex', alignItems: 'center', gap: '14px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                  <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', flexShrink: 0 }}>💵</div>
                  <div>
                    <div style={{ fontWeight: '700', color: '#92400e', fontSize: '14px' }}>{unpaidAdvances.length} outstanding advance{unpaidAdvances.length > 1 ? 's' : ''} pending deduction</div>
                    <div style={{ fontSize: '12px', color: '#b45309' }}>Total: {formatCurrency(unpaidAdvances.reduce((s, a) => s + a.amount, 0))} — will be deducted on next payroll run</div>
                  </div>
                </div>
              )}

              <div style={{ background: 'white', borderRadius: '20px', border: '1.5px solid #eef2ee', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                {advances.length === 0 ? (
                  <div style={{ padding: '48px', textAlign: 'center', color: '#9ca3af' }}>No advances logged yet</div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: '#f9fafb' }}>
                        {['Employee', 'Amount', 'Date', 'Reason', 'Deduct from Wages', 'Status'].map(h => (
                          <th key={h} style={{ padding: '12px 20px', textAlign: 'left', fontSize: '11px', fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {advances.map(adv => {
                        const emp = employees.find(e => e.id === adv.employee_id)
                        return (
                          <tr key={adv.id} style={{ borderTop: '1px solid #f3f4f6' }}>
                            <td style={{ padding: '14px 20px', fontWeight: '700', fontSize: '14px', color: '#111' }}>{emp?.full_name || '—'}</td>
                            <td style={{ padding: '14px 20px', fontWeight: '800', fontSize: '15px', color: '#dc2626' }}>{formatCurrency(adv.amount)}</td>
                            <td style={{ padding: '14px 20px', fontSize: '13px', color: '#6b7280' }}>{new Date(adv.advance_date).toLocaleDateString('en-ZA')}</td>
                            <td style={{ padding: '14px 20px', fontSize: '13px', color: '#374151' }}>{adv.reason || '—'}</td>
                            <td style={{ padding: '14px 20px' }}>
                              <span style={{ fontSize: '11px', fontWeight: '700', padding: '3px 10px', borderRadius: '100px', background: adv.deduct_from_wages ? '#dcfce7' : '#f3f4f6', color: adv.deduct_from_wages ? '#166534' : '#6b7280' }}>
                                {adv.deduct_from_wages ? '✓ Yes' : 'No'}
                              </span>
                            </td>
                            <td style={{ padding: '14px 20px' }}>
                              <span style={{ fontSize: '11px', fontWeight: '700', padding: '3px 10px', borderRadius: '100px', background: adv.repayment_status === 'paid' ? '#dcfce7' : '#fef3c7', color: adv.repayment_status === 'paid' ? '#166634' : '#92400e' }}>
                                {adv.repayment_status === 'paid' ? 'Deducted' : 'Outstanding'}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {/* SLIPS TAB */}
          {tab === 'slips' && (
            <div style={{ background: 'white', borderRadius: '20px', border: '1.5px solid #eef2ee', padding: '48px', textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
              <div style={{ fontSize: '40px', marginBottom: '16px' }}>🧾</div>
              <div style={{ fontWeight: '800', fontSize: '18px', color: '#111', marginBottom: '8px' }}>Wage Slips are in Time & Attendance</div>
              <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '24px', lineHeight: '1.6' }}>
                Payslips are generated from actual clock-in data in the Time & Attendance section.<br />
                Go there to print, email or WhatsApp payslips to your staff.
              </div>
              <button onClick={() => router.push('/attendance')}
                style={{ background: '#1a5c38', color: 'white', border: 'none', borderRadius: '12px', padding: '12px 28px', fontSize: '14px', fontWeight: '800', cursor: 'pointer' }}>
                → Go to Time & Attendance
              </button>
            </div>
          )}

          {/* SETTINGS TAB */}
          {tab === 'settings' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '18px', fontWeight: '800', color: '#111' }}>Employee Wage Settings</div>
                  <div style={{ fontSize: '13px', color: '#9ca3af', marginTop: '2px' }}>Set hourly rate, UIF and tax per employee</div>
                </div>
                <button onClick={() => setShowWageModal(true)} style={{ padding: '10px 20px', background: '#1a5c38', color: 'white', border: 'none', borderRadius: '10px', fontSize: '13px', fontWeight: '800', cursor: 'pointer' }}>+ Set Wage</button>
              </div>
              <div style={{ background: 'white', borderRadius: '20px', border: '1.5px solid #eef2ee', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#f9fafb' }}>
                      {['Employee', 'Role', 'Hourly Rate', 'UIF %', 'PAYE %', 'Pay Freq', ''].map(h => (
                        <th key={h} style={{ padding: '12px 20px', textAlign: 'left', fontSize: '11px', fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {employees.map(emp => {
                      const wage = wages.find(w => w.employee_id === emp.id)
                      return (
                        <tr key={emp.id} style={{ borderTop: '1px solid #f3f4f6' }}>
                          <td style={{ padding: '14px 20px', fontWeight: '700', fontSize: '14px', color: '#111' }}>{emp.full_name}</td>
                          <td style={{ padding: '14px 20px', fontSize: '13px', color: '#6b7280' }}>{emp.role}</td>
                          <td style={{ padding: '14px 20px', fontWeight: '800', fontSize: '14px', color: '#1a5c38' }}>{wage ? `R ${wage.hourly_rate.toFixed(2)}/h` : <span style={{ color: '#d1d5db' }}>Not set</span>}</td>
                          <td style={{ padding: '14px 20px', fontSize: '13px', color: '#374151' }}>{wage ? `${(wage.uif_employee * 100).toFixed(1)}%` : '—'}</td>
                          <td style={{ padding: '14px 20px', fontSize: '13px', color: '#374151' }}>{wage ? `${(wage.tax_rate * 100).toFixed(1)}%` : '—'}</td>
                          <td style={{ padding: '14px 20px', fontSize: '13px', color: '#374151' }}>{wage?.pay_frequency || '—'}</td>
                          <td style={{ padding: '14px 20px' }}>
                            <button onClick={() => {
                              setWageForm({ employee_id: emp.id, hourly_rate: wage?.hourly_rate?.toString() || '', uif_employee: wage?.uif_employee?.toString() || '0.01', uif_employer: wage?.uif_employer?.toString() || '0.01', tax_rate: wage?.tax_rate?.toString() || '0', pay_frequency: wage?.pay_frequency || 'monthly', bank_name: wage?.bank_name || '', bank_account: wage?.bank_account || '', bank_branch: wage?.bank_branch || '', id_number: wage?.id_number || '' })
                              setShowWageModal(true)
                            }} style={{ fontSize: '12px', color: '#1d4ed8', background: '#eff6ff', border: 'none', borderRadius: '8px', padding: '5px 10px', cursor: 'pointer', fontWeight: '600' }}>Edit</button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>)}

        <div style={{ marginTop: '48px', textAlign: 'center' }}><p style={{ fontSize: '12px', color: '#9ca3af' }}>CompliTrack © 2026 • Store Management Platform • South Africa 🇿🇦</p></div>
      </main>

      {/* Advance Modal */}
      {showAdvanceModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '16px' }}>
          <div style={{ background: 'white', borderRadius: '24px', width: '100%', maxWidth: '440px', boxShadow: '0 24px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ padding: '24px 28px 16px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '800', color: '#111', margin: 0 }}>Log Advance</h2>
              <button onClick={() => setShowAdvanceModal(false)} style={{ background: '#f3f4f6', border: 'none', borderRadius: '8px', width: '32px', height: '32px', cursor: 'pointer', fontSize: '16px' }}>✕</button>
            </div>
            <div style={{ padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div><label style={LABEL_STYLE}>Employee *</label><select value={advanceForm.employee_id} onChange={e => setAdvanceForm(f => ({ ...f, employee_id: e.target.value }))} style={INPUT_STYLE}><option value="">Select employee</option>{employees.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}</select></div>
              <div><label style={LABEL_STYLE}>Amount (R) *</label><input type="number" value={advanceForm.amount} onChange={e => setAdvanceForm(f => ({ ...f, amount: e.target.value }))} placeholder="e.g. 500" style={INPUT_STYLE} /></div>
              <div><label style={LABEL_STYLE}>Date</label><input type="date" value={advanceForm.advance_date} onChange={e => setAdvanceForm(f => ({ ...f, advance_date: e.target.value }))} style={INPUT_STYLE} /></div>
              <div><label style={LABEL_STYLE}>Reason</label><input type="text" value={advanceForm.reason} onChange={e => setAdvanceForm(f => ({ ...f, reason: e.target.value }))} placeholder="e.g. Emergency" style={INPUT_STYLE} /></div>
              <div style={{ background: '#f0fdf4', borderRadius: '10px', padding: '12px', fontSize: '12px', color: '#166534', fontWeight: '600' }}>
                ✅ This advance will be automatically deducted from the next payroll run
              </div>
            </div>
            <div style={{ padding: '16px 28px 24px', display: 'flex', gap: '12px' }}>
              <button onClick={() => setShowAdvanceModal(false)} style={{ flex: 1, border: '1.5px solid #e5e7eb', color: '#374151', borderRadius: '12px', padding: '12px', fontSize: '14px', fontWeight: '700', cursor: 'pointer', background: 'white' }}>Cancel</button>
              <button onClick={saveAdvance} disabled={saving} style={{ flex: 1, background: '#1a5c38', color: 'white', border: 'none', borderRadius: '12px', padding: '12px', fontSize: '14px', fontWeight: '800', cursor: 'pointer' }}>Save Advance</button>
            </div>
          </div>
        </div>
      )}

      {/* Wage Settings Modal */}
      {showWageModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '16px' }}>
          <div style={{ background: 'white', borderRadius: '24px', width: '100%', maxWidth: '520px', boxShadow: '0 24px 60px rgba(0,0,0,0.2)', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ padding: '24px 28px 16px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '800', color: '#111', margin: 0 }}>Wage Settings</h2>
              <button onClick={() => setShowWageModal(false)} style={{ background: '#f3f4f6', border: 'none', borderRadius: '8px', width: '32px', height: '32px', cursor: 'pointer', fontSize: '16px' }}>✕</button>
            </div>
            <div style={{ padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div><label style={LABEL_STYLE}>Employee *</label><select value={wageForm.employee_id} onChange={e => setWageForm(f => ({ ...f, employee_id: e.target.value }))} style={INPUT_STYLE}><option value="">Select employee</option>{employees.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}</select></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div><label style={LABEL_STYLE}>Hourly Rate (R) *</label><input type="number" step="0.01" value={wageForm.hourly_rate} onChange={e => setWageForm(f => ({ ...f, hourly_rate: e.target.value }))} placeholder="e.g. 25.00" style={INPUT_STYLE} /></div>
                <div><label style={LABEL_STYLE}>Pay Frequency</label><select value={wageForm.pay_frequency} onChange={e => setWageForm(f => ({ ...f, pay_frequency: e.target.value }))} style={INPUT_STYLE}><option value="weekly">Weekly</option><option value="biweekly">Bi-weekly</option><option value="monthly">Monthly</option></select></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                <div><label style={LABEL_STYLE}>UIF Emp %</label><input type="number" step="0.1" value={(parseFloat(wageForm.uif_employee || '0') * 100).toFixed(1)} onChange={e => setWageForm(f => ({ ...f, uif_employee: (parseFloat(e.target.value) / 100).toString() }))} style={INPUT_STYLE} /></div>
                <div><label style={LABEL_STYLE}>UIF Emr %</label><input type="number" step="0.1" value={(parseFloat(wageForm.uif_employer || '0') * 100).toFixed(1)} onChange={e => setWageForm(f => ({ ...f, uif_employer: (parseFloat(e.target.value) / 100).toString() }))} style={INPUT_STYLE} /></div>
                <div><label style={LABEL_STYLE}>PAYE %</label><input type="number" step="0.1" value={(parseFloat(wageForm.tax_rate || '0') * 100).toFixed(1)} onChange={e => setWageForm(f => ({ ...f, tax_rate: (parseFloat(e.target.value) / 100).toString() }))} style={INPUT_STYLE} /></div>
              </div>
              <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: '16px' }}>
                <div style={{ fontSize: '13px', fontWeight: '700', color: '#374151', marginBottom: '12px' }}>Banking Details</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div><label style={LABEL_STYLE}>ID Number</label><input type="text" value={wageForm.id_number} onChange={e => setWageForm(f => ({ ...f, id_number: e.target.value }))} placeholder="RSA ID number" style={INPUT_STYLE} /></div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div><label style={LABEL_STYLE}>Bank Name</label><input type="text" value={wageForm.bank_name} onChange={e => setWageForm(f => ({ ...f, bank_name: e.target.value }))} placeholder="e.g. FNB" style={INPUT_STYLE} /></div>
                    <div><label style={LABEL_STYLE}>Branch Code</label><input type="text" value={wageForm.bank_branch} onChange={e => setWageForm(f => ({ ...f, bank_branch: e.target.value }))} placeholder="e.g. 250655" style={INPUT_STYLE} /></div>
                  </div>
                  <div><label style={LABEL_STYLE}>Account Number</label><input type="text" value={wageForm.bank_account} onChange={e => setWageForm(f => ({ ...f, bank_account: e.target.value }))} placeholder="Bank account number" style={INPUT_STYLE} /></div>
                </div>
              </div>
            </div>
            <div style={{ padding: '16px 28px 24px', display: 'flex', gap: '12px' }}>
              <button onClick={() => setShowWageModal(false)} style={{ flex: 1, border: '1.5px solid #e5e7eb', color: '#374151', borderRadius: '12px', padding: '12px', fontSize: '14px', fontWeight: '700', cursor: 'pointer', background: 'white' }}>Cancel</button>
              <button onClick={saveWage} disabled={saving} style={{ flex: 1, background: '#1a5c38', color: 'white', border: 'none', borderRadius: '12px', padding: '12px', fontSize: '14px', fontWeight: '800', cursor: 'pointer' }}>Save</button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
