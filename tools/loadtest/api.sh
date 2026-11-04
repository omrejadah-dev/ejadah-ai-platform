#!/usr/bin/env bash
# API load test (50 concurrent users, 15 s per endpoint) with autocannon. Run from the repo root in Git Bash.
#   bash tools/loadtest/api.sh http://127.0.0.1:5020 0500000001
# Logs in with a dev seat (Sms:EchoCodeInResponse must be on), then hits the main read endpoints and the pricing POST.
# The pricing POST saves real valuations: it lifts the seat's plan limit for the run, restores it, and deletes the rows it made.
set -euo pipefail
B=${1:-http://127.0.0.1:5020}; PHONE=${2:-0500000001}
export MSYS_NO_PATHCONV=1
PG_CONTAINER=${PG_CONTAINER:-ejadah-ai-postgres}
P="docker exec $PG_CONTAINER psql -U ejadah -d ejadah_ai -q -tA"
JAR=$(mktemp)

code=$(curl -s -X POST "$B/api/auth/otp" -H 'Content-Type: application/json' -d "{\"phone\":\"$PHONE\"}" | sed 's/.*"devCode":"\([0-9]*\)".*/\1/')
curl -s -o /dev/null -c "$JAR" -X POST "$B/api/auth/verify" -H 'Content-Type: application/json' -d "{\"phone\":\"$PHONE\",\"code\":\"$code\"}"
C="ejd_access=$(awk '/ejd_access/ {print $7}' "$JAR")"
JEDDAH=$($P -c "select id from market.cities where name_norm='جده' and region='مكة المكرمة'")
DID=$($P -c "select id from market.districts where city_id=$JEDDAH and name='الصفا' limit 1")
run() { echo "== $1"; (cd frontend && npx -y autocannon@7.15.0 -c 50 -d 15 -H "Cookie=$C" "${@:2}") 2>&1 | grep -E "Latency|Req/Sec|requests in|non-2xx|errors"; }

run "meta"              "$B/api/meta"
run "city map"          "$B/api/cities/$JEDDAH/map?type=land"
run "district summary"  "$B/api/districts/$DID/summary?type=land"

PLAN=$($P -c "select a.plan_id from identity.seats s join identity.accounts a on a.id=s.account_id where s.phone like '%${PHONE:1}' limit 1")
LIMIT=$($P -c "select daily_estimate_limit from identity.plans_catalog where id=$PLAN")
START=$($P -c "select now()")
$P -c "update identity.plans_catalog set daily_estimate_limit = 1000000 where id = $PLAN"
trap '$P -c "update identity.plans_catalog set daily_estimate_limit = $LIMIT where id = $PLAN"' EXIT
run "POST estimate" -m POST -H "Content-Type=application/json" -b "{\"propertyType\":\"land\",\"cityId\":$JEDDAH,\"districtId\":$DID,\"areaM2\":600}" "$B/api/estimates"
$P -c "begin;
  create temp table lt as select id from app.valuations where created_at >= '$START' and type_group='land' and area_m2=600 and request->>'notes' is null;
  delete from ops.audit_log where action='estimate.created' and at >= '$START' and subject in (select id::text from lt);
  delete from app.valuations where id in (select id from lt);
commit;"
echo "cleaned up; plan limit restored to $LIMIT"
