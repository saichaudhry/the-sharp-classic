// The board's prices come from Kalshi's public market-data API
// (https://api.elections.kalshi.com/trade-api/v2). No key needed: game-winner
// prices are public. Each Kalshi game is an "event" with two markets
// ("Atlanta wins", "New Orleans wins") whose YES price in dollars is the
// market's win probability, e.g. $0.54 = 54%.
//
// Kalshi only gives short names ("New York J") and no kickoff time, so each
// event is matched to ESPN's scoreboard for that day to get full team names,
// the start time, and ESPN ids for the stats hubs.
import { scoreboard } from './espn.js';

export const SPORTS = {
  nfl:   { series: 'KXNFLGAME',   label: 'NFL' },
  ncaaf: { series: 'KXNCAAFGAME', label: 'College FB' },
  mlb:   { series: 'KXMLBGAME',   label: 'MLB' },
  nba:   { series: 'KXNBAGAME',   label: 'NBA' },
};

const KALSHI = 'https://api.elections.kalshi.com/trade-api/v2';
const CACHE_SECONDS = 60; // prices move, so keep this short
const DAYS_AHEAD = 7;
const memory = new Map();

async function kalshi(path) {
  const hit = memory.get(path);
  if (hit && Date.now() - hit.at < CACHE_SECONDS * 1000) return hit.data;

  let res;
  try {
    res = await fetch(`${KALSHI}${path}`, { headers: { 'User-Agent': 'the-sharp/1.0 (CMU 15-113 coursework)' } });
  } catch {
    throw Object.assign(new Error('Kalshi is unreachable right now. Try again soon.'), { status: 502 });
  }
  if (!res.ok) {
    throw Object.assign(new Error(res.status === 404 ? 'Market not found on Kalshi.' : 'Kalshi is having trouble. Try again soon.'), { status: res.status === 404 ? 404 : 502 });
  }
  const data = await res.json();
  memory.set(path, { at: Date.now(), data });
  return data;
}

// All open games in a series, following Kalshi's cursor pagination.
async function openEvents(series) {
  const events = [];
  let cursor = '';
  for (let page = 0; page < 5; page++) {
    const data = await kalshi(`/events?series_ticker=${series}&status=open&with_nested_markets=true&limit=200${cursor ? `&cursor=${cursor}` : ''}`);
    events.push(...(data.events || []));
    if (!data.cursor) break;
    cursor = data.cursor;
  }
  return events;
}

// "KXNFLGAME-26OCT05ATLNO" -> "20261005" (the game's date, US Eastern)
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
function tickerDate(eventTicker) {
  const m = eventTicker.split('-')[1]?.match(/^(\d{2})([A-Z]{3})(\d{2})/);
  const month = m && MONTHS.indexOf(m[2]);
  if (!m || month < 0) return null;
  return `20${m[1]}${String(month + 1).padStart(2, '0')}${m[3]}`;
}

// Price rule: pay the ask when the market is tight (spread <= 5¢);
// otherwise use the midpoint, so one thin order doesn't set a silly price.
function yesPrice(m) {
  const bid = Number(m.yes_bid_dollars) || 0;
  const ask = Number(m.yes_ask_dollars) || 0;
  if (bid > 0 && ask > 0) return ask - bid <= 0.05 ? ask : (ask + bid) / 2;
  return Number(m.last_price_dollars) || null;
}

// 0.54 -> -117, 0.40 -> +150. The rest of the app (bet slip, payouts) works in American odds.
export function toAmerican(p) {
  return p >= 0.5 ? -Math.round((100 * p) / (1 - p)) : Math.round((100 * (1 - p)) / p);
}

const norm = (s = '') => s.toLowerCase().normalize('NFD').replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();

// How well a Kalshi side ("NYJ", "New York J") matches an ESPN team. 0 = no match.
function matchScore(side, team) {
  let score = 0;
  if (side.abbr === team.abbr) score += 3;
  const n = norm(side.name);
  if (n && (norm(team.name).startsWith(n) || norm(team.short) === n)) score += 2; // "New York J" -> "New York Jets"
  else if (n && norm(team.location) && n.startsWith(norm(team.location))) score += 1; // "Chicago WS" -> "Chicago" (weak)
  return score;
}

