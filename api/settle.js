// POST /api/settle -> grade this player's finished games and pay out.
// The frontend calls this on page load, so results show up next visit.
// Results come from Kalshi: we look up the market for the team the player
// took, and a finalized market's result is "yes" (that team won) or "no".
import { db, handle, unwrap } from './_lib/db.js';
import { requirePlayer, round2, STARTING_BANKROLL } from './_lib/player.js';
import { marketFor, resultOf } from './_lib/odds.js';
import { loadProfile } from './me.js';

const REFUND_AFTER_DAYS = 4; // never got a result (cancelled game): give the stake back

// Profit on a winning bet at American odds.
export function profitOn(stake, price) {
  return price > 0 ? stake * (price / 100) : stake * (100 / -price);
}

// Turns a Kalshi result into our pick result. Exported so it's easy to test.
export function grade(pick, result) {
  const stake = Number(pick.stake);
  if (result === 'yes') return { status: 'won', payout: round2(stake + profitOn(stake, pick.price)) };
  if (result === 'no') return { status: 'lost', payout: 0 };
  if (result === 'void') return { status: 'push', payout: stake };
  return null;
}

export default handle({
  async POST(req) {
    const player = await requirePlayer(req);
    const settled = [];

    const pending = unwrap(
      await db().from('picks').select('*')
        .eq('player_id', player.id).eq('status', 'pending')
        .lt('commence_time', new Date().toISOString()),
    );

    for (const pick of pending) {
      // If Kalshi is down, skip this pick for now. It stays open until the next visit.
      const market = await marketFor(pick).catch((err) => {
        console.error(`[settle] ${pick.event_id}:`, err.message);
        return null;
      });
      let outcome = grade(pick, resultOf(market));

      const ageDays = (Date.now() - new Date(pick.commence_time)) / 86_400_000;
      if (!outcome && ageDays > REFUND_AFTER_DAYS) outcome = { status: 'push', payout: Number(pick.stake) };
      if (!outcome) continue;

      const { data: ok } = await db().rpc('settle_pick', {
        p_pick: pick.id, p_status: outcome.status, p_payout: outcome.payout,
      });
      if (ok) settled.push({ ...pick, ...outcome });
    }

    // Busted with nothing left in play? Lou spots you a fresh bankroll (and remembers it).
    const fresh = await requirePlayer(req);
    if (Number(fresh.bankroll) < 1) {
      const { count } = await db().from('picks').select('id', { count: 'exact', head: true })
        .eq('player_id', player.id).eq('status', 'pending');
      if (count === 0) {
        await db().from('players')
          .update({ bankroll: STARTING_BANKROLL, rebuys: fresh.rebuys + 1 })
          .eq('id', player.id).lt('bankroll', 1);
      }
    }

    return { settled, ...(await loadProfile(await requirePlayer(req))) };
  },
});
