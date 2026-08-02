# Database Recovery Runbook -- Breeyo

Region: **ap-south-1** (AWS Mumbai)

This runbook provides step-by-step procedures for restoring the Breeyo PostgreSQL
database from RDS automated backups using point-in-time recovery (PITR) or snapshot
restore. Follow these steps exactly. Do not skip the post-recovery checklist.

---

## When to Use This Runbook

| Scenario                | Recovery Method              | Estimated RTO  |
|-------------------------|------------------------------|----------------|
| Data corruption         | Point-in-Time Recovery       | ~30-60 minutes |
| Accidental deletion     | Point-in-Time Recovery       | ~30-60 minutes |
| Ransomware/compromise   | Point-in-Time Recovery       | ~30-60 minutes |
| Failed migration        | Point-in-Time Recovery       | ~30-60 minutes |
| Full instance failure   | Snapshot-Based Recovery      | ~45-90 minutes |
| DR test (staging)       | Point-in-Time Recovery       | ~30-60 minutes |

---

## Prerequisites

Before starting recovery, confirm the following:

1. **AWS CLI v2** is installed and configured with credentials that have the following
   IAM permissions:
   - `rds:RestoreDBInstanceToPointInTime`
   - `rds:DescribeDBInstances`
   - `rds:DescribeDBSnapshots`
   - `rds:ModifyDBInstance`
   - `rds:CreateDBInstance`
   - `rds:DeleteDBInstance`
   - `ec2:DescribeSecurityGroups`
   - `ec2:DescribeSubnets`

2. **jq** is installed (`sudo apt-get install -y jq` or `brew install jq`)

3. You know the **target recovery timestamp** in UTC. Use CloudWatch Logs,
   application logs, or database audit logs to determine the last known good state.

4. You have access to the following values (stored in AWS Secrets Manager or team
   documentation):
   - `<SECURITY_GROUP_ID>` -- VPC security group for the RDS instance
   - `breeyo-db-subnet` -- DB subnet group name
   - The current `DATABASE_URL` and `DATABASE_URL_APP` connection strings

---

## Point-in-Time Recovery (Preferred)

### Step 1: Identify the Target Recovery Time

Determine the exact UTC timestamp to restore to. This should be the moment
**before** the incident occurred.

```bash
# Check the latest restorable time for the source instance
aws rds describe-db-instances \
  --db-instance-identifier breeyo-db-production \
  --region ap-south-1 \
  --query 'DBInstances[0].LatestRestorableTime' \
  --output text
```

The target time must be between the earliest restorable time and the latest
restorable time. PITR supports second-level granularity.

### Step 2: Restore to a New Instance

Create a new RDS instance restored to the target point in time. The new instance
name includes a timestamp for traceability.

```bash
RECOVERY_ID="breeyo-db-recovery-$(date +%Y%m%d-%H%M)"

aws rds restore-db-instance-to-point-in-time \
  --source-db-instance-identifier breeyo-db-production \
  --target-db-instance-identifier "$RECOVERY_ID" \
  --restore-time "2026-07-30T10:00:00Z" \
  --db-instance-class db.t3.medium \
  --vpc-security-group-ids <SECURITY_GROUP_ID> \
  --db-subnet-group-name breeyo-db-subnet \
  --region ap-south-1 \
  --no-multi-az \
  --copy-tags-to-snapshot
```

Replace `"2026-07-30T10:00:00Z"` with the actual target recovery timestamp.

### Step 3: Wait for the Restored Instance

The restore operation typically takes 15-30 minutes. Wait for the instance to
become available.

```bash
echo "Waiting for $RECOVERY_ID to become available..."

aws rds wait db-instance-available \
  --db-instance-identifier "$RECOVERY_ID" \
  --region ap-south-1

echo "Instance $RECOVERY_ID is now available."
```

### Step 4: Get the New Endpoint

```bash
aws rds describe-db-instances \
  --db-instance-identifier "$RECOVERY_ID" \
  --region ap-south-1 \
  --query 'DBInstances[0].Endpoint.{Address: Address, Port: Port}' \
  --output table
```

### Step 5: Verify Data Integrity

Connect to the recovered instance and verify data integrity.

```bash
# Connect via psql (update host to the new endpoint)
psql "postgresql://breeyo_admin:<PASSWORD>@<RECOVERED_ENDPOINT>:5432/breeyo"
```

Run these verification queries:

```sql
-- Check table row counts against known baselines
SELECT 'users' AS table_name, COUNT(*) AS row_count FROM users
UNION ALL
SELECT 'clinics', COUNT(*) FROM clinics
UNION ALL
SELECT 'clinic_members', COUNT(*) FROM clinic_members
UNION ALL
SELECT 'notifications', COUNT(*) FROM notifications;

-- Check the most recent records to verify recovery point
SELECT id, created_at FROM users ORDER BY created_at DESC LIMIT 5;

-- Verify RLS policies are present
SELECT schemaname, tablename, policyname
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename;

-- Verify the breeyo_app role exists
SELECT rolname FROM pg_roles WHERE rolname = 'breeyo_app';
```

### Step 6: Update Application Configuration

Update the ECS task definition (or environment variables) to point to the recovered
instance.

```bash
# Update DATABASE_URL and DATABASE_URL_APP in the ECS task definition
# or in AWS Secrets Manager / Parameter Store.
#
# DATABASE_URL (for migrations):
#   postgresql://breeyo_admin:<PASSWORD>@<RECOVERED_ENDPOINT>:5432/breeyo
#
# DATABASE_URL_APP (for runtime, uses breeyo_app role):
#   postgresql://breeyo_app:<PASSWORD>@<RECOVERED_ENDPOINT>:5432/breeyo

# Force a new ECS deployment to pick up the new configuration
aws ecs update-service \
  --cluster breeyo-production \
  --service breeyo-api \
  --force-new-deployment \
  --region ap-south-1
```

