import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { emitAck } from '../socket';
import { useStore } from '../store';

export default function LogChat() {
  const tab = useStore(s => s.activeTab);
  const setTab = useStore(s => s.setActiveTab);
  const unread = useStore(s => s.unreadChat);
  return (
    <div className="card flex h-64 flex-col overflow-hidden lg:h-auto lg:flex-1">
      <div className="flex border-b border-black/5">
        <TabBtn active={tab === 'log'} onClick={() => setTab('log')}>📜 Registro</TabBtn>
        <TabBtn active={tab === 'chat'} onClick={() => setTab('chat')}>
          💬 Chat {unread > 0 && <span className="ml-1 rounded-full bg-py-red px-1.5 text-[10px] text-white">{unread}</span>}
        </TabBtn>
      </div>
      {tab === 'log' ? <Log /> : <Chat />}
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`flex-1 py-2 text-sm font-semibold ${active ? 'border-b-2 border-py-red text-py-red' : 'text-ink/50'}`}>{children}</button>
  );
}

function Log() {
  const events = useStore(s => s.events);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.scrollTo({ top: ref.current.scrollHeight }); }, [events.length]);
  return (
    <div ref={ref} className="scroll-thin flex-1 space-y-1 overflow-y-auto p-3 text-sm">
      {events.map((e, i) => (
        <div key={i} className={`rounded-lg px-2 py-1 ${e.type === 'turn' ? 'bg-cream font-semibold' : ''} ${e.type === 'card' ? 'bg-yellow-50' : ''} ${e.type === 'bankrupt' || e.type === 'game_over' ? 'bg-red-50 font-semibold' : ''}`}>
          {e.text}
        </div>
      ))}
    </div>
  );
}

function Chat() {
  const chat = useStore(s => s.chat);
  const me = useStore(s => s.playerId);
  const [text, setText] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.scrollTo({ top: ref.current.scrollHeight }); }, [chat.length]);

  async function send() {
    const t = text.trim();
    if (!t) return;
    setText('');
    try { await emitAck('chat:send', { text: t }); } catch (e) { toast.error((e as Error).message); }
  }

  return (
    <>
      <div ref={ref} className="scroll-thin flex-1 space-y-1 overflow-y-auto p-3 text-sm">
        {chat.length === 0 && <p className="text-ink/40">Todavía no hay mensajes. ¡Saludá!</p>}
        {chat.map(m => (
          <div key={m.id} className={`rounded-lg px-2 py-1 ${m.playerId === me ? 'bg-blue-50' : m.playerId ? 'bg-cream' : 'text-ink/50 italic'}`}>
            {m.playerId && <b>{m.name}: </b>}{m.text}
          </div>
        ))}
      </div>
      <div className="flex gap-2 border-t border-black/5 p-2">
        <input className="input !py-1.5 text-sm" placeholder="Escribí un mensaje…" maxLength={300} value={text}
          onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} />
        <button className="btn-blue btn-sm" onClick={send}>Enviar</button>
      </div>
    </>
  );
}