// Turns one Kalshi event into our game shape, or null if it can't be matched.
async function toGame(sport, ev) {
  const sides = (ev.markets || []).map((m) => ({ abbr: m.ticker.split('-').pop(), name: m.yes_sub_title, market: m }));
  if (sides.length !== 2) return null;
  const date = tickerDate(ev.event_ticker);
  if (!date) return null;

  // Both Kalshi sides must match the two teams of the same ESPN game.
  const games = await scoreboard(sport, date).catch(() => []);
  let best = null;
  for (const g of games) {
    const [c1, c2] = g.competitors;
    for (const [a, b] of [[c1, c2], [c2, c1]]) {
      const s1 = matchScore(sides[0], a);
      const s2 = matchScore(sides[1], b);
      if (s1 > 0 && s2 > 0 && (!best || s1 + s2 > best.score)) best = { score: s1 + s2, game: g, teams: [a, b] };
    }
  }
  if (!best) return null;

  const probs = sides.map((s) => yesPrice(s.market));
  // Skip markets with no real price (e.g. "if necessary" playoff games nobody is trading).
  if (probs.some((p) => !p || p < 0.03 || p > 0.97) || probs[0] + probs[1] > 1.1) return null;

  const home = best.teams.find((t) => t.homeAway === 'home');
  const away = best.teams.find((t) => t.homeAway === 'away');
  const byName = (fn) => Object.fromEntries(best.teams.map((t, i) => [t.name, fn(sides[i], probs[i])]));

  return {
    id: ev.event_ticker,
    sport,
    home: home.name,
    away: away.name,
    commence: best.game.date,
    book: 'Kalshi',
    prices: byName((_, p) => toAmerican(p)),
    cents: byName((_, p) => Math.round(p * 100)),
    markets: byName((s) => s.market.ticker),
    volume: Math.round(sides.reduce((v, s) => v + (Number(s.market.volume_fp) || 0), 0)),
    espn: { eventId: best.game.id, homeId: home.id, awayId: away.id },
  };
}

// Upcoming games with prices. Games that already started are left out:
// Kalshi keeps trading during games, but you can't bet live here.
export async function getGames(sport) {
  if (!SPORTS[sport]) return [];
  const etDate = (ms) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(ms)).replaceAll('-', '');
  const today = etDate(Date.now());
  const horizon = etDate(Date.now() + DAYS_AHEAD * 86_400_000);

  const events = (await openEvents(SPORTS[sport].series)).filter((e) => {
    const d = tickerDate(e.event_ticker);
    return d && d >= today && d <= horizon;
  });
  const games = (await Promise.all(events.map((e) => toGame(sport, e).catch(() => null)))).filter(Boolean);

  const now = Date.now();
  return games
    .filter((g) => new Date(g.commence).getTime() > now)
    .sort((a, b) => new Date(a.commence) - new Date(b.commence));
}

export async function findGame(sport, eventId) {
  const games = await getGames(sport);
  return games.find((g) => g.id === eventId) || null;
}

// The Kalshi market a pick bought. A pick stores the event ticker and the full
// team name, and each event has exactly two markets, so: take the market whose
// name matches the team; if neither matches cleanly ("Chicago WS" vs "Chicago
// White Sox"), take the one that does NOT match the opponent.
export async function marketFor(pick) {
  const data = await kalshi(`/events/${encodeURIComponent(pick.event_id)}?with_nested_markets=true`);
  const markets = data.event?.markets || []; // nested markets live under event, not the top-level list
  if (markets.length !== 2) return null;
  const opponent = pick.team === pick.home_team ? pick.away_team : pick.home_team;
  const score = (m, name) => matchScore({ abbr: m.ticker.split('-').pop(), name: m.yes_sub_title }, { name, short: '', location: name.split(' ')[0], abbr: '' });
  const direct = markets.filter((m) => score(m, pick.team) >= 2);
  if (direct.length === 1) return direct[0];
  const notOpponent = markets.filter((m) => score(m, opponent) < 2);
  return notOpponent.length === 1 ? notOpponent[0] : null;
}

// How a pick's market settled: 'yes', 'no', 'void', or null if it isn't final yet.
export function resultOf(market) {
  if (!market || !['finalized', 'settled'].includes(market.status)) return null;
  if (market.result === 'yes' || market.result === 'no') return market.result;
  return 'void';
}
