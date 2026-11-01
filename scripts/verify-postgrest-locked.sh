#!/usr/bin/env bash
#
# Verify that Supabase's PostgREST cannot read our tables.
#
# Supabase runs a REST API over the `public` schema and grants `anon` and
# `authenticated` access to it by default, so tables our migrations create are
# served over HTTPS to anyone holding the publishable key — which is public by
# design and ships in the browser bundle. `20261101005003_lock_out_postgrest`
# closes that. This script checks the lock is actually in place on a live
# project, which no test can do: the integration suite asserts what our
# migrations *do*, on any Postgres, not that they have been deployed.
#
# Run it after `npm run db:deploy` against any environment, and in particular
# before a pilot.
#
# This script FAILS CLOSED. A missing key, an unreachable host, or a response it
# does not recognise is a failure, not a pass. The one-liner this replaces
# returned a clean-looking 401 when the API key was simply absent from the
# shell, which is a false pass — PostgREST answers 401 both for "no key" and
# for "denied", so the body has to be read, not the status code.
#
# Written for bash 3.2, which is what macOS ships, so no mapfile and no ${x,,}.

set -uo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)

# Prefer values already in the environment (CI); otherwise read `.env`. Not
# loading `.env` is exactly the mistake this script exists to prevent.
if [ -z "${NEXT_PUBLIC_SUPABASE_URL:-}" ] || [ -z "${NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:-}" ]; then
  if [ -f "$repo_root/.env" ]; then
    set -a
    # shellcheck disable=SC1091  # path is computed, resolved at run time
    . "$repo_root/.env"
    set +a
  fi
fi

url="${NEXT_PUBLIC_SUPABASE_URL:-}"
key="${NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:-}"
url="${url%/}"

if [ -z "$url" ] || [ -z "$key" ]; then
  echo "CANNOT CHECK: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" >&2
  echo "must both be set, in the environment or in $repo_root/.env." >&2
  exit 1
fi

# Table names come from the schema's @@map directives so this list cannot rot as
# the schema grows. A new table that nobody locked will show up here on its own.
tables=$(
  grep -oE '@@map\("[^"]+"\)' "$repo_root/prisma/schema.prisma" |
    sed -E 's/.*\("([^"]+)"\).*/\1/' | sort -u
)

if [ -z "$tables" ]; then
  echo "CANNOT CHECK: found no @@map table names in prisma/schema.prisma." >&2
  exit 1
fi

echo "Project: $url"
echo "Key:     ${key:0:12}… (${#key} chars)"
echo

# Probe one table and print a verdict. Echoes "ok" or "bad" on stdout's last
# line for the caller; everything else goes to the human.
probe() {
  local table="$1" label="$2" use_key="$3"
  local resp code body verdict detail rc

  if [ "$use_key" = "yes" ]; then
    resp=$(curl -sS --max-time 20 -w $'\n%{http_code}' \
      -H "apikey: $key" "$url/rest/v1/$table" 2>&1)
  else
    resp=$(curl -sS --max-time 20 -w $'\n%{http_code}' "$url/rest/v1/$table" 2>&1)
  fi
  rc=$?

  if [ $rc -ne 0 ]; then
    printf '  %-22s UNREACHABLE  %s\n' "$label" "$(echo "$resp" | tr '\n' ' ')"
    return 1
  fi

  code="${resp##*$'\n'}"
  body="${resp%$'\n'*}"

  case "$code" in
    200)
      verdict=bad
      detail="EXPOSED — readable over PostgREST"
      ;;
    *)
      if printf '%s' "$body" | grep -qi 'No API key found'; then
        # The failure mode that made the old one-liner lie.
        verdict=bad
        detail="CHECK BROKEN — the key never reached the request"
      elif printf '%s' "$body" | grep -qi 'Invalid API key'; then
        # Also a false-pass risk: a stale key after rotation refuses every
        # request, which looks like a lock until you read the body.
        verdict=bad
        detail="CHECK BROKEN — the key was rejected as invalid"
      elif printf '%s' "$body" | grep -qiE 'permission denied|42501'; then
        verdict=ok
        detail="locked (permission denied)"
      elif printf '%s' "$body" | grep -qiE 'PGRST205|Could not find the table'; then
        verdict=ok
        detail="locked (not in PostgREST's schema at all)"
      else
        # Deliberately not a pass. An unrecognised refusal might be a refusal
        # for some unrelated reason, and we would rather look again than
        # record a green run we cannot account for.
        verdict=bad
        detail="UNRECOGNISED — $(printf '%s' "$body" | head -c 160 | tr '\n' ' ')"
      fi
      ;;
  esac

  printf '  %-22s HTTP %-3s  %s\n' "$label" "$code" "$detail"
  [ "$verdict" = ok ]
}

failures=0

# Control: with no key at all, PostgREST should say so. This proves the host is
# reachable and that a keyed refusal below means something different from this.
echo "Control (no API key):"
control=$(curl -sS --max-time 20 -w $'\n%{http_code}' "$url/rest/v1/businesses" 2>&1)
control_code="${control##*$'\n'}"
control_body="${control%$'\n'*}"
if [ "$control_code" = "200" ]; then
  echo "  businesses             HTTP 200  EXPOSED WITHOUT ANY KEY"
  failures=$((failures + 1))
elif printf '%s' "$control_body" | grep -qi 'No API key found'; then
  echo "  businesses             HTTP $control_code  refused, as expected"
else
  echo "  businesses             HTTP $control_code  $(printf '%s' "$control_body" | head -c 120 | tr '\n' ' ')"
fi
echo

echo "With the publishable key:"
for t in $tables; do
  probe "$t" "$t" yes || failures=$((failures + 1))
done
echo

if [ "$failures" -ne 0 ]; then
  cat >&2 <<MSG
FAIL: $failures check(s) did not come back locked.

If tables read 200, the migration has not been deployed to this project:

  npm run db:deploy

If a check reads CHECK BROKEN or UNRECOGNISED, the result is inconclusive and
must not be treated as a pass — look at the response above before shipping.
MSG
  exit 1
fi

echo "PASS: PostgREST refuses every table with the publishable key."
