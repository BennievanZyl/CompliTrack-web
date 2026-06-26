'use client';

import { useEffect, useRef, useState } from 'react';
import * as faceapi from 'face-api.js';
import { supabase } from '@/lib/supabase';

const STORE_ID = '05328298-fc27-4c9f-b091-bb7f6598b601';
const PRIMARY = '#1a5c38';
const DARK = '#0a1f12';

type Employee = {
  id: string; full_name: string; role: string;
  face_descriptor: number[] | null; clock_pin: string | null;
};
type AttendanceRecord = {
  id: string; employee_id: string; clock_in: string | null; clock_out: string | null;
};
type ClockResult = {
  type: 'in' | 'out'; employee: Employee; time: string; late: boolean;
};

function initials(name: string) { return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2); }

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

export default function ClockKioskPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [todayRecords, setTodayRecords] = useState<AttendanceRecord[]>([]);
  const [shifts, setShifts] = useState<{ start_time: string; end_time: string; day_type: string }[]>([]);
  const [mode, setMode] = useState<'idle' | 'scanning' | 'pin' | 'enrolling' | 'success' | 'error'>('idle');
  const [cameraReady, setCameraReady] = useState(false);
  const [faceApiLoaded, setFaceApiLoaded] = useState(false);
  const [loadingModels, setLoadingModels] = useState(true);
  const [result, setResult] = useState<ClockResult | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [enrollEmployee, setEnrollEmployee] = useState<Employee | null>(null);
  const [enrollStep, setEnrollStep] = useState<'select' | 'capture' | 'done'>('select');
  const [enrollSearch, setEnrollSearch] = useState('');
  const [enrollError, setEnrollError] = useState('');
  const scanningRef = useRef(false);
  const resultTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const today = new Date().toISOString().split('T')[0];

  useEffect(() => {
    loadData();
    loadFaceApi();
    startCamera();
    return () => {
      stopCamera();
      if (resultTimerRef.current) clearTimeout(resultTimerRef.current);
    };
  }, []);

  async function loadData() {
    const [empRes, recRes, shiftRes] = await Promise.all([
      supabase.from('employees').select('id, full_name, role, face_descriptor, clock_pin').eq('store_id', STORE_ID).eq('is_active', true),
      supabase.from('attendance').select('id, employee_id, clock_in, clock_out').eq('store_id', STORE_ID).eq('work_date', today),
      supabase.from('store_shifts').select('start_time, end_time, day_type').eq('store_id', STORE_ID).eq('is_active', true),
    ]);
    setEmployees(empRes.data || []);
    setTodayRecords(recRes.data || []);
    setShifts(shiftRes.data || []);
  }

  async function loadFaceApi() {
    setLoadingModels(true);
    try {
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri('/models'),
        faceapi.nets.faceLandmark68Net.loadFromUri('/models'),
        faceapi.nets.faceRecognitionNet.loadFromUri('/models'),
      ]);
      setFaceApiLoaded(true);
      console.log('✅ Face API models loaded');
    } catch (e) {
      console.error('❌ Face API failed:', e);
    }
    setLoadingModels(false);
  }

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' } });
      if (videoRef.current) { videoRef.current.srcObject = stream; setCameraReady(true); }
    } catch (e) { console.error('Camera error:', e); setCameraReady(false); }
  }

  function stopCamera() {
    if (videoRef.current?.srcObject) {
      const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
      tracks.forEach(t => t.stop());
    }
  }

  function isLate(): boolean {
    const day = new Date().getDay();
    const dayType = day === 6 ? 'saturday' : day === 0 ? 'sunday' : 'weekday';
    const now = `${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}`;
    const todayShifts = shifts.filter(s => s.day_type === dayType);
    if (!todayShifts.length) return false;
    return todayShifts.every(s => now > s.start_time);
  }

  async function performClock(employee: Employee) {
    const existingRecord = todayRecords.find(r => r.employee_id === employee.id);
    const now = new Date().toISOString();
    const late = isLate();
    if (existingRecord?.clock_in && !existingRecord?.clock_out) {
      const hours = (new Date(now).getTime() - new Date(existingRecord.clock_in).getTime()) / (1000 * 60 * 60);
      await supabase.from('attendance').update({ clock_out: now, hours_worked: hours }).eq('id', existingRecord.id);
      setResult({ type: 'out', employee, time: now, late: false });
    } else {
      await supabase.from('attendance').insert({ employee_id: employee.id, store_id: STORE_ID, work_date: today, clock_in: now, is_late: late });
      setResult({ type: 'in', employee, time: now, late });
    }
    await loadData();
    setMode('success');
    resultTimerRef.current = setTimeout(() => { setMode('idle'); setResult(null); scanningRef.current = false; }, 4000);
  }

  async function startFaceScan() {
    if (!faceApiLoaded || !cameraReady) { setMode('pin'); return; }
    setMode('scanning');
    scanningRef.current = true;
    const employeesWithFaces = employees.filter(e => e.face_descriptor);
    if (!employeesWithFaces.length) { setMode('idle'); setErrorMsg('No faces enrolled yet. Use PIN or enroll faces first.'); return; }
    let attempts = 0;
    const maxAttempts = 30;
    const scan = async () => {
      if (!scanningRef.current || attempts >= maxAttempts) {
        if (attempts >= maxAttempts) { setMode('pin'); setErrorMsg('Face not recognised. Please use your PIN.'); }
        return;
      }
      attempts++;
      try {
        if (!videoRef.current) return;
        const detection = await faceapi.detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions()).withFaceLandmarks().withFaceDescriptor();
        if (detection) {
          const labeledDescriptors = employeesWithFaces.map(e => new faceapi.LabeledFaceDescriptors(e.id, [new Float32Array(e.face_descriptor!)]));
          const faceMatcher = new faceapi.FaceMatcher(labeledDescriptors, 0.5);
          const match = faceMatcher.findBestMatch(detection.descriptor);
          if (match.label !== 'unknown') {
            const matched = employees.find(e => e.id === match.label);
            if (matched) { scanningRef.current = false; await performClock(matched); return; }
          }
        }
      } catch { /* continue scanning */ }
      if (scanningRef.current) setTimeout(scan, 500);
    };
    scan();
  }

  function cancelScan() { scanningRef.current = false; setMode('idle'); }

  async function submitPin() {
    const employee = employees.find(e => e.clock_pin === pin);
    if (!employee) { setPinError('Incorrect PIN. Please try again.'); setPin(''); return; }
    setPinError(''); setPin(''); setMode('idle');
    await performClock(employee);
  }

  async function enrollFace() {
    setEnrollError('');
    if (!enrollEmployee) { setEnrollError('Please select an employee first.'); return; }
    if (!cameraReady) { setEnrollError('Camera not available. Please allow camera access.'); return; }
    if (!faceApiLoaded) { setEnrollError('Face recognition not ready yet. Please wait.'); return; }
    setEnrollStep('capture');
    try {
      if (!videoRef.current) { setEnrollError('Camera not ready.'); setEnrollStep('select'); return; }
      const detection = await faceapi.detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions()).withFaceLandmarks().withFaceDescriptor();
      if (!detection) { setEnrollError('No face detected. Please look directly at the camera and try again.'); setEnrollStep('select'); return; }
      const descriptor = Array.from(detection.descriptor);
      await supabase.from('employees').update({ face_descriptor: descriptor }).eq('id', enrollEmployee.id);
      await loadData();
      setEnrollStep('done');
      setTimeout(() => { setMode('idle'); setEnrollStep('select'); setEnrollEmployee(null); setEnrollError(''); }, 3000);
    } catch (e) {
      console.error('Enroll error:', e);
      setEnrollError('Failed to capture face. Please try again.');
      setEnrollStep('select');
    }
  }

  function pinKeyPress(key: string) {
    if (key === '←') { setPin(p => p.slice(0, -1)); return; }
    if (pin.length >= 4) return;
    const newPin = pin + key;
    setPin(newPin);
    if (newPin.length === 4) { setTimeout(() => submitPin(), 100); }
  }

  const filteredEnrollEmployees = employees.filter(e => e.full_name.toLowerCase().includes(enrollSearch.toLowerCase()));

  return (
    <div style={{ minHeight: '100vh', background: DARK, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, sans-serif', padding: 24 }}>

      <div style={{ position: 'fixed' as const, top: 0, left: 0, right: 0, padding: '16px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M3 9L7 13L15 5" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
          <span style={{ color: '#fff', fontWeight: 700, fontSize: 18 }}>CompliTrack</span>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14 }}>{new Date().toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })} · {new Date().toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
          <button onClick={() => { setMode('enrolling'); setEnrollStep('select'); setEnrollEmployee(null); setEnrollError(''); }} style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.7)', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 12 }}>👤 Enroll Face</button>
          <button onClick={() => { window.location.href = '/attendance'; }} style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.7)', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 12 }}>← Back</button>
        </div>
      </div>

      <video ref={videoRef} autoPlay muted playsInline style={{ position: 'fixed' as const, top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.15, zIndex: 0 }} />
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {mode === 'idle' && (
        <div style={{ position: 'relative' as const, zIndex: 1, textAlign: 'center' as const, maxWidth: 480, width: '100%' }}>
          <div style={{ fontSize: 80, marginBottom: 20 }}>🕐</div>
          <h1 style={{ color: '#fff', fontSize: 36, fontWeight: 900, margin: '0 0 8px', letterSpacing: -1 }}>Clock In / Out</h1>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 16, margin: '0 0 40px' }}>Choose how to clock in</p>
          {errorMsg && (
            <div style={{ background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 12, padding: '12px 20px', marginBottom: 24, color: '#fca5a5', fontSize: 14, fontWeight: 600 }}>
              {errorMsg}
              <button onClick={() => setErrorMsg('')} style={{ marginLeft: 12, background: 'none', border: 'none', color: '#fca5a5', cursor: 'pointer', fontSize: 16 }}>✕</button>
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {faceApiLoaded && cameraReady && (
              <button onClick={startFaceScan} style={{ width: '100%', padding: '18px', background: PRIMARY, color: '#fff', border: 'none', borderRadius: 16, fontWeight: 800, cursor: 'pointer', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                <span style={{ fontSize: 28 }}>😊</span> Face Recognition
              </button>
            )}
            <button onClick={() => { setMode('pin'); setPin(''); setPinError(''); setErrorMsg(''); }} style={{ width: '100%', padding: '18px', background: 'rgba(255,255,255,0.1)', color: '#fff', border: '2px solid rgba(255,255,255,0.2)', borderRadius: 16, fontWeight: 700, cursor: 'pointer', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
              <span style={{ fontSize: 28 }}>🔢</span> Enter PIN
            </button>
          </div>
          <div style={{ marginTop: 20, fontSize: 13 }}>
            {loadingModels && <span style={{ color: 'rgba(255,255,255,0.4)' }}>⏳ Loading face recognition...</span>}
            {!loadingModels && faceApiLoaded && <span style={{ color: 'rgba(74,222,128,0.7)' }}>✅ Face recognition ready</span>}
            {!loadingModels && !faceApiLoaded && <span style={{ color: 'rgba(255,255,255,0.3)' }}>PIN mode only</span>}
          </div>
          {todayRecords.filter(r => r.clock_in && !r.clock_out).length > 0 && (
            <div style={{ marginTop: 40, textAlign: 'left' as const }}>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: 600, marginBottom: 10, letterSpacing: 0.5 }}>ON SHIFT NOW</div>
              <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 8 }}>
                {todayRecords.filter(r => r.clock_in && !r.clock_out).map(r => {
                  const emp = employees.find(e => e.id === r.employee_id);
                  if (!emp) return null;
                  const rc = ROLE_COLORS[emp.role] || { bg: '#f5f5f5', color: '#424242' };
                  return (
                    <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.1)', borderRadius: 10, padding: '6px 12px' }}>
                      <div style={{ width: 28, height: 28, borderRadius: '50%', background: rc.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: rc.color }}>{initials(emp.full_name)}</div>
                      <span style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>{emp.full_name.split(' ')[0]}</span>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ade80' }} />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {mode === 'scanning' && (
        <div style={{ position: 'relative' as const, zIndex: 1, textAlign: 'center' as const, maxWidth: 480, width: '100%' }}>
          <div style={{ width: 200, height: 200, borderRadius: '50%', border: '4px solid #4ade80', margin: '0 auto 32px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: 180, height: 180, borderRadius: '50%', border: '2px solid rgba(74,222,128,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 64 }}>😊</span>
            </div>
          </div>
          <h2 style={{ color: '#fff', fontSize: 28, fontWeight: 800, margin: '0 0 8px' }}>Looking for your face...</h2>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 15, margin: '0 0 32px' }}>Please look directly at the camera</p>
          <button onClick={cancelScan} style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', borderRadius: 12, padding: '12px 28px', cursor: 'pointer', fontSize: 15, fontWeight: 600 }}>Use PIN instead</button>
        </div>
      )}

      {mode === 'pin' && (
        <div style={{ position: 'relative' as const, zIndex: 1, textAlign: 'center' as const, maxWidth: 360, width: '100%' }}>
          <h2 style={{ color: '#fff', fontSize: 28, fontWeight: 800, margin: '0 0 8px' }}>Enter Your PIN</h2>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, margin: '0 0 32px' }}>4-digit PIN to clock in or out</p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginBottom: 32 }}>
            {[0, 1, 2, 3].map(i => (
              <div key={i} style={{ width: 20, height: 20, borderRadius: '50%', background: i < pin.length ? '#4ade80' : 'rgba(255,255,255,0.2)', transition: 'background 0.2s' }} />
            ))}
          </div>
          {pinError && <div style={{ color: '#fca5a5', fontSize: 14, marginBottom: 16, fontWeight: 600 }}>{pinError}</div>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', '←', '0', '✓'].map(key => (
              <button key={key} onClick={() => key === '✓' ? submitPin() : pinKeyPress(key)} style={{ height: 70, background: key === '✓' ? PRIMARY : key === '←' ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.1)', border: `1px solid ${key === '✓' ? PRIMARY : 'rgba(255,255,255,0.15)'}`, borderRadius: 14, color: '#fff', fontSize: 22, fontWeight: 700, cursor: 'pointer' }}>
                {key}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => { setMode('idle'); setPin(''); setPinError(''); }} style={{ flex: 1, padding: '12px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', borderRadius: 12, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>Back</button>
            {faceApiLoaded && cameraReady && (
              <button onClick={startFaceScan} style={{ flex: 1, padding: '12px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', borderRadius: 12, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>😊 Use Face</button>
            )}
          </div>
        </div>
      )}

      {mode === 'success' && result && (
        <div style={{ position: 'relative' as const, zIndex: 1, textAlign: 'center' as const, maxWidth: 480, width: '100%' }}>
          <div style={{ width: 120, height: 120, borderRadius: '50%', background: result.type === 'in' ? '#22c55e' : '#ef4444', margin: '0 auto 28px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 0 60px ${result.type === 'in' ? 'rgba(34,197,94,0.5)' : 'rgba(239,68,68,0.5)'}` }}>
            <span style={{ fontSize: 60 }}>{result.type === 'in' ? '✅' : '👋'}</span>
          </div>
          <h1 style={{ color: '#fff', fontSize: 40, fontWeight: 900, margin: '0 0 8px' }}>{result.type === 'in' ? 'Clocked In!' : 'Clocked Out!'}</h1>
          <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 22, fontWeight: 700, margin: '0 0 8px' }}>{result.employee.full_name}</p>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 16, margin: '0 0 20px' }}>{new Date(result.time).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}</p>
          {result.late && result.type === 'in' && (
            <div style={{ background: 'rgba(245,158,11,0.2)', border: '1px solid rgba(245,158,11,0.4)', borderRadius: 12, padding: '10px 20px', color: '#fbbf24', fontSize: 14, fontWeight: 700 }}>⚠️ Late Arrival</div>
          )}
        </div>
      )}

      {mode === 'enrolling' && (
        <div style={{ position: 'relative' as const, zIndex: 1, textAlign: 'center' as const, maxWidth: 520, width: '100%' }}>
          <h2 style={{ color: '#fff', fontSize: 28, fontWeight: 800, margin: '0 0 8px' }}>Enroll Face</h2>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, margin: '0 0 28px' }}>Register an employee&apos;s face for recognition</p>
          {enrollStep === 'select' && (
            <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 20, padding: 24 }}>
              <input placeholder="Search employee..." value={enrollSearch} onChange={e => setEnrollSearch(e.target.value)} style={{ width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.1)', color: '#fff', fontSize: 14, outline: 'none', marginBottom: 16, boxSizing: 'border-box' as const }} />
              <div style={{ maxHeight: 280, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                {filteredEnrollEmployees.map(emp => {
                  const rc = ROLE_COLORS[emp.role] || { bg: '#f5f5f5', color: '#424242' };
                  const hasFace = !!emp.face_descriptor;
                  return (
                    <div key={emp.id} onClick={() => setEnrollEmployee(emp)} style={{ display: 'flex', alignItems: 'center', gap: 12, background: enrollEmployee?.id === emp.id ? 'rgba(26,92,56,0.5)' : 'rgba(255,255,255,0.05)', borderRadius: 12, padding: '12px 16px', cursor: 'pointer', border: `1.5px solid ${enrollEmployee?.id === emp.id ? PRIMARY : 'rgba(255,255,255,0.1)'}` }}>
                      <div style={{ width: 40, height: 40, borderRadius: '50%', background: rc.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, color: rc.color, flexShrink: 0 }}>{initials(emp.full_name)}</div>
                      <div style={{ flex: 1, textAlign: 'left' as const }}>
                        <div style={{ color: '#fff', fontWeight: 600, fontSize: 14 }}>{emp.full_name}</div>
                        <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>{emp.role}</div>
                      </div>
                      {hasFace && <span style={{ fontSize: 11, color: '#4ade80', fontWeight: 700, padding: '2px 8px', background: 'rgba(74,222,128,0.2)', borderRadius: 20 }}>✓ Enrolled</span>}
                      {enrollEmployee?.id === emp.id && !hasFace && <span style={{ fontSize: 11, color: '#fff', fontWeight: 700, padding: '2px 8px', background: 'rgba(255,255,255,0.2)', borderRadius: 20 }}>Selected</span>}
                    </div>
                  );
                })}
              </div>
              {enrollError && (
                <div style={{ background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, color: '#fca5a5', fontSize: 13, fontWeight: 600, textAlign: 'left' as const }}>{enrollError}</div>
              )}
              <div style={{ marginBottom: 16, fontSize: 12, textAlign: 'left' as const }}>
                {!cameraReady && <div style={{ color: 'rgba(239,68,68,0.7)' }}>⚠️ Camera not available</div>}
                {cameraReady && !faceApiLoaded && loadingModels && <div style={{ color: 'rgba(255,255,255,0.4)' }}>⏳ Loading face recognition models...</div>}
                {cameraReady && !faceApiLoaded && !loadingModels && <div style={{ color: 'rgba(239,68,68,0.7)' }}>⚠️ Face recognition not available</div>}
                {cameraReady && faceApiLoaded && <div style={{ color: 'rgba(74,222,128,0.7)' }}>✅ Camera ready · Face recognition ready</div>}
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => { setMode('idle'); setEnrollEmployee(null); setEnrollSearch(''); setEnrollError(''); }} style={{ flex: 1, padding: '12px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', borderRadius: 12, cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
                <button onClick={enrollFace} disabled={!enrollEmployee} style={{ flex: 2, padding: '12px', background: enrollEmployee ? PRIMARY : 'rgba(255,255,255,0.1)', color: enrollEmployee ? '#fff' : 'rgba(255,255,255,0.3)', border: 'none', borderRadius: 12, cursor: enrollEmployee ? 'pointer' : 'not-allowed', fontWeight: 700, fontSize: 15 }}>
                  📸 Capture Face
                </button>
              </div>
            </div>
          )}
          {enrollStep === 'capture' && (
            <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 20, padding: 40 }}>
              <div style={{ fontSize: 64, marginBottom: 16 }}>📸</div>
              <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 18, fontWeight: 600, margin: '0 0 8px' }}>Capturing face for {enrollEmployee?.full_name}...</p>
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, margin: 0 }}>Please look directly at the camera and keep still</p>
            </div>
          )}
          {enrollStep === 'done' && (
            <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 20, padding: 40 }}>
              <div style={{ fontSize: 64, marginBottom: 16 }}>✅</div>
              <h3 style={{ color: '#fff', fontSize: 24, fontWeight: 800, margin: '0 0 8px' }}>Face Enrolled!</h3>
              <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 15, margin: 0 }}>{enrollEmployee?.full_name} can now clock in using face recognition</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
