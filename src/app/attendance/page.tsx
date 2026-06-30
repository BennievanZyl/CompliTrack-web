'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

const STORE_ID = '05328298-fc27-4c9f-b091-bb7f6598b601';
const PRIMARY = '#1a5c38';
const DARK = '#0a1f12';

type Employee = { id: string; full_name: string; role: string; is_active: boolean; hourly_rate: number | null };
type AttendanceRecord = { id: string; employee_id: string; work_date: string; clock_in: string | null; clock_out: string | null; hours_worked: number | null; is_late: boolean; notes: string | null };
type Shift = { id: string; shift_name: string; day_type: string; start_time: string; end_time: string; is_active: boolean };
type Leave = { id: string; employee_id: string; leave_type: string; start_date: string; end_date: string; days_taken: number; status: string; reason: string | null };
type Advance = { id: string; employee_id: string; amount: number; advance_date: string; repayment_status: string; deduct_from_wages: boolean; reason: string | null };
type Holiday = { id: string; holiday_date: string; name: string };
type PayrollSettings = { sunday_multiplier: number; holiday_multiplier: number };

const ROLE_COLORS: Record<string, { bg: string; color: string }> = {
  'Store Manager': { bg: '#e8f5e9', color: PRIMARY },
  'Assistant Manager': { bg: '#e3f2fd', color: '#1565c0' },
  'Cashier': { bg: '#fff8e1', color: '#f57f17' },
  'Kitchen Staff': { bg: '#fce4ec', color: '#c62828' },
  'Driver': { bg: '#f3e5f5', color: '#6a1b9a' },
  'Cleaner': { bg: '#e0f2f1', color: '#00695c' },
  'Security': { bg: '#fbe9e7', color: '#bf360c' },
  'Other': { bg: '#f5f5f5', color: '#424242' },
};

