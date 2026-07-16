'use client';

import { useEffect, useState, useRef } from 'react';
import { getStoreContext } from '@/lib/store-context'
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

const STORE_ID_DEFAULT = '05328298-fc27-4c9f-b091-bb7f6598b601' // fallback only;
const PRIMARY = '#1a5c38';
const DARK = '#0a1f12';
const POLL_INTERVAL = 30000;

type Session = {
  id: string;
  session_date: string;
  status: string;
  signed_off_at: string | null;
  pdf_report_url: string | null;
  started_at: string | null;
  duration_seconds: number | null;
  opened_by: string | null;
};

type ChecklistItem = {
  id: string;
  completed: boolean;
  completed_at: string | null;
  notes: string | null;
  photo_url: string | null;
  ai_photo_result: string | null;
  checklist_templates: {
    task_name: string;
    section: string;
    requires_photo: boolean;
    sort_order: number | null;
  } | null;
};

type UniformSession = {
  id: string;
  photo_url: string;
  taken_at: string;
  ai_overall_result: string | null;
  ai_notes: string | null;
};

type TempLog = {
  id: string;
  equipment_name: string;
  equipment_type: string;
  temperature_c: number;
  period: string;
  is_compliant: boolean;
  logged_at: string;
};

type Comment = {
  id: string;
  message: string;
  created_at: string;
  sender_id: string;
  profiles: { full_name: string; role: string } | null;
};

type Tab = 'checklist' | 'uniforms' | 'temperature';

