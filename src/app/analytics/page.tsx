'use client'
import { useStoreContext } from '@/lib/store-context'
import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const PRIMARY = '#1a5c38'
const DARK = '#0a1f12'
const VAT = 0.15

function fmt(n:number){return 'R\u00a0'+(n||0).toLocaleString('en-ZA',{minimumFractionDigits:2,maximumFractionDigits:2})}
function fmtK(n:number){return n>=1000?'R'+(n/1000).toFixed(1)+'k':'R'+n.toFixed(0)}
function thisMonth(){return new Date().toISOString().slice(0,7)}
function lastMonth(){const d=new Date();d.setMonth(d.getMonth()-1);return d.toISOString().slice(0,7)}
function monthRange(ym:string):[string,string]{const[y,m]=ym.split('-').map(Number);return[`${ym}-01`,new Date(y,m,0).toISOString().slice(0,10)]}
function getMonday(){const d=new Date(),day=(d.getDay()+6)%7;d.setDate(d.getDate()-day);return d.toISOString().slice(0,10)}
function pctColor(p:number){return p>=90?'#16a34a':p>=70?'#f59e0b':'#ef4444'}

// Pie chart SVG
function PieChart({slices,size=160}:{slices:{label:string;value:number;color:string}[];size?:number}){
  const total=slices.reduce((s,x)=>s+x.value,0)
  if(!total)return<div style={{width:size,height:size,borderRadius:'50%',background:'#f3f4f6',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,color:'#9ca3af'}}>No data</div>
  let angle=-Math.PI/2
  const r=size/2-8,cx=size/2,cy=size/2
  const paths=slices.filter(s=>s.value>0).map(s=>{
    const a=s.value/total*Math.PI*2
    const x1=cx+r*Math.cos(angle),y1=cy+r*Math.sin(angle)
    angle+=a
    const x2=cx+r*Math.cos(angle),y2=cy+r*Math.sin(angle)
    const large=a>Math.PI?1:0
    return{path:`M${cx},${cy} L${x1.toFixed(1)},${y1.toFixed(1)} A${r},${r} 0 ${large},1 ${x2.toFixed(1)},${y2.toFixed(1)} Z`,color:s.color,label:s.label,value:s.value}
  })
  return<svg width={size} height={size} style={{display:'block'}}>
    {paths.map((p,i)=><path key={i} d={p.path} fill={p.color} stroke="#fff" strokeWidth={2}/>)}
    <circle cx={cx} cy={cy} r={r*0.4} fill="#fff"/>
  </svg>
}

// Bar chart with breakeven line
function SalesBarChart({days,breakeven,height=160}:{days:{date:string;sales:number}[];breakeven:number;height?:number}){
  if(!days.length)return<div style={{height,display:'flex',alignItems:'center',justifyContent:'center',color:'#9ca3af',fontSize:13}}>No sales data</div>
  const maxVal=Math.max(...days.map(d=>d.sales/(1+VAT)),breakeven*1.2,1)
  const w=Math.max(24,Math.floor(560/Math.max(days.length,1)))
  const beY=height-(breakeven/maxVal)*height
  return<div style={{position:'relative',overflowX:'auto'}}>
    <svg width={Math.max(560,days.length*(w+4))} height={height+30} style={{display:'block'}}>
      {/* Breakeven line */}
      <line x1={0} y1={beY} x2={Math.max(560,days.length*(w+4))} y2={beY} stroke="#f59e0b" strokeWidth={2} strokeDasharray="6,4"/>
      <text x={4} y={beY-4} fontSize={10} fill="#f59e0b" fontWeight={700}>Target {fmtK(breakeven)}</text>
      {/* Bars */}
      {days.map((d,i)=>{
        const exVat=d.sales/(1+VAT)
        const bh=Math.max(2,(exVat/maxVal)*height)
        const hit=exVat>=breakeven
        const x=i*(w+4)+2
        const dayName=new Date(d.date+'T00:00:00').toLocaleDateString('en-ZA',{weekday:'short'}).slice(0,2)
        return<g key={d.date}>
          <rect x={x} y={height-bh} width={w} height={bh} rx={3} fill={hit?'#16a34a':'#ef4444'} opacity={0.85}/>
          <text x={x+w/2} y={height+14} textAnchor="middle" fontSize={9} fill="#6b7280">{dayName}</text>
          <text x={x+w/2} y={height-bh-3} textAnchor="middle" fontSize={8} fill={hit?'#16a34a':'#ef4444'}>{fmtK(exVat)}</text>
        </g>
      })}
    </svg>
  </div>
}

