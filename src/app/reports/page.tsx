'use client'
import React, { useState, useCallback } from 'react'
import { getStoreContext } from '@/lib/store-context'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const STORE_ID_DEFAULT = '05328298-fc27-4c9f-b091-bb7f6598b601' // fallback only
const PRIMARY = '#1a5c38'
const DARK = '#0a1f12'

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmt(n: number) { return 'R ' + (n || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }
function today() { return new Date().toISOString().slice(0, 10) }
function monthStart() { return new Date().toISOString().slice(0, 7) + '-01' }
function lastMonthStart() { const d = new Date(); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 7) + '-01' }
function lastMonthEnd() { const d = new Date(); d.setDate(0); return d.toISOString().slice(0, 10) }

// ── CSV / Excel / PDF generators ─────────────────────────────────────────────
function downloadCSV(rows: Record<string, any>[], filename: string) {
  if (!rows.length) { alert('No data found for this period.'); return }
  const headers = Object.keys(rows[0])
  const csv = [headers.join(','), ...rows.map(r => headers.map(h => {
    const v = r[h] ?? ''
    return typeof v === 'string' && (v.includes(',') || v.includes('"') || v.includes('\n'))
      ? `"${v.replace(/"/g, '""')}"` : v
  }).join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
  a.download = filename + '.csv'; a.click()
}

function downloadExcel(sheets: { name: string; rows: Record<string, any>[] }[], filename: string) {
  // Load SheetJS from CDN if not already loaded
  const go = (XLSX: any) => {
    const wb = XLSX.utils.book_new()
    sheets.forEach(s => {
      if (!s.rows.length) return
      const ws = XLSX.utils.json_to_sheet(s.rows)
      // Auto-width columns
      const cols = Object.keys(s.rows[0]).map(k => ({ wch: Math.max(k.length, ...s.rows.map(r => String(r[k] ?? '').length)) + 2 }))
      ws['!cols'] = cols
      XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31))
    })
    XLSX.writeFile(wb, filename + '.xlsx')
  }
  if ((window as any).XLSX) { go((window as any).XLSX); return }
  const script = document.createElement('script')
  script.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
  script.onload = () => go((window as any).XLSX)
  document.head.appendChild(script)
}

function printPDF(title: string, html: string, dateLabel: string) {
  const win = window.open('', '_blank')!
  win.document.write(`<!DOCTYPE html><html><head><title>${title}</title>
<style>
  body{font-family:system-ui,sans-serif;font-size:11px;color:#111;padding:20px}
  h1{font-size:18px;margin:0 0 4px}
  .sub{color:#888;font-size:11px;margin-bottom:16px}
  table{width:100%;border-collapse:collapse;margin-top:12px}
  th{background:#1a5c38;color:#fff;padding:8px 10px;text-align:left;font-size:11px;font-weight:700}
  td{padding:7px 10px;border-bottom:1px solid #f0f0f0;font-size:11px}
  tr:nth-child(even) td{background:#f9fafb}
  .total td{font-weight:800;background:#f0f7f4;border-top:2px solid #1a5c38}
  .footer{margin-top:24px;font-size:10px;color:#aaa;text-align:center}
  @media print{body{padding:10px}}
</style></head><body>
<h1>CompliTrack — ${title}</h1>
<div class="sub">Period: ${dateLabel} &nbsp;|&nbsp; Generated: ${new Date().toLocaleString('en-ZA')}</div>
${html}
<div class="footer">CompliTrack © ${new Date().getFullYear()} · Mochachos Hartswater</div>
<script>window.onload=()=>{window.print()}<\/script>
</body></html>`)
  win.document.close()
}

