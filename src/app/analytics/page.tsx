'use client'
import React, { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const STORE_ID = '05328298-fc27-4c9f-b091-bb7f6598b601'
const PRIMARY = '#1a5c38'
const DARK = '#0a1f12'
const VAT = 0.15

function fmt(n: number) { return 'R\u00a0' + (n||0).toLocaleString('en-ZA',{minimumFractionDigits:2,maximumFractionDigits:2}) }
function thisMonth() { return new Date().toISOString().slice(0,7) }
function lastMonth() { const d=new Date(); d.setMonth(d.getMonth()-1); return d.toISOString().slice(0,7) }
function monthRange(ym: string):[string,string] { const [y,m]=ym.split('-').map(Number); return [`${ym}-01`, new Date(y,m,0).toISOString().slice(0,10)] }
function weekRange(mon: string):[string,string] { const d=new Date(mon+'T00:00:00'),e=new Date(d); e.setDate(d.getDate()+6); return [mon,e.toISOString().slice(0,10)] }
function yearRange(y: number):[string,string] { return [`${y}-01-01`,`${y}-12-31`] }
function getMonday() { const d=new Date(),day=(d.getDay()+6)%7; d.setDate(d.getDate()-day); return d.toISOString().slice(0,10) }

export default function AnalyticsPage() {
  const router = useRouter()
  const [view, setView] = useState<'period'|'compare'>('period')
  const [periodType, setPeriodType] = useState<'month'|'week'|'year'>('month')
  const [month, setMonth] = useState(thisMonth())
  const [weekStart, setWeekStart] = useState(getMonday())
  const [year, setYear] = useState(new Date().getFullYear())
  const [compareMonth, setCompareMonth] = useState(lastMonth())
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<any>(null)
  const [compareData, setCompareData] = useState<any>(null)

  function getPeriodRange():[string,string] {
    if (periodType==='week') return weekRange(weekStart)
    if (periodType==='year') return yearRange(year)
    return monthRange(month)
  }

  async function fetchAnalytics(start: string, end: string) {
    // Last month range for baseline
    const lmDate = new Date(start); lmDate.setMonth(lmDate.getMonth()-1)
    const lmStart = lmDate.toISOString().slice(0,7)+'-01'
    const lmEnd = new Date(lmDate.getFullYear(),lmDate.getMonth()+1,0).toISOString().slice(0,10)

    // Get submitted invoice IDs for this period and last month
    const [invIdsRes, lmInvIdsRes] = await Promise.all([
      supabase.from('invoices').select('id').eq('store_id',STORE_ID).in('status',['received','paid']).gte('invoice_date',start).lte('invoice_date',end),
      supabase.from('invoices').select('id').eq('store_id',STORE_ID).in('status',['received','paid']).gte('invoice_date',lmStart).lte('invoice_date',lmEnd),
    ])
    const invIds = (invIdsRes.data||[]).map((r:any)=>r.id)
    const lmInvIds = (lmInvIdsRes.data||[]).map((r:any)=>r.id)

    const queries: Promise<any>[] = [
      supabase.from('cash_ups').select('cash_up_date,cash_up_total').eq('store_id',STORE_ID).neq('status','draft').gte('cash_up_date',start).lte('cash_up_date',end).order('cash_up_date'),
      supabase.from('expenses').select('amount,category_key,category_name').eq('store_id',STORE_ID).gte('expense_date',start).lte('expense_date',end),
      invIds.length ? supabase.from('invoice_lines').select('amount,vat_amount,category_key').in('invoice_id',invIds) : Promise.resolve({data:[]}),
      supabase.from('wage_payments').select('net_pay,gross_pay,uif_employer').eq('store_id',STORE_ID).gte('paid_date',start).lte('paid_date',end),
      supabase.from('stock_purchases').select('total_cost').eq('store_id',STORE_ID).gte('purchase_date',start).lte('purchase_date',end),
      supabase.from('stock_wastage').select('total_cost').eq('store_id',STORE_ID).gte('wastage_date',start).lte('wastage_date',end),
      supabase.from('stock_counts').select('id,count_date').eq('store_id',STORE_ID).eq('status','completed').order('count_date',{ascending:false}).limit(20),
      supabase.from('expenses').select('amount,category_key').eq('store_id',STORE_ID).gte('expense_date',lmStart).lte('expense_date',lmEnd),
      lmInvIds.length ? supabase.from('invoice_lines').select('amount,vat_amount,category_key').in('invoice_id',lmInvIds) : Promise.resolve({data:[]}),
      supabase.from('wage_payments').select('gross_pay').eq('store_id',STORE_ID).gte('paid_date',lmStart).lte('paid_date',lmEnd),
    ]
    const [cashUpsRes,expRes,invLinesRes,wagesRes,purchRes,wastRes,countsRes,lmExpRes,lmInvLinesRes,lmWagesRes] = await Promise.all(queries)

    // Sales
    const dailyCashUps: Record<string,number> = {}
    for (const cu of cashUpsRes.data||[]) dailyCashUps[cu.cash_up_date] = (dailyCashUps[cu.cash_up_date]||0) + Number(cu.cash_up_total||0)
    const sales = Object.values(dailyCashUps).reduce((s,v)=>s+v,0)
    const salesExclVat = sales / (1+VAT)

    // Stock costs
    const purchases = (purchRes.data||[]).reduce((s:number,r:any)=>s+Number(r.total_cost||0),0)
    const wastage = (wastRes.data||[]).reduce((s:number,r:any)=>s+Number(r.total_cost||0),0)
    const wagesGross = (wagesRes.data||[]).reduce((s:number,r:any)=>s+Number(r.gross_pay||0),0)
    const uifEmployer = (wagesRes.data||[]).reduce((s:number,r:any)=>s+Number(r.uif_employer||0),0)

    // Stock counts for food cost
    const counts = countsRes.data||[]
    const openingCount = counts.find((c:any)=>c.count_date<start)
    const closingCount = counts.find((c:any)=>c.count_date<=end)
    async function countValue(id?: string) {
      if (!id) return 0
      const {data:lines} = await supabase.from('stock_count_lines').select('actual_qty,unit_cost').eq('stock_count_id',id)
      return (lines||[]).reduce((s:number,l:any)=>s+Number(l.actual_qty||0)*Number(l.unit_cost||0),0)
    }
    const [openingValue,closingValue] = await Promise.all([countValue(openingCount?.id),countValue(closingCount?.id)])
    const foodCostAmount = openingValue + purchases - closingValue - wastage
    const foodCostPct = salesExclVat>0 ? foodCostAmount/salesExclVat*100 : 0

    // Expenses by category — combine quick expenses + invoice lines (ex-VAT)
    const expByCat: Record<string,{name:string;total:number}> = {}
    const addExp = (key:string, name:string, amt:number) => {
      const k=key||'other'; if(k==='cost_of_sales') return
      if(!expByCat[k]) expByCat[k]={name:name||k,total:0}
      expByCat[k].total+=amt
    }
    for (const e of expRes.data||[]) addExp(e.category_key,e.category_name,Number(e.amount||0))
    for (const l of invLinesRes.data||[]) {
      const exVat = Number(l.amount||0)-Number(l.vat_amount||0)
      addExp(l.category_key,l.category_key,exVat>0?exVat:Number(l.amount||0))
    }
    const otherExpenses = Object.values(expByCat).reduce((s,c)=>s+c.total,0)
    const totalOperatingCosts = wagesGross + otherExpenses

    // Last month baseline for breakeven estimate
    const lmWages = (lmWagesRes.data||[]).reduce((s:number,r:any)=>s+Number(r.gross_pay||0),0)
    let lmOpExp = 0
    for (const e of lmExpRes.data||[]) { if((e.category_key||'other')!=='cost_of_sales') lmOpExp+=Number(e.amount||0) }
    for (const l of lmInvLinesRes.data||[]) {
      if((l.category_key||'other')==='cost_of_sales') continue
      const exVat=Number(l.amount||0)-Number(l.vat_amount||0)
      lmOpExp+=(exVat>0?exVat:Number(l.amount||0))
    }
    const lastMonthTotal = lmWages + lmOpExp

    // Breakeven: YOUR FORMULA — total operating costs / days in month
    const daysInPeriod = Math.round((new Date(end).getTime()-new Date(start).getTime())/86400000)+1
    const todayStr = new Date().toISOString().slice(0,10)
    const daysElapsed = todayStr<=end ? Math.round((new Date(Math.min(new Date(todayStr).getTime(),new Date(end).getTime())).getTime()-new Date(start).getTime())/86400000)+1 : daysInPeriod
    const pctElapsed = daysElapsed/daysInPeriod
    const useLastMonth = pctElapsed<0.5 && lastMonthTotal>0
    const breakevenBase = useLastMonth ? lastMonthTotal : totalOperatingCosts
    const dailyBreakeven = breakevenBase/daysInPeriod
    const monthlyBreakeven = breakevenBase
    const dailySalesAvg = daysElapsed>0 ? salesExclVat/daysElapsed : 0
    const daysAbove = Object.values(dailyCashUps).filter(v=>v/(1+VAT)>=dailyBreakeven).length
    const daysBelow = Object.keys(dailyCashUps).length - daysAbove

    // P&L
    const grossProfit = salesExclVat - foodCostAmount
    const grossMarginPct = salesExclVat>0 ? grossProfit/salesExclVat*100 : 0
    const totalCosts = foodCostAmount + totalOperatingCosts
    const netProfit = salesExclVat - totalCosts
    const netMarginPct = salesExclVat>0 ? netProfit/salesExclVat*100 : 0

    return {
      sales,salesExclVat,dailyCashUps,purchases,wastage,wagesGross,uifEmployer,
      openingValue,closingValue,foodCostAmount,foodCostPct,
      grossProfit,grossMarginPct,expByCat,otherExpenses,
      totalOperatingCosts,dailyBreakeven,monthlyBreakeven,
      useLastMonth,daysInPeriod,daysElapsed,pctElapsed,
      dailySalesAvg,daysAbove,daysBelow,
      totalCosts,netProfit,netMarginPct,
      openingDate:openingCount?.count_date,closingDate:closingCount?.count_date,
    }
  }

  const load = useCallback(async()=>{
    setLoading(true)
    const [s,e]=getPeriodRange()
    const d=await fetchAnalytics(s,e)
    setData(d)
    if(view==='compare'){ const [cs,ce]=monthRange(compareMonth); setCompareData(await fetchAnalytics(cs,ce)) }
    setLoading(false)
  },[periodType,month,weekStart,year,view,compareMonth])

  useEffect(()=>{load()},[load])

  const card:React.CSSProperties={background:'#fff',borderRadius:16,border:'1px solid #eef2ee',padding:20,boxShadow:'0 2px 8px rgba(0,0,0,0.04)'}
  const [s,e]=getPeriodRange()
  const periodLabel = periodType==='week' ? `Week of ${s}` : periodType==='year' ? String(year) : new Date(s+'T00:00:00').toLocaleDateString('en-ZA',{month:'long',year:'numeric'})

  function KPI({label,value,sub,color,big}:{label:string;value:string;sub?:string;color?:string;big?:boolean}) {
    return <div style={{...card,textAlign:'center'}}>
      <div style={{fontSize:11,fontWeight:700,color:'#9ca3af',textTransform:'uppercase',letterSpacing:0.5,marginBottom:6}}>{label}</div>
      <div style={{fontSize:big?30:22,fontWeight:800,color:color||'#111'}}>{value}</div>
      {sub&&<div style={{fontSize:12,color:'#9ca3af',marginTop:4}}>{sub}</div>}
    </div>
  }

  function Bar({label,value,total,color}:{label:string;value:number;total:number;color:string}) {
    const p=total>0?value/total*100:0
    return <div style={{marginBottom:12}}>
      <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
        <span style={{fontSize:13,color:'#374151'}}>{label}</span>
        <div style={{display:'flex',gap:12}}>
          <span style={{fontSize:13,fontWeight:700}}>{fmt(value)}</span>
          <span style={{fontSize:12,color:'#9ca3af',width:40,textAlign:'right'}}>{p.toFixed(1)}%</span>
        </div>
      </div>
      <div style={{height:8,background:'#f3f4f6',borderRadius:4}}>
        <div style={{height:'100%',width:`${Math.min(100,p)}%`,background:color,borderRadius:4,transition:'width 0.4s'}}/>
      </div>
    </div>
  }

  function CompareKPI({label,curr,prev}:{label:string;curr:number;prev:number}) {
    const delta=curr-prev,up=delta>=0,dp=prev>0?delta/prev*100:0
    return <div style={{...card}}>
      <div style={{fontSize:11,fontWeight:700,color:'#9ca3af',textTransform:'uppercase',marginBottom:8}}>{label}</div>
      <div style={{display:'flex',alignItems:'flex-end',gap:12}}>
        <div><div style={{fontSize:11,color:'#9ca3af'}}>{periodLabel}</div><div style={{fontSize:20,fontWeight:800,color:'#111'}}>{fmt(curr)}</div></div>
        <div style={{flex:1}}><div style={{fontSize:11,color:'#9ca3af'}}>{compareMonth}</div><div style={{fontSize:16,fontWeight:700,color:'#6b7280'}}>{fmt(prev)}</div></div>
        <div style={{textAlign:'right'}}>
          <div style={{fontSize:13,fontWeight:700,color:up?'#16a34a':'#dc2626'}}>{up?'▲':'▼'} {Math.abs(dp).toFixed(1)}%</div>
          <div style={{fontSize:11,color:'#9ca3af'}}>{up?'+':''}{fmt(delta)}</div>
        </div>
      </div>
    </div>
  }

  return <div style={{minHeight:'100vh',background:'#f8faf8',fontFamily:'system-ui,sans-serif'}}>
    {/* Header */}
    <div style={{background:`linear-gradient(135deg,${DARK},${PRIMARY})`,padding:'20px 32px',display:'flex',alignItems:'center',gap:16}}>
      <button onClick={()=>router.push('/dashboard')} style={{background:'rgba(255,255,255,0.15)',color:'#fff',border:'none',borderRadius:8,padding:'6px 14px',cursor:'pointer',fontSize:13}}>\u2190 Back</button>
      <div>
        <div style={{color:'#fff',fontWeight:800,fontSize:22}}>📊 Store Analytics</div>
        <div style={{color:'rgba(255,255,255,0.65)',fontSize:13}}>P&L · Breakeven · Daily Tracker · Expense %</div>
      </div>
    </div>

    <div style={{padding:'24px 32px',maxWidth:1200,margin:'0 auto'}}>
      {/* Controls */}
      <div style={{display:'flex',gap:12,marginBottom:24,flexWrap:'wrap',alignItems:'center'}}>
        <div style={{display:'flex',background:'#f3f4f6',borderRadius:10,padding:3}}>
          {(['period','compare'] as const).map(v=>(
            <button key={v} onClick={()=>setView(v)} style={{padding:'7px 18px',borderRadius:8,border:'none',background:view===v?PRIMARY:'transparent',color:view===v?'#fff':'#6b7280',fontWeight:700,fontSize:13,cursor:'pointer'}}>
              {v==='period'?'Single Period':'Compare Months'}
            </button>
          ))}
        </div>
        {view==='period'&&<>
          <div style={{display:'flex',background:'#f3f4f6',borderRadius:10,padding:3}}>
            {(['month','week','year'] as const).map(pt=>(
              <button key={pt} onClick={()=>setPeriodType(pt)} style={{padding:'7px 14px',borderRadius:8,border:'none',background:periodType===pt?PRIMARY:'transparent',color:periodType===pt?'#fff':'#6b7280',fontWeight:700,fontSize:13,cursor:'pointer'}}>
                {pt.charAt(0).toUpperCase()+pt.slice(1)}
              </button>
            ))}
          </div>
          {periodType==='month'&&<input type="month" value={month} onChange={e=>setMonth(e.target.value)} style={{padding:'8px 12px',borderRadius:10,border:'1.5px solid #e5e7eb',fontSize:14}}/>}
          {periodType==='week'&&<input type="date" value={weekStart} onChange={e=>setWeekStart(e.target.value)} style={{padding:'8px 12px',borderRadius:10,border:'1.5px solid #e5e7eb',fontSize:14}}/>}
          {periodType==='year'&&<select value={year} onChange={e=>setYear(Number(e.target.value))} style={{padding:'8px 12px',borderRadius:10,border:'1.5px solid #e5e7eb',fontSize:14}}>
            {[2024,2025,2026,2027].map(y=><option key={y}>{y}</option>)}
          </select>}
        </>}
        {view==='compare'&&<>
          <div><label style={{fontSize:12,color:'#6b7280',display:'block',marginBottom:4}}>Current</label><input type="month" value={month} onChange={e=>setMonth(e.target.value)} style={{padding:'8px 12px',borderRadius:10,border:'1.5px solid #e5e7eb',fontSize:14}}/></div>
          <div style={{color:'#9ca3af',fontSize:20,fontWeight:700,alignSelf:'flex-end',paddingBottom:6}}>vs</div>
          <div><label style={{fontSize:12,color:'#6b7280',display:'block',marginBottom:4}}>Compare to</label><input type="month" value={compareMonth} onChange={e=>setCompareMonth(e.target.value)} style={{padding:'8px 12px',borderRadius:10,border:'1.5px solid #e5e7eb',fontSize:14}}/></div>
        </>}
      </div>

      {loading?<div style={{textAlign:'center',padding:80,color:'#9ca3af',fontSize:16}}>Calculating…</div>:!data?null:<>
        {/* Compare view */}
        {view==='compare'&&compareData&&<div style={{display:'flex',flexDirection:'column',gap:12,marginBottom:32}}>
          <CompareKPI label="Sales (incl VAT)" curr={data.sales} prev={compareData.sales}/>
          <CompareKPI label="Sales (ex-VAT)" curr={data.salesExclVat} prev={compareData.salesExclVat}/>
          <CompareKPI label="Food Cost" curr={data.foodCostAmount} prev={compareData.foodCostAmount}/>
          <CompareKPI label="Wages" curr={data.wagesGross} prev={compareData.wagesGross}/>
          <CompareKPI label="Operating Expenses" curr={data.otherExpenses} prev={compareData.otherExpenses}/>
          <CompareKPI label="Net Profit / Loss" curr={data.netProfit} prev={compareData.netProfit}/>
          <CompareKPI label="Daily Breakeven" curr={data.dailyBreakeven} prev={compareData.dailyBreakeven}/>
        </div>}

        {/* KPIs */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:16,marginBottom:24}}>
          <KPI label="Total Sales (incl VAT)" value={fmt(data.sales)} sub={`Ex-VAT: ${fmt(data.salesExclVat)}`} big/>
          <KPI label="Gross Profit" value={fmt(data.grossProfit)} sub={`${data.grossMarginPct.toFixed(1)}% margin (ex-VAT)`} color={data.grossMarginPct>=60?'#16a34a':data.grossMarginPct>=45?'#d97706':'#dc2626'} big/>
          <KPI label="Net Profit / Loss" value={fmt(data.netProfit)} sub={`${data.netMarginPct.toFixed(1)}% of sales`} color={data.netProfit>=0?'#16a34a':'#dc2626'} big/>
          <KPI label="Food Cost %" value={data.salesExclVat>0?data.foodCostPct.toFixed(1)+'%':'—'} sub={data.foodCostPct<=35?'✓ On target (≤35%)':'⚠️ Above target'} color={data.foodCostPct<=35?'#16a34a':data.foodCostPct<=40?'#d97706':'#dc2626'} big/>
        </div>

        <div style={{display:'grid',gridTemplateColumns:'1.4fr 1fr',gap:24,marginBottom:24}}>
          {/* P&L */}
          <div style={{...card}}>
            <div style={{fontSize:15,fontWeight:700,marginBottom:8}}>Profit & Loss Breakdown</div>
            <div style={{background:'#f0f9ff',borderRadius:8,padding:'8px 12px',marginBottom:14,fontSize:12,color:'#0369a1'}}>
              💡 All % use ex-VAT sales (÷1.15) as the base — matches ex-VAT cost prices
            </div>
            <div style={{display:'flex',justifyContent:'space-between',fontSize:14,padding:'8px 0',borderBottom:'1px solid #f3f4f6',marginBottom:12}}>
              <span style={{fontWeight:600}}>Sales (ex-VAT)</span><span style={{fontWeight:800,color:'#16a34a'}}>{fmt(data.salesExclVat)}</span>
            </div>
            <div style={{fontSize:12,fontWeight:700,color:'#9ca3af',textTransform:'uppercase',marginBottom:8}}>Cost of Sales</div>
            <Bar label="Food Cost (ex-VAT)" value={data.foodCostAmount} total={data.salesExclVat} color="#ef4444"/>
            <div style={{display:'flex',justifyContent:'space-between',padding:'8px 0',borderTop:'1px solid #f3f4f6',fontSize:14,fontWeight:700,marginBottom:12}}>
              <span>Gross Profit</span><span style={{color:'#16a34a'}}>{fmt(data.grossProfit)} ({data.grossMarginPct.toFixed(1)}%)</span>
            </div>
            <div style={{fontSize:12,fontWeight:700,color:'#9ca3af',textTransform:'uppercase',marginBottom:8}}>Operating Expenses</div>
            <Bar label="Wages & Salaries" value={data.wagesGross} total={data.salesExclVat} color="#8b5cf6"/>
            {Object.entries(data.expByCat).map(([k,c]:any)=>(
              <Bar key={k} label={c.name} value={c.total} total={data.salesExclVat} color="#3b82f6"/>
            ))}
            <div style={{display:'flex',justifyContent:'space-between',padding:'12px 0',borderTop:'2px solid #111',fontSize:15,fontWeight:800,marginTop:8}}>
              <span>Net {data.netProfit>=0?'Profit':'Loss'}</span>
              <span style={{color:data.netProfit>=0?'#16a34a':'#dc2626'}}>{fmt(data.netProfit)} ({data.netMarginPct.toFixed(1)}%)</span>
            </div>
          </div>

          {/* Right column */}
          <div style={{display:'flex',flexDirection:'column',gap:16}}>
            {/* Breakeven */}
            <div style={{...card,border:`1.5px solid ${data.dailySalesAvg>=data.dailyBreakeven?'#bbf7d0':'#fecaca'}`}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:4}}>
                <div style={{fontSize:15,fontWeight:700}}>Breakeven</div>
                {data.useLastMonth&&<span style={{fontSize:11,background:'#fef9c3',color:'#854d0e',borderRadius:6,padding:'2px 8px',fontWeight:600}}>Est. from last month</span>}
              </div>
              <div style={{fontSize:12,color:'#9ca3af',marginBottom:14}}>Total operating costs ÷ days in month</div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:14}}>
                <div style={{textAlign:'center',background:'#f8faf8',borderRadius:10,padding:'10px 8px'}}>
                  <div style={{fontSize:11,color:'#9ca3af',marginBottom:4}}>DAILY TARGET</div>
                  <div style={{fontSize:22,fontWeight:800,color:'#111'}}>{fmt(data.dailyBreakeven)}</div>
                  <div style={{fontSize:11,color:'#9ca3af'}}>per day</div>
                </div>
                <div style={{textAlign:'center',background:'#f8faf8',borderRadius:10,padding:'10px 8px'}}>
                  <div style={{fontSize:11,color:'#9ca3af',marginBottom:4}}>MONTHLY</div>
                  <div style={{fontSize:22,fontWeight:800,color:'#111'}}>{fmt(data.monthlyBreakeven)}</div>
                  <div style={{fontSize:11,color:'#9ca3af'}}>{data.daysInPeriod} days</div>
                </div>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8}}>
                <div style={{textAlign:'center',background:'#f0fdf4',borderRadius:8,padding:'8px 4px'}}>
                  <div style={{fontSize:18,fontWeight:800,color:'#16a34a'}}>{data.daysAbove}</div>
                  <div style={{fontSize:10,color:'#9ca3af'}}>days above</div>
                </div>
                <div style={{textAlign:'center',background:'#fef2f2',borderRadius:8,padding:'8px 4px'}}>
                  <div style={{fontSize:18,fontWeight:800,color:'#dc2626'}}>{data.daysBelow}</div>
                  <div style={{fontSize:10,color:'#9ca3af'}}>days below</div>
                </div>
                <div style={{textAlign:'center',background:data.dailySalesAvg>=data.dailyBreakeven?'#f0fdf4':'#fef2f2',borderRadius:8,padding:'8px 4px'}}>
                  <div style={{fontSize:12,fontWeight:800,color:data.dailySalesAvg>=data.dailyBreakeven?'#16a34a':'#dc2626'}}>{fmt(data.dailySalesAvg)}</div>
                  <div style={{fontSize:10,color:'#9ca3af'}}>avg/day</div>
                </div>
              </div>
            </div>

            {/* Daily Tracker */}
            <div style={{...card}}>
              <div style={{fontSize:15,fontWeight:700,marginBottom:4}}>Daily Sales Tracker</div>
              <div style={{fontSize:12,color:'#9ca3af',marginBottom:12}}>Each day vs {fmt(data.dailyBreakeven)}/day target (ex-VAT)</div>
              {Object.keys(data.dailyCashUps).length===0?(
                <div style={{textAlign:'center',color:'#9ca3af',padding:'20px 0',fontSize:13}}>No cash-ups yet for this period</div>
              ):(
                <div style={{display:'flex',flexDirection:'column',gap:5,maxHeight:360,overflowY:'auto'}}>
                  {Object.entries(data.dailyCashUps).map(([date,total]:any)=>{
                    const exVat=total/(1+VAT), hit=exVat>=data.dailyBreakeven
                    const pct=data.dailyBreakeven>0?Math.min(100,exVat/data.dailyBreakeven*100):0
                    const over=exVat-data.dailyBreakeven
                    const day=new Date(date+'T00:00:00').toLocaleDateString('en-ZA',{weekday:'short',day:'numeric',month:'short'})
                    return <div key={date}>
                      <div style={{display:'flex',justifyContent:'space-between',marginBottom:3,fontSize:12}}>
                        <span style={{color:'#374151',fontWeight:600,minWidth:90}}>{day}</span>
                        <span style={{color:'#6b7280'}}>{fmt(exVat)}</span>
                        <span style={{fontWeight:700,color:hit?'#16a34a':'#dc2626',minWidth:80,textAlign:'right'}}>{hit?'+':''}{fmt(over)}</span>
                      </div>
                      <div style={{height:7,background:'#f3f4f6',borderRadius:3,marginBottom:3}}>
                        <div style={{height:'100%',width:`${pct}%`,background:hit?'#16a34a':'#ef4444',borderRadius:3}}/>
                      </div>
                    </div>
                  })}
                </div>
              )}
            </div>

            {data.uifEmployer>0&&<div style={{...card,background:'#f9fafb'}}>
              <div style={{fontSize:13,fontWeight:700,color:'#6b7280',marginBottom:8}}>UIF Liability (not in P&L)</div>
              <div style={{display:'flex',justifyContent:'space-between',fontSize:13}}>
                <span>Employer contribution</span><span style={{fontWeight:700}}>{fmt(data.uifEmployer)}</span>
              </div>
            </div>}
          </div>
        </div>
      </>}
    </div>
  </div>
}
