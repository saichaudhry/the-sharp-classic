import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import LouAvatar, { moodFor } from './LouAvatar.jsx';

const MAX_CHARS = 500; // matches api/chat.js
const QUICK_PROMPTS = ['Roast my record.', 'Best bet this week?', 'Grade my last pick.'];

export default function Sharp({ stats, picks, draft, onDraftUsed }) {
  const [messages, setMessages] = useState(null); // null = loading history
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const logRef = useRef(null);
  const inputRef = useRef(null);
  const contextRef = useRef(null); // which game the next question is about, if any

  useEffect(() => {
    api('chat')
      .then((d) => setMessages(d.messages))
      .catch(() => setMessages([]));
  }, []);

  // "Ask Lou" from the bet toast pre-fills the box.
  useEffect(() => {
    if (draft) {
      setInput(draft.text);
      contextRef.current = draft.context;
      onDraftUsed();
      inputRef.current?.focus();
    }
  }, [draft, onDraftUsed]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  async function send(text) {
    const message = text.trim();
    if (!message || busy) return;
    setBusy(true);
    setError(null);
    setInput('');
    setMessages((m) => [...(m || []), { role: 'user', content: message }]);
    const context = contextRef.current;
    contextRef.current = null;
    try {
      const { reply } = await api('chat', { method: 'POST', body: { message, ...(context && { context }) } });
      setMessages((m) => [...m, { role: 'assistant', content: reply }]);
    } catch (err) {
      // Put their message back so they don't lose it.
      setMessages((m) => m.slice(0, -1));
      setInput(message);
      contextRef.current = context;
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const mood = busy ? 'thinking' : moodFor(stats, picks);

  return (
    <div className="sharp">
      <div className="sharp-head">
        <LouAvatar mood={mood} size={56} />
        <div>
          <h2>Lou “The Sharp”</h2>
          <p className="muted small">{busy ? 'Lou is thinking…' : 'Retired oddsmaker. Remembers everything.'}</p>
        </div>
      </div>

      <div className="chat-log" ref={logRef} aria-live="polite">
        {messages === null && <div className="spinner small" />}
        {messages?.length === 0 && (
          <div className="bubble assistant">
            Sit down, kid. I remember every bet you make.
          </div>
        )}
        {messages?.map((m, i) => (
          <div key={i} className={`bubble ${m.role}`}>{m.content}</div>
        ))}
        {busy && <div className="bubble assistant typing"><span /><span /><span /></div>}
      </div>

      {messages?.length < 4 && !busy && (
        <div className="quick-prompts">
          {QUICK_PROMPTS.map((q) => (
            <button key={q} className="chip" onClick={() => send(q)}>{q}</button>
          ))}
        </div>
      )}

      {error && <p className="form-error" role="alert">{error}</p>}

      <form className="chat-input" onSubmit={(e) => { e.preventDefault(); send(input); }}>
        <textarea
          ref={inputRef}
          rows={1}
          placeholder="Ask Lou…"
          maxLength={MAX_CHARS}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); }
          }}
        />
        <button className="btn primary" disabled={busy || !input.trim()} aria-label="Send">Send</button>
      </form>
      {input.length > MAX_CHARS - 80 && <p className="muted small counter">{input.length}/{MAX_CHARS}</p>}
    </div>
  );
}
