'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

const PRIMARY = '#1a5c38';
const DARK = '#0a1f12';

type Profile = {
  id: string;
  full_name: string;
  role: string;
  store_id: string | null;
  organisation_id: string | null;
};

type Conversation = {
  id: string;
  participant_1: string;
  participant_2: string;
  last_message: string | null;
  last_message_at: string | null;
  other_user: Profile | null;
  unread: number;
};

type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  message: string;
  created_at: string;
  read_at: string | null;
};

const roleLabel = (role: string) => {
  switch (role) {
    case 'platform_admin': return 'Platform Admin';
    case 'franchisor_admin': return 'Franchisor';
    case 'franchisee_owner': return 'Franchisee Owner';
    case 'store_manager': return 'Store Manager';
    case 'staff': return 'Staff';
    default: return role;
  }
};

const roleColor = (role: string) => {
  switch (role) {
    case 'franchisor_admin': return '#7c3aed';
    case 'franchisee_owner': return PRIMARY;
    case 'store_manager': return '#0369a1';
    case 'staff': return '#6b7280';
    default: return '#333';
  }
};

export default function ChatPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<Profile | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showNewChat, setShowNewChat] = useState(false);
  const [contacts, setContacts] = useState<Profile[]>([]);
  const [searchContact, setSearchContact] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { checkAuthAndLoad(); }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (!currentUser) return;
    const channel = supabase
      .channel('chat-live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `recipient_id=eq.${currentUser.id}` }, (payload: any) => {
        const incomingConvId = payload.new?.conversation_id;
        // Soft sound — only play when inside chat window
        try {
          const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain); gain.connect(ctx.destination);
          osc.frequency.setValueAtTime(880, ctx.currentTime);
          osc.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.1);
          gain.gain.setValueAtTime(0.15, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
          osc.start(); osc.stop(ctx.currentTime + 0.3);
        } catch {}
        loadConversations(currentUser.id);
        // If this message is in the open conversation, load it immediately
        if (selectedConv && incomingConvId === selectedConv.id) {
          loadMessages(selectedConv.id, currentUser.id);
        }
        // Browser notification if tab not focused
        if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
          new Notification('CompliTrack — New message', {
            body: payload.new?.message?.startsWith('[PHOTO]:') ? '📷 Shared a photo' : payload.new?.message ?? 'New message',
            icon: '/favicon.ico',
          });
        }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, () => {
        loadConversations(currentUser.id);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chat_messages' }, () => {
        if (selectedConv) loadMessages(selectedConv.id, currentUser.id);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, () => {
        loadConversations(currentUser.id);
      })
      .subscribe();
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
    return () => { supabase.removeChannel(channel); };
  }, [currentUser, selectedConv]);

  async function checkAuthAndLoad() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push('/login'); return; }
    const { data: profile } = await supabase.from('profiles').select('id, full_name, role, store_id, organisation_id').eq('id', user.id).single();
    if (!profile) { router.push('/login'); return; }
    setCurrentUser(profile);
    await loadConversations(profile.id);
    await loadContacts(profile);
    setLoading(false);
  }

  async function loadConversations(userId: string) {
    const { data: convs } = await supabase
      .from('conversations')
      .select('*')
      .or(`participant_1.eq.${userId},participant_2.eq.${userId}`)
      .order('last_message_at', { ascending: false, nullsFirst: false });

    if (!convs) return;

    const enriched = await Promise.all(convs.map(async (c) => {
      const otherId = c.participant_1 === userId ? c.participant_2 : c.participant_1;
      const { data: otherProfile } = await supabase
        .from('profiles').select('id, full_name, role, store_id, organisation_id').eq('id', otherId).single();
      // Load store name for this contact
      let storeName: string | null = null;
      if (otherProfile?.store_id) {
        const { data: store } = await supabase.from('stores').select('name').eq('id', otherProfile.store_id).single();
        storeName = store?.name || null;
      }
      const { count: unread } = await supabase
        .from('chat_messages')
        .select('*', { count: 'exact', head: true })
        .eq('conversation_id', c.id)
        .eq('recipient_id', userId)
        .is('read_at', null);
      return { ...c, other_user: otherProfile, store_name: storeName, unread: unread || 0 };
    }));

    setConversations(enriched);
  }

  async function loadContacts(profile: Profile) {
    if (!profile.organisation_id) return;
    // Load all profiles in the same organisation (except self)
    const { data: allProfiles } = await supabase
      .from('profiles')
      .select('id, full_name, role, store_id, organisation_id')
      .neq('id', profile.id)
      .eq('organisation_id', profile.organisation_id)
      .eq('is_active', true)
      .order('full_name');
    setContacts(allProfiles || []);

    // For franchisor/owner: auto-create conversations with all store managers
    // so they appear in the sidebar without needing to "New Chat" first
    const isFranchisor = profile.role === 'franchisor_owner' || profile.role === 'franchisor' || profile.role === 'owner';
    if (isFranchisor && allProfiles?.length) {
      const storeManagers = allProfiles.filter(p =>
        p.role === 'store_manager' || p.role === 'manager' || p.role === 'franchisee_owner'
      );
      for (const manager of storeManagers) {
        // Check if conversation already exists
        const { data: existing } = await supabase
          .from('conversations')
          .select('id')
          .or(`and(participant_1.eq.${profile.id},participant_2.eq.${manager.id}),and(participant_1.eq.${manager.id},participant_2.eq.${profile.id})`)
          .maybeSingle();
        if (!existing) {
          // Auto-create conversation so it shows in sidebar
          await supabase.from('conversations').insert({
            participant_1: profile.id,
            participant_2: manager.id,
            last_message: null,
            last_message_at: new Date().toISOString(),
          });
        }
      }
      // Reload conversations to show newly created ones
      loadConversations(profile.id);
    }
  }

  async function loadMessages(convId: string, userId: string) {
    const { data } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('conversation_id', convId)
      .order('created_at');
    setMessages(data || []);
    await supabase
      .from('chat_messages')
      .update({ read_at: new Date().toISOString() })
      .eq('conversation_id', convId)
      .eq('recipient_id', userId)
      .is('read_at', null);
    if (currentUser) loadConversations(currentUser.id);
  }

  async function selectConversation(conv: Conversation) {
    setSelectedConv(conv);
    if (currentUser) await loadMessages(conv.id, currentUser.id);
  }

  async function startNewConversation(contact: Profile) {
    if (!currentUser) return;
    const { data: existing } = await supabase
      .from('conversations')
      .select('*')
      .or(`and(participant_1.eq.${currentUser.id},participant_2.eq.${contact.id}),and(participant_1.eq.${contact.id},participant_2.eq.${currentUser.id})`)
      .single();

    if (existing) {
      const conv = { ...existing, other_user: contact, unread: 0 };
      setSelectedConv(conv);
      await loadMessages(existing.id, currentUser.id);
    } else {
      const { data: newConv } = await supabase
        .from('conversations')
        .insert({ participant_1: currentUser.id, participant_2: contact.id })
        .select()
        .single();
      if (newConv) {
        const conv = { ...newConv, other_user: contact, unread: 0 };
        setSelectedConv(conv);
        await loadConversations(currentUser.id);
      }
    }
    setShowNewChat(false);
    setSearchContact('');
  }

  async function sendMessage() {
    if (!newMessage.trim() || !selectedConv || !currentUser) return;
    setSending(true);
    const recipientId = selectedConv.participant_1 === currentUser.id ? selectedConv.participant_2 : selectedConv.participant_1;
    await supabase.from('chat_messages').insert({
      conversation_id: selectedConv.id,
      sender_id: currentUser.id,
      recipient_id: recipientId,
      message: newMessage.trim(),
    });
    await supabase.from('conversations').update({
      last_message: newMessage.trim(),
      last_message_at: new Date().toISOString(),
    }).eq('id', selectedConv.id);
    setNewMessage('');
    await loadMessages(selectedConv.id, currentUser.id);
    setSending(false);
  }

  const filteredContacts = contacts.filter(c =>
    c.full_name.toLowerCase().includes(searchContact.toLowerCase()) ||
    roleLabel(c.role).toLowerCase().includes(searchContact.toLowerCase())
  );

  const totalUnread = conversations.reduce((sum, c) => sum + c.unread, 0);

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', fontFamily: 'system-ui, sans-serif' }}>

      <div style={{ background: `linear-gradient(135deg, ${DARK}, ${PRIMARY})`, padding: '0 32px', flexShrink: 0 }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 64 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={() => router.push('/dashboard')} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 14 }}>Back</button>
            <span style={{ color: '#fff', fontWeight: 700, fontSize: 18 }}>Messages</span>
            {totalUnread > 0 && <span style={{ background: '#ef4444', color: '#fff', borderRadius: 20, padding: '2px 8px', fontSize: 12, fontWeight: 700 }}>{totalUnread}</span>}
          </div>
          <button onClick={() => setShowNewChat(true)} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>New Message</button>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', maxWidth: 1200, margin: '0 auto', width: '100%' }}>

        {/* Conversations List */}
        <div style={{ width: 320, borderRight: '1px solid #eef2ee', display: 'flex', flexDirection: 'column', background: '#fff', flexShrink: 0 }}>
          <div style={{ padding: '16px', borderBottom: '1px solid #eef2ee' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#666' }}>CONVERSATIONS</div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {loading && <div style={{ padding: 24, color: '#aaa', textAlign: 'center' }}>Loading...</div>}
            {!loading && conversations.length === 0 && (
              <div style={{ padding: 24, color: '#aaa', textAlign: 'center', fontSize: 14 }}>No conversations yet. Start one with New Message.</div>
            )}
            {conversations.map(conv => (
              <div key={conv.id} onClick={() => selectConversation(conv)} style={{ padding: '14px 16px', cursor: 'pointer', borderBottom: '1px solid #f5f5f5', background: selectedConv?.id === conv.id ? '#f0f7f2' : '#fff', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 42, height: 42, borderRadius: '50%', background: roleColor(conv.other_user?.role || ''), display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 16, flexShrink: 0 }}>
                  {conv.other_user?.full_name?.[0] || '?'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                    <span style={{ fontWeight: conv.unread > 0 ? 700 : 600, color: '#333', fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{conv.other_user?.full_name || 'Unknown'}</span>
                    {conv.last_message_at && <span style={{ fontSize: 11, color: '#aaa', flexShrink: 0 }}>{new Date(conv.last_message_at).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}</span>}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: '#aaa', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{conv.last_message || 'No messages yet'}</span>
                    {conv.unread > 0 && <span style={{ background: PRIMARY, color: '#fff', borderRadius: 20, padding: '1px 7px', fontSize: 11, fontWeight: 700, flexShrink: 0, marginLeft: 6 }}>{conv.unread}</span>}
                  </div>
                  <div style={{ fontSize: 11, color: roleColor(conv.other_user?.role || ''), marginTop: 2, fontWeight: 500 }}>{roleLabel(conv.other_user?.role || '')}{(conv as any).store_name ? ` · 🏪 ${(conv as any).store_name}` : ''}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Messages Area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#f8faf8' }}>
          {!selectedConv ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: 48 }}>💬</div>
              <div style={{ fontSize: 18, fontWeight: 600, color: '#333' }}>Select a conversation</div>
              <div style={{ fontSize: 14, color: '#aaa' }}>or start a new one with the button above</div>
            </div>
          ) : (
            <>
              <div style={{ padding: '16px 24px', borderBottom: '1px solid #eef2ee', background: '#fff', display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: roleColor(selectedConv.other_user?.role || ''), display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 16 }}>
                  {selectedConv.other_user?.full_name?.[0] || '?'}
                </div>
                <div>
                  <div style={{ fontWeight: 700, color: '#333', fontSize: 15 }}>{selectedConv.other_user?.full_name}</div>
                  <div style={{ fontSize: 12, color: roleColor(selectedConv.other_user?.role || ''), fontWeight: 500 }}>{roleLabel(selectedConv.other_user?.role || '')}</div>
                </div>
              </div>

              <div style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                {messages.length === 0 && (
                  <div style={{ textAlign: 'center', color: '#ccc', fontSize: 14, marginTop: 40 }}>No messages yet. Say hello!</div>
                )}
                {messages.map(msg => {
                  const isMe = msg.sender_id === currentUser?.id;
                  const isPhoto = msg.message.startsWith('[PHOTO]:');
                  const photoUrl = isPhoto ? msg.message.replace('[PHOTO]:', '').split('\n')[0].trim() : null;
                  const photoCaption = isPhoto ? msg.message.split('\n').slice(1).join('\n').trim() : null;
                  return (
                    <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start' }}>
                      <div style={{ background: isMe ? PRIMARY : '#fff', color: isMe ? '#fff' : '#333', padding: isPhoto ? '8px 8px 10px' : '10px 16px', borderRadius: isMe ? '18px 18px 4px 18px' : '18px 18px 18px 4px', maxWidth: '65%', fontSize: 14, lineHeight: 1.5, boxShadow: '0 1px 4px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
                        {isPhoto && photoUrl ? (
                          <>
                            <img src={photoUrl} alt="compliance photo" onClick={() => window.open(photoUrl, '_blank')} style={{ width: '100%', borderRadius: 10, objectFit: 'cover', maxHeight: 220, cursor: 'zoom-in', display: 'block' }} />
                            {photoCaption && <div style={{ marginTop: 6, fontSize: 13, padding: '0 4px' }}>{photoCaption}</div>}
                          </>
                        ) : (
                          msg.message
                        )}
                      </div>
                      <div style={{ fontSize: 11, color: '#ccc', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                        {new Date(msg.created_at).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}
                        {isMe && msg.read_at && <span style={{ color: PRIMARY }}>Read</span>}
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              <div style={{ padding: '16px 24px', borderTop: '1px solid #eef2ee', background: '#fff', display: 'flex', gap: 12 }}>
                <input
                  value={newMessage}
                  onChange={e => setNewMessage(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                  placeholder={`Message ${selectedConv.other_user?.full_name}...`}
                  style={{ flex: 1, padding: '12px 16px', borderRadius: 12, border: '1.5px solid #eef2ee', fontSize: 14, outline: 'none', fontFamily: 'inherit', background: '#f8faf8' }}
                />
                <button onClick={sendMessage} disabled={sending || !newMessage.trim()} style={{ padding: '12px 24px', background: newMessage.trim() ? PRIMARY : '#eee', color: newMessage.trim() ? '#fff' : '#aaa', border: 'none', borderRadius: 12, fontWeight: 700, cursor: newMessage.trim() ? 'pointer' : 'default', fontSize: 14, fontFamily: 'inherit' }}>Send</button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* New Chat Modal */}
      {showNewChat && (
        <div onClick={() => setShowNewChat(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 20, width: 480, maxHeight: '70vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #eef2ee', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 700, fontSize: 16, color: '#333' }}>New Message</span>
              <button onClick={() => setShowNewChat(false)} style={{ background: '#f3f4f6', border: 'none', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 14, color: '#666' }}>Cancel</button>
            </div>
            <div style={{ padding: '16px 24px', borderBottom: '1px solid #eef2ee' }}>
              <input
                value={searchContact}
                onChange={e => setSearchContact(e.target.value)}
                placeholder="Search by name or role..."
                autoFocus
                style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid #eef2ee', fontSize: 14, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {filteredContacts.length === 0 && <div style={{ padding: 24, color: '#aaa', textAlign: 'center' }}>No contacts found</div>}
              {filteredContacts.map(contact => (
                <div key={contact.id} onClick={() => startNewConversation(contact)} style={{ padding: '14px 24px', cursor: 'pointer', borderBottom: '1px solid #f5f5f5', display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ width: 40, height: 40, borderRadius: '50%', background: roleColor(contact.role), display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 16, flexShrink: 0 }}>
                    {contact.full_name[0]}
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, color: '#333', fontSize: 14 }}>{contact.full_name}</div>
                    <div style={{ fontSize: 12, color: roleColor(contact.role), fontWeight: 500, marginTop: 2 }}>{roleLabel(contact.role)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