function formatDuration(seconds: number): string {
  if (seconds >= 3600) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function formatElapsed(startedAt: string): string {
  const elapsed = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
  const h = Math.floor(elapsed / 3600);
  const m = Math.floor((elapsed % 3600) / 60);
  const s = elapsed % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function sortChecklist(items: ChecklistItem[]): ChecklistItem[] {
  return [...items].sort((a, b) => {
    const secA = a.checklist_templates?.section || 'General';
    const secB = b.checklist_templates?.section || 'General';
    if (secA !== secB) return secA.localeCompare(secB);
    const orderA = a.checklist_templates?.sort_order ?? 999;
    const orderB = b.checklist_templates?.sort_order ?? 999;
    if (orderA !== orderB) return orderA - orderB;
    return (a.checklist_templates?.task_name || '').localeCompare(b.checklist_templates?.task_name || '');
  });
}

export default function CompliancePage() {
  const [storeId, setStoreId] = useState('')
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [uniforms, setUniforms] = useState<UniformSession[]>([]);
  const [tempLogs, setTempLogs] = useState<TempLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('checklist');
  const [elapsed, setElapsed] = useState('00:00:00');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [lightboxTitle, setLightboxTitle] = useState('');
  const [selectedItem, setSelectedItem] = useState<ChecklistItem | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [sendingComment, setSendingComment] = useState(false);
  const [currentUser, setCurrentUser] = useState<{ id: string; role: string } | null>(null);
  const sessionRef = useRef<Session | null>(null);

  useEffect(() => {
    getStoreContext().then(ctx => { if(ctx?.storeId) setStoreId(ctx.storeId) }); checkAuthAndLoad(); }, []);
  useEffect(() => { sessionRef.current = session; }, [session]);

  useEffect(() => {
    if (!session?.started_at || session.status === 'signed_off') return;
    setElapsed(formatElapsed(session.started_at));
    const interval = setInterval(() => {
      if (sessionRef.current?.started_at) setElapsed(formatElapsed(sessionRef.current.started_at));
    }, 1000);
    return () => clearInterval(interval);
  }, [session?.started_at, session?.status]);

  useEffect(() => {
    if (!session?.id) return;
    const channel = supabase
      .channel(`compliance-${session.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'checklist_items', filter: `session_id=eq.${session.id}` }, () => loadSessionData(session.id))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_sessions', filter: `id=eq.${session.id}` }, () => loadSessionData(session.id))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'uniform_sessions', filter: `session_id=eq.${session.id}` }, () => loadSessionData(session.id))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'temperature_logs', filter: `session_id=eq.${session.id}` }, () => loadSessionData(session.id))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'compliance_comments', filter: `session_id=eq.${session.id}` }, () => {
        if (selectedItem) loadComments(selectedItem.id);
      })
      .subscribe();
    const poll = setInterval(() => loadSessionData(session.id), POLL_INTERVAL);
    return () => { supabase.removeChannel(channel); clearInterval(poll); };
  }, [session?.id, selectedItem]);

  async function checkAuthAndLoad() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push('/login'); return; }
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    setCurrentUser({ id: user.id, role: profile?.role || 'staff' });
    await loadData();
  }

  async function loadData() {
    setLoading(true);
    const today = new Date().toISOString().split('T')[0];
    // Use maybeSingle replaced with limit — handles multiple sessions gracefully
    // Prefer in_progress session, fallback to most recent
    const { data: sessions } = await supabase
      .from('daily_sessions')
      .select('*')
      .eq('store_id', storeId)
      .eq('session_date', today)
      .eq('session_type', 'daily')
      .order('created_at', { ascending: false });
    // Pick in_progress first, otherwise take the latest signed_off
    const sessionData = sessions?.find(s => s.status === 'in_progress') || sessions?.find(s => s.status === 'signed_off') || sessions?.[0] || null;
    setSession(sessionData);
    if (sessionData) await loadSessionData(sessionData.id);
    setLoading(false);
  }

  async function loadSessionData(sessionId: string) {
    const { data: sessionData } = await supabase.from('daily_sessions').select('*').eq('id', sessionId).single();
    if (sessionData) setSession(sessionData);
    const { data: checklistData } = await supabase
      .from('checklist_items')
      .select('*, checklist_templates(task_name, section, requires_photo, sort_order)')
      .eq('session_id', sessionId);
    setChecklist(sortChecklist(checklistData || []));
    const { data: uniformData } = await supabase.from('uniform_sessions').select('*').eq('session_id', sessionId).order('taken_at', { ascending: false });
    setUniforms(uniformData || []);
    const { data: tempData } = await supabase.from('temperature_logs').select('*').eq('session_id', sessionId).order('logged_at');
    setTempLogs(tempData || []);
    setLastUpdated(new Date());
  }

  async function loadComments(itemId: string) {
    const { data } = await supabase
      .from('compliance_comments')
      .select('*, profiles(full_name, role)')
      .eq('checklist_item_id', itemId)
      .order('created_at');
    setComments(data || []);
  }

  async function getOrCreateConversation(recipientId: string): Promise<string | null> {
    if (!currentUser) return null;
    const { data: existing } = await supabase
      .from('conversations')
      .select('id')
      .or(`and(participant_1.eq.${currentUser.id},participant_2.eq.${recipientId}),and(participant_1.eq.${recipientId},participant_2.eq.${currentUser.id})`)
      .maybeSingle();
    if (existing) return existing.id;
    const { data: newConv, error } = await supabase
      .from('conversations')
      .insert({ participant_1: currentUser.id, participant_2: recipientId })
      .select()
      .single();
    if (error) { console.error('[compliance] conversation create error', error.message); return null; }
    return newConv?.id || null;
  }

  async function sharePhotoToChat(photoUrl: string, taskName: string, caption?: string) {
    if (!session || !currentUser) return;
    const recipientId = session.opened_by;
    if (!recipientId || recipientId === currentUser.id) return;
    const convId = await getOrCreateConversation(recipientId);
    if (!convId) return;
    const sessionDate = new Date(session.session_date).toLocaleDateString('en-ZA');
    const message = `[PHOTO]:${photoUrl}\n📋 ${taskName} — ${sessionDate}${caption ? `\n${caption}` : ''}`;
    await supabase.from('chat_messages').insert({ conversation_id: convId, sender_id: currentUser.id, recipient_id: recipientId, message });
    await supabase.from('conversations').update({ last_message: `📷 Compliance photo: ${taskName}`, last_message_at: new Date().toISOString() }).eq('id', convId);
    alert('Photo shared to chat with store manager ✓');
  }

  async function sendComment() {
    if (!newComment.trim() || !selectedItem || !session || !currentUser) return;
    setSendingComment(true);
    await supabase.from('compliance_comments').insert({
      checklist_item_id: selectedItem.id,
      session_id: session.id,
      store_id: storeId,
      sender_id: currentUser.id,
      message: newComment.trim(),
    });
    const recipientId = session.opened_by;
    if (recipientId && recipientId !== currentUser.id) {
      const convId = await getOrCreateConversation(recipientId);
      if (convId) {
        const taskName = selectedItem.checklist_templates?.task_name || 'Checklist item';
        const sessionDate = new Date(session.session_date).toLocaleDateString('en-ZA');
        const chatMessage = `Compliance query on "${taskName}" (${sessionDate}): ${newComment.trim()}`;
        await supabase.from('chat_messages').insert({ conversation_id: convId, sender_id: currentUser.id, recipient_id: recipientId, message: chatMessage });
        await supabase.from('conversations').update({ last_message: chatMessage, last_message_at: new Date().toISOString() }).eq('id', convId);
      }
    }
    setNewComment('');
    await loadComments(selectedItem.id);
    setSendingComment(false);
  }

  function openItemDetail(item: ChecklistItem) {
    setSelectedItem(item);
    loadComments(item.id);
  }

  function closeItemDetail() {
    setSelectedItem(null);
    setComments([]);
    setNewComment('');
  }

  const completed = checklist.filter(i => i.completed).length;
  const total = checklist.length;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const tempCompliant = tempLogs.filter(t => t.is_compliant).length;
  const pctColor = pct === 100 ? PRIMARY : pct >= 70 ? '#f59e0b' : '#ef4444';
  const tempColor = tempLogs.length === 0 ? '#ccc' : tempCompliant === tempLogs.length ? PRIMARY : '#ef4444';

  const sections = checklist.reduce<Record<string, ChecklistItem[]>>((acc, item) => {
    const sec = item.checklist_templates?.section || 'General';
    if (!acc[sec]) acc[sec] = [];
    acc[sec].push(item);
    return acc;
  }, {});

  const sortedSectionEntries = Object.entries(sections).sort(([a], [b]) => a.localeCompare(b));

  const cardStyle = { background: '#fff', borderRadius: 20, padding: 24, border: '1px solid #eef2ee', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' };
  const labelStyle = { fontSize: 13, color: '#666', marginBottom: 8, fontWeight: 500 as const };

  return (
    <div style={{ minHeight: '100vh', background: '#f8faf8', fontFamily: 'system-ui, sans-serif' }}>

      {lightboxUrl && (
        <div onClick={() => setLightboxUrl(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 1000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <div style={{ color: '#fff', fontSize: 14, marginBottom: 16, opacity: 0.7 }}>{lightboxTitle}</div>
          <img src={lightboxUrl} alt="inspection" style={{ maxWidth: '90vw', maxHeight: '80vh', objectFit: 'contain', borderRadius: 12 }} />
          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, marginTop: 16 }}>Tap anywhere to close</div>
        </div>
      )}

      {selectedItem && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 900, display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end' }}>
          <div style={{ background: '#fff', width: 420, height: '100vh', display: 'flex', flexDirection: 'column', boxShadow: '-4px 0 24px rgba(0,0,0,0.15)' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #eef2ee', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: PRIMARY }}>
              <div>
                <div style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>{selectedItem.checklist_templates?.task_name}</div>
                <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 2 }}>{selectedItem.checklist_templates?.section}</div>
              </div>
              <button onClick={closeItemDetail} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 14 }}>Close</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 20, background: selectedItem.completed ? '#e8f5e9' : '#fdecea', color: selectedItem.completed ? PRIMARY : '#ef4444' }}>
                    {selectedItem.completed ? 'COMPLETED' : 'INCOMPLETE'}
                  </span>
                  {selectedItem.ai_photo_result && (
                    <span style={{ fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 20, background: selectedItem.ai_photo_result === 'pass' ? '#e8f5e9' : '#fdecea', color: selectedItem.ai_photo_result === 'pass' ? PRIMARY : '#ef4444' }}>
                      AI: {selectedItem.ai_photo_result.toUpperCase()}
                    </span>
                  )}
                </div>
                {selectedItem.notes && (
                  <div style={{ background: '#f8faf8', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#666', fontStyle: 'italic', marginBottom: 12 }}>Note: {selectedItem.notes}</div>
                )}
                {selectedItem.completed_at && (
                  <div style={{ fontSize: 12, color: '#aaa' }}>Completed at {new Date(selectedItem.completed_at).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}</div>
                )}
              </div>
              {selectedItem.photo_url && (
                <div style={{ marginBottom: 24 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#333', marginBottom: 8 }}>Photo Evidence</div>
                  <div style={{ position: 'relative', cursor: 'zoom-in' }} onClick={() => { setLightboxUrl(selectedItem.photo_url!); setLightboxTitle(selectedItem.checklist_templates?.task_name || ''); }}>
                    <img src={selectedItem.photo_url} alt="evidence" style={{ width: '100%', borderRadius: 12, objectFit: 'cover', maxHeight: 280 }} />
                    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.2)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ color: '#fff', fontSize: 32, fontWeight: 300 }}>+</span>
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: '#aaa', marginTop: 6, textAlign: 'center' }}>Tap to enlarge for inspection</div>
                  <button
                    onClick={() => sharePhotoToChat(selectedItem.photo_url!, selectedItem.checklist_templates?.task_name || 'Checklist item')}
                    style={{ marginTop: 8, width: '100%', padding: '8px 12px', background: '#f0f7f4', color: PRIMARY, border: `1px solid #bbf7d0`, borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}
                  >
                    📤 Share photo to franchisee chat
                  </button>
                </div>
              )}
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#333', marginBottom: 12 }}>
                  Comments & Follow-up
                  {comments.length > 0 && <span style={{ marginLeft: 8, background: PRIMARY, color: '#fff', borderRadius: 20, padding: '2px 8px', fontSize: 11 }}>{comments.length}</span>}
                </div>
                {comments.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '24px 0', color: '#ccc', fontSize: 13 }}>No comments yet. Flag an issue below.</div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {comments.map(c => {
                    const isMe = c.sender_id === currentUser?.id;
                    return (
                      <div key={c.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start' }}>
                        <div style={{ fontSize: 11, color: '#aaa', marginBottom: 3 }}>{c.profiles?.full_name} · {c.profiles?.role}</div>
                        <div style={{ background: isMe ? PRIMARY : '#f0f4f0', color: isMe ? '#fff' : '#333', padding: '10px 14px', borderRadius: isMe ? '16px 16px 4px 16px' : '16px 16px 16px 4px', maxWidth: '85%', fontSize: 14, lineHeight: 1.4 }}>
                          {c.message}
                        </div>
                        <div style={{ fontSize: 11, color: '#ccc', marginTop: 3 }}>{new Date(c.created_at).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            <div style={{ padding: '16px 24px', borderTop: '1px solid #eef2ee', background: '#f8faf8' }}>
              {(currentUser?.role === 'franchisor_admin' || currentUser?.role === 'platform_admin') && (
                <div style={{ marginBottom: 8, fontSize: 12, color: '#888', fontStyle: 'italic' }}>This comment will also be sent as a chat message to the store manager.</div>
              )}
              <div style={{ display: 'flex', gap: 10 }}>
                <input value={newComment} onChange={e => setNewComment(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendComment()} placeholder="Flag an issue or add a comment..." style={{ flex: 1, padding: '10px 14px', borderRadius: 10, border: '1.5px solid #eef2ee', fontSize: 14, outline: 'none', fontFamily: 'inherit', background: '#fff' }} />
                <button onClick={sendComment} disabled={sendingComment || !newComment.trim()} style={{ padding: '10px 18px', background: newComment.trim() ? PRIMARY : '#eee', color: newComment.trim() ? '#fff' : '#aaa', border: 'none', borderRadius: 10, fontWeight: 700, cursor: newComment.trim() ? 'pointer' : 'default', fontSize: 14 }}>
                  {sendingComment ? '...' : 'Send'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div style={{ background: `linear-gradient(135deg, ${DARK}, ${PRIMARY})`, padding: '0 32px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 64 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={() => router.push('/dashboard')} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 14 }}>Back</button>
            <span style={{ color: '#fff', fontWeight: 700, fontSize: 18 }}>Daily Compliance</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {lastUpdated && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#4ade80', boxShadow: '0 0 6px #4ade80' }} />
                <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>Live</span>
              </div>
            )}
            <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14 }}>{new Date().toLocaleDateString('en-ZA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px' }}>

        {loading && <div style={{ textAlign: 'center', padding: 80, color: '#666' }}>Loading...</div>}

        {!loading && !session && (
          <div style={{ textAlign: 'center', padding: 80 }}>
            <div style={{ fontSize: 20, fontWeight: 600, color: '#333', marginBottom: 8 }}>No session today</div>
            <div style={{ color: '#666' }}>Open the mobile app to start a compliance session.</div>
          </div>
        )}

        {!loading && session && (
          <div>

            {session.started_at && session.status !== 'signed_off' && (
              <div style={{ background: PRIMARY, borderRadius: 16, padding: '16px 24px', marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, marginBottom: 2 }}>COMPLIANCE TIMER RUNNING</div>
                  <div style={{ color: '#fff', fontWeight: 600, fontSize: 14 }}>Started at {new Date(session.started_at).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}</div>
                </div>
                <span style={{ color: '#fff', fontWeight: 800, fontSize: 32, letterSpacing: 3 }}>{elapsed}</span>
              </div>
            )}

            {!session.started_at && session.status !== 'signed_off' && (
              <div style={{ background: '#fff8e1', borderRadius: 16, padding: '16px 24px', marginBottom: 24, border: '1px solid #fde68a' }}>
                <span style={{ color: '#92400e', fontWeight: 600, fontSize: 14 }}>Timer not started — open the mobile app and tap Start Compliance Check.</span>
              </div>
            )}

            {session.status === 'signed_off' && session.duration_seconds && (
              <div style={{ background: '#e8f5e9', borderRadius: 16, padding: '16px 24px', marginBottom: 24, border: '1px solid #c8e6c9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ color: PRIMARY, fontWeight: 600, fontSize: 15 }}>Compliance completed and signed off</span>
                <span style={{ color: PRIMARY, fontWeight: 800, fontSize: 20 }}>Completed in {formatDuration(session.duration_seconds)}</span>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 20, marginBottom: 32 }}>
              <div style={cardStyle}>
                <div style={labelStyle}>CHECKLIST</div>
                <div style={{ fontSize: 36, fontWeight: 800, color: pctColor }}>{pct}%</div>
                <div style={{ fontSize: 13, color: '#888', marginTop: 4 }}>{completed} of {total} tasks</div>
                <div style={{ marginTop: 12, height: 6, background: '#eef2ee', borderRadius: 3 }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: pctColor, borderRadius: 3 }} />
                </div>
              </div>
              <div style={cardStyle}>
                <div style={labelStyle}>STATUS</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: session.status === 'signed_off' ? PRIMARY : '#f59e0b' }}>
                  {session.status === 'signed_off' ? 'Signed Off' : 'In Progress'}
                </div>
                {session.signed_off_at && (
                  <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
                    {new Date(session.signed_off_at).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                )}
              </div>
              <div style={cardStyle}>
                <div style={labelStyle}>TIME TAKEN</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: PRIMARY }}>
                  {session.duration_seconds
                    ? formatDuration(session.duration_seconds)
                    : session.started_at && session.status !== 'signed_off'
                    ? elapsed
                    : 'Not started'}
                </div>
                <div style={{ fontSize: 13, color: '#888', marginTop: 4 }}>compliance duration</div>
              </div>
              <div style={cardStyle}>
                <div style={labelStyle}>UNIFORMS</div>
                <div style={{ fontSize: 36, fontWeight: 800, color: PRIMARY }}>{uniforms.length}</div>
                <div style={{ fontSize: 13, color: '#888', marginTop: 4 }}>photos captured</div>
              </div>
              <div style={cardStyle}>
                <div style={labelStyle}>TEMPERATURE</div>
                <div style={{ fontSize: 36, fontWeight: 800, color: tempColor }}>{tempLogs.length === 0 ? '-' : `${tempCompliant}/${tempLogs.length}`}</div>
                <div style={{ fontSize: 13, color: '#888', marginTop: 4 }}>readings compliant</div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: '#fff', padding: 4, borderRadius: 14, border: '1px solid #eef2ee', width: 'fit-content' }}>
              {(['checklist', 'uniforms', 'temperature'] as Tab[]).map(tab => (
                <button key={tab} onClick={() => setActiveTab(tab)} style={{ padding: '8px 20px', borderRadius: 10, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 14, background: activeTab === tab ? PRIMARY : 'transparent', color: activeTab === tab ? '#fff' : '#666' }}>
                  {tab === 'checklist' ? 'Checklist' : tab === 'uniforms' ? 'Uniforms' : 'Temperature'}
                </button>
              ))}
            </div>

            {activeTab === 'checklist' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                {checklist.length === 0 && <div style={{ textAlign: 'center', padding: 60, color: '#888' }}>No checklist items yet.</div>}
                {sortedSectionEntries.map(([section, items]) => {
                  const secDone = items.filter(i => i.completed).length;
                  return (
                    <div key={section} style={{ background: '#fff', borderRadius: 20, border: '1px solid #eef2ee', overflow: 'hidden' }}>
                      <div style={{ padding: '16px 24px', background: '#f8faf8', borderBottom: '1px solid #eef2ee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 700, color: '#333' }}>{section}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <div style={{ width: 80, height: 6, background: '#eef2ee', borderRadius: 3 }}>
                            <div style={{ height: '100%', width: `${items.length > 0 ? (secDone / items.length) * 100 : 0}%`, background: secDone === items.length ? PRIMARY : '#f59e0b', borderRadius: 3 }} />
                          </div>
                          <span style={{ fontSize: 13, color: secDone === items.length ? PRIMARY : '#888', fontWeight: 600 }}>{secDone}/{items.length}</span>
                        </div>
                      </div>
                      {items.map((item, idx) => (
                        <div key={item.id} onClick={() => openItemDetail(item)} style={{ padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 14, borderBottom: idx < items.length - 1 ? '1px solid #f0f4f0' : 'none', cursor: 'pointer' }}>
                          <div style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, background: item.completed ? PRIMARY : '#eef2ee', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 14, fontWeight: 700 }}>
                            {item.completed ? 'v' : ''}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 500, color: item.completed ? '#333' : '#888', fontSize: 14 }}>{item.checklist_templates?.task_name || 'Unknown task'}</div>
                            {item.notes && <div style={{ fontSize: 12, color: '#888', fontStyle: 'italic', marginTop: 2 }}>Note: {item.notes}</div>}
                            {item.ai_photo_result && <div style={{ fontSize: 12, marginTop: 4, color: item.ai_photo_result === 'pass' ? PRIMARY : '#ef4444', fontWeight: 600 }}>AI: {item.ai_photo_result}</div>}
                          </div>
                          {item.completed_at && <div style={{ fontSize: 11, color: '#bbb', whiteSpace: 'nowrap' }}>{new Date(item.completed_at).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}</div>}
                          {item.photo_url && (
                            <div style={{ position: 'relative' }} onClick={e => { e.stopPropagation(); setLightboxUrl(item.photo_url!); setLightboxTitle(item.checklist_templates?.task_name || ''); }}>
                              <img src={item.photo_url} alt="task" style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover', border: '2px solid #eef2ee' }} />
                              <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.3)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <span style={{ color: '#fff', fontSize: 18, fontWeight: 300 }}>+</span>
                              </div>
                            </div>
                          )}
                          <span style={{ color: '#ddd', fontSize: 16 }}>›</span>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}

            {activeTab === 'uniforms' && (
              <div>
                {uniforms.length === 0 && <div style={{ textAlign: 'center', padding: 60, color: '#888' }}>No uniform photos today.</div>}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 20 }}>
                  {uniforms.map(u => (
                    <div key={u.id} style={{ background: '#fff', borderRadius: 20, border: '1px solid #eef2ee', overflow: 'hidden' }}>
                      <div style={{ position: 'relative', cursor: 'zoom-in' }} onClick={() => { setLightboxUrl(u.photo_url); setLightboxTitle('Uniform Check'); }}>
                        <img src={u.photo_url} alt="uniform" style={{ width: '100%', height: 220, objectFit: 'cover' }} />
                        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <span style={{ color: '#fff', fontSize: 32, fontWeight: 300 }}>+</span>
                        </div>
                      </div>
                      <div style={{ padding: 16 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                          <span style={{ fontSize: 13, color: '#666' }}>{new Date(u.taken_at).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}</span>
                          {u.ai_overall_result && <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: u.ai_overall_result === 'pass' ? '#e8f5e9' : '#fdecea', color: u.ai_overall_result === 'pass' ? PRIMARY : '#ef4444' }}>{u.ai_overall_result.toUpperCase()}</span>}
                        </div>
                        {u.ai_notes && <div style={{ fontSize: 13, color: '#666', lineHeight: 1.4 }}>{u.ai_notes}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'temperature' && (
              <div style={{ background: '#fff', borderRadius: 20, border: '1px solid #eef2ee', overflow: 'hidden' }}>
                {tempLogs.length === 0 && <div style={{ textAlign: 'center', padding: 60, color: '#888' }}>No temperature logs today.</div>}
                {tempLogs.map((log, idx) => (
                  <div key={log.id} style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 16, borderBottom: idx < tempLogs.length - 1 ? '1px solid #f0f4f0' : 'none' }}>
                    <div style={{ width: 48, height: 48, borderRadius: 12, flexShrink: 0, background: log.is_compliant ? '#e8f5e9' : '#fdecea', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 18, color: log.is_compliant ? PRIMARY : '#ef4444' }}>T</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, color: '#333', fontSize: 14 }}>{log.equipment_name}</div>
                      <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{log.period} - {log.equipment_type}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 22, fontWeight: 800, color: log.is_compliant ? PRIMARY : '#ef4444' }}>{log.temperature_c}C</div>
                      <div style={{ fontSize: 11, color: log.is_compliant ? PRIMARY : '#ef4444', fontWeight: 600 }}>{log.is_compliant ? 'COMPLIANT' : 'OUT OF RANGE'}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {session.pdf_report_url && (
              <div style={{ marginTop: 32, textAlign: 'center' }}>
                <a href={session.pdf_report_url} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', padding: '14px 32px', background: PRIMARY, color: '#fff', borderRadius: 12, fontWeight: 700, textDecoration: 'none', fontSize: 15 }}>Download PDF Report</a>
              </div>
            )}

          </div>
        )}
      </div>
    </div>
  );
}

