#!/usr/bin/env bash
#
# check-tenant-client.sh -- D-30 tenancy regression gate.
#
# Fails the build if a clinic-scoped route or controller file reaches for the
# RLS-bypassing admin Prisma client instead of the per-request tenant handle.
#
# Background: `fastify.prisma` is the breeyo_admin client. RLS policies do not
# apply to it -- that is what the role is for. `request.db`, installed by the
# `tenantContext` middleware, is the breeyo_app client with `app.clinic_id`
# bound inside the query's own transaction. Plans 06-02 and 06-20 converted
# every clinic-scoped module from the former to the latter; this script stops
# the next module from quietly reintroducing the former.
#
# A match is a violation UNLESS one of:
#
#   1. The file is on the hardcoded exempt list below (currently only
#      auth.routes.ts, which is pre-tenant by nature -- login runs before a
#      clinic is selected, so `request.db` does not exist yet).
#   2. The offending line carries "D-30 exemption" itself, or the contiguous
#      comment block immediately above it does. The exemption extends to the
#      end of that code block: a blank line ends its reach, so one comment
#      cannot silently whitelist an entire file.
#
# Comment-only lines are never matched. Both this script's prose and the
# exemption comments in the scanned files mention `fastify.prisma` by name, and
# a gate that trips on its own documentation is worse than no gate.
#
# Usage: bash scripts/check-tenant-client.sh
# Exit:  0 clean, 1 on violation.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# Files that legitimately construct services from the admin client, with the
# reason recorded here as well as inline at the call site.
EXEMPT_PATHS=(
  "apps/api/src/modules/auth/auth.routes.ts" # pre-tenant: login precedes clinic selection
)

# The admin-client handles a route or controller must not reach for.
FORBIDDEN='fastify\.prisma|request\.server\.prisma|app\.prisma'

# The inline marker that turns a match into a documented, deliberate exception.
EXEMPT_MARKER='D-30 exemption'

is_exempt_path() {
  local candidate="$1"
  local exempt
  for exempt in "${EXEMPT_PATHS[@]}"; do
    if [ "$candidate" = "$exempt" ]; then
      return 0
    fi
  done
  return 1
}

violations=0
scanned=0

while IFS= read -r file; do
  scanned=$((scanned + 1))

  if is_exempt_path "$file"; then
    continue
  fi

  # awk does the per-line work so the comment-stripping and the
  # exemption-window logic stay in one place.
  output="$(
    awk -v forbidden="$FORBIDDEN" -v marker="$EXEMPT_MARKER" '
      # Comment-only line: never a violation, but it can arm the exemption for
      # the code block that follows.
      /^[[:space:]]*(\/\/|\/\*|\*\/|\*)/ {
        if ($0 ~ marker) armed = 1
        next
      }

      # A blank line ends the reach of the comment block above it.
      /^[[:space:]]*$/ { armed = 0; next }

      # Code line.
      {
        if ($0 ~ forbidden && $0 !~ marker && armed == 0) {
          printf "%s:%d: %s\n", FILENAME, FNR, $0
        }
      }
    ' "$file"
  )"

  if [ -n "$output" ]; then
    if [ "$violations" -eq 0 ]; then
      echo "D-30 tenancy gate FAILED -- admin Prisma client in a clinic-scoped file:"
      echo
    fi
    echo "$output"
    violations=$((violations + 1))
  fi
done < <(
  find apps/api/src/modules \
    -mindepth 2 -maxdepth 2 \
    \( -name '*.routes.ts' -o -name '*.controller.ts' \) \
    -type f | sort
)

if [ "$scanned" -eq 0 ]; then
  echo "D-30 tenancy gate FAILED -- no route or controller files found." >&2
  echo "The glob is wrong or the tree moved; a gate that scans nothing always passes." >&2
  exit 1
fi

if [ "$violations" -gt 0 ]; then
  echo
  echo "Each line above builds a repository or service from the admin client,"
  echo "which bypasses RLS. Build it per request from \`request.db\` instead:"
  echo
  echo "    const buildService = (db: TenantPrismaClient) =>"
  echo "      new XService(new XRepository(db));"
  echo
  echo "    // ...then, as the first statement of every handler:"
  echo "    const service = buildService(request.db);"
  echo
  echo "See apps/api/src/modules/patient/patient.routes.ts for the reference shape."
  echo "If the admin client is genuinely required (no request context, or the code"
  echo "runs before tenantContext), add a comment stating why, containing the exact"
  echo "text \"$EXEMPT_MARKER\", directly above the line."
  exit 1
fi

echo "D-30 tenancy gate passed -- $scanned route/controller files scanned, no unexempted admin-client use."
