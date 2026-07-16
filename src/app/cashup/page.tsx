'use client';

import { useEffect, useState } from 'react';
import { getStoreContext } from '@/lib/store-context'
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Suspense } from 'react';

const DEFAULT_STORE_ID = '05328298-fc27-4c9f-b091-bb7f6598b601';
const DEFAULT_ORG_ID = 'e903386b-133a-4bad-b054-ef7ef616a3ff';
const DEFAULT_STORE_NAME = 'Mochachos Hartswater';
const PRIMARY = '#1a5c38';
const DARK = '#0a1f12';

type CashUp = {
  id: string; cash_up_date: string; status: string;
  r200: number; r100: number; r50: number; r20: number; r10: number;
  r5: number; r2: number; r1: number; r050: number; r020: number; r010: number; r005: number;
  total_cash: number; float_r200: number; float_r100: number; float_r50: number; float_r20: number;
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

type Payout = {
  id: string; amount: number; category: string; description: string | null;
  employee_id: string | null; employee_name: string | null; linked_advance_id: string | null;
};

type Employee = { id: string; full_name: string; role: string; };
type StaffMember = { id: string; full_name: string; role: string; };

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

const PAYOUT_CATEGORIES = [
  'Salary Advance',
  'Petty Cash Purchase',
  'Store Supplies',
  'Maintenance / Repairs',
  'Cleaning Supplies',
  'Refund to Customer',
  'Delivery / Transport',
  'Utilities',
  'Other',
];

function fmt(n: number) { return `R ${(n || 0).toFixed(2)}`; }

// ─── HISTORY VIEW (franchisor/franchisee owner) ───────────────────────────────
function CashUpHistoryView({ storeId, storeName }: { storeId: string; storeName: string }) {
  const router = useRouter();
  const [history, setHistory] = useState<CashUp[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [payoutsMap, setPayoutsMap] = useState<Record<string, Payout[]>>({});

  useEffect(() => { loadHistory(); }, []);

  async function loadHistory() {
    setLoading(true);
    const { data } = await supabase.from('cash_ups').select('*').eq('store_id', storeId).order('cash_up_date', { ascending: false }).limit(60);
    setHistory(data || []);
    setLoading(false);
  }

  async function loadPayouts(cashUpId: string) {
    if (payoutsMap[cashUpId]) return;
    const { data } = await supabase.from('cash_up_payouts').select('*').eq('cash_up_id', cashUpId).order('created_at');
    setPayoutsMap(p => ({ ...p, [cashUpId]: data || [] }));
  }

  function toggleExpand(id: string) {
    if (expandedId === id) { setExpandedId(null); }
    else { setExpandedId(id); loadPayouts(id); }
  }

  const vColor = (v: number) => v === 0 ? PRIMARY : v > 0 ? '#f59e0b' : '#ef4444';
  const vLabel = (v: number) => v === 0 ? 'Balanced' : v > 0 ? `Over by ${fmt(Math.abs(v))}` : `Short by ${fmt(Math.abs(v))}`;

  return (
    <div style={{ minHeight: '100vh', background: '#f8faf8', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ background: `linear-gradient(135deg, ${DARK}, ${PRIMARY})`, padding: '0 32px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 64 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={() => router.back()} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 14 }}>Back</button>
            <span style={{ color: '#fff', fontWeight: 700, fontSize: 18 }}>Cash Up History</span>
            <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>— {storeName}</span>
          </div>
          <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>Read-only view</span>
        </div>
      </div>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 24px' }}>
        {loading && <div style={{ textAlign: 'center', padding: 80, color: '#666' }}>Loading cash ups...</div>}
        {!loading && history.length === 0 && (
          <div style={{ textAlign: 'center', padding: 80, background: '#fff', borderRadius: 20, border: '1px solid #eef2ee' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>💰</div>
            <div style={{ fontWeight: 600, color: '#333', fontSize: 18 }}>No cash ups yet</div>
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {history.map(c => {
            const isExpanded = expandedId === c.id;
            const vc = vColor(c.variance || 0);
            const isToday = c.cash_up_date === new Date().toISOString().split('T')[0];
            const payouts = payoutsMap[c.id] || [];
            return (
              <div key={c.id} style={{ background: '#fff', borderRadius: 16, border: '1px solid #eef2ee', overflow: 'hidden', boxShadow: '0 2px 6px rgba(0,0,0,0.04)' }}>
                <div onClick={() => toggleExpand(c.id)} style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 16, cursor: 'pointer' }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: c.status === 'signed_off' ? '#e8f5e9' : '#fff8e1', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontWeight: 800, fontSize: 16, color: c.status === 'signed_off' ? PRIMARY : '#f59e0b' }}>
                    {new Date(c.cash_up_date).getDate()}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontWeight: 700, color: '#333', fontSize: 15 }}>{isToday ? 'Today' : new Date(c.cash_up_date).toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: c.status === 'signed_off' ? '#e8f5e9' : '#fff8e1', color: c.status === 'signed_off' ? PRIMARY : '#f59e0b' }}>{c.status === 'signed_off' ? 'SIGNED OFF' : 'DRAFT'}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 20, fontSize: 13 }}>
                      <span style={{ color: '#666' }}>Cash Up Total: <strong style={{ color: '#333' }}>{fmt(c.cash_up_total || 0)}</strong></span>
                      <span style={{ color: '#666' }}>Customers: <strong style={{ color: '#333' }}>{c.customer_count}</strong></span>
                      {c.signed_by_name && <span style={{ color: '#666' }}>Signed: <strong style={{ color: '#333' }}>{c.signed_by_name}</strong></span>}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' as const, flexShrink: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: vc }}>{vLabel(c.variance || 0)}</div>
                    <div style={{ fontSize: 11, color: '#aaa', marginTop: 4 }}>{isExpanded ? '▲ collapse' : '▼ expand'}</div>
                  </div>
                </div>
                {isExpanded && (
                  <div style={{ borderTop: '1px solid #f0f4f0', padding: '24px', background: '#fafbfa' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 16 }}>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: PRIMARY, textTransform: 'uppercase' as const, letterSpacing: 0.5, marginBottom: 8 }}>Cash Count</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                          {[{ label: 'Till Float', value: fmt(c.float_total || 0), bg: DARK }, { label: 'To Bank', value: fmt(c.bank_total || 0), bg: PRIMARY }].map(item => (
                            <div key={item.label} style={{ background: item.bg, borderRadius: 8, padding: '8px 12px', textAlign: 'center' as const }}>
                              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)', marginBottom: 2 }}>{item.label}</div>
                              <div style={{ fontWeight: 800, color: '#fff', fontSize: 15 }}>{item.value}</div>
                            </div>
                          ))}
                        </div>
                        <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>Total Cash: <strong>{fmt(c.total_cash || 0)}</strong></div>
                      </div>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: PRIMARY, textTransform: 'uppercase' as const, letterSpacing: 0.5, marginBottom: 8 }}>Reconciliation</div>
                        {[
                          { label: 'Total Cash', value: fmt(c.total_cash || 0) },
                          { label: '− Previous Float', value: fmt(c.previous_float || 0) },
                          { label: '+ EFT / Card', value: fmt(c.eft_total || 0) },
                          { label: '+ Payouts', value: fmt(c.payouts || 0) },
                          { label: 'A Total', value: fmt(c.a_total || 0), bold: true },
                          { label: 'POS Slip Total', value: fmt(c.pos_slip_total || 0) },
                          { label: '− Voids', value: fmt(c.voids || 0) },
                          { label: 'Cash Up Total', value: fmt(c.cash_up_total || 0), bold: true },
                        ].map(row => (
                          <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4, padding: row.bold ? '4px 6px' : '0', background: row.bold ? '#f0f4f0' : 'transparent', borderRadius: row.bold ? 4 : 0 }}>
                            <span style={{ color: row.bold ? '#333' : '#666', fontWeight: row.bold ? 700 : 400 }}>{row.label}</span>
                            <span style={{ fontWeight: row.bold ? 800 : 500, color: row.bold ? PRIMARY : '#333' }}>{row.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    {payouts.length > 0 && (
                      <div style={{ marginBottom: 16 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: PRIMARY, textTransform: 'uppercase' as const, letterSpacing: 0.5, marginBottom: 8 }}>Payout Breakdown</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {payouts.map(p => (
                            <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', borderRadius: 8, padding: '8px 12px', border: '1px solid #eef2ee' }}>
                              <div>
                                <div style={{ fontSize: 13, fontWeight: 600, color: '#333' }}>{p.category}</div>
                                {p.description && <div style={{ fontSize: 11, color: '#888' }}>{p.description}</div>}
                                {p.employee_name && <div style={{ fontSize: 11, color: PRIMARY, fontWeight: 600 }}>→ {p.employee_name}</div>}
                              </div>
                              <div style={{ fontWeight: 700, color: '#333', fontSize: 14 }}>{fmt(p.amount)}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    <div style={{ background: (c.variance || 0) === 0 ? '#e8f5e9' : (c.variance || 0) > 0 ? '#fff8e1' : '#fdecea', borderRadius: 12, padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: `2px solid ${vc}` }}>
                      <span style={{ fontWeight: 700, color: vc, fontSize: 14 }}>VARIANCE</span>
                      <div style={{ textAlign: 'right' as const }}>
                        <div style={{ fontWeight: 900, color: vc, fontSize: 24 }}>{(c.variance || 0) === 0 ? 'R 0.00' : fmt(Math.abs(c.variance || 0))}</div>
                        <div style={{ fontWeight: 700, color: vc, fontSize: 13 }}>{vLabel(c.variance || 0)}</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── WIZARD (store manager) ───────────────────────────────────────────────────
function CashUpWizard({ storeId, orgId, storeName }: { storeId: string; orgId: string; storeName: string }) {
  const router = useRouter();
  const [cashUp, setCashUp] = useState<CashUp | null>(null);
  const [history, setHistory] = useState<CashUp[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeStep, setActiveStep] = useState(1);
  const [showPayoutForm, setShowPayoutForm] = useState(false);
  const [payoutForm, setPayoutForm] = useState({ amount: '', category: 'Salary Advance', description: '', employee_id: '', employee_name: '' });
  const [payoutSaving, setPayoutSaving] = useState(false);

  const [cashUpDate, setCashUpDate] = useState(() => {
    // Default to yesterday if before 10am (overnight shift), otherwise today
    const now = new Date();
    const useYesterday = now.getHours() < 10;
    if (useYesterday) { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().split('T')[0]; }
    return now.toISOString().split('T')[0];
  });
  const [numTills, setNumTills] = useState(1);
  const [tillDenoms, setTillDenoms] = useState<Record<string, number>[]>([
    { r200: 0, r100: 0, r50: 0, r20: 0, r10: 0, r5: 0, r2: 0, r1: 0, r050: 0, r020: 0, r010: 0, r005: 0 },
  ]);
  const [bankDenoms, setBankDenoms] = useState<Record<string, number>>({ r200: 0, r100: 0, r50: 0, r20: 0, r10: 0, r5: 0, r2: 0, r1: 0, r050: 0, r020: 0, r010: 0, r005: 0 });
  const [floatDenoms, setFloatDenoms] = useState<Record<string, number>>({ r200: 0, r100: 0, r50: 0, r20: 0, r10: 0, r5: 0, r2: 0, r1: 0, r050: 0, r020: 0, r010: 0, r005: 0 });
  const [recon, setRecon] = useState({ previous_float: '', eft_total: '', pos_slip_total: '', voids: '', banked: false, bank_deposit_amount: '', bank_reference: '' });
  const [perf, setPerf] = useState({ customer_count: '' });
  const [notes, setNotes] = useState('');
  const [signedByName, setSignedByName] = useState('');

  useEffect(() => { checkAuthAndLoad(); }, []);

  async function checkAuthAndLoad() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push('/login'); return; }
    const ctx = await getStoreContext();
    const sid = ctx?.storeId || storeId || DEFAULT_STORE_ID;
    await Promise.all([loadCashUp(undefined, sid), loadStaff(sid), loadEmployees(sid)]);
  }

  async function loadStaff(sid: string) {
    const { data } = await supabase.from('store_staff').select('id, full_name, role').eq('store_id', sid).order('full_name');
    setStaff(data || []);
  }

  async function loadEmployees(sid: string) {
    const { data } = await supabase.from('employees').select('id, full_name, role').eq('store_id', sid).eq('is_active', true).order('full_name');
    setEmployees(data || []);
  }

  async function loadCashUp(dateOverride?: string, sid?: string) {
    const _sid = sid || storeId;
    setLoading(true);
    const targetDate = dateOverride || cashUpDate;
    const { data: existingCashUp } = await supabase.from('cash_ups').select('*').eq('store_id', _sid).eq('cash_up_date', targetDate).maybeSingle();
    if (existingCashUp) {
      setCashUp(existingCashUp);
      populateForm(existingCashUp);
      await loadPayouts(existingCashUp.id);
      if (existingCashUp.num_tills) setNumTills(existingCashUp.num_tills);
      // Restore till denominations: use saved till_data if available, else fall back to legacy r200/r100 columns
      if (existingCashUp.till_data?.length) {
        setTillDenoms(existingCashUp.till_data);
      } else {
        setTillDenoms([{
          r200: existingCashUp.r200 || 0, r100: existingCashUp.r100 || 0,
          r50: existingCashUp.r50 || 0, r20: existingCashUp.r20 || 0,
          r10: existingCashUp.r10 || 0, r5: existingCashUp.r5 || 0,
          r2: existingCashUp.r2 || 0, r1: existingCashUp.r1 || 0,
          r050: existingCashUp.r050 || 0, r020: existingCashUp.r020 || 0,
          r010: existingCashUp.r010 || 0, r005: existingCashUp.r005 || 0,
        }]);
      }
    } else {
      setCashUp(null);
      // Load previous day float as starting float
      const prevDate = new Date(targetDate); prevDate.setDate(prevDate.getDate() - 1);
      const { data: prevCashUp } = await supabase.from('cash_ups').select('float_total').eq('store_id', _sid).eq('cash_up_date', prevDate.toISOString().split('T')[0]).maybeSingle();
      if (prevCashUp?.float_total) setRecon(p => ({ ...p, previous_float: prevCashUp.float_total.toString() }));
    }
    const { data: hist } = await supabase.from('cash_ups').select('*').eq('store_id', _sid).order('cash_up_date', { ascending: false }).limit(14);
    setHistory(hist || []);
    setLoading(false);
  }

  async function handleDateChange(newDate: string) {
    setCashUpDate(newDate);
    // Reset form
    setBankDenoms({ r200: 0, r100: 0, r50: 0, r20: 0, r10: 0, r5: 0, r2: 0, r1: 0, r050: 0, r020: 0, r010: 0, r005: 0 });
    setFloatDenoms({ r200: 0, r100: 0, r50: 0, r20: 0, r10: 0, r5: 0, r2: 0, r1: 0, r050: 0, r020: 0, r010: 0, r005: 0 });
    setTillDenoms([{ r200: 0, r100: 0, r50: 0, r20: 0, r10: 0, r5: 0, r2: 0, r1: 0, r050: 0, r020: 0, r010: 0, r005: 0 }]);
    setRecon({ previous_float: '', eft_total: '', pos_slip_total: '', voids: '', banked: false, bank_deposit_amount: '', bank_reference: '' });
    setNotes(''); setPayouts([]); setActiveStep(1);
    await loadCashUp(newDate);
  }

  function handleNumTillsChange(n: number) {
    setNumTills(n);
    setTillDenoms(prev => {
      const next = [...prev];
      while (next.length < n) next.push({ r200: 0, r100: 0, r50: 0, r20: 0, r10: 0, r5: 0, r2: 0, r1: 0, r050: 0, r020: 0, r010: 0, r005: 0 });
      return next.slice(0, n);
    });
  }

  function updateTillDenom(tillIdx: number, key: string, value: number) {
    setTillDenoms(prev => prev.map((t, i) => i === tillIdx ? { ...t, [key]: value } : t));
  }

  async function loadPayouts(cashUpId: string) {
    const { data } = await supabase.from('cash_up_payouts').select('*').eq('cash_up_id', cashUpId).order('created_at');
    setPayouts(data || []);
  }

  function populateForm(c: CashUp) {
    setBankDenoms({ r200: c.r200 || 0, r100: c.r100 || 0, r50: c.r50 || 0, r20: c.r20 || 0, r10: c.r10 || 0, r5: c.r5 || 0, r2: c.r2 || 0, r1: c.r1 || 0, r050: c.r050 || 0, r020: c.r020 || 0, r010: c.r010 || 0, r005: c.r005 || 0 });
    setFloatDenoms({ r200: c.float_r200, r100: c.float_r100, r50: c.float_r50, r20: c.float_r20, r10: c.float_r10, r5: c.float_r5, r2: c.float_r2, r1: c.float_r1, r050: c.float_r050, r020: c.float_r020, r010: c.float_r010, r005: c.float_r005 });
    setRecon({ previous_float: c.previous_float.toString(), eft_total: c.eft_total.toString(), pos_slip_total: c.pos_slip_total.toString(), voids: c.voids.toString(), banked: c.banked, bank_deposit_amount: c.bank_deposit_amount?.toString() || '', bank_reference: c.bank_reference || '' });
    setPerf({ customer_count: c.customer_count.toString() });
    setNotes(c.notes || '');
    setSignedByName(c.signed_by_name || '');
  }

  const tillTotals = tillDenoms.map(till => DENOMS.reduce((sum, d) => sum + (till[d.key] || 0) * d.value, 0));
  const bankTotal = tillTotals.reduce((sum, t) => sum + t, 0);
  const floatTotal = DENOMS.reduce((sum, d) => sum + (floatDenoms[d.key] || 0) * d.value, 0);
  const totalCash = bankTotal + floatTotal;
  const prevFloat = parseFloat(recon.previous_float) || 0;
  const eft = parseFloat(recon.eft_total) || 0;
  const payoutsTotal = payouts.reduce((sum, p) => sum + p.amount, 0);
  const aTotal = totalCash - prevFloat + eft + payoutsTotal;
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
      store_id: storeId, organisation_id: orgId, cash_up_date: cashUpDate,
      r200: tillDenoms.reduce((s,t)=>s+(t.r200||0),0), r100: tillDenoms.reduce((s,t)=>s+(t.r100||0),0), r50: tillDenoms.reduce((s,t)=>s+(t.r50||0),0), r20: tillDenoms.reduce((s,t)=>s+(t.r20||0),0), r10: tillDenoms.reduce((s,t)=>s+(t.r10||0),0), r5: tillDenoms.reduce((s,t)=>s+(t.r5||0),0), r2: tillDenoms.reduce((s,t)=>s+(t.r2||0),0), r1: tillDenoms.reduce((s,t)=>s+(t.r1||0),0), r050: tillDenoms.reduce((s,t)=>s+(t.r050||0),0), r020: tillDenoms.reduce((s,t)=>s+(t.r020||0),0), r010: tillDenoms.reduce((s,t)=>s+(t.r010||0),0), r005: tillDenoms.reduce((s,t)=>s+(t.r005||0),0),
      float_r200: floatDenoms.r200, float_r100: floatDenoms.r100, float_r50: floatDenoms.r50, float_r20: floatDenoms.r20, float_r10: floatDenoms.r10, float_r5: floatDenoms.r5, float_r2: floatDenoms.r2, float_r1: floatDenoms.r1, float_r050: floatDenoms.r050, float_r020: floatDenoms.r020, float_r010: floatDenoms.r010, float_r005: floatDenoms.r005,
      float_total: floatTotal, bank_total: bankTotal, total_cash: totalCash,
      previous_float: prevFloat, eft_total: eft, payouts: payoutsTotal,
      a_total: aTotal, pos_slip_total: posSlip, voids, cash_up_total: cashUpTotal, variance,
      banked: recon.banked,
      bank_deposit_amount: recon.bank_deposit_amount ? parseFloat(recon.bank_deposit_amount) : null,
      bank_reference: recon.bank_reference || null,
      customer_count: customers, average_spend: avgSpend, notes: notes || null, status,
      num_tills: numTills, till_data: tillDenoms,
    };
  }

  async function saveDraft() {
    setSaving(true);
    try {
      const payload = buildPayload('draft');
      if (cashUp?.id) { await supabase.from('cash_ups').update(payload).eq('id', cashUp.id); }
      else { const { data } = await supabase.from('cash_ups').insert(payload).select().single(); if (data) setCashUp(data); }
      await loadCashUp();
    } catch (e) { console.error('Save error:', e); }
    setSaving(false);
  }

  async function signOff() {
    if (!signedByName.trim()) return;
    // Safety check: catch the classic "forgot to enter the POS slip total" mistake before
    // it locks in — a missing slip total silently inflates the variance to the full cash
    // total and there was previously no way to fix it without editing the database directly.
    if (posSlip === 0) {
      const proceed = confirm(
        `POS Slip Total is R0.00 — it looks like it wasn't entered.

` +
        `Signing off now will lock in a variance of ${varianceLabel} based on that R0.00.

` +
        `Sign off anyway? (Cancel to go back and enter it)`
      );
      if (!proceed) return;
    }
    setSaving(true);
    try {
      const payload = { ...buildPayload('signed_off'), signed_by_name: signedByName.trim(), signed_off_at: new Date().toISOString() };
      if (cashUp?.id) { await supabase.from('cash_ups').update(payload).eq('id', cashUp.id); }
      else { const { data } = await supabase.from('cash_ups').insert(payload).select().single(); if (data) setCashUp(data); }
      await loadCashUp();
    } catch (e) { console.error('Sign off error:', e); alert('Sign off failed'); }
    setSaving(false);
  }

  // Lets a signed-off cash up be corrected instead of being permanently locked. Drops status
  // back to 'draft' (unlocking every field) so mistakes like a missed POS Slip Total can be
  // fixed — it must be signed off again afterwards to re-lock it.
  async function reopenForEditing() {
    if (!cashUp?.id) return;
    if (!confirm('Reopen this signed-off cash up for editing? It will return to Draft status until it is signed off again.')) return;
    setSaving(true);
    try {
      await supabase.from('cash_ups').update({ status: 'draft' }).eq('id', cashUp.id);
      await loadCashUp();
      setActiveStep(2);
    } catch (e) { console.error('Reopen error:', e); alert('Failed to reopen'); }
    setSaving(false);
  }

  async function addPayout() {
    if (!payoutForm.amount || parseFloat(payoutForm.amount) <= 0) return;
    setPayoutSaving(true);
    try {
      let cashUpId = cashUp?.id;
      if (!cashUpId) {
        const payload = buildPayload('draft');
        const { data } = await supabase.from('cash_ups').insert(payload).select().single();
        if (data) { setCashUp(data); cashUpId = data.id; }
      }
      const selectedEmployee = employees.find(e => e.id === payoutForm.employee_id);
      let linkedAdvanceId: string | null = null;
      if (payoutForm.category === 'Salary Advance' && selectedEmployee) {
        const today = new Date().toISOString().split('T')[0];
        const { data: advance } = await supabase.from('employee_advances').insert({
          employee_id: selectedEmployee.id, store_id: storeId,
          amount: parseFloat(payoutForm.amount),
          reason: payoutForm.description || `Cash advance on ${today}`,
          advance_date: today, repayment_status: 'outstanding',
          deduct_from_wages: true,
        }).select().single();
        linkedAdvanceId = advance?.id || null;
      }
      await supabase.from('cash_up_payouts').insert({
        cash_up_id: cashUpId, store_id: storeId,
        amount: parseFloat(payoutForm.amount),
        category: payoutForm.category,
        description: payoutForm.description || null,
        employee_id: selectedEmployee?.id || null,
        employee_name: selectedEmployee?.full_name || null,
        linked_advance_id: linkedAdvanceId,
      });
      if (cashUpId) await loadPayouts(cashUpId);
      const updatedPayoutsTotal = payouts.reduce((s, p) => s + p.amount, 0) + parseFloat(payoutForm.amount);
      if (cashUpId) {
        await supabase.from('cash_ups').update({ payouts: updatedPayoutsTotal, a_total: totalCash - prevFloat + eft + updatedPayoutsTotal, variance: (totalCash - prevFloat + eft + updatedPayoutsTotal) - cashUpTotal }).eq('id', cashUpId);
      }
      setPayoutForm({ amount: '', category: 'Salary Advance', description: '', employee_id: '', employee_name: '' });
      setShowPayoutForm(false);
      // Note: intentionally NOT calling loadCashUp() here — it re-fetches the whole record
      // from the DB and repopulates the form (previous_float, eft_total, etc.), which wipes
      // out anything typed but not yet saved. loadPayouts() above already refreshes the
      // payout list, and totals/variance are derived reactively from local state.
    } catch (e) { console.error('Payout error:', e); }
    setPayoutSaving(false);
  }

  async function removePayout(payoutId: string) {
    await supabase.from('cash_up_payouts').delete().eq('id', payoutId);
    if (cashUp?.id) await loadPayouts(cashUp.id);
    await saveDraft();
  }

  function printCashUp() {
    const c = cashUp; if (!c) return;
    const vColor = (c.variance || 0) === 0 ? '#1a5c38' : (c.variance || 0) > 0 ? '#f59e0b' : '#ef4444';
    const vLabel2 = (c.variance || 0) === 0 ? 'BALANCED' : (c.variance || 0) > 0 ? `OVER by R ${Math.abs(c.variance || 0).toFixed(2)}` : `SHORT by R ${Math.abs(c.variance || 0).toFixed(2)}`;
    const denomRows = DENOMS.map(d => {
      const bankQty = (c[d.key as keyof CashUp] as number) || 0;
      const floatQty = (c[`float_${d.key}` as keyof CashUp] as number) || 0;
      if (!bankQty && !floatQty) return '';
      return `<tr><td>${d.label}</td><td class="right">${floatQty}</td><td class="right">R ${(floatQty * d.value).toFixed(2)}</td><td class="divider"></td><td class="right">${bankQty}</td><td class="right">R ${(bankQty * d.value).toFixed(2)}</td></tr>`;
    }).join('');
    const payoutRows = payouts.map(p => `<tr><td>${p.category}</td><td>${p.description || '—'}</td><td>${p.employee_name || '—'}</td><td class="right">R ${p.amount.toFixed(2)}</td></tr>`).join('');
    const win = window.open('', '_blank'); if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><title>Cash Up - ${c.cash_up_date}</title><style>
      @page{size:A4;margin:10mm 14mm}*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;font-size:10px;color:#111}
      .header{text-align:center;padding-bottom:10px;margin-bottom:12px;border-bottom:3px solid #1a5c38}.header h1{font-size:20px;color:#1a5c38;font-weight:900}
      .header h2{font-size:12px;color:#444;margin-top:2px;font-weight:600;text-transform:uppercase}.header p{font-size:10px;color:#888;margin-top:3px}
      .meta{display:flex;justify-content:space-between;background:#f0f7f2;padding:8px 12px;border-radius:6px;margin-bottom:12px;font-size:10px}.meta strong{color:#1a5c38}
      .section-title{font-size:10px;font-weight:800;color:#1a5c38;text-transform:uppercase;letter-spacing:.8px;border-bottom:2px solid #1a5c38;padding-bottom:3px;margin-bottom:6px}
      table{width:100%;border-collapse:collapse;font-size:10px;margin-bottom:12px}td,th{padding:4px 5px}th{background:#1a5c38;color:#fff;font-weight:700;text-align:left}
      th.right,td.right{text-align:right}tr:nth-child(even) td{background:#f8f8f8}.total-row td{font-weight:800;background:#e8f5e9;border-top:2px solid #1a5c38}
      td.divider{width:10px;background:#fff;border-left:2px dashed #ccc;border-right:2px dashed #ccc}th.divider{background:#fff;border-left:2px dashed #ccc;border-right:2px dashed #ccc}
      .col-header{background:#0a1f12;color:#fff;text-align:center;font-weight:800;padding:5px}
      .two-col{display:flex;gap:14px;margin-bottom:12px}.two-col>div{flex:1}
      .recon-row{display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #eee;font-size:10px}
      .recon-row.subtotal{font-weight:800;background:#e8f5e9;padding:5px 4px;margin-top:2px;border-top:2px solid #1a5c38;border-bottom:none}
      .variance-box{border:3px solid ${vColor};background:${(c.variance||0)===0?'#e8f5e9':(c.variance||0)>0?'#fff8e1':'#fdecea'};padding:10px 16px;border-radius:8px;text-align:center;margin:10px 0}
      .variance-label{font-size:9px;font-weight:800;color:${vColor};text-transform:uppercase;letter-spacing:1px}
      .variance-amount{font-size:26px;font-weight:900;color:${vColor};margin:3px 0}.variance-status{font-size:12px;font-weight:800;color:${vColor}}
      .notes-box{border:1px solid #ddd;padding:6px 8px;border-radius:4px;min-height:40px;font-size:10px}
      .sign-section{display:flex;justify-content:space-between;margin-top:16px;padding-top:12px;border-top:2px solid #1a5c38}
      .sign-block{text-align:center}.sign-line{border-bottom:1px solid #333;width:140px;margin:28px auto 5px}
      .sign-label{font-size:9px;color:#666}.sign-name{font-size:10px;font-weight:700;color:#333;margin-top:2px}
      .footer{margin-top:12px;text-align:center;font-size:8px;color:#aaa;border-top:1px solid #eee;padding-top:6px}
      .badge{display:inline-block;padding:2px 7px;border-radius:10px;font-size:9px;font-weight:800}
      .badge-green{background:#e8f5e9;color:#1a5c38}.badge-amber{background:#fff8e1;color:#f59e0b}
      .totals-summary{display:flex;gap:10px;margin-bottom:12px}
      .total-pill{flex:1;background:#f0f7f2;border:2px solid #1a5c38;border-radius:7px;padding:8px;text-align:center}
      .total-pill .label{font-size:8px;color:#666;text-transform:uppercase;font-weight:700}
      .total-pill .amount{font-size:14px;font-weight:900;color:#1a5c38;margin-top:1px}
    </style></head><body>
    <div class="header"><h1>CompliTrack</h1><h2>Daily Cash Up Report</h2><p>${storeName}</p></div>
    <div class="meta">
      <div><strong>Date:</strong> ${new Date(c.cash_up_date).toLocaleDateString('en-ZA',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</div>
      <div><strong>Status:</strong> <span class="badge ${c.status==='signed_off'?'badge-green':'badge-amber'}">${c.status==='signed_off'?'SIGNED OFF':'DRAFT'}</span></div>
      <div><strong>Signed by:</strong> ${c.signed_by_name||'—'}</div>
      <div><strong>Time:</strong> ${c.signed_off_at?new Date(c.signed_off_at).toLocaleTimeString('en-ZA',{hour:'2-digit',minute:'2-digit'}):'—'}</div>
    </div>
    <div class="section-title">Cash Count</div>
    <div class="totals-summary">
      <div class="total-pill"><div class="label">Till Float</div><div class="amount">R ${(c.float_total||0).toFixed(2)}</div></div>
      <div class="total-pill"><div class="label">To Bank</div><div class="amount">R ${(c.bank_total||0).toFixed(2)}</div></div>
      <div class="total-pill"><div class="label">Total Cash</div><div class="amount">R ${(c.total_cash||0).toFixed(2)}</div></div>
    </div>
    <table>
      <tr><th rowspan="2">Denom</th><th colspan="2" class="col-header" style="text-align:center">TILL FLOAT</th><th class="divider"></th><th colspan="2" class="col-header" style="text-align:center">TO BANK</th></tr>
      <tr><th class="right">Qty</th><th class="right">Value</th><th class="divider"></th><th class="right">Qty</th><th class="right">Value</th></tr>
      ${denomRows}
      <tr class="total-row"><td><strong>TOTAL</strong></td><td></td><td class="right"><strong>R ${(c.float_total||0).toFixed(2)}</strong></td><td class="divider"></td><td></td><td class="right"><strong>R ${(c.bank_total||0).toFixed(2)}</strong></td></tr>
    </table>
    <div class="two-col">
      <div>
        <div class="section-title">Reconciliation</div>
        <div class="recon-row"><span>Total Cash Counted</span><span>R ${(c.total_cash||0).toFixed(2)}</span></div>
        <div class="recon-row"><span>Less: Previous Float</span><span>— R ${(c.previous_float||0).toFixed(2)}</span></div>
        <div class="recon-row"><span>Plus: EFT / Card</span><span>+ R ${(c.eft_total||0).toFixed(2)}</span></div>
        <div class="recon-row"><span>Plus: Payouts</span><span>+ R ${(c.payouts||0).toFixed(2)}</span></div>
        <div class="recon-row subtotal"><span><strong>A Total</strong></span><span><strong>R ${(c.a_total||0).toFixed(2)}</strong></span></div>
        <br/>
        <div class="recon-row"><span>POS Slip Total</span><span>R ${(c.pos_slip_total||0).toFixed(2)}</span></div>
        <div class="recon-row"><span>Less: Voids</span><span>— R ${(c.voids||0).toFixed(2)}</span></div>
        <div class="recon-row subtotal"><span><strong>Cash Up Total</strong></span><span><strong>R ${(c.cash_up_total||0).toFixed(2)}</strong></span></div>
        ${c.banked?`<br/><div class="recon-row"><span>Bank Deposit</span><span>R ${(c.bank_deposit_amount||0).toFixed(2)}</span></div><div class="recon-row"><span>Bank Ref</span><span>${c.bank_reference||'—'}</span></div>`:''}
      </div>
      <div>
        ${payouts.length > 0 ? `
        <div class="section-title">Payout Breakdown</div>
        <table>
          <tr><th>Category</th><th>Description</th><th>Employee</th><th class="right">Amount</th></tr>
          ${payoutRows}
          <tr class="total-row"><td colspan="3"><strong>Total Payouts</strong></td><td class="right"><strong>R ${payouts.reduce((s,p)=>s+p.amount,0).toFixed(2)}</strong></td></tr>
        </table>
        ` : ''}
        <div class="section-title">Sales Performance</div>
        <div class="recon-row"><span>Customers</span><span>${c.customer_count}</span></div>
        <div class="recon-row"><span>Cash Up Total</span><span>R ${(c.cash_up_total||0).toFixed(2)}</span></div>
        <div class="recon-row subtotal"><span><strong>Avg per Customer</strong></span><span><strong>${c.customer_count>0?`R ${(c.average_spend||0).toFixed(2)}`:'—'}</strong></span></div>
        <br/>
        <div class="section-title">Notes</div>
        <div class="notes-box">${c.notes||'No notes recorded.'}</div>
      </div>
    </div>
    <div class="variance-box">
      <div class="variance-label">Variance</div>
      <div class="variance-amount">${(c.variance||0)===0?'R 0.00':`R ${Math.abs(c.variance||0).toFixed(2)}`}</div>
      <div class="variance-status">${vLabel2}</div>
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

  const denomInputStyle = (disabled: boolean) => ({ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid #eef2ee', fontSize: 13, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' as const, background: disabled ? '#f8faf8' : '#fff', textAlign: 'center' as const });
  const reconInputStyle = { width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid #eef2ee', fontSize: 14, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' as const, background: readOnly ? '#f8faf8' : '#fff' };
  const cardStyle = { background: '#fff', borderRadius: 20, padding: 24, border: '1px solid #eef2ee', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' };
  const lbl = { display: 'block' as const, fontSize: 13, fontWeight: 600 as const, color: '#555', marginBottom: 6 };
  const inp = { width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid #eef2ee', fontSize: 14, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' as const };
  const steps = ['Cash Count', 'Reconciliation', 'Performance', 'Notes', 'Sign Off'];

  return (
    <div style={{ minHeight: '100vh', background: '#f8faf8', fontFamily: 'system-ui, sans-serif' }}>

      {/* Payout Form Modal */}
      {showPayoutForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ background: '#fff', borderRadius: 20, padding: 32, width: '100%', maxWidth: 480 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#333' }}>Add Payout</div>
              <button onClick={() => setShowPayoutForm(false)} style={{ background: '#f0f4f0', border: 'none', borderRadius: 8, padding: '6px 14px', cursor: 'pointer' }}>Cancel</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={lbl}>Category *</label>
                <select value={payoutForm.category} onChange={e => setPayoutForm(p => ({ ...p, category: e.target.value, employee_id: '', employee_name: '' }))} style={inp}>
                  {PAYOUT_CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              {payoutForm.category === 'Salary Advance' && (
                <div>
                  <label style={lbl}>Employee *</label>
                  <select value={payoutForm.employee_id} onChange={e => { const emp = employees.find(em => em.id === e.target.value); setPayoutForm(p => ({ ...p, employee_id: e.target.value, employee_name: emp?.full_name || '' })); }} style={inp}>
                    <option value="">— Select employee —</option>
                    {employees.map(e => <option key={e.id} value={e.id}>{e.full_name} ({e.role})</option>)}
                  </select>
                  {payoutForm.employee_id && (
                    <div style={{ marginTop: 6, padding: '8px 12px', background: '#e8f5e9', borderRadius: 8, fontSize: 12, color: PRIMARY, fontWeight: 600 }}>
                      ✅ This advance will be automatically recorded on {employees.find(e => e.id === payoutForm.employee_id)?.full_name}&apos;s profile and deducted from their salary
                    </div>
                  )}
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={lbl}>Amount (R) *</label>
                  <input type="number" min="0" step="0.01" value={payoutForm.amount} onChange={e => setPayoutForm(p => ({ ...p, amount: e.target.value }))} placeholder="0.00" style={inp} />
                </div>
                <div>
                  <label style={lbl}>Description</label>
                  <input value={payoutForm.description} onChange={e => setPayoutForm(p => ({ ...p, description: e.target.value }))} placeholder={payoutForm.category === 'Salary Advance' ? 'e.g. Wage advance' : 'e.g. Bought bread'} style={inp} />
                </div>
              </div>
            </div>
            <button onClick={addPayout} disabled={payoutSaving || !payoutForm.amount || (payoutForm.category === 'Salary Advance' && !payoutForm.employee_id)} style={{ width: '100%', marginTop: 20, padding: '13px', background: payoutForm.amount ? PRIMARY : '#eee', color: payoutForm.amount ? '#fff' : '#aaa', border: 'none', borderRadius: 12, fontWeight: 700, cursor: 'pointer', fontSize: 15 }}>
              {payoutSaving ? 'Saving...' : 'Add Payout'}
            </button>
          </div>
        </div>
      )}

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

              {/* STEP 1 — CASH COUNT */}
              {activeStep === 1 && (
                <div style={cardStyle}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#333', marginBottom: 4 }}>Count Your Cash</div>
                  <div style={{ fontSize: 13, color: '#888', marginBottom: 16 }}>Enter quantities for Till Float and To Bank separately</div>

                  {/* Date picker + Till selector */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20, padding: 16, background: '#f8faf8', borderRadius: 12 }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 6, textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>Cash-Up Date</div>
                      <input type="date" value={cashUpDate} onChange={e => handleDateChange(e.target.value)} disabled={readOnly}
                        style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #d1d5db', borderRadius: 10, fontSize: 15, fontWeight: 600, boxSizing: 'border-box' as const, background: readOnly ? '#f3f4f6' : '#fff' }} />
                      <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>
                        {cashUpDate === new Date().toISOString().split('T')[0] ? '📅 Today' :
                         cashUpDate === (() => { const d = new Date(); d.setDate(d.getDate()-1); return d.toISOString().split('T')[0]; })() ? '🌙 Yesterday (overnight shift)' : '📆 ' + cashUpDate}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 6, textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>Number of Tills</div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        {[1, 2, 3, 4].map(n => (
                          <button key={n} onClick={() => !readOnly && handleNumTillsChange(n)} disabled={readOnly}
                            style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: numTills === n ? 'none' : '1.5px solid #d1d5db', background: numTills === n ? PRIMARY : '#fff', color: numTills === n ? '#fff' : '#374151', fontWeight: 700, fontSize: 15, cursor: readOnly ? 'not-allowed' : 'pointer' }}>
                            {n}
                          </button>
                        ))}
                      </div>
                      <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>{numTills === 1 ? 'Single till' : `${numTills} tills — each counted separately`}</div>
                    </div>
                  </div>

                  {/* Per-till denomination grids */}
                  {tillDenoms.map((till, tillIdx) => (
                    <div key={tillIdx} style={{ marginBottom: 20 }}>
                      {numTills > 1 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                          <div style={{ fontSize: 14, fontWeight: 700, color: PRIMARY, background: '#f0fdf4', padding: '4px 14px', borderRadius: 20 }}>Till {tillIdx + 1}</div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#333' }}>Subtotal: {fmt(tillTotals[tillIdx] || 0)}</div>
                        </div>
                      )}
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
                        <input type="number" min="0" value={till[d.key] || ''} onChange={e => updateTillDenom(tillIdx, d.key, parseInt(e.target.value) || 0)} disabled={readOnly} placeholder="0" style={denomInputStyle(readOnly)} />
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, color: PRIMARY, fontSize: 13 }}>{fmt((till[d.key] || 0) * d.value)}</div>
                      </div>
                    </div>
                  ))}
                  <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 20px 1fr', gap: 8, marginTop: 12 }}>
                    <div style={{ fontWeight: 700, color: '#333', fontSize: 13 }}>TOTAL</div>
                    <div style={{ background: DARK, color: '#fff', borderRadius: 10, padding: '12px 16px', textAlign: 'center' as const, fontWeight: 800, fontSize: 18 }}>{fmt(floatTotal)}</div>
                    <div />
                    <div style={{ background: PRIMARY, color: '#fff', borderRadius: 10, padding: '12px 16px', textAlign: 'center' as const, fontWeight: 800, fontSize: 18 }}>{fmt(tillTotals[tillIdx] || 0)}</div>
                  </div>
                  {numTills > 1 && tillIdx < numTills - 1 && <div style={{ borderTop: '2px dashed #e5e7eb', margin: '16px 0' }} />}
                    </div>
                  ))}
                  {numTills > 1 && (
                    <div style={{ background: '#f0fdf4', border: '2px solid #bbf7d0', borderRadius: 12, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <span style={{ fontWeight: 700, color: '#166534', fontSize: 14 }}>Combined Bank Total ({numTills} tills)</span>
                      <span style={{ fontWeight: 800, color: PRIMARY, fontSize: 22 }}>{fmt(bankTotal)}</span>
                    </div>
                  )}
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

              {/* STEP 2 — RECONCILIATION + PAYOUTS */}
              {activeStep === 2 && (
                <div style={cardStyle}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#333', marginBottom: 4 }}>Reconciliation</div>
                  <div style={{ fontSize: 13, color: '#888', marginBottom: 24 }}>Enter totals and itemise any payouts</div>

                  <div style={{ background: '#f8faf8', borderRadius: 14, padding: 16, marginBottom: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, paddingBottom: 12, borderBottom: '1px solid #eee' }}>
                      <span style={{ fontSize: 14, color: '#666' }}>Total Cash Counted</span>
                      <span style={{ fontWeight: 700, color: '#333', fontSize: 16 }}>{fmt(totalCash)}</span>
                    </div>
                    {[
                      { label: 'Previous Float', key: 'previous_float', sign: '−', hint: 'Auto-filled from yesterday', color: '#ef4444' },
                      { label: 'EFT / Card', key: 'eft_total', sign: '+', hint: 'Total card payments', color: PRIMARY },
                    ].map(f => (
                      <div key={f.key} style={{ marginBottom: 14 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                          <label style={{ fontSize: 13, color: '#666' }}><span style={{ fontWeight: 800, color: f.color, marginRight: 6, fontSize: 15 }}>{f.sign}</span>{f.label}</label>
                          <span style={{ fontSize: 11, color: '#aaa' }}>{f.hint}</span>
                        </div>
                        <input type="number" min="0" step="0.01" value={recon[f.key as keyof typeof recon] as string} onChange={e => setRecon(p => ({ ...p, [f.key]: e.target.value }))} disabled={readOnly} placeholder="0.00" style={reconInputStyle} />
                      </div>
                    ))}

                    {/* PAYOUTS SECTION */}
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                        <label style={{ fontSize: 13, color: '#666' }}><span style={{ fontWeight: 800, color: PRIMARY, marginRight: 6, fontSize: 15 }}>+</span>Payouts</label>
                        {!readOnly && (
                          <button onClick={() => setShowPayoutForm(true)} style={{ fontSize: 12, color: PRIMARY, background: '#e8f5e9', border: 'none', borderRadius: 8, padding: '4px 12px', cursor: 'pointer', fontWeight: 700 }}>+ Add Payout</button>
                        )}
                      </div>
                      {payouts.length === 0 ? (
                        <div style={{ textAlign: 'center' as const, padding: '16px', background: '#f8faf8', borderRadius: 10, color: '#ccc', fontSize: 13, border: '1px dashed #eef2ee' }}>
                          No payouts yet — click &quot;+ Add Payout&quot; to add one
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {payouts.map(p => (
                            <div key={p.id} style={{ background: '#fff', borderRadius: 10, padding: '10px 14px', border: '1px solid #eef2ee', display: 'flex', alignItems: 'center', gap: 12 }}>
                              <div style={{ flex: 1 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: p.category === 'Salary Advance' ? '#e8f5e9' : '#f0f4f0', color: p.category === 'Salary Advance' ? PRIMARY : '#666' }}>{p.category}</span>
                                  {p.employee_name && <span style={{ fontSize: 11, color: PRIMARY, fontWeight: 600 }}>→ {p.employee_name}</span>}
                                </div>
                                {p.description && <div style={{ fontSize: 12, color: '#888', marginTop: 3 }}>{p.description}</div>}
                                {p.linked_advance_id && <div style={{ fontSize: 11, color: '#4ade80', marginTop: 2 }}>✅ Advance recorded on employee profile</div>}
                              </div>
                              <div style={{ fontWeight: 800, color: '#333', fontSize: 16, flexShrink: 0 }}>{fmt(p.amount)}</div>
                              {!readOnly && (
                                <button onClick={() => removePayout(p.id)} style={{ background: '#fdecea', border: 'none', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', color: '#ef4444', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>✕</button>
                              )}
                            </div>
                          ))}
                          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 14px', background: '#f0f7f0', borderRadius: 10, fontWeight: 700, fontSize: 14 }}>
                            <span style={{ color: '#333' }}>Total Payouts</span>
                            <span style={{ color: PRIMARY }}>{fmt(payoutsTotal)}</span>
                          </div>
                        </div>
                      )}
                    </div>

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
                      <div onClick={() => !readOnly && setRecon(p => ({ ...p, banked: !p.banked }))} style={{ width: 48, height: 26, borderRadius: 13, background: recon.banked ? PRIMARY : '#ddd', cursor: readOnly ? 'default' : 'pointer', position: 'relative' as const, flexShrink: 0 }}>
                        <div style={{ position: 'absolute' as const, top: 3, left: recon.banked ? 25 : 3, width: 20, height: 20, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                      </div>
                    </div>
                    {recon.banked && (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 16 }}>
                        <div><label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#555', marginBottom: 6 }}>Deposit Amount</label><input type="number" value={recon.bank_deposit_amount} onChange={e => setRecon(p => ({ ...p, bank_deposit_amount: e.target.value }))} disabled={readOnly} placeholder="0.00" style={reconInputStyle} /></div>
                        <div><label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#555', marginBottom: 6 }}>Reference</label><input value={recon.bank_reference} onChange={e => setRecon(p => ({ ...p, bank_reference: e.target.value }))} disabled={readOnly} placeholder="DEP-001" style={reconInputStyle} /></div>
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

              {/* STEP 3 — PERFORMANCE */}
              {activeStep === 3 && (
                <div style={cardStyle}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#333', marginBottom: 4 }}>Sales Performance</div>
                  <div style={{ fontSize: 13, color: '#888', marginBottom: 24 }}>How many customers did you serve today?</div>
                  <div style={{ marginBottom: 24 }}>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#555', marginBottom: 6 }}>Number of Customers</label>
                    <input type="number" min="0" value={perf.customer_count} onChange={e => setPerf({ customer_count: e.target.value })} disabled={readOnly} placeholder="0" style={{ width: '100%', padding: '16px', borderRadius: 12, border: '1.5px solid #eef2ee', fontSize: 32, textAlign: 'center' as const, fontWeight: 800, outline: 'none', fontFamily: 'inherit', background: readOnly ? '#f8faf8' : '#fff', boxSizing: 'border-box' as const }} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
                    {[['CASH UP TOTAL', fmt(cashUpTotal)], ['AVG PER CUSTOMER', customers > 0 ? fmt(avgSpend) : '—']].map(([label, value]) => (
                      <div key={label} style={{ background: '#f8faf8', borderRadius: 14, padding: 20, textAlign: 'center' as const }}>
                        <div style={{ fontSize: 11, color: '#888', marginBottom: 8, fontWeight: 600 }}>{label}</div>
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

              {/* STEP 4 — NOTES */}
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

              {/* STEP 5 — SIGN OFF */}
              {activeStep === 5 && (
                <div style={cardStyle}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#333', marginBottom: 4 }}>{isSignedOff ? 'Signed Off' : 'Sign Off'}</div>
                  <div style={{ fontSize: 13, color: '#888', marginBottom: 24 }}>Review and confirm today&apos;s cash up</div>
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
                    {[['Previous Float', fmt(prevFloat)], ['Payouts', fmt(payoutsTotal)], ['A Total', fmt(aTotal)], ['POS Slip Total', fmt(posSlip)], ['Voids', fmt(voids)], ['Cash Up Total', fmt(cashUpTotal)], ['Customers', customers.toString()], ['Avg Spend', customers > 0 ? fmt(avgSpend) : '—']].map(([label, value]) => (
                      <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 8, paddingBottom: 8, borderBottom: '1px solid #f0f0f0' }}>
                        <span style={{ color: '#666' }}>{label}</span>
                        <span style={{ fontWeight: 600, color: '#333' }}>{value}</span>
                      </div>
                    ))}
                    {payouts.length > 0 && (
                      <div style={{ marginBottom: 8, paddingBottom: 8, borderBottom: '1px solid #f0f0f0' }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#666', marginBottom: 6 }}>Payout Breakdown:</div>
                        {payouts.map(p => (
                          <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                            <span style={{ color: '#888' }}>{p.category}{p.employee_name ? ` — ${p.employee_name}` : ''}{p.description ? ` (${p.description})` : ''}</span>
                            <span style={{ fontWeight: 600, color: '#333' }}>{fmt(p.amount)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 4 }}>
                      <span style={{ fontWeight: 700, color: '#333', fontSize: 15 }}>VARIANCE</span>
                      <span style={{ fontWeight: 800, fontSize: 20, color: varianceColor }}>{varianceLabel}</span>
                    </div>
                  </div>
                  {!isSignedOff ? (
                    <div>
                      <div style={{ marginBottom: 16 }}>
                        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#555', marginBottom: 6 }}>Signed by</label>
                        {staff.length > 0 ? (
                          <select value={signedByName} onChange={e => setSignedByName(e.target.value)} style={reconInputStyle}>
                            <option value="">— Select staff member —</option>
                            {staff.map(s => <option key={s.id} value={s.full_name}>{s.full_name} ({s.role})</option>)}
                            <option value="__other__">Other (type name)</option>
                          </select>
                        ) : (
                          <input value={signedByName} onChange={e => setSignedByName(e.target.value)} placeholder="Full name of person signing off" style={reconInputStyle} />
                        )}
                        {signedByName === '__other__' && <input onChange={e => setSignedByName(e.target.value)} placeholder="Enter full name" style={{ ...reconInputStyle, marginTop: 8 }} />}
                      </div>
                      <button onClick={signOff} disabled={saving || !signedByName.trim() || signedByName === '__other__'} style={{ width: '100%', padding: '16px', background: signedByName.trim() && signedByName !== '__other__' ? PRIMARY : '#eee', color: signedByName.trim() && signedByName !== '__other__' ? '#fff' : '#aaa', border: 'none', borderRadius: 12, fontWeight: 700, cursor: 'pointer', fontSize: 16 }}>
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
                      <button onClick={printCashUp} style={{ width: '100%', padding: '14px', background: PRIMARY, color: '#fff', border: 'none', borderRadius: 12, fontWeight: 700, cursor: 'pointer', fontSize: 15 }}>Download / Print PDF Report</button>
                      <button onClick={reopenForEditing} disabled={saving} style={{ width: '100%', marginTop: 10, padding: '12px', background: '#fff8e1', color: '#b45309', border: '1.5px solid #fde68a', borderRadius: 12, fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>
                        {saving ? 'Reopening…' : '🔓 Reopen for Editing'}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* SIDEBAR */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={cardStyle}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#333', marginBottom: 16 }}>Today&apos;s Summary</div>
                {[['Till Float', fmt(floatTotal)], ['To Bank', fmt(bankTotal)], ['Total Cash', fmt(totalCash)], ['EFT / Card', fmt(eft)], ['Payouts', fmt(payoutsTotal)], ['A Total', fmt(aTotal)], ['Cash Up Total', fmt(cashUpTotal)], ['Customers', customers.toString()], ['Avg Spend', customers > 0 ? fmt(avgSpend) : '—']].map(([label, value]) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 10 }}>
                    <span style={{ color: '#888' }}>{label}</span>
                    <span style={{ fontWeight: 600, color: '#333' }}>{value}</span>
                  </div>
                ))}
                <div style={{ marginTop: 14, padding: '16px', background: variance === 0 ? '#e8f5e9' : variance > 0 ? '#fff8e1' : '#fdecea', borderRadius: 12, textAlign: 'center' as const, border: `1.5px solid ${varianceColor}` }}>
                  <div style={{ fontSize: 11, color: varianceColor, fontWeight: 700, marginBottom: 6 }}>VARIANCE</div>
                  <div style={{ fontSize: 26, fontWeight: 900, color: varianceColor }}>{variance === 0 ? 'R 0.00' : fmt(Math.abs(variance))}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: varianceColor, marginTop: 6 }}>{varianceLabel}</div>
                </div>
              </div>
              <div style={cardStyle}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#333', marginBottom: 16 }}>Recent History</div>
                {history.filter(h => h.cash_up_date !== new Date().toISOString().split('T')[0]).slice(0, 7).length === 0 && <div style={{ textAlign: 'center' as const, padding: '20px 0', color: '#ccc', fontSize: 13 }}>No history yet</div>}
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

// ─── ROOT — detects role and renders correct view ─────────────────────────────
function CashUpContent() {
  const searchParams = useSearchParams();
  const storeParam = searchParams.get('store');
  const [role, setRole] = useState<string | null>(null);
  const [storeId, setStoreId] = useState('');
  const [orgId, setOrgId] = useState('');
  const [storeName, setStoreName] = useState(DEFAULT_STORE_NAME);
  const [ready, setReady] = useState(false);

  useEffect(() => { detectContext(); }, []);

  async function detectContext() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setReady(true); return; }
    const { data: profile } = await supabase.from('profiles').select('role, organisation_id, store_id').eq('id', user.id).single();
    setRole(profile?.role || null);
    if (storeParam) {
      // Franchisor clicking into a specific store via URL
      const { data: store } = await supabase.from('stores').select('id, name, organisation_id').eq('id', storeParam).single();
      if (store) { setStoreId(store.id); setStoreName(store.name); setOrgId(store.organisation_id); }
    } else if (profile?.store_id) {
      // Regular store owner — load from their profile
      const { data: store } = await supabase.from('stores').select('id, name, organisation_id').eq('id', profile.store_id).single();
      if (store) { setStoreId(store.id); setStoreName(store.name); setOrgId(store.organisation_id || profile.organisation_id || ''); }
    }
    setReady(true);
  }

  if (!ready) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8faf8' }}><div style={{ color: '#666' }}>Loading...</div></div>;

  if (!storeId) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8faf8', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ textAlign: 'center', maxWidth: 400, padding: 32 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🏪</div>
        <div style={{ fontWeight: 800, fontSize: 20, color: '#111', marginBottom: 8 }}>Select a Store First</div>
        <div style={{ color: '#6b7280', fontSize: 14, marginBottom: 24, lineHeight: '1.6' }}>This page is store-specific. Please select a store from the organisation overview.</div>
        <a href="/org" style={{ background: '#1a5c38', color: '#fff', borderRadius: 12, padding: '12px 24px', fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>← Organisation Overview</a>
      </div>
    </div>
  );

  const isFranchisor = role === 'franchisor_admin' || role === 'platform_admin';
  const isFranchiseeOwner = role === 'franchisee_owner';
  if ((isFranchisor || isFranchiseeOwner) && storeParam) return <CashUpHistoryView storeId={storeId} storeName={storeName} />;
  return <CashUpWizard storeId={storeId} orgId={orgId} storeName={storeName} />;
}

export default function CashUpPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8faf8' }}><div style={{ color: '#666' }}>Loading...</div></div>}>
      <CashUpContent />
    </Suspense>
  );
}