### Step 7: Run Prisma Migrations

Ensure the recovered database schema is current:

```bash
cd /path/to/breeyo/apps/api
DATABASE_URL="postgresql://breeyo_admin:<PASSWORD>@<RECOVERED_ENDPOINT>:5432/breeyo" \
  npx prisma migrate deploy
```

### Step 8: Verify Application Health

```bash
# Hit the health endpoint
curl -s https://api.breeyo.com/health | jq .

# Expected response: { "status": "ok", "database": "connected", "redis": "connected" }
```

### Step 9: Configure Backups on the Recovered Instance

The recovered instance does not inherit backup settings. Re-apply them:

```bash
aws rds modify-db-instance \
  --db-instance-identifier "$RECOVERY_ID" \
  --backup-retention-period 14 \
  --preferred-backup-window "19:00-19:30" \
  --copy-tags-to-snapshot \
  --deletion-protection \
  --region ap-south-1 \
  --apply-immediately
```

### Step 10: Decommission the Old Instance

After a **48-hour observation period** with no issues on the recovered instance,
delete the old corrupted instance.

```bash
# First disable deletion protection on the old instance
aws rds modify-db-instance \
  --db-instance-identifier breeyo-db-production \
  --no-deletion-protection \
  --region ap-south-1 \
  --apply-immediately

# Wait for the modification to apply
aws rds wait db-instance-available \
  --db-instance-identifier breeyo-db-production \
  --region ap-south-1

# Create a final snapshot before deletion
aws rds delete-db-instance \
  --db-instance-identifier breeyo-db-production \
  --final-db-snapshot-identifier "breeyo-db-production-final-$(date +%Y%m%d)" \
  --region ap-south-1
```

---

## Snapshot-Based Recovery (Alternative)

Use this when you need a full instance recovery from the latest automated snapshot
rather than a specific point in time.

### Step 1: List Available Snapshots

```bash
aws rds describe-db-snapshots \
  --db-instance-identifier breeyo-db-production \
  --snapshot-type automated \
  --region ap-south-1 \
  --query 'sort_by(DBSnapshots, &SnapshotCreateTime)[-5:].{
    ID: DBSnapshotIdentifier,
    Created: SnapshotCreateTime,
    Status: Status,
    Size: AllocatedStorage
  }' \
  --output table
```

### Step 2: Restore from Snapshot

```bash
RECOVERY_ID="breeyo-db-snap-recovery-$(date +%Y%m%d-%H%M)"

aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier "$RECOVERY_ID" \
  --db-snapshot-identifier "<SNAPSHOT_ID>" \
  --db-instance-class db.t3.medium \
  --vpc-security-group-ids <SECURITY_GROUP_ID> \
  --db-subnet-group-name breeyo-db-subnet \
  --region ap-south-1 \
  --no-multi-az \
  --copy-tags-to-snapshot
```

### Step 3: Continue from Step 3 of PITR Procedure

Follow Steps 3-10 from the Point-in-Time Recovery section above.

---

## Rollback Procedure

If the recovered instance has incorrect data or the application behaves unexpectedly
after cutover:

1. **Do not delete the original instance** until the 48-hour observation period has
   passed.
2. Revert `DATABASE_URL` and `DATABASE_URL_APP` to point back to the original
   instance.
3. Force a new ECS deployment to pick up the reverted configuration.
4. Investigate the recovery failure: wrong timestamp, missing migrations, or
   configuration mismatch.
5. Retry the recovery with a corrected timestamp if needed.

---

## Post-Recovery Checklist

Complete every item before marking the recovery as successful.

- [ ] Application `/health` endpoint returns `{"status": "ok"}`
- [ ] RLS policies are active on the recovered instance (`SELECT * FROM pg_policies`)
- [ ] The `breeyo_app` role exists and has correct grants
- [ ] Backup configuration is re-applied to the new instance (14-day retention, backup window, encryption, deletion protection)
- [ ] CloudWatch alarms are re-pointed to the new instance identifier
- [ ] RDS event subscription includes the new instance
- [ ] PITR verification passes: `./scripts/backup/verify-pitr.sh --instance-id <RECOVERY_ID>`
- [ ] Team has been notified of recovery completion
- [ ] Data loss window (if any) has been documented and communicated
- [ ] Old instance scheduled for deletion after 48-hour observation

---

## Monthly Testing Procedure

Test the recovery procedure against the **staging** environment monthly to ensure
it stays current and the team maintains familiarity.

### Test Steps

1. Run the PITR verification script to confirm backups are healthy:

   ```bash
   ./scripts/backup/verify-pitr.sh --instance-id breeyo-db-staging --region ap-south-1
   ```

2. Pick a recovery time 1 hour in the past and execute a full PITR restore
   against staging (Steps 2-8 from the PITR procedure above, using
   `breeyo-db-staging` as the source).

3. Verify data integrity on the restored staging instance.

4. Run the Breeyo API test suite against the restored instance to confirm
   all endpoints function correctly.

5. Document the test results: time to restore, data integrity verification
   outcome, and any issues encountered.

6. Delete the test recovery instance after verification:

   ```bash
   aws rds delete-db-instance \
     --db-instance-identifier breeyo-db-staging-recovery-YYYYMMDD-HHMM \
     --skip-final-snapshot \
     --region ap-south-1
   ```

7. File the test report in the team's ops log.

---

## Related Files

- `infra/aws/backup/rds-backup-config.md` -- Backup configuration reference
- `scripts/backup/verify-pitr.sh` -- Automated PITR verification script
- `.github/workflows/backup-verify.yml` -- Weekly CI verification workflow
