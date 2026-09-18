#!/usr/bin/env bash
#
# Two sessions on the same lot at the same time. pgTAP runs in one session, so it cannot show that
# the row lock in migration 0035 does what it is there for; this can. Each scenario opens a
# transaction in one psql, holds it open with pg_sleep, and sends the competing statement from a
# second psql, which has to wait on the lock and then see the first one's work.
#
# Runs against the container scripts/db-test.sh starts, after the pgTAP suites have rolled back:
#   CONTAINER=doormoney_db_test DB=doormoney_test supabase/tests/concurrency_test.sh
#
# The Phase 3 gate: two concurrent requests never produce two authoritative winners and never
# fulfil a stale offer.
set -euo pipefail

NAME="${CONTAINER:-doormoney_db_test}"
DB="${DB:-doormoney_test}"
HOLD="${HOLD:-3}"

psql_() { docker exec -i "$NAME" psql -U postgres -d "$DB" -X -q -t -A "$@"; }
sql() { psql_ -v ON_ERROR_STOP=1 -c "$1"; }
fails=0
pass() { printf 'ok - %s\n' "$1"; }
fail() { printf 'not ok - %s\n' "$1"; fails=$((fails + 1)); }
check() { if [ "$2" = "$3" ]; then pass "$1"; else fail "$1 (got '$2', wanted '$3')"; fi; }

RUN=22222222-2222-2222-2222-222222222222
STRAPS=a1000000-0000-0000-0000-000000000002   # reserve $450, top bid $520 in the seed
CASE1=a1000000-0000-0000-0000-000000000003    # reserve $350, top bid $380
MERCH=a1000000-0000-0000-0000-000000000006    # reserve $500, top bid $610
P1=c1000000-0000-0000-0000-000000000001
P2=c1000000-0000-0000-0000-000000000002
P3=c1000000-0000-0000-0000-000000000003

sql "update runs set bidding_closes_at = now() + interval '1 hour' where id = '$RUN'; update lots set closes_at = null where run_id = '$RUN';"

# ---------------------------------------------------------------
# 1. Two bids at the same minimum arrive together. One goes in; the other waits for the lock,
#    sees it, and is refused because the minimum has moved.
# ---------------------------------------------------------------
before=$(sql "select count(*) from bids where lot_id = '$CASE1'")
psql_ -c "begin; select * from place_bid('$CASE1', '$P1', 40000); select pg_sleep($HOLD); commit;" >/dev/null &
first=$!
sleep 1
second_out=$(psql_ -c "select * from place_bid('$CASE1', '$P2', 40000)" 2>&1 || true)
wait "$first"
after=$(sql "select count(*) from bids where lot_id = '$CASE1'")
check "two simultaneous bids at the same minimum: exactly one goes in" "$((after - before))" "1"
case "$second_out" in *bid_below_minimum*) pass "and the one that waited is refused as below the new minimum" ;; *) fail "the second bid was not refused: $second_out" ;; esac

# ---------------------------------------------------------------
# 2. Two closes on one due lot. The second waits and finds it already closed.
# ---------------------------------------------------------------
sql "update lots set closes_at = now() - interval '1 second' where id = '$MERCH'"
psql_ -c "begin; select outcome from close_auction('$MERCH'); select pg_sleep($HOLD); commit;" > /tmp/doormoney-close-a.txt &
first=$!
sleep 1
second=$(psql_ -c "select outcome from close_auction('$MERCH')")
wait "$first"
firstout=$(head -1 /tmp/doormoney-close-a.txt)
check "two simultaneous closes: the first wins the lot" "$firstout" "won"
check "the second finds it already closed" "$second" "already"
check "one offer was made, not two" "$(sql "select offer_version from lots where id = '$MERCH'")" "1"
check "and there is one winner" "$(sql "select count(*) from lots where id = '$MERCH' and winner_bid_id is not null")" "1"

# ---------------------------------------------------------------
# 3. A bid lands as the close runs. The close waits for the bid's transaction, then takes it.
# ---------------------------------------------------------------
sql "update lots set closes_at = now() + interval '2 seconds' where id = '$STRAPS'"
psql_ -c "begin; select * from place_bid('$STRAPS', '$P3', 54500); select pg_sleep($HOLD); commit;" >/dev/null &
first=$!
sleep 2.5
closeout=$(psql_ -c "select outcome from close_auction('$STRAPS')")
wait "$first"
check "a close that overlaps a bid in flight waits and then closes" "$closeout" "won"
winner=$(sql "select amount_cents from bids where id = (select winner_bid_id from lots where id = '$STRAPS')")
check "and the bid that was in flight is the winner" "$winner" "54500"

# ---------------------------------------------------------------
# 4. Fulfilment and a roll on the same lot. Whichever goes first, the other finds the lot settled.
# ---------------------------------------------------------------
purchase=$(sql "select begin_lot_purchase('$STRAPS', '$P3', 54500, 8175, (select winner_bid_id from lots where id = '$STRAPS'))")
sql "update purchases set expires_at = now() - interval '1 minute' where id = '$purchase'; update lots set funding_deadline = now() - interval '1 minute' where id = '$STRAPS';"
psql_ -c "begin; select fulfil_lot_purchase('$purchase', 'pi_race', 'ch_race'); select pg_sleep($HOLD); commit;" > /tmp/doormoney-fulfil.txt &
first=$!
sleep 1
rollout=$(psql_ -c "select outcome from roll_offer('$STRAPS')")
wait "$first"
check "fulfilment that is in flight when a roll arrives: the payment sells the lot" "$(head -1 /tmp/doormoney-fulfil.txt)" "sold"
check "and the roll, having waited, finds the lot already settled" "$rollout" "already"
check "the lot is sold to the patron who paid" "$(sql "select status from lots where id = '$STRAPS'")" "sold"
check "and their purchase is held" "$(sql "select payment_status from purchases where id = '$purchase'")" "held"

if [ "$fails" != "0" ]; then
  printf '\n%s concurrency check(s) failed\n' "$fails"
  exit 1
fi
printf '\nAll concurrency checks passed\n'
