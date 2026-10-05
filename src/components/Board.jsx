import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useApp } from '../context.js';
import { fmtPrice, kickoff, impliedProb } from '../format.js';
import BetSlip from './BetSlip.jsx';

export const SPORTS = [
  { id: 'nfl', label: 'NFL' },
  { id: 'ncaaf', label: 'College FB' },
  { id: 'mlb', label: 'MLB' },
  { id: 'nba', label: 'NBA' },
];

const SPORT_KEY = 'the-sharp:sport';

// Groups games under "Today", "Tomorrow", "Sat, Oct 10" headers (college has dozens).
function byDay(games) {
  const groups = new Map();
  for (const g of games) {
    const d = new Date(g.commence);
    const today = new Date();
    const diff = Math.round((new Date(d.toDateString()) - new Date(today.toDateString())) / 86_400_000);
    const label = diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(g);
  }
  return [...groups];
}

const compact = (n) => new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
const savedSport = () => {
  try { return SPORTS.find((s) => s.id === localStorage.getItem(SPORT_KEY))?.id || 'nfl'; } catch { return 'nfl'; }
};

export default function Board() {
  const { player, onPlaced } = useApp();
  const [sport, setSport] = useState(savedSport);
  const [state, setState] = useState({ status: 'loading', games: [] });
  const [slip, setSlip] = useState(null); // { game, team }
  const [reload, setReload] = useState(0);

  useEffect(() => {
    try { localStorage.setItem(SPORT_KEY, sport); } catch { /* ignore */ }
    let cancelled = false; // ignore a slow response if the user already switched sports
    setState((s) => ({ ...s, status: 'loading' }));
    api(`odds?sport=${sport}`)
      .then((d) => !cancelled && setState({ status: 'ready', games: d.games }))
      .catch((err) => !cancelled && setState({ status: 'error', games: [], error: err.message }));
    return () => { cancelled = true; };
  }, [sport, reload]);

  return (
    <div className="board">
      <div className="section-head">
        <h2>The Board</h2>
        <span className="tag" title="Live prices from Kalshi's public market data">Kalshi live</span>
      </div>

      <div className="sport-tabs" role="tablist">
        {SPORTS.map((s) => (
          <button
            key={s.id}
            role="tab"
            aria-selected={sport === s.id}
            className={sport === s.id ? 'active' : ''}
            onClick={() => setSport(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>

      {state.status === 'loading' && (
        <div className="games">{[0, 1, 2].map((i) => <div key={i} className="game skeleton" />)}</div>
      )}

      {state.status === 'error' && (
        <div className="empty">
          <p>{state.error}</p>
          <button className="btn" onClick={() => setReload((n) => n + 1)}>Retry</button>
        </div>
      )}

      {state.status === 'ready' && state.games.length === 0 && (
        <div className="empty">
          <p>No {SPORTS.find((s) => s.id === sport).label} games this week.</p>
        </div>
      )}

      {state.status === 'ready' && byDay(state.games).map(([day, games]) => (
        <div key={day} className="day-group">
          <h3 className="day-head">{day} <span className="muted small">{games.length} game{games.length > 1 ? 's' : ''}</span></h3>
          <div className="games">
          {games.map((g) => (
            <article key={g.id} className="game">
              <div className="game-meta">
                <span>{kickoff(g.commence)}</span>
                <span className="muted">{g.volume ? `$${compact(g.volume)} traded` : g.book}</span>
              </div>
              {[g.away, g.home].map((team) => (
                <button key={team} className="side" onClick={() => setSlip({ game: g, team })}>
                  <span className="team">
                    {team}
                    {team === g.home && <small className="muted"> home</small>}
                  </span>
                  <span className="prob muted">{g.cents?.[team] ?? Math.round(impliedProb(g.prices[team]) * 100)}¢</span>
                  <span className={`price ${g.prices[team] > 0 ? 'dog' : 'fav'}`}>{fmtPrice(g.prices[team])}</span>
                </button>
              ))}
              <Link className="game-link" to={`/game/${sport}/${encodeURIComponent(g.id)}`}>
                Matchup <span aria-hidden="true">›</span>
              </Link>
            </article>
          ))}
          </div>
        </div>
      ))}

      {slip && (
        <BetSlip
          {...slip}
          bankroll={Number(player.bankroll)}
          onClose={() => setSlip(null)}
          onPlaced={(data, pick) => { setSlip(null); onPlaced(data, pick); }}
          onStale={() => { setSlip(null); setReload((n) => n + 1); }}
        />
      )}
    </div>
  );
}
