'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

const STORE_ID = '05328298-fc27-4c9f-b091-bb7f6598b601';
const ORG_ID = 'e903386b-133a-4bad-b054-ef7ef616a3ff';
const STORE_NAME = 'Mochachos Hartswater';
const PRIMARY = '#1a5c38';
const DARK = '#0a1f12';

type CashUp = {
  id: string;
  cash_up_date: string;
  status: string;
  r200: number; r100: number; r50: number; r20: number; r10: number;
  r5: number; r2: number; r1: number; r050: number; r020: number;
  r010: number; r005: number; total_cash: number;
  float_r200: number; float_r100: number; float_r50: number; float_r20: number;
  float_r10: number; float_r5: number; float_r2: number; float_r1: number;
  float_r050: number; float_r020: number; float_r010: number; float_r005: number;
  float_total: number; bank_total: number;
  previous_float: number; eft_total: number; payouts: number; a_total: number;
  pos_slip_total: number; voids: number; cash_up_total: number; variance: number;
  banked: boolean; bank_deposit_amount: number | null; bank_reference: string | null;
  customer_count: number; average_spend: number;
  notes: string | null; signature_url: string | null;
  signed_by_name: string | null; signed_off_at: string | null;
};

type StaffMember = {
  id: string;
  full_name: string;
  role: string;
};

const DENOMS = [
  { key: 'r200', label: 'R200', value: 200 },
  { key: 'r100', label: 'R100', value: 100 },
  { key: 'r50', label: 'R50', value: 50 },
  { key: 'r20', label: 'R20', value: 20 },
  { key: 'r10', label: 'R10', value: 10 },
  { key: 'r5', label: 'R5', value: 5 },
  { key: 'r2', label: 'R2', value: 2 },
  { key: 'r1', label: 'R1', value: 1 },
  { key: 'r050', label: 'R0.50', value: 0.5 },
  { key: 'r020', label: 'R0.20', value: 0.2 },
  { key: 'r010', label: 'R0.10', value: 0.1 },
  { key: 'r005', label: 'R0.05', value: 0.05 },
];

function fmt(n: number) { return `R ${n.toFixed(2)}`; }