// Compliance trend chart
function ComplianceTrend({sessions}:{sessions:{date:string;pct:number}[]}){
  if(!sessions.length)return<div style={{height:100,display:'flex',alignItems:'center',justifyContent:'center',color:'#9ca3af',fontSize:13}}>No compliance data</div>
  const maxSessions=sessions.slice(-12)
  const h=100,w=560
  const barW=Math.floor(w/Math.max(maxSessions.length,1))-4
  return<svg width={w} height={h+24} style={{display:'block',width:'100%'}}>
    {maxSessions.map((s,i)=>{
      const bh=Math.max(2,(s.pct/100)*h)
      const x=i*(barW+4)+2
      const dayName=new Date(s.date+'T00:00:00').toLocaleDateString('en-ZA',{day:'numeric',month:'short'})
      return<g key={s.date}>
        <rect x={x} y={h-bh} width={barW} height={bh} rx={3} fill={pctColor(s.pct)} opacity={0.85}/>
        <text x={x+barW/2} y={h+14} textAnchor="middle" fontSize={9} fill="#6b7280">{dayName}</text>
        <text x={x+barW/2} y={h-bh-3} textAnchor="middle" fontSize={9} fill={pctColor(s.pct)} fontWeight={700}>{s.pct}%</text>
      </g>
    })}
    <line x1={0} y1={h*0.1} x2={w} y2={h*0.1} stroke="#16a34a" strokeWidth={1} strokeDasharray="4,3" opacity={0.5}/>
    <text x={4} y={h*0.1-3} fontSize={9} fill="#16a34a">90%</text>
  </svg>
}

