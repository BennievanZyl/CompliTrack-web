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
  annual_leave_entitlement: number | null; sick_leave_cycle_days: number | null; family_leave_entitlement: number | null;
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
type EmployeeEvaluation = {
  id: string; eval_date: string; evaluated_by: string;
  punctuality: number; attitude: number; performance: number; appearance: number; teamwork: number;
  overall_score: number; notes: string | null; created_at: string;
};
type EmployeeAdvance = {
  id: string; amount: number; reason: string | null; advance_date: string;
  repayment_status: string; repaid_date: string | null; deduct_from_wages: boolean; notes: string | null; created_at: string;
};
type Attendance = {
  id: string; work_date: string; clock_in: string | null; clock_out: string | null;
  hours_worked: number | null; is_late: boolean; notes: string | null;
};
type ProfileTab = 'overview' | 'documents' | 'leave' | 'warnings' | 'advances' | 'attendance' | 'evaluations';

const ROLES = ['Store Manager', 'Assistant Manager', 'Cashier', 'Kitchen Staff', 'Driver', 'Cleaner', 'Security', 'Other'];
const EMPLOYMENT_TYPES = ['full_time', 'part_time', 'casual', 'contract'];
const EMPLOYMENT_LABELS: Record<string, string> = { full_time: 'Full Time', part_time: 'Part Time', casual: 'Casual', contract: 'Contract' };
const LEAVE_TYPES = ['Annual', 'Sick', 'Family Responsibility', 'Unpaid', 'Maternity', 'Paternity', 'Study'];

// BCEA Section 22 — Sick leave cycle calculator
function getSickLeaveCycle(startDateStr: string | null, cycleEntitlement: number = 30) {
  if (!startDateStr) return null;
  const start = new Date(startDateStr);
  const today = new Date();
  // Total months worked
  const monthsWorked = (today.getFullYear() - start.getFullYear()) * 12 + (today.getMonth() - start.getMonth());
  // Which 36-month cycle are we in (0-based)
  const cycleIndex = Math.floor(Math.max(0, monthsWorked) / 36);
  // Cycle boundaries
  const cycleStart = new Date(start);
  cycleStart.setMonth(cycleStart.getMonth() + cycleIndex * 36);
  const cycleEnd = new Date(cycleStart);
  cycleEnd.setMonth(cycleEnd.getMonth() + 36);
  cycleEnd.setDate(cycleEnd.getDate() - 1);
  // First 6 months of EMPLOYMENT (not of each cycle) — 1 day per 26 days worked
  const isFirst6Months = monthsWorked < 6;
  // Approx working days elapsed in first 6 months (5-day week)
  const daysWorkedInFirst6 = isFirst6Months
    ? Math.max(0, Math.floor((today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24) * (5 / 7)))
    : 0;
  const accruedLimit = isFirst6Months ? Math.floor(daysWorkedInFirst6 / 26) : null;
  return { cycleIndex, cycleStart, cycleEnd, isFirst6Months, accruedLimit, cycleEntitlement };
}
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
  { key: 'evaluations', label: 'Evaluations', emoji: '📋' },
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

// Convert a local "HH:MM" time + "YYYY-MM-DD" date to UTC ISO string
// Uses browser's local timezone so SA users (UTC+2) get correct UTC time
function localTimeToUTC(date: string, time: string): string {
  const [y, m, d] = date.split('-').map(Number)
  const [h, min] = time.split(':').map(Number)
  return new Date(y, m - 1, d, h, min, 0).toISOString()
}

