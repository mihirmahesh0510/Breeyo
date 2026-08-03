#!/usr/bin/env bash
#
# verify-pitr.sh -- Verify that PITR (Point-in-Time Recovery) is correctly
# configured on a Breeyo RDS PostgreSQL instance.
#
# Usage:
#   ./verify-pitr.sh --instance-id breeyo-db-production --region ap-south-1
#
# Requirements:
#   - AWS CLI v2 configured with appropriate IAM permissions
#   - jq (JSON processor)
#
# Exit codes:
#   0 -- All checks passed
#   1 -- One or more checks failed
#   2 -- Missing dependencies or invalid arguments

set -euo pipefail

# ---------------------------------------------------------------------------
# Defaults
# ---------------------------------------------------------------------------
REGION="ap-south-1"
INSTANCE_ID=""
PASS_COUNT=0
FAIL_COUNT=0

# ---------------------------------------------------------------------------
# Colors (disabled if not a terminal)
# ---------------------------------------------------------------------------
if [ -t 1 ]; then
  GREEN='\033[0;32m'
  RED='\033[0;31m'
  YELLOW='\033[0;33m'
  NC='\033[0m'
else
  GREEN=''
  RED=''
  YELLOW=''
  NC=''
fi

# ---------------------------------------------------------------------------
# Functions
# ---------------------------------------------------------------------------
usage() {
  cat <<EOF
Usage: $(basename "$0") [OPTIONS]

Verify that PITR (Point-in-Time Recovery) is correctly configured on a
Breeyo RDS PostgreSQL instance.

Options:
  --instance-id ID    RDS instance identifier (required)
  --region REGION     AWS region (default: ap-south-1)
  --help              Show this help message and exit

Checks performed:
  1. BackupRetentionPeriod >= 7 days
  2. LatestRestorableTime within last 10 minutes (PITR active)
  3. StorageEncrypted is true
  4. DeletionProtection is true
  5. At least one automated snapshot exists

Examples:
  $(basename "$0") --instance-id breeyo-db-staging
  $(basename "$0") --instance-id breeyo-db-production --region ap-south-1

Exit codes:
  0  All checks passed
  1  One or more checks failed
  2  Missing dependencies or invalid arguments
EOF
}

check_pass() {
  echo -e "  ${GREEN}PASS${NC}  $1"
  PASS_COUNT=$((PASS_COUNT + 1))
}

check_fail() {
  echo -e "  ${RED}FAIL${NC}  $1"
  FAIL_COUNT=$((FAIL_COUNT + 1))
}

check_dependencies() {
  local missing=0

  if ! command -v aws &>/dev/null; then
    echo -e "${RED}Error:${NC} AWS CLI is not installed or not in PATH."
    missing=1
  fi

  if ! command -v jq &>/dev/null; then
    echo -e "${RED}Error:${NC} jq is not installed or not in PATH."
    missing=1
  fi

  if [ "$missing" -eq 1 ]; then
    echo "Install missing dependencies and try again."
    exit 2
  fi
}

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------
while [[ $# -gt 0 ]]; do
  case "$1" in
    --instance-id)
      INSTANCE_ID="$2"
      shift 2
      ;;
    --region)
      REGION="$2"
      shift 2
      ;;
    --help)
      usage
      exit 0
      ;;
    *)
      echo -e "${RED}Error:${NC} Unknown argument: $1"
      echo "Run '$(basename "$0") --help' for usage."
      exit 2
      ;;
  esac
done

if [ -z "$INSTANCE_ID" ]; then
  echo -e "${RED}Error:${NC} --instance-id is required."
  echo "Run '$(basename "$0") --help' for usage."
  exit 2
fi

# ---------------------------------------------------------------------------
# Pre-flight
# ---------------------------------------------------------------------------
check_dependencies

echo ""
echo "=========================================="
echo "  Breeyo PITR Verification"
echo "=========================================="
echo "  Instance:  $INSTANCE_ID"
echo "  Region:    $REGION"
echo "  Time:      $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
echo "=========================================="
echo ""

# ---------------------------------------------------------------------------
# Fetch instance details
# ---------------------------------------------------------------------------
echo -e "${YELLOW}Fetching RDS instance details...${NC}"
INSTANCE_JSON=$(aws rds describe-db-instances \
  --db-instance-identifier "$INSTANCE_ID" \
  --region "$REGION" \
  --output json 2>&1) || {
  echo -e "${RED}Error:${NC} Failed to describe RDS instance '$INSTANCE_ID' in region '$REGION'."
  echo "$INSTANCE_JSON"
  exit 2
}

DB_INSTANCE=$(echo "$INSTANCE_JSON" | jq '.DBInstances[0]')

if [ "$DB_INSTANCE" = "null" ] || [ -z "$DB_INSTANCE" ]; then
  echo -e "${RED}Error:${NC} No RDS instance found with identifier '$INSTANCE_ID' in region '$REGION'."
  exit 2
