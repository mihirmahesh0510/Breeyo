#!/usr/bin/env bash
#
# check-task-def-env.sh -- deployment environment parity gate (CR-05).
#
# Fails the build if an ECS task definition omits an environment variable the
# API cannot function without in a deployed environment.
#
# Background: Phase 6 shipped BIL-05 (Razorpay payments) and BIL-06 (webhook
# status updates) with `BILLING_ENCRYPTION_KEY` and `PUBLIC_API_URL` read by
# `apps/api/src/lib/crypto.ts` and `.../billing/settings.service.ts`, but absent
# from both task definitions. Every test passed, because the suite runs against
# a local `.env` (and `tests/helpers/setup.ts` generates a key when unset) --
# never against the deployment config. The result would have been a 500 on every
# credential save in staging and production, and a null webhook URL, with
# nothing in CI to catch it. This gate closes that blind spot.
#
# REQUIRED_VARS is deliberately narrow: it lists only variables with NO working
# fallback in application code -- absence is a hard failure, not degraded
# behaviour. Variables that are feature-gated (`if (process.env.X)`) or that
# have a `||` / `??` default are intentionally excluded; they are tracked in
# .planning/phases/06-invoicing-payments/deferred-items.md instead. Keeping the
# list to "breaks outright when missing" is what makes a failure here actionable
# rather than noise the next contributor learns to ignore.
#
# A variable counts as present if it appears as a name in EITHER `environment`
# (plain values) or `secrets` (SSM Parameter Store references). The gate checks
# wiring, not values -- it cannot know whether the SSM parameter behind a
# `valueFrom` has actually been provisioned in AWS. That provisioning remains an
# out-of-band ops step; see the Phase 6 pre-launch checklist.
#
# Usage: bash scripts/check-task-def-env.sh
# Exit:  0 clean, 1 on violation.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

TASK_DEFS=(
  "infra/aws/staging/api-task-definition.json"
  "infra/aws/production/api-task-definition.json"
)

# Variables the API cannot start or serve its core flows without.
# Each entry names the code path that hard-fails when it is missing.
REQUIRED_VARS=(
  "DATABASE_URL"            # Prisma migration/admin client
  "DATABASE_URL_APP"        # RLS-enforced app client (D-30)
  "REDIS_URL"               # BullMQ queues + socket adapter
  "JWT_SECRET"              # @fastify/jwt signing
  "COOKIE_SECRET"           # @fastify/cookie signing
  "BILLING_ENCRYPTION_KEY"  # crypto.ts throws on save without it (BIL-05)
  "PUBLIC_API_URL"          # webhook URL shown to Admins is null without it (BIL-06)
)

if ! command -v jq >/dev/null 2>&1; then
  echo "task-def env gate FAILED -- jq is not installed." >&2
  exit 1
fi

violations=0
checked=0

for task_def in "${TASK_DEFS[@]}"; do
  if [ ! -f "$task_def" ]; then
    echo "task-def env gate FAILED -- $task_def not found." >&2
    echo "The path is wrong or infra/ moved; a gate that scans nothing always passes." >&2
    exit 1
  fi

  if ! jq empty "$task_def" >/dev/null 2>&1; then
    echo "task-def env gate FAILED -- $task_def is not valid JSON." >&2
    exit 1
  fi

  # Names declared by the breeyo-api container, from both blocks at once.
  declared="$(
    jq -r '
      .containerDefinitions[]
      | select(.name == "breeyo-api")
      | ((.environment // []) + (.secrets // []))
      | .[].name
    ' "$task_def"
  )"

  if [ -z "$declared" ]; then
    echo "task-def env gate FAILED -- no breeyo-api container env in $task_def." >&2
    exit 1
  fi

  missing=()
  for var in "${REQUIRED_VARS[@]}"; do
    checked=$((checked + 1))
    if ! grep -qx "$var" <<<"$declared"; then
      missing+=("$var")
    fi
  done

  if [ ${#missing[@]} -gt 0 ]; then
    if [ "$violations" -eq 0 ]; then
      echo "task-def env gate FAILED -- required variables missing from a task definition:"
      echo
    fi
    echo "  $task_def"
    for var in "${missing[@]}"; do
      echo "    - $var"
    done
    violations=$((violations + 1))
  fi
done

if [ "$checked" -eq 0 ]; then
  echo "task-def env gate FAILED -- nothing was checked." >&2
  exit 1
fi

if [ "$violations" -gt 0 ]; then
  echo
  echo "The application reads each variable above at runtime with no fallback, so"
  echo "the deployed API fails where local tests pass. Add it to the task"
  echo "definition's \`environment\` block for plain values, or to \`secrets\` with"
  echo "an SSM path for credential-grade values:"
  echo
  echo "    { \"name\": \"MY_SECRET\", \"valueFrom\": \"/breeyo/staging/MY_SECRET\" }"
  echo
  echo "A \`secrets\` entry also requires the SSM parameter to exist in AWS before"
  echo "the next deploy -- adding the reference alone will make the task fail to"
  echo "start with a ResourceNotFoundException."
  exit 1
fi

echo "task-def env gate passed -- ${#REQUIRED_VARS[@]} required vars present in ${#TASK_DEFS[@]} task definitions."
