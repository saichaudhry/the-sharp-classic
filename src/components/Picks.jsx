import { useState } from 'react';
import { Link } from 'react-router-dom';
import { fmtPrice, money, kickoff, profitOn } from '../format.js';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'pending', label: 'Open' },
  { id: 'settled', label: 'Settled' },
];

export default function Picks({ picks }) {
  const [filter, setFilter] = useState('all');
  const shown = picks.filter((p) =>
    filter === 'all' ? true : filter === 'pending' ? p.status === 'pending' : p.status !== 'pending',
  );

  return (
    <div className="picks">
      <div className="section-head">
        <h2>My Picks</h2>
        <div className="seg">
          {FILTERS.map((f) => (
            <button key={f.id} className={filter === f.id ? 'active' : ''} onClick={() => setFilter(f.id)}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="empty">
          <p>{picks.length ? 'Nothing here.' : 'No picks yet.'}</p>
        </div>
      ) : (
        <ul className="pick-list">
          {shown.map((p) => {
            const opponent = p.team === p.home_team ? p.away_team : p.home_team;
            const net = p.status === 'pending' ? profitOn(Number(p.stake), p.price) : Number(p.payout) - Number(p.stake);
            return (
              <li key={p.id} className={`pick ${p.status}`}>
                <div className="pick-main">
                  <Link to={`/team/${p.sport}/${encodeURIComponent(p.team)}`} className="pick-team">{p.team}</Link>{' '}
                  <span className="price-inline">{fmtPrice(p.price)}</span>
                  <div className="muted small">
                    vs {opponent} · {kickoff(p.commence_time)}
                    {p.status === 'pending' && new Date(p.commence_time) > new Date() && (
                      <> · <Link to={`/game/${p.sport}/${encodeURIComponent(p.event_id)}`}>matchup ›</Link></>
                    )}
                  </div>
                </div>
                <div className="pick-side">
                  <span className={`status ${p.status}`}>{p.status === 'pending' ? 'open' : p.status}</span>
                  <div className="small">
                    {money(p.stake)}{' '}
                    <span className={p.status === 'lost' ? 'loss' : p.status === 'won' ? 'win' : 'muted'}>
                      {p.status === 'pending' ? `to win ${money(net)}` : money(net, { sign: true })}
                    </span>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
