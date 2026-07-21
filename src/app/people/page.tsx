'use client';
import { useStoreContext } from '@/lib/store-context'

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

const PRIMARY = '#1a5c38';
const DARK = '#0a1f12';

type Employee = {
  id: string; full_name: string; role: string; phone: string | null;
  id_number: string | null; start_date: string | null; employment_type: string | null;
  is_active: boolean; avatar_url: string | null; notes: string | null; created_at: string;
};
type EmployeeDocument = {
  id: string; document_type: string; document_name: string; file_url: string;
  expiry_date: string | null; notes: string | null; created_at: string;
};
type EmployeeLeave = {
  id: string; leave_type: string; start_date: string; end_date: string;
  days_taken: number; status: string; reason: string | null; notes: string | null; created_at: string; paid_hours_per_day: number | null;
};
type EmployeeWarning = {
  id: string; warning_type: string; reason: string; incident_date: string;
  issued_by: string; document_url: string | null; notes: string | null; created_at: string;
};
type EmployeeAdvance = {
  id: string; amount: number; reason: string | null; advance_date: string;
  repayment_status: string; repaid_date: string | null; deduct_from_wages: boolean; notes: string | null; created_at: string;
};
type Attendance = {
  id: string; work_date: string; clock_in: string | null; clock_out: string | null;
  hours_worked: number | null; is_late: boolean; notes: string | null;
};
type ProfileTab = 'overview' | 'documents' | 'leave' | 'warnings' | 'advances' | 'attendance';

const ROLES = ['Store Manager', 'Assistant Manager', 'Cashier', 'Kitchen Staff', 'Driver', 'Cleaner', 'Security', 'Other'];
const EMPLOYMENT_TYPES = ['full_time', 'part_time', 'casual', 'contract'];
const EMPLOYMENT_LABELS: Record<string, string> = { full_time: 'Full Time', part_time: 'Part Time', casual: 'Casual', contract: 'Contract' };
const LEAVE_TYPES = ['Annual', 'Sick', 'Family Responsibility', 'Unpaid', 'Maternity', 'Paternity', 'Study'];
const WARNING_TYPES = ['Verbal Warning', 'Written Warning', 'Final Written Warning', 'Suspension', 'Disciplinary Hearing'];
const DOCUMENT_TYPES = ['Employment Contract', 'ID Document', 'Food Safety Certificate', 'Medical Certificate', 'Bank Details', 'Tax Certificate', 'Other'];
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
const PROFILE_TABS: { key: ProfileTab; label: string; emoji: string }[] = [
  { key: 'overview', label: 'Overview', emoji: '👤' },
  { key: 'documents', label: 'Documents', emoji: '📁' },
  { key: 'leave', label: 'Leave', emoji: '🏖️' },
  { key: 'warnings', label: 'Warnings', emoji: '⚠️' },
  { key: 'advances', label: 'Advances', emoji: '💵' },
  { key: 'attendance', label: 'Attendance', emoji: '⏰' },
];

// ─── PURE FUNCTIONS ───────────────────────────────────────────────────────────
function initials(name: string) { return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2); }
function formatHM(decimalHours: number | null | undefined) {
  if (!decimalHours) return '0h 0m';
  const totalMinutes = Math.round(decimalHours * 60);
  return `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`;
}
function fmt(n: number) { return `R ${n.toFixed(2)}`; }
function tenure(startDate: string) {
  const months = Math.floor((Date.now() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24 * 30));
  if (months < 1) return 'Less than a month';
  if (months < 12) return `${months} month${months > 1 ? 's' : ''}`;
  const years = Math.floor(months / 12); const rem = months % 12;
  return `${years} year${years > 1 ? 's' : ''}${rem > 0 ? ` ${rem} month${rem > 1 ? 's' : ''}` : ''}`;
}
function isExpiringSoon(date: string) { return Math.floor((new Date(date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) <= 30; }
function isExpired(date: string) { return new Date(date) < new Date(); }
function isImage(url: string) { return /\.(jpg|jpeg|png|gif|webp)$/i.test(url); }

// ─── UPLOAD HELPER ────────────────────────────────────────────────────────────
async function uploadToStorage(bucket: string, path: string, file: File): Promise<string> {
  const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: true });
  if (error) throw error;
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

// ─── SHARED COMPONENTS — ALL OUTSIDE PeoplePage so they never remount ─────────

function FileUploadBox({ file, onFileChange, accept = '.pdf,.jpg,.jpeg,.png,.doc,.docx', label = 'Upload File' }: {
  file: File | null; onFileChange: (f: File | null) => void; accept?: string; label?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  function handleFile(f: File | null) {
    onFileChange(f);
    if (f && f.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = ev => setPreview(ev.target?.result as string);
      reader.readAsDataURL(f);
    } else { setPreview(null); }
  }
  return (
    <div>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#555', marginBottom: 6 }}>{label}</label>
      <div onClick={() => inputRef.current?.click()} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
        style={{ border: '2px dashed #c8e6c9', borderRadius: 12, padding: 20, textAlign: 'center' as const, cursor: 'pointer', background: file ? '#f0f7f4' : '#fafafa' }}>
        <input ref={inputRef} type="file" accept={accept} onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} style={{ display: 'none' }} />
        {!file ? (
          <div><div style={{ fontSize: 32, marginBottom: 8 }}>📎</div><div style={{ fontSize: 14, color: '#666', fontWeight: 600 }}>Click or drag to upload</div><div style={{ fontSize: 12, color: '#aaa', marginTop: 4 }}>PDF, JPG, PNG, DOC up to 10MB</div></div>
        ) : (
          <div>
            {preview ? <img src={preview} alt="preview" style={{ maxHeight: 100, maxWidth: '100%', borderRadius: 8, objectFit: 'contain', marginBottom: 8 }} /> : <div style={{ fontSize: 36, marginBottom: 8 }}>📄</div>}
            <div style={{ fontSize: 13, color: PRIMARY, fontWeight: 700 }}>{file.name}</div>
            <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>{(file.size / 1024).toFixed(0)} KB · Click to change</div>
          </div>
        )}
      </div>
    </div>
  );
}

function ErrorBanner({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return <div style={{ marginTop: 12, padding: '10px 14px', background: '#fdecea', borderRadius: 8, fontSize: 13, color: '#ef4444', fontWeight: 600 }}>{msg}</div>;
}

function ModalWrap({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: '#fff', borderRadius: 20, padding: 32, width: '100%', maxWidth: 500, maxHeight: '90vh', overflowY: 'auto' }}>
        {children}
      </div>
    </div>
  );
}

function ModalHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: '#333' }}>{title}</div>
      <button onClick={onClose} style={{ background: '#f0f4f0', border: 'none', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 14 }}>Cancel</button>
    </div>
  );
}

