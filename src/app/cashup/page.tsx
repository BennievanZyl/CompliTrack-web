'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

const STORE_ID = '05328298-fc27-4c9f-b091-bb7f6598b601';
const ORG_ID = 'e903386b-133a-4bad-b054-ef7ef616a3ff';
const PRIMARY = '#1a5c38';
const DARK = '#0a1f12';

type CashUp = {
  id: string;
  cash_up_date: string;
  status: string;
  r200: number; r100: number; r50: number; r20: number; r10: number;
  r5: number; r2: number; r1: number; r050: number; r020: number;
  r010: number; r005: number; total_cash: number;
  previous_float: number; eft_total: number; payouts: number; a_total: number;
  pos_slip_total: number; voids: number; cash_up_total: number; variance: number;
  banked: boolean; bank_deposit_amount: number | null; bank_reference: string | null;
  customer_count: number; average_spend: number;
  notes: string | null; signature_url: string | null;
  signed_by_name: string | null; signed_off_at: string | null;
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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeStep, setActiveStep] = useState(1);
  const [editMode, setEditMode] = useState(false);

  const [denoms, setDenoms] = useState<Record<string, number>>({
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
    await loadCashUp();
  }

  async function loadCashUp() {
    setLoading(true);
    const today = new Date().toISOString().split('T')[0];
    const { data: todayCashUp } = await supabase
      .from('cash_ups').select('*').eq('store_id', STORE_ID).eq('cash_up_date', today).single();

    if (todayCashUp) {
      setCashUp(todayCashUp);
      populateForm(todayCashUp);
    }

    const { data: hist } = await supabase
      .from('cash_ups').select('*').eq('store_id', STORE_ID)
      .order('cash_up_date', { ascending: false }).limit(14);
    setHistory(hist || []);
    setLoading(false);
  }

  function populateForm(c: CashUp) {
    setDenoms({ r200: c.r200, r100: c.r100, r50: c.r50, r20: c.r20, r10: c.r10, r5: c.r5, r2: c.r2, r1: c.r1, r050: c.r050, r020: c.r020, r010: c.r010, r005: c.r005 });
    setRecon({ previous_float: c.previous_float.toString(), eft_total: c.eft_total.toString(), payouts: c.payouts.toString(), pos_slip_total: c.pos_slip_total.toString(), voids: c.voids.toString(), banked: c.banked, bank_deposit_amount: c.bank_deposit_amount?.toString() || '', bank_reference: c.bank_reference || '' });
    setPerf({ customer_count: c.customer_count.toString() });
    setNotes(c.notes || '');
    setSignedByName(c.signed_by_name || '');
  }

  const totalCash = DENOMS.reduce((sum, d) => sum + (denoms[d.key] || 0) * d.value, 0);
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

  async function saveDraft() {
    setSaving(true);
    const today = new Date().toISOString().split('T')[0];
    const payload = {
      store_id: STORE_ID, organisation_id: ORG_ID, cash_up_date: today,
      ...denoms, total_cash: totalCash,
      previous_float: prevFloat, eft_total: eft, payouts,
      a_total: aTotal, pos_slip_total: posSlip, voids, cash_up_total: cashUpTotal, variance,
      banked: recon.banked,
      bank_deposit_amount: recon.bank_deposit_amount ? parseFloat(recon.bank_deposit_amount) : null,
      bank_reference: recon.bank_reference || null,
      customer_count: customers, average_spend: avgSpend,
      notes: notes || null, status: 'draft',
    };

    if (cashUp) {
      await supabase.from('cash_ups').update(payload).eq('id', cashUp.id);
    } else {
      const { data } = await supabase.from('cash_ups').insert(payload).select().single();
      if (data) setCashUp(data);
    }
    await loadCashUp();
    setSaving(false);
  }

  async function signOff() {
    if (!signedByName.trim() || !cashUp) return;
    setSaving(true);
    await supabase.from('cash_ups').update({
      signed_by_name: signedByName,
      signed_off_at: new Date().toISOString(),
      status: 'signed_off',
      notes: notes || null,
      ...denoms, total_cash: totalCash,
      previous_float: prevFloat, eft_total: eft, payouts,
      a_total: aTotal, pos_slip_total: posSlip, voids,
      cash_up_total: cashUpTotal, variance,
      banked: recon.banked,
      bank_deposit_amount: recon.bank_deposit_amount ? parseFloat(recon.bank_deposit_amount) : null,
      bank_reference: recon.bank_reference || null,
      customer_count: customers, average_spend: avgSpend,
    }).eq('id', cashUp.id);
    await loadCashUp();
    setEditMode(false);
    setSaving(false);
  }

  const isSignedOff = cashUp?.status === 'signed_off';
  const readOnly = isSignedOff && !editMode;

  const inputStyle = { width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid #eef2ee', fontSize: 14, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' as const, background: readOnly ? '#f8faf8' : '#fff' };
  const cardStyle = { background: '#fff', borderRadius: 20, padding: 24, border: '1px solid #eef2ee', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' };
  const labelStyle = { display: 'block' as const, fontSize: 13, fontWeight: 600 as const, color: '#555', marginBottom: 6 };

  const steps = ['Cash Count', 'Reconciliation', 'Performance', 'Notes', 'Sign Off'];

  return (
    <div style={{ minHeight: '100vh', background: '#f8faf8', fontFamily: 'system-ui, sans-serif' }}>

      <div style={{ background: `linear-gradient(135deg, ${DARK}, ${PRIMARY})`, padding: '0 32px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 64 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={() => router.push('/dashboard')} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 14 }}>Back</button>
            <span style={{ color: '#fff', fontWeight: 700, fontSize: 18 }}>Cash Up</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {isSignedOff && <span style={{ background: '#e8f5e9', color: PRIMARY, borderRadius: 20, padding: '4px 12px', fontSize: 12, fontWeight: 700 }}>SIGNED OFF</span>}
            <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14 }}>{new Date().toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 24px' }}>

        {loading && <div style={{ textAlign: 'center', padding: 80, color: '#666' }}>Loading...</div>}

        {!loading && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 24 }}>

            {/* Main form */}
            <div>

              {/* Step nav */}
              <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: '#fff', padding: 4, borderRadius: 14, border: '1px solid #eef2ee' }}>
                {steps.map((step, i) => (
                  <button key={step} onClick={() => !readOnly && setActiveStep(i + 1)} style={{ flex: 1, padding: '8px 4px', borderRadius: 10, border: 'none', cursor: readOnly ? 'default' : 'pointer', fontWeight: 600, fontSize: 12, background: activeStep === i + 1 ? PRIMARY : 'transparent', color: activeStep === i + 1 ? '#fff' : '#888', textAlign: 'center' }}>
                    {i + 1}. {step}
                  </button>
                ))}
              </div>

              {/* Step 1 — Cash Count */}
              {activeStep === 1 && (
                <div style={cardStyle}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#333', marginBottom: 4 }}>Count Your Cash</div>
                  <div style={{ fontSize: 13, color: '#888', marginBottom: 24 }}>Enter the quantity of each denomination</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {DENOMS.map(d => (
                      <div key={d.key} style={{ display: 'grid', gridTemplateColumns: '80px 1fr 120px', gap: 12, alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f5f5f5' }}>
                        <div style={{ fontWeight: 700, color: '#333', fontSize: 16 }}>{d.label}</div>
                        <input
                          type="number" min="0"
                          value={denoms[d.key] || ''}
                          onChange={e => setDenoms(p => ({ ...p, [d.key]: parseInt(e.target.value) || 0 }))}
                          disabled={readOnly}
                          placeholder="0"
                          style={{ ...inputStyle, textAlign: 'center' }}
                        />
                        <div style={{ textAlign: 'right', fontWeight: 600, color: PRIMARY, fontSize: 15 }}>
                          {fmt((denoms[d.key] || 0) * d.value)}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: 20, padding: '16px 20px', background: `linear-gradient(135deg, ${DARK}, ${PRIMARY})`, borderRadius: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: '#fff', fontWeight: 600, fontSize: 16 }}>Total Cash Counted</span>
                    <span style={{ color: '#fff', fontWeight: 800, fontSize: 28 }}>{fmt(totalCash)}</span>
                  </div>
                  {!readOnly && (
                    <button onClick={() => { saveDraft(); setActiveStep(2); }} style={{ width: '100%', marginTop: 16, padding: '14px', background: PRIMARY, color: '#fff', border: 'none', borderRadius: 12, fontWeight: 700, cursor: 'pointer', fontSize: 15 }}>
                      Next: Reconciliation →
                    </button>
                  )}
                </div>
              )}

              {/* Step 2 — Reconciliation */}
              {activeStep === 2 && (
                <div style={cardStyle}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#333', marginBottom: 4 }}>Reconciliation</div>
                  <div style={{ fontSize: 13, color: '#888', marginBottom: 24 }}>Enter your POS and payment totals</div>

                  <div style={{ background: '#f8faf8', borderRadius: 14, padding: 16, marginBottom: 20 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <span style={{ fontSize: 14, color: '#666' }}>Cash Counted</span>
                      <span style={{ fontWeight: 700, color: '#333', fontSize: 16 }}>{fmt(totalCash)}</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {[
                        { label: 'Previous Float', key: 'previous_float', sign: '-', hint: 'Opening float amount' },
                        { label: 'EFT / Card', key: 'eft_total', sign: '+', hint: 'Total card payments' },
                        { label: 'Payouts', key: 'payouts', sign: '+', hint: 'Cash paid out' },
                      ].map(f => (
                        <div key={f.key}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                            <label style={{ fontSize: 13, color: '#666' }}><span style={{ fontWeight: 700, color: f.sign === '-' ? '#ef4444' : PRIMARY, marginRight: 6 }}>{f.sign}</span>{f.label}</label>
                            <span style={{ fontSize: 11, color: '#aaa' }}>{f.hint}</span>
                          </div>
                          <input type="number" min="0" step="0.01" value={recon[f.key as keyof typeof recon] as string} onChange={e => setRecon(p => ({ ...p, [f.key]: e.target.value }))} disabled={readOnly} placeholder="0.00" style={inputStyle} />
                        </div>
                      ))}
                    </div>
                    <div style={{ marginTop: 16, paddingTop: 16, borderTop: '2px solid #eef2ee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 700, color: '#333', fontSize: 15 }}>A Total</span>
                      <span style={{ fontWeight: 800, color: PRIMARY, fontSize: 20 }}>{fmt(aTotal)}</span>
                    </div>
                  </div>

                  <div style={{ background: '#f8faf8', borderRadius: 14, padding: 16, marginBottom: 20 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {[
                        { label: 'POS Slip Total', key: 'pos_slip_total', sign: '', hint: 'Total from POS system' },
                        { label: 'Voids', key: 'voids', sign: '-', hint: 'Cancelled transactions' },
                      ].map(f => (
                        <div key={f.key}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                            <label style={{ fontSize: 13, color: '#666' }}>{f.sign && <span style={{ fontWeight: 700, color: '#ef4444', marginRight: 6 }}>{f.sign}</span>}{f.label}</label>
                            <span style={{ fontSize: 11, color: '#aaa' }}>{f.hint}</span>
                          </div>
                          <input type="number" min="0" step="0.01" value={recon[f.key as keyof typeof recon] as string} onChange={e => setRecon(p => ({ ...p, [f.key]: e.target.value }))} disabled={readOnly} placeholder="0.00" style={inputStyle} />
                        </div>
                      ))}
                    </div>
                    <div style={{ marginTop: 16, paddingTop: 16, borderTop: '2px solid #eef2ee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 700, color: '#333', fontSize: 15 }}>Cash Up Total</span>
                      <span style={{ fontWeight: 800, color: PRIMARY, fontSize: 20 }}>{fmt(cashUpTotal)}</span>
                    </div>
                  </div>

                  <div style={{ background: variance === 0 ? '#e8f5e9' : variance > 0 ? '#fff8e1' : '#fdecea', borderRadius: 16, padding: 24, marginBottom: 20, textAlign: 'center', border: `2px solid ${varianceColor}` }}>
                    <div style={{ fontSize: 13, color: varianceColor, fontWeight: 600, marginBottom: 8 }}>VARIANCE</div>
                    <div style={{ fontSize: 36, fontWeight: 800, color: varianceColor }}>{variance === 0 ? 'R 0.00' : fmt(Math.abs(variance))}</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: varianceColor, marginTop: 8 }}>{varianceLabel}</div>
                  </div>

                  <div style={{ background: '#f8faf8', borderRadius: 14, padding: 16, marginBottom: 20 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: recon.banked ? 16 : 0 }}>
                      <label style={{ fontSize: 14, fontWeight: 600, color: '#333' }}>Did you bank the cash?</label>
                      <div onClick={() => !readOnly && setRecon(p => ({ ...p, banked: !p.banked }))} style={{ width: 48, height: 26, borderRadius: 13, background: recon.banked ? PRIMARY : '#ddd', cursor: readOnly ? 'default' : 'pointer', position: 'relative', transition: 'background 0.2s' }}>
                        <div style={{ position: 'absolute', top: 3, left: recon.banked ? 25 : 3, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
                      </div>
                    </div>
                    {recon.banked && (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 16 }}>
                        <div><label style={labelStyle}>Deposit Amount</label><input type="number" value={recon.bank_deposit_amount} onChange={e => setRecon(p => ({ ...p, bank_deposit_amount: e.target.value }))} disabled={readOnly} placeholder="0.00" style={inputStyle} /></div>
                        <div><label style={labelStyle}>Reference</label><input value={recon.bank_reference} onChange={e => setRecon(p => ({ ...p, bank_reference: e.target.value }))} disabled={readOnly} placeholder="DEP-001" style={inputStyle} /></div>
                      </div>
                    )}
                  </div>

                  {!readOnly && (
                    <div style={{ display: 'flex', gap: 10 }}>
                      <button onClick={() => setActiveStep(1)} style={{ flex: 1, padding: '12px', background: '#f0f4f0', color: '#333', border: 'none', borderRadius: 12, fontWeight: 600, cursor: 'pointer', fontSize: 14 }}>← Back</button>
                      <button onClick={() => { saveDraft(); setActiveStep(3); }} style={{ flex: 2, padding: '12px', background: PRIMARY, color: '#fff', border: 'none', borderRadius: 12, fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>Next: Performance →</button>
                    </div>
                  )}
                </div>
              )}

              {/* Step 3 — Performance */}
              {activeStep === 3 && (
                <div style={cardStyle}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#333', marginBottom: 4 }}>Sales Performance</div>
                  <div style={{ fontSize: 13, color: '#888', marginBottom: 24 }}>How many customers did you serve today?</div>
                  <div style={{ marginBottom: 20 }}>
                    <label style={labelStyle}>Number of Customers</label>
                    <input type="number" min="0" value={perf.customer_count} onChange={e => setPerf({ customer_count: e.target.value })} disabled={readOnly} placeholder="0" style={{ ...inputStyle, fontSize: 24, textAlign: 'center', fontWeight: 700 }} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
                    <div style={{ background: '#f8faf8', borderRadius: 14, padding: 20, textAlign: 'center' }}>
                      <div style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>CASH UP TOTAL</div>
                      <div style={{ fontSize: 24, fontWeight: 800, color: PRIMARY }}>{fmt(cashUpTotal)}</div>
                    </div>
                    <div style={{ background: '#f8faf8', borderRadius: 14, padding: 20, textAlign: 'center' }}>
                      <div style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>AVG PER CUSTOMER</div>
                      <div style={{ fontSize: 24, fontWeight: 800, color: customers > 0 ? PRIMARY : '#ccc' }}>{customers > 0 ? fmt(avgSpend) : '-'}</div>
                    </div>
                  </div>
                  {!readOnly && (
                    <div style={{ display: 'flex', gap: 10 }}>
                      <button onClick={() => setActiveStep(2)} style={{ flex: 1, padding: '12px', background: '#f0f4f0', color: '#333', border: 'none', borderRadius: 12, fontWeight: 600, cursor: 'pointer', fontSize: 14 }}>← Back</button>
                      <button onClick={() => { saveDraft(); setActiveStep(4); }} style={{ flex: 2, padding: '12px', background: PRIMARY, color: '#fff', border: 'none', borderRadius: 12, fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>Next: Notes →</button>
                    </div>
                  )}
                </div>
              )}

              {/* Step 4 — Notes */}
              {activeStep === 4 && (
                <div style={cardStyle}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#333', marginBottom: 4 }}>Notes & Problems</div>
                  <div style={{ fontSize: 13, color: '#888', marginBottom: 24 }}>Any issues, remarks or problems to report?</div>
                  <textarea value={notes} onChange={e => setNotes(e.target.value)} disabled={readOnly} rows={6} placeholder="Enter any notes, problems or remarks here..." style={{ ...inputStyle, resize: 'vertical', fontSize: 14, lineHeight: 1.6 }} />
                  {!readOnly && (
                    <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                      <button onClick={() => setActiveStep(3)} style={{ flex: 1, padding: '12px', background: '#f0f4f0', color: '#333', border: 'none', borderRadius: 12, fontWeight: 600, cursor: 'pointer', fontSize: 14 }}>← Back</button>
                      <button onClick={() => { saveDraft(); setActiveStep(5); }} style={{ flex: 2, padding: '12px', background: PRIMARY, color: '#fff', border: 'none', borderRadius: 12, fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>Next: Sign Off →</button>
                    </div>
                  )}
                </div>
              )}

              {/* Step 5 — Sign Off */}
              {activeStep === 5 && (
                <div style={cardStyle}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#333', marginBottom: 4 }}>
                    {isSignedOff ? 'Signed Off' : 'Sign Off'}
                  </div>
                  <div style={{ fontSize: 13, color: '#888', marginBottom: 24 }}>Review and confirm today's cash up</div>

                  <div style={{ background: '#f8faf8', borderRadius: 14, padding: 20, marginBottom: 20 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#333', marginBottom: 16 }}>Summary</div>
                    {[
                      ['Total Cash Counted', fmt(totalCash)],
                      ['Previous Float', fmt(prevFloat)],
                      ['EFT / Card', fmt(eft)],
                      ['Payouts', fmt(payouts)],
                      ['A Total', fmt(aTotal)],
                      ['POS Slip Total', fmt(posSlip)],
                      ['Voids', fmt(voids)],
                      ['Cash Up Total', fmt(cashUpTotal)],
                      ['Customers', customers.toString()],
                      ['Avg Spend', customers > 0 ? fmt(avgSpend) : '-'],
                    ].map(([label, value]) => (
                      <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 10 }}>
                        <span style={{ color: '#666' }}>{label}</span>
                        <span style={{ fontWeight: 600, color: '#333' }}>{value}</span>
                      </div>
                    ))}
                    <div style={{ marginTop: 12, paddingTop: 12, borderTop: '2px solid #eef2ee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 700, color: '#333' }}>VARIANCE</span>
                      <span style={{ fontWeight: 800, fontSize: 18, color: varianceColor }}>{varianceLabel}</span>
                    </div>
                  </div>

                  {!isSignedOff ? (
                    <div>
                      <div style={{ marginBottom: 16 }}>
                        <label style={labelStyle}>Signed by</label>
                        <input value={signedByName} onChange={e => setSignedByName(e.target.value)} placeholder="Full name of person signing off" style={inputStyle} />
                      </div>
                      <button onClick={signOff} disabled={saving || !signedByName.trim()} style={{ width: '100%', padding: '16px', background: signedByName.trim() ? PRIMARY : '#eee', color: signedByName.trim() ? '#fff' : '#aaa', border: 'none', borderRadius: 12, fontWeight: 700, cursor: signedByName.trim() ? 'pointer' : 'default', fontSize: 16 }}>
                        {saving ? 'Signing off...' : 'Sign Off Cash Up'}
                      </button>
                    </div>
                  ) : (
                    <div style={{ background: '#e8f5e9', borderRadius: 14, padding: 20, textAlign: 'center' }}>
                      <div style={{ fontSize: 20, marginBottom: 8 }}>✅</div>
                      <div style={{ fontWeight: 700, color: PRIMARY, fontSize: 16 }}>Signed off by {cashUp?.signed_by_name}</div>
                      <div style={{ fontSize: 13, color: '#888', marginTop: 4 }}>
                        {cashUp?.signed_off_at ? new Date(cashUp.signed_off_at).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' }) : ''}
                      </div>
                    </div>
                  )}

                  {!readOnly && (
                    <button onClick={() => setActiveStep(4)} style={{ width: '100%', marginTop: 10, padding: '12px', background: '#f0f4f0', color: '#333', border: 'none', borderRadius: 12, fontWeight: 600, cursor: 'pointer', fontSize: 14 }}>← Back</button>
                  )}
                </div>
              )}

            </div>

            {/* Sidebar */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

              {/* Today's snapshot */}
              <div style={cardStyle}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#333', marginBottom: 16 }}>Today's Summary</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {[
                    ['Cash', fmt(totalCash)],
                    ['A Total', fmt(aTotal)],
                    ['Cash Up Total', fmt(cashUpTotal)],
                    ['Customers', customers.toString()],
                  ].map(([label, value]) => (
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                      <span style={{ color: '#888' }}>{label}</span>
                      <span style={{ fontWeight: 600, color: '#333' }}>{value}</span>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 16, padding: '14px', background: variance === 0 ? '#e8f5e9' : variance > 0 ? '#fff8e1' : '#fdecea', borderRadius: 12, textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: varianceColor, fontWeight: 600, marginBottom: 4 }}>VARIANCE</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: varianceColor }}>{variance === 0 ? 'R 0.00' : fmt(Math.abs(variance))}</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: varianceColor, marginTop: 4 }}>{varianceLabel}</div>
                </div>
              </div>

              {/* History */}
              <div style={cardStyle}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#333', marginBottom: 16 }}>Recent History</div>
                {history.filter(h => h.cash_up_date !== new Date().toISOString().split('T')[0]).slice(0, 7).map(h => {
                  const hVariance = h.variance;
                  const hColor = hVariance === 0 ? PRIMARY : hVariance > 0 ? '#f59e0b' : '#ef4444';
                  return (
                    <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f5f5f5' }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#333' }}>{new Date(h.cash_up_date).toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short' })}</div>
                        <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>{fmt(h.cash_up_total)}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: hColor }}>{hVariance === 0 ? 'BALANCED' : hVariance > 0 ? `+${fmt(hVariance)}` : fmt(hVariance)}</div>
                        <div style={{ fontSize: 10, color: h.status === 'signed_off' ? PRIMARY : '#aaa', marginTop: 2, fontWeight: 600 }}>{h.status === 'signed_off' ? 'SIGNED OFF' : 'DRAFT'}</div>
                      </div>
                    </div>
                  );
                })}
                {history.length <= 1 && <div style={{ textAlign: 'center', padding: '20px 0', color: '#ccc', fontSize: 13 }}>No history yet</div>}
              </div>

            </div>
          </div>
        )}
      </div>
    </div>
  );
}
