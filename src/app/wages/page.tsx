'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

const STORE_ID = '05328298-fc27-4c9f-b091-bb7f6598b601'
type Employee = { id: string; full_name: string; role: string }
type EmployeeWage = { id: string; employee_id: string; hourly_rate: number; uif_employee: number; uif_employer: number; tax_rate: number; pay_frequency: string; bank_name?: string; bank_account?: string; bank_branch?: string; id_number?: string }
type PayrollPeriod = { id: string; period_start: string; period_end: string; pay_frequency: string; status: string }
type PayrollRun = { id: string; payroll_period_id: string; employee_id: string; hours_worked: number; hourly_rate: number; gross_pay: number; uif_employee: number; uif_employer: number; paye_tax: number; advances_deducted: number; net_pay: number; status: string }
type EmployeeAdvance = { id: string; employee_id: string; amount: number; reason?: string; advance_date: string; repayment_status: string; deduct_from_wages: boolean }

const TAB_STYLE = (active: boolean) => ({ padding: '10px 20px', borderRadius: '10px', fontSize: '13px', fontWeight: '700', cursor: 'pointer', border: 'none', background: active ? '#1a5c38' : 'transparent', color: active ? '#fff' : '#6b7280' })
const INPUT_STYLE = { width: '100%', border: '1.5px solid #e5e7eb', borderRadius: '10px', padding: '10px 12px', fontSize: '14px', outline: 'none', boxSizing: 'border-box' as const }
const LABEL_STYLE = { display: 'block', fontSize: '12px', fontWeight: '700', color: '#374151', marginBottom: '6px', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }

function formatCurrency(val: number) { return `R ${val.toFixed(2)}` }
function formatHours(val: number) { return `${Math.floor(val)}h ${Math.round((val % 1) * 60)}m` }