export default function AnalyticsPage(){
  const { storeId: STORE_ID, ready: ctxReady } = useStoreContext()
  const router=useRouter()
  const [month,setMonth]=useState(thisMonth())
  const [view,setView]=useState<'period'|'compare'>('period')
  const [compareMonth,setCompareMonth]=useState(lastMonth())
  const [loading,setLoading]=useState(false)
  const [data,setData]=useState<any>(null)
  const [compareData,setCompareData]=useState<any>(null)

  async function fetchAnalytics(start:string,end:string){
    const lmDate=new Date(start);lmDate.setMonth(lmDate.getMonth()-1)
    const lmStart=lmDate.toISOString().slice(0,7)+'-01'
    const lmEnd=new Date(lmDate.getFullYear(),lmDate.getMonth()+1,0).toISOString().slice(0,10)

    const[invIdsRes,lmInvIdsRes]=await Promise.all([
      supabase.from('invoices').select('id').eq('store_id',STORE_ID).in('status',['received','paid']).gte('invoice_date',start).lte('invoice_date',end),
      supabase.from('invoices').select('id').eq('store_id',STORE_ID).in('status',['received','paid']).gte('invoice_date',lmStart).lte('invoice_date',lmEnd),
    ])
    const invIds=(invIdsRes.data||[]).map((r:any)=>r.id)
    const lmInvIds=(lmInvIdsRes.data||[]).map((r:any)=>r.id)

    const[cashUpsRes,expRes,invLinesRes,wagesRes,purchRes,wastRes,countsRes,lmExpRes,lmInvLinesRes,lmWagesRes,sessionsRes,empRatesRes,attendHoursRes]=await Promise.all([
      supabase.from('cash_ups').select('cash_up_date,cash_up_total').eq('store_id',STORE_ID).neq('status','draft').gte('cash_up_date',start).lte('cash_up_date',end).order('cash_up_date'),
      supabase.from('expenses').select('amount,category_key,category_name').eq('store_id',STORE_ID).gte('expense_date',start).lte('expense_date',end),
      invIds.length?supabase.from('invoice_lines').select('amount,vat_amount,category_key').in('invoice_id',invIds):Promise.resolve({data:[]}),
      supabase.from('wage_payments').select('net_pay,gross_pay,uif_employer').eq('store_id',STORE_ID).gte('paid_date',start).lte('paid_date',end),
      supabase.from('stock_purchases').select('total_cost').eq('store_id',STORE_ID).gte('purchase_date',start).lte('purchase_date',end),
      supabase.from('stock_wastage').select('total_cost').eq('store_id',STORE_ID).gte('wastage_date',start).lte('wastage_date',end),
      supabase.from('stock_counts').select('id,count_date').eq('store_id',STORE_ID).eq('status','completed').order('count_date',{ascending:false}).limit(20),
      supabase.from('expenses').select('amount,category_key').eq('store_id',STORE_ID).gte('expense_date',lmStart).lte('expense_date',lmEnd),
      lmInvIds.length?supabase.from('invoice_lines').select('amount,vat_amount,category_key').in('invoice_id',lmInvIds):Promise.resolve({data:[]}),
      supabase.from('wage_payments').select('gross_pay').eq('store_id',STORE_ID).gte('paid_date',lmStart).lte('paid_date',lmEnd),
      // Compliance: fetch last 14 daily sessions regardless of selected period (rolling window)
      supabase.from('daily_sessions').select('session_date,id').eq('store_id',STORE_ID).eq('session_type','daily').order('session_date',{ascending:false}).limit(14),
      // Estimated wages: employee hourly rates for this store only
      supabase.from('employees').select('id,hourly_rate').eq('store_id',STORE_ID).eq('is_active',true),
      // placeholder — attendance fetched after we have employee IDs (prevents cross-store data leak)
      Promise.resolve({data:[]}),
    ])

    const dailyCashUps:Record<string,number>={}
    for(const cu of cashUpsRes.data||[])dailyCashUps[cu.cash_up_date]=(dailyCashUps[cu.cash_up_date]||0)+Number(cu.cash_up_total||0)
    const sales=Object.values(dailyCashUps).reduce((s,v)=>s+v,0)
    const salesExclVat=sales/(1+VAT)
    const daysArr=Object.entries(dailyCashUps).map(([date,s])=>({date,sales:s}))

    const purchases=(purchRes.data||[]).reduce((s:number,r:any)=>s+Number(r.total_cost||0),0)
    const wastage=(wastRes.data||[]).reduce((s:number,r:any)=>s+Number(r.total_cost||0),0)
    const wagesGross=(wagesRes.data||[]).reduce((s:number,r:any)=>s+Number(r.gross_pay||0),0)
    const uifEmployer=(wagesRes.data||[]).reduce((s:number,r:any)=>s+Number(r.uif_employer||0),0)
    // Estimated wages from current hours × hourly rate (used when payroll not yet marked paid)
    const empRateMap:Record<string,number>={}
    const empIds:string[]=[]
    for(const e of empRatesRes.data||[]){empRateMap[e.id]=Number(e.hourly_rate||0);empIds.push(e.id)}
    // Fetch attendance only for this store's employees (scoped query — no full-table scan)
    let estimatedWages=0
    if(empIds.length>0&&wagesGross===0){
      const{data:attendData}=await supabase
        .from('attendance')
        .select('employee_id,hours_worked')
        .in('employee_id',empIds)
        .gte('work_date',start)
        .lte('work_date',end)
      estimatedWages=(attendData||[]).reduce((s:number,a:any)=>s+(Number(a.hours_worked||0)*(empRateMap[a.employee_id]||0)),0)
    }
    // Use actual paid wages if available; otherwise fall back to live estimate
    const displayWages=wagesGross>0?wagesGross:estimatedWages
    const isWageEstimate=wagesGross===0&&estimatedWages>0

    const counts=countsRes.data||[]
    const openingCount=counts.find((c:any)=>c.count_date<start)
    const closingCount=counts.find((c:any)=>c.count_date<=end)
    async function countValue(id?:string){
      if(!id)return 0
      const{data:lines}=await supabase.from('stock_count_lines').select('actual_qty,unit_cost').eq('stock_count_id',id)
      return(lines||[]).reduce((s:number,l:any)=>s+Number(l.actual_qty||0)*Number(l.unit_cost||0),0)
    }
    const[openingValue,closingValue]=await Promise.all([countValue(openingCount?.id),countValue(closingCount?.id)])
    const foodCostAmount=openingValue+purchases-closingValue-wastage
    const foodCostPct=salesExclVat>0?foodCostAmount/salesExclVat*100:0

    const expByCat:Record<string,{name:string;total:number;color:string}>= {}
    const COLORS=['#3b82f6','#8b5cf6','#06b6d4','#f59e0b','#84cc16','#ec4899','#14b8a6','#f97316','#a855f7','#0ea5e9']
    let ci=0
    // Keys that represent food/product cost — excluded from operating expenses (already in food cost calc)
    const isFoodCostKey=(k:string)=>!k||['cost_of_sales','stock_cogs','cogs'].includes(k)||k.toLowerCase().includes('cog')||k.toLowerCase().startsWith('stock_c')
    const addExp=(key:string,name:string,amt:number)=>{
      const k=key||'other'
      if(isFoodCostKey(k))return
      if(!expByCat[k]){expByCat[k]={name:name||k,total:0,color:COLORS[ci%COLORS.length]};ci++}
      expByCat[k].total+=amt
    }
    for(const e of expRes.data||[])addExp(e.category_key,e.category_name,Number(e.amount||0))
    for(const l of invLinesRes.data||[]){
      const exVat=Number(l.amount||0)-Number(l.vat_amount||0)
      addExp(l.category_key,l.category_key,exVat>0?exVat:Number(l.amount||0))
    }
    const otherExpenses=Object.values(expByCat).reduce((s,c)=>s+c.total,0)
    const totalOperatingCosts=displayWages+otherExpenses

    const lmWages=(lmWagesRes.data||[]).reduce((s:number,r:any)=>s+Number(r.gross_pay||0),0)
    let lmOpExp=0
    for(const e of lmExpRes.data||[]){if(!isFoodCostKey(e.category_key||'other'))lmOpExp+=Number(e.amount||0)}
    for(const l of lmInvLinesRes.data||[]){
      if(isFoodCostKey(l.category_key||'other'))continue
      const exVat=Number(l.amount||0)-Number(l.vat_amount||0)
      lmOpExp+=(exVat>0?exVat:Number(l.amount||0))
    }
    const lastMonthTotal=lmWages+lmOpExp

    const daysInPeriod=Math.round((new Date(end).getTime()-new Date(start).getTime())/86400000)+1
    const todayStr=new Date().toISOString().slice(0,10)
    const daysElapsed=todayStr<=end?Math.round((new Date(Math.min(new Date(todayStr).getTime(),new Date(end).getTime())).getTime()-new Date(start).getTime())/86400000)+1:daysInPeriod
    const pctElapsed=daysElapsed/daysInPeriod
    const useLastMonth=pctElapsed<0.5&&lastMonthTotal>0
    const breakevenBase=useLastMonth?lastMonthTotal:totalOperatingCosts
    const dailyBreakeven=breakevenBase/daysInPeriod
    const monthlyBreakeven=breakevenBase
    const dailySalesAvg=daysElapsed>0?salesExclVat/daysElapsed:0
    const daysAbove=Object.values(dailyCashUps).filter(v=>v/(1+VAT)>=dailyBreakeven).length
    const daysBelow=Object.keys(dailyCashUps).length-daysAbove

    const grossProfit=salesExclVat-foodCostAmount
    const grossMarginPct=salesExclVat>0?grossProfit/salesExclVat*100:0
    const totalCosts=foodCostAmount+totalOperatingCosts
    const netProfit=salesExclVat-totalCosts
    const netMarginPct=salesExclVat>0?netProfit/salesExclVat*100:0

    // Compliance sessions with scores
    const sessionScores=await Promise.all((sessionsRes.data||[]).slice(-12).map(async(s:any)=>{
      const[{data:total},{data:done}]=await Promise.all([
        supabase.from('checklist_items').select('id',{count:'exact'}).eq('session_id',s.id),
        supabase.from('checklist_items').select('id',{count:'exact'}).eq('session_id',s.id).eq('completed',true),
      ])
      const t=total?.length||0,d=done?.length||0
      return{date:s.session_date,pct:t>0?Math.round(d/t*100):0}
    }))
    const avgCompliance=sessionScores.length>0?Math.round(sessionScores.reduce((s,x)=>s+x.pct,0)/sessionScores.length):0

    // Pie slices for expense breakdown
    const pieSlices=[
      {label:'Food Cost',value:foodCostAmount,color:'#ef4444'},
      {label:isWageEstimate?'Wages (est.)':'Wages',value:displayWages,color:'#8b5cf6',est:isWageEstimate},
      ...Object.entries(expByCat).map(([,c])=>({label:c.name,value:c.total,color:c.color})),
    ].filter(s=>s.value>0)

    return{
      sales,salesExclVat,dailyCashUps,daysArr,purchases,wastage,wagesGross,estimatedWages,displayWages,isWageEstimate,uifEmployer,
      openingValue,closingValue,foodCostAmount,foodCostPct,
      grossProfit,grossMarginPct,expByCat,otherExpenses,pieSlices,
      totalOperatingCosts,dailyBreakeven,monthlyBreakeven,
      useLastMonth,daysInPeriod,daysElapsed,daysAbove,daysBelow,
      dailySalesAvg,totalCosts,netProfit,netMarginPct,
      sessionScores,avgCompliance,uifEmployer,
    }
  }

  const load=useCallback(async()=>{
    setLoading(true)
    const[s,e]=monthRange(month)
    const d=await fetchAnalytics(s,e)
    setData(d)
    if(view==='compare'){const[cs,ce]=monthRange(compareMonth);setCompareData(await fetchAnalytics(cs,ce))}
    setLoading(false)
  },[month,view,compareMonth])

  useEffect(()=>{load()},[load])

  const card:React.CSSProperties={background:'#fff',borderRadius:16,border:'1px solid #eef2ee',padding:20,boxShadow:'0 2px 8px rgba(0,0,0,0.04)'}

  function KPI({label,value,sub,color,big}:{label:string;value:string;sub?:string;color?:string;big?:boolean}){
    return<div style={{...card,textAlign:'center'}}>
      <div style={{fontSize:11,fontWeight:700,color:'#9ca3af',textTransform:'uppercase',letterSpacing:0.5,marginBottom:6}}>{label}</div>
      <div style={{fontSize:big?28:20,fontWeight:800,color:color||'#111'}}>{value}</div>
      {sub&&<div style={{fontSize:12,color:'#9ca3af',marginTop:4}}>{sub}</div>}
    </div>
  }

  function CompareRow({label,curr,prev}:{label:string;curr:number;prev:number}){
    const delta=curr-prev,up=delta>=0,dp=prev>0?Math.abs(delta/prev*100):0
    return<div style={{display:'flex',alignItems:'center',padding:'10px 0',borderBottom:'1px solid #f3f4f6'}}>
      <span style={{flex:1,fontSize:13,color:'#374151',fontWeight:600}}>{label}</span>
      <span style={{width:120,textAlign:'right',fontSize:13,fontWeight:700}}>{fmt(curr)}</span>
      <span style={{width:120,textAlign:'right',fontSize:13,color:'#9ca3af'}}>{fmt(prev)}</span>
      <span style={{width:80,textAlign:'right',fontSize:12,fontWeight:700,color:up?'#16a34a':'#dc2626'}}>{up?'▲':'▼'}{dp.toFixed(1)}%</span>
    </div>
  }

  const periodLabel=new Date(month+'-01').toLocaleDateString('en-ZA',{month:'long',year:'numeric'})

  return<div style={{minHeight:'100vh',background:'#f0f4f0',fontFamily:'system-ui,sans-serif'}}>
    {/* Header */}
    <div style={{background:`linear-gradient(135deg,${DARK},${PRIMARY})`,padding:'20px 32px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
      <div style={{display:'flex',alignItems:'center',gap:16}}>
        <button onClick={()=>router.push('/dashboard')} style={{background:'rgba(255,255,255,0.15)',color:'#fff',border:'none',borderRadius:8,padding:'6px 14px',cursor:'pointer',fontSize:13}}>← Back</button>
        <div>
          <div style={{color:'#fff',fontWeight:800,fontSize:22}}>📊 Analytics</div>
          <div style={{color:'rgba(255,255,255,0.65)',fontSize:13}}>P&L · Breakeven · Compliance · Expense Breakdown</div>
        </div>
      </div>
      <div style={{display:'flex',alignItems:'center',gap:10}}>
        <div style={{display:'flex',background:'rgba(255,255,255,0.15)',borderRadius:10,padding:3}}>
          {(['period','compare'] as const).map(v=>(
            <button key={v} onClick={()=>setView(v)} style={{padding:'6px 14px',borderRadius:8,border:'none',background:view===v?'#fff':'transparent',color:view===v?PRIMARY:'rgba(255,255,255,0.8)',fontWeight:700,fontSize:12,cursor:'pointer'}}>
              {v==='period'?'Single Month':'Compare'}
            </button>
          ))}
        </div>
        <input type="month" value={month} onChange={e=>setMonth(e.target.value)} style={{padding:'7px 12px',borderRadius:10,border:'1.5px solid rgba(255,255,255,0.3)',fontSize:13,background:'rgba(255,255,255,0.15)',color:'#fff'}}/>
        {view==='compare'&&<>
          <span style={{color:'rgba(255,255,255,0.6)',fontSize:14}}>vs</span>
          <input type="month" value={compareMonth} onChange={e=>setCompareMonth(e.target.value)} style={{padding:'7px 12px',borderRadius:10,border:'1.5px solid rgba(255,255,255,0.3)',fontSize:13,background:'rgba(255,255,255,0.15)',color:'#fff'}}/>
        </>}
      </div>
    </div>

    <div style={{padding:'24px 32px',maxWidth:1400,margin:'0 auto'}}>
      {loading?<div style={{textAlign:'center',padding:80,color:'#9ca3af',fontSize:16}}>⏳ Calculating…</div>:!data?null:<>

        {/* TOP KPIs */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(6,1fr)',gap:12,marginBottom:20}}>
          <KPI label="Sales (incl VAT)" value={fmt(data.sales)} sub={`Ex-VAT: ${fmt(data.salesExclVat)}`} big/>
          <KPI label="Gross Profit" value={fmt(data.grossProfit)} sub={`${data.grossMarginPct.toFixed(1)}% margin`} color={data.grossMarginPct>=55?'#16a34a':data.grossMarginPct>=40?'#d97706':'#dc2626'} big/>
          <KPI label="Net Profit/Loss" value={fmt(data.netProfit)} sub={`${data.netMarginPct.toFixed(1)}% of sales`} color={data.netProfit>=0?'#16a34a':'#dc2626'} big/>
          <KPI label="Food Cost %" value={data.salesExclVat>0?data.foodCostPct.toFixed(1)+'%':'—'} sub={data.foodCostPct<=35?'✓ On target':'⚠️ Above target'} color={data.foodCostPct<=35?'#16a34a':data.foodCostPct<=40?'#d97706':'#dc2626'} big/>
          <KPI label="Daily Breakeven" value={fmt(data.dailyBreakeven)} sub={`Monthly: ${fmt(data.monthlyBreakeven)}`} color="#f59e0b" big/>
          <KPI label="Compliance" value={data.avgCompliance>0?data.avgCompliance+'%':'—'} sub={data.sessionScores.length+' sessions this month'} color={pctColor(data.avgCompliance)} big/>
        </div>

        {/* ROW 1: Sales chart + Breakeven tracker */}
        <div style={{display:'grid',gridTemplateColumns:'2fr 1fr',gap:16,marginBottom:16}}>
          {/* Daily sales bar chart */}
          <div style={{...card}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
              <div>
                <div style={{fontSize:15,fontWeight:700}}>Daily Sales vs Breakeven Target</div>
                <div style={{fontSize:12,color:'#9ca3af'}}>{periodLabel} · green = above target · red = below</div>
              </div>
              <div style={{display:'flex',gap:12,alignItems:'center',fontSize:12}}>
                <span style={{display:'flex',alignItems:'center',gap:4}}><span style={{width:12,height:12,borderRadius:2,background:'#16a34a',display:'inline-block'}}/>Above</span>
                <span style={{display:'flex',alignItems:'center',gap:4}}><span style={{width:12,height:12,borderRadius:2,background:'#ef4444',display:'inline-block'}}/>Below</span>
                <span style={{display:'flex',alignItems:'center',gap:4}}><span style={{width:16,height:2,background:'#f59e0b',display:'inline-block'}}/> Target</span>
              </div>
            </div>
            <SalesBarChart days={data.daysArr} breakeven={data.dailyBreakeven}/>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,marginTop:12}}>
              <div style={{textAlign:'center',background:'#f0fdf4',borderRadius:8,padding:'8px 0'}}>
                <div style={{fontSize:20,fontWeight:800,color:'#16a34a'}}>{data.daysAbove}</div>
                <div style={{fontSize:11,color:'#9ca3af'}}>days above target</div>
              </div>
              <div style={{textAlign:'center',background:'#fef2f2',borderRadius:8,padding:'8px 0'}}>
                <div style={{fontSize:20,fontWeight:800,color:'#dc2626'}}>{data.daysBelow}</div>
                <div style={{fontSize:11,color:'#9ca3af'}}>days below target</div>
              </div>
              <div style={{textAlign:'center',background:'#fffbeb',borderRadius:8,padding:'8px 0'}}>
                <div style={{fontSize:15,fontWeight:800,color:'#f59e0b'}}>{fmt(data.dailySalesAvg)}</div>
                <div style={{fontSize:11,color:'#9ca3af'}}>avg/day (ex-VAT)</div>
              </div>
            </div>
          </div>

          {/* Breakeven card */}
          <div style={{...card,border:`1.5px solid ${data.dailySalesAvg>=data.dailyBreakeven?'#bbf7d0':'#fecaca'}`}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:4}}>
              <div style={{fontSize:15,fontWeight:700}}>Breakeven</div>
              {data.useLastMonth&&<span style={{fontSize:11,background:'#fef9c3',color:'#854d0e',borderRadius:6,padding:'2px 8px',fontWeight:600}}>Est.</span>}
            </div>
            <div style={{fontSize:12,color:'#9ca3af',marginBottom:16}}>
              All operating costs ÷ days in month = daily target you must hit just to cover expenses before any profit
            </div>
            <div style={{textAlign:'center',background:'#f8faf8',borderRadius:12,padding:'16px 8px',marginBottom:12}}>
              <div style={{fontSize:11,color:'#9ca3af',marginBottom:2}}>DAILY TARGET (ex-VAT)</div>
              <div style={{fontSize:32,fontWeight:800,color:'#111'}}>{fmt(data.dailyBreakeven)}</div>
            </div>
            <div style={{fontSize:12,color:'#6b7280',marginBottom:8,textAlign:'center'}}>
              = {fmt(data.monthlyBreakeven)} ÷ {data.daysInPeriod} days
            </div>
            {/* Progress bar: avg daily vs target */}
            <div style={{marginTop:8}}>
              <div style={{display:'flex',justifyContent:'space-between',fontSize:12,marginBottom:4}}>
                <span style={{color:'#6b7280'}}>Your avg daily (ex-VAT)</span>
                <span style={{fontWeight:700,color:data.dailySalesAvg>=data.dailyBreakeven?'#16a34a':'#dc2626'}}>{fmt(data.dailySalesAvg)}</span>
              </div>
              <div style={{height:12,background:'#f3f4f6',borderRadius:6}}>
                <div style={{height:'100%',width:`${Math.min(100,data.dailyBreakeven>0?data.dailySalesAvg/data.dailyBreakeven*100:0)}%`,background:data.dailySalesAvg>=data.dailyBreakeven?'#16a34a':'#ef4444',borderRadius:6}}/>
              </div>
              <div style={{display:'flex',justifyContent:'space-between',fontSize:11,color:'#9ca3af',marginTop:3}}>
                <span>R0</span><span>Target</span>
              </div>
            </div>
            <div style={{marginTop:12,padding:'10px',borderRadius:10,background:data.dailySalesAvg>=data.dailyBreakeven?'#f0fdf4':'#fef2f2',textAlign:'center'}}>
              <div style={{fontSize:13,fontWeight:700,color:data.dailySalesAvg>=data.dailyBreakeven?'#16a34a':'#dc2626'}}>
                {data.dailySalesAvg>=data.dailyBreakeven?'✓ Trading above breakeven':'✗ Trading below breakeven'}
              </div>
              <div style={{fontSize:12,color:'#6b7280',marginTop:2}}>
                {fmt(Math.abs(data.dailySalesAvg-data.dailyBreakeven))}/day {data.dailySalesAvg>=data.dailyBreakeven?'above':'below'} target
              </div>
            </div>
          </div>
        </div>

        {/* ROW 2: Expense Pie + P&L + Compliance */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1.2fr 1fr',gap:16,marginBottom:16}}>
          {/* Expense Pie */}
          <div style={{...card}}>
            <div style={{fontSize:15,fontWeight:700,marginBottom:4}}>Expense Breakdown</div>
            <div style={{fontSize:12,color:'#9ca3af',marginBottom:16}}>% of ex-VAT sales · {periodLabel}</div>
            <div style={{display:'flex',justifyContent:'center',marginBottom:16}}>
              <PieChart slices={data.pieSlices} size={180}/>
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:6}}>
              {data.pieSlices.map((s:any,i:number)=>{
                const total=data.pieSlices.reduce((x:number,y:any)=>x+y.value,0)
                return<div key={i} style={{display:'flex',alignItems:'center',gap:8,fontSize:12}}>
                  <div style={{width:10,height:10,borderRadius:2,background:s.color,flexShrink:0}}/>
                  <span style={{flex:1,color:'#374151'}}>{s.label}</span>
                  <span style={{fontWeight:700}}>{fmt(s.value)}</span>
                  <span style={{color:'#9ca3af',width:36,textAlign:'right'}}>{total>0?(s.value/total*100).toFixed(1):0}%</span>
                </div>
              })}
            </div>
          </div>

          {/* P&L waterfall */}
          <div style={{...card}}>
            <div style={{fontSize:15,fontWeight:700,marginBottom:4}}>P&L Summary</div>
            <div style={{fontSize:12,color:'#9ca3af',marginBottom:16}}>All figures ex-VAT · % of ex-VAT sales</div>
            {[
              {label:'Sales Revenue',value:data.salesExclVat,color:'#16a34a',pct:100,bold:true},
              {label:'Food Cost',value:-data.foodCostAmount,color:'#ef4444',pct:data.foodCostPct},
              {label:'─── Gross Profit',value:data.grossProfit,color:data.grossMarginPct>=55?'#16a34a':'#d97706',pct:data.grossMarginPct,bold:true},
              {label:data.isWageEstimate?'Wages & Salaries (est.)':'Wages & Salaries',value:-data.displayWages,color:'#8b5cf6',pct:data.salesExclVat>0?data.displayWages/data.salesExclVat*100:0,est:data.isWageEstimate},
              ...Object.values(data.expByCat).map((c:any)=>({label:c.name,value:-c.total,color:c.color,pct:data.salesExclVat>0?c.total/data.salesExclVat*100:0})),
              {label:'─── Net Profit/Loss',value:data.netProfit,color:data.netProfit>=0?'#16a34a':'#dc2626',pct:data.netMarginPct,bold:true},
            ].map((row:any,i:number)=>(
              <div key={i} style={{display:'flex',justifyContent:'space-between',padding:'7px 0',borderBottom:'1px solid #f8f8f8',alignItems:'center'}}>
                <span style={{fontSize:13,color:'#374151',fontWeight:row.bold?700:400,flex:1,display:'flex',alignItems:'center',gap:6}}>{row.label}{row.est&&<span title="Estimated from hours logged × hourly rate. Updates to actual once payroll is marked as paid." style={{fontSize:10,fontWeight:700,background:'#fef3c7',color:'#d97706',borderRadius:4,padding:'1px 5px',cursor:'help',border:'1px solid #fde68a'}}>EST</span>}</span>
                <span style={{fontSize:13,fontWeight:700,color:row.color,width:110,textAlign:'right'}}>{fmt(Math.abs(row.value))}</span>
                <span style={{fontSize:11,color:'#9ca3af',width:40,textAlign:'right'}}>{row.pct?.toFixed(1)}%</span>
              </div>
            ))}
          </div>

          {/* Compliance */}
          <div style={{...card}}>
            <div style={{fontSize:15,fontWeight:700,marginBottom:4}}>Compliance Trend</div>
            <div style={{fontSize:12,color:'#9ca3af',marginBottom:12}}>Last 12 daily sessions · target: 90%</div>
            <div style={{display:'flex',alignItems:'center',gap:16,marginBottom:16}}>
              <div style={{textAlign:'center'}}>
                <div style={{fontSize:40,fontWeight:800,color:pctColor(data.avgCompliance)}}>{data.avgCompliance}%</div>
                <div style={{fontSize:12,color:'#9ca3af'}}>avg this month</div>
              </div>
              <div style={{flex:1}}>
                <div style={{height:8,background:'#f3f4f6',borderRadius:4,marginBottom:6}}>
                  <div style={{height:'100%',width:`${data.avgCompliance}%`,background:pctColor(data.avgCompliance),borderRadius:4}}/>
                </div>
                <div style={{display:'flex',justifyContent:'space-between',fontSize:11,color:'#9ca3af'}}>
                  <span>0%</span><span style={{color:'#16a34a'}}>90% target</span><span>100%</span>
                </div>
              </div>
            </div>
            <ComplianceTrend sessions={data.sessionScores}/>
            {data.sessionScores.length===0&&<div style={{textAlign:'center',color:'#9ca3af',fontSize:13,marginTop:8}}>No compliance sessions recorded this month</div>}
          </div>
        </div>

        {/* ROW 3: Compare (if active) */}
        {view==='compare'&&compareData&&<div style={{...card,marginBottom:16}}>
          <div style={{fontSize:15,fontWeight:700,marginBottom:4}}>Month-on-Month Comparison</div>
          <div style={{fontSize:12,color:'#9ca3af',marginBottom:16}}>
            <span style={{fontWeight:700,color:'#111'}}>{new Date(month+'-01').toLocaleDateString('en-ZA',{month:'long',year:'numeric'})}</span>
            {' vs '}
            <span style={{color:'#6b7280'}}>{new Date(compareMonth+'-01').toLocaleDateString('en-ZA',{month:'long',year:'numeric'})}</span>
          </div>
          <div style={{display:'flex',padding:'6px 0',borderBottom:'2px solid #f3f4f6',marginBottom:4}}>
            <span style={{flex:1,fontSize:11,fontWeight:700,color:'#9ca3af',textTransform:'uppercase'}}>Category</span>
            <span style={{width:120,textAlign:'right',fontSize:11,fontWeight:700,color:'#9ca3af',textTransform:'uppercase'}}>{new Date(month+'-01').toLocaleDateString('en-ZA',{month:'short'})}</span>
            <span style={{width:120,textAlign:'right',fontSize:11,fontWeight:700,color:'#9ca3af',textTransform:'uppercase'}}>{new Date(compareMonth+'-01').toLocaleDateString('en-ZA',{month:'short'})}</span>
            <span style={{width:80,textAlign:'right',fontSize:11,fontWeight:700,color:'#9ca3af',textTransform:'uppercase'}}>Change</span>
          </div>
          {[
            {label:'Sales (incl VAT)',curr:data.sales,prev:compareData.sales},
            {label:'Sales (ex-VAT)',curr:data.salesExclVat,prev:compareData.salesExclVat},
            {label:'Food Cost',curr:data.foodCostAmount,prev:compareData.foodCostAmount},
            {label:'Food Cost %',curr:data.foodCostPct,prev:compareData.foodCostPct,isPct:true},
            {label:data.isWageEstimate?'Wages (est.)':'Wages',curr:data.displayWages,prev:compareData.displayWages??compareData.wagesGross},
            {label:'Other Expenses',curr:data.otherExpenses,prev:compareData.otherExpenses},
            {label:'Net Profit/Loss',curr:data.netProfit,prev:compareData.netProfit},
            {label:'Daily Breakeven',curr:data.dailyBreakeven,prev:compareData.dailyBreakeven},
            {label:'Compliance %',curr:data.avgCompliance,prev:compareData.avgCompliance,isPct:true},
          ].map((row:any)=><CompareRow key={row.label} label={row.label} curr={row.curr} prev={row.prev}/>)}
        </div>}

        {/* UIF */}
        {data.uifEmployer>0&&<div style={{...card,background:'#fffbeb',border:'1px solid #fde68a'}}>
          <div style={{fontSize:13,fontWeight:700,color:'#92400e'}}>⚠️ UIF Employer Contribution — R{data.uifEmployer.toFixed(2)} (not included in P&L above, payable to SARS)</div>
        </div>}
      </>}
    </div>
  </div>
}
