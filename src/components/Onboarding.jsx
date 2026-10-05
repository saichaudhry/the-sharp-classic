import { useState } from 'react';
import { api, newPlayerId, forgetPlayer } from '../api.js';
import LouAvatar from './LouAvatar.jsx';

export default function Onboarding({ onReady }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    setError(null);
    newPlayerId();
    try {
      onReady(await api('me', { method: 'POST', body: { name: name.trim() } }));
    } catch (err) {
      forgetPlayer();
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="center-screen onboarding">
      <div className="panel onboard-card">
        <LouAvatar mood="neutral" size={112} />
        <h1>The Sharp</h1>
        <p className="lede">
          <strong>$1,000 in play money.</strong> Lou, a retired Vegas oddsmaker, remembers every pick.
        </p>
        <form onSubmit={submit} className="onboard-form">
          <label htmlFor="name">What should Lou call you?</label>
          <div className="row">
            <input
              id="name"
              autoFocus
              maxLength={24}
              autoComplete="nickname"
              placeholder="e.g. Parlay Pete"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <button className="btn primary" disabled={!name.trim() || busy}>
              {busy ? 'Opening…' : 'Pull up a chair'}
            </button>
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
        </form>
        <p className="fine">Play money only.</p>
      </div>
    </div>
  );
}