function isExpiringSoon(date: string) { return Math.floor((new Date(date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) <= 30; }
function isExpired(date: string) { return new Date(date) < new Date(); }
function isImage(url: string) { return /\.(jpg|jpeg|png|gif|webp)$/i.test(url); }

// ─── WARNING LETTER PRINT ────────────────────────────────────────────────────
function printWarningLetter(params: {
  warningType: string; incidentDate: string; reason: string;
  issuedBy: string; notes: string; employee: Employee;
  storeName: string; previousWarnings: EmployeeWarning[];
}) {
  const { warningType, incidentDate, reason, issuedBy, notes, employee, storeName, previousWarnings } = params;
  const fmtDate = (d: string) => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';
  const todayStr = new Date().toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' });
  const employmentLabel = EMPLOYMENT_LABELS[employee.employment_type || ''] || employee.employment_type || '—';
  const prevLines = previousWarnings.length > 0
    ? previousWarnings.map(w => `<li>${w.warning_type} — ${fmtDate(w.incident_date)} — ${w.reason}</li>`).join('')
    : '<li style="color:#888">None</li>';
  const validityMap: Record<string, string> = {
    'Verbal Warning': '3 months', 'Written Warning': '6 months',
    'Final Written Warning': '12 months', 'Suspension': 'N/A', 'Disciplinary Hearing': 'N/A',
  };
  const validity = validityMap[warningType] || '6 months';
  const outcomeText = warningType === 'Verbal Warning'
    ? `You have been issued a <strong>Verbal Warning</strong>. This warning is valid for <strong>${validity}</strong> from the date of issue. A further act of misconduct during this period may result in more serious disciplinary action.`
    : warningType === 'Written Warning'
    ? `You have been issued a <strong>Written Warning</strong>. This warning is valid for <strong>${validity}</strong> from the date of issue. A further act of misconduct or repeat of this offence during this period may result in a <strong>Final Written Warning</strong> or dismissal.`
    : warningType === 'Final Written Warning'
    ? `You have been issued a <strong>Final Written Warning</strong>. This is your final warning, valid for <strong>${validity}</strong>. Any further misconduct during this period may result in <strong>dismissal</strong>.`
    : warningType === 'Suspension'
    ? `You are hereby <strong>suspended</strong> pending investigation into the above matter. You will be notified of the outcome in due course.`
    : `You are hereby notified of a formal <strong>Disciplinary Hearing</strong> regarding the above matter. You have the right to be represented.`;
  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>${warningType} — ${employee.full_name}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,sans-serif;font-size:12pt;color:#000;background:#fff}
@page{size:A4;margin:20mm}
.page{max-width:170mm;margin:0 auto}
h1{font-size:16pt;text-align:center;text-transform:uppercase;margin-bottom:4px}
h2{font-size:13pt;text-align:center;color:#333;margin-bottom:24px;font-weight:normal}
.sec{margin-bottom:18px}
.sec-title{font-weight:bold;font-size:10pt;border-bottom:1.5px solid #000;padding-bottom:3px;margin-bottom:10px;text-transform:uppercase;letter-spacing:.5px}
table.det{width:100%;border-collapse:collapse}
table.det td{padding:5px 6px;font-size:11pt;vertical-align:top}
table.det td:first-child{font-weight:bold;width:42%;color:#444}
.box{border:1px solid #ccc;border-radius:4px;padding:12px;min-height:50px;background:#fafafa;font-size:11pt;white-space:pre-wrap}
.notice{background:#fff8e1;border:1px solid #e0c000;border-radius:4px;padding:10px 14px;font-size:11pt}
.sigs{display:flex;gap:28px;margin-top:32px}
.sig{flex:1}
.sig .line{border-bottom:1px solid #000;height:32px;margin-bottom:5px}
.sig .lbl{font-size:10pt;color:#555;line-height:1.4}
.ack{margin-top:18px;font-size:11pt;background:#f5f5f5;border:1px solid #ddd;border-radius:4px;padding:10px 14px}
.footer{margin-top:24px;font-size:9pt;color:#999;text-align:center;border-top:1px solid #ddd;padding-top:8px}
ul{margin-left:18px}
@media print{body{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
</style></head>
<body><div class="page">
<div style="text-align:center;border-bottom:2px solid #000;padding-bottom:14px;margin-bottom:20px">
  <h1>${storeName || 'COMPLITRACK'}</h1>
  <h2>${warningType.toUpperCase()}</h2>
</div>

<div class="sec">
  <div class="sec-title">Employee Details</div>
  <table class="det">
    <tr><td>Employee Name:</td><td>${employee.full_name}</td></tr>
    <tr><td>Position / Role:</td><td>${employee.role}</td></tr>
    <tr><td>Employment Type:</td><td>${employmentLabel}</td></tr>
    <tr><td>Date of Employment:</td><td>${fmtDate(employee.start_date || '')}</td></tr>
    <tr><td>Date of Incident:</td><td>${fmtDate(incidentDate)}</td></tr>
    <tr><td>Date of Warning:</td><td>${todayStr}</td></tr>
    <tr><td>Warning Type:</td><td><strong>${warningType}</strong></td></tr>
  </table>
</div>

<div class="sec">
  <div class="sec-title">Previous Disciplinary Record</div>
  <ul>${prevLines}</ul>
</div>

<div class="sec">
  <div class="sec-title">Nature of Offence / Reason</div>
  <div class="box">${reason.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>')}</div>
</div>

${notes ? `<div class="sec"><div class="sec-title">Additional Notes</div><div class="box">${notes.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>')}</div></div>` : ''}

<div class="sec">
  <div class="sec-title">Outcome &amp; Consequence</div>
  <div class="notice">${outcomeText}</div>
</div>

<div class="sec">
  <div class="sec-title">Right of Appeal</div>
  <p style="font-size:11pt">You have the right to appeal this decision. Any appeal must be submitted in writing within <strong>5 working days</strong> of receipt of this warning to the Store Manager or Franchisor.</p>
</div>

<div class="sigs">
  <div class="sig"><div class="line"></div><div class="lbl"><strong>Issued By:</strong> ${issuedBy}<br>Signature &amp; Date</div></div>
  <div class="sig"><div class="line"></div><div class="lbl"><strong>Employee:</strong> ${employee.full_name}<br>Signature &amp; Date</div></div>
  <div class="sig"><div class="line"></div><div class="lbl"><strong>Witness:</strong><br>Signature &amp; Date</div></div>
</div>

<div class="ack"><strong>Employee Acknowledgement:</strong> I acknowledge receipt of this warning. My signature does not necessarily indicate agreement with the content of this warning.</div>

<div class="footer">Generated by CompliTrack &bull; ${storeName || ''} &bull; ${new Date().toLocaleDateString('en-ZA')}</div>
</div>
<script>window.onload=function(){window.print();}</script>
</body></html>`;
  const win = window.open('', '_blank');
  if (win) { win.document.write(html); win.document.close(); }
}

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
  const [evaluations, setEvaluations] = useState<EmployeeEvaluation[]>([]);
  const [showEvalModal, setShowEvalModal] = useState(false);
  const [evalForm, setEvalForm] = useState({ eval_date: new Date().toISOString().split('T')[0], evaluated_by: '', punctuality: 3, attitude: 3, performance: 3, appearance: 3, teamwork: 3, notes: '' });
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [profileLoading, setProfileLoading] = useState(false);
  const [showDocModal, setShowDocModal] = useState(false);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [showWarningModal, setShowWarningModal] = useState(false);
  const [showAdvanceModal, setShowAdvanceModal] = useState(false);
  const [showAttendanceModal, setShowAttendanceModal] = useState(false);
  const [empForm, setEmpForm] = useState({ full_name: '', role: 'Cashier', phone: '', id_number: '', start_date: '', employment_type: 'full_time', notes: '', is_active: true, annual_leave_entitlement: 15, sick_leave_cycle_days: 30, family_leave_entitlement: 3 });
  const [leaveYear, setLeaveYear] = useState(new Date().getFullYear());
  const [docForm, setDocForm] = useState({ document_type: 'Employment Contract', document_name: '', expiry_date: '', notes: '' });
  const [docFile, setDocFile] = useState<File | null>(null);
  const [leaveForm, setLeaveForm] = useState({ leave_type: 'Annual', start_date: '', end_date: '', days_taken: '', status: 'approved', reason: '', notes: '', paid_hours_per_day: '' });
  const [warningForm, setWarningForm] = useState({ warning_type: 'Written Warning', reason: '', incident_date: '', issued_by: '', notes: '' });
  const [warningFile, setWarningFile] = useState<File | null>(null);
  const [storeName, setStoreName] = useState<string>('');
  const [advanceForm, setAdvanceForm] = useState({ amount: '', reason: '', advance_date: new Date().toISOString().split('T')[0], repayment_status: 'outstanding', deduct_from_wages: true, notes: '' });
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
    const { data: storeData } = await supabase.from('stores').select('name').eq('id', STORE_ID).maybeSingle();
    setStoreName(storeData?.name || '');
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
    const [docsRes, leaveRes, warningsRes, advancesRes, attendanceRes, evalRes] = await Promise.all([
      supabase.from('employee_documents').select('*').eq('employee_id', emp.id).order('created_at', { ascending: false }),
      supabase.from('employee_leave').select('*').eq('employee_id', emp.id).order('start_date', { ascending: false }),
      supabase.from('employee_warnings').select('*').eq('employee_id', emp.id).order('incident_date', { ascending: false }),
      supabase.from('employee_advances').select('*').eq('employee_id', emp.id).order('advance_date', { ascending: false }),
      supabase.from('attendance').select('*').eq('employee_id', emp.id).order('work_date', { ascending: false }).limit(30),
      supabase.from('employee_evaluations').select('*').eq('employee_id', emp.id).order('eval_date', { ascending: false }),
    ]);
    setDocuments(docsRes.data || []);
    setLeave(leaveRes.data || []);
    setWarnings(warningsRes.data || []);
    setEvaluations(evalRes.data || []);
    setAdvances(advancesRes.data || []);
    setAttendance(attendanceRes.data || []);
    setProfileLoading(false);
  }

  function openProfile(emp: Employee) { setSelectedEmployee(emp); setProfileTab('overview'); loadEmployeeProfile(emp); }
  function openAdd() { setEditEmployee(null); setEmpForm({ full_name: '', role: 'Cashier', phone: '', id_number: '', start_date: '', employment_type: 'full_time', notes: '', is_active: true, annual_leave_entitlement: 15, sick_leave_cycle_days: 30, family_leave_entitlement: 3 }); setSaveError(null); setShowEmployeeModal(true); }
  function openEdit(emp: Employee) { setEditEmployee(emp); setEmpForm({ full_name: emp.full_name, role: emp.role, phone: emp.phone || '', id_number: emp.id_number || '', start_date: emp.start_date || '', employment_type: emp.employment_type || 'full_time', notes: emp.notes || '', is_active: emp.is_active, annual_leave_entitlement: emp.annual_leave_entitlement ?? 15, sick_leave_cycle_days: emp.sick_leave_cycle_days ?? 30, family_leave_entitlement: emp.family_leave_entitlement ?? 3 }); setSaveError(null); setShowEmployeeModal(true); }

  async function saveEmployee() {
    if (!empForm.full_name.trim()) return;
    setSaving(true); setSaveError(null);
    try {
      const payload = { store_id: STORE_ID, organisation_id: ORG_ID, full_name: empForm.full_name.trim(), role: empForm.role, phone: empForm.phone || null, id_number: empForm.id_number || null, start_date: empForm.start_date || null, employment_type: empForm.employment_type, notes: empForm.notes || null, is_active: empForm.is_active, annual_leave_entitlement: empForm.annual_leave_entitlement, sick_leave_cycle_days: empForm.sick_leave_cycle_days, family_leave_entitlement: empForm.family_leave_entitlement };
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

  function computeAttendanceDeduction(attendanceRecs: Array<{ is_late: boolean; hours_worked: number | null }>) {
    const sessions = attendanceRecs.filter(a => (a.hours_worked ?? 0) > 0 || a.is_late);
    if (sessions.length === 0) return { deduction: 0, lateRate: 0, lateCount: 0, totalSessions: 0 };
    const lateCount = sessions.filter(a => a.is_late).length;
    const lateRate = lateCount / sessions.length;
    let deduction = 0;
    if (lateRate >= 0.5) deduction = 1.0;
    else if (lateRate >= 0.25) deduction = 0.5;
    else if (lateRate >= 0.1) deduction = 0.25;
    return { deduction, lateRate, lateCount, totalSessions: sessions.length };
  }

  function computeEmployeeGrade(evals: EmployeeEvaluation[], warns: EmployeeWarning[], attendanceRecs?: Array<{ is_late: boolean; hours_worked: number | null }>) {
    const baseScore = evals.length > 0 ? evals[0].overall_score : 3.5;
    const warningDeductions = warns.reduce((sum, w) => {
      if (w.warning_type === 'Final Written Warning') return sum + 1;
      if (w.warning_type === 'Written Warning') return sum + 0.5;
      if (w.warning_type === 'Verbal Warning') return sum + 0.25;
      return sum;
    }, 0);
    const { deduction: attendanceDeduction, lateRate, lateCount, totalSessions } = attendanceRecs ? computeAttendanceDeduction(attendanceRecs) : { deduction: 0, lateRate: 0, lateCount: 0, totalSessions: 0 };
    const score = Math.max(1, baseScore - warningDeductions - attendanceDeduction);
    const evalDue = evals.length === 0 || (new Date().getTime() - new Date(evals[0].eval_date).getTime()) > 90 * 24 * 60 * 60 * 1000;
    const lastEvalDaysAgo = evals.length > 0 ? Math.floor((new Date().getTime() - new Date(evals[0].eval_date).getTime()) / (24 * 60 * 60 * 1000)) : null;
    if (score >= 4.5) return { score, grade: 'A', label: 'Excellent', color: '#16a34a', attendanceDeduction, lateRate, lateCount, totalSessions, evalDue, lastEvalDaysAgo };
    if (score >= 3.5) return { score, grade: 'B', label: 'Good', color: '#2563eb', attendanceDeduction, lateRate, lateCount, totalSessions, evalDue, lastEvalDaysAgo };
    if (score >= 2.5) return { score, grade: 'C', label: 'Satisfactory', color: '#d97706', attendanceDeduction, lateRate, lateCount, totalSessions, evalDue, lastEvalDaysAgo };
    if (score >= 1.5) return { score, grade: 'D', label: 'Below Standard', color: '#dc2626', attendanceDeduction, lateRate, lateCount, totalSessions, evalDue, lastEvalDaysAgo };
    return { score, grade: 'F', label: 'Unsatisfactory', color: '#7f1d1d', attendanceDeduction, lateRate, lateCount, totalSessions, evalDue, lastEvalDaysAgo };
  }

  async function saveEvaluation() {
    if (!selectedEmployee || !evalForm.evaluated_by.trim() || !evalForm.eval_date) return;
    setSaving(true); setSaveError(null);
    const overall_score = parseFloat(((evalForm.punctuality + evalForm.attitude + evalForm.performance + evalForm.appearance + evalForm.teamwork) / 5).toFixed(2));
    try {
      await supabase.from('employee_evaluations').insert({ employee_id: selectedEmployee.id, store_id: STORE_ID, eval_date: evalForm.eval_date, evaluated_by: evalForm.evaluated_by, punctuality: evalForm.punctuality, attitude: evalForm.attitude, performance: evalForm.performance, appearance: evalForm.appearance, teamwork: evalForm.teamwork, overall_score, notes: evalForm.notes || null });
      await loadEmployeeProfile(selectedEmployee); setShowEvalModal(false); setEvalForm({ eval_date: new Date().toISOString().split('T')[0], evaluated_by: '', punctuality: 3, attitude: 3, performance: 3, appearance: 3, teamwork: 3, notes: '' });
    } catch (e: unknown) { setSaveError(e instanceof Error ? e.message : 'Failed to save'); }
    setSaving(false);
  }

  async function saveAdvance() {
    if (!selectedEmployee || !advanceForm.amount || !advanceForm.advance_date) return;
    setSaving(true); setSaveError(null);
    try {
      await supabase.from('employee_advances').insert({ employee_id: selectedEmployee.id, store_id: STORE_ID, amount: parseFloat(advanceForm.amount), reason: advanceForm.reason || null, advance_date: advanceForm.advance_date, repayment_status: advanceForm.repayment_status, deduct_from_wages: advanceForm.deduct_from_wages, notes: advanceForm.notes || null });
      await loadEmployeeProfile(selectedEmployee); setShowAdvanceModal(false); setAdvanceForm({ amount: '', reason: '', advance_date: new Date().toISOString().split('T')[0], repayment_status: 'outstanding', deduct_from_wages: true, notes: '' });
    } catch (e: unknown) { setSaveError(e instanceof Error ? e.message : 'Failed to save'); }
    setSaving(false);
  }

  async function savePin() {
    if (!selectedEmployee) return
    if (pinForm && (pinForm.length !== 4 || !/^[0-9]{4}$/.test(pinForm))) { alert('PIN must be exactly 4 digits (numbers only)'); return }
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
        const clockIn = editAttendForm.clock_in ? localTimeToUTC(workDate, editAttendForm.clock_in) : null;
        const clockOut = editAttendForm.clock_out ? localTimeToUTC(workDate, editAttendForm.clock_out) : null;
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
      const clockIn = attendanceForm.clock_in ? localTimeToUTC(attendanceForm.work_date, attendanceForm.clock_in) : null;
      const clockOut = attendanceForm.clock_out ? localTimeToUTC(attendanceForm.work_date, attendanceForm.clock_out) : null;
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
            <div style={{ borderTop: '1px solid #eee', paddingTop: 12, marginTop: 4 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#888', marginBottom: 10, textTransform: 'uppercase' as const, letterSpacing: 1 }}>Leave Entitlements</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                <div><label style={lbl}>Annual (days/year)</label><input type="number" min="0" value={empForm.annual_leave_entitlement} onChange={e => setEmpForm(p => ({ ...p, annual_leave_entitlement: parseInt(e.target.value) || 0 }))} style={inp} /></div>
                <div><label style={lbl}>Sick (days/36 months)</label><input type="number" min="0" value={empForm.sick_leave_cycle_days} onChange={e => setEmpForm(p => ({ ...p, sick_leave_cycle_days: parseInt(e.target.value) || 0 }))} style={inp} /></div>
                <div><label style={lbl}>Family Resp. (days/year)</label><input type="number" min="0" value={empForm.family_leave_entitlement} onChange={e => setEmpForm(p => ({ ...p, family_leave_entitlement: parseInt(e.target.value) || 0 }))} style={inp} /></div>
              </div>
              <div style={{ fontSize: 11, color: '#aaa', marginTop: 6 }}>Sick leave runs in a 36-month BCEA cycle. Default: 30 days (5-day worker) or 36 days (6-day worker).</div>
            </div>
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
          <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
            <button onClick={() => { if (selectedEmployee) printWarningLetter({ warningType: warningForm.warning_type, incidentDate: warningForm.incident_date, reason: warningForm.reason, issuedBy: warningForm.issued_by, notes: warningForm.notes, employee: selectedEmployee, storeName, previousWarnings: warnings }); }} disabled={!warningForm.reason.trim() || !warningForm.incident_date || !warningForm.issued_by.trim()} style={{ flex: 1, padding: '12px', background: '#fff', color: '#333', border: '1px solid #ccc', borderRadius: 12, fontWeight: 600, cursor: 'pointer' }}>🖨️ Print Preview</button>
            <button onClick={saveWarning} disabled={saving || !warningForm.reason.trim() || !warningForm.incident_date || !warningForm.issued_by.trim()} style={{ flex: 2, padding: '12px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: 12, fontWeight: 700, cursor: 'pointer' }}>{saving ? 'Saving...' : 'Issue Warning'}</button>
          </div>
        </ModalWrap>
      )}

      {showEvalModal && (
        <ModalWrap onClose={() => { setShowEvalModal(false); setSaveError(null); }}>
          <ModalHeader title="Employee Evaluation" onClose={() => { setShowEvalModal(false); setSaveError(null); }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div><label style={lbl}>Evaluation Date *</label><input type="date" value={evalForm.eval_date} onChange={e => setEvalForm(p => ({ ...p, eval_date: e.target.value }))} style={inp} /></div>
              <div><label style={lbl}>Evaluated By *</label><input value={evalForm.evaluated_by} onChange={e => setEvalForm(p => ({ ...p, evaluated_by: e.target.value }))} placeholder="Manager name" style={inp} /></div>
            </div>
            <div style={{ background: '#f8faf8', borderRadius: 12, padding: '14px 16px', border: '1px solid #eef2ee' }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: '#333', marginBottom: 12 }}>Rate each category (1 = Poor, 5 = Excellent)</div>
              {[{ key: 'punctuality', label: '⏰ Punctuality' }, { key: 'attitude', label: '😊 Attitude' }, { key: 'performance', label: '🎯 Performance' }, { key: 'appearance', label: '👔 Appearance' }, { key: 'teamwork', label: '🤝 Teamwork' }].map(({ key, label }) => (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                  <div style={{ width: 130, fontSize: 13, color: '#555', fontWeight: 600 }}>{label}</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {[1, 2, 3, 4, 5].map(n => (
                      <button key={n} onClick={() => setEvalForm(p => ({ ...p, [key]: n }))} style={{ width: 36, height: 36, borderRadius: 8, border: '1px solid #ddd', background: (evalForm as Record<string, number>)[key] === n ? PRIMARY : '#fff', color: (evalForm as Record<string, number>)[key] === n ? '#fff' : '#555', fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>{n}</button>
                    ))}
                  </div>
                  <div style={{ fontSize: 12, color: '#888', marginLeft: 4 }}>{(evalForm as Record<string, number>)[key]}/5</div>
                </div>
              ))}
              <div style={{ borderTop: '1px solid #eef2ee', paddingTop: 10, marginTop: 4, display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#333' }}>Overall Score:</span>
                <span style={{ fontWeight: 900, fontSize: 18, color: PRIMARY }}>{((evalForm.punctuality + evalForm.attitude + evalForm.performance + evalForm.appearance + evalForm.teamwork) / 5).toFixed(2)} / 5.00</span>
                <span style={{ fontWeight: 800, color: computeEmployeeGrade([{ ...evalForm, id: '', overall_score: (evalForm.punctuality + evalForm.attitude + evalForm.performance + evalForm.appearance + evalForm.teamwork) / 5, created_at: '' } as EmployeeEvaluation], []).color }}>({computeEmployeeGrade([{ ...evalForm, id: '', overall_score: (evalForm.punctuality + evalForm.attitude + evalForm.performance + evalForm.appearance + evalForm.teamwork) / 5, created_at: '' } as EmployeeEvaluation], []).grade} — {computeEmployeeGrade([{ ...evalForm, id: '', overall_score: (evalForm.punctuality + evalForm.attitude + evalForm.performance + evalForm.appearance + evalForm.teamwork) / 5, created_at: '' } as EmployeeEvaluation], []).label})</span>
              </div>
            </div>
            <div><label style={lbl}>Notes (optional)</label><textarea value={evalForm.notes} onChange={e => setEvalForm(p => ({ ...p, notes: e.target.value }))} rows={3} placeholder="Any additional observations..." style={{ ...inp, resize: 'vertical' as const }} /></div>
          </div>
          <ErrorBanner msg={saveError} />
          <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
            <button onClick={saveEvaluation} disabled={saving || !evalForm.evaluated_by.trim() || !evalForm.eval_date} style={{ flex: 1, padding: '12px', background: PRIMARY, color: '#fff', border: 'none', borderRadius: 12, fontWeight: 700, cursor: 'pointer' }}>{saving ? 'Saving...' : 'Save Evaluation'}</button>
          </div>
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

      {(showAttendanceModal || !!editingAttendance) && (
        <ModalWrap onClose={() => { setShowAttendanceModal(false); setEditingAttendance(null); setSaveError(null); }}>
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

          {!editingAttendance && (
          <>
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
          </>
          )}
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
              {!profileLoading && (() => {
                const gradeInfo = computeEmployeeGrade(evaluations, warnings, attendance);
                return (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, background: 'rgba(255,255,255,0.12)', borderRadius: 10, padding: '8px 12px' }}>
                      <div style={{ fontWeight: 900, fontSize: 28, color: gradeInfo.color, background: '#fff', borderRadius: 8, width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{gradeInfo.grade}</div>
                      <div>
                        <div style={{ color: '#fff', fontWeight: 700, fontSize: 13 }}>{gradeInfo.label}{gradeInfo.evalDue && <span style={{ marginLeft: 8, fontSize: 10, background: '#dc2626', color: '#fff', borderRadius: 4, padding: '1px 6px', fontWeight: 700 }}>EVAL DUE</span>}</div>
                        <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 11 }}>Score {gradeInfo.score.toFixed(2)}/5.00{gradeInfo.attendanceDeduction > 0 ? ` · Late −${gradeInfo.attendanceDeduction.toFixed(2)} (${Math.round(gradeInfo.lateRate * 100)}% of sessions)` : ''}</div>
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginTop: 10 }}>
                      {[{ label: 'Documents', value: documents.length }, { label: 'Leave Days', value: totalLeaveDays }, { label: 'Warnings', value: warnings.length }, { label: 'Advances', value: fmt(outstandingAdvances) }].map(item => (
                        <div key={item.label} style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 10, padding: '8px', textAlign: 'center' as const }}>
                          <div style={{ color: '#fff', fontWeight: 800, fontSize: 15 }}>{item.value}</div>
                          <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 10, marginTop: 2 }}>{item.label}</div>
                        </div>
                      ))}
                    </div>
                  </>
                );
              })()}
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
                    {!selectedEmployee.is_active && (
                      <button onClick={async () => {
                        if (!confirm(`Permanently delete ${selectedEmployee.full_name}?\n\nAll linked records (payouts, attendance, advances, wages) will be unlinked but kept for reporting. This cannot be undone.`)) return
                        const eid = selectedEmployee.id
                        // Null out employee_id references in all related tables before deleting
                        await Promise.all([
                          supabase.from('cash_up_payouts').update({ employee_id: null }).eq('employee_id', eid),
                          supabase.from('attendance').update({ employee_id: null }).eq('employee_id', eid),
                          supabase.from('employee_advances').update({ employee_id: null }).eq('employee_id', eid),
                          supabase.from('wage_payments').update({ employee_id: null }).eq('employee_id', eid),
                          supabase.from('stock_issues').update({ employee_id: null }).eq('employee_id', eid),
                          supabase.from('leave_requests').update({ employee_id: null }).eq('employee_id', eid),
                          supabase.from('uniform_issues').update({ employee_id: null }).eq('employee_id', eid),
                        ])
                        const { error } = await supabase.from('employees').delete().eq('id', eid)
                        if (error) { alert('Could not delete: ' + error.message); return }
                        setSelectedEmployee(null)
                        alert(`${selectedEmployee.full_name} has been permanently deleted.`)
                        window.location.reload()
                      }} style={{ width: '100%', marginTop: 8, padding: '12px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>
                        🗑 Permanently Delete Employee
                      </button>
                    )}

                    {/* 🔢 Kiosk / Stock PIN */}
                    <div style={{ background: '#f9fafb', borderRadius: 12, padding: 16, marginTop: 12, border: '1px solid #e5e7eb' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 14, color: '#111' }}>🔢 Kiosk / Stock PIN</div>
                          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>Used for stock issue audit trail and negative stock override</div>
                          <div style={{ fontSize: 12, marginTop: 4, fontWeight: 700, color: (selectedEmployee as any).clock_pin ? '#1a5c38' : '#9ca3af' }}>
                            {(selectedEmployee as any).clock_pin ? '✓ PIN is set' : 'No PIN set'}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button onClick={() => { setShowPinForm(!showPinForm); setPinForm(''); setPinSaved(false) }}
                            style={{ fontSize: 12, fontWeight: 700, padding: '6px 14px', background: '#e0f2fe', color: '#0369a1', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
                            {(selectedEmployee as any).clock_pin ? 'Change' : 'Set PIN'}
                          </button>
                          {(selectedEmployee as any).clock_pin && (
                            <button onClick={async () => { if (!confirm('Clear PIN for this employee?')) return; await supabase.from('employees').update({ clock_pin: null }).eq('id', selectedEmployee.id); setSelectedEmployee({ ...selectedEmployee, clock_pin: null } as any) }}
                              style={{ fontSize: 12, fontWeight: 700, padding: '6px 14px', background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 8, cursor: 'pointer' }}>Clear</button>
                          )}
                        </div>
                      </div>
                      {showPinForm && (
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
                          <input type="tel" maxLength={4} value={pinForm} autoFocus
                            autoComplete="off"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            onChange={e => setPinForm(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
                            placeholder="e.g. 1234"
                            style={{ flex: 1, padding: '10px 12px', border: '1.5px solid #0369a1', borderRadius: 8, fontSize: 20, textAlign: 'center', letterSpacing: 10, outline: 'none' }} />
                          <button onClick={savePin} disabled={pinSaving}
                            style={{ padding: '10px 20px', background: '#1a5c38', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}>
                            {pinSaving ? '...' : 'Save'}
                          </button>
                        </div>
                      )}
                      {pinSaved && <div style={{ fontSize: 12, color: '#1a5c38', fontWeight: 700, marginTop: 6 }}>✓ PIN saved successfully</div>}
                    </div>
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

                {profileTab === 'leave' && (() => {
                  // Per-year leave (Annual, Family)
                  const annualEnt = selectedEmployee?.annual_leave_entitlement ?? 15;
                  const familyEnt = selectedEmployee?.family_leave_entitlement ?? 3;
                  const leaveInYear = leave.filter(l => new Date(l.start_date).getFullYear() === leaveYear && l.status === 'approved');
                  const annualUsed = leaveInYear.filter(l => l.leave_type === 'Annual').reduce((s, l) => s + l.days_taken, 0);
                  const familyUsed = leaveInYear.filter(l => l.leave_type === 'Family Responsibility').reduce((s, l) => s + l.days_taken, 0);
                  const otherUsed = leaveInYear.filter(l => !['Annual','Sick','Family Responsibility'].includes(l.leave_type)).reduce((s, l) => s + l.days_taken, 0);
                  // BCEA sick leave — 36-month cycle from start_date
                  const sickCycle = getSickLeaveCycle(selectedEmployee?.start_date || null, selectedEmployee?.sick_leave_cycle_days ?? 30);
                  const sickUsedInCycle = sickCycle
                    ? leave.filter(l => l.leave_type === 'Sick' && l.status === 'approved' && new Date(l.start_date) >= sickCycle.cycleStart && new Date(l.start_date) <= sickCycle.cycleEnd).reduce((s, l) => s + l.days_taken, 0)
                    : 0;
                  const sickEffectiveLimit = sickCycle?.isFirst6Months ? (sickCycle.accruedLimit ?? 0) : (sickCycle?.cycleEntitlement ?? 30);
                  const sickRemaining = Math.max(0, sickEffectiveLimit - sickUsedInCycle);
                  const leaveListYear = leave.filter(l => new Date(l.start_date).getFullYear() === leaveYear);
                  const fmt = (d: Date) => d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
                  return (
                  <div>
                    {/* Header row */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                      <button onClick={() => { setSaveError(null); setShowLeaveModal(true); }} style={{ padding: '10px 18px', background: PRIMARY, color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>+ Record Leave</button>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <button onClick={() => setLeaveYear(y => y - 1)} style={{ background: '#eee', border: 'none', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', fontWeight: 700, color: '#555' }}>‹</button>
                        <span style={{ fontWeight: 700, fontSize: 14, color: '#333', minWidth: 44, textAlign: 'center' as const }}>{leaveYear}</span>
                        <button onClick={() => setLeaveYear(y => y + 1)} style={{ background: '#eee', border: 'none', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', fontWeight: 700, color: '#555' }}>›</button>
                      </div>
                    </div>
                    {/* Sick leave BCEA cycle card */}
                    {sickCycle && (
                      <div style={{ background: sickCycle.isFirst6Months ? '#fff8e1' : '#f8faf8', borderRadius: 12, padding: '14px 16px', border: `1px solid ${sickCycle.isFirst6Months ? '#fde68a' : '#eef2ee'}`, marginBottom: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: 13, color: '#333' }}>🏥 Sick Leave — BCEA Cycle {sickCycle.cycleIndex + 1}</div>
                            <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{fmt(sickCycle.cycleStart)} – {fmt(sickCycle.cycleEnd)}</div>
                          </div>
                          <div style={{ textAlign: 'right' as const }}>
                            <div style={{ fontWeight: 800, fontSize: 20, color: sickUsedInCycle >= sickEffectiveLimit ? '#ef4444' : PRIMARY }}>{sickUsedInCycle}<span style={{ fontWeight: 400, fontSize: 13, color: '#aaa' }}> / {sickEffectiveLimit}</span></div>
                            <div style={{ fontSize: 11, color: sickRemaining === 0 ? '#ef4444' : '#666' }}>{sickRemaining} days remaining</div>
                          </div>
                        </div>
                        <div style={{ height: 6, background: '#e0e0e0', borderRadius: 4, marginBottom: 6 }}>
                          <div style={{ height: '100%', width: `${Math.min(100, sickEffectiveLimit > 0 ? (sickUsedInCycle / sickEffectiveLimit) * 100 : 0)}%`, background: sickUsedInCycle >= sickEffectiveLimit ? '#ef4444' : sickUsedInCycle / sickEffectiveLimit >= 0.8 ? '#f59e0b' : PRIMARY, borderRadius: 4, transition: 'width 0.3s' }} />
                        </div>
                        {sickCycle.isFirst6Months && (
                          <div style={{ fontSize: 11, color: '#92400e', background: '#fef3c7', borderRadius: 8, padding: '6px 10px', marginTop: 6 }}>
                            ⚠️ <strong>First 6 months:</strong> limited to 1 day per 26 days worked (accrued: ~{sickCycle.accruedLimit} days). Full {sickCycle.cycleEntitlement}-day entitlement unlocks after 6 months.
                          </div>
                        )}
                      </div>
                    )}
                    {/* Annual + Family + Other tiles */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 20 }}>
                      {[
                        { label: 'Annual Leave', used: annualUsed, ent: annualEnt },
                        { label: 'Family Resp.', used: familyUsed, ent: familyEnt },
                        { label: 'Other / Unpaid', used: otherUsed, ent: null },
                      ].map(item => {
                        const remaining = item.ent !== null ? Math.max(0, item.ent - item.used) : null;
                        const pct = item.ent ? (item.used / item.ent) * 100 : 0;
                        const barColor = pct >= 100 ? '#ef4444' : pct >= 80 ? '#f59e0b' : PRIMARY;
                        return (
                          <div key={item.label} style={{ background: '#f8faf8', borderRadius: 12, padding: '12px', border: '1px solid #eef2ee' }}>
                            <div style={{ fontSize: 10, color: '#888', fontWeight: 700, marginBottom: 4, textTransform: 'uppercase' as const, letterSpacing: 0.5 }}>{item.label}</div>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
                              <span style={{ fontSize: 22, fontWeight: 800, color: item.ent !== null && item.used >= item.ent ? '#ef4444' : PRIMARY }}>{item.used}</span>
                              {item.ent !== null && <span style={{ fontSize: 11, color: '#aaa' }}>/{item.ent}</span>}
                            </div>
                            {item.ent !== null && (
                              <>
                                <div style={{ height: 4, background: '#e8f0e8', borderRadius: 4, marginTop: 6, marginBottom: 3 }}>
                                  <div style={{ height: '100%', width: `${Math.min(100, pct)}%`, background: barColor, borderRadius: 4 }} />
                                </div>
                                <div style={{ fontSize: 10, color: remaining === 0 ? '#ef4444' : '#888' }}>{remaining! > 0 ? `${remaining} left` : 'None left'}</div>
                              </>
                            )}
                            {item.ent === null && <div style={{ fontSize: 10, color: '#aaa' }}>days taken</div>}
                          </div>
                        );
                      })}
                    </div>
                    {/* Leave list for selected year */}
                    {leave.length === 0 && <div style={{ textAlign: 'center' as const, padding: 40, color: '#aaa' }}>No leave records yet</div>}
                    {leave.length > 0 && leaveListYear.length === 0 && <div style={{ textAlign: 'center' as const, padding: 24, color: '#aaa', fontSize: 13 }}>No leave in {leaveYear}</div>}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {leaveListYear.map(l => (
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
                  );
                })()}

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
                            <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
                              <button onClick={() => { if (selectedEmployee) printWarningLetter({ warningType: w.warning_type, incidentDate: w.incident_date, reason: w.reason, issuedBy: w.issued_by, notes: w.notes || '', employee: selectedEmployee, storeName, previousWarnings: warnings.filter(pw => pw.id !== w.id && pw.incident_date <= w.incident_date) }); }} style={{ fontSize: 12, color: PRIMARY, fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>🖨️ Print Letter</button>
                              {w.document_url && (
                                <>
                                  <span style={{ color: '#ccc' }}>|</span>
                                  {isImage(w.document_url) && <img src={w.document_url} alt="warning doc" style={{ width: '100%', maxHeight: 100, objectFit: 'cover', borderRadius: 8, marginBottom: 4 }} />}
                                  <a href={w.document_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: PRIMARY, fontWeight: 600 }}>{isImage(w.document_url) ? '🖼️ View Document' : '📄 Open Document'} →</a>
                                </>
                              )}
                            </div>
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
                                setEditAttendForm({ clock_in: a.clock_in ? new Date(a.clock_in).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', hour12: false }) : '', clock_out: a.clock_out ? new Date(a.clock_out).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', hour12: false }) : '', is_late: a.is_late ?? false, notes: a.notes ?? '' });
                                setEditingAttendance(a);
                              }}
                              style={{ fontSize: 12, fontWeight: 700, color: !a.clock_out ? '#dc2626' : '#1a5c38', background: !a.clock_out ? '#fef2f2' : '#eef2ee', border: `1px solid ${!a.clock_out ? '#fecaca' : '#d1fae5'}`, borderRadius: 8, padding: '4px 10px', cursor: 'pointer' }}
                            >{!a.clock_out ? '⚠ Fix' : '✏ Edit'}</button>
                            <button
                              onClick={async () => {
                                if (!confirm('Delete this attendance record?')) return;
                                const { error } = await supabase.from('attendance').delete().eq('id', a.id);
                                if (error) { alert('Could not delete: ' + error.message); return; }
                                if (selectedEmployee) await loadEmployeeProfile(selectedEmployee);
                              }}
                              style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 8, padding: '4px 10px', cursor: 'pointer', marginLeft: 4 }}
                            >🗑 Del</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {profileTab === 'evaluations' && (
                  <div style={{ padding: '20px 0', display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontWeight: 700, fontSize: 15, color: '#333' }}>📋 Performance Evaluations</div>
                      <button onClick={() => setShowEvalModal(true)} style={{ background: PRIMARY, color: '#fff', border: 'none', borderRadius: 10, padding: '8px 18px', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>+ New Evaluation</button>
                    </div>
                    {(() => {
                      const gradeInfo = computeEmployeeGrade(evaluations, warnings, attendance);
                      const nextEvalDate = evaluations.length > 0 ? new Date(new Date(evaluations[0].eval_date).getTime() + 90 * 24 * 60 * 60 * 1000).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Now';
                      return (
                        <>
                          <div style={{ background: `linear-gradient(135deg, ${gradeInfo.color}22, ${gradeInfo.color}11)`, border: `1.5px solid ${gradeInfo.color}55`, borderRadius: 14, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16 }}>
                            <div style={{ fontWeight: 900, fontSize: 36, color: gradeInfo.color, background: '#fff', borderRadius: 10, width: 56, height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>{gradeInfo.grade}</div>
                            <div style={{ flex: 1 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <div style={{ fontWeight: 800, fontSize: 17, color: '#333' }}>{gradeInfo.label}</div>
                                {gradeInfo.evalDue && <span style={{ fontSize: 10, background: '#dc2626', color: '#fff', borderRadius: 4, padding: '2px 8px', fontWeight: 700 }}>EVAL OVERDUE</span>}
                              </div>
                              <div style={{ fontSize: 12, color: '#666', marginTop: 3 }}>Score: <b>{gradeInfo.score.toFixed(2)}</b> / 5.00 · {gradeInfo.lastEvalDaysAgo !== null ? `Last evaluated ${gradeInfo.lastEvalDaysAgo}d ago` : 'Never evaluated'}</div>
                              {!gradeInfo.evalDue && <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>Next evaluation due: {nextEvalDate}</div>}
                            </div>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                            <div style={{ background: '#f8faf8', borderRadius: 10, padding: '10px 12px', border: '1px solid #eef2ee', fontSize: 12 }}>
                              <div style={{ fontWeight: 700, color: '#333', marginBottom: 4 }}>📋 Evaluation Score</div>
                              <div style={{ color: evaluations.length > 0 ? '#2563eb' : '#888' }}>{evaluations.length > 0 ? `${evaluations[0].overall_score.toFixed(2)}/5 (${evaluations.length} eval${evaluations.length > 1 ? 's' : ''})` : 'Default 3.50/5'}</div>
                            </div>
                            <div style={{ background: '#f8faf8', borderRadius: 10, padding: '10px 12px', border: '1px solid #eef2ee', fontSize: 12 }}>
                              <div style={{ fontWeight: 700, color: '#333', marginBottom: 4 }}>⚠ Warnings</div>
                              <div style={{ color: warnings.length > 0 ? '#dc2626' : '#16a34a' }}>{warnings.length > 0 ? `−${warnings.reduce((s, w) => s + (w.warning_type === 'Final Written Warning' ? 1 : w.warning_type === 'Written Warning' ? 0.5 : w.warning_type === 'Verbal Warning' ? 0.25 : 0), 0).toFixed(2)} pts (${warnings.length} warning${warnings.length > 1 ? 's' : ''})` : 'None'}</div>
                            </div>
                            <div style={{ background: '#f8faf8', borderRadius: 10, padding: '10px 12px', border: '1px solid #eef2ee', fontSize: 12 }}>
                              <div style={{ fontWeight: 700, color: '#333', marginBottom: 4 }}>⏰ Attendance</div>
                              <div style={{ color: gradeInfo.attendanceDeduction > 0 ? '#dc2626' : '#16a34a' }}>{gradeInfo.totalSessions > 0 ? `${gradeInfo.lateCount}/${gradeInfo.totalSessions} late (${Math.round(gradeInfo.lateRate * 100)}%)${gradeInfo.attendanceDeduction > 0 ? ` −${gradeInfo.attendanceDeduction.toFixed(2)} pts` : ''}` : 'No records'}</div>
                            </div>
                          </div>
                        </>
                      );
                    })()}
                    {evaluations.length === 0 && <div style={{ textAlign: 'center' as const, padding: 40, color: '#aaa' }}>No evaluations yet — add the first one</div>}
                    {evaluations.map(ev => (
                      <div key={ev.id} style={{ background: '#f8faf8', borderRadius: 14, padding: '16px 20px', border: '1px solid #eef2ee' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: 14, color: '#333' }}>{new Date(ev.eval_date).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
                            <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>Evaluated by: {ev.evaluated_by}</div>
                          </div>
                          <div style={{ fontWeight: 900, fontSize: 22, color: computeEmployeeGrade([ev], []).color, background: '#fff', borderRadius: 8, width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: `2px solid ${computeEmployeeGrade([ev], []).color}44` }}>{computeEmployeeGrade([ev], []).grade}</div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, marginTop: 12 }}>
                          {[{ k: 'Punctuality', v: ev.punctuality }, { k: 'Attitude', v: ev.attitude }, { k: 'Performance', v: ev.performance }, { k: 'Appearance', v: ev.appearance }, { k: 'Teamwork', v: ev.teamwork }].map(item => (
                            <div key={item.k} style={{ textAlign: 'center' as const, background: '#fff', borderRadius: 8, padding: '8px 4px', border: '1px solid #eef2ee' }}>
                              <div style={{ fontWeight: 800, fontSize: 18, color: item.v >= 4 ? '#16a34a' : item.v >= 3 ? '#2563eb' : '#dc2626' }}>{item.v}/5</div>
                              <div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>{item.k}</div>
                            </div>
                          ))}
                        </div>
                        {ev.notes && <div style={{ marginTop: 10, fontSize: 12, color: '#555', background: '#fff', borderRadius: 8, padding: '8px 12px', border: '1px solid #eef2ee' }}><b>Notes:</b> {ev.notes}</div>}
                      </div>
                    ))}
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