export default function WagesPage() {
  const router = useRouter()
  const [tab, setTab] = useState<'payroll' | 'advances' | 'settings'>('payroll')
  const [employees, setEmployees] = useState<Employee[]>([])
  const [wages, setWages] = useState<EmployeeWage[]>([])
  const [periods, setPeriods] = useState<PayrollPeriod[]>([])
  const [runs, setRuns] = useState<PayrollRun[]>([])
  const [advances, setAdvances] = useState<EmployeeAdvance[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedPeriod, setSelectedPeriod] = useState<PayrollPeriod | null>(null)
  const [showNewPeriod, setShowNewPeriod] = useState(false)
  const [showAdvanceModal, setShowAdvanceModal] = useState(false)
  const [showWageModal, setShowWageModal] = useState(false)
  const [showSlip, setShowSlip] = useState<PayrollRun | null>(null)
  const [calculating, setCalculating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [periodForm, setPeriodForm] = useState({ period_start: '', period_end: '', pay_frequency: 'monthly' })
  const [advanceForm, setAdvanceForm] = useState({ employee_id: '', amount: '', reason: '', advance_date: new Date().toISOString().split('T')[0] })
  const [wageForm, setWageForm] = useState({ employee_id: '', hourly_rate: '', night_allowance_rate: '', uif_employee: '0.01', uif_employer: '0.01', tax_rate: '0', pay_frequency: 'monthly', bank_name: '', bank_account: '', bank_branch: '', id_number: '' })

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [empRes, wageRes, periodRes, runRes, advRes] = await Promise.all([
      supabase.from('employees').select('id, full_name, role, hourly_rate, night_allowance_rate, pay_frequency, id_number').eq('store_id', STORE_ID).eq('is_active', true).order('full_name'),
      supabase.from('employee_wages').select('*').eq('store_id', STORE_ID),
      supabase.from('payroll_periods').select('*').eq('store_id', STORE_ID).order('period_start', { ascending: false }),
      supabase.from('payroll_runs').select('*').eq('store_id', STORE_ID),
      supabase.from('employee_advances').select('*').eq('store_id', STORE_ID).order('advance_date', { ascending: false }),
    ])
    setEmployees(empRes.data || [])
    setWages(wageRes.data || [])
    setPeriods(periodRes.data || [])
    setRuns(runRes.data || [])
    setAdvances(advRes.data || [])
    if (periodRes.data?.length) setSelectedPeriod(periodRes.data[0])
    setLoading(false)
  }

  async function createPeriod() {
    if (!periodForm.period_start || !periodForm.period_end) return
    setSaving(true)
    const { data } = await supabase.from('payroll_periods').insert({ store_id: STORE_ID, ...periodForm, status: 'open' }).select().single()
    if (data) { setSelectedPeriod(data); setShowNewPeriod(false); setPeriodForm({ period_start: '', period_end: '', pay_frequency: 'monthly' }) }
    await loadAll()
    setSaving(false)
  }

  async function calculatePayroll() {
    if (!selectedPeriod) return
    setCalculating(true)
    for (const emp of employees) {
      const wage = wages.find(w => w.employee_id === emp.id)
      if (!wage) continue

      const { data: att } = await supabase
        .from('attendance')
        .select('hours_worked')
        .eq('store_id', STORE_ID)
        .eq('employee_id', emp.id)
        .gte('work_date', selectedPeriod.period_start)
        .lte('work_date', selectedPeriod.period_end)
        .not('clock_out', 'is', null)

      const hours = att?.reduce((sum, r) => sum + (r.hours_worked || 0), 0) || 0
      const gross = hours * wage.hourly_rate
      const uif_emp = gross * wage.uif_employee
      const uif_emr = gross * wage.uif_employer
      const paye = gross * wage.tax_rate

      // Only deduct advances marked as outstanding AND deduct_from_wages = true
      const empAdvances = advances.filter(a =>
        a.employee_id === emp.id &&
        a.repayment_status === 'outstanding' &&
        a.deduct_from_wages === true
      )
      const advTotal = empAdvances.reduce((sum, a) => sum + a.amount, 0)
      const net = gross - uif_emp - paye - advTotal

      const existing = runs.find(r => r.payroll_period_id === selectedPeriod.id && r.employee_id === emp.id)
      if (existing) {
        await supabase.from('payroll_runs').update({
          hours_worked: hours, hourly_rate: wage.hourly_rate, gross_pay: gross,
          uif_employee: uif_emp, uif_employer: uif_emr, paye_tax: paye,
          advances_deducted: advTotal, net_pay: net,
        }).eq('id', existing.id)
      } else {
        await supabase.from('payroll_runs').insert({
          payroll_period_id: selectedPeriod.id, employee_id: emp.id, store_id: STORE_ID,
          hours_worked: hours, hourly_rate: wage.hourly_rate, gross_pay: gross,
          uif_employee: uif_emp, uif_employer: uif_emr, paye_tax: paye,
          advances_deducted: advTotal, net_pay: net, status: 'draft',
        })
      }

      // NOTE: advances are NOT marked paid here — only when "Mark as Paid" is clicked
      // This allows re-calculation without incorrectly settling advances
    }
    await loadAll()
    setCalculating(false)
  }

  async function approvePeriod() {
    if (!selectedPeriod) return
    await supabase.from('payroll_periods').update({ status: 'approved', approved_at: new Date().toISOString() }).eq('id', selectedPeriod.id)
    await supabase.from('payroll_runs').update({ status: 'approved' }).eq('payroll_period_id', selectedPeriod.id)
    await loadAll()
  }

  async function markPaid() {
    if (!selectedPeriod) return
    // Step 1: mark period and runs as paid
    await supabase.from('payroll_periods').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', selectedPeriod.id)
    await supabase.from('payroll_runs').update({ status: 'paid' }).eq('payroll_period_id', selectedPeriod.id)

    // Step 2: NOW mark deducted advances as paid (only on actual payment, not on calculate)
    const runsForPeriod = runs.filter(r => r.payroll_period_id === selectedPeriod.id && r.advances_deducted > 0)
    for (const run of runsForPeriod) {
      const empAdvances = advances.filter(a =>
        a.employee_id === run.employee_id &&
        a.repayment_status === 'outstanding' &&
        a.deduct_from_wages === true
      )
      for (const adv of empAdvances) {
        await supabase.from('employee_advances').update({
          repayment_status: 'paid',
          payroll_period_id: selectedPeriod.id,
        }).eq('id', adv.id)
      }
    }
    await loadAll()
  }

  async function saveAdvance() {
    if (!advanceForm.employee_id || !advanceForm.amount) return
    setSaving(true)
    await supabase.from('employee_advances').insert({
      store_id: STORE_ID,
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
    const nightRate = parseFloat(wageForm.night_allowance_rate) || 0
    const existing = wages.find(w => w.employee_id === wageForm.employee_id)
    const payload = {
      store_id: STORE_ID, employee_id: wageForm.employee_id,
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
    if (existing) await supabase.from('employee_wages').update(payload).eq('id', existing.id)
    else await supabase.from('employee_wages').insert(payload)

    // Sync hourly_rate AND night_allowance_rate to employees table
    // so Time & Attendance payroll register always has the correct rates
    await supabase.from('employees').update({
      hourly_rate: hourlyRate,
      night_allowance_rate: nightRate || null,
      pay_frequency: wageForm.pay_frequency,
    }).eq('id', wageForm.employee_id)

    setShowWageModal(false)
    setWageForm({ employee_id: '', hourly_rate: '', night_allowance_rate: '', uif_employee: '0.01', uif_employer: '0.01', tax_rate: '0', pay_frequency: 'monthly', bank_name: '', bank_account: '', bank_branch: '', id_number: '' })
    await loadAll()
    setSaving(false)
  }

  const periodRuns = runs.filter(r => r.payroll_period_id === selectedPeriod?.id)
  const totalGross = periodRuns.reduce((s, r) => s + r.gross_pay, 0)
  const totalNet = periodRuns.reduce((s, r) => s + r.net_pay, 0)
  const totalUIF = periodRuns.reduce((s, r) => s + r.uif_employee + r.uif_employer, 0)
  const unpaidAdvances = advances.filter(a => a.repayment_status === 'outstanding' && a.deduct_from_wages)
  const sc = (s: string) => s === 'paid' ? { bg: '#dcfce7', color: '#166534' } : s === 'approved' ? { bg: '#dbeafe', color: '#1e40af' } : { bg: '#f3f4f6', color: '#6b7280' }

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
          <p style={{ fontSize: '15px', color: 'rgba(255,255,255,0.6)', margin: 0 }}>Manage employee wages, advances and payroll settings</p>
        </div>
      </div>

      <main style={{ maxWidth: '1200px', margin: '-60px auto 0', padding: '0 40px 60px', position: 'relative', zIndex: 1 }}>
        <div style={{ background: 'white', borderRadius: '16px', padding: '6px', display: 'inline-flex', gap: '4px', marginBottom: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          {(['payroll', 'advances', 'settings'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={TAB_STYLE(tab === t)}>
              {t === 'payroll' ? '📊 Payroll' : t === 'advances' ? '💵 Advances' : '⚙️ Settings'}
            </button>
          ))}
        </div>

        {loading ? <div style={{ textAlign: 'center', padding: '60px', color: '#9ca3af' }}>Loading...</div> : (<>

          {/* PAYROLL TAB */}
          {tab === 'payroll' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ background: 'white', borderRadius: '20px', border: '1.5px solid #eef2ee', padding: '20px 24px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' as const }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '12px', fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '0.5px', marginBottom: '6px' }}>Pay Period</div>
                  <select value={selectedPeriod?.id || ''} onChange={e => setSelectedPeriod(periods.find(p => p.id === e.target.value) || null)} style={{ border: '1.5px solid #e5e7eb', borderRadius: '10px', padding: '8px 12px', fontSize: '14px', fontWeight: '700', outline: 'none', background: 'white', minWidth: '280px' }}>
                    {periods.length === 0 && <option value="">No periods yet — create one</option>}
                    {periods.map(p => <option key={p.id} value={p.id}>{new Date(p.period_start).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })} – {new Date(p.period_end).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })} ({p.status})</option>)}
                  </select>
                </div>
                {selectedPeriod && <span style={{ fontSize: '12px', fontWeight: '700', padding: '4px 12px', borderRadius: '100px', background: sc(selectedPeriod.status).bg, color: sc(selectedPeriod.status).color }}>{selectedPeriod.status.toUpperCase()}</span>}
                <button onClick={() => setShowNewPeriod(true)} style={{ padding: '10px 18px', background: '#1a5c38', color: 'white', border: 'none', borderRadius: '10px', fontSize: '13px', fontWeight: '800', cursor: 'pointer' }}>+ New Period</button>
              </div>

              {selectedPeriod && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                  {[
                    { label: 'Total Gross Pay', value: formatCurrency(totalGross), color: '#111', border: '#eef2ee' },
                    { label: 'Total UIF', value: formatCurrency(totalUIF), color: '#d97706', border: '#fde68a' },
                    { label: 'Total Net Pay', value: formatCurrency(totalNet), color: '#1a5c38', border: '#bbf7d0' },
                  ].map((k, i) => (
                    <div key={i} style={{ background: 'white', borderRadius: '20px', border: `1.5px solid ${k.border}`, padding: '24px', textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                      <div style={{ fontSize: '24px', fontWeight: '800', color: k.color }}>{k.value}</div>
                      <div style={{ fontSize: '13px', color: '#9ca3af', marginTop: '4px' }}>{k.label}</div>
                    </div>
                  ))}
                </div>
              )}

              {selectedPeriod && selectedPeriod.status === 'open' && (
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button onClick={calculatePayroll} disabled={calculating} style={{ padding: '12px 24px', background: calculating ? '#d1d5db' : '#1a5c38', color: 'white', border: 'none', borderRadius: '12px', fontSize: '14px', fontWeight: '800', cursor: calculating ? 'not-allowed' : 'pointer' }}>
                    {calculating ? '⏳ Calculating...' : '⚡ Calculate from Attendance'}
                  </button>
                  {periodRuns.length > 0 && (
                    <button onClick={approvePeriod} style={{ padding: '12px 24px', background: '#1d4ed8', color: 'white', border: 'none', borderRadius: '12px', fontSize: '14px', fontWeight: '800', cursor: 'pointer' }}>✓ Approve Payroll</button>
                  )}
                </div>
              )}
              {selectedPeriod && selectedPeriod.status === 'approved' && (
                <button onClick={markPaid} style={{ padding: '12px 24px', background: '#16a34a', color: 'white', border: 'none', borderRadius: '12px', fontSize: '14px', fontWeight: '800', cursor: 'pointer', width: 'fit-content' }}>💳 Mark as Paid</button>
              )}

              {selectedPeriod && periodRuns.length > 0 && (
                <div style={{ background: 'white', borderRadius: '20px', border: '1.5px solid #eef2ee', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                  <div style={{ padding: '16px 24px', borderBottom: '1px solid #f3f4f6', fontWeight: '800', fontSize: '15px', color: '#111' }}>Employee Breakdown</div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ background: '#f9fafb' }}>
                          {['Employee', 'Hours', 'Rate', 'Gross', 'UIF', 'PAYE', 'Advances', 'Net Pay', 'Status', ''].map(h => (
                            <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: '11px', fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '0.5px', whiteSpace: 'nowrap' as const }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {periodRuns.map(run => {
                          const emp = employees.find(e => e.id === run.employee_id)
                          const s = sc(run.status)
                          return (
                            <tr key={run.id} style={{ borderTop: '1px solid #f3f4f6' }}>
                              <td style={{ padding: '14px 16px' }}>
                                <div style={{ fontWeight: '700', fontSize: '14px', color: '#111' }}>{emp?.full_name || '—'}</div>
                                <div style={{ fontSize: '12px', color: '#9ca3af' }}>{emp?.role}</div>
                              </td>
                              <td style={{ padding: '14px 16px', fontSize: '14px', color: '#374151', fontWeight: '600' }}>{formatHours(run.hours_worked)}</td>
                              <td style={{ padding: '14px 16px', fontSize: '14px', color: '#374151' }}>R {run.hourly_rate.toFixed(2)}/h</td>
                              <td style={{ padding: '14px 16px', fontSize: '14px', color: '#111', fontWeight: '700' }}>{formatCurrency(run.gross_pay)}</td>
                              <td style={{ padding: '14px 16px', fontSize: '14px', color: '#d97706' }}>{formatCurrency(run.uif_employee)}</td>
                              <td style={{ padding: '14px 16px', fontSize: '14px', color: '#dc2626' }}>{formatCurrency(run.paye_tax)}</td>
                              <td style={{ padding: '14px 16px', fontSize: '14px', color: '#7c3aed' }}>{formatCurrency(run.advances_deducted)}</td>
                              <td style={{ padding: '14px 16px', fontSize: '15px', color: '#1a5c38', fontWeight: '800' }}>{formatCurrency(run.net_pay)}</td>
                              <td style={{ padding: '14px 16px' }}><span style={{ fontSize: '11px', fontWeight: '700', padding: '3px 10px', borderRadius: '100px', background: s.bg, color: s.color }}>{run.status}</span></td>
                              <td style={{ padding: '14px 16px' }}><button onClick={() => setShowSlip(run)} style={{ fontSize: '12px', color: '#1d4ed8', background: '#eff6ff', border: 'none', borderRadius: '8px', padding: '5px 10px', cursor: 'pointer', fontWeight: '600' }}>Slip</button></td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {selectedPeriod && periodRuns.length === 0 && (
                <div style={{ background: 'white', borderRadius: '20px', border: '1.5px solid #eef2ee', padding: '48px', textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                  <div style={{ fontSize: '48px', marginBottom: '12px' }}>⚡</div>
                  <div style={{ fontSize: '16px', fontWeight: '700', color: '#111', marginBottom: '6px' }}>No payroll calculated yet</div>
                  <div style={{ fontSize: '13px', color: '#9ca3af' }}>Click &quot;Calculate from Attendance&quot; to pull hours and compute wages</div>
                </div>
              )}
            </div>
          )}

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
                {advances.filter(a => a.repayment_status === 'paid').length > 0 && (
                  <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 10, padding: 12, marginBottom: 16, fontSize: 13, color: '#92400e' }}>
                    <strong>⚠ Incorrectly settled advances?</strong> If advances were marked paid by a calculate run (not by actual payment), use the Revert button below to reset them to Outstanding.
                  </div>
                )}
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
                      {['Employee', 'Role', 'Hourly Rate', 'Night Rate', 'UIF %', 'PAYE %', 'Pay Freq', ''].map(h => (
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
                          <td style={{ padding: '14px 16px', fontSize: '14px', color: '#374151' }}>{(emp as any).night_allowance_rate ? `R ${parseFloat((emp as any).night_allowance_rate).toFixed(2)}/h` : <span style={{ color: '#d1d5db' }}>—</span>}</td>
                          <td style={{ padding: '14px 20px', fontSize: '13px', color: '#374151' }}>{wage ? `${(wage.uif_employee * 100).toFixed(1)}%` : '—'}</td>
                          <td style={{ padding: '14px 20px', fontSize: '13px', color: '#374151' }}>{wage ? `${(wage.tax_rate * 100).toFixed(1)}%` : '—'}</td>
                          <td style={{ padding: '14px 20px', fontSize: '13px', color: '#374151' }}>{wage?.pay_frequency || '—'}</td>
                          <td style={{ padding: '14px 20px' }}>
                            <button onClick={() => {
                              setWageForm({ employee_id: emp.id, hourly_rate: wage?.hourly_rate?.toString() || '', night_allowance_rate: (emp as any).night_allowance_rate?.toString() || '', uif_employee: wage?.uif_employee?.toString() || '0.01', uif_employer: wage?.uif_employer?.toString() || '0.01', tax_rate: wage?.tax_rate?.toString() || '0', pay_frequency: wage?.pay_frequency || 'monthly', bank_name: wage?.bank_name || '', bank_account: wage?.bank_account || '', bank_branch: wage?.bank_branch || '', id_number: wage?.id_number || '' })
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

      {/* New Period Modal */}
      {showNewPeriod && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '16px' }}>
          <div style={{ background: 'white', borderRadius: '24px', width: '100%', maxWidth: '440px', boxShadow: '0 24px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ padding: '24px 28px 16px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '800', color: '#111', margin: 0 }}>New Pay Period</h2>
              <button onClick={() => setShowNewPeriod(false)} style={{ background: '#f3f4f6', border: 'none', borderRadius: '8px', width: '32px', height: '32px', cursor: 'pointer', fontSize: '16px' }}>✕</button>
            </div>
            <div style={{ padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div><label style={LABEL_STYLE}>Pay Frequency</label><select value={periodForm.pay_frequency} onChange={e => setPeriodForm(f => ({ ...f, pay_frequency: e.target.value }))} style={INPUT_STYLE}><option value="weekly">Weekly</option><option value="biweekly">Bi-weekly</option><option value="monthly">Monthly</option></select></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div><label style={LABEL_STYLE}>Start Date</label><input type="date" value={periodForm.period_start} onChange={e => setPeriodForm(f => ({ ...f, period_start: e.target.value }))} style={INPUT_STYLE} /></div>
                <div><label style={LABEL_STYLE}>End Date</label><input type="date" value={periodForm.period_end} onChange={e => setPeriodForm(f => ({ ...f, period_end: e.target.value }))} style={INPUT_STYLE} /></div>
              </div>
            </div>
            <div style={{ padding: '16px 28px 24px', display: 'flex', gap: '12px' }}>
              <button onClick={() => setShowNewPeriod(false)} style={{ flex: 1, border: '1.5px solid #e5e7eb', color: '#374151', borderRadius: '12px', padding: '12px', fontSize: '14px', fontWeight: '700', cursor: 'pointer', background: 'white' }}>Cancel</button>
              <button onClick={createPeriod} disabled={saving} style={{ flex: 1, background: '#1a5c38', color: 'white', border: 'none', borderRadius: '12px', padding: '12px', fontSize: '14px', fontWeight: '800', cursor: 'pointer' }}>Create Period</button>
            </div>
          </div>
        </div>
      )}

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
                <div><label style={LABEL_STYLE}>Night Allowance Rate (R/hr)</label><input type="number" step="0.01" value={wageForm.night_allowance_rate} onChange={e => setWageForm(f => ({ ...f, night_allowance_rate: e.target.value }))} placeholder="e.g. 5.00 extra per night hour" style={INPUT_STYLE} /><div style={{ fontSize: '11px', color: '#9ca3af', marginTop: 4 }}>Extra rate added per hour worked during night hours (on top of hourly rate)</div></div>
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

      {/* Wage Slip Modal */}
      {showSlip && (() => {
        const emp = employees.find(e => e.id === showSlip.employee_id)
        const wage = wages.find(w => w.employee_id === showSlip.employee_id)
        const period = periods.find(p => p.id === showSlip.payroll_period_id)
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '16px' }}>
            <div style={{ background: 'white', borderRadius: '20px', width: '100%', maxWidth: '560px', boxShadow: '0 24px 60px rgba(0,0,0,0.3)', maxHeight: '90vh', overflowY: 'auto' }}>
              <div style={{ background: 'linear-gradient(135deg, #0a1f12, #1a5c38)', padding: '28px 32px', borderRadius: '20px 20px 0 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontSize: '20px', fontWeight: '900', color: 'white', letterSpacing: '-0.5px' }}>WAGE SLIP</div>
                    <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)', marginTop: '4px' }}>Mochachos Hartswater (Pty) Ltd</div>
                  </div>
                  <button onClick={() => setShowSlip(null)} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '8px', width: '32px', height: '32px', cursor: 'pointer', fontSize: '16px', color: 'white' }}>✕</button>
                </div>
              </div>
              <div style={{ padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div style={{ background: '#f9fafb', borderRadius: '12px', padding: '14px 16px' }}>
                    <div style={{ fontSize: '11px', fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '0.5px', marginBottom: '6px' }}>Employee</div>
                    <div style={{ fontWeight: '800', fontSize: '15px', color: '#111' }}>{emp?.full_name}</div>
                    <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>{emp?.role}</div>
                    {wage?.id_number && <div style={{ fontSize: '12px', color: '#6b7280' }}>ID: {wage.id_number}</div>}
                  </div>
                  <div style={{ background: '#f9fafb', borderRadius: '12px', padding: '14px 16px' }}>
                    <div style={{ fontSize: '11px', fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '0.5px', marginBottom: '6px' }}>Pay Period</div>
                    <div style={{ fontWeight: '700', fontSize: '14px', color: '#111' }}>{period ? new Date(period.period_start).toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' }) : '—'}</div>
                    <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>{period ? `${new Date(period.period_start).toLocaleDateString('en-ZA')} – ${new Date(period.period_end).toLocaleDateString('en-ZA')}` : '—'}</div>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '12px', fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '0.5px', marginBottom: '10px' }}>Earnings</div>
                  <div style={{ background: '#f9fafb', borderRadius: '12px', overflow: 'hidden' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid #e5e7eb' }}>
                      <span style={{ fontSize: '14px', color: '#374151' }}>Basic Pay ({formatHours(showSlip.hours_worked)} × R{showSlip.hourly_rate.toFixed(2)}/h)</span>
                      <span style={{ fontSize: '14px', fontWeight: '700', color: '#111' }}>{formatCurrency(showSlip.gross_pay)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', background: '#f0fdf4' }}>
                      <span style={{ fontSize: '14px', fontWeight: '700', color: '#166534' }}>Gross Pay</span>
                      <span style={{ fontSize: '15px', fontWeight: '800', color: '#166534' }}>{formatCurrency(showSlip.gross_pay)}</span>
                    </div>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '12px', fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '0.5px', marginBottom: '10px' }}>Deductions</div>
                  <div style={{ background: '#f9fafb', borderRadius: '12px', overflow: 'hidden' }}>
                    {[
                      { label: 'UIF (Employee 1%)', value: showSlip.uif_employee },
                      { label: 'PAYE Tax', value: showSlip.paye_tax },
                      { label: 'Advances Deducted', value: showSlip.advances_deducted },
                    ].map((row, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid #e5e7eb' }}>
                        <span style={{ fontSize: '14px', color: '#374151' }}>{row.label}</span>
                        <span style={{ fontSize: '14px', fontWeight: '700', color: '#dc2626' }}>- {formatCurrency(row.value)}</span>
                      </div>
                    ))}
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', background: '#fef2f2' }}>
                      <span style={{ fontSize: '14px', fontWeight: '700', color: '#991b1b' }}>Total Deductions</span>
                      <span style={{ fontSize: '15px', fontWeight: '800', color: '#991b1b' }}>- {formatCurrency(showSlip.uif_employee + showSlip.paye_tax + showSlip.advances_deducted)}</span>
                    </div>
                  </div>
                </div>
                <div style={{ background: '#eff6ff', borderRadius: '10px', padding: '12px 16px', fontSize: '12px', color: '#1e40af' }}>
                  <strong>Employer UIF Contribution:</strong> {formatCurrency(showSlip.uif_employer)} (paid by employer, not deducted from employee)
                </div>
                <div style={{ background: 'linear-gradient(135deg, #0a1f12, #1a5c38)', borderRadius: '16px', padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '16px', fontWeight: '800', color: 'white' }}>NET PAY</span>
                  <span style={{ fontSize: '28px', fontWeight: '900', color: 'white' }}>{formatCurrency(showSlip.net_pay)}</span>
                </div>
                {(wage?.bank_name || wage?.bank_account) && (
                  <div style={{ background: '#f9fafb', borderRadius: '12px', padding: '14px 16px' }}>
                    <div style={{ fontSize: '11px', fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '0.5px', marginBottom: '8px' }}>Banking Details</div>
                    {wage?.bank_name && <div style={{ fontSize: '13px', color: '#374151' }}>Bank: <strong>{wage.bank_name}</strong></div>}
                    {wage?.bank_branch && <div style={{ fontSize: '13px', color: '#374151' }}>Branch: <strong>{wage.bank_branch}</strong></div>}
                    {wage?.bank_account && <div style={{ fontSize: '13px', color: '#374151' }}>Account: <strong>{wage.bank_account}</strong></div>}
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', paddingTop: '8px' }}>
                  {['Employee Signature', 'Employer Signature'].map(label => (
                    <div key={label}>
                      <div style={{ borderBottom: '1.5px solid #374151', marginBottom: '6px', height: '32px' }} />
                      <div style={{ fontSize: '11px', color: '#9ca3af', textAlign: 'center' as const }}>{label}</div>
                    </div>
                  ))}
                </div>
                <button onClick={() => window.print()} style={{ width: '100%', padding: '14px', background: '#1a5c38', color: 'white', border: 'none', borderRadius: '12px', fontSize: '14px', fontWeight: '800', cursor: 'pointer' }}>🖨️ Print Wage Slip</button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
