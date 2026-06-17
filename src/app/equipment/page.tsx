'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

const STORE_ID = '05328298-fc27-4c9f-b091-bb7f6598b601';
const ORG_ID = 'e903386b-133a-4bad-b054-ef7ef616a3ff';
const PRIMARY = '#1a5c38';
const DARK = '#0a1f12';

type Equipment = {
  id: string;
  name: string;
  equipment_type: string;
  make: string | null;
  model: string | null;
  serial_number: string | null;
  asset_number: string | null;
  photo_url: string | null;
  installation_date: string | null;
  notes: string | null;
  is_active: boolean;
};

type ServiceSchedule = {
  id: string;
  equipment_id: string;
  service_type: string;
  frequency_months: number;
  last_service_date: string | null;
  next_service_date: string | null;
};

type ServiceLog = {
  id: string;
  equipment_id: string;
  service_date: string;
  service_type: string;
  technician_name: string | null;
  company_name: string | null;
  notes: string | null;
  cost: number | null;
  certificate_url: string | null;
  photo_url: string | null;
  next_service_date: string | null;
};

type EquipmentType = 'Freezer' | 'Fridge' | 'Oven' | 'Extraction' | 'Underbar Fridge' | 'Hot Hold' | 'Dishwasher' | 'Generator' | 'Air Conditioner' | 'Other';

const EQUIPMENT_TYPES: EquipmentType[] = ['Freezer', 'Fridge', 'Oven', 'Extraction', 'Underbar Fridge', 'Hot Hold', 'Dishwasher', 'Generator', 'Air Conditioner', 'Other'];

const SERVICE_TYPES = ['Routine Service', 'Breakdown Repair', 'Deep Clean', 'Inspection', 'Certificate Renewal', 'Other'];

const typeIcon = (type: string) => {
  switch (type) {
    case 'Freezer': return '🧊';
    case 'Fridge': return '❄️';
    case 'Oven': return '🔥';
    case 'Extraction': return '💨';
    case 'Hot Hold': return '♨️';
    case 'Dishwasher': return '🫧';
    case 'Generator': return '⚡';
    case 'Air Conditioner': return '🌬️';
    default: return '🔧';
  }
};

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const diff = new Date(dateStr).getTime() - new Date().getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function serviceStatusColor(days: number | null): string {
  if (days === null) return '#aaa';
  if (days < 0) return '#ef4444';
  if (days <= 30) return '#f59e0b';
  return PRIMARY;
}

function serviceStatusLabel(days: number | null): string {
  if (days === null) return 'No schedule';
  if (days < 0) return `${Math.abs(days)} days overdue`;
  if (days === 0) return 'Due today';
  if (days <= 30) return `Due in ${days} days`;
  return `Due in ${days} days`;
}

