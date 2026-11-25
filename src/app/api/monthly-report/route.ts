import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!

export const maxDuration = 60

function fmt(n: number) {
  return 'R ' + (n || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export async function POST(req: NextRequest) {
  try {
    const { storeId, month, year, userId } = await req.json()
    if (!storeId || !month || !year) {
      return NextResponse.json({ error: 'Missing storeId, month, or year' }, { status: 400 })
    }

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    const monthStr = `${year}-${String(month).padStart(2, '0')}`
    const startDate = `${monthStr}-01`
    const endDate = new Date(year, month, 0).toISOString().slice(0, 10) // last day of month

    // ── Previous month for comparisons ─────────────────────────────────────────
    const prevMonth = month === 1 ? 12 : month - 1
    const prevYear = month === 1 ? year - 1 : year
    const prevMonthStr = `${prevYear}-${String(prevMonth).padStart(2, '0')}`
    const prevStart = `${prevMonthStr}-01`
    const prevEnd = new Date(prevYear, prevMonth, 0).toISOString().slice(0, 10)

    // ── Fetch all data in parallel ──────────────────────────────────────────────
    const [
      cashUpsRes, prevCashUpsRes,
      expensesRes, prevExpensesRes,
      invoicesRes, prevInvoicesRes,
      payrollRes, prevPayrollRes,
      stockPurchasesRes,
      wastageRes,
      complianceRes,
      sessionsRes, prevSessionsRes,
      attendanceRes,
      evaluationsRes,
      warningsRes,
      leaveRes,
      storeRes,
    ] = await Promise.all([
      // Current month cash-ups
      sb.from('cash_ups').select('cash_up_date,cash_up_total,customer_count,signed_off_at')
        .eq('store_id', storeId).eq('status', 'signed_off')
        .gte('cash_up_date', startDate).lte('cash_up_date', endDate),
      // Prev month cash-ups
      sb.from('cash_ups').select('cash_up_total,customer_count')
        .eq('store_id', storeId).eq('status', 'signed_off')
        .gte('cash_up_date', prevStart).lte('cash_up_date', prevEnd),
      // Current month expenses
      sb.from('expenses').select('amount,category_name,expense_date')
        .eq('store_id', storeId)
        .gte('expense_date', startDate).lte('expense_date', endDate),
      // Prev month expenses
      sb.from('expenses').select('amount')
        .eq('store_id', storeId)
        .gte('expense_date', prevStart).lte('expense_date', prevEnd),
      // Current month invoices
      sb.from('invoices').select('total_amount_incl,total_vat,supplier_name,due_date,status')
        .eq('store_id', storeId)
        .gte('invoice_date', startDate).lte('invoice_date', endDate),
      // Prev month invoices
      sb.from('invoices').select('total_amount_incl')
        .eq('store_id', storeId)
        .gte('invoice_date', prevStart).lte('invoice_date', prevEnd),
      // Current month payroll
      sb.from('payroll_runs').select('gross_pay,net_pay,uif_employee,uif_employer,period')
        .eq('store_id', storeId)
        .gte('paid_date', startDate).lte('paid_date', endDate),
      // Prev month payroll
      sb.from('payroll_runs').select('gross_pay,net_pay')
        .eq('store_id', storeId)
        .gte('paid_date', prevStart).lte('paid_date', prevEnd),
      // Stock purchases
      sb.from('stock_purchases').select('total_cost,category,purchase_date')
        .eq('store_id', storeId)
        .gte('purchase_date', startDate).lte('purchase_date', endDate),
      // Wastage
      sb.from('stock_wastage').select('quantity,cost_impact,reason,wasted_at')
        .eq('store_id', storeId)
        .gte('wasted_at', startDate + 'T00:00:00').lte('wasted_at', endDate + 'T23:59:59'),
      // Compliance issues
      sb.from('compliance_issues').select('status,is_uniform_violation,created_at')
        .eq('store_id', storeId)
        .gte('created_at', startDate + 'T00:00:00').lte('created_at', endDate + 'T23:59:59'),
      // Daily sessions current month
      sb.from('daily_sessions').select('session_date,status,open_time,close_time')
        .eq('store_id', storeId)
        .gte('session_date', startDate).lte('session_date', endDate),
      // Daily sessions prev month
      sb.from('daily_sessions').select('status')
        .eq('store_id', storeId)
        .gte('session_date', prevStart).lte('session_date', prevEnd),
      // Attendance current month
      sb.from('attendance').select('status,employee_id,check_in,check_out')
        .eq('store_id', storeId)
        .gte('date', startDate).lte('date', endDate),
      // Evaluations
      sb.from('employee_evaluations').select('overall_score,employee_id,evaluation_date')
        .eq('store_id', storeId)
        .gte('evaluation_date', startDate).lte('evaluation_date', endDate),
      // Warnings
      sb.from('employee_warnings').select('severity,employee_id,issued_date')
        .eq('store_id', storeId)
        .gte('issued_date', startDate).lte('issued_date', endDate),
      // Leave
      sb.from('employee_leave').select('leave_type,days_requested,status,employee_id')
        .eq('store_id', storeId)
        .gte('start_date', startDate).lte('start_date', endDate),
      // Store info
      sb.from('stores').select('name').eq('id', storeId).single(),
    ])

    const storeName = storeRes.data?.name ?? 'Store'

    // ── Crunch the numbers ─────────────────────────────────────────────────────
    const cashUps = cashUpsRes.data ?? []
    const prevCashUps = prevCashUpsRes.data ?? []
    const totalSales = cashUps.reduce((s: number, r: any) => s + Number(r.cash_up_total || 0), 0)
    const prevSales = prevCashUps.reduce((s: number, r: any) => s + Number(r.cash_up_total || 0), 0)
    const totalCustomers = cashUps.reduce((s: number, r: any) => s + Number(r.customer_count || 0), 0)
    const prevCustomers = prevCashUps.reduce((s: number, r: any) => s + Number(r.customer_count || 0), 0)
    const tradingDays = cashUps.length
    const avgDailySales = tradingDays > 0 ? totalSales / tradingDays : 0

    const expenses = expensesRes.data ?? []
    const prevExpenses = prevExpensesRes.data ?? []
    const totalExpenses = expenses.reduce((s: number, r: any) => s + Number(r.amount || 0), 0)
    const prevTotalExpenses = prevExpenses.reduce((s: number, r: any) => s + Number(r.amount || 0), 0)
    const expenseByCategory: Record<string, number> = {}
    expenses.forEach((e: any) => { expenseByCategory[e.category_name || 'Other'] = (expenseByCategory[e.category_name || 'Other'] || 0) + Number(e.amount || 0) })

    const invoices = invoicesRes.data ?? []
    const prevInvoices = prevInvoicesRes.data ?? []
    const totalSupplierCost = invoices.reduce((s: number, r: any) => s + Number(r.total_amount_incl || 0), 0)
    const prevSupplierCost = prevInvoices.reduce((s: number, r: any) => s + Number(r.total_amount_incl || 0), 0)
    const totalVAT = invoices.reduce((s: number, r: any) => s + Number(r.total_vat || 0), 0)
    const overdueInvoices = invoices.filter((i: any) => i.status === 'overdue' || (i.due_date && i.due_date < endDate && i.status !== 'paid')).length

    const payroll = payrollRes.data ?? []
    const prevPayroll = prevPayrollRes.data ?? []
    const totalWages = payroll.reduce((s: number, r: any) => s + Number(r.gross_pay || 0), 0)
    const prevTotalWages = prevPayroll.reduce((s: number, r: any) => s + Number(r.gross_pay || 0), 0)
    const totalNetPay = payroll.reduce((s: number, r: any) => s + Number(r.net_pay || 0), 0)
    const wagePct = totalSales > 0 ? (totalWages / totalSales) * 100 : 0

    const stockPurchases = stockPurchasesRes.data ?? []
    const totalStock = stockPurchases.reduce((s: number, r: any) => s + Number(r.total_cost || 0), 0)

    const wastage = wastageRes.data ?? []
    const totalWastageCost = wastage.reduce((s: number, r: any) => s + Number(r.cost_impact || 0), 0)
    const wastageIncidents = wastage.length

    const compliance = complianceRes.data ?? []
    const openIssues = compliance.filter((i: any) => i.status === 'open' || i.status === 'in_progress').length
    const resolvedIssues = compliance.filter((i: any) => i.status === 'resolved').length
    const uniformViolations = compliance.filter((i: any) => i.is_uniform_violation).length

    const sessions = sessionsRes.data ?? []
    const prevSessions = prevSessionsRes.data ?? []
    const signedOffSessions = sessions.filter((s: any) => s.status === 'signed_off').length
    const totalSessionDays = sessions.length

    const attendance = attendanceRes.data ?? []
    const absentees = attendance.filter((a: any) => a.status === 'absent').length
    const presentCount = attendance.filter((a: any) => a.status === 'present').length
    const lateCount = attendance.filter((a: any) => a.status === 'late').length

    const evaluations = evaluationsRes.data ?? []
    const avgScore = evaluations.length > 0
      ? evaluations.reduce((s: number, e: any) => s + Number(e.overall_score || 0), 0) / evaluations.length
      : null

    const warnings = warningsRes.data ?? []
    const leave = leaveRes.data ?? []
    const approvedLeave = leave.filter((l: any) => l.status === 'approved').length

    const totalCosts = totalExpenses + totalSupplierCost + totalWages + totalStock
    const grossProfit = totalSales - totalSupplierCost - totalStock
    const operatingProfit = grossProfit - totalExpenses - totalWages
    const prevTotalCosts = prevTotalExpenses + prevSupplierCost + prevTotalWages

    const pct = (a: number, b: number) => b === 0 ? null : ((a - b) / b * 100)
    const salesChange = pct(totalSales, prevSales)
    const expenseChange = pct(totalCosts, prevTotalCosts)

    // ── Months name ─────────────────────────────────────────────────────────────
    const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December']
    const monthName = monthNames[month - 1]
    const prevMonthName = monthNames[prevMonth - 1]

    // ── Build structured data for Claude ───────────────────────────────────────
    const dataSnapshot = {
      period: { month: monthName, year, startDate, endDate, tradingDays },
      sales: {
        total: totalSales,
        prev: prevSales,
        change: salesChange,
        customers: totalCustomers,
        prevCustomers,
        avgDaily: avgDailySales,
      },
      costs: {
        totalCosts,
        prevTotalCosts,
        change: expenseChange,
        breakdown: {
          quickExpenses: totalExpenses,
          prevQuickExpenses: prevTotalExpenses,
          byCategory: expenseByCategory,
          supplierInvoices: totalSupplierCost,
          prevSupplierInvoices: prevSupplierCost,
          supplierVAT: totalVAT,
          wages: totalWages,
          prevWages: prevTotalWages,
          netPay: totalNetPay,
          wagePct,
          stock: totalStock,
        },
        overdueInvoices,
      },
      profitability: {
        grossProfit,
        operatingProfit,
        grossMarginPct: totalSales > 0 ? (grossProfit / totalSales) * 100 : 0,
        operatingMarginPct: totalSales > 0 ? (operatingProfit / totalSales) * 100 : 0,
      },
      stock: {
        purchases: totalStock,
        wastageIncidents,
        wastageCost: totalWastageCost,
        wastageAssetPct: totalStock > 0 ? (totalWastageCost / totalStock) * 100 : 0,
      },
      compliance: {
        total: compliance.length,
        open: openIssues,
        resolved: resolvedIssues,
        uniformViolations,
        resolutionRate: compliance.length > 0 ? (resolvedIssues / compliance.length) * 100 : 100,
      },
      operations: {
        tradingDays,
        signedOffSessions,
        complianceRate: totalSessionDays > 0 ? (signedOffSessions / totalSessionDays) * 100 : 0,
      },
      staff: {
        attendance: { present: presentCount, absent: absentees, late: lateCount },
        evaluations: { count: evaluations.length, avgScore },
        warnings: warnings.length,
        approvedLeave,
      },
    }

    // ── Prompt for Claude ──────────────────────────────────────────────────────
    const prompt = `You are a sharp, insightful business analyst for ${storeName}, a Mochachos Mexican restaurant in Hartswater, South Africa. Generate a comprehensive monthly business report for ${monthName} ${year}.

Here is the business data for the month:

**SALES & REVENUE**
- Total Sales: ${fmt(totalSales)}${salesChange !== null ? ` (${salesChange > 0 ? '+' : ''}${salesChange.toFixed(1)}% vs ${prevMonthName})` : ''}
- Trading Days: ${tradingDays}
- Average Daily Sales: ${fmt(avgDailySales)}
- Total Customers: ${totalCustomers.toLocaleString()}${prevCustomers > 0 ? ` (prev: ${prevCustomers.toLocaleString()})` : ''}
- Avg Spend Per Customer: ${totalCustomers > 0 ? fmt(totalSales / totalCustomers) : 'N/A'}

**COSTS & EXPENSES**
- Total Costs: ${fmt(totalCosts)}${expenseChange !== null ? ` (${expenseChange > 0 ? '+' : ''}${expenseChange.toFixed(1)}% vs ${prevMonthName})` : ''}
  - Quick/Cash Expenses: ${fmt(totalExpenses)}
  - Supplier Invoices (incl VAT): ${fmt(totalSupplierCost)}
  - Wages (Gross): ${fmt(totalWages)} (${wagePct.toFixed(1)}% of sales)
  - Stock Purchases: ${fmt(totalStock)}
${Object.keys(expenseByCategory).length > 0 ? `- Expense Categories: ${Object.entries(expenseByCategory).map(([k, v]) => `${k}: ${fmt(v)}`).join(', ')}` : ''}
${overdueInvoices > 0 ? `- ⚠️ Overdue Supplier Invoices: ${overdueInvoices}` : ''}

**PROFITABILITY**
- Gross Profit: ${fmt(grossProfit)} (${dataSnapshot.profitability.grossMarginPct.toFixed(1)}% margin)
- Operating Profit: ${fmt(operatingProfit)} (${dataSnapshot.profitability.operatingMarginPct.toFixed(1)}% margin)

**STOCK & WASTAGE**
- Stock Purchases: ${fmt(totalStock)}
- Wastage Incidents: ${wastageIncidents}
- Wastage Cost: ${fmt(totalWastageCost)}${totalStock > 0 ? ` (${dataSnapshot.stock.wastageAssetPct.toFixed(1)}% of stock value)` : ''}

**COMPLIANCE & OPERATIONS**
- Compliance Issues Logged: ${compliance.length} (${openIssues} open, ${resolvedIssues} resolved${uniformViolations > 0 ? `, ${uniformViolations} uniform` : ''})
- Resolution Rate: ${dataSnapshot.compliance.resolutionRate.toFixed(0)}%
- Shift Sign-off Rate: ${signedOffSessions}/${totalSessionDays} shifts (${dataSnapshot.operations.complianceRate.toFixed(0)}%)

**STAFF & HR**
- Attendance: ${presentCount} present, ${lateCount} late, ${absentees} absent
- Employee Evaluations: ${evaluations.length > 0 ? `${evaluations.length} conducted, avg score ${avgScore?.toFixed(1)}/5` : 'None this month'}
- Warnings Issued: ${warnings.length}
- Leave Approved: ${approvedLeave} requests

Write the report in this exact structure:

# ${monthName} ${year} Business Report — ${storeName}

## Executive Summary
(2-3 sentences capturing the month's overall performance — be direct and specific about whether it was a good or tough month and why)

## 📈 Revenue Performance
(Analyse sales, customer traffic, average spend. Compare to previous month. Note trends, strong/weak weeks if visible from day count.)

## 💰 Cost Management
(Break down where money went. Flag anything unusual. Comment on wage-to-sales ratio — industry benchmark is 25-35% for restaurants. Note any overdue invoices.)

## 📊 Profitability
(Gross and operating margins. Is the business profitable? What's driving or hurting margins?)

## 🥩 Stock & Wastage
(Comment on stock spend and wastage rate. Flag if wastage is high relative to stock.)

## ✅ Compliance & Operations
(Shift sign-off discipline, compliance issue resolution rate. Flag persistent open issues if resolution rate is low.)

## 👥 Staff & HR
(Attendance patterns, evaluation scores, warnings. Flag concerns or positives.)

## ✅ What Went Well
(3-5 bullet points of genuine positives — be specific with numbers)

## ⚠️ Areas of Concern
(3-5 bullet points of real concerns — be direct, don't sugarcoat)

## 💡 Recommendations for ${monthNames[month % 12]} ${month === 12 ? year + 1 : year}
(4-6 concrete, actionable recommendations based on the data)

---
*Report generated by CompliTrack AI · ${new Date().toLocaleDateString('en-ZA')}*

Keep the tone professional but plain-spoken — this is for a restaurant manager, not a banker. Use South African Rand (R) for all amounts. Be specific with numbers throughout.`

    // ── Call Claude API ────────────────────────────────────────────────────────
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (!anthropicRes.ok) {
      const errBody = await anthropicRes.text()
      throw new Error(`Anthropic API error ${anthropicRes.status}: ${errBody}`)
    }
    const anthropicData = await anthropicRes.json()
    const reportText = anthropicData.content?.[0]?.text ?? ''

    // ── Save to database ───────────────────────────────────────────────────────
    const { error: saveErr } = await sb
      .from('monthly_reports')
      .upsert({
        store_id: storeId,
        report_month: startDate,
        generated_by: userId ?? null,
        report_text: reportText,
        data_snapshot: dataSnapshot,
        generated_at: new Date().toISOString(),
      }, { onConflict: 'store_id,report_month' })

    if (saveErr) {
      console.error('[monthly-report] save error:', saveErr)
    }

    return NextResponse.json({ report: reportText, dataSnapshot })

  } catch (err: any) {
    console.error('[monthly-report] error:', err)
    return NextResponse.json({ error: err.message ?? "Unknown error", stack: err.stack?.split("\n").slice(0,5) }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const storeId = searchParams.get('storeId')
    const limit = parseInt(searchParams.get('limit') ?? '12')
    if (!storeId) return NextResponse.json({ error: 'Missing storeId' }, { status: 400 })

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    const { data, error } = await sb
      .from('monthly_reports')
      .select('id, report_month, generated_at, report_text, data_snapshot')
      .eq('store_id', storeId)
      .order('report_month', { ascending: false })
      .limit(limit)

    if (error) throw error
    return NextResponse.json({ reports: data ?? [] })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