function tableHTML(rows: Record<string, any>[], totals?: Record<string, any>) {
  if (!rows.length) return '<p style="color:#888">No data for this period.</p>'
  const headers = Object.keys(rows[0])
  return `<table>
    <thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
    <tbody>
      ${rows.map(r => `<tr>${headers.map(h => `<td>${r[h] ?? ''}</td>`).join('')}</tr>`).join('')}
      ${totals ? `<tr class="total">${headers.map(h => `<td>${totals[h] ?? ''}</td>`).join('')}</tr>` : ''}
    </tbody>
  </table>`
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function ReportsPage() {
  const [storeId, setStoreId] = useState('')
  const router = useRouter()
  const [startDate, setStartDate] = useState(lastMonthStart())
  const [endDate, setEndDate] = useState(lastMonthEnd())
  const [loading, setLoading] = useState<string | null>(null)

  const dateLabel = `${startDate} to ${endDate}`

  async function run(key: string, fn: () => Promise<void>) {
    setLoading(key); try { await fn() } catch (e: any) { alert('Error: ' + e.message) } finally { setLoading(null) }
  }

  // ── FINANCIAL REPORTS ──────────────────────────────────────────────────────
  async function salesReport(fmt_: 'csv' | 'excel' | 'pdf') {
    const { data } = await supabase.from('cash_ups').select('cash_up_date,cash_up_total,payment_method,status,cashier_name,notes').eq('store_id', storeId).neq('status', 'draft').gte('cash_up_date', startDate).lte('cash_up_date', endDate).order('cash_up_date')
    const rows = (data || []).map(r => ({ Date: r.cash_up_date, 'Sales (incl VAT)': Number(r.cash_up_total || 0).toFixed(2), 'Sales (ex-VAT)': (Number(r.cash_up_total || 0) / 1.15).toFixed(2), 'VAT (15%)': (Number(r.cash_up_total || 0) * 0.15 / 1.15).toFixed(2), 'Payment Method': r.payment_method || '', Cashier: r.cashier_name || '', Status: r.status || '', Notes: r.notes || '' }))
    const total = (data || []).reduce((s, r) => s + Number(r.cash_up_total || 0), 0)
    const totals = { Date: 'TOTAL', 'Sales (incl VAT)': total.toFixed(2), 'Sales (ex-VAT)': (total / 1.15).toFixed(2), 'VAT (15%)': (total * 0.15 / 1.15).toFixed(2), 'Payment Method': '', Cashier: '', Status: '', Notes: '' }
    if (fmt_ === 'csv') downloadCSV(rows, `Sales_Report_${startDate}`)
    else if (fmt_ === 'excel') downloadExcel([{ name: 'Sales', rows }], `Sales_Report_${startDate}`)
    else printPDF('Cash-Up Sales Report', tableHTML(rows, totals), dateLabel)
  }

  async function expensesReport(fmt_: 'csv' | 'excel' | 'pdf') {
    const [{ data: exp }, { data: inv }] = await Promise.all([
      supabase.from('expenses').select('expense_date,category_name,description,amount,vat_amount,supplier,invoice_number,payment_method').eq('store_id', storeId).gte('expense_date', startDate).lte('expense_date', endDate).order('expense_date'),
      supabase.from('invoices').select('invoice_date,supplier,invoice_number,total_amount,total_vat,status,payment_method').eq('store_id', storeId).in('status', ['received', 'paid']).gte('invoice_date', startDate).lte('invoice_date', endDate).order('invoice_date'),
    ])
    const expRows = (exp || []).map(r => ({ Date: r.expense_date, Type: 'Quick Expense', Category: r.category_name || '', Description: r.description || '', Supplier: r.supplier || '', 'Invoice #': r.invoice_number || '', 'Amount (excl VAT)': Number(r.amount || 0).toFixed(2), VAT: Number(r.vat_amount || 0).toFixed(2), 'Amount (incl VAT)': (Number(r.amount || 0) + Number(r.vat_amount || 0)).toFixed(2), 'Payment Method': r.payment_method || '' }))
    const invRows = (inv || []).map(r => ({ Date: r.invoice_date, Type: 'Supplier Invoice', Category: 'Supplier Bill', Description: '', Supplier: r.supplier || '', 'Invoice #': r.invoice_number || '', 'Amount (excl VAT)': (Number(r.total_amount || 0) - Number(r.total_vat || 0)).toFixed(2), VAT: Number(r.total_vat || 0).toFixed(2), 'Amount (incl VAT)': Number(r.total_amount || 0).toFixed(2), 'Payment Method': r.payment_method || '' }))
    const rows = [...expRows, ...invRows].sort((a, b) => a.Date.localeCompare(b.Date))
    if (fmt_ === 'csv') downloadCSV(rows, `Expenses_Report_${startDate}`)
    else if (fmt_ === 'excel') downloadExcel([{ name: 'Expenses', rows: expRows }, { name: 'Supplier Invoices', rows: invRows }], `Expenses_Report_${startDate}`)
    else printPDF('Expenses Report', tableHTML(rows), dateLabel)
  }

  async function invoiceReport(fmt_: 'csv' | 'excel' | 'pdf') {
    const { data: invs } = await supabase.from('invoices').select('invoice_date,due_date,supplier,invoice_number,total_amount,total_vat,status,payment_method,notes').eq('store_id', storeId).gte('invoice_date', startDate).lte('invoice_date', endDate).order('invoice_date')
    const rows = (invs || []).map(r => ({ Date: r.invoice_date, 'Due Date': r.due_date || '', Supplier: r.supplier || '', 'Invoice #': r.invoice_number || '', Status: r.status || '', 'Total (excl VAT)': (Number(r.total_amount || 0) - Number(r.total_vat || 0)).toFixed(2), VAT: Number(r.total_vat || 0).toFixed(2), 'Total (incl VAT)': Number(r.total_amount || 0).toFixed(2), 'Payment Method': r.payment_method || '', Notes: r.notes || '' }))
    if (fmt_ === 'csv') downloadCSV(rows, `Invoices_${startDate}`)
    else if (fmt_ === 'excel') downloadExcel([{ name: 'Invoices', rows }], `Invoices_${startDate}`)
    else printPDF('Supplier Invoice Report', tableHTML(rows), dateLabel)
  }

  async function outstandingBillsReport(fmt_: 'csv' | 'excel' | 'pdf') {
    const { data } = await supabase.from('invoices').select('invoice_date,due_date,supplier,invoice_number,total_amount,notes').eq('store_id', storeId).eq('status', 'received').order('due_date', { ascending: true, nullsFirst: false })
    const today_ = today()
    const rows = (data || []).map(r => ({ Supplier: r.supplier || '', 'Invoice #': r.invoice_number || '', 'Invoice Date': r.invoice_date, 'Due Date': r.due_date || 'No due date', 'Days Overdue': r.due_date && r.due_date < today_ ? Math.round((new Date(today_).getTime() - new Date(r.due_date).getTime()) / 86400000) : 0, 'Amount (incl VAT)': Number(r.total_amount || 0).toFixed(2), Notes: r.notes || '' }))
    const total = (data || []).reduce((s, r) => s + Number(r.total_amount || 0), 0)
    if (fmt_ === 'csv') downloadCSV(rows, `Outstanding_Bills`)
    else if (fmt_ === 'excel') downloadExcel([{ name: 'Outstanding Bills', rows }], `Outstanding_Bills`)
    else printPDF('Outstanding Bills', tableHTML(rows, { Supplier: 'TOTAL', 'Invoice #': '', 'Invoice Date': '', 'Due Date': '', 'Days Overdue': '', 'Amount (incl VAT)': total.toFixed(2), Notes: '' }), 'As of ' + today_)
  }

  // ── LABOUR / PAYROLL ───────────────────────────────────────────────────────
  async function payrollReport(fmt_: 'csv' | 'excel' | 'pdf') {
    const { data } = await supabase.from('wage_payments').select('paid_date,payment_method,gross_pay,net_pay,uif_employee,uif_employer,employee_id,period').eq('store_id', storeId).gte('paid_date', startDate).lte('paid_date', endDate).order('paid_date')
    const empIds = [...new Set((data || []).map(r => r.employee_id).filter(Boolean))]
    const { data: emps } = empIds.length ? await supabase.from('employees').select('id,full_name,id_number,role').in('id', empIds) : { data: [] }
    const empMap: Record<string, any> = {}; (emps || []).forEach(e => empMap[e.id] = e)
    const rows = (data || []).map(r => { const e = empMap[r.employee_id] || {}; return { Period: r.period, 'Pay Date': r.paid_date, 'Employee': e.full_name || r.employee_id || '', 'ID Number': e.id_number || '', Role: e.role || '', 'Gross Pay': Number(r.gross_pay || 0).toFixed(2), 'UIF Employee': Number(r.uif_employee || 0).toFixed(2), 'Net Pay': Number(r.net_pay || 0).toFixed(2), 'UIF Employer': Number(r.uif_employer || 0).toFixed(2), 'Payment Method': r.payment_method || '' } })
    const grossTotal = (data || []).reduce((s, r) => s + Number(r.gross_pay || 0), 0)
    const netTotal = (data || []).reduce((s, r) => s + Number(r.net_pay || 0), 0)
    const uifEmpTotal = (data || []).reduce((s, r) => s + Number(r.uif_employee || 0), 0)
    const uifErTotal = (data || []).reduce((s, r) => s + Number(r.uif_employer || 0), 0)
    const totals = { Period: 'TOTAL', 'Pay Date': '', Employee: '', 'ID Number': '', Role: '', 'Gross Pay': grossTotal.toFixed(2), 'UIF Employee': uifEmpTotal.toFixed(2), 'Net Pay': netTotal.toFixed(2), 'UIF Employer': uifErTotal.toFixed(2), 'Payment Method': '' }
    if (fmt_ === 'csv') downloadCSV(rows, `Payroll_${startDate}`)
    else if (fmt_ === 'excel') downloadExcel([{ name: 'Payroll', rows }], `Payroll_${startDate}`)
    else printPDF('Monthly Payroll Report', tableHTML(rows, totals), dateLabel)
  }

  async function attendanceReport(fmt_: 'csv' | 'excel' | 'pdf') {
    const { data } = await supabase.from('attendance').select('work_date,clock_in,clock_out,hours_worked,is_late,employee_id').eq('store_id', storeId).gte('work_date', startDate).lte('work_date', endDate).order('work_date')
    const empIds = [...new Set((data || []).map(r => r.employee_id).filter(Boolean))]
    const { data: emps } = empIds.length ? await supabase.from('employees').select('id,full_name,role').in('id', empIds) : { data: [] }
    const empMap: Record<string, any> = {}; (emps || []).forEach(e => empMap[e.id] = e)
    const rows = (data || []).map(r => { const e = empMap[r.employee_id] || {}; const h = Number(r.hours_worked || 0); return { Date: r.work_date, Employee: e.full_name || '', Role: e.role || '', 'Clock In': r.clock_in || '', 'Clock Out': r.clock_out || '', Hours: h.toFixed(2), 'Hrs (formatted)': `${Math.floor(h)}h ${Math.round((h % 1) * 60)}m`, Late: r.is_late ? 'Yes' : 'No' } })
    if (fmt_ === 'csv') downloadCSV(rows, `Attendance_${startDate}`)
    else if (fmt_ === 'excel') downloadExcel([{ name: 'Attendance', rows }], `Attendance_${startDate}`)
    else printPDF('Attendance Register', tableHTML(rows), dateLabel)
  }

  async function uifReport(fmt_: 'csv' | 'excel' | 'pdf') {
    const { data } = await supabase.from('wage_payments').select('period,gross_pay,uif_employee,uif_employer,employee_id').eq('store_id', storeId).gte('paid_date', startDate).lte('paid_date', endDate)
    const empIds = [...new Set((data || []).map(r => r.employee_id).filter(Boolean))]
    const { data: emps } = empIds.length ? await supabase.from('employees').select('id,full_name,id_number').in('id', empIds) : { data: [] }
    const empMap: Record<string, any> = {}; (emps || []).forEach(e => empMap[e.id] = e)
    const rows = (data || []).map(r => { const e = empMap[r.employee_id] || {}; return { Period: r.period, 'Employee Name': e.full_name || '', 'ID Number': e.id_number || '', 'Gross Remuneration': Number(r.gross_pay || 0).toFixed(2), 'UIF Employee (1%)': Number(r.uif_employee || 0).toFixed(2), 'UIF Employer (1%)': Number(r.uif_employer || 0).toFixed(2), 'Total UIF': (Number(r.uif_employee || 0) + Number(r.uif_employer || 0)).toFixed(2) } })
    const total = (data || []).reduce((s, r) => s + Number(r.uif_employee || 0) + Number(r.uif_employer || 0), 0)
    if (fmt_ === 'csv') downloadCSV(rows, `UIF_Schedule_${startDate}`)
    else if (fmt_ === 'excel') downloadExcel([{ name: 'UIF Schedule', rows }], `UIF_Schedule_${startDate}`)
    else printPDF('UIF Schedule (for SARS)', tableHTML(rows, { Period: 'TOTAL', 'Employee Name': '', 'ID Number': '', 'Gross Remuneration': '', 'UIF Employee (1%)': '', 'UIF Employer (1%)': '', 'Total UIF': total.toFixed(2) }), dateLabel)
  }

  // ── STOCK REPORTS ──────────────────────────────────────────────────────────
  async function stockValuationReport(fmt_: 'csv' | 'excel' | 'pdf') {
    const { data } = await supabase.from('stock_items').select('name,description,unit,current_qty,cost_price,price,supplier,category').eq('store_id', storeId).eq('is_active', true).order('name')
    const rows = (data || []).map(r => ({ Item: r.description || r.name || '', Unit: r.unit || '', Supplier: r.supplier || '', 'On Hand': Number(r.current_qty || 0).toFixed(3), 'Cost Price': Number(r.cost_price || r.price || 0).toFixed(2), 'Total Value': (Number(r.current_qty || 0) * Number(r.cost_price || r.price || 0)).toFixed(2) }))
    const totalValue = rows.reduce((s, r) => s + parseFloat(r['Total Value']), 0)
    if (fmt_ === 'csv') downloadCSV(rows, `Stock_Valuation_${today()}`)
    else if (fmt_ === 'excel') downloadExcel([{ name: 'Stock Valuation', rows }], `Stock_Valuation_${today()}`)
    else printPDF('Stock Valuation Report', tableHTML(rows, { Item: 'TOTAL STOCK VALUE', Unit: '', Supplier: '', 'On Hand': '', 'Cost Price': '', 'Total Value': totalValue.toFixed(2) }), 'As of ' + today())
  }

  async function purchasesReport(fmt_: 'csv' | 'excel' | 'pdf') {
    const { data } = await supabase.from('stock_purchases').select('purchase_date,stock_item_id,item_name,qty_received,unit,unit_cost,total_cost,supplier').eq('store_id', storeId).gte('purchase_date', startDate).lte('purchase_date', endDate).order('purchase_date')
    const rows = (data || []).map(r => ({ Date: r.purchase_date, Item: r.item_name || '', Supplier: r.supplier || '', 'Qty Received': Number(r.qty_received || 0).toFixed(3), Unit: r.unit || '', 'Unit Cost': Number(r.unit_cost || 0).toFixed(4), 'Total Cost': Number(r.total_cost || 0).toFixed(2) }))
    const total = (data || []).reduce((s, r) => s + Number(r.total_cost || 0), 0)
    if (fmt_ === 'csv') downloadCSV(rows, `Purchases_${startDate}`)
    else if (fmt_ === 'excel') downloadExcel([{ name: 'Purchases (GRV)', rows }], `Purchases_${startDate}`)
    else printPDF('Stock Purchases / GRV Report', tableHTML(rows, { Date: 'TOTAL', Item: '', Supplier: '', 'Qty Received': '', Unit: '', 'Unit Cost': '', 'Total Cost': total.toFixed(2) }), dateLabel)
  }

  async function wastageReport(fmt_: 'csv' | 'excel' | 'pdf') {
    const { data } = await supabase.from('stock_wastage').select('wastage_date,item_name,qty,unit,unit_cost,total_cost,reason,recorded_by').eq('store_id', storeId).gte('wastage_date', startDate).lte('wastage_date', endDate).order('wastage_date')
    const rows = (data || []).map(r => ({ Date: r.wastage_date, Item: r.item_name || '', Qty: Number(r.qty || 0).toFixed(3), Unit: r.unit || '', 'Unit Cost': Number(r.unit_cost || 0).toFixed(4), 'Total Loss': Number(r.total_cost || 0).toFixed(2), Reason: r.reason || '', 'Recorded By': r.recorded_by || '' }))
    const total = (data || []).reduce((s, r) => s + Number(r.total_cost || 0), 0)
    if (fmt_ === 'csv') downloadCSV(rows, `Wastage_${startDate}`)
    else if (fmt_ === 'excel') downloadExcel([{ name: 'Wastage', rows }], `Wastage_${startDate}`)
    else printPDF('Stock Wastage Report', tableHTML(rows, { Date: 'TOTAL', Item: '', Qty: '', Unit: '', 'Unit Cost': '', 'Total Loss': total.toFixed(2), Reason: '', 'Recorded By': '' }), dateLabel)
  }

  async function stockMovementReport(fmt_: 'csv' | 'excel' | 'pdf') {
    const [{ data: purchases }, { data: issues }, { data: wastage }] = await Promise.all([
      supabase.from('stock_purchases').select('purchase_date,item_name,qty_received,unit,total_cost').eq('store_id', storeId).gte('purchase_date', startDate).lte('purchase_date', endDate),
      supabase.from('stock_issues').select('issue_date,item_name,quantity,unit,issued_to').eq('store_id', storeId).gte('issue_date', startDate).lte('issue_date', endDate),
      supabase.from('stock_wastage').select('wastage_date,item_name,qty,unit,total_cost').eq('store_id', storeId).gte('wastage_date', startDate).lte('wastage_date', endDate),
    ])
    const purchRows = (purchases || []).map(r => ({ Date: r.purchase_date, Type: 'IN — Purchase', Item: r.item_name || '', Qty: `+${Number(r.qty_received || 0).toFixed(3)}`, Unit: r.unit || '', Value: Number(r.total_cost || 0).toFixed(2), Notes: '' }))
    const issueRows = (issues || []).map(r => ({ Date: r.issue_date, Type: 'OUT — Issue', Item: r.item_name || '', Qty: `-${Number(r.quantity || 0).toFixed(3)}`, Unit: r.unit || '', Value: '', Notes: r.issued_to || '' }))
    const wastRows = (wastage || []).map(r => ({ Date: r.wastage_date, Type: 'OUT — Wastage', Item: r.item_name || '', Qty: `-${Number(r.qty || 0).toFixed(3)}`, Unit: r.unit || '', Value: Number(r.total_cost || 0).toFixed(2), Notes: '' }))
    const rows = [...purchRows, ...issueRows, ...wastRows].sort((a, b) => a.Date.localeCompare(b.Date))
    if (fmt_ === 'csv') downloadCSV(rows, `Stock_Movement_${startDate}`)
    else if (fmt_ === 'excel') downloadExcel([{ name: 'All Movements', rows }, { name: 'Purchases', rows: purchRows }, { name: 'Issues', rows: issueRows }, { name: 'Wastage', rows: wastRows }], `Stock_Movement_${startDate}`)
    else printPDF('Stock Movement Report', tableHTML(rows), dateLabel)
  }

  // ── COMPLIANCE REPORTS ────────────────────────────────────────────────────
  async function complianceReport(fmt_: 'csv' | 'excel' | 'pdf') {
    const { data: sessions } = await supabase.from('daily_sessions').select('id,session_date,status,duration_seconds,session_type').eq('store_id', storeId).eq('session_type', 'daily').gte('session_date', startDate).lte('session_date', endDate).order('session_date')
    const rows = await Promise.all((sessions || []).map(async s => {
      const [{ data: total }, { data: done }] = await Promise.all([
        supabase.from('checklist_items').select('id', { count: 'exact' }).eq('session_id', s.id),
        supabase.from('checklist_items').select('id', { count: 'exact' }).eq('session_id', s.id).eq('completed', true),
      ])
      const t = total?.length || 0, d = done?.length || 0, p = t > 0 ? Math.round(d / t * 100) : 0
      const dur = s.duration_seconds ? `${Math.floor(s.duration_seconds / 60)}m` : ''
      return { Date: s.session_date, Status: s.status || '', 'Tasks Completed': `${d}/${t}`, 'Compliance %': p + '%', Duration: dur, Result: p >= 90 ? 'PASS' : p >= 70 ? 'PARTIAL' : 'FAIL' }
    }))
    const avg = rows.length ? Math.round(rows.reduce((s, r) => s + parseInt(r['Compliance %']), 0) / rows.length) : 0
    if (fmt_ === 'csv') downloadCSV(rows, `Compliance_${startDate}`)
    else if (fmt_ === 'excel') downloadExcel([{ name: 'Compliance', rows }], `Compliance_${startDate}`)
    else printPDF('Compliance Session Report', tableHTML(rows, { Date: `AVG ${avg}%`, Status: '', 'Tasks Completed': '', 'Compliance %': avg + '%', Duration: '', Result: avg >= 90 ? 'PASS' : 'PARTIAL' }), dateLabel)
  }

  async function temperatureReport(fmt_: 'csv' | 'excel' | 'pdf') {
    const { data } = await supabase.from('temperature_logs').select('logged_at,equipment_name,temperature,min_temp,max_temp,is_compliant,notes,logged_by').eq('store_id', storeId).gte('logged_at', startDate).lte('logged_at', endDate + 'T23:59:59').order('logged_at')
    const rows = (data || []).map(r => ({ 'Date/Time': r.logged_at?.replace('T', ' ').slice(0, 16) || '', Equipment: r.equipment_name || '', 'Temp (°C)': r.temperature, 'Min (°C)': r.min_temp || '', 'Max (°C)': r.max_temp || '', Compliant: r.is_compliant ? 'Yes' : 'No', Notes: r.notes || '', 'Logged By': r.logged_by || '' }))
    const violations = rows.filter(r => r.Compliant === 'No').length
    if (fmt_ === 'csv') downloadCSV(rows, `Temperature_Log_${startDate}`)
    else if (fmt_ === 'excel') downloadExcel([{ name: 'Temperature Log', rows }], `Temperature_Log_${startDate}`)
    else printPDF(`Temperature Log (${violations} violations)`, tableHTML(rows), dateLabel)
  }

  // ── HR REPORTS ─────────────────────────────────────────────────────────────
  async function employeeListReport(fmt_: 'csv' | 'excel' | 'pdf') {
    const { data } = await supabase.from('employees').select('full_name,id_number,role,phone,email,hourly_rate,pay_frequency,is_active').eq('store_id', storeId).order('full_name')
    const rows = (data || []).map(r => ({ Name: r.full_name || '', 'ID Number': r.id_number || '', Role: r.role || '', Phone: r.phone || '', Email: r.email || '', 'Hourly Rate': Number(r.hourly_rate || 0).toFixed(2), 'Pay Frequency': r.pay_frequency || '', Active: r.is_active ? 'Yes' : 'No' }))
    if (fmt_ === 'csv') downloadCSV(rows, `Employees_${today()}`)
    else if (fmt_ === 'excel') downloadExcel([{ name: 'Employees', rows }], `Employees_${today()}`)
    else printPDF('Employee List', tableHTML(rows), 'As of ' + today())
  }

  async function leaveReport(fmt_: 'csv' | 'excel' | 'pdf') {
    const { data } = await supabase.from('employee_leave').select('employee_id,leave_type,start_date,end_date,status,paid_hours_per_day,notes').gte('start_date', startDate).lte('end_date', endDate).order('start_date')
    const empIds = [...new Set((data || []).map(r => r.employee_id).filter(Boolean))]
    const { data: emps } = empIds.length ? await supabase.from('employees').select('id,full_name').in('id', empIds) : { data: [] }
    const empMap: Record<string, string> = {}; (emps || []).forEach(e => empMap[e.id] = e.full_name)
    const rows = (data || []).map(r => ({ Employee: empMap[r.employee_id] || '', 'Leave Type': r.leave_type || '', 'Start Date': r.start_date, 'End Date': r.end_date, Status: r.status || '', 'Paid Hours/Day': r.paid_hours_per_day || 0, Notes: r.notes || '' }))
    if (fmt_ === 'csv') downloadCSV(rows, `Leave_${startDate}`)
    else if (fmt_ === 'excel') downloadExcel([{ name: 'Leave', rows }], `Leave_${startDate}`)
    else printPDF('Leave Summary', tableHTML(rows), dateLabel)
  }

  // ── COMBINED ACCOUNTANT PACK ───────────────────────────────────────────────
  async function accountantPack() {
    const [salesRes, expRes, invRes, payrollRes, purchRes, wastRes] = await Promise.all([
      supabase.from('cash_ups').select('cash_up_date,cash_up_total').eq('store_id', storeId).neq('status', 'draft').gte('cash_up_date', startDate).lte('cash_up_date', endDate).order('cash_up_date'),
      supabase.from('expenses').select('expense_date,category_name,description,amount,vat_amount,supplier,invoice_number').eq('store_id', storeId).gte('expense_date', startDate).lte('expense_date', endDate).order('expense_date'),
      supabase.from('invoices').select('invoice_date,supplier,invoice_number,total_amount,total_vat,status').eq('store_id', storeId).in('status', ['received', 'paid']).gte('invoice_date', startDate).lte('invoice_date', endDate).order('invoice_date'),
      supabase.from('wage_payments').select('paid_date,period,gross_pay,net_pay,uif_employee,uif_employer,employee_id').eq('store_id', storeId).gte('paid_date', startDate).lte('paid_date', endDate).order('paid_date'),
      supabase.from('stock_purchases').select('purchase_date,item_name,qty_received,unit,unit_cost,total_cost,supplier').eq('store_id', storeId).gte('purchase_date', startDate).lte('purchase_date', endDate).order('purchase_date'),
      supabase.from('stock_wastage').select('wastage_date,item_name,qty,unit,total_cost,reason').eq('store_id', storeId).gte('wastage_date', startDate).lte('wastage_date', endDate).order('wastage_date'),
    ])
    const empIds = [...new Set((payrollRes.data || []).map(r => r.employee_id).filter(Boolean))]
    const { data: emps } = empIds.length ? await supabase.from('employees').select('id,full_name,id_number').in('id', empIds) : { data: [] }
    const empMap: Record<string, any> = {}; (emps || []).forEach(e => empMap[e.id] = e)

    const sheets = [
      { name: 'Sales', rows: (salesRes.data || []).map(r => ({ Date: r.cash_up_date, 'Sales Incl VAT': Number(r.cash_up_total || 0).toFixed(2), 'Sales Ex-VAT': (Number(r.cash_up_total || 0) / 1.15).toFixed(2), 'VAT': (Number(r.cash_up_total || 0) * 0.15 / 1.15).toFixed(2) })) },
      { name: 'Quick Expenses', rows: (expRes.data || []).map(r => ({ Date: r.expense_date, Category: r.category_name || '', Description: r.description || '', Supplier: r.supplier || '', 'Invoice #': r.invoice_number || '', 'Amount Excl': Number(r.amount || 0).toFixed(2), VAT: Number(r.vat_amount || 0).toFixed(2) })) },
      { name: 'Supplier Invoices', rows: (invRes.data || []).map(r => ({ Date: r.invoice_date, Supplier: r.supplier || '', 'Invoice #': r.invoice_number || '', Status: r.status || '', 'Total Excl': (Number(r.total_amount || 0) - Number(r.total_vat || 0)).toFixed(2), VAT: Number(r.total_vat || 0).toFixed(2), 'Total Incl': Number(r.total_amount || 0).toFixed(2) })) },
      { name: 'Payroll', rows: (payrollRes.data || []).map(r => { const e = empMap[r.employee_id] || {}; return { Period: r.period, 'Pay Date': r.paid_date, Employee: e.full_name || '', 'ID Number': e.id_number || '', 'Gross Pay': Number(r.gross_pay || 0).toFixed(2), 'UIF Employee': Number(r.uif_employee || 0).toFixed(2), 'Net Pay': Number(r.net_pay || 0).toFixed(2), 'UIF Employer': Number(r.uif_employer || 0).toFixed(2) } }) },
      { name: 'Stock Purchases', rows: (purchRes.data || []).map(r => ({ Date: r.purchase_date, Item: r.item_name || '', Supplier: r.supplier || '', Qty: Number(r.qty_received || 0).toFixed(3), Unit: r.unit || '', 'Unit Cost': Number(r.unit_cost || 0).toFixed(4), 'Total Cost': Number(r.total_cost || 0).toFixed(2) })) },
      { name: 'Wastage', rows: (wastRes.data || []).map(r => ({ Date: r.wastage_date, Item: r.item_name || '', Qty: Number(r.qty || 0).toFixed(3), Unit: r.unit || '', 'Total Cost': Number(r.total_cost || 0).toFixed(2), Reason: r.reason || '' })) },
    ]
    downloadExcel(sheets, `CompliTrack_Accountant_Pack_${startDate}`)
  }

  // ── UI ─────────────────────────────────────────────────────────────────────
  const card: React.CSSProperties = { background: '#fff', borderRadius: 16, border: '1px solid #eef2ee', padding: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }

  function ReportCard({ icon, title, description, reportKey, onCSV, onExcel, onPDF }: { icon: string; title: string; description: string; reportKey: string; onCSV: () => Promise<void>; onExcel: () => Promise<void>; onPDF: () => Promise<void> }) {
    const isLoading = (k: string) => loading === reportKey + k
    const btn = (label: string, color: string, fn: () => void, k: string) => (
      <button onClick={fn} disabled={loading !== null} style={{ padding: '7px 14px', background: loading !== null ? '#e5e7eb' : color, color: loading !== null ? '#9ca3af' : '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: loading !== null ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
        {isLoading(k) ? '⏳' : null}{label}
      </button>
    )
  if (!storeId && !loading) {
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
      <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <span style={{ fontSize: 28 }}>{icon}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#111', marginBottom: 3 }}>{title}</div>
            <div style={{ fontSize: 12, color: '#9ca3af', lineHeight: 1.4 }}>{description}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const }}>
          {btn('CSV', '#16a34a', () => run(reportKey + 'csv', onCSV), 'csv')}
          {btn('Excel', '#2563eb', () => run(reportKey + 'excel', onExcel), 'excel')}
          {btn('PDF', '#dc2626', () => run(reportKey + 'pdf', onPDF), 'pdf')}
        </div>
      </div>
    )
  }

  function SectionHeader({ title, icon }: { title: string; icon: string }) {
    return <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, marginTop: 8 }}>
      <span style={{ fontSize: 20 }}>{icon}</span>
      <div style={{ fontSize: 15, fontWeight: 800, color: '#111' }}>{title}</div>
      <div style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
    </div>
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f0f4f0', fontFamily: 'system-ui,sans-serif' }}>
      {/* Header */}
      <div style={{ background: `linear-gradient(135deg,${DARK},${PRIMARY})`, padding: '20px 32px', display: 'flex', alignItems: 'center', gap: 16 }}>
        <button onClick={() => router.push('/dashboard')} style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 13 }}>← Back</button>
        <div style={{ flex: 1 }}>
          <div style={{ color: '#fff', fontWeight: 800, fontSize: 22 }}>📋 Reports</div>
          <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 13 }}>Financial · Labour · Stock · Compliance · HR — download as CSV, Excel or PDF</div>
        </div>
        {/* Global date range */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.1)', borderRadius: 10, padding: '8px 14px' }}>
          <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: 600 }}>FROM</span>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: 13, cursor: 'pointer', outline: 'none' }} />
          <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>—</span>
          <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: 600 }}>TO</span>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: 13, cursor: 'pointer', outline: 'none' }} />
        </div>
      </div>

      <div style={{ padding: '24px 32px', maxWidth: 1400, margin: '0 auto' }}>
        {/* Accountant Pack — prominent CTA */}
        <div style={{ ...card, background: `linear-gradient(135deg,${DARK},${PRIMARY})`, marginBottom: 28, display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{ flex: 1 }}>
            <div style={{ color: '#fff', fontWeight: 800, fontSize: 17, marginBottom: 4 }}>🗂️ Accountant Pack — All Reports in One Excel File</div>
            <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>6 sheets: Sales · Expenses · Supplier Invoices · Payroll · Stock Purchases · Wastage — one click for your accountant</div>
          </div>
          <button onClick={() => run('accountant', accountantPack)} disabled={loading !== null} style={{ padding: '12px 24px', background: '#fff', color: PRIMARY, border: 'none', borderRadius: 10, fontWeight: 800, fontSize: 14, cursor: loading !== null ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' as const }}>
            {loading === 'accountant' ? '⏳ Generating…' : '⬇️ Download Excel Pack'}
          </button>
        </div>

        {/* FINANCIAL */}
        <SectionHeader title="Financial Reports" icon="💰" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(320px,1fr))', gap: 14, marginBottom: 28 }}>
          <ReportCard icon="🏦" title="Cash-Up Sales Report" description="Daily sales totals with incl/excl VAT split, payment methods, cashier names." reportKey="sales" onCSV={() => salesReport('csv')} onExcel={() => salesReport('excel')} onPDF={() => salesReport('pdf')} />
          <ReportCard icon="📄" title="Expenses Report" description="Quick expenses + supplier invoices combined, grouped by date with VAT detail." reportKey="expenses" onCSV={() => expensesReport('csv')} onExcel={() => expensesReport('excel')} onPDF={() => expensesReport('pdf')} />
          <ReportCard icon="🧾" title="Supplier Invoice Report" description="All received/paid supplier bills with invoice numbers, amounts and VAT." reportKey="invoices" onCSV={() => invoiceReport('csv')} onExcel={() => invoiceReport('excel')} onPDF={() => invoiceReport('pdf')} />
          <ReportCard icon="⚠️" title="Outstanding Bills" description="All unpaid supplier invoices, ordered by due date with overdue days." reportKey="outstanding" onCSV={() => outstandingBillsReport('csv')} onExcel={() => outstandingBillsReport('excel')} onPDF={() => outstandingBillsReport('pdf')} />
        </div>

        {/* LABOUR */}
        <SectionHeader title="Labour & Payroll" icon="👥" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(320px,1fr))', gap: 14, marginBottom: 28 }}>
          <ReportCard icon="💵" title="Monthly Payroll Report" description="Gross pay, UIF deductions, net pay per employee. Suitable for labour broker." reportKey="payroll" onCSV={() => payrollReport('csv')} onExcel={() => payrollReport('excel')} onPDF={() => payrollReport('pdf')} />
          <ReportCard icon="🕐" title="Attendance Register" description="Full clock-in/clock-out register with hours worked and late flags per employee." reportKey="attendance" onCSV={() => attendanceReport('csv')} onExcel={() => attendanceReport('excel')} onPDF={() => attendanceReport('pdf')} />
          <ReportCard icon="🏛️" title="UIF Schedule (SARS)" description="Employee + employer UIF contributions per employee — formatted for SARS submission." reportKey="uif" onCSV={() => uifReport('csv')} onExcel={() => uifReport('excel')} onPDF={() => uifReport('pdf')} />
          <ReportCard icon="🌴" title="Leave Summary" description="All approved/pending leave records by employee within the period." reportKey="leave" onCSV={() => leaveReport('csv')} onExcel={() => leaveReport('excel')} onPDF={() => leaveReport('pdf')} />
        </div>

        {/* STOCK */}
        <SectionHeader title="Stock Reports" icon="📦" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(320px,1fr))', gap: 14, marginBottom: 28 }}>
          <ReportCard icon="📊" title="Stock Valuation" description="Current on-hand quantities × cost price for all active stock items. Point-in-time." reportKey="stockval" onCSV={() => stockValuationReport('csv')} onExcel={() => stockValuationReport('excel')} onPDF={() => stockValuationReport('pdf')} />
          <ReportCard icon="🚚" title="Purchases / GRV Report" description="All goods received with quantities, unit costs and supplier per line." reportKey="purchases" onCSV={() => purchasesReport('csv')} onExcel={() => purchasesReport('excel')} onPDF={() => purchasesReport('pdf')} />
          <ReportCard icon="🗑️" title="Wastage Report" description="All stock written off with quantities, costs and reasons recorded." reportKey="wastage" onCSV={() => wastageReport('csv')} onExcel={() => wastageReport('excel')} onPDF={() => wastageReport('pdf')} />
          <ReportCard icon="🔄" title="Stock Movement Report" description="Complete IN/OUT log — purchases, issues and wastage on one combined timeline. Excel has 4 sheets." reportKey="movement" onCSV={() => stockMovementReport('csv')} onExcel={() => stockMovementReport('excel')} onPDF={() => stockMovementReport('pdf')} />
        </div>

        {/* COMPLIANCE */}
        <SectionHeader title="Compliance Reports" icon="✅" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(320px,1fr))', gap: 14, marginBottom: 28 }}>
          <ReportCard icon="📋" title="Compliance Session History" description="Daily compliance scores, pass/fail status and session duration for every session." reportKey="compliance" onCSV={() => complianceReport('csv')} onExcel={() => complianceReport('excel')} onPDF={() => complianceReport('pdf')} />
          <ReportCard icon="🌡️" title="Temperature Log" description="Full equipment temperature records with compliance flags and violations highlighted." reportKey="temp" onCSV={() => temperatureReport('csv')} onExcel={() => temperatureReport('excel')} onPDF={() => temperatureReport('pdf')} />
        </div>

        {/* HR */}
        <SectionHeader title="HR Reports" icon="👤" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(320px,1fr))', gap: 14, marginBottom: 28 }}>
          <ReportCard icon="👥" title="Employee List" description="Full employee register with ID numbers, roles, contact details and pay rates." reportKey="employees" onCSV={() => employeeListReport('csv')} onExcel={() => employeeListReport('excel')} onPDF={() => employeeListReport('pdf')} />
        </div>

        <div style={{ textAlign: 'center', color: '#9ca3af', fontSize: 12, padding: '16px 0' }}>
          CompliTrack Reports · Date range: <strong>{startDate}</strong> to <strong>{endDate}</strong>
        </div>
      </div>
    </div>
  )
}
