'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

const STORE_ID = '05328298-fc27-4c9f-b091-bb7f6598b601';
const ORG_ID = 'e903386b-133a-4bad-b054-ef7ef616a3ff';
const PRIMARY = '#1a5c38';
const DARK = '#0a1f12';

type Employee = {
  id: string;
  full_name: string;
  role: string;
  phone: string | null;
  id_number: string | null;
  start_date: string | null;
  employment_type: string | null;
  is_active: boolean;
  avatar_url: string | null;
  notes: string | null;
  created_at: string;
};

const ROLES = ['Store Manager', 'Assistant Manager', 'Cashier', 'Kitchen Staff', 'Driver', 'Cleaner', 'Security', 'Other'];
const EMPLOYMENT_TYPES = ['full_time', 'part_time', 'casual', 'contract'];
const EMPLOYMENT_LABELS: Record<string, string> = { full_time: 'Full Time', part_time: 'Part Time', casual: 'Casual', contract: 'Contract' };

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

function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

export default function PeoplePage() {
  const router = useRouter();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState('all');
  const [filterStatus, setFilterStatus] = useState<'active' | 'inactive' | 'all'>('active');
  const [showModal, setShowModal] = useState(false);
  const [editEmployee, setEditEmployee] = useState<Employee | null>(null);
  const [saving, setSaving] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);

  const [form, setForm] = useState({
    full_name: '', role: 'Cashier', phone: '', id_number: '',
    start_date: '', employment_type: 'full_time', notes: '', is_active: true,
  });

  useEffect(() => { checkAuthAndLoad(); }, []);

  async function checkAuthAndLoad() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push('/login'); return; }
    await loadEmployees();
  }

  async function loadEmployees() {
    setLoading(true);
    const { data } = await supabase
      .from('employees').select('*')
      .eq('store_id', STORE_ID)
      .order('full_name');
    setEmployees(data || []);
    setLoading(false);
  }

  function openAdd() {
    setEditEmployee(null);
    setForm({ full_name: '', role: 'Cashier', phone: '', id_number: '', start_date: '', employment_type: 'full_time', notes: '', is_active: true });
    setShowModal(true);
  }

  function openEdit(emp: Employee) {
    setEditEmployee(emp);
    setForm({
      full_name: emp.full_name, role: emp.role, phone: emp.phone || '',
      id_number: emp.id_number || '', start_date: emp.start_date || '',
      employment_type: emp.employment_type || 'full_time',
      notes: emp.notes || '', is_active: emp.is_active,
    });
    setShowModal(true);
    setSelectedEmployee(null);
  }

  async function saveEmployee() {
    if (!form.full_name.trim() || !form.role) return;
    setSaving(true);
    const payload = {
      store_id: STORE_ID, organisation_id: ORG_ID,
      full_name: form.full_name.trim(), role: form.role,
      phone: form.phone || null, id_number: form.id_number || null,
      start_date: form.start_date || null, employment_type: form.employment_type,
      notes: form.notes || null, is_active: form.is_active,
    };
    if (editEmployee) {
      await supabase.from('employees').update(payload).eq('id', editEmployee.id);
    } else {
      await supabase.from('employees').insert(payload);
    }
    await loadEmployees();
    setShowModal(false);
    setSaving(false);
  }

  async function toggleActive(emp: Employee) {
    await supabase.from('employees').update({ is_active: !emp.is_active }).eq('id', emp.id);
    await loadEmployees();
    setSelectedEmployee(null);
  }

  const filtered = employees
    .filter(e => filterStatus === 'all' ? true : filterStatus === 'active' ? e.is_active : !e.is_active)
    .filter(e => filterRole === 'all' ? true : e.role === filterRole)
    .filter(e => search === '' || e.full_name.toLowerCase().includes(search.toLowerCase()) || (e.role || '').toLowerCase().includes(search.toLowerCase()));

  const activeCount = employees.filter(e => e.is_active).length;
  const roleBreakdown = ROLES.map(r => ({ role: r, count: employees.filter(e => e.role === r && e.is_active).length })).filter(r => r.count > 0);

  const inputStyle = { width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid #eef2ee', fontSize: 14, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' as const };
  const labelStyle = { display: 'block' as const, fontSize: 13, fontWeight: 600 as const, color: '#555', marginBottom: 6 };
  const cardStyle = { background: '#fff', borderRadius: 20, padding: 24, border: '1px solid #eef2ee', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' };

  return (
    <div style={{ minHeight: '100vh', background: '#f8faf8', fontFamily: 'system-ui, sans-serif' }}>

      {/* Add/Edit Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ background: '#fff', borderRadius: 20, padding: 32, width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#333' }}>{editEmployee ? 'Edit Employee' : 'Add Employee'}</div>
              <button onClick={() => setShowModal(false)} style={{ background: '#f0f4f0', border: 'none', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 14 }}>Cancel</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={labelStyle}>Full Name *</label>
                <input value={form.full_name} onChange={e => setForm(p => ({ ...p, full_name: e.target.value }))} placeholder="e.g. Thabo Nkosi" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Role *</label>
                <select value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))} style={inputStyle}>
                  {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Employment Type</label>
                  <select value={form.employment_type} onChange={e => setForm(p => ({ ...p, employment_type: e.target.value }))} style={inputStyle}>
                    {EMPLOYMENT_TYPES.map(t => <option key={t} value={t}>{EMPLOYMENT_LABELS[t]}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Start Date</label>
                  <input type="date" value={form.start_date} onChange={e => setForm(p => ({ ...p, start_date: e.target.value }))} style={inputStyle} />
                </div>
              </div>
              <div>
                <label style={labelStyle}>Phone Number</label>
                <input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} placeholder="e.g. 072 123 4567" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>ID Number</label>
                <input value={form.id_number} onChange={e => setForm(p => ({ ...p, id_number: e.target.value }))} placeholder="13-digit SA ID number" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Notes</label>
                <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={3} placeholder="Any additional notes..." style={{ ...inputStyle, resize: 'vertical' as const, lineHeight: 1.5 }} />
              </div>
              {editEmployee && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f8faf8', borderRadius: 10, padding: '12px 16px' }}>
                  <label style={{ fontSize: 14, fontWeight: 600, color: '#333' }}>Active Employee</label>
                  <div onClick={() => setForm(p => ({ ...p, is_active: !p.is_active }))} style={{ width: 48, height: 26, borderRadius: 13, background: form.is_active ? PRIMARY : '#ddd', cursor: 'pointer', position: 'relative' as const, transition: 'background 0.2s', flexShrink: 0 }}>
                    <div style={{ position: 'absolute' as const, top: 3, left: form.is_active ? 25 : 3, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={saveEmployee}
              disabled={saving || !form.full_name.trim()}
              style={{ width: '100%', marginTop: 24, padding: '14px', background: form.full_name.trim() ? PRIMARY : '#eee', color: form.full_name.trim() ? '#fff' : '#aaa', border: 'none', borderRadius: 12, fontWeight: 700, cursor: form.full_name.trim() ? 'pointer' : 'default', fontSize: 15 }}
            >
              {saving ? 'Saving...' : editEmployee ? 'Save Changes' : 'Add Employee'}
            </button>
          </div>
        </div>
      )}

      {/* Employee Detail Panel */}
      {selectedEmployee && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 900, display: 'flex' }}>
          <div onClick={() => setSelectedEmployee(null)} style={{ flex: 1, background: 'rgba(0,0,0,0.4)', cursor: 'pointer' }} />
          <div style={{ width: 400, background: '#fff', height: '100vh', overflowY: 'auto', boxShadow: '-4px 0 24px rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ background: `linear-gradient(135deg, ${DARK}, ${PRIMARY})`, padding: '24px', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <button onClick={() => setSelectedEmployee(null)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 13 }}>Close</button>
                <button onClick={() => openEdit(selectedEmployee)} style={{ background: '#fff', color: PRIMARY, border: 'none', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>Edit</button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 800, color: '#fff', flexShrink: 0 }}>
                  {initials(selectedEmployee.full_name)}
                </div>
                <div>
                  <div style={{ color: '#fff', fontWeight: 800, fontSize: 20 }}>{selectedEmployee.full_name}</div>
                  <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, marginTop: 2 }}>{selectedEmployee.role}</div>
                  <div style={{ marginTop: 6 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: selectedEmployee.is_active ? '#e8f5e9' : '#fdecea', color: selectedEmployee.is_active ? PRIMARY : '#ef4444' }}>
                      {selectedEmployee.is_active ? 'ACTIVE' : 'INACTIVE'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <div style={{ flex: 1, padding: 24 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {[
                  { label: 'Employment Type', value: EMPLOYMENT_LABELS[selectedEmployee.employment_type || ''] || selectedEmployee.employment_type },
                  { label: 'Phone', value: selectedEmployee.phone },
                  { label: 'ID Number', value: selectedEmployee.id_number },
                  { label: 'Start Date', value: selectedEmployee.start_date ? new Date(selectedEmployee.start_date).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' }) : null },
                  { label: 'Notes', value: selectedEmployee.notes },
                ].filter(f => f.value).map(f => (
                  <div key={f.label} style={{ background: '#f8faf8', borderRadius: 12, padding: '12px 16px' }}>
                    <div style={{ fontSize: 11, color: '#aaa', fontWeight: 600, marginBottom: 4, textTransform: 'uppercase' as const }}>{f.label}</div>
                    <div style={{ fontSize: 14, color: '#333', fontWeight: 500 }}>{f.value}</div>
                  </div>
                ))}
                {selectedEmployee.start_date && (
                  <div style={{ background: '#f8faf8', borderRadius: 12, padding: '12px 16px' }}>
                    <div style={{ fontSize: 11, color: '#aaa', fontWeight: 600, marginBottom: 4, textTransform: 'uppercase' as const }}>Time with Company</div>
                    <div style={{ fontSize: 14, color: '#333', fontWeight: 500 }}>
                      {(() => {
                        const months = Math.floor((Date.now() - new Date(selectedEmployee.start_date).getTime()) / (1000 * 60 * 60 * 24 * 30));
                        if (months < 1) return 'Less than a month';
                        if (months < 12) return `${months} month${months > 1 ? 's' : ''}`;
                        const years = Math.floor(months / 12);
                        const rem = months % 12;
                        return `${years} year${years > 1 ? 's' : ''}${rem > 0 ? ` ${rem} month${rem > 1 ? 's' : ''}` : ''}`;
                      })()}
                    </div>
                  </div>
                )}
              </div>
              <button
                onClick={() => toggleActive(selectedEmployee)}
                style={{ width: '100%', marginTop: 24, padding: '12px', background: selectedEmployee.is_active ? '#fdecea' : '#e8f5e9', color: selectedEmployee.is_active ? '#ef4444' : PRIMARY, border: `1.5px solid ${selectedEmployee.is_active ? '#ef4444' : PRIMARY}`, borderRadius: 12, fontWeight: 700, cursor: 'pointer', fontSize: 14 }}
              >
                {selectedEmployee.is_active ? 'Deactivate Employee' : 'Reactivate Employee'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
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

            {/* KPI row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginBottom: 32 }}>
              <div style={cardStyle}>
                <div style={{ fontSize: 12, color: '#888', fontWeight: 600, marginBottom: 8 }}>TOTAL STAFF</div>
                <div style={{ fontSize: 36, fontWeight: 800, color: PRIMARY }}>{employees.length}</div>
                <div style={{ fontSize: 12, color: '#aaa', marginTop: 4 }}>all employees</div>
              </div>
              <div style={cardStyle}>
                <div style={{ fontSize: 12, color: '#888', fontWeight: 600, marginBottom: 8 }}>ACTIVE</div>
                <div style={{ fontSize: 36, fontWeight: 800, color: PRIMARY }}>{activeCount}</div>
                <div style={{ fontSize: 12, color: '#aaa', marginTop: 4 }}>currently employed</div>
              </div>
              <div style={cardStyle}>
                <div style={{ fontSize: 12, color: '#888', fontWeight: 600, marginBottom: 8 }}>FULL TIME</div>
                <div style={{ fontSize: 36, fontWeight: 800, color: PRIMARY }}>{employees.filter(e => e.employment_type === 'full_time' && e.is_active).length}</div>
                <div style={{ fontSize: 12, color: '#aaa', marginTop: 4 }}>permanent staff</div>
              </div>
              <div style={cardStyle}>
                <div style={{ fontSize: 12, color: '#888', fontWeight: 600, marginBottom: 8 }}>PART TIME / CASUAL</div>
                <div style={{ fontSize: 36, fontWeight: 800, color: PRIMARY }}>{employees.filter(e => (e.employment_type === 'part_time' || e.employment_type === 'casual') && e.is_active).length}</div>
                <div style={{ fontSize: 12, color: '#aaa', marginTop: 4 }}>flexible staff</div>
              </div>
              {roleBreakdown.slice(0, 2).map(r => (
                <div key={r.role} style={cardStyle}>
                  <div style={{ fontSize: 12, color: '#888', fontWeight: 600, marginBottom: 8 }}>{r.role.toUpperCase()}</div>
                  <div style={{ fontSize: 36, fontWeight: 800, color: (ROLE_COLORS[r.role] || { color: PRIMARY }).color }}>{r.count}</div>
                  <div style={{ fontSize: 12, color: '#aaa', marginTop: 4 }}>active</div>
                </div>
              ))}
            </div>

            {/* Filters */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' as const, alignItems: 'center' }}>
              <input
                placeholder="Search by name or role..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ padding: '10px 16px', borderRadius: 10, border: '1.5px solid #eef2ee', fontSize: 14, outline: 'none', fontFamily: 'inherit', minWidth: 220, background: '#fff' }}
              />
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

            {/* Employee grid */}
            {filtered.length === 0 && (
              <div style={{ textAlign: 'center', padding: 80, background: '#fff', borderRadius: 20, border: '1px solid #eef2ee' }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>👥</div>
                <div style={{ fontWeight: 700, color: '#333', fontSize: 18, marginBottom: 8 }}>No employees found</div>
                <div style={{ color: '#aaa', fontSize: 14, marginBottom: 24 }}>
                  {employees.length === 0 ? 'Add your first employee to get started' : 'Try adjusting your search or filters'}
                </div>
                {employees.length === 0 && (
                  <button onClick={openAdd} style={{ padding: '12px 24px', background: PRIMARY, color: '#fff', border: 'none', borderRadius: 12, fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>+ Add First Employee</button>
                )}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
              {filtered.map(emp => {
                const rc = ROLE_COLORS[emp.role] || { bg: '#f5f5f5', color: '#424242' };
                return (
                  <div
                    key={emp.id}
                    onClick={() => setSelectedEmployee(emp)}
                    style={{ background: '#fff', borderRadius: 16, border: `1.5px solid ${emp.is_active ? '#eef2ee' : '#f5f5f5'}`, padding: 20, cursor: 'pointer', opacity: emp.is_active ? 1 : 0.6, transition: 'transform 0.15s, box-shadow 0.15s', boxShadow: '0 2px 6px rgba(0,0,0,0.04)' }}
                    onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.1)'; }}
                    onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 2px 6px rgba(0,0,0,0.04)'; }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
                      <div style={{ width: 52, height: 52, borderRadius: '50%', background: rc.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 800, color: rc.color, flexShrink: 0 }}>
                        {initials(emp.full_name)}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, color: '#333', fontSize: 15 }}>{emp.full_name}</div>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: rc.bg, color: rc.color }}>{emp.role}</span>
                      </div>
                      {!emp.is_active && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: '#f5f5f5', color: '#aaa' }}>INACTIVE</span>}
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
                      {emp.employment_type && (
                        <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 20, background: '#f0f4f0', color: '#666', fontWeight: 500 }}>{EMPLOYMENT_LABELS[emp.employment_type] || emp.employment_type}</span>
                      )}
                      {emp.phone && (
                        <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 20, background: '#f0f4f0', color: '#666' }}>📞 {emp.phone}</span>
                      )}
                      {emp.start_date && (
                        <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 20, background: '#f0f4f0', color: '#666' }}>
                          Since {new Date(emp.start_date).toLocaleDateString('en-ZA', { month: 'short', year: 'numeric' })}
                        </span>
                      )}
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