function Toggle({ value, onChange, label, color = PRIMARY }: { value: boolean; onChange: () => void; label: string; color?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f8faf8', borderRadius: 10, padding: '12px 16px' }}>
      <label style={{ fontSize: 14, fontWeight: 600, color: '#333' }}>{label}</label>
      <div onClick={onChange} style={{ width: 48, height: 26, borderRadius: 13, background: value ? color : '#ddd', cursor: 'pointer', position: 'relative' as const, transition: 'background 0.2s', flexShrink: 0 }}>
        <div style={{ position: 'absolute' as const, top: 3, left: value ? 25 : 3, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
      </div>
    </div>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
export default function PeoplePage() {
  const { storeId: STORE_ID, orgId: ORG_ID, ready: ctxReady } = useStoreContext()
  const router = useRouter();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState('all');
  const [filterStatus, setFilterStatus] = useState<'active' | 'inactive' | 'all'>('active');
  const [showEmployeeModal, setShowEmployeeModal] = useState(false);
  const [editEmployee, setEditEmployee] = useState<Employee | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null)
  const [pinForm, setPinForm] = useState('')
  const [pinSaving, setPinSaving] = useState(false)
  const [pinSaved, setPinSaved] = useState(false)
  const [showPinForm, setShowPinForm] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [profileTab, setProfileTab] = useState<ProfileTab>('overview');
  const [documents, setDocuments] = useState<EmployeeDocument[]>([]);
  const [leave, setLeave] = useState<EmployeeLeave[]>([]);
  const [warnings, setWarnings] = useState<EmployeeWarning[]>([]);
  const [advances, setAdvances] = useState<EmployeeAdvance[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [profileLoading, setProfileLoading] = useState(false);
  const [showDocModal, setShowDocModal] = useState(false);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [showWarningModal, setShowWarningModal] = useState(false);
  const [showAdvanceModal, setShowAdvanceModal] = useState(false);
  const [showAttendanceModal, setShowAttendanceModal] = useState(false);
  const [empForm, setEmpForm] = useState({ full_name: '', role: 'Cashier', phone: '', id_number: '', start_date: '', employment_type: 'full_time', notes: '', is_active: true });
  const [docForm, setDocForm] = useState({ document_type: 'Employment Contract', document_name: '', expiry_date: '', notes: '' });
  const [docFile, setDocFile] = useState<File | null>(null);
  const [leaveForm, setLeaveForm] = useState({ leave_type: 'Annual', start_date: '', end_date: '', days_taken: '', status: 'approved', reason: '', notes: '', paid_hours_per_day: '' });
  const [warningForm, setWarningForm] = useState({ warning_type: 'Written Warning', reason: '', incident_date: '', issued_by: '', notes: '' });
  const [warningFile, setWarningFile] = useState<File | null>(null);
  const [advanceForm, setAdvanceForm] = useState({ amount: '', reason: '', advance_date: new Date().toISOString().split('T')[0], repayment_status: 'outstanding', deduct_from_wages: false, notes: '' });
  const [attendanceForm, setAttendanceForm] = useState({ work_date: new Date().toISOString().split('T')[0], clock_in: '', clock_out: '', is_late: false, notes: '' });
  const [editingAttendance, setEditingAttendance] = useState<Attendance | null>(null);
  const [editAttendForm, setEditAttendForm] = useState({ clock_in: '', clock_out: '', is_late: false, notes: '' });

  const inp = { width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid #eef2ee', fontSize: 14, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' as const };
  const lbl = { display: 'block' as const, fontSize: 13, fontWeight: 600 as const, color: '#555', marginBottom: 6 };
  const card = { background: '#fff', borderRadius: 20, padding: 24, border: '1px solid #eef2ee', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' };

  useEffect(() => { if (ctxReady && STORE_ID) checkAuthAndLoad(); }, [ctxReady, STORE_ID]);

  async function checkAuthAndLoad() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push('/login'); return; }
    await loadEmployees();
  }

  async function loadEmployees() {
    setLoading(true);
    const { data } = await supabase.from('employees').select('*').eq('store_id', STORE_ID).order('full_name');
    setEmployees(data || []);
    setLoading(false);
  }

  async function loadEmployeeProfile(emp: Employee) {
    setProfileLoading(true);
    const [docsRes, leaveRes, warningsRes, advancesRes, attendanceRes] = await Promise.all([
      supabase.from('employee_documents').select('*').eq('employee_id', emp.id).order('created_at', { ascending: false }),
      supabase.from('employee_leave').select('*').eq('employee_id', emp.id).order('start_date', { ascending: false }),
      supabase.from('employee_warnings').select('*').eq('employee_id', emp.id).order('incident_date', { ascending: false }),
      supabase.from('employee_advances').select('*').eq('employee_id', emp.id).order('advance_date', { ascending: false }),
      supabase.from('attendance').select('*').eq('employee_id', emp.id).order('work_date', { ascending: false }).limit(30),
    ]);
    setDocuments(docsRes.data || []);
    setLeave(leaveRes.data || []);
    setWarnings(warningsRes.data || []);
    setAdvances(advancesRes.data || []);
    setAttendance(attendanceRes.data || []);
    setProfileLoading(false);
  }

  function openProfile(emp: Employee) { setSelectedEmployee(emp); setProfileTab('overview'); loadEmployeeProfile(emp); }
  function openAdd() { setEditEmployee(null); setEmpForm({ full_name: '', role: 'Cashier', phone: '', id_number: '', start_date: '', employment_type: 'full_time', notes: '', is_active: true }); setSaveError(null); setShowEmployeeModal(true); }
  function openEdit(emp: Employee) { setEditEmployee(emp); setEmpForm({ full_name: emp.full_name, role: emp.role, phone: emp.phone || '', id_number: emp.id_number || '', start_date: emp.start_date || '', employment_type: emp.employment_type || 'full_time', notes: emp.notes || '', is_active: emp.is_active }); setSaveError(null); setShowEmployeeModal(true); }

  async function saveEmployee() {
    if (!empForm.full_name.trim()) return;
    setSaving(true); setSaveError(null);
    try {
      const payload = { store_id: STORE_ID, organisation_id: ORG_ID, full_name: empForm.full_name.trim(), role: empForm.role, phone: empForm.phone || null, id_number: empForm.id_number || null, start_date: empForm.start_date || null, employment_type: empForm.employment_type, notes: empForm.notes || null, is_active: empForm.is_active };
      if (editEmployee) { await supabase.from('employees').update(payload).eq('id', editEmployee.id); }
      else { await supabase.from('employees').insert(payload); }
      await loadEmployees(); setShowEmployeeModal(false);
    } catch (e: unknown) { setSaveError(e instanceof Error ? e.message : 'Failed to save'); }
    setSaving(false);
  }

  async function saveDocument() {
    if (!selectedEmployee || !docForm.document_name.trim() || !docFile) return;
    setSaving(true); setSaveError(null);
    try {
      const ext = docFile.name.split('.').pop();
      const path = `${selectedEmployee.id}/${Date.now()}_${docForm.document_name.replace(/\s+/g, '_')}.${ext}`;
      const fileUrl = await uploadToStorage('employee-documents', path, docFile);
      await supabase.from('employee_documents').insert({ employee_id: selectedEmployee.id, store_id: STORE_ID, document_type: docForm.document_type, document_name: docForm.document_name, file_url: fileUrl, expiry_date: docForm.expiry_date || null, notes: docForm.notes || null });
      await loadEmployeeProfile(selectedEmployee);
      setShowDocModal(false); setDocForm({ document_type: 'Employment Contract', document_name: '', expiry_date: '', notes: '' }); setDocFile(null);
    } catch (e: unknown) { setSaveError(e instanceof Error ? e.message : 'Upload failed'); }
    setSaving(false);
  }

  async function saveLeave() {
    if (!selectedEmployee || !leaveForm.start_date || !leaveForm.end_date) return;
    setSaving(true); setSaveError(null);
    try {
      await supabase.from('employee_leave').insert({ employee_id: selectedEmployee.id, store_id: STORE_ID, leave_type: leaveForm.leave_type, start_date: leaveForm.start_date, end_date: leaveForm.end_date, days_taken: parseFloat(leaveForm.days_taken) || 1, status: leaveForm.status, reason: leaveForm.reason || null, notes: leaveForm.notes || null, paid_hours_per_day: parseFloat(leaveForm.paid_hours_per_day) || 0 });
      await loadEmployeeProfile(selectedEmployee); setShowLeaveModal(false); setLeaveForm({ leave_type: 'Annual', start_date: '', end_date: '', days_taken: '', status: 'approved', reason: '', notes: '', paid_hours_per_day: '' });
    } catch (e: unknown) { setSaveError(e instanceof Error ? e.message : 'Failed to save'); }
    setSaving(false);
  }

  async function saveWarning() {
    if (!selectedEmployee || !warningForm.reason.trim() || !warningForm.incident_date || !warningForm.issued_by.trim()) return;
    setSaving(true); setSaveError(null);
    try {
      let documentUrl: string | null = null;
      if (warningFile) {
        const ext = warningFile.name.split('.').pop();
        const path = `${selectedEmployee.id}/warnings/${Date.now()}.${ext}`;
        documentUrl = await uploadToStorage('employee-documents', path, warningFile);
      }
      await supabase.from('employee_warnings').insert({ employee_id: selectedEmployee.id, store_id: STORE_ID, warning_type: warningForm.warning_type, reason: warningForm.reason, incident_date: warningForm.incident_date, issued_by: warningForm.issued_by, document_url: documentUrl, notes: warningForm.notes || null });
      await loadEmployeeProfile(selectedEmployee); setShowWarningModal(false); setWarningForm({ warning_type: 'Written Warning', reason: '', incident_date: '', issued_by: '', notes: '' }); setWarningFile(null);
    } catch (e: unknown) { setSaveError(e instanceof Error ? e.message : 'Failed to save'); }
    setSaving(false);
  }

  async function saveAdvance() {
    if (!selectedEmployee || !advanceForm.amount || !advanceForm.advance_date) return;
    setSaving(true); setSaveError(null);
    try {
      await supabase.from('employee_advances').insert({ employee_id: selectedEmployee.id, store_id: STORE_ID, amount: parseFloat(advanceForm.amount), reason: advanceForm.reason || null, advance_date: advanceForm.advance_date, repayment_status: advanceForm.repayment_status, deduct_from_wages: advanceForm.deduct_from_wages, notes: advanceForm.notes || null });
      await loadEmployeeProfile(selectedEmployee); setShowAdvanceModal(false); setAdvanceForm({ amount: '', reason: '', advance_date: new Date().toISOString().split('T')[0], repayment_status: 'outstanding', deduct_from_wages: false, notes: '' });
    } catch (e: unknown) { setSaveError(e instanceof Error ? e.message : 'Failed to save'); }
    setSaving(false);
  }

  async function savePin() {
    if (!selectedEmployee) return
    if (pinForm && (pinForm.length !== 4 || !/^\d{4}$/.test(pinForm))) { alert('PIN must be exactly 4 digits'); return }
    setPinSaving(true)
    await supabase.from('employees').update({ clock_pin: pinForm || null }).eq('id', selectedEmployee.id)
    setSelectedEmployee({ ...selectedEmployee, clock_pin: pinForm || null } as any)
    setPinSaving(false); setPinSaved(true); setShowPinForm(false); setPinForm('')
    setTimeout(() => setPinSaved(false), 2000)
  }

  async function saveAttendance() {
    // Edit existing record
    if (editingAttendance) {
      setSaving(true);
      try {
        const workDate = editingAttendance.work_date;
        const clockIn = editAttendForm.clock_in ? `${workDate}T${editAttendForm.clock_in}:00` : null;
        const clockOut = editAttendForm.clock_out ? `${workDate}T${editAttendForm.clock_out}:00` : null;
        const hours = clockIn && clockOut
          ? (new Date(clockOut).getTime() - new Date(clockIn).getTime()) / 3600000
          : 0;
        await supabase.from('attendance').update({
          clock_in: clockIn,
          clock_out: clockOut,
          hours_worked: Math.max(0, hours),
          is_late: editAttendForm.is_late,
          notes: editAttendForm.notes || null,
        }).eq('id', editingAttendance.id);
        await loadEmployeeProfile(selectedEmployee);
        setEditingAttendance(null);
      } catch (e: any) { setSaveError(e.message); }
      finally { setSaving(false); }
      return;
    }

    if (!selectedEmployee || !attendanceForm.work_date) return;
    setSaving(true); setSaveError(null);
    try {
      const clockIn = attendanceForm.clock_in ? `${attendanceForm.work_date}T${attendanceForm.clock_in}:00` : null;
      const clockOut = attendanceForm.clock_out ? `${attendanceForm.work_date}T${attendanceForm.clock_out}:00` : null;
      const hours = clockIn && clockOut ? (new Date(clockOut).getTime() - new Date(clockIn).getTime()) / (1000 * 60 * 60) : null;
      await supabase.from('attendance').insert({ employee_id: selectedEmployee.id, store_id: STORE_ID, work_date: attendanceForm.work_date, clock_in: clockIn, clock_out: clockOut, hours_worked: hours, is_late: attendanceForm.is_late, notes: attendanceForm.notes || null });
      await loadEmployeeProfile(selectedEmployee); setShowAttendanceModal(false); setAttendanceForm({ work_date: new Date().toISOString().split('T')[0], clock_in: '', clock_out: '', is_late: false, notes: '' });
    } catch (e: unknown) { setSaveError(e instanceof Error ? e.message : 'Failed to save'); }
    setSaving(false);
  }

  async function toggleActive(emp: Employee) {
    await supabase.from('employees').update({ is_active: !emp.is_active }).eq('id', emp.id);
    await loadEmployees(); setSelectedEmployee(null);
  }

  async function markAdvancePaid(advance: EmployeeAdvance) {
    await supabase.from('employee_advances').update({ repayment_status: 'paid', repaid_date: new Date().toISOString().split('T')[0] }).eq('id', advance.id);
    if (selectedEmployee) await loadEmployeeProfile(selectedEmployee);
  }

  const filtered = employees
    .filter(e => filterStatus === 'all' ? true : filterStatus === 'active' ? e.is_active : !e.is_active)
    .filter(e => filterRole === 'all' ? true : e.role === filterRole)
    .filter(e => search === '' || e.full_name.toLowerCase().includes(search.toLowerCase()) || (e.role || '').toLowerCase().includes(search.toLowerCase()));

  const activeCount = employees.filter(e => e.is_active).length;
  const totalLeaveDays = leave.filter(l => l.status === 'approved').reduce((sum, l) => sum + l.days_taken, 0);
  const outstandingAdvances = advances.filter(a => a.repayment_status === 'outstanding').reduce((sum, a) => sum + a.amount, 0);

  return (
    <div style={{ minHeight: '100vh', background: '#f8faf8', fontFamily: 'system-ui, sans-serif' }}>

      {showEmployeeModal && (
        <ModalWrap onClose={() => setShowEmployeeModal(false)}>
          <ModalHeader title={editEmployee ? 'Edit Employee' : 'Add Employee'} onClose={() => setShowEmployeeModal(false)} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div><label style={lbl}>Full Name *</label><input value={empForm.full_name} onChange={e => setEmpForm(p => ({ ...p, full_name: e.target.value }))} placeholder="e.g. Thabo Nkosi" style={inp} /></div>
            <div><label style={lbl}>Role *</label><select value={empForm.role} onChange={e => setEmpForm(p => ({ ...p, role: e.target.value }))} style={inp}>{ROLES.map(r => <option key={r}>{r}</option>)}</select></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div><label style={lbl}>Employment Type</label><select value={empForm.employment_type} onChange={e => setEmpForm(p => ({ ...p, employment_type: e.target.value }))} style={inp}>{EMPLOYMENT_TYPES.map(t => <option key={t} value={t}>{EMPLOYMENT_LABELS[t]}</option>)}</select></div>
              <div><label style={lbl}>Start Date</label><input type="date" value={empForm.start_date} onChange={e => setEmpForm(p => ({ ...p, start_date: e.target.value }))} style={inp} /></div>
            </div>
            <div><label style={lbl}>Phone Number</label><input value={empForm.phone} onChange={e => setEmpForm(p => ({ ...p, phone: e.target.value }))} placeholder="072 123 4567" style={inp} /></div>
            <div><label style={lbl}>ID Number</label><input value={empForm.id_number} onChange={e => setEmpForm(p => ({ ...p, id_number: e.target.value }))} placeholder="13-digit SA ID" style={inp} /></div>
            <div><label style={lbl}>Notes</label><textarea value={empForm.notes} onChange={e => setEmpForm(p => ({ ...p, notes: e.target.value }))} rows={3} style={{ ...inp, resize: 'vertical' as const }} /></div>
            {editEmployee && <Toggle value={empForm.is_active} onChange={() => setEmpForm(p => ({ ...p, is_active: !p.is_active }))} label="Active Employee" />}
          </div>
          <ErrorBanner msg={saveError} />
          <button onClick={saveEmployee} disabled={saving || !empForm.full_name.trim()} style={{ width: '100%', marginTop: 24, padding: '14px', background: empForm.full_name.trim() ? PRIMARY : '#eee', color: empForm.full_name.trim() ? '#fff' : '#aaa', border: 'none', borderRadius: 12, fontWeight: 700, cursor: 'pointer', fontSize: 15 }}>
            {saving ? 'Saving...' : editEmployee ? 'Save Changes' : 'Add Employee'}
          </button>
        </ModalWrap>
      )}

      {showDocModal && (
        <ModalWrap onClose={() => { setShowDocModal(false); setDocFile(null); setSaveError(null); }}>
          <ModalHeader title="Add Document" onClose={() => { setShowDocModal(false); setDocFile(null); setSaveError(null); }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div><label style={lbl}>Document Type</label><select value={docForm.document_type} onChange={e => setDocForm(p => ({ ...p, document_type: e.target.value }))} style={inp}>{DOCUMENT_TYPES.map(t => <option key={t}>{t}</option>)}</select></div>
            <div><label style={lbl}>Document Name *</label><input value={docForm.document_name} onChange={e => setDocForm(p => ({ ...p, document_name: e.target.value }))} placeholder="e.g. Employment Contract 2024" style={inp} /></div>
            <FileUploadBox file={docFile} onFileChange={setDocFile} label="Upload Document or Photo *" />
            <div><label style={lbl}>Expiry Date (optional)</label><input type="date" value={docForm.expiry_date} onChange={e => setDocForm(p => ({ ...p, expiry_date: e.target.value }))} style={inp} /></div>
            <div><label style={lbl}>Notes</label><textarea value={docForm.notes} onChange={e => setDocForm(p => ({ ...p, notes: e.target.value }))} rows={2} style={{ ...inp, resize: 'vertical' as const }} /></div>
          </div>
          <ErrorBanner msg={saveError} />
          <button onClick={saveDocument} disabled={saving || !docForm.document_name.trim() || !docFile} style={{ width: '100%', marginTop: 20, padding: '12px', background: docForm.document_name.trim() && docFile ? PRIMARY : '#eee', color: docForm.document_name.trim() && docFile ? '#fff' : '#aaa', border: 'none', borderRadius: 12, fontWeight: 700, cursor: 'pointer' }}>
            {saving ? 'Uploading...' : 'Upload & Save Document'}
          </button>
        </ModalWrap>
      )}

      {showLeaveModal && (
        <ModalWrap onClose={() => { setShowLeaveModal(false); setSaveError(null); }}>
          <ModalHeader title="Record Leave" onClose={() => { setShowLeaveModal(false); setSaveError(null); }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div><label style={lbl}>Leave Type</label><select value={leaveForm.leave_type} onChange={e => setLeaveForm(p => ({ ...p, leave_type: e.target.value }))} style={inp}>{LEAVE_TYPES.map(t => <option key={t}>{t}</option>)}</select></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div><label style={lbl}>Start Date *</label><input type="date" value={leaveForm.start_date} onChange={e => setLeaveForm(p => ({ ...p, start_date: e.target.value }))} style={inp} /></div>
              <div><label style={lbl}>End Date *</label><input type="date" value={leaveForm.end_date} onChange={e => setLeaveForm(p => ({ ...p, end_date: e.target.value }))} style={inp} /></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div><label style={lbl}>Days Taken</label><input type="number" min="0.5" step="0.5" value={leaveForm.days_taken} onChange={e => setLeaveForm(p => ({ ...p, days_taken: e.target.value }))} placeholder="1" style={inp} /></div>
              <div><label style={lbl}>Status</label><select value={leaveForm.status} onChange={e => setLeaveForm(p => ({ ...p, status: e.target.value }))} style={inp}><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option></select></div>
            </div>
            <div><label style={lbl}>Hours to Pay per Day</label><input type="number" step="0.25" placeholder="e.g. 5 for a 10:00–15:00 shift" value={leaveForm.paid_hours_per_day} onChange={e => setLeaveForm(p => ({ ...p, paid_hours_per_day: e.target.value }))} style={inp} /><div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>Used by Payroll to calculate this leave's pay. Leave at 0 if unpaid.</div></div>
            <div><label style={lbl}>Reason</label><textarea value={leaveForm.reason} onChange={e => setLeaveForm(p => ({ ...p, reason: e.target.value }))} rows={2} style={{ ...inp, resize: 'vertical' as const }} /></div>
          </div>
          <ErrorBanner msg={saveError} />
          <button onClick={saveLeave} disabled={saving} style={{ width: '100%', marginTop: 20, padding: '12px', background: PRIMARY, color: '#fff', border: 'none', borderRadius: 12, fontWeight: 700, cursor: 'pointer' }}>{saving ? 'Saving...' : 'Record Leave'}</button>
        </ModalWrap>
      )}

      {showWarningModal && (
        <ModalWrap onClose={() => { setShowWarningModal(false); setWarningFile(null); setSaveError(null); }}>
          <ModalHeader title="Issue Warning" onClose={() => { setShowWarningModal(false); setWarningFile(null); setSaveError(null); }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div><label style={lbl}>Warning Type</label><select value={warningForm.warning_type} onChange={e => setWarningForm(p => ({ ...p, warning_type: e.target.value }))} style={inp}>{WARNING_TYPES.map(t => <option key={t}>{t}</option>)}</select></div>
            <div><label style={lbl}>Incident Date *</label><input type="date" value={warningForm.incident_date} onChange={e => setWarningForm(p => ({ ...p, incident_date: e.target.value }))} style={inp} /></div>
            <div><label style={lbl}>Reason *</label><textarea value={warningForm.reason} onChange={e => setWarningForm(p => ({ ...p, reason: e.target.value }))} rows={3} placeholder="Describe the reason for this warning..." style={{ ...inp, resize: 'vertical' as const }} /></div>
            <div><label style={lbl}>Issued By *</label><input value={warningForm.issued_by} onChange={e => setWarningForm(p => ({ ...p, issued_by: e.target.value }))} placeholder="Manager name" style={inp} /></div>
            <FileUploadBox file={warningFile} onFileChange={setWarningFile} label="Attach Warning Document (optional)" />
            <div><label style={lbl}>Notes</label><textarea value={warningForm.notes} onChange={e => setWarningForm(p => ({ ...p, notes: e.target.value }))} rows={2} style={{ ...inp, resize: 'vertical' as const }} /></div>
          </div>
          <ErrorBanner msg={saveError} />
          <button onClick={saveWarning} disabled={saving || !warningForm.reason.trim() || !warningForm.incident_date || !warningForm.issued_by.trim()} style={{ width: '100%', marginTop: 20, padding: '12px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: 12, fontWeight: 700, cursor: 'pointer' }}>{saving ? 'Saving...' : 'Issue Warning'}</button>
        </ModalWrap>
      )}

      {showAdvanceModal && (
        <ModalWrap onClose={() => { setShowAdvanceModal(false); setSaveError(null); }}>
          <ModalHeader title="Record Advance" onClose={() => { setShowAdvanceModal(false); setSaveError(null); }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div><label style={lbl}>Amount (R) *</label><input type="number" min="0" step="0.01" value={advanceForm.amount} onChange={e => setAdvanceForm(p => ({ ...p, amount: e.target.value }))} placeholder="0.00" style={inp} /></div>
              <div><label style={lbl}>Date *</label><input type="date" value={advanceForm.advance_date} onChange={e => setAdvanceForm(p => ({ ...p, advance_date: e.target.value }))} style={inp} /></div>
            </div>
            <div><label style={lbl}>Reason</label><input value={advanceForm.reason} onChange={e => setAdvanceForm(p => ({ ...p, reason: e.target.value }))} placeholder="Reason for advance..." style={inp} /></div>
            <Toggle value={advanceForm.deduct_from_wages} onChange={() => setAdvanceForm(p => ({ ...p, deduct_from_wages: !p.deduct_from_wages }))} label="Deduct from wages" />
            <div><label style={lbl}>Notes</label><textarea value={advanceForm.notes} onChange={e => setAdvanceForm(p => ({ ...p, notes: e.target.value }))} rows={2} style={{ ...inp, resize: 'vertical' as const }} /></div>
          </div>
          <ErrorBanner msg={saveError} />
          <button onClick={saveAdvance} disabled={saving} style={{ width: '100%', marginTop: 20, padding: '12px', background: PRIMARY, color: '#fff', border: 'none', borderRadius: 12, fontWeight: 700, cursor: 'pointer' }}>{saving ? 'Saving...' : 'Record Advance'}</button>
        </ModalWrap>
      )}

      {showAttendanceModal && (
        <ModalWrap onClose={() => { setShowAttendanceModal(false); setSaveError(null); }}>
          {editingAttendance && (
            <div style={{ position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setEditingAttendance(null)}>
              <div style={{ background: '#fff', borderRadius: 20, padding: 28, width: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }} onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 17, color: '#111' }}>
                      {!editingAttendance.clock_out ? '⚠ Fix Attendance — Missing Clock-Out' : '✏ Edit Attendance'}
                    </div>
                    <div style={{ fontSize: 13, color: '#888', marginTop: 4 }}>
                      {new Date(editingAttendance.work_date).toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long' })}
                    </div>
                  </div>
                  <button onClick={() => setEditingAttendance(null)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#888' }}>✕</button>
                </div>
                {!editingAttendance.clock_out && (
                  <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: 12, marginBottom: 16, fontSize: 13, color: '#dc2626', fontWeight: 600, lineHeight: 1.5 }}>
                    No clock-out recorded for this session. Enter the correct time below.
                  </div>
                )}
                {saveError && <div style={{ background: '#fef2f2', color: '#dc2626', padding: '8px 12px', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>{saveError}</div>}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={lbl}>Clock In</label>
                    <input type="time" value={editAttendForm.clock_in} onChange={e => setEditAttendForm(p => ({ ...p, clock_in: e.target.value }))} style={inp} />
                  </div>
                  <div>
                    <label style={{ ...lbl, color: !editingAttendance.clock_out ? '#dc2626' : undefined }}>
                      {!editingAttendance.clock_out ? 'Clock Out ← enter here' : 'Clock Out'}
                    </label>
                    <input type="time" value={editAttendForm.clock_out} onChange={e => setEditAttendForm(p => ({ ...p, clock_out: e.target.value }))} style={{ ...inp, borderColor: !editingAttendance.clock_out ? '#dc2626' : undefined }} autoFocus={!editingAttendance.clock_out} />
                  </div>
                </div>
                {editAttendForm.clock_in && editAttendForm.clock_out && (() => {
                  const h = (new Date(`2000-01-01T${editAttendForm.clock_out}`).getTime() - new Date(`2000-01-01T${editAttendForm.clock_in}`).getTime()) / 3600000;
                  return h > 0 ? <div style={{ fontSize: 13, color: '#1a5c38', fontWeight: 600, marginTop: 8 }}>Hours worked: {h.toFixed(2)}h</div> : null;
                })()}
                <Toggle value={editAttendForm.is_late} onChange={() => setEditAttendForm(p => ({ ...p, is_late: !p.is_late }))} label="Mark as Late" color="#f59e0b" />
                <div style={{ marginTop: 12 }}>
                  <label style={lbl}>Notes</label>
                  <textarea value={editAttendForm.notes} onChange={e => setEditAttendForm(p => ({ ...p, notes: e.target.value }))} rows={2} placeholder="e.g. forgot to clock out" style={{ ...inp, resize: 'vertical' as const }} />
                </div>
                <button onClick={saveAttendance} disabled={saving} style={{ width: '100%', marginTop: 20, padding: '12px', background: '#1a5c38', color: '#fff', border: 'none', borderRadius: 12, fontWeight: 700, cursor: 'pointer', fontSize: 15 }}>
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          )}

          <ModalHeader title="Log Attendance" onClose={() => { setShowAttendanceModal(false); setSaveError(null); }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div><label style={lbl}>Date *</label><input type="date" value={attendanceForm.work_date} onChange={e => setAttendanceForm(p => ({ ...p, work_date: e.target.value }))} style={inp} /></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div><label style={lbl}>Clock In</label><input type="time" value={attendanceForm.clock_in} onChange={e => setAttendanceForm(p => ({ ...p, clock_in: e.target.value }))} style={inp} /></div>
              <div><label style={lbl}>Clock Out</label><input type="time" value={attendanceForm.clock_out} onChange={e => setAttendanceForm(p => ({ ...p, clock_out: e.target.value }))} style={inp} /></div>
            </div>
            <Toggle value={attendanceForm.is_late} onChange={() => setAttendanceForm(p => ({ ...p, is_late: !p.is_late }))} label="Mark as Late" color="#f59e0b" />
            <div><label style={lbl}>Notes</label><textarea value={attendanceForm.notes} onChange={e => setAttendanceForm(p => ({ ...p, notes: e.target.value }))} rows={2} style={{ ...inp, resize: 'vertical' as const }} /></div>
          </div>
          <ErrorBanner msg={saveError} />
          <button onClick={saveAttendance} disabled={saving} style={{ width: '100%', marginTop: 20, padding: '12px', background: PRIMARY, color: '#fff', border: 'none', borderRadius: 12, fontWeight: 700, cursor: 'pointer' }}>{saving ? 'Saving...' : 'Log Attendance'}</button>
        </ModalWrap>
      )}

      {selectedEmployee && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex' }}>
          <div onClick={() => setSelectedEmployee(null)} style={{ flex: 1, background: 'rgba(0,0,0,0.4)', cursor: 'pointer' }} />
          <div style={{ width: 560, background: '#fff', height: '100vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', boxShadow: '-4px 0 32px rgba(0,0,0,0.15)' }}>
            <div style={{ background: `linear-gradient(135deg, ${DARK}, ${PRIMARY})`, padding: '20px 24px', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <button onClick={() => setSelectedEmployee(null)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 13 }}>Close</button>
                <button onClick={() => openEdit(selectedEmployee)} style={{ background: '#fff', color: PRIMARY, border: 'none', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>Edit</button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 800, color: '#fff', flexShrink: 0 }}>{initials(selectedEmployee.full_name)}</div>
                <div>
                  <div style={{ color: '#fff', fontWeight: 800, fontSize: 20 }}>{selectedEmployee.full_name}</div>
                  <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, marginTop: 2 }}>{selectedEmployee.role}</div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: selectedEmployee.is_active ? '#e8f5e9' : '#fdecea', color: selectedEmployee.is_active ? PRIMARY : '#ef4444' }}>{selectedEmployee.is_active ? 'ACTIVE' : 'INACTIVE'}</span>
                    {selectedEmployee.employment_type && <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: 'rgba(255,255,255,0.2)', color: '#fff' }}>{EMPLOYMENT_LABELS[selectedEmployee.employment_type]}</span>}
                  </div>
                </div>
              </div>
              {!profileLoading && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginTop: 16 }}>
                  {[{ label: 'Documents', value: documents.length }, { label: 'Leave Days', value: totalLeaveDays }, { label: 'Warnings', value: warnings.length }, { label: 'Advances', value: fmt(outstandingAdvances) }].map(item => (
                    <div key={item.label} style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 10, padding: '8px', textAlign: 'center' as const }}>
                      <div style={{ color: '#fff', fontWeight: 800, fontSize: 15 }}>{item.value}</div>
                      <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 10, marginTop: 2 }}>{item.label}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', borderBottom: '1px solid #eef2ee', background: '#fff', flexShrink: 0, overflowX: 'auto' }}>
              {PROFILE_TABS.map(tab => (
                <button key={tab.key} onClick={() => setProfileTab(tab.key)} style={{ padding: '12px 14px', border: 'none', borderBottom: `2px solid ${profileTab === tab.key ? PRIMARY : 'transparent'}`, background: 'transparent', color: profileTab === tab.key ? PRIMARY : '#888', fontWeight: profileTab === tab.key ? 700 : 400, cursor: 'pointer', fontSize: 12, whiteSpace: 'nowrap' as const }}>
                  {tab.emoji} {tab.label}
                </button>
              ))}
            </div>

            {profileLoading && <div style={{ textAlign: 'center', padding: 40, color: '#aaa' }}>Loading...</div>}

            {!profileLoading && (
              <div style={{ flex: 1, padding: 24, overflowY: 'auto' }}>

                {profileTab === 'overview' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {[
                      { label: 'Employment Type', value: EMPLOYMENT_LABELS[selectedEmployee.employment_type || ''] || selectedEmployee.employment_type },
                      { label: 'Phone', value: selectedEmployee.phone },
                      { label: 'ID Number', value: selectedEmployee.id_number },
                      { label: 'Start Date', value: selectedEmployee.start_date ? new Date(selectedEmployee.start_date).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' }) : null },
                      { label: 'Time with Company', value: selectedEmployee.start_date ? tenure(selectedEmployee.start_date) : null },
                      { label: 'Notes', value: selectedEmployee.notes },
                    ].filter(f => f.value).map(f => (
                      <div key={f.label} style={{ background: '#f8faf8', borderRadius: 12, padding: '12px 16px' }}>
                        <div style={{ fontSize: 11, color: '#aaa', fontWeight: 600, marginBottom: 4, textTransform: 'uppercase' as const }}>{f.label}</div>
                        <div style={{ fontSize: 14, color: '#333', fontWeight: 500 }}>{f.value}</div>
                      </div>
                    ))}
                    {documents.filter(d => d.expiry_date && isExpiringSoon(d.expiry_date) && !isExpired(d.expiry_date)).length > 0 && (
                      <div style={{ background: '#fff8e1', borderRadius: 12, padding: '12px 16px', border: '1px solid #fde68a' }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#92400e', marginBottom: 6 }}>⚠️ Documents Expiring Soon</div>
                        {documents.filter(d => d.expiry_date && isExpiringSoon(d.expiry_date) && !isExpired(d.expiry_date)).map(d => (
                          <div key={d.id} style={{ fontSize: 13, color: '#92400e' }}>{d.document_name} — expires {new Date(d.expiry_date!).toLocaleDateString('en-ZA')}</div>
                        ))}
                      </div>
                    )}
                    {documents.filter(d => d.expiry_date && isExpired(d.expiry_date)).length > 0 && (
                      <div style={{ background: '#fdecea', borderRadius: 12, padding: '12px 16px', border: '1px solid #fca5a5' }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#ef4444', marginBottom: 6 }}>🚨 Expired Documents</div>
                        {documents.filter(d => d.expiry_date && isExpired(d.expiry_date)).map(d => (
                          <div key={d.id} style={{ fontSize: 13, color: '#ef4444' }}>{d.document_name} — expired {new Date(d.expiry_date!).toLocaleDateString('en-ZA')}</div>
                        ))}
                      </div>
                    )}
                    <button onClick={() => toggleActive(selectedEmployee)} style={{ width: '100%', padding: '12px', background: selectedEmployee.is_active ? '#fdecea' : '#e8f5e9', color: selectedEmployee.is_active ? '#ef4444' : PRIMARY, border: `1.5px solid ${selectedEmployee.is_active ? '#ef4444' : PRIMARY}`, borderRadius: 12, fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>
                      {selectedEmployee.is_active ? 'Deactivate Employee' : 'Reactivate Employee'}
                    </button>
                  </div>
                )}

                {profileTab === 'documents' && (
                  <div>
                    <button onClick={() => { setSaveError(null); setShowDocModal(true); }} style={{ width: '100%', padding: '12px', background: PRIMARY, color: '#fff', border: 'none', borderRadius: 12, fontWeight: 700, cursor: 'pointer', marginBottom: 16 }}>+ Add Document</button>
                    {documents.length === 0 && <div style={{ textAlign: 'center' as const, padding: 40, color: '#aaa' }}>No documents yet</div>}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {documents.map(doc => {
                        const expired = doc.expiry_date && isExpired(doc.expiry_date);
                        const expiring = doc.expiry_date && isExpiringSoon(doc.expiry_date) && !expired;
                        return (
                          <div key={doc.id} style={{ background: expired ? '#fdecea' : expiring ? '#fff8e1' : '#f8faf8', borderRadius: 12, padding: '14px 16px', border: `1px solid ${expired ? '#fca5a5' : expiring ? '#fde68a' : '#eef2ee'}` }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                              <div style={{ flex: 1 }}>
                                {isImage(doc.file_url) && <img src={doc.file_url} alt={doc.document_name} style={{ width: '100%', maxHeight: 120, objectFit: 'cover', borderRadius: 8, marginBottom: 8 }} />}
                                <div style={{ fontWeight: 700, color: '#333', fontSize: 14 }}>{doc.document_name}</div>
                                <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{doc.document_type}</div>
                                {doc.expiry_date && (
                                  <div style={{ fontSize: 11, color: expired ? '#ef4444' : expiring ? '#f59e0b' : '#aaa', marginTop: 4, fontWeight: expired || expiring ? 700 : 400 }}>
                                    {expired ? '🚨 EXPIRED' : expiring ? '⚠️ Expiring' : ''} {new Date(doc.expiry_date).toLocaleDateString('en-ZA')}
                                  </div>
                                )}
                                {doc.notes && <div style={{ fontSize: 12, color: '#888', marginTop: 4, fontStyle: 'italic' }}>{doc.notes}</div>}
                              </div>
                              <a href={doc.file_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: PRIMARY, fontWeight: 700, textDecoration: 'none', padding: '6px 12px', background: '#e8f5e9', borderRadius: 8, whiteSpace: 'nowrap' as const, flexShrink: 0 }}>
                                {isImage(doc.file_url) ? '🖼️ View' : '📄 Open'}
                              </a>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {profileTab === 'leave' && (
                  <div>
                    <button onClick={() => { setSaveError(null); setShowLeaveModal(true); }} style={{ width: '100%', padding: '12px', background: PRIMARY, color: '#fff', border: 'none', borderRadius: 12, fontWeight: 700, cursor: 'pointer', marginBottom: 16 }}>+ Record Leave</button>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 20 }}>
                      {[
                        { label: 'Annual', count: leave.filter(l => l.leave_type === 'Annual' && l.status === 'approved').reduce((s, l) => s + l.days_taken, 0) },
                        { label: 'Sick', count: leave.filter(l => l.leave_type === 'Sick' && l.status === 'approved').reduce((s, l) => s + l.days_taken, 0) },
                        { label: 'Total', count: totalLeaveDays },
                      ].map(item => (
                        <div key={item.label} style={{ background: '#f8faf8', borderRadius: 10, padding: '12px', textAlign: 'center' as const, border: '1px solid #eef2ee' }}>
                          <div style={{ fontSize: 22, fontWeight: 800, color: PRIMARY }}>{item.count}</div>
                          <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{item.label} days</div>
                        </div>
                      ))}
                    </div>
                    {leave.length === 0 && <div style={{ textAlign: 'center' as const, padding: 40, color: '#aaa' }}>No leave records yet</div>}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {leave.map(l => (
                        <div key={l.id} style={{ background: '#f8faf8', borderRadius: 12, padding: '14px 16px', border: '1px solid #eef2ee' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                              <div style={{ fontWeight: 700, color: '#333', fontSize: 14 }}>{l.leave_type} Leave</div>
                              <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{new Date(l.start_date).toLocaleDateString('en-ZA')} — {new Date(l.end_date).toLocaleDateString('en-ZA')} ({l.days_taken} day{l.days_taken !== 1 ? 's' : ''}){l.paid_hours_per_day ? ` · ${l.paid_hours_per_day}h/day paid` : ' · unpaid'}</div>
                              {l.reason && <div style={{ fontSize: 12, color: '#888', marginTop: 4, fontStyle: 'italic' }}>{l.reason}</div>}
                            </div>
                            <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 20, background: l.status === 'approved' ? '#e8f5e9' : l.status === 'rejected' ? '#fdecea' : '#fff8e1', color: l.status === 'approved' ? PRIMARY : l.status === 'rejected' ? '#ef4444' : '#f59e0b', whiteSpace: 'nowrap' as const }}>{l.status.toUpperCase()}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {profileTab === 'warnings' && (
                  <div>
                    <button onClick={() => { setSaveError(null); setWarningFile(null); setShowWarningModal(true); }} style={{ width: '100%', padding: '12px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: 12, fontWeight: 700, cursor: 'pointer', marginBottom: 16 }}>+ Issue Warning</button>
                    {warnings.length === 0 && <div style={{ textAlign: 'center' as const, padding: 40, color: '#aaa' }}>No warnings on record</div>}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {warnings.map(w => {
                        const wColor = w.warning_type === 'Final Written Warning' ? '#ef4444' : w.warning_type === 'Written Warning' ? '#f59e0b' : '#666';
                        return (
                          <div key={w.id} style={{ background: '#fdecea', borderRadius: 12, padding: '14px 16px', border: '1px solid #fca5a5' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                              <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 8px', borderRadius: 20, background: '#fff', color: wColor, border: `1px solid ${wColor}` }}>{w.warning_type}</span>
                              <span style={{ fontSize: 11, color: '#888' }}>{new Date(w.incident_date).toLocaleDateString('en-ZA')}</span>
                            </div>
                            <div style={{ fontSize: 14, color: '#333', fontWeight: 500, marginBottom: 6 }}>{w.reason}</div>
                            <div style={{ fontSize: 12, color: '#888' }}>Issued by: {w.issued_by}</div>
                            {w.document_url && (
                              <div style={{ marginTop: 8 }}>
                                {isImage(w.document_url) && <img src={w.document_url} alt="warning doc" style={{ width: '100%', maxHeight: 100, objectFit: 'cover', borderRadius: 8, marginBottom: 4 }} />}
                                <a href={w.document_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: PRIMARY, fontWeight: 600 }}>{isImage(w.document_url) ? '🖼️ View Document' : '📄 Open Document'} →</a>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {profileTab === 'advances' && (
                  <div>
                    <button onClick={() => { setSaveError(null); setShowAdvanceModal(true); }} style={{ width: '100%', padding: '12px', background: PRIMARY, color: '#fff', border: 'none', borderRadius: 12, fontWeight: 700, cursor: 'pointer', marginBottom: 16 }}>+ Record Advance</button>
                    {outstandingAdvances > 0 && (
                      <div style={{ background: '#fff8e1', borderRadius: 12, padding: '14px 16px', marginBottom: 16, border: '1px solid #fde68a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: '#92400e' }}>Outstanding Balance</span>
                        <span style={{ fontSize: 20, fontWeight: 800, color: '#f59e0b' }}>{fmt(outstandingAdvances)}</span>
                      </div>
                    )}
                    {advances.length === 0 && <div style={{ textAlign: 'center' as const, padding: 40, color: '#aaa' }}>No advances recorded</div>}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {advances.map(a => (
                        <div key={a.id} style={{ background: '#f8faf8', borderRadius: 12, padding: '14px 16px', border: '1px solid #eef2ee' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                              <div style={{ fontWeight: 800, color: '#333', fontSize: 18 }}>{fmt(a.amount)}</div>
                              <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{new Date(a.advance_date).toLocaleDateString('en-ZA')}</div>
                              {a.reason && <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{a.reason}</div>}
                              {a.deduct_from_wages && <div style={{ fontSize: 11, color: PRIMARY, marginTop: 4, fontWeight: 600 }}>Deduct from wages</div>}
                            </div>
                            <div style={{ textAlign: 'right' as const }}>
                              <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 20, background: a.repayment_status === 'paid' ? '#e8f5e9' : '#fdecea', color: a.repayment_status === 'paid' ? PRIMARY : '#ef4444' }}>{a.repayment_status === 'paid' ? 'PAID' : 'OUTSTANDING'}</span>
                              {a.repayment_status === 'outstanding' && (
                                <button onClick={() => markAdvancePaid(a)} style={{ display: 'block', marginTop: 8, fontSize: 11, color: PRIMARY, background: '#e8f5e9', border: 'none', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontWeight: 600 }}>Mark Paid</button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {profileTab === 'attendance' && (
                  <div>
                    <button onClick={() => { setSaveError(null); setShowAttendanceModal(true); }} style={{ width: '100%', padding: '12px', background: PRIMARY, color: '#fff', border: 'none', borderRadius: 12, fontWeight: 700, cursor: 'pointer', marginBottom: 16 }}>+ Log Attendance</button>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 20 }}>
                      {[
                        { label: 'Days Logged', value: attendance.length },
                        { label: 'Late Arrivals', value: attendance.filter(a => a.is_late).length },
                        { label: 'Avg Hours', value: attendance.filter(a => a.hours_worked).length > 0 ? formatHM(attendance.filter(a => a.hours_worked).reduce((s, a) => s + (a.hours_worked || 0), 0) / attendance.filter(a => a.hours_worked).length) : '—' },
                      ].map(item => (
                        <div key={item.label} style={{ background: '#f8faf8', borderRadius: 10, padding: '12px', textAlign: 'center' as const, border: '1px solid #eef2ee' }}>
                          <div style={{ fontSize: 22, fontWeight: 800, color: PRIMARY }}>{item.value}</div>
                          <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{item.label}</div>
                        </div>
                      ))}
                    </div>
                    {attendance.length === 0 && <div style={{ textAlign: 'center' as const, padding: 40, color: '#aaa' }}>No attendance records yet</div>}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {attendance.map(a => (
                        <div key={a.id} style={{ background: !a.clock_out ? '#fff5f5' : a.is_late ? '#fff8e1' : '#f8faf8', borderRadius: 12, padding: '12px 16px', border: `1px solid ${!a.clock_out ? '#fecaca' : a.is_late ? '#fde68a' : '#eef2ee'}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 600, color: '#333', fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                              {new Date(a.work_date).toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short' })}
                              {!a.clock_out && <span style={{ fontSize: 10, fontWeight: 700, color: '#dc2626', background: '#fef2f2', padding: '2px 6px', borderRadius: 4 }}>⚠ OPEN</span>}
                            </div>
                            <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                              {a.clock_in ? new Date(a.clock_in).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' }) : '—'}{' → '}{a.clock_out ? new Date(a.clock_out).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' }) : 'not clocked out'}
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {a.hours_worked ? <div style={{ fontWeight: 700, color: PRIMARY, fontSize: 15 }}>{formatHM(a.hours_worked)}</div> : null}
                            {a.is_late && <span style={{ fontSize: 10, fontWeight: 700, color: '#f59e0b' }}>LATE</span>}
                            <button
                              onClick={() => {
                                const toTime = (dt: string | null) => dt ? new Date(dt).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', hour12: false }) : '';
                                setEditAttendForm({ clock_in: toTime(a.clock_in), clock_out: toTime(a.clock_out), is_late: a.is_late, notes: a.notes || '' });
                                setEditingAttendance(a);
                              }}
                              style={{ fontSize: 12, fontWeight: 700, color: !a.clock_out ? '#dc2626' : '#1a5c38', background: !a.clock_out ? '#fef2f2' : '#eef2ee', border: `1px solid ${!a.clock_out ? '#fecaca' : '#d1fae5'}`, borderRadius: 8, padding: '4px 10px', cursor: 'pointer' }}
                            >{!a.clock_out ? '⚠ Fix' : '✏ Edit'}</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              </div>
            )}
          </div>
        </div>
      )}

      <div style={{ background: `linear-gradient(135deg, ${DARK}, ${PRIMARY})`, padding: '0 32px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 64 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={() => router.push('/dashboard')} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 14 }}>Back</button>
            <span style={{ color: '#fff', fontWeight: 700, fontSize: 18 }}>People</span>
          </div>
          <button onClick={openAdd} style={{ background: '#fff', color: PRIMARY, border: 'none', borderRadius: 10, padding: '8px 20px', fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>+ Add Employee</button>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px' }}>
        {loading && <div style={{ textAlign: 'center', padding: 80, color: '#666' }}>Loading...</div>}
        {!loading && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginBottom: 32 }}>
              {[
                { label: 'TOTAL STAFF', value: employees.length, sub: 'all employees', color: PRIMARY },
                { label: 'ACTIVE', value: activeCount, sub: 'currently employed', color: PRIMARY },
                { label: 'FULL TIME', value: employees.filter(e => e.employment_type === 'full_time' && e.is_active).length, sub: 'permanent staff', color: PRIMARY },
                { label: 'PART TIME / CASUAL', value: employees.filter(e => (e.employment_type === 'part_time' || e.employment_type === 'casual') && e.is_active).length, sub: 'flexible staff', color: '#f59e0b' },
              ].map(item => (
                <div key={item.label} style={card}>
                  <div style={{ fontSize: 12, color: '#888', fontWeight: 600, marginBottom: 8 }}>{item.label}</div>
                  <div style={{ fontSize: 36, fontWeight: 800, color: item.color }}>{item.value}</div>
                  <div style={{ fontSize: 12, color: '#aaa', marginTop: 4 }}>{item.sub}</div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' as const, alignItems: 'center' }}>
              <input placeholder="Search by name or role..." value={search} onChange={e => setSearch(e.target.value)} style={{ padding: '10px 16px', borderRadius: 10, border: '1.5px solid #eef2ee', fontSize: 14, outline: 'none', fontFamily: 'inherit', minWidth: 220, background: '#fff' }} />
              <div style={{ display: 'flex', gap: 4, background: '#fff', padding: 4, borderRadius: 12, border: '1px solid #eef2ee' }}>
                {(['active', 'inactive', 'all'] as const).map(s => (
                  <button key={s} onClick={() => setFilterStatus(s)} style={{ padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 12, background: filterStatus === s ? PRIMARY : 'transparent', color: filterStatus === s ? '#fff' : '#666', textTransform: 'capitalize' as const }}>{s}</button>
                ))}
              </div>
              <select value={filterRole} onChange={e => setFilterRole(e.target.value)} style={{ padding: '8px 14px', borderRadius: 10, border: '1.5px solid #eef2ee', fontSize: 13, outline: 'none', fontFamily: 'inherit', background: '#fff', cursor: 'pointer' }}>
                <option value="all">All Roles</option>
                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              <span style={{ fontSize: 13, color: '#aaa', marginLeft: 'auto' }}>{filtered.length} employee{filtered.length !== 1 ? 's' : ''}</span>
            </div>
            {filtered.length === 0 && (
              <div style={{ textAlign: 'center' as const, padding: 80, background: '#fff', borderRadius: 20, border: '1px solid #eef2ee' }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>👥</div>
                <div style={{ fontWeight: 700, color: '#333', fontSize: 18, marginBottom: 8 }}>No employees found</div>
                <div style={{ color: '#aaa', fontSize: 14, marginBottom: 24 }}>{employees.length === 0 ? 'Add your first employee to get started' : 'Try adjusting your filters'}</div>
                {employees.length === 0 && <button onClick={openAdd} style={{ padding: '12px 24px', background: PRIMARY, color: '#fff', border: 'none', borderRadius: 12, fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>+ Add First Employee</button>}
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
              {filtered.map(emp => {
                const rc = ROLE_COLORS[emp.role] || { bg: '#f5f5f5', color: '#424242' };
                return (
                  <div key={emp.id} onClick={() => openProfile(emp)} style={{ background: '#fff', borderRadius: 16, border: '1.5px solid #eef2ee', padding: 20, cursor: 'pointer', opacity: emp.is_active ? 1 : 0.6, transition: 'transform 0.15s, box-shadow 0.15s', boxShadow: '0 2px 6px rgba(0,0,0,0.04)' }}
                    onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.1)'; }}
                    onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 2px 6px rgba(0,0,0,0.04)'; }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
                      <div style={{ width: 52, height: 52, borderRadius: '50%', background: rc.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 800, color: rc.color, flexShrink: 0 }}>{initials(emp.full_name)}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, color: '#333', fontSize: 15 }}>{emp.full_name}</div>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: rc.bg, color: rc.color }}>{emp.role}</span>
                      </div>
                      {!emp.is_active && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: '#f5f5f5', color: '#aaa' }}>INACTIVE</span>}
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
                      {emp.employment_type && <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 20, background: '#f0f4f0', color: '#666' }}>{EMPLOYMENT_LABELS[emp.employment_type]}</span>}
                      {emp.phone && <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 20, background: '#f0f4f0', color: '#666' }}>📞 {emp.phone}</span>}
                      {emp.start_date && <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 20, background: '#f0f4f0', color: '#666' }}>Since {new Date(emp.start_date).toLocaleDateString('en-ZA', { month: 'short', year: 'numeric' })}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