export default function EquipmentPage() {
  const router = useRouter();
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [schedules, setSchedules] = useState<Record<string, ServiceSchedule[]>>({});
  const [logs, setLogs] = useState<Record<string, ServiceLog[]>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [selectedEquipment, setSelectedEquipment] = useState<Equipment | null>(null);
  const [showAddEquipment, setShowAddEquipment] = useState(false);
  const [showLogService, setShowLogService] = useState(false);
  const [showAddSchedule, setShowAddSchedule] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [newEquipment, setNewEquipment] = useState({
    name: '', equipment_type: 'Freezer', make: '', model: '',
    serial_number: '', asset_number: '', installation_date: '', notes: ''
  });

  const [newLog, setNewLog] = useState({
    service_date: new Date().toISOString().split('T')[0],
    service_type: 'Routine Service', technician_name: '', company_name: '',
    notes: '', cost: '', next_service_date: ''
  });

  const [newSchedule, setNewSchedule] = useState({
    service_type: 'Routine Service', frequency_months: 6,
    last_service_date: '', next_service_date: ''
  });

  useEffect(() => { checkAuthAndLoad(); }, []);

  async function checkAuthAndLoad() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push('/login'); return; }
    await loadEquipment();
  }

  async function loadEquipment() {
    setLoading(true);
    const { data: equipData } = await supabase
      .from('equipment')
      .select('*')
      .eq('store_id', STORE_ID)
      .eq('is_active', true)
      .order('name');

    setEquipment(equipData || []);

    if (equipData) {
      const schedMap: Record<string, ServiceSchedule[]> = {};
      const logMap: Record<string, ServiceLog[]> = {};

      await Promise.all(equipData.map(async (e) => {
        const { data: scheds } = await supabase
          .from('equipment_service_schedule')
          .select('*')
          .eq('equipment_id', e.id)
          .order('next_service_date');
        schedMap[e.id] = scheds || [];

        const { data: serviceLogs } = await supabase
          .from('equipment_service_log')
          .select('*')
          .eq('equipment_id', e.id)
          .order('service_date', { ascending: false })
          .limit(10);
        logMap[e.id] = serviceLogs || [];
      }));

      setSchedules(schedMap);
      setLogs(logMap);
    }

    setLoading(false);
  }

  async function addEquipment() {
    if (!newEquipment.name) return;
    setSaving(true);
    await supabase.from('equipment').insert({
      store_id: STORE_ID,
      organisation_id: ORG_ID,
      name: newEquipment.name,
      equipment_type: newEquipment.equipment_type,
      make: newEquipment.make || null,
      model: newEquipment.model || null,
      serial_number: newEquipment.serial_number || null,
      asset_number: newEquipment.asset_number || null,
      installation_date: newEquipment.installation_date || null,
      notes: newEquipment.notes || null,
    });
    setNewEquipment({ name: '', equipment_type: 'Freezer', make: '', model: '', serial_number: '', asset_number: '', installation_date: '', notes: '' });
    setShowAddEquipment(false);
    await loadEquipment();
    setSaving(false);
  }

  async function logService() {
    if (!selectedEquipment || !newLog.service_date) return;
    setSaving(true);
    await supabase.from('equipment_service_log').insert({
      equipment_id: selectedEquipment.id,
      store_id: STORE_ID,
      service_date: newLog.service_date,
      service_type: newLog.service_type,
      technician_name: newLog.technician_name || null,
      company_name: newLog.company_name || null,
      notes: newLog.notes || null,
      cost: newLog.cost ? parseFloat(newLog.cost) : null,
      next_service_date: newLog.next_service_date || null,
    });

    if (newLog.next_service_date) {
      const { data: existingSched } = await supabase
        .from('equipment_service_schedule')
        .select('id')
        .eq('equipment_id', selectedEquipment.id)
        .eq('service_type', newLog.service_type)
        .single();

      if (existingSched) {
        await supabase.from('equipment_service_schedule').update({
          last_service_date: newLog.service_date,
          next_service_date: newLog.next_service_date,
        }).eq('id', existingSched.id);
      }
    }

    setNewLog({ service_date: new Date().toISOString().split('T')[0], service_type: 'Routine Service', technician_name: '', company_name: '', notes: '', cost: '', next_service_date: '' });
    setShowLogService(false);
    await loadEquipment();
    setSaving(false);
  }

  async function addSchedule() {
    if (!selectedEquipment) return;
    setSaving(true);
    await supabase.from('equipment_service_schedule').insert({
      equipment_id: selectedEquipment.id,
      service_type: newSchedule.service_type,
      frequency_months: newSchedule.frequency_months,
      last_service_date: newSchedule.last_service_date || null,
      next_service_date: newSchedule.next_service_date || null,
    });
    setNewSchedule({ service_type: 'Routine Service', frequency_months: 6, last_service_date: '', next_service_date: '' });
    setShowAddSchedule(false);
    await loadEquipment();
    setSaving(false);
  }

  async function deactivateEquipment(id: string) {
    await supabase.from('equipment').update({ is_active: false }).eq('id', id);
    setSelectedEquipment(null);
    await loadEquipment();
  }

  const filtered = equipment
    .filter(e => filterType === 'all' || e.equipment_type === filterType)
    .filter(e => search === '' || e.name.toLowerCase().includes(search.toLowerCase()) || e.equipment_type.toLowerCase().includes(search.toLowerCase()));

  const getNextService = (equipId: string) => {
    const scheds = schedules[equipId] || [];
    if (scheds.length === 0) return null;
    const sorted = [...scheds].sort((a, b) => {
      const da = a.next_service_date ? new Date(a.next_service_date).getTime() : Infinity;
      const db = b.next_service_date ? new Date(b.next_service_date).getTime() : Infinity;
      return da - db;
    });
    return sorted[0]?.next_service_date || null;
  };

  const overdueCount = equipment.filter(e => {
    const next = getNextService(e.id);
    const days = daysUntil(next);
    return days !== null && days < 0;
  }).length;

  const dueCount = equipment.filter(e => {
    const next = getNextService(e.id);
    const days = daysUntil(next);
    return days !== null && days >= 0 && days <= 30;
  }).length;

  const inputStyle = { width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid #eef2ee', fontSize: 14, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' as const, background: '#fff' };
  const labelStyle = { display: 'block' as const, fontSize: 13, fontWeight: 600 as const, color: '#333', marginBottom: 6 };
  const cardStyle = { background: '#fff', borderRadius: 20, padding: 24, border: '1px solid #eef2ee', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' };

  return (
    <div style={{ minHeight: '100vh', background: '#f8faf8', fontFamily: 'system-ui, sans-serif' }}>

      {lightboxUrl && (
        <div onClick={() => setLightboxUrl(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 1000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <img src={lightboxUrl} alt="equipment" style={{ maxWidth: '90vw', maxHeight: '85vh', objectFit: 'contain', borderRadius: 12 }} />
          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, marginTop: 16 }}>Tap anywhere to close</div>
        </div>
      )}

      {/* Add Equipment Modal */}
      {showAddEquipment && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #eef2ee', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: PRIMARY, borderRadius: '20px 20px 0 0' }}>
              <span style={{ fontWeight: 700, fontSize: 16, color: '#fff' }}>Add Equipment</span>
              <button onClick={() => setShowAddEquipment(false)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}>Cancel</button>
            </div>
            <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div><label style={labelStyle}>Name *</label><input value={newEquipment.name} onChange={e => setNewEquipment(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Walk-in Freezer" style={inputStyle} /></div>
              <div><label style={labelStyle}>Type *</label>
                <select value={newEquipment.equipment_type} onChange={e => setNewEquipment(p => ({ ...p, equipment_type: e.target.value }))} style={inputStyle}>
                  {EQUIPMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div><label style={labelStyle}>Make</label><input value={newEquipment.make} onChange={e => setNewEquipment(p => ({ ...p, make: e.target.value }))} placeholder="e.g. Samsung" style={inputStyle} /></div>
                <div><label style={labelStyle}>Model</label><input value={newEquipment.model} onChange={e => setNewEquipment(p => ({ ...p, model: e.target.value }))} placeholder="e.g. RB38T" style={inputStyle} /></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div><label style={labelStyle}>Serial Number</label><input value={newEquipment.serial_number} onChange={e => setNewEquipment(p => ({ ...p, serial_number: e.target.value }))} style={inputStyle} /></div>
                <div><label style={labelStyle}>Asset Number</label><input value={newEquipment.asset_number} onChange={e => setNewEquipment(p => ({ ...p, asset_number: e.target.value }))} placeholder="e.g. CT-MH-0001" style={inputStyle} /></div>
              </div>
              <div><label style={labelStyle}>Installation Date</label><input type="date" value={newEquipment.installation_date} onChange={e => setNewEquipment(p => ({ ...p, installation_date: e.target.value }))} style={inputStyle} /></div>
              <div><label style={labelStyle}>Notes</label><textarea value={newEquipment.notes} onChange={e => setNewEquipment(p => ({ ...p, notes: e.target.value }))} rows={3} style={{ ...inputStyle, resize: 'vertical' }} /></div>
              <button onClick={addEquipment} disabled={saving || !newEquipment.name} style={{ padding: '14px', background: newEquipment.name ? PRIMARY : '#eee', color: newEquipment.name ? '#fff' : '#aaa', border: 'none', borderRadius: 12, fontWeight: 700, cursor: newEquipment.name ? 'pointer' : 'default', fontSize: 15 }}>
                {saving ? 'Saving...' : 'Add Equipment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Log Service Modal */}
      {showLogService && selectedEquipment && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #eef2ee', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: PRIMARY, borderRadius: '20px 20px 0 0' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16, color: '#fff' }}>Log Service</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 2 }}>{selectedEquipment.name}</div>
              </div>
              <button onClick={() => setShowLogService(false)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}>Cancel</button>
            </div>
            <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div><label style={labelStyle}>Service Date *</label><input type="date" value={newLog.service_date} onChange={e => setNewLog(p => ({ ...p, service_date: e.target.value }))} style={inputStyle} /></div>
              <div><label style={labelStyle}>Service Type *</label>
                <select value={newLog.service_type} onChange={e => setNewLog(p => ({ ...p, service_type: e.target.value }))} style={inputStyle}>
                  {SERVICE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div><label style={labelStyle}>Technician Name</label><input value={newLog.technician_name} onChange={e => setNewLog(p => ({ ...p, technician_name: e.target.value }))} style={inputStyle} /></div>
                <div><label style={labelStyle}>Company</label><input value={newLog.company_name} onChange={e => setNewLog(p => ({ ...p, company_name: e.target.value }))} style={inputStyle} /></div>
              </div>
              <div><label style={labelStyle}>Cost (R)</label><input type="number" value={newLog.cost} onChange={e => setNewLog(p => ({ ...p, cost: e.target.value }))} placeholder="0.00" style={inputStyle} /></div>
              <div><label style={labelStyle}>Next Service Date</label><input type="date" value={newLog.next_service_date} onChange={e => setNewLog(p => ({ ...p, next_service_date: e.target.value }))} style={inputStyle} /></div>
              <div><label style={labelStyle}>Notes</label><textarea value={newLog.notes} onChange={e => setNewLog(p => ({ ...p, notes: e.target.value }))} rows={3} style={{ ...inputStyle, resize: 'vertical' }} /></div>
              <button onClick={logService} disabled={saving} style={{ padding: '14px', background: PRIMARY, color: '#fff', border: 'none', borderRadius: 12, fontWeight: 700, cursor: 'pointer', fontSize: 15 }}>
                {saving ? 'Saving...' : 'Log Service'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Schedule Modal */}
      {showAddSchedule && selectedEquipment && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 480 }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #eef2ee', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: PRIMARY, borderRadius: '20px 20px 0 0' }}>
              <span style={{ fontWeight: 700, fontSize: 16, color: '#fff' }}>Add Service Schedule</span>
              <button onClick={() => setShowAddSchedule(false)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}>Cancel</button>
            </div>
            <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div><label style={labelStyle}>Service Type</label>
                <select value={newSchedule.service_type} onChange={e => setNewSchedule(p => ({ ...p, service_type: e.target.value }))} style={inputStyle}>
                  {SERVICE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div><label style={labelStyle}>Frequency (months)</label>
                <select value={newSchedule.frequency_months} onChange={e => setNewSchedule(p => ({ ...p, frequency_months: parseInt(e.target.value) }))} style={inputStyle}>
                  {[1, 2, 3, 6, 12, 24].map(m => <option key={m} value={m}>{m === 1 ? 'Monthly' : m === 3 ? 'Quarterly' : m === 6 ? '6-Monthly' : m === 12 ? 'Annual' : m === 24 ? 'Every 2 Years' : `Every ${m} months`}</option>)}
                </select>
              </div>
              <div><label style={labelStyle}>Last Service Date</label><input type="date" value={newSchedule.last_service_date} onChange={e => setNewSchedule(p => ({ ...p, last_service_date: e.target.value }))} style={inputStyle} /></div>
              <div><label style={labelStyle}>Next Service Date</label><input type="date" value={newSchedule.next_service_date} onChange={e => setNewSchedule(p => ({ ...p, next_service_date: e.target.value }))} style={inputStyle} /></div>
              <button onClick={addSchedule} disabled={saving} style={{ padding: '14px', background: PRIMARY, color: '#fff', border: 'none', borderRadius: 12, fontWeight: 700, cursor: 'pointer', fontSize: 15 }}>
                {saving ? 'Saving...' : 'Add Schedule'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Equipment Detail Panel */}
      {selectedEquipment && !showLogService && !showAddSchedule && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 800, display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end' }}>
          <div style={{ background: '#fff', width: 480, height: '100vh', display: 'flex', flexDirection: 'column', boxShadow: '-4px 0 24px rgba(0,0,0,0.15)', overflowY: 'auto' }}>

            <div style={{ padding: '20px 24px', background: PRIMARY, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexShrink: 0 }}>
              <div>
                <div style={{ fontSize: 20, marginBottom: 4 }}>{typeIcon(selectedEquipment.equipment_type)}</div>
                <div style={{ color: '#fff', fontWeight: 700, fontSize: 18 }}>{selectedEquipment.name}</div>
                <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, marginTop: 2 }}>{selectedEquipment.equipment_type}</div>
              </div>
              <button onClick={() => setSelectedEquipment(null)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}>Close</button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>

              {selectedEquipment.photo_url && (
                <div style={{ marginBottom: 24 }}>
                  <img src={selectedEquipment.photo_url} alt="equipment" onClick={() => setLightboxUrl(selectedEquipment.photo_url!)} style={{ width: '100%', borderRadius: 16, objectFit: 'cover', maxHeight: 220, cursor: 'zoom-in' }} />
                </div>
              )}

              <div style={{ ...cardStyle, marginBottom: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#333', marginBottom: 12 }}>Equipment Details</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[
                    ['Make', selectedEquipment.make],
                    ['Model', selectedEquipment.model],
                    ['Serial Number', selectedEquipment.serial_number],
                    ['Asset Number', selectedEquipment.asset_number],
                    ['Installed', selectedEquipment.installation_date ? new Date(selectedEquipment.installation_date).toLocaleDateString('en-ZA') : null],
                  ].filter(([, v]) => v).map(([label, value]) => (
                    <div key={label as string} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                      <span style={{ color: '#888' }}>{label}</span>
                      <span style={{ color: '#333', fontWeight: 600 }}>{value}</span>
                    </div>
                  ))}
                </div>
                {selectedEquipment.notes && <div style={{ marginTop: 12, fontSize: 13, color: '#666', fontStyle: 'italic', borderTop: '1px solid #eef2ee', paddingTop: 12 }}>{selectedEquipment.notes}</div>}
              </div>

              <div style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#333' }}>Service Schedules</div>
                  <button onClick={() => setShowAddSchedule(true)} style={{ background: PRIMARY, color: '#fff', border: 'none', borderRadius: 8, padding: '5px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Add</button>
                </div>
                {(schedules[selectedEquipment.id] || []).length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '16px 0', color: '#ccc', fontSize: 13 }}>No schedules yet</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {(schedules[selectedEquipment.id] || []).map(s => {
                      const days = daysUntil(s.next_service_date);
                      const color = serviceStatusColor(days);
                      return (
                        <div key={s.id} style={{ background: '#f8faf8', borderRadius: 12, padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#333' }}>{s.service_type}</div>
                            <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>Every {s.frequency_months} months</div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color }}>{serviceStatusLabel(days)}</div>
                            {s.next_service_date && <div style={{ fontSize: 11, color: '#aaa' }}>{new Date(s.next_service_date).toLocaleDateString('en-ZA')}</div>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#333', marginBottom: 12 }}>Service History</div>
                {(logs[selectedEquipment.id] || []).length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '16px 0', color: '#ccc', fontSize: 13 }}>No service history yet</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {(logs[selectedEquipment.id] || []).map(log => (
                      <div key={log.id} style={{ background: '#f8faf8', borderRadius: 12, padding: '12px 14px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: '#333' }}>{log.service_type}</span>
                          <span style={{ fontSize: 12, color: '#888' }}>{new Date(log.service_date).toLocaleDateString('en-ZA')}</span>
                        </div>
                        {log.technician_name && <div style={{ fontSize: 12, color: '#666' }}>{log.technician_name} {log.company_name ? `— ${log.company_name}` : ''}</div>}
                        {log.cost && <div style={{ fontSize: 12, color: PRIMARY, fontWeight: 600, marginTop: 2 }}>R{log.cost.toFixed(2)}</div>}
                        {log.notes && <div style={{ fontSize: 12, color: '#aaa', marginTop: 4, fontStyle: 'italic' }}>{log.notes}</div>}
                        {log.next_service_date && <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>Next service: {new Date(log.next_service_date).toLocaleDateString('en-ZA')}</div>}
                        {log.certificate_url && (
                          <a href={log.certificate_url} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', marginTop: 8, fontSize: 12, color: PRIMARY, fontWeight: 600, textDecoration: 'none' }}>View Certificate</a>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <button onClick={() => deactivateEquipment(selectedEquipment.id)} style={{ width: '100%', padding: '10px', background: '#fdecea', color: '#ef4444', border: '1px solid #fca5a5', borderRadius: 10, fontWeight: 600, cursor: 'pointer', fontSize: 13, marginTop: 8 }}>
                Deactivate Equipment
              </button>
            </div>

            <div style={{ padding: '16px 24px', borderTop: '1px solid #eef2ee', flexShrink: 0 }}>
              <button onClick={() => { setShowLogService(true); }} style={{ width: '100%', padding: '14px', background: PRIMARY, color: '#fff', border: 'none', borderRadius: 12, fontWeight: 700, cursor: 'pointer', fontSize: 15 }}>
                Log Service
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ background: `linear-gradient(135deg, ${DARK}, ${PRIMARY})`, padding: '0 32px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 64 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={() => router.push('/dashboard')} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 14 }}>Back</button>
            <span style={{ color: '#fff', fontWeight: 700, fontSize: 18 }}>Equipment Register</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {overdueCount > 0 && <span style={{ background: '#ef4444', color: '#fff', borderRadius: 20, padding: '4px 12px', fontSize: 12, fontWeight: 700 }}>{overdueCount} overdue</span>}
            {dueCount > 0 && <span style={{ background: '#f59e0b', color: '#fff', borderRadius: 20, padding: '4px 12px', fontSize: 12, fontWeight: 700 }}>{dueCount} due soon</span>}
            <button onClick={() => setShowAddEquipment(true)} style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', color: '#fff', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>Add Equipment</button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 24px' }}>

        {loading && <div style={{ textAlign: 'center', padding: 80, color: '#666' }}>Loading equipment...</div>}

        {!loading && (
          <div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 20, marginBottom: 32 }}>
              <div style={cardStyle}>
                <div style={{ fontSize: 13, color: '#666', marginBottom: 8, fontWeight: 500 }}>TOTAL EQUIPMENT</div>
                <div style={{ fontSize: 40, fontWeight: 800, color: PRIMARY }}>{equipment.length}</div>
                <div style={{ fontSize: 13, color: '#888', marginTop: 4 }}>active assets</div>
              </div>
              <div style={cardStyle}>
                <div style={{ fontSize: 13, color: '#666', marginBottom: 8, fontWeight: 500 }}>OVERDUE SERVICE</div>
                <div style={{ fontSize: 40, fontWeight: 800, color: overdueCount > 0 ? '#ef4444' : PRIMARY }}>{overdueCount}</div>
                <div style={{ fontSize: 13, color: '#888', marginTop: 4 }}>need attention now</div>
              </div>
              <div style={cardStyle}>
                <div style={{ fontSize: 13, color: '#666', marginBottom: 8, fontWeight: 500 }}>DUE WITHIN 30 DAYS</div>
                <div style={{ fontSize: 40, fontWeight: 800, color: dueCount > 0 ? '#f59e0b' : PRIMARY }}>{dueCount}</div>
                <div style={{ fontSize: 13, color: '#888', marginTop: 4 }}>upcoming services</div>
              </div>
              <div style={cardStyle}>
                <div style={{ fontSize: 13, color: '#666', marginBottom: 8, fontWeight: 500 }}>EQUIPMENT TYPES</div>
                <div style={{ fontSize: 40, fontWeight: 800, color: PRIMARY }}>{new Set(equipment.map(e => e.equipment_type)).size}</div>
                <div style={{ fontSize: 13, color: '#888', marginTop: 4 }}>different types</div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
              <input
                placeholder="Search equipment..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ padding: '10px 16px', borderRadius: 10, border: '1.5px solid #eef2ee', fontSize: 14, outline: 'none', fontFamily: 'inherit', minWidth: 220, background: '#fff' }}
              />
              <div style={{ display: 'flex', gap: 4, background: '#fff', padding: 4, borderRadius: 12, border: '1px solid #eef2ee', flexWrap: 'wrap' }}>
                <button onClick={() => setFilterType('all')} style={{ padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 12, background: filterType === 'all' ? PRIMARY : 'transparent', color: filterType === 'all' ? '#fff' : '#666' }}>All</button>
                {EQUIPMENT_TYPES.map(t => (
                  <button key={t} onClick={() => setFilterType(t)} style={{ padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 12, background: filterType === t ? PRIMARY : 'transparent', color: filterType === t ? '#fff' : '#666', whiteSpace: 'nowrap' }}>{t}</button>
                ))}
              </div>
            </div>

            {filtered.length === 0 && (
              <div style={{ textAlign: 'center', padding: 80 }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>🔧</div>
                <div style={{ fontSize: 20, fontWeight: 600, color: '#333', marginBottom: 8 }}>No equipment yet</div>
                <div style={{ color: '#888', marginBottom: 24 }}>Add your first piece of equipment to start tracking services.</div>
                <button onClick={() => setShowAddEquipment(true)} style={{ padding: '12px 28px', background: PRIMARY, color: '#fff', border: 'none', borderRadius: 12, fontWeight: 700, cursor: 'pointer', fontSize: 15 }}>Add Equipment</button>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 20 }}>
              {filtered.map(e => {
                const nextService = getNextService(e.id);
                const days = daysUntil(nextService);
                const color = serviceStatusColor(days);
                const lastLog = (logs[e.id] || [])[0];
                return (
                  <div key={e.id} onClick={() => setSelectedEquipment(e)} style={{ background: '#fff', borderRadius: 20, border: `1.5px solid ${days !== null && days < 0 ? '#fca5a5' : days !== null && days <= 30 ? '#fde68a' : '#eef2ee'}`, overflow: 'hidden', cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                    {e.photo_url ? (
                      <img src={e.photo_url} alt={e.name} style={{ width: '100%', height: 160, objectFit: 'cover' }} />
                    ) : (
                      <div style={{ width: '100%', height: 160, background: 'linear-gradient(135deg, #f0f4f0, #e8f5e9)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 64 }}>
                        {typeIcon(e.equipment_type)}
                      </div>
                    )}
                    <div style={{ padding: 20 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                        <div>
                          <div style={{ fontWeight: 700, color: '#333', fontSize: 15 }}>{e.name}</div>
                          <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{e.equipment_type}</div>
                        </div>
                        {e.asset_number && <span style={{ fontSize: 11, color: '#666', background: '#f0f4f0', padding: '3px 8px', borderRadius: 6, fontWeight: 600 }}>{e.asset_number}</span>}
                      </div>
                      {(e.make || e.model) && <div style={{ fontSize: 12, color: '#aaa', marginBottom: 12 }}>{[e.make, e.model].filter(Boolean).join(' ')}</div>}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12, borderTop: '1px solid #f0f4f0' }}>
                        <div>
                          <div style={{ fontSize: 11, color: '#aaa' }}>Next Service</div>
                          <div style={{ fontSize: 13, fontWeight: 700, color }}>{serviceStatusLabel(days)}</div>
                        </div>
                        {lastLog && (
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: 11, color: '#aaa' }}>Last Service</div>
                            <div style={{ fontSize: 12, color: '#666' }}>{new Date(lastLog.service_date).toLocaleDateString('en-ZA')}</div>
                          </div>
                        )}
                      </div>
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
