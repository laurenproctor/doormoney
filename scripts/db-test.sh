#!/usr/bin/env bash
#
# The Phase 1 gate, runnable anywhere Docker is: supabase/tests/permissions_test.sql against a real
# Postgres with every migration and the seed applied.
#
# `supabase test db` needs the whole local stack, which is slow and flaky under load, so this uses
# one throwaway postgres container plus supabase/tests/bootstrap.sql instead. Same assertions, no
# stack. Runs the same way on a laptop and on a GitHub runner.
#
#   ./scripts/db-test.sh            run the suite, then remove the container
#   KEEP=1 ./scripts/db-test.sh     leave the container up to poke at afterwards
#
set -euo pipefail

NAME="${CONTAINER:-doormoney_db_test}"
PG_MAJOR=17
IMAGE="postgres:${PG_MAJOR}-bookworm"
DB=doormoney_test
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
psql_() { docker exec -i "$NAME" psql -U postgres -v ON_ERROR_STOP=1 "$@"; }

cleanup() {
  if [ "${KEEP:-}" = "1" ]; then
    echo "Container $NAME left running. Remove it with: docker rm -f $NAME"
  else
    docker rm -f "$NAME" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

say "Starting $IMAGE as $NAME"
docker rm -f "$NAME" >/dev/null 2>&1 || true
docker run -d --name "$NAME" -e POSTGRES_PASSWORD=postgres "$IMAGE" >/dev/null

for _ in $(seq 1 60); do
  docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1 && break
  sleep 1
done
docker exec "$NAME" pg_isready -U postgres >/dev/null

# pgTAP is not in the postgres image. The PGDG apt repo the image already carries has it.
say "Installing pgTAP"
docker exec "$NAME" bash -c "apt-get update -qq && apt-get install -y -qq postgresql-${PG_MAJOR}-pgtap" >/dev/null

say "Creating $DB"
psql_ -q -d postgres -c "create database $DB"

# The bootstrap has to land before the migrations: it sets the default grants the migrations'
# tables inherit, and 0022's revokes mean nothing without them.
say "Bootstrapping the Supabase stand-in"
psql_ -q -d "$DB" < "$ROOT/supabase/tests/bootstrap.sql"

say "Applying migrations"
for f in "$ROOT"/supabase/migrations/*.sql; do
  printf '  %s\n' "$(basename "$f")"
  psql_ -q -d "$DB" < "$f"
done

say "Seeding"
psql_ -q -d "$DB" < "$ROOT/supabase/seed.sql"

say "Running permissions_test.sql"
# pgTAP prints TAP; psql must not stop on the first failing assertion, or the plan never reports.
docker exec -i "$NAME" psql -U postgres -d "$DB" -X -q --no-align --tuples-only \
  < "$ROOT/supabase/tests/permissions_test.sql" | tee /tmp/doormoney-tap.txt

# Check the plan, not just the absence of failures. A test file that aborts on its first statement
# prints no "not ok" at all, so "no failures" and "nothing ran" look identical without this.
plan_count=$(grep -oE '^1\.\.[0-9]+' /tmp/doormoney-tap.txt | head -1 | cut -d. -f3)
ok_count=$(grep -cE '^ok [0-9]+' /tmp/doormoney-tap.txt || true)
fail_count=$(grep -cE '^not ok [0-9]+' /tmp/doormoney-tap.txt || true)

if [ -z "$plan_count" ]; then
  say "FAILED: the test file never reported a plan, so it aborted before running"
  grep -E 'ERROR|FATAL' /tmp/doormoney-tap.txt | head -10
  exit 1
fi

if [ "$fail_count" != "0" ] || [ "$ok_count" != "$plan_count" ]; then
  say "FAILED: $ok_count of $plan_count passed, $fail_count failed"
  grep -E '^not ok|^# ' /tmp/doormoney-tap.txt | head -40
  exit 1
fi

say "All $ok_count assertions passed"