function initials(name: string) { return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2); }
function todayDayType() { const d = new Date().getDay(); return d === 6 ? 'saturday' : d === 0 ? 'sunday' : 'weekday'; }
function formatHM(decimalHours: number | null | undefined) {
  if (!decimalHours) return '0h 0m';
  const totalMinutes = Math.round(decimalHours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}h ${m}m`;
}

function ModalWrap({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div style={{ position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: '#fff', borderRadius: 20, padding: 32, width: '100%', maxWidth: 500, maxHeight: '90vh', overflowY: 'auto' as const }}>{children}</div>
    </div>
  );
}

export default function AttendancePage() {
  const router = useRouter();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [todayRecords, setTodayRecords] = useState<AttendanceRecord[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'today' | 'history' | 'shifts' | 'payroll'>('today');
  const [historyRecords, setHistoryRecords] = useState<AttendanceRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<string>('all');
  const [saving, setSaving] = useState<string | null>(null);
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [editShift, setEditShift] = useState<Shift | null>(null);
  const [shiftForm, setShiftForm] = useState({ shift_name: '', day_type: 'weekday', start_time: '10:00', end_time: '15:00' });
  const [shiftSaving, setShiftSaving] = useState(false);
  const [showManualModal, setShowManualModal] = useState(false);
  const [manualForm, setManualForm] = useState({ employee_id: '', clock_in: '', clock_out: '', is_late: false, notes: '' });

  // Payroll
  const [payrollMonth, setPayrollMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [monthAttendance, setMonthAttendance] = useState<AttendanceRecord[]>([]);
  const [monthLeave, setMonthLeave] = useState<Leave[]>([]);
  const [advances, setAdvances] = useState<Advance[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [payrollSettings, setPayrollSettings] = useState<PayrollSettings>({ sunday_multiplier: 1.5, holiday_multiplier: 2 });
  const [payrollLoaded, setPayrollLoaded] = useState(false);
  const [selectedPayrollEmployee, setSelectedPayrollEmployee] = useState<Employee | null>(null);
  const [editingRate, setEditingRate] = useState<string | null>(null);
  const [rateInput, setRateInput] = useState('');
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [leaveForm, setLeaveForm] = useState({ leave_type: 'Sick', start_date: '', end_date: '', days_taken: '1', status: 'approved', reason: '' });
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [settingsForm, setSettingsForm] = useState({ sunday_multiplier: '1.5', holiday_multiplier: '2' });

  async function loadPayrollData() {
    const [attRes, leaveRes, advRes, holRes, setRes] = await Promise.all([
      supabase.from('attendance').select('*').eq('store_id', STORE_ID)
        .gte('work_date', payrollMonth + '-01').lte('work_date', payrollMonth + '-31'),
      supabase.from('employee_leave').select('*').eq('store_id', STORE_ID)
        .lte('start_date', payrollMonth + '-31').gte('end_date', payrollMonth + '-01'),
      supabase.from('employee_advances').select('*').eq('store_id', STORE_ID).order('advance_date', { ascending: false }),
      supabase.from('public_holidays').select('*').eq('store_id', STORE_ID),
      supabase.from('payroll_settings').select('*').eq('store_id', STORE_ID).maybeSingle(),
    ]);
    setMonthAttendance(attRes.data || []);
    setMonthLeave(leaveRes.data || []);
    setAdvances(advRes.data || []);
    setHolidays(holRes.data || []);
    if (setRes.data) {
      setPayrollSettings(setRes.data);
      setSettingsForm({ sunday_multiplier: String(setRes.data.sunday_multiplier), holiday_multiplier: String(setRes.data.holiday_multiplier) });
    }
    setPayrollLoaded(true);
  }

  useEffect(() => { if (activeTab === 'payroll') loadPayrollData(); }, [activeTab, payrollMonth]);

  const holidaySet = new Set(holidays.map(h => h.holiday_date));
  function dayMultiplier(dateStr: string) {
    if (holidaySet.has(dateStr)) return { mult: payrollSettings.holiday_multiplier, label: holidays.find(h => h.holiday_date === dateStr)?.name || 'Public Holiday', type: 'holiday' as const };
    const dow = new Date(dateStr + 'T00:00:00').getDay();
    if (dow === 0) return { mult: payrollSettings.sunday_multiplier, label: 'Sunday', type: 'sunday' as const };
    return { mult: 1, label: '', type: 'normal' as const };
  }

  // Per-employee totals for the selected month, used on the cards and inside the register drawer
  function employeeMonthSummary(employeeId: string) {
    const records = monthAttendance.filter(r => r.employee_id === employeeId);
    let totalHours = 0, totalPay = 0;
    const rate = employees.find(e => e.id === employeeId)?.hourly_rate || 0;
    for (const r of records) {
      const hrs = r.hours_worked || 0;
      const { mult } = dayMultiplier(r.work_date);
      totalHours += hrs;
      totalPay += hrs * rate * mult;
    }
    const outstandingAdvances = advances.filter(a => a.employee_id === employeeId && a.deduct_from_wages && a.repayment_status === 'outstanding').reduce((s, a) => s + Number(a.amount), 0);
    return { totalHours, totalPay, netPay: totalPay - outstandingAdvances, outstandingAdvances, recordCount: records.length };
  }

  async function saveHourlyRate(employeeId: string) {
    const rate = parseFloat(rateInput) || 0;
    await supabase.from('employees').update({ hourly_rate: rate }).eq('id', employeeId);
    setEditingRate(null);
    await loadEmployees();
  }

  async function savePayrollSettings() {
    const payload = { store_id: STORE_ID, sunday_multiplier: parseFloat(settingsForm.sunday_multiplier) || 1.5, holiday_multiplier: parseFloat(settingsForm.holiday_multiplier) || 2 };
    await supabase.from('payroll_settings').upsert(payload);
    setPayrollSettings(payload);
    setShowSettingsModal(false);
  }

  async function saveLeave() {
    if (!selectedPayrollEmployee || !leaveForm.start_date || !leaveForm.end_date) return;
    await supabase.from('employee_leave').insert({
      employee_id: selectedPayrollEmployee.id, store_id: STORE_ID, leave_type: leaveForm.leave_type,
      start_date: leaveForm.start_date, end_date: leaveForm.end_date, days_taken: parseFloat(leaveForm.days_taken) || 1,
      status: leaveForm.status, reason: leaveForm.reason || null,
    });
    setShowLeaveModal(false);
    setLeaveForm({ leave_type: 'Sick', start_date: '', end_date: '', days_taken: '1', status: 'approved', reason: '' });
    await loadPayrollData();
  }

  function buildRegisterDays(employeeId: string) {
    const [y, m] = payrollMonth.split('-').map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    const todayStr = new Date().toISOString().split('T')[0];
    const isCurrentMonth = payrollMonth === todayStr.slice(0, 7);
    const lastDay = isCurrentMonth ? new Date().getDate() : daysInMonth;
    const rate = employees.find(e => e.id === employeeId)?.hourly_rate || 0;
    const days = [];
    for (let d = 1; d <= lastDay; d++) {
      const dateStr = `${payrollMonth}-${String(d).padStart(2, '0')}`;
      const record = monthAttendance.find(r => r.employee_id === employeeId && r.work_date === dateStr);
      const leave = monthLeave.find(l => l.employee_id === employeeId && dateStr >= l.start_date && dateStr <= l.end_date);
      const { mult, label, type } = dayMultiplier(dateStr);
      const hours = record?.hours_worked || 0;
      days.push({
        date: dateStr,
        dayName: new Date(dateStr + 'T00:00:00').toLocaleDateString('en-ZA', { weekday: 'short' }),
        hours, mult, label, type, leave,
        pay: hours * rate * mult,
        clockIn: record?.clock_in, clockOut: record?.clock_out, isLate: record?.is_late,
      });
    }
    return days.reverse(); // most recent first
  }

  async function markAdvanceRepaid(id: string) {
    await supabase.from('employee_advances').update({ repayment_status: 'repaid', repaid_date: new Date().toISOString().split('T')[0] }).eq('id', id);
    await loadPayrollData();
  }


  const [manualSaving, setManualSaving] = useState(false);
  const today = new Date().toISOString().split('T')[0];

  useEffect(() => { checkAuthAndLoad(); }, []);

  async function checkAuthAndLoad() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push('/login'); return; }
    await Promise.all([loadEmployees(), loadTodayRecords(), loadShifts()]);
    setLoading(false);
  }

  async function loadEmployees() {
    const { data } = await supabase.from('employees').select('id, full_name, role, is_active, hourly_rate').eq('store_id', STORE_ID).eq('is_active', true).order('full_name');
    setEmployees(data || []);
  }

  async function loadTodayRecords() {
    const { data } = await supabase.from('attendance').select('*').eq('store_id', STORE_ID).eq('work_date', today);
    setTodayRecords(data || []);
  }

  async function loadShifts() {
    const { data } = await supabase.from('store_shifts').select('*').eq('store_id', STORE_ID).order('day_type').order('start_time');
    setShifts(data || []);
  }

  async function loadHistory() {
    setHistoryLoading(true);
    const thirtyDaysAgo = new Date(); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    let query = supabase.from('attendance').select('*').eq('store_id', STORE_ID).gte('work_date', thirtyDaysAgo.toISOString().split('T')[0]).order('work_date', { ascending: false }).limit(200);
    if (selectedEmployee !== 'all') query = query.eq('employee_id', selectedEmployee);
    const { data } = await query;
    setHistoryRecords(data || []);
    setHistoryLoading(false);
  }

  useEffect(() => { if (activeTab === 'history') loadHistory(); }, [activeTab, selectedEmployee]);

  async function clockIn(employeeId: string) {
    setSaving(employeeId);
    const now = new Date().toISOString();
    const dayType = todayDayType();
    const currentTime = now.substring(11, 16);
    const todayShifts = shifts.filter(s => s.day_type === dayType && s.is_active);
    const late = todayShifts.length > 0 && todayShifts.every(s => currentTime > s.start_time);
    await supabase.from('attendance').insert({ employee_id: employeeId, store_id: STORE_ID, work_date: today, clock_in: now, is_late: late });
    await loadTodayRecords();
    setSaving(null);
  }

  async function clockOut(recordId: string, clockInTime: string) {
    setSaving(recordId);
    const now = new Date().toISOString();
    const hours = (new Date(now).getTime() - new Date(clockInTime).getTime()) / (1000 * 60 * 60);
    await supabase.from('attendance').update({ clock_out: now, hours_worked: hours }).eq('id', recordId);
    await loadTodayRecords();
    setSaving(null);
  }

  async function saveShift() {
    if (!shiftForm.shift_name.trim()) return;
    setShiftSaving(true);
    const payload = { store_id: STORE_ID, shift_name: shiftForm.shift_name, day_type: shiftForm.day_type, start_time: shiftForm.start_time, end_time: shiftForm.end_time, is_active: true };
    if (editShift) { await supabase.from('store_shifts').update(payload).eq('id', editShift.id); }
    else { await supabase.from('store_shifts').insert(payload); }
    await loadShifts();
    setShowShiftModal(false); setEditShift(null); setShiftForm({ shift_name: '', day_type: 'weekday', start_time: '10:00', end_time: '15:00' });
    setShiftSaving(false);
  }

  async function deleteShift(id: string) { await supabase.from('store_shifts').delete().eq('id', id); await loadShifts(); }

  async function saveManual() {
    if (!manualForm.employee_id || !manualForm.clock_in) return;
    setManualSaving(true);
    const clockInTime = `${today}T${manualForm.clock_in}:00`;
    const clockOutTime = manualForm.clock_out ? `${today}T${manualForm.clock_out}:00` : null;
    const hours = clockOutTime ? (new Date(clockOutTime).getTime() - new Date(clockInTime).getTime()) / (1000 * 60 * 60) : null;
    await supabase.from('attendance').insert({ employee_id: manualForm.employee_id, store_id: STORE_ID, work_date: today, clock_in: clockInTime, clock_out: clockOutTime, hours_worked: hours, is_late: manualForm.is_late, notes: manualForm.notes || null });
    await loadTodayRecords();
    setShowManualModal(false); setManualForm({ employee_id: '', clock_in: '', clock_out: '', is_late: false, notes: '' });
    setManualSaving(false);
  }

  const inp = { width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid #eef2ee', fontSize: 14, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' as const };
  const lbl = { display: 'block' as const, fontSize: 13, fontWeight: 600 as const, color: '#555', marginBottom: 6 };
  const onShiftNow = todayRecords.filter(r => r.clock_in && !r.clock_out).length;
  const completedToday = todayRecords.filter(r => r.clock_in && r.clock_out).length;
  const lateToday = todayRecords.filter(r => r.is_late).length;
  const notClockedIn = employees.filter(e => !todayRecords.find(r => r.employee_id === e.id)).length;
  const currentShift = shifts.find(s => { const d = todayDayType(); const now = `${String(new Date().getHours()).padStart(2,'0')}:${String(new Date().getMinutes()).padStart(2,'0')}`; return s.day_type === d && s.is_active && now >= s.start_time && now < s.end_time; });
  const historyByDate = historyRecords.reduce<Record<string, AttendanceRecord[]>>((acc, r) => { if (!acc[r.work_date]) acc[r.work_date] = []; acc[r.work_date].push(r); return acc; }, {});
  const getEmpName = (id: string) => employees.find(e => e.id === id)?.full_name || 'Unknown';
  const getEmpRole = (id: string) => employees.find(e => e.id === id)?.role || '';
  const DAY_LABELS: Record<string, string> = { weekday: 'Weekdays', saturday: 'Saturday', sunday: 'Sunday' };

  return (
    <div style={{ minHeight: '100vh', background: '#f8faf8', fontFamily: 'system-ui, sans-serif' }}>
      {showShiftModal && (
        <ModalWrap onClose={() => { setShowShiftModal(false); setEditShift(null); }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{editShift ? 'Edit Shift' : 'Add Shift'}</div>
            <button onClick={() => { setShowShiftModal(false); setEditShift(null); }} style={{ background: '#f0f4f0', border: 'none', borderRadius: 8, padding: '6px 14px', cursor: 'pointer' }}>Cancel</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div><label style={lbl}>Shift Name *</label><input value={shiftForm.shift_name} onChange={e => setShiftForm(p => ({ ...p, shift_name: e.target.value }))} placeholder="e.g. Morning Shift" style={inp} /></div>
            <div><label style={lbl}>Day Type</label><select value={shiftForm.day_type} onChange={e => setShiftForm(p => ({ ...p, day_type: e.target.value }))} style={inp}><option value="weekday">Weekdays</option><option value="saturday">Saturday</option><option value="sunday">Sunday</option></select></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div><label style={lbl}>Start</label><input type="time" value={shiftForm.start_time} onChange={e => setShiftForm(p => ({ ...p, start_time: e.target.value }))} style={inp} /></div>
              <div><label style={lbl}>End</label><input type="time" value={shiftForm.end_time} onChange={e => setShiftForm(p => ({ ...p, end_time: e.target.value }))} style={inp} /></div>
            </div>
          </div>
          <button onClick={saveShift} disabled={shiftSaving || !shiftForm.shift_name.trim()} style={{ width: '100%', marginTop: 20, padding: '13px', background: PRIMARY, color: '#fff', border: 'none', borderRadius: 12, fontWeight: 700, cursor: 'pointer', fontSize: 15 }}>{shiftSaving ? 'Saving...' : editShift ? 'Save Changes' : 'Add Shift'}</button>
        </ModalWrap>
      )}
      {showManualModal && (
        <ModalWrap onClose={() => setShowManualModal(false)}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
            <div style={{ fontSize: 18, fontWeight: 700 }}>Manual Clock Entry</div>
            <button onClick={() => setShowManualModal(false)} style={{ background: '#f0f4f0', border: 'none', borderRadius: 8, padding: '6px 14px', cursor: 'pointer' }}>Cancel</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div><label style={lbl}>Employee *</label><select value={manualForm.employee_id} onChange={e => setManualForm(p => ({ ...p, employee_id: e.target.value }))} style={inp}><option value="">— Select —</option>{employees.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}</select></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div><label style={lbl}>Clock In *</label><input type="time" value={manualForm.clock_in} onChange={e => setManualForm(p => ({ ...p, clock_in: e.target.value }))} style={inp} /></div>
              <div><label style={lbl}>Clock Out</label><input type="time" value={manualForm.clock_out} onChange={e => setManualForm(p => ({ ...p, clock_out: e.target.value }))} style={inp} /></div>
            </div>
            <div><label style={lbl}>Notes</label><textarea value={manualForm.notes} onChange={e => setManualForm(p => ({ ...p, notes: e.target.value }))} rows={2} style={{ ...inp, resize: 'vertical' as const }} /></div>
          </div>
          <button onClick={saveManual} disabled={manualSaving || !manualForm.employee_id || !manualForm.clock_in} style={{ width: '100%', marginTop: 20, padding: '13px', background: PRIMARY, color: '#fff', border: 'none', borderRadius: 12, fontWeight: 700, cursor: 'pointer', fontSize: 15 }}>{manualSaving ? 'Saving...' : 'Save Entry'}</button>
        </ModalWrap>
      )}

      {showLeaveModal && selectedPayrollEmployee && (
        <ModalWrap onClose={() => setShowLeaveModal(false)}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
            <div style={{ fontSize: 18, fontWeight: 700 }}>Leave — {selectedPayrollEmployee.full_name}</div>
            <button onClick={() => setShowLeaveModal(false)} style={{ background: '#f0f4f0', border: 'none', borderRadius: 8, padding: '6px 14px', cursor: 'pointer' }}>Cancel</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div><label style={lbl}>Leave Type</label><select value={leaveForm.leave_type} onChange={e => setLeaveForm(p => ({ ...p, leave_type: e.target.value }))} style={inp}>{['Sick', 'Annual', 'Family Responsibility', 'Unpaid', 'Other'].map(t => <option key={t}>{t}</option>)}</select></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div><label style={lbl}>Start Date *</label><input type="date" value={leaveForm.start_date} onChange={e => setLeaveForm(p => ({ ...p, start_date: e.target.value, end_date: p.end_date || e.target.value }))} style={inp} /></div>
              <div><label style={lbl}>End Date *</label><input type="date" value={leaveForm.end_date} onChange={e => setLeaveForm(p => ({ ...p, end_date: e.target.value }))} style={inp} /></div>
            </div>
            <div><label style={lbl}>Status</label><select value={leaveForm.status} onChange={e => setLeaveForm(p => ({ ...p, status: e.target.value }))} style={inp}><option value="approved">Approved</option><option value="pending">Pending</option><option value="declined">Declined</option></select></div>
            <div><label style={lbl}>Reason / Notes</label><textarea value={leaveForm.reason} onChange={e => setLeaveForm(p => ({ ...p, reason: e.target.value }))} rows={2} style={{ ...inp, resize: 'vertical' as const }} /></div>
          </div>
          <button onClick={saveLeave} disabled={!leaveForm.start_date || !leaveForm.end_date} style={{ width: '100%', marginTop: 20, padding: '13px', background: PRIMARY, color: '#fff', border: 'none', borderRadius: 12, fontWeight: 700, cursor: 'pointer', fontSize: 15 }}>Save Leave</button>
        </ModalWrap>
      )}

      {showSettingsModal && (
        <ModalWrap onClose={() => setShowSettingsModal(false)}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
            <div style={{ fontSize: 18, fontWeight: 700 }}>Pay Rate Multipliers</div>
            <button onClick={() => setShowSettingsModal(false)} style={{ background: '#f0f4f0', border: 'none', borderRadius: 8, padding: '6px 14px', cursor: 'pointer' }}>Cancel</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div><label style={lbl}>Sunday Multiplier</label><input type="number" step="0.1" value={settingsForm.sunday_multiplier} onChange={e => setSettingsForm(p => ({ ...p, sunday_multiplier: e.target.value }))} style={inp} /><div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>BCEA default: 1.5x</div></div>
            <div><label style={lbl}>Public Holiday Multiplier</label><input type="number" step="0.1" value={settingsForm.holiday_multiplier} onChange={e => setSettingsForm(p => ({ ...p, holiday_multiplier: e.target.value }))} style={inp} /><div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>BCEA default: 2x</div></div>
          </div>
          <button onClick={savePayrollSettings} style={{ width: '100%', marginTop: 20, padding: '13px', background: PRIMARY, color: '#fff', border: 'none', borderRadius: 12, fontWeight: 700, cursor: 'pointer', fontSize: 15 }}>Save</button>
        </ModalWrap>
      )}

      {selectedPayrollEmployee && (() => {
        const summary = employeeMonthSummary(selectedPayrollEmployee.id);
        const days = buildRegisterDays(selectedPayrollEmployee.id);
        const empAdvances = advances.filter(a => a.employee_id === selectedPayrollEmployee.id);
        return (
          <div style={{ position: 'fixed' as const, inset: 0, zIndex: 1500, display: 'flex', justifyContent: 'flex-end' }}>
            <div onClick={() => setSelectedPayrollEmployee(null)} style={{ flex: 1, background: 'rgba(0,0,0,0.4)', cursor: 'pointer' }} />
            <div style={{ width: '100%', maxWidth: 560, background: '#f8faf8', height: '100vh', overflowY: 'auto' as const }}>
              <div style={{ background: `linear-gradient(135deg, ${DARK}, ${PRIMARY})`, padding: '24px 28px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                  <button onClick={() => setSelectedPayrollEmployee(null)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 13 }}>Close</button>
                  <button onClick={() => { setLeaveForm({ leave_type: 'Sick', start_date: '', end_date: '', days_taken: '1', status: 'approved', reason: '' }); setShowLeaveModal(true); }} style={{ background: '#fff', color: PRIMARY, border: 'none', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>+ Add Leave</button>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 800, color: '#fff', flexShrink: 0 }}>{initials(selectedPayrollEmployee.full_name)}</div>
                  <div>
                    <div style={{ color: '#fff', fontWeight: 800, fontSize: 19 }}>{selectedPayrollEmployee.full_name}</div>
                    <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>{selectedPayrollEmployee.role}</div>
                  </div>
                </div>
              </div>

              <div style={{ padding: '20px 24px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
                  <div style={{ background: '#fff', borderRadius: 14, padding: 16, border: '1px solid #eef2ee' }}>
                    <div style={{ fontSize: 11, color: '#999', fontWeight: 700, marginBottom: 4 }}>HOURS THIS MONTH</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: '#333' }}>{formatHM(summary.totalHours)}</div>
                  </div>
                  <div style={{ background: '#fff', borderRadius: 14, padding: 16, border: '1px solid #eef2ee' }}>
                    <div style={{ fontSize: 11, color: '#999', fontWeight: 700, marginBottom: 4 }}>EARNED THIS MONTH</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: PRIMARY }}>R{summary.totalPay.toFixed(2)}</div>
                  </div>
                  {summary.outstandingAdvances > 0 && (
                    <div style={{ background: '#fff7ed', borderRadius: 14, padding: 16, border: '1px solid #fed7aa', gridColumn: '1 / -1', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div><div style={{ fontSize: 11, color: '#c2410c', fontWeight: 700 }}>OUTSTANDING ADVANCES</div><div style={{ fontSize: 18, fontWeight: 800, color: '#c2410c' }}>-R{summary.outstandingAdvances.toFixed(2)}</div></div>
                      <div style={{ textAlign: 'right' as const }}><div style={{ fontSize: 11, color: '#999', fontWeight: 700 }}>NET PAY</div><div style={{ fontSize: 18, fontWeight: 800, color: '#333' }}>R{summary.netPay.toFixed(2)}</div></div>
                    </div>
                  )}
                </div>

                {empAdvances.filter(a => a.repayment_status === 'outstanding').length > 0 && (
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#333', marginBottom: 8 }}>Outstanding Advances</div>
                    {empAdvances.filter(a => a.repayment_status === 'outstanding').map(a => (
                      <div key={a.id} style={{ background: '#fff', borderRadius: 10, padding: '10px 14px', border: '1px solid #eef2ee', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <div><span style={{ fontWeight: 700 }}>R{Number(a.amount).toFixed(2)}</span> <span style={{ fontSize: 12, color: '#999' }}>{a.advance_date}{a.reason ? ` — ${a.reason}` : ''}</span></div>
                        <button onClick={() => markAdvanceRepaid(a.id)} style={{ fontSize: 12, background: '#f0f4f0', border: 'none', borderRadius: 8, padding: '5px 12px', cursor: 'pointer', fontWeight: 600 }}>Mark Repaid</button>
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ fontSize: 13, fontWeight: 700, color: '#333', marginBottom: 8 }}>Daily Register — {new Date(payrollMonth + '-01').toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' })}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {days.map(day => (
                    <div key={day.date} style={{ background: '#fff', borderRadius: 10, padding: '10px 14px', border: '1px solid #eef2ee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 38, textAlign: 'center' as const }}>
                          <div style={{ fontSize: 10, color: '#999', fontWeight: 700 }}>{day.dayName.toUpperCase()}</div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: '#333' }}>{day.date.slice(8)}</div>
                        </div>
                        <div>
                          {day.leave ? (
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#c2410c' }}>🌴 {day.leave.leave_type} leave{day.leave.status !== 'approved' ? ` (${day.leave.status})` : ''}</div>
                          ) : day.hours > 0 ? (
                            <div>
                              <span style={{ fontSize: 13, fontWeight: 700, color: '#333' }}>{formatHM(day.hours)}</span>
                              {day.isLate && <span style={{ fontSize: 10, fontWeight: 700, color: '#f59e0b', marginLeft: 6 }}>LATE</span>}
                              {day.label && <span style={{ fontSize: 11, fontWeight: 700, color: day.type === 'holiday' ? '#dc2626' : '#2563eb', marginLeft: 6 }}>{day.label} · {day.mult}x</span>}
                            </div>
                          ) : (
                            <span style={{ fontSize: 13, color: '#ccc' }}>No record</span>
                          )}
                        </div>
                      </div>
                      {day.hours > 0 && !day.leave && <div style={{ fontWeight: 700, color: PRIMARY, fontSize: 14 }}>R{day.pay.toFixed(2)}</div>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Header */}
      <div style={{ background: `linear-gradient(135deg, ${DARK}, ${PRIMARY})`, padding: '0 32px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 64 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={() => router.push('/dashboard')} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 14 }}>← Back</button>
            <span style={{ color: '#fff', fontWeight: 700, fontSize: 18 }}>Time & Attendance</span>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => window.open('/attendance/clock', '_blank')} style={{ background: '#fff', color: PRIMARY, border: 'none', borderRadius: 10, padding: '8px 18px', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>🎭 Open Kiosk</button>
            <button onClick={() => setShowManualModal(true)} style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', color: '#fff', borderRadius: 10, padding: '8px 16px', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>+ Manual Entry</button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 24px' }}>
        {loading && <div style={{ textAlign: 'center', padding: 80, color: '#666' }}>Loading...</div>}
        {!loading && (
          <div>
            {currentShift && (
              <div style={{ background: `linear-gradient(135deg, ${DARK}, ${PRIMARY})`, borderRadius: 16, padding: '16px 24px', marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div><div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>CURRENT SHIFT</div><div style={{ color: '#fff', fontWeight: 800, fontSize: 20 }}>{currentShift.shift_name}</div><div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, marginTop: 2 }}>{currentShift.start_time} — {currentShift.end_time}</div></div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><div style={{ width: 10, height: 10, borderRadius: '50%', background: '#4ade80' }} /><span style={{ color: '#fff', fontWeight: 600, fontSize: 14 }}>Active</span></div>
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 32 }}>
              {[{ label: 'ON SHIFT', value: onShiftNow, color: PRIMARY }, { label: 'COMPLETED', value: completedToday, color: '#1565c0' }, { label: 'LATE', value: lateToday, color: '#f57f17' }, { label: 'NOT IN', value: notClockedIn, color: notClockedIn > 0 ? '#ef4444' : PRIMARY }].map(item => (
                <div key={item.label} style={{ background: '#fff', borderRadius: 20, padding: 24, border: '1px solid #eef2ee', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                  <div style={{ fontSize: 12, color: '#888', fontWeight: 600, marginBottom: 8 }}>{item.label}</div>
                  <div style={{ fontSize: 40, fontWeight: 800, color: item.color }}>{item.value}</div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 4, background: '#fff', padding: 4, borderRadius: 14, border: '1px solid #eef2ee', marginBottom: 24, width: 'fit-content' }}>
              {[{ key: 'today', label: '📅 Today' }, { key: 'history', label: '📊 History' }, { key: 'shifts', label: '⚙️ Shifts' }, { key: 'payroll', label: '💰 Payroll' }].map(tab => (
                <button key={tab.key} onClick={() => setActiveTab(tab.key as typeof activeTab)} style={{ padding: '8px 20px', borderRadius: 10, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13, background: activeTab === tab.key ? PRIMARY : 'transparent', color: activeTab === tab.key ? '#fff' : '#666' }}>{tab.label}</button>
              ))}
            </div>

            {activeTab === 'today' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <h2 style={{ fontSize: 18, fontWeight: 700, color: '#333', margin: 0 }}>{new Date().toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long' })}</h2>
                  <span style={{ fontSize: 13, color: '#aaa' }}>{employees.length} active employees</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
                  {employees.map(emp => {
                    const record = todayRecords.find(r => r.employee_id === emp.id);
                    const rc = ROLE_COLORS[emp.role] || { bg: '#f5f5f5', color: '#424242' };
                    const isOnShift = record?.clock_in && !record?.clock_out;
                    const isDone = record?.clock_in && record?.clock_out;
                    const isSaving = saving === emp.id || saving === record?.id;
                    return (
                      <div key={emp.id} style={{ background: '#fff', borderRadius: 16, border: `1.5px solid ${isOnShift ? '#bbf7d0' : '#eef2ee'}`, padding: 20, boxShadow: '0 2px 6px rgba(0,0,0,0.04)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
                          <div style={{ width: 48, height: 48, borderRadius: '50%', background: rc.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 800, color: rc.color, flexShrink: 0, position: 'relative' as const }}>
                            {initials(emp.full_name)}
                            {isOnShift && <div style={{ position: 'absolute' as const, bottom: 0, right: 0, width: 12, height: 12, borderRadius: '50%', background: '#22c55e', border: '2px solid #fff' }} />}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 700, color: '#333', fontSize: 15 }}>{emp.full_name}</div>
                            <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: rc.bg, color: rc.color }}>{emp.role}</span>
                          </div>
                          {record?.is_late && <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 20, background: '#fff8e1', color: '#f59e0b' }}>LATE</span>}
                          {isDone && <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 20, background: '#f0f4f0', color: '#666' }}>DONE</span>}
                        </div>
                        {record ? (
                          <div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                              <div style={{ background: '#f0f7f4', borderRadius: 10, padding: '8px 12px' }}><div style={{ fontSize: 10, color: '#888', fontWeight: 600 }}>IN</div><div style={{ fontWeight: 700, color: PRIMARY }}>{record.clock_in ? new Date(record.clock_in).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' }) : '—'}</div></div>
                              <div style={{ background: '#f8faf8', borderRadius: 10, padding: '8px 12px' }}><div style={{ fontSize: 10, color: '#888', fontWeight: 600 }}>OUT</div><div style={{ fontWeight: 700, color: record.clock_out ? '#333' : '#ccc' }}>{record.clock_out ? new Date(record.clock_out).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' }) : '—'}</div></div>
                            </div>
                            {record.hours_worked && <div style={{ textAlign: 'center' as const, fontSize: 13, color: '#888', marginBottom: 12 }}>⏱ <strong style={{ color: PRIMARY }}>{record.hours_worked.toFixed(1)}h</strong></div>}
                            {!record.clock_out && <button onClick={() => clockOut(record.id, record.clock_in!)} disabled={isSaving} style={{ width: '100%', padding: '10px', background: DARK, color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, cursor: 'pointer' }}>{isSaving ? 'Saving...' : '🔴 Clock Out'}</button>}
                          </div>
                        ) : (
                          <button onClick={() => clockIn(emp.id)} disabled={isSaving} style={{ width: '100%', padding: '10px', background: PRIMARY, color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, cursor: 'pointer' }}>{isSaving ? 'Saving...' : '🟢 Clock In'}</button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {activeTab === 'history' && (
              <div>
                <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
                  <select value={selectedEmployee} onChange={e => setSelectedEmployee(e.target.value)} style={{ padding: '10px 14px', borderRadius: 10, border: '1.5px solid #eef2ee', fontSize: 14, outline: 'none', background: '#fff', cursor: 'pointer' }}>
                    <option value="all">All Employees</option>
                    {employees.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
                  </select>
                  <span style={{ fontSize: 13, color: '#aaa', alignSelf: 'center' }}>Last 30 days</span>
                </div>
                {historyLoading && <div style={{ textAlign: 'center', padding: 40, color: '#666' }}>Loading...</div>}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {Object.entries(historyByDate).map(([date, records]) => (
                    <div key={date} style={{ background: '#fff', borderRadius: 16, border: '1px solid #eef2ee', overflow: 'hidden' }}>
                      <div style={{ padding: '12px 20px', background: date === today ? '#f0f7f4' : '#f8faf8', display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #eef2ee' }}>
                        <span style={{ fontWeight: 700, color: date === today ? PRIMARY : '#333', fontSize: 14 }}>{date === today ? 'Today' : new Date(date).toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
                        <span style={{ fontSize: 12, color: '#888' }}>{records.length} staff · {records.reduce((s, r) => s + (r.hours_worked || 0), 0).toFixed(1)}h</span>
                      </div>
                      {records.map((r, i) => {
                        const rc = ROLE_COLORS[getEmpRole(r.employee_id)] || { bg: '#f5f5f5', color: '#424242' };
                        return (
                          <div key={r.id} style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 14, borderBottom: i < records.length - 1 ? '1px solid #f5f5f5' : 'none' }}>
                            <div style={{ width: 36, height: 36, borderRadius: '50%', background: rc.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: rc.color, flexShrink: 0 }}>{initials(getEmpName(r.employee_id))}</div>
                            <div style={{ flex: 1 }}><div style={{ fontWeight: 600, color: '#333', fontSize: 14 }}>{getEmpName(r.employee_id)}</div><div style={{ fontSize: 12, color: '#888' }}>{r.clock_in ? new Date(r.clock_in).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' }) : '—'} → {r.clock_out ? new Date(r.clock_out).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' }) : 'On shift'}</div></div>
                            <div style={{ textAlign: 'right' as const }}>{r.hours_worked && <div style={{ fontWeight: 700, color: PRIMARY }}>{r.hours_worked.toFixed(1)}h</div>}{r.is_late && <div style={{ fontSize: 10, fontWeight: 700, color: '#f59e0b' }}>LATE</div>}</div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'shifts' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                  <h2 style={{ fontSize: 18, fontWeight: 700, color: '#333', margin: 0 }}>Shift Configuration</h2>
                  <button onClick={() => { setEditShift(null); setShiftForm({ shift_name: '', day_type: 'weekday', start_time: '10:00', end_time: '15:00' }); setShowShiftModal(true); }} style={{ padding: '8px 20px', background: PRIMARY, color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, cursor: 'pointer' }}>+ Add Shift</button>
                </div>
                {(['weekday', 'saturday', 'sunday'] as const).map(dayType => (
                  <div key={dayType} style={{ marginBottom: 24 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#333', marginBottom: 12 }}>{DAY_LABELS[dayType]}</div>
                    {shifts.filter(s => s.day_type === dayType).length === 0 ? (
                      <div style={{ padding: 20, background: '#fff', borderRadius: 12, border: '1px dashed #eef2ee', textAlign: 'center' as const, color: '#ccc', fontSize: 13 }}>No shifts configured</div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {shifts.filter(s => s.day_type === dayType).map(shift => (
                          <div key={shift.id} style={{ background: '#fff', borderRadius: 14, padding: '16px 20px', border: '1px solid #eef2ee', display: 'flex', alignItems: 'center', gap: 16 }}>
                            <div style={{ width: 48, height: 48, borderRadius: 12, background: '#f0f7f4', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>⏰</div>
                            <div style={{ flex: 1 }}><div style={{ fontWeight: 700, color: '#333' }}>{shift.shift_name}</div><div style={{ fontSize: 13, color: PRIMARY, fontWeight: 600 }}>{shift.start_time} — {shift.end_time}</div></div>
                            <div style={{ display: 'flex', gap: 8 }}>
                              <button onClick={() => { setEditShift(shift); setShiftForm({ shift_name: shift.shift_name, day_type: shift.day_type, start_time: shift.start_time, end_time: shift.end_time }); setShowShiftModal(true); }} style={{ padding: '6px 14px', background: '#f0f4f0', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>Edit</button>
                              <button onClick={() => deleteShift(shift.id)} style={{ padding: '6px 14px', background: '#fdecea', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13, color: '#ef4444' }}>Delete</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {activeTab === 'payroll' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap' as const, gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <h2 style={{ fontSize: 18, fontWeight: 700, color: '#333', margin: 0 }}>Payroll Register</h2>
                    <input type="month" value={payrollMonth} onChange={e => setPayrollMonth(e.target.value)} style={{ ...inp, width: 160 }} />
                  </div>
                  <button onClick={() => setShowSettingsModal(true)} style={{ padding: '8px 16px', background: '#f0f4f0', border: 'none', borderRadius: 10, fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>⚙️ Sunday {payrollSettings.sunday_multiplier}x · Holiday {payrollSettings.holiday_multiplier}x</button>
                </div>
                {!payrollLoaded ? (
                  <div style={{ textAlign: 'center' as const, padding: 60, color: '#ccc' }}>Loading…</div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
                    {employees.map(emp => {
                      const summary = employeeMonthSummary(emp.id);
                      const colors = ROLE_COLORS[emp.role] || ROLE_COLORS['Other'];
                      return (
                        <div key={emp.id} style={{ background: '#fff', borderRadius: 18, padding: 20, border: '1px solid #eef2ee', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', cursor: 'pointer' }} onClick={() => setSelectedPayrollEmployee(emp)}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                            <div style={{ width: 48, height: 48, borderRadius: '50%', background: colors.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: colors.color, fontSize: 16, flexShrink: 0 }}>{initials(emp.full_name)}</div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 700, color: '#333', fontSize: 15 }}>{emp.full_name}</div>
                              <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: colors.bg, color: colors.color }}>{emp.role}</span>
                            </div>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                            <div>
                              <div style={{ fontSize: 11, color: '#999', fontWeight: 600 }}>Rate</div>
                              {editingRate === emp.id ? (
                                <div style={{ display: 'flex', gap: 4 }} onClick={e => e.stopPropagation()}>
                                  <input type="number" step="0.01" autoFocus value={rateInput} onChange={e => setRateInput(e.target.value)} style={{ width: 70, padding: '4px 6px', border: '1px solid #ddd', borderRadius: 6, fontSize: 13 }} />
                                  <button onClick={() => saveHourlyRate(emp.id)} style={{ background: PRIMARY, color: '#fff', border: 'none', borderRadius: 6, padding: '4px 8px', fontSize: 12, cursor: 'pointer' }}>✓</button>
                                </div>
                              ) : (
                                <div onClick={e => { e.stopPropagation(); setEditingRate(emp.id); setRateInput(String(emp.hourly_rate || 0)); }} style={{ fontWeight: 700, fontSize: 14, color: '#333' }}>R{(emp.hourly_rate || 0).toFixed(2)}/hr ✎</div>
                              )}
                            </div>
                            <div style={{ textAlign: 'right' as const }}>
                              <div style={{ fontSize: 11, color: '#999', fontWeight: 600 }}>Hours MTD</div>
                              <div style={{ fontWeight: 700, fontSize: 14, color: '#333' }}>{formatHM(summary.totalHours)}</div>
                            </div>
                          </div>
                          <div style={{ background: '#f0f7f4', borderRadius: 10, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: 12, color: '#666', fontWeight: 600 }}>{summary.outstandingAdvances > 0 ? 'Net Pay' : 'Earned MTD'}</span>
                            <span style={{ fontWeight: 800, fontSize: 17, color: PRIMARY }}>R{(summary.outstandingAdvances > 0 ? summary.netPay : summary.totalPay).toFixed(2)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
                                              }
