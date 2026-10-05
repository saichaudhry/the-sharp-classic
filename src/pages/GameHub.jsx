import { Fragment, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useApp } from '../context.js';
import { fmtPrice, impliedProb, kickoff } from '../format.js';
import BetSlip from '../components/BetSlip.jsx';
import { FormStrip, Headshot, HubState, HubTabs, InjuryList, StatBars, TeamLogo, UpcomingList } from '../components/hub.jsx';
import { distinct, readable } from '../colors.js';

export default function GameHub() {
  const { sport, id } = useParams();
  const { player, onPlaced, askLou } = useApp();
  const [state, setState] = useState({ status: 'loading' });
  const [slip, setSlip] = useState(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    api(`game?sport=${sport}&id=${encodeURIComponent(id)}`)
      .then((d) => !cancelled && setState({ status: 'ready', ...d }))
      .catch((err) => !cancelled && setState({ status: 'error', error: err.message }));
    return () => { cancelled = true; };
  }, [sport, id, reload]);

  if (state.status !== 'ready') return <HubState state={state} retry={() => setReload((n) => n + 1)} what="game" />;

  const { line, home, away, event } = state;
  // Fallbacks so the page still renders if ESPN didn't recognise a team.
  const side = (t, name) => t || { name, abbr: name.split(' ').pop().slice(0, 3).toUpperCase(), color: '#2b3a31', record: {}, injuries: [], recent: [], schedule: [], keyStats: [] };
  const H = side(home, line.home);
  const A = side(away, line.away);
  const ac = readable(A.color, A.altColor);
  const hc = distinct(ac, readable(H.color, H.altColor), H.altColor);
  const live = event?.status?.state === 'in';
  const started = event?.status?.state && event.status.state !== 'pre';

  // Pair up the headline stats both teams have.
  const statRows = A.keyStats
    .map((s) => {
      const other = H.keyStats.find((x) => x.key === s.key);
      return other ? { label: s.label, a: s.value, b: other.value, lowerIsBetter: s.lowerIsBetter } : null;
    })
    .filter(Boolean);
  const pointRows = A.record.pointsFor != null && H.record.pointsFor != null ? [
    { label: 'Avg points scored', a: A.record.pointsFor.toFixed(1), b: H.record.pointsFor.toFixed(1) },
    { label: 'Avg points allowed', a: A.record.pointsAgainst.toFixed(1), b: H.record.pointsAgainst.toFixed(1), lowerIsBetter: true },
  ] : [];

  const injuriesFor = (t) => (event && t.id && event.injuries[t.id]) || t.injuries.map((p) => ({ ...p, status: p.injury }));
  const injuryCount = injuriesFor(A).length + injuriesFor(H).length;
  const leaders = (t) => event?.leaders.find((l) => l.teamId === t.id)?.categories || [];

  const tabs = [
    {
      id: 'matchup', label: 'Matchup',
      render: () => (
        <>
          <section className="hub-section">
            <h3>Tale of the tape</h3>
            <StatBars left={{ abbr: A.abbr, color: ac }} right={{ abbr: H.abbr, color: hc }} rows={[...pointRows, ...statRows]} />
            {A.statsSeason && <p className="muted small">Regular-season stats, {A.statsSeason}.</p>}
          </section>
          <section className="hub-section two-col">
            {[A, H].map((t) => (
              <div key={t.name} className="team-mini">
                <div className="team-mini-head">
                  <TeamLogo src={t.logo} alt={t.abbr} size={28} />
                  {t.id ? <Link to={`/team/${sport}/${t.id}`}>{t.name}</Link> : <strong>{t.name}</strong>}
                </div>
                <dl className="facts">
                  <dt>Record</dt><dd>{t.record.overall || '-'}</dd>
                  {t.record.splits?.map((s) => <Fragment key={s.label}><dt>{s.label}</dt><dd>{s.value}</dd></Fragment>)}
                  <dt>Standing</dt><dd>{t.standing || '-'}</dd>
                  <dt>Head coach</dt><dd>{t.coach ? `${t.coach.name}${t.coach.experience ? ` (${t.coach.experience} yrs)` : ''}` : '-'}</dd>
                </dl>
              </div>
            ))}
          </section>
        </>
      ),
    },
    {
      id: 'injuries', label: 'Injuries', count: injuryCount,
      render: () => (
        <section className="hub-section two-col">
          {[A, H].map((t) => (
            <div key={t.name}>
              <h3 className="team-h3"><TeamLogo src={t.logo} alt={t.abbr} size={22} /> {t.name}</h3>
              <InjuryList injuries={injuriesFor(t)} />
            </div>
          ))}
        </section>
      ),
    },
    {
      id: 'form', label: 'Form',
      render: () => (
        <section className="hub-section two-col">
          {[A, H].map((t) => (
            <div key={t.name}>
              <h3 className="team-h3"><TeamLogo src={t.logo} alt={t.abbr} size={22} /> Last 5</h3>
              <FormStrip games={t.recent} sport={sport} />
              <h4 className="muted">Up next</h4>
              <UpcomingList games={t.schedule.filter((g) => !g.result).slice(0, 3)} sport={sport} />
            </div>
          ))}
        </section>
      ),
    },
    {
      id: 'leaders', label: started ? 'Box leaders' : 'Leaders', hidden: !event?.leaders.length,
      render: () => (
        <section className="hub-section two-col">
          {[A, H].map((t) => (
            <div key={t.name}>
              <h3 className="team-h3"><TeamLogo src={t.logo} alt={t.abbr} size={22} /> {t.abbr}</h3>
              <ul className="leaders">
                {leaders(t).map((l) => (
                  <li key={l.label}>
                    <Headshot src={l.headshot} name={l.name} size={40} />
                    <div><span className="muted small">{l.label}</span><strong>{l.name}</strong><span className="small">{l.value}</span></div>
                  </li>
                ))}
                {!leaders(t).length && <li className="muted small">No leaders yet.</li>}
              </ul>
            </div>
          ))}
        </section>
      ),
    },
    {
      id: 'box', label: 'Team stats', hidden: !event?.comparison.length,
      render: () => (
        <section className="hub-section">
          <table className="compare-table">
            <thead><tr><th>{A.abbr}</th><th /><th>{H.abbr}</th></tr></thead>
            <tbody>
              {event.comparison.map((r, i) => (
                <tr key={`${r.label}-${i}`}><td>{r.values[A.id] ?? '-'}</td><th scope="row">{r.label}</th><td>{r.values[H.id] ?? '-'}</td></tr>
              ))}
            </tbody>
          </table>
        </section>
      ),
    },
    {
      id: 'news', label: 'News', hidden: !event?.news.length,
      render: () => (
        <ul className="news">
          {event.news.map((n) => (
            <li key={n.url || n.headline}>
              <a href={n.url} target="_blank" rel="noreferrer">{n.headline}</a>
              {n.published && <span className="muted small">{new Date(n.published).toLocaleDateString()}</span>}
            </li>
          ))}
        </ul>
      ),
    },
  ];

  return (
    <div className="hub">
      <Link to="/" className="back">‹ Board</Link>

      <header className="hub-hero game-hero" style={{ '--c1': ac, '--c2': hc }}>
        <HeroTeam team={A} sport={sport} score={started ? event.scores[A.id] : null} />
        <div className="hero-mid">
          {live ? <span className="live-dot">LIVE · {event.status.detail}</span>
            : started ? <span className="final">{event.status.detail}</span>
            : <span className="kick">{kickoff(line.commence)}</span>}
          <span className="at">@</span>
          {event?.venue && <span className="muted small">{event.venue.name}{event.venue.city ? `, ${event.venue.city}` : ''}</span>}
          {(event?.broadcast || event?.weather) && (
            <span className="muted small">{[event.broadcast, event.weather && `${event.weather.temp}°${event.weather.text ? ` ${event.weather.text}` : ''}`].filter(Boolean).join(' · ')}</span>
          )}
        </div>
        <HeroTeam team={H} sport={sport} score={started ? event.scores[H.id] : null} home />
      </header>

      <section className="bet-strip">
        {[line.away, line.home].map((team) => (
          <button key={team} className="bet-side" onClick={() => setSlip({ game: line, team })} disabled={started}>
            <span className="small muted">{team === line.home ? 'Home' : 'Away'} · {started ? 'betting closed' : `Kalshi ${line.cents?.[team] ?? Math.round(impliedProb(line.prices[team]) * 100)}¢`}</span>
            <span className="bet-team">{team}</span>
            <span className={`price big ${line.prices[team] > 0 ? 'dog' : 'fav'}`}>{fmtPrice(line.prices[team])}</span>
          </button>
        ))}
        <div className="line-info small">
          <span className="muted">{line.book}{line.volume ? ` · $${line.volume.toLocaleString()} traded` : ''}</span>
          {event?.line && (
            <span>
              {event.line.provider}: {event.line.details}
              {event.line.overUnder != null && ` · O/U ${event.line.overUnder}`}
            </span>
          )}
          <button className="btn small" onClick={() => askLou(`Break down ${line.away} at ${line.home} for me. Who's the value side?`, { sport, gameId: line.id })}>
            Ask Lou about this game
          </button>
        </div>
      </section>

      {!event && (
        <p className="muted small notice">
          ESPN game page unavailable. Showing season data.
        </p>
      )}

      <HubTabs tabs={tabs} />

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

function HeroTeam({ team, sport, score, home }) {
  const body = (
    <>
      <TeamLogo src={team.logo} alt={team.abbr} size={72} />
      <span className="hero-name">{team.short || team.name}</span>
      <span className="muted small">{team.record.overall || ''}{home ? ' · home' : ''}</span>
      {score != null && <span className="hero-score">{score}</span>}
    </>
  );
  return team.id
    ? <Link to={`/team/${sport}/${team.id}`} className="hero-team">{body}</Link>
    : <div className="hero-team">{body}</div>;
}