fi

echo ""

# ---------------------------------------------------------------------------
# Check 1: BackupRetentionPeriod >= 7
# ---------------------------------------------------------------------------
RETENTION=$(echo "$DB_INSTANCE" | jq -r '.BackupRetentionPeriod // 0')

if [ "$RETENTION" -ge 7 ]; then
  check_pass "BackupRetentionPeriod = $RETENTION days (>= 7 required)"
else
  check_fail "BackupRetentionPeriod = $RETENTION days (>= 7 required)"
fi

# ---------------------------------------------------------------------------
# Check 2: LatestRestorableTime within last 10 minutes
# ---------------------------------------------------------------------------
LATEST_RESTORABLE=$(echo "$DB_INSTANCE" | jq -r '.LatestRestorableTime // empty')

if [ -z "$LATEST_RESTORABLE" ]; then
  check_fail "LatestRestorableTime is not set (PITR may not be active)"
else
  # Convert to epoch seconds for comparison
  # Handle both GNU date and BSD/macOS date
  if date --version &>/dev/null 2>&1; then
    # GNU date
    RESTORABLE_EPOCH=$(date -d "$LATEST_RESTORABLE" +%s 2>/dev/null || echo 0)
  else
    # BSD/macOS date
    RESTORABLE_EPOCH=$(date -j -f "%Y-%m-%dT%H:%M:%S" "${LATEST_RESTORABLE%%+*}" +%s 2>/dev/null || \
                       date -j -f "%Y-%m-%dT%H:%M:%SZ" "${LATEST_RESTORABLE}" +%s 2>/dev/null || echo 0)
  fi

  NOW_EPOCH=$(date +%s)
  DIFF_SECONDS=$((NOW_EPOCH - RESTORABLE_EPOCH))
  DIFF_MINUTES=$((DIFF_SECONDS / 60))
  MAX_MINUTES=10

  if [ "$RESTORABLE_EPOCH" -eq 0 ]; then
    check_fail "LatestRestorableTime could not be parsed: $LATEST_RESTORABLE"
  elif [ "$DIFF_MINUTES" -le "$MAX_MINUTES" ]; then
    check_pass "LatestRestorableTime = $LATEST_RESTORABLE ($DIFF_MINUTES min ago, <= $MAX_MINUTES min threshold)"
  else
    check_fail "LatestRestorableTime = $LATEST_RESTORABLE ($DIFF_MINUTES min ago, exceeds $MAX_MINUTES min threshold)"
  fi
fi

# ---------------------------------------------------------------------------
# Check 3: StorageEncrypted is true
# ---------------------------------------------------------------------------
ENCRYPTED=$(echo "$DB_INSTANCE" | jq -r '.StorageEncrypted // false')

if [ "$ENCRYPTED" = "true" ]; then
  check_pass "StorageEncrypted = true"
else
  check_fail "StorageEncrypted = $ENCRYPTED (must be true for medical data)"
fi

# ---------------------------------------------------------------------------
# Check 4: DeletionProtection is true
# ---------------------------------------------------------------------------
DELETION_PROTECTION=$(echo "$DB_INSTANCE" | jq -r '.DeletionProtection // false')

if [ "$DELETION_PROTECTION" = "true" ]; then
  check_pass "DeletionProtection = true"
else
  check_fail "DeletionProtection = $DELETION_PROTECTION (must be true for production)"
fi

# ---------------------------------------------------------------------------
# Check 5: At least one automated snapshot exists
# ---------------------------------------------------------------------------
echo ""
echo -e "${YELLOW}Checking for automated snapshots...${NC}"

SNAPSHOT_COUNT=$(aws rds describe-db-snapshots \
  --db-instance-identifier "$INSTANCE_ID" \
  --snapshot-type automated \
  --region "$REGION" \
  --query 'length(DBSnapshots)' \
  --output text 2>/dev/null || echo 0)

if [ "$SNAPSHOT_COUNT" -ge 1 ]; then
  check_pass "Automated snapshots found: $SNAPSHOT_COUNT"
else
  check_fail "No automated snapshots found (expected at least 1)"
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
echo "=========================================="
echo "  Summary"
echo "=========================================="
echo -e "  Passed:  ${GREEN}$PASS_COUNT${NC}"
echo -e "  Failed:  ${RED}$FAIL_COUNT${NC}"
echo "=========================================="

if [ "$FAIL_COUNT" -gt 0 ]; then
  echo ""
  echo -e "${RED}RESULT: FAIL${NC} -- $FAIL_COUNT check(s) did not pass."
  echo "Review the failures above and consult infra/aws/backup/rds-backup-config.md"
  echo "for the expected configuration."
  exit 1
else
  echo ""
  echo -e "${GREEN}RESULT: PASS${NC} -- All $PASS_COUNT checks passed."
  exit 0
fi
