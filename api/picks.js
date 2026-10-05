// POST /api/picks {sport, eventId, team, stake} -> place a play-money pick
//
// The client only says WHICH game and side. The price comes from our own
// (cached) copy of the Kalshi prices, so nobody can POST themselves +10000 odds.
import { db, handle, HttpError } from './_lib/db.js';
import { requirePlayer } from './_lib/player.js';
import { findGame, SPORTS } from './_lib/odds.js';
import { loadProfile } from './me.js';

const MAX_STAKE = 500;

export default handle({
  async POST(req) {
    const player = await requirePlayer(req);
    const { sport, eventId, team } = req.body || {};
    const stake = Math.round(Number(req.body?.stake) * 100) / 100;

    if (!SPORTS[sport] || typeof eventId !== 'string') throw new HttpError(400, 'Bad game.');
    if (!Number.isFinite(stake) || stake < 1) throw new HttpError(400, 'Minimum stake is $1.');
    if (stake > MAX_STAKE) throw new HttpError(400, `Max stake is $${MAX_STAKE}. Lou has limits.`);
    if (stake > Number(player.bankroll)) throw new HttpError(400, "You don't have that much.");

    const game = await findGame(sport, eventId);
    if (!game) throw new HttpError(409, 'That game is no longer on the board (it may have started).');
    if (team !== game.home && team !== game.away) throw new HttpError(400, 'Pick one of the two teams.');

    const { error } = await db().rpc('place_pick', {
      p_player: player.id, p_event: game.id, p_sport: sport,
      p_home: game.home, p_away: game.away, p_commence: game.commence,
      p_team: team, p_price: game.prices[team], p_stake: stake,
    });
    if (error?.message?.includes('INSUFFICIENT_FUNDS')) throw new HttpError(400, "You don't have that much.");
    if (error) throw error;

    return loadProfile(await requirePlayer(req));
  },
});
