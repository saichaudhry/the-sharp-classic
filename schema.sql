-- The Sharp: database schema
-- Paste this whole file into Supabase -> SQL Editor -> Run.
-- The browser never talks to Supabase directly. Only the serverless functions
-- in /api do, using the service-role key, so every table has RLS turned on
-- with no policies (the public anon key can't read or write anything).

create table if not exists players (
  id          uuid primary key,              -- random UUID generated in the browser
  name        text not null check (char_length(name) between 1 and 24),
  bankroll    numeric(12,2) not null default 1000 check (bankroll >= 0),
  rebuys      int not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists picks (
  id             bigint generated always as identity primary key,
  player_id      uuid not null references players(id) on delete cascade,
  event_id       text not null,               -- Kalshi event ticker
  sport          text not null,               -- our short key: nfl, ncaaf, mlb, nba
  home_team      text not null,
  away_team      text not null,
  commence_time  timestamptz not null,
  team           text not null,               -- the side the player took
  price          int not null,                -- American odds locked in at bet time
  stake          numeric(12,2) not null check (stake > 0),
  status         text not null default 'pending'
                 check (status in ('pending', 'won', 'lost', 'push')),
  payout         numeric(12,2),               -- amount returned to bankroll on settle
  created_at     timestamptz not null default now(),
  settled_at     timestamptz
);
create index if not exists picks_player_idx on picks (player_id, created_at desc);

create table if not exists messages (
  id          bigint generated always as identity primary key,
  player_id   uuid not null references players(id) on delete cascade,
  role        text not null check (role in ('user', 'assistant')),
  content     text not null,
  created_at  timestamptz not null default now()
);
create index if not exists messages_player_idx on messages (player_id, created_at desc);

alter table players   enable row level security;
alter table picks     enable row level security;
alter table messages  enable row level security;

-- Placing a pick has to take money out of the bankroll and insert the pick
-- together. Doing it in one function means two quick clicks can't both spend
-- the same dollars.
create or replace function place_pick(
  p_player uuid, p_event text, p_sport text, p_home text, p_away text,
  p_commence timestamptz, p_team text, p_price int, p_stake numeric
) returns picks language plpgsql as $$
declare
  new_pick picks;
begin
  update players set bankroll = bankroll - p_stake
   where id = p_player and bankroll >= p_stake;
  if not found then
    raise exception 'INSUFFICIENT_FUNDS';
  end if;

  insert into picks (player_id, event_id, sport, home_team, away_team,
                     commence_time, team, price, stake)
  values (p_player, p_event, p_sport, p_home, p_away,
          p_commence, p_team, p_price, p_stake)
  returning * into new_pick;
  return new_pick;
end $$;

-- Settling only works on a pick that is still pending, so the same pick can
-- never pay out twice even if two settle requests race.
create or replace function settle_pick(
  p_pick bigint, p_status text, p_payout numeric
) returns boolean language plpgsql as $$
declare
  owner uuid;
begin
  update picks set status = p_status, payout = p_payout, settled_at = now()
   where id = p_pick and status = 'pending'
  returning player_id into owner;
  if owner is null then
    return false;
  end if;

  update players set bankroll = bankroll + p_payout where id = owner;
  return true;
end $$;

-- Only the server (service role) may call these.
revoke execute on function place_pick  from public, anon, authenticated;
revoke execute on function settle_pick from public, anon, authenticated;
grant  execute on function place_pick  to service_role;
grant  execute on function settle_pick to service_role;

-- Tell the Supabase API to pick up the new tables right away.
notify pgrst, 'reload schema';
