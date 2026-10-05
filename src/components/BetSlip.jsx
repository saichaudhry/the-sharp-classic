import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { fmtPrice, money, profitOn, impliedProb, kickoff } from '../format.js';

const QUICK = [10, 25, 50, 100];
const MAX_STAKE = 500; // matches the server check in api/picks.js

export default function BetSlip({ game, team, bankroll, onClose, onPlaced, onStale }) {
  const [stake, setStake] = useState('25');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  const price = game.prices[team];
  const opponent = team === game.home ? game.away : game.home;
  const amount = Number(stake);
  const valid = Number.isFinite(amount) && amount >= 1 && amount <= Math.min(bankroll, MAX_STAKE);
  const toWin = valid ? profitOn(amount, price) : 0;

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function submit(e) {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      const data = await api('picks', {
        method: 'POST',
        body: { sport: game.sport, eventId: game.id, team, stake: amount },
      });
      onPlaced(data, { team, stake: amount, context: { sport: game.sport, gameId: game.id } });
    } catch (err) {
      if (err.status === 409) return onStale();
      setError(err.message);
      setBusy(false);
    }
  }

  let hint = null;
  if (stake !== '' && !valid) {
    if (amount > bankroll) hint = `You only have ${money(bankroll)}.`;
    else if (amount > MAX_STAKE) hint = `Max stake is ${money(MAX_STAKE)}.`;
    else hint = 'Minimum stake is $1.';
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal slip" onClick={(e) => e.stopPropagation()} onSubmit={submit} aria-label="Bet slip">
        <div className="slip-head">
          <div>
            <div className="muted small">{kickoff(game.commence)} · vs {opponent}</div>
            <h3>{team}</h3>
          </div>
          <span className={`price big ${price > 0 ? 'dog' : 'fav'}`}>{fmtPrice(price)}</span>
        </div>

        <p className="muted small">
          Kalshi: <strong>{game.cents?.[team] ?? Math.round(impliedProb(price) * 100)}%</strong> to win.
        </p>

        <label htmlFor="stake" className="small">Stake (play money)</label>
        <div className="stake-row">
          <span className="dollar">$</span>
          <input
            id="stake"
            ref={inputRef}
            inputMode="decimal"
            value={stake}
            onChange={(e) => setStake(e.target.value.replace(/[^\d.]/g, ''))}
          />
        </div>
        <div className="chips">
          {QUICK.map((q) => (
            <button type="button" key={q} className="chip" disabled={q > bankroll} onClick={() => setStake(String(q))}>
              ${q}
            </button>
          ))}
          <button type="button" className="chip" onClick={() => setStake(String(Math.floor(Math.min(bankroll, MAX_STAKE))))}>
            Max
          </button>
        </div>

        <div className="slip-summary">
          <div><span className="muted">To win</span><strong className="win">{money(toWin)}</strong></div>
          <div><span className="muted">Total payout</span><strong>{money(valid ? amount + toWin : 0)}</strong></div>
        </div>

        {(hint || error) && <p className="form-error" role="alert">{error || hint}</p>}

        <div className="slip-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={!valid || busy}>{busy ? 'Placing…' : 'Lock it in'}</button>
        </div>
      </form>
    </div>
  );
}