export default function CashUpPage() {
  const router = useRouter();
  const [cashUp, setCashUp] = useState<CashUp | null>(null);
  const [history, setHistory] = useState<CashUp[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeStep, setActiveStep] = useState(1);

  const [bankDenoms, setBankDenoms] = useState<Record<string, number>>({
    r200: 0, r100: 0, r50: 0, r20: 0, r10: 0, r5: 0,
    r2: 0, r1: 0, r050: 0, r020: 0, r010: 0, r005: 0
  });
  const [floatDenoms, setFloatDenoms] = useState<Record<string, number>>({
    r200: 0, r100: 0, r50: 0, r20: 0, r10: 0, r5: 0,
    r2: 0, r1: 0, r050: 0, r020: 0, r010: 0, r005: 0
  });
  const [recon, setRecon] = useState({
    previous_float: '', eft_total: '', payouts: '',
    pos_slip_total: '', voids: '',
    banked: false, bank_deposit_amount: '', bank_reference: ''
  });
  const [perf, setPerf] = useState({ customer_count: '' });
  const [notes, setNotes] = useState('');
  const [signedByName, setSignedByName] = useState('');

  useEffect(() => { checkAuthAndLoad(); }, []);

  async function checkAuthAndLoad() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push('/login'); return; }
    await Promise.all([loadCashUp(), loadStaff()]);
  }

  async function loadStaff() {
    const { data } = await supabase
      .from('store_staff')
      .select('id, full_name, role')
      .eq('store_id', STORE_ID)
      .order('full_name');
    setStaff(data || []);
  }

  async function loadCashUp() {
    setLoading(true);
    const today = new Date().toISOString().split('T')[0];
    const { data: todayCashUp } = await supabase
      .from('cash_ups').select('*')
      .eq('store_id', STORE_ID)
      .eq('cash_up_date', today)
      .maybeSingle();

    if (todayCashUp) {
      setCashUp(todayCashUp);
      populateForm(todayCashUp);
    } else {
      // Auto-fill previous float from yesterday
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const { data: yesterdayCashUp } = await supabase
        .from('cash_ups')
        .select('float_total')
        .eq('store_id', STORE_ID)
        .eq('cash_up_date', yesterday.toISOString().split('T')[0])
        .maybeSingle();
      if (yesterdayCashUp?.float_total) {
        setRecon(p => ({ ...p, previous_float: yesterdayCashUp.float_total.toString() }));
      }
    }

    const { data: hist } = await supabase
      .from('cash_ups').select('*')
      .eq('store_id', STORE_ID)
      .order('cash_up_date', { ascending: false })
      .limit(14);
    setHistory(hist || []);
    setLoading(false);
  }

  function populateForm(c: CashUp) {
    setBankDenoms({ r200: c.r200, r100: c.r100, r50: c.r50, r20: c.r20, r10: c.r10, r5: c.r5, r2: c.r2, r1: c.r1, r050: c.r050, r020: c.r020, r010: c.r010, r005: c.r005 });
    setFloatDenoms({ r200: c.float_r200, r100: c.float_r100, r50: c.float_r50, r20: c.float_r20, r10: c.float_r10, r5: c.float_r5, r2: c.float_r2, r1: c.float_r1, r050: c.float_r050, r020: c.float_r020, r010: c.float_r010, r005: c.float_r005 });
    setRecon({ previous_float: c.previous_float.toString(), eft_total: c.eft_total.toString(), payouts: c.payouts.toString(), pos_slip_total: c.pos_slip_total.toString(), voids: c.voids.toString(), banked: c.banked, bank_deposit_amount: c.bank_deposit_amount?.toString() || '', bank_reference: c.bank_reference || '' });
    setPerf({ customer_count: c.customer_count.toString() });
    setNotes(c.notes || '');
    setSignedByName(c.signed_by_name || '');
  }

  const bankTotal = DENOMS.reduce((sum, d) => sum + (bankDenoms[d.key] || 0) * d.value, 0);
  const floatTotal = DENOMS.reduce((sum, d) => sum + (floatDenoms[d.key] || 0) * d.value, 0);
  const totalCash = bankTotal + floatTotal;
  const prevFloat = parseFloat(recon.previous_float) || 0;
  const eft = parseFloat(recon.eft_total) || 0;
  const payouts = parseFloat(recon.payouts) || 0;
  const aTotal = totalCash - prevFloat + eft + payouts;
  const posSlip = parseFloat(recon.pos_slip_total) || 0;
  const voids = parseFloat(recon.voids) || 0;
  const cashUpTotal = posSlip - voids;
  const variance = aTotal - cashUpTotal;
  const customers = parseInt(perf.customer_count) || 0;
  const avgSpend = customers > 0 ? cashUpTotal / customers : 0;

  const varianceColor = variance === 0 ? PRIMARY : variance > 0 ? '#f59e0b' : '#ef4444';
  const varianceLabel = variance === 0 ? 'BALANCED' : variance > 0 ? `OVER by ${fmt(Math.abs(variance))}` : `SHORT by ${fmt(Math.abs(variance))}`;
  const isSignedOff = cashUp?.status === 'signed_off';
  const readOnly = isSignedOff;

  function buildPayload(status: string) {
    return {
      store_id: STORE_ID,
      organisation_id: ORG_ID,
      cash_up_date: new Date().toISOString().split('T')[0],
      r200: bankDenoms.r200, r100: bankDenoms.r100, r50: bankDenoms.r50,
      r20: bankDenoms.r20, r10: bankDenoms.r10, r5: bankDenoms.r5,
      r2: bankDenoms.r2, r1: bankDenoms.r1, r050: bankDenoms.r050,
      r020: bankDenoms.r020, r010: bankDenoms.r010, r005: bankDenoms.r005,
      float_r200: floatDenoms.r200, float_r100: floatDenoms.r100, float_r50: floatDenoms.r50,
      float_r20: floatDenoms.r20, float_r10: floatDenoms.r10, float_r5: floatDenoms.r5,
      float_r2: floatDenoms.r2, float_r1: floatDenoms.r1, float_r050: floatDenoms.r050,
      float_r020: floatDenoms.r020, float_r010: floatDenoms.r010, float_r005: floatDenoms.r005,
      float_total: floatTotal, bank_total: bankTotal, total_cash: totalCash,
      previous_float: prevFloat, eft_total: eft, payouts,
      a_total: aTotal, pos_slip_total: posSlip, voids,
      cash_up_total: cashUpTotal, variance,
      banked: recon.banked,
      bank_deposit_amount: recon.bank_deposit_amount ? parseFloat(recon.bank_deposit_amount) : null,
      bank_reference: recon.bank_reference || null,
      customer_count: customers, average_spend: avgSpend,
      notes: notes || null,
      status,
    };
  }

  async function saveDraft() {
    setSaving(true);
    try {
      const payload = buildPayload('draft');
      if (cashUp?.id) {
        await supabase.from('cash_ups').update(payload).eq('id', cashUp.id);
      } else {
        const { data, error } = await supabase.from('cash_ups').insert(payload).select().single();
        if (error) throw error;
        if (data) setCashUp(data);
      }
      await loadCashUp();
    } catch (e) {
      console.error('Save error:', e);
    }
    setSaving(false);
  }

  async function signOff() {
    if (!signedByName.trim()) return;
    setSaving(true);
    try {
      const payload = {
        ...buildPayload('signed_off'),
        signed_by_name: signedByName.trim(),
        signed_off_at: new Date().toISOString(),
      };
      if (cashUp?.id) {
        const { error } = await supabase.from('cash_ups').update(payload).eq('id', cashUp.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('cash_ups').insert(payload).select().single();
        if (error) throw error;
        if (data) setCashUp(data);
      }
      await loadCashUp();
    } catch (e) {
      console.error('Sign off error:', e);
      alert('Sign off failed — check console for details');
    }
    setSaving(false);
  }

  function printCashUp() {
    const c = cashUp;
    if (!c) return;
    const vColor = c.variance === 0 ? '#1a5c38' : c.variance > 0 ? '#f59e0b' : '#ef4444';
    const vLabel = c.variance === 0 ? 'BALANCED' : c.variance > 0 ? `OVER by R ${Math.abs(c.variance).toFixed(2)}` : `SHORT by R ${Math.abs(c.variance).toFixed(2)}`;
    const denomRows = DENOMS.map(d => {
      const bankQty = c[d.key as keyof CashUp] as number;
      const floatQty = c[`float_${d.key}` as keyof CashUp] as number;
      if (!bankQty && !floatQty) return '';
      return `<tr>
        <td>${d.label}</td>
        <td class="right">${floatQty || 0}</td>
        <td class="right">R ${((floatQty || 0) * d.value).toFixed(2)}</td>
        <td class="divider"></td>
        <td class="right">${bankQty || 0}</td>
        <td class="right">R ${((bankQty || 0) * d.value).toFixed(2)}</td>
      </tr>`;
    }).join('');
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><title>Cash Up - ${c.cash_up_date}</title><style>
      @page{size:A4;margin:18mm 20mm}*{box-sizing:border-box;margin:0;padding:0}
      body{font-family:Arial,sans-serif;font-size:11px;color:#111}
      .header{text-align:center;padding-bottom:12px;margin-bottom:16px;border-bottom:3px solid #1a5c38}
      .header h1{font-size:22px;color:#1a5c38;font-weight:900}
      .header h2{font-size:13px;color:#444;margin-top:2px;font-weight:600;letter-spacing:1px;text-transform:uppercase}
      .header p{font-size:11px;color:#888;margin-top:4px}
      .meta{display:flex;justify-content:space-between;background:#f0f7f2;padding:10px 14px;border-radius:6px;margin-bottom:16px;font-size:11px}
      .meta strong{color:#1a5c38}
      .section-title{font-size:11px;font-weight:800;color:#1a5c38;text-transform:uppercase;letter-spacing:.8px;border-bottom:2px solid #1a5c38;padding-bottom:3px;margin-bottom:8px}
      table{width:100%;border-collapse:collapse;font-size:11px;margin-bottom:16px}
      td,th{padding:5px 6px}
      th{background:#1a5c38;color:#fff;font-weight:700;text-align:left}
      th.right,td.right{text-align:right}
      tr:nth-child(even) td{background:#f8f8f8}
      .total-row td{font-weight:800;background:#e8f5e9;border-top:2px solid #1a5c38}
      td.divider{width:12px;background:#fff;border-left:2px dashed #ccc;border-right:2px dashed #ccc}
      th.divider{background:#fff;border-left:2px dashed #ccc;border-right:2px dashed #ccc}
      .col-header{background:#0a1f12;color:#fff;text-align:center;font-weight:800;font-size:11px;padding:6px}
      .two-col{display:flex;gap:16px;margin-bottom:16px}
      .two-col>div{flex:1}
      .recon-row{display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #eee;font-size:11px}
      .recon-row.subtotal{font-weight:800;background:#e8f5e9;padding:6px 4px;margin-top:2px;border-top:2px solid #1a5c38;border-bottom:none}
      .variance-box{border:3px solid ${vColor};background:${c.variance===0?'#e8f5e9':c.variance>0?'#fff8e1':'#fdecea'};padding:14px 20px;border-radius:8px;text-align:center;margin:14px 0}
      .variance-label{font-size:10px;font-weight:800;color:${vColor};text-transform:uppercase;letter-spacing:1px}
      .variance-amount{font-size:30px;font-weight:900;color:${vColor};margin:4px 0}
      .variance-status{font-size:14px;font-weight:800;color:${vColor}}
      .notes-box{border:1px solid #ddd;padding:8px 10px;border-radius:4px;min-height:50px;font-size:11px;color:#333;line-height:1.5}
      .sign-section{display:flex;justify-content:space-between;margin-top:24px;padding-top:16px;border-top:2px solid #1a5c38}
      .sign-block{text-align:center}
      .sign-line{border-bottom:1px solid #333;width:160px;margin:35px auto 6px}
      .sign-label{font-size:10px;color:#666}
      .sign-name{font-size:11px;font-weight:700;color:#333;margin-top:3px}
      .footer{margin-top:20px;text-align:center;font-size:9px;color:#aaa;border-top:1px solid #eee;padding-top:8px}
      .badge{display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:800}
      .badge-green{background:#e8f5e9;color:#1a5c38}
      .badge-amber{background:#fff8e1;color:#f59e0b}
      .totals-summary{display:flex;gap:12px;margin-bottom:16px}
      .total-pill{flex:1;background:#f0f7f2;border:2px solid #1a5c38;border-radius:8px;padding:10px;text-align:center}
      .total-pill .label{font-size:9px;color:#666;text-transform:uppercase;font-weight:700;letter-spacing:.5px}
      .total-pill .amount{font-size:16px;font-weight:900;color:#1a5c38;margin-top:2px}
    </style></head><body>
    <div class="header"><h1>CompliTrack</h1><h2>Daily Cash Up Report</h2><p>${STORE_NAME}</p></div>
    <div class="meta">
      <div><strong>Date:</strong> ${new Date(c.cash_up_date).toLocaleDateString('en-ZA',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</div>
      <div><strong>Status:</strong> <span class="badge ${c.status==='signed_off'?'badge-green':'badge-amber'}">${c.status==='signed_off'?'SIGNED OFF':'DRAFT'}</span></div>
      <div><strong>Signed by:</strong> ${c.signed_by_name||'—'}</div>
      <div><strong>Time:</strong> ${c.signed_off_at?new Date(c.signed_off_at).toLocaleTimeString('en-ZA',{hour:'2-digit',minute:'2-digit'}):'—'}</div>
    </div>
    <div class="section-title">Cash Count</div>
    <div class="totals-summary">
      <div class="total-pill"><div class="label">Till Float</div><div class="amount">R ${c.float_total.toFixed(2)}</div></div>
      <div class="total-pill"><div class="label">To Bank</div><div class="amount">R ${c.bank_total.toFixed(2)}</div></div>
      <div class="total-pill"><div class="label">Total Cash</div><div class="amount">R ${c.total_cash.toFixed(2)}</div></div>
    </div>
    <table>
      <tr><th rowspan="2">Denom</th><th colspan="2" class="col-header" style="text-align:center">TILL FLOAT</th><th class="divider"></th><th colspan="2" class="col-header" style="text-align:center">TO BANK</th></tr>
      <tr><th class="right">Qty</th><th class="right">Value</th><th class="divider"></th><th class="right">Qty</th><th class="right">Value</th></tr>
      ${denomRows}
      <tr class="total-row"><td><strong>TOTAL</strong></td><td></td><td class="right"><strong>R ${c.float_total.toFixed(2)}</strong></td><td class="divider"></td><td></td><td class="right"><strong>R ${c.bank_total.toFixed(2)}</strong></td></tr>
    </table>
    <div class="two-col">
      <div>
        <div class="section-title">Reconciliation</div>
        <div class="recon-row"><span>Total Cash Counted</span><span>R ${c.total_cash.toFixed(2)}</span></div>
        <div class="recon-row"><span>Less: Previous Float</span><span>— R ${c.previous_float.toFixed(2)}</span></div>
        <div class="recon-row"><span>Plus: EFT / Card</span><span>+ R ${c.eft_total.toFixed(2)}</span></div>
        <div class="recon-row"><span>Plus: Payouts</span><span>+ R ${c.payouts.toFixed(2)}</span></div>
        <div class="recon-row subtotal"><span><strong>A Total</strong></span><span><strong>R ${c.a_total.toFixed(2)}</strong></span></div>
        <br/>
        <div class="recon-row"><span>POS Slip Total</span><span>R ${c.pos_slip_total.toFixed(2)}</span></div>
        <div class="recon-row"><span>Less: Voids</span><span>— R ${c.voids.toFixed(2)}</span></div>
        <div class="recon-row subtotal"><span><strong>Cash Up Total</strong></span><span><strong>R ${c.cash_up_total.toFixed(2)}</strong></span></div>
        ${c.banked?`<br/><div class="recon-row"><span>Bank Deposit</span><span>R ${(c.bank_deposit_amount||0).toFixed(2)}</span></div><div class="recon-row"><span>Bank Ref</span><span>${c.bank_reference||'—'}</span></div>`:''}
      </div>
      <div>
        <div class="section-title">Sales Performance</div>
        <div class="recon-row"><span>Customers</span><span>${c.customer_count}</span></div>
        <div class="recon-row"><span>Cash Up Total</span><span>R ${c.cash_up_total.toFixed(2)}</span></div>
        <div class="recon-row subtotal"><span><strong>Avg per Customer</strong></span><span><strong>${c.customer_count>0?`R ${c.average_spend.toFixed(2)}`:'—'}</strong></span></div>
        <br/>
        <div class="section-title">Notes & Problems</div>
        <div class="notes-box">${c.notes||'No notes recorded.'}</div>
      </div>
    </div>
    <div class="variance-box">
      <div class="variance-label">Variance</div>
      <div class="variance-amount">${c.variance===0?'R 0.00':`R ${Math.abs(c.variance).toFixed(2)}`}</div>
      <div class="variance-status">${vLabel}</div>
    </div>
    <div class="sign-section">
      <div class="sign-block"><div class="sign-line"></div><div class="sign-label">Manager Signature</div><div class="sign-name">${c.signed_by_name||'________________________'}</div></div>
      <div class="sign-block"><div class="sign-line"></div><div class="sign-label">Date & Time</div><div class="sign-name">${c.signed_off_at?new Date(c.signed_off_at).toLocaleString('en-ZA'):'________________________'}</div></div>
      <div class="sign-block"><div class="sign-line"></div><div class="sign-label">Franchisor / Owner</div><div class="sign-name">________________________</div></div>
    </div>
    <div class="footer">Generated by CompliTrack &bull; complitrack.co.za &bull; ${new Date().toLocaleString('en-ZA')}</div>
    <script>window.onload=function(){window.print()}</script>
    </body></html>`);
    win.document.close();
  }

  const denomInputStyle = (disabled: boolean) => ({
    width: '100%', padding: '8px 10px', borderRadius: 8,
    border: '1.5px solid #eef2ee', fontSize: 13, outline: 'none',
    fontFamily: 'inherit', boxSizing: 'border-box' as const,
    background: disabled ? '#f8faf8' : '#fff', textAlign: 'center' as const
  });
  const reconInputStyle = {
    width: '100%', padding: '10px 14px', borderRadius: 10,
    border: '1.5px solid #eef2ee', fontSize: 14, outline: 'none',
    fontFamily: 'inherit', boxSizing: 'border-box' as const,
    background: readOnly ? '#f8faf8' : '#fff'
  };
  const cardStyle = { background: '#fff', borderRadius: 20, padding: 24, border: '1px solid #eef2ee', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' };
  const labelStyle = { display: 'block' as const, fontSize: 13, fontWeight: 600 as const, color: '#555', marginBottom: 6 };
  const steps = ['Cash Count', 'Reconciliation', 'Performance', 'Notes', 'Sign Off'];

  return (
    <div style={{ minHeight: '100vh', background: '#f8faf8', fontFamily: 'system-ui, sans-serif' }}>

      <div style={{ background: `linear-gradient(135deg, ${DARK}, ${PRIMARY})`, padding: '0 32px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 64 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={() => router.push('/dashboard')} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 14 }}>Back</button>
            <span style={{ color: '#fff', fontWeight: 700, fontSize: 18 }}>Cash Up</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {cashUp && (
              <>
                <button onClick={printCashUp} style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', color: '#fff', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Print</button>
                <button onClick={printCashUp} style={{ background: '#fff', color: PRIMARY, border: 'none', borderRadius: 8, padding: '7px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>Download PDF</button>
              </>
            )}
            {isSignedOff && <span style={{ background: '#e8f5e9', color: PRIMARY, borderRadius: 20, padding: '4px 12px', fontSize: 12, fontWeight: 700 }}>SIGNED OFF</span>}
            <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14 }}>{new Date().toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px' }}>
        {loading && <div style={{ textAlign: 'center', padding: 80, color: '#666' }}>Loading...</div>}

        {!loading && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 24 }}>
            <div>
              <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: '#fff', padding: 4, borderRadius: 14, border: '1px solid #eef2ee' }}>
                {steps.map((step, i) => (
                  <button key={step} onClick={() => setActiveStep(i + 1)} style={{ flex: 1, padding: '8px 4px', borderRadius: 10, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 11, background: activeStep === i + 1 ? PRIMARY : 'transparent', color: activeStep === i + 1 ? '#fff' : '#888', textAlign: 'center' as const }}>
                    {i + 1}. {step}
                  </button>
                ))}
              </div>

              {activeStep === 1 && (
                <div style={cardStyle}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#333', marginBottom: 4 }}>Count Your Cash</div>
                  <div style={{ fontSize: 13, color: '#888', marginBottom: 20 }}>Enter quantities for Till Float and To Bank separately</div>

                  <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 20px 1fr', gap: 8, marginBottom: 8 }}>
                    <div />
                    <div style={{ background: DARK, color: '#fff', borderRadius: 8, padding: '8px 12px', textAlign: 'center' as const, fontWeight: 700, fontSize: 13 }}>TILL FLOAT</div>
                    <div />
                    <div style={{ background: PRIMARY, color: '#fff', borderRadius: 8, padding: '8px 12px', textAlign: 'center' as const, fontWeight: 700, fontSize: 13 }}>TO BANK</div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 20px 1fr', gap: 8, marginBottom: 6 }}>
                    <div />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                      <div style={{ fontSize: 11, color: '#888', textAlign: 'center' as const, fontWeight: 600 }}>QTY</div>
                      <div style={{ fontSize: 11, color: '#888', textAlign: 'center' as const, fontWeight: 600 }}>VALUE</div>
                    </div>
                    <div />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                      <div style={{ fontSize: 11, color: '#888', textAlign: 'center' as const, fontWeight: 600 }}>QTY</div>
                      <div style={{ fontSize: 11, color: '#888', textAlign: 'center' as const, fontWeight: 600 }}>VALUE</div>
                    </div>
                  </div>

                  {DENOMS.map(d => (
                    <div key={d.key} style={{ display: 'grid', gridTemplateColumns: '80px 1fr 20px 1fr', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                      <div style={{ fontWeight: 700, color: '#333', fontSize: 15 }}>{d.label}</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, background: '#f0f7f4', borderRadius: 8, padding: 4 }}>
                        <input type="number" min="0" value={floatDenoms[d.key] || ''} onChange={e => setFloatDenoms(p => ({ ...p, [d.key]: parseInt(e.target.value) || 0 }))} disabled={readOnly} placeholder="0" style={denomInputStyle(readOnly)} />
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, color: DARK, fontSize: 13 }}>{fmt((floatDenoms[d.key] || 0) * d.value)}</div>
                      </div>
                      <div style={{ textAlign: 'center' as const, color: '#ddd', fontSize: 18 }}>|</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, background: '#e8f5e9', borderRadius: 8, padding: 4 }}>
                        <input type="number" min="0" value={bankDenoms[d.key] || ''} onChange={e => setBankDenoms(p => ({ ...p, [d.key]: parseInt(e.target.value) || 0 }))} disabled={readOnly} placeholder="0" style={denomInputStyle(readOnly)} />
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, color: PRIMARY, fontSize: 13 }}>{fmt((bankDenoms[d.key] || 0) * d.value)}</div>
                      </div>
                    </div>
                  ))}

                  <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 20px 1fr', gap: 8, marginTop: 16 }}>
                    <div style={{ fontWeight: 700, color: '#333', fontSize: 13 }}>TOTAL</div>
                    <div style={{ background: DARK, color: '#fff', borderRadius: 10, padding: '12px 16px', textAlign: 'center' as const, fontWeight: 800, fontSize: 18 }}>{fmt(floatTotal)}</div>
                    <div />
                    <div style={{ background: PRIMARY, color: '#fff', borderRadius: 10, padding: '12px 16px', textAlign: 'center' as const, fontWeight: 800, fontSize: 18 }}>{fmt(bankTotal)}</div>
                  </div>

                  <div style={{ marginTop: 12, padding: '14px 20px', background: `linear-gradient(135deg, ${DARK}, ${PRIMARY})`, borderRadius: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: '#fff', fontWeight: 600, fontSize: 15 }}>Total Cash Counted</span>
                    <span style={{ color: '#fff', fontWeight: 800, fontSize: 26 }}>{fmt(totalCash)}</span>
                  </div>

                  {!readOnly && (
                    <button onClick={() => { saveDraft(); setActiveStep(2); }} disabled={saving} style={{ width: '100%', marginTop: 16, padding: '14px', background: PRIMARY, color: '#fff', border: 'none', borderRadius: 12, fontWeight: 700, cursor: 'pointer', fontSize: 15 }}>
                      {saving ? 'Saving...' : 'Next: Reconciliation →'}
                    </button>
                  )}
                </div>
              )}

              {activeStep === 2 && (
                <div style={cardStyle}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#333', marginBottom: 4 }}>Reconciliation</div>
                  <div style={{ fontSize: 13, color: '#888', marginBottom: 24 }}>Enter your POS and payment totals</div>

                  <div style={{ background: '#f8faf8', borderRadius: 14, padding: 16, marginBottom: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, paddingBottom: 12, borderBottom: '1px solid #eee' }}>
                      <span style={{ fontSize: 14, color: '#666' }}>Total Cash Counted</span>
                      <span style={{ fontWeight: 700, color: '#333', fontSize: 16 }}>{fmt(totalCash)}</span>
                    </div>
                    {[
                      { label: 'Previous Float', key: 'previous_float', sign: '−', hint: 'Auto-filled from yesterday', color: '#ef4444' },
                      { label: 'EFT / Card', key: 'eft_total', sign: '+', hint: 'Total card payments', color: PRIMARY },
                      { label: 'Payouts', key: 'payouts', sign: '+', hint: 'Cash paid out', color: PRIMARY },
                    ].map(f => (
                      <div key={f.key} style={{ marginBottom: 14 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                          <label style={{ fontSize: 13, color: '#666' }}><span style={{ fontWeight: 800, color: f.color, marginRight: 6, fontSize: 15 }}>{f.sign}</span>{f.label}</label>
                          <span style={{ fontSize: 11, color: '#aaa' }}>{f.hint}</span>
                        </div>
                        <input type="number" min="0" step="0.01" value={recon[f.key as keyof typeof recon] as string} onChange={e => setRecon(p => ({ ...p, [f.key]: e.target.value }))} disabled={readOnly} placeholder="0.00" style={reconInputStyle} />
                      </div>
                    ))}
                    <div style={{ paddingTop: 14, borderTop: '2px solid #1a5c38', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 700, color: '#333', fontSize: 15 }}>A Total</span>
                      <span style={{ fontWeight: 800, color: PRIMARY, fontSize: 22 }}>{fmt(aTotal)}</span>
                    </div>
                  </div>

                  <div style={{ background: '#f8faf8', borderRadius: 14, padding: 16, marginBottom: 16 }}>
                    {[
                      { label: 'POS Slip Total', key: 'pos_slip_total', sign: '', hint: 'Total from POS system', color: '#333' },
                      { label: 'Voids', key: 'voids', sign: '−', hint: 'Cancelled transactions', color: '#ef4444' },
                    ].map(f => (
                      <div key={f.key} style={{ marginBottom: 14 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                          <label style={{ fontSize: 13, color: '#666' }}>{f.sign && <span style={{ fontWeight: 800, color: f.color, marginRight: 6, fontSize: 15 }}>{f.sign}</span>}{f.label}</label>
                          <span style={{ fontSize: 11, color: '#aaa' }}>{f.hint}</span>
                        </div>
                        <input type="number" min="0" step="0.01" value={recon[f.key as keyof typeof recon] as string} onChange={e => setRecon(p => ({ ...p, [f.key]: e.target.value }))} disabled={readOnly} placeholder="0.00" style={reconInputStyle} />
                      </div>
                    ))}
                    <div style={{ paddingTop: 14, borderTop: '2px solid #1a5c38', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 700, color: '#333', fontSize: 15 }}>Cash Up Total</span>
                      <span style={{ fontWeight: 800, color: PRIMARY, fontSize: 22 }}>{fmt(cashUpTotal)}</span>
                    </div>
                  </div>

                  <div style={{ background: variance === 0 ? '#e8f5e9' : variance > 0 ? '#fff8e1' : '#fdecea', borderRadius: 16, padding: 24, marginBottom: 16, textAlign: 'center' as const, border: `2px solid ${varianceColor}` }}>
                    <div style={{ fontSize: 12, color: varianceColor, fontWeight: 700, marginBottom: 8, letterSpacing: 1, textTransform: 'uppercase' as const }}>Variance</div>
                    <div style={{ fontSize: 40, fontWeight: 900, color: varianceColor }}>{variance === 0 ? 'R 0.00' : fmt(Math.abs(variance))}</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: varianceColor, marginTop: 8 }}>{varianceLabel}</div>
                  </div>

                  <div style={{ background: '#f8faf8', borderRadius: 14, padding: 16, marginBottom: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <label style={{ fontSize: 14, fontWeight: 600, color: '#333' }}>Did you bank the cash?</label>
                      <div onClick={() => !readOnly && setRecon(p => ({ ...p, banked: !p.banked }))} style={{ width: 48, height: 26, borderRadius: 13, background: recon.banked ? PRIMARY : '#ddd', cursor: readOnly ? 'default' : 'pointer', position: 'relative' as const, transition: 'background 0.2s', flexShrink: 0 }}>
                        <div style={{ position: 'absolute' as const, top: 3, left: recon.banked ? 25 : 3, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                      </div>
                    </div>
                    {recon.banked && (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 16 }}>
                        <div><label style={labelStyle}>Deposit Amount</label><input type="number" value={recon.bank_deposit_amount} onChange={e => setRecon(p => ({ ...p, bank_deposit_amount: e.target.value }))} disabled={readOnly} placeholder="0.00" style={reconInputStyle} /></div>
                        <div><label style={labelStyle}>Reference</label><input value={recon.bank_reference} onChange={e => setRecon(p => ({ ...p, bank_reference: e.target.value }))} disabled={readOnly} placeholder="DEP-001" style={reconInputStyle} /></div>
                      </div>
                    )}
                  </div>

                  {!readOnly && (
                    <div style={{ display: 'flex', gap: 10 }}>
                      <button onClick={() => setActiveStep(1)} style={{ flex: 1, padding: '12px', background: '#f0f4f0', color: '#333', border: 'none', borderRadius: 12, fontWeight: 600, cursor: 'pointer', fontSize: 14 }}>← Back</button>
                      <button onClick={() => { saveDraft(); setActiveStep(3); }} disabled={saving} style={{ flex: 2, padding: '12px', background: PRIMARY, color: '#fff', border: 'none', borderRadius: 12, fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>{saving ? 'Saving...' : 'Next: Performance →'}</button>
                    </div>
                  )}
                </div>
              )}

              {activeStep === 3 && (
                <div style={cardStyle}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#333', marginBottom: 4 }}>Sales Performance</div>
                  <div style={{ fontSize: 13, color: '#888', marginBottom: 24 }}>How many customers did you serve today?</div>
                  <div style={{ marginBottom: 24 }}>
                    <label style={labelStyle}>Number of Customers</label>
                    <input type="number" min="0" value={perf.customer_count} onChange={e => setPerf({ customer_count: e.target.value })} disabled={readOnly} placeholder="0" style={{ width: '100%', padding: '16px', borderRadius: 12, border: '1.5px solid #eef2ee', fontSize: 32, textAlign: 'center' as const, fontWeight: 800, outline: 'none', fontFamily: 'inherit', background: readOnly ? '#f8faf8' : '#fff', boxSizing: 'border-box' as const }} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
                    {[['CASH UP TOTAL', fmt(cashUpTotal)], ['AVG PER CUSTOMER', customers > 0 ? fmt(avgSpend) : '—']].map(([label, value]) => (
                      <div key={label} style={{ background: '#f8faf8', borderRadius: 14, padding: 20, textAlign: 'center' as const }}>
                        <div style={{ fontSize: 11, color: '#888', marginBottom: 8, fontWeight: 600, letterSpacing: 0.5 }}>{label}</div>
                        <div style={{ fontSize: 22, fontWeight: 800, color: PRIMARY }}>{value}</div>
                      </div>
                    ))}
                  </div>
                  {!readOnly && (
                    <div style={{ display: 'flex', gap: 10 }}>
                      <button onClick={() => setActiveStep(2)} style={{ flex: 1, padding: '12px', background: '#f0f4f0', color: '#333', border: 'none', borderRadius: 12, fontWeight: 600, cursor: 'pointer', fontSize: 14 }}>← Back</button>
                      <button onClick={() => { saveDraft(); setActiveStep(4); }} disabled={saving} style={{ flex: 2, padding: '12px', background: PRIMARY, color: '#fff', border: 'none', borderRadius: 12, fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>{saving ? 'Saving...' : 'Next: Notes →'}</button>
                    </div>
                  )}
                </div>
              )}

              {activeStep === 4 && (
                <div style={cardStyle}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#333', marginBottom: 4 }}>Notes & Problems</div>
                  <div style={{ fontSize: 13, color: '#888', marginBottom: 24 }}>Any issues, remarks or problems to report?</div>
                  <textarea value={notes} onChange={e => setNotes(e.target.value)} disabled={readOnly} rows={7} placeholder="Enter any notes, problems or remarks here..." style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1.5px solid #eef2ee', fontSize: 14, outline: 'none', fontFamily: 'inherit', resize: 'vertical' as const, lineHeight: 1.6, background: readOnly ? '#f8faf8' : '#fff', boxSizing: 'border-box' as const }} />
                  {!readOnly && (
                    <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                      <button onClick={() => setActiveStep(3)} style={{ flex: 1, padding: '12px', background: '#f0f4f0', color: '#333', border: 'none', borderRadius: 12, fontWeight: 600, cursor: 'pointer', fontSize: 14 }}>← Back</button>
                      <button onClick={() => { saveDraft(); setActiveStep(5); }} disabled={saving} style={{ flex: 2, padding: '12px', background: PRIMARY, color: '#fff', border: 'none', borderRadius: 12, fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>{saving ? 'Saving...' : 'Next: Sign Off →'}</button>
                    </div>
                  )}
                </div>
              )}

              {activeStep === 5 && (
                <div style={cardStyle}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#333', marginBottom: 4 }}>{isSignedOff ? 'Signed Off' : 'Sign Off'}</div>
                  <div style={{ fontSize: 13, color: '#888', marginBottom: 24 }}>Review and confirm today's cash up</div>

                  <div style={{ background: '#f8faf8', borderRadius: 14, padding: 20, marginBottom: 20 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#333', marginBottom: 14 }}>Summary</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
                      {[['Till Float', fmt(floatTotal)], ['To Bank', fmt(bankTotal)], ['Total Cash', fmt(totalCash)], ['EFT / Card', fmt(eft)]].map(([label, value]) => (
                        <div key={label} style={{ background: '#fff', borderRadius: 10, padding: '10px 14px', display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: 12, color: '#888' }}>{label}</span>
                          <span style={{ fontSize: 13, fontWeight: 700, color: '#333' }}>{value}</span>
                        </div>
                      ))}
                    </div>
                    {[['Previous Float', fmt(prevFloat)], ['Payouts', fmt(payouts)], ['A Total', fmt(aTotal)], ['POS Slip Total', fmt(posSlip)], ['Voids', fmt(voids)], ['Cash Up Total', fmt(cashUpTotal)], ['Customers', customers.toString()], ['Avg Spend', customers > 0 ? fmt(avgSpend) : '—']].map(([label, value]) => (
                      <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 8, paddingBottom: 8, borderBottom: '1px solid #f0f0f0' }}>
                        <span style={{ color: '#666' }}>{label}</span>
                        <span style={{ fontWeight: 600, color: '#333' }}>{value}</span>
                      </div>
                    ))}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 4 }}>
                      <span style={{ fontWeight: 700, color: '#333', fontSize: 15 }}>VARIANCE</span>
                      <span style={{ fontWeight: 800, fontSize: 20, color: varianceColor }}>{varianceLabel}</span>
                    </div>
                  </div>

                  {!isSignedOff ? (
                    <div>
                      <div style={{ marginBottom: 16 }}>
                        <label style={labelStyle}>Signed by</label>
                        {staff.length > 0 ? (
                          <div>
                            <select
                              value={signedByName}
                              onChange={e => setSignedByName(e.target.value)}
                              style={{ ...reconInputStyle, marginBottom: signedByName === '__custom__' ? 10 : 0 }}
                            >
                              <option value="">— Select staff member —</option>
                              {staff.map(s => (
                                <option key={s.id} value={s.full_name}>{s.full_name} ({s.role})</option>
                              ))}
                              <option value="__custom__">Other (type name)</option>
                            </select>
                            {signedByName === '__custom__' && (
                              <input
                                value=""
                                onChange={e => setSignedByName(e.target.value)}
                                placeholder="Enter full name"
                                style={reconInputStyle}
                              />
                            )}
                          </div>
                        ) : (
                          <input
                            value={signedByName}
                            onChange={e => setSignedByName(e.target.value)}
                            placeholder="Full name of person signing off"
                            style={reconInputStyle}
                          />
                        )}
                      </div>
                      <button
                        onClick={signOff}
                        disabled={saving || !signedByName.trim() || signedByName === '__custom__'}
                        style={{ width: '100%', padding: '16px', background: signedByName.trim() && signedByName !== '__custom__' ? PRIMARY : '#eee', color: signedByName.trim() && signedByName !== '__custom__' ? '#fff' : '#aaa', border: 'none', borderRadius: 12, fontWeight: 700, cursor: signedByName.trim() && signedByName !== '__custom__' ? 'pointer' : 'default', fontSize: 16 }}>
                        {saving ? 'Signing off...' : 'Sign Off Cash Up'}
                      </button>
                      <button onClick={() => setActiveStep(4)} style={{ width: '100%', marginTop: 10, padding: '12px', background: '#f0f4f0', color: '#333', border: 'none', borderRadius: 12, fontWeight: 600, cursor: 'pointer', fontSize: 14 }}>← Back</button>
                    </div>
                  ) : (
                    <div>
                      <div style={{ background: '#e8f5e9', borderRadius: 14, padding: 24, textAlign: 'center' as const, marginBottom: 16 }}>
                        <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
                        <div style={{ fontWeight: 700, color: PRIMARY, fontSize: 18 }}>Signed off by {cashUp?.signed_by_name}</div>
                        <div style={{ fontSize: 13, color: '#888', marginTop: 6 }}>{cashUp?.signed_off_at ? new Date(cashUp.signed_off_at).toLocaleString('en-ZA') : ''}</div>
                      </div>
                      <button onClick={printCashUp} style={{ width: '100%', padding: '14px', background: PRIMARY, color: '#fff', border: 'none', borderRadius: 12, fontWeight: 700, cursor: 'pointer', fontSize: 15 }}>
                        Download / Print PDF Report
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={cardStyle}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#333', marginBottom: 16 }}>Today's Summary</div>
                {[['Till Float', fmt(floatTotal)], ['To Bank', fmt(bankTotal)], ['Total Cash', fmt(totalCash)], ['A Total', fmt(aTotal)], ['Cash Up Total', fmt(cashUpTotal)], ['Customers', customers.toString()], ['Avg Spend', customers > 0 ? fmt(avgSpend) : '—']].map(([label, value]) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 10 }}>
                    <span style={{ color: '#888' }}>{label}</span>
                    <span style={{ fontWeight: 600, color: '#333' }}>{value}</span>
                  </div>
                ))}
                <div style={{ marginTop: 14, padding: '16px', background: variance === 0 ? '#e8f5e9' : variance > 0 ? '#fff8e1' : '#fdecea', borderRadius: 12, textAlign: 'center' as const, border: `1.5px solid ${varianceColor}` }}>
                  <div style={{ fontSize: 11, color: varianceColor, fontWeight: 700, marginBottom: 6, letterSpacing: 0.5 }}>VARIANCE</div>
                  <div style={{ fontSize: 26, fontWeight: 900, color: varianceColor }}>{variance === 0 ? 'R 0.00' : fmt(Math.abs(variance))}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: varianceColor, marginTop: 6 }}>{varianceLabel}</div>
                </div>
              </div>

              <div style={cardStyle}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#333', marginBottom: 16 }}>Recent History</div>
                {history.filter(h => h.cash_up_date !== new Date().toISOString().split('T')[0]).slice(0, 7).length === 0 && (
                  <div style={{ textAlign: 'center' as const, padding: '20px 0', color: '#ccc', fontSize: 13 }}>No history yet</div>
                )}
                {history.filter(h => h.cash_up_date !== new Date().toISOString().split('T')[0]).slice(0, 7).map(h => {
                  const hColor = h.variance === 0 ? PRIMARY : h.variance > 0 ? '#f59e0b' : '#ef4444';
                  return (
                    <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f5f5f5' }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#333' }}>{new Date(h.cash_up_date).toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short' })}</div>
                        <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>{fmt(h.cash_up_total)}</div>
                      </div>
                      <div style={{ textAlign: 'right' as const }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: hColor }}>{h.variance === 0 ? 'BALANCED' : h.variance > 0 ? `+${fmt(h.variance)}` : fmt(h.variance)}</div>
                        <div style={{ fontSize: 10, color: h.status === 'signed_off' ? PRIMARY : '#f59e0b', marginTop: 2, fontWeight: 600 }}>{h.status === 'signed_off' ? 'SIGNED OFF' : 'DRAFT'}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
