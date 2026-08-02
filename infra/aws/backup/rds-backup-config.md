# RDS Backup Configuration -- Breeyo PostgreSQL

Region: **ap-south-1** (AWS Mumbai -- India data residency per D-33)

This document covers the automated backup and point-in-time recovery (PITR) configuration
for the Breeyo PostgreSQL databases in staging and production environments.

---

## 1. RDS Instance Backup Settings

| Parameter                  | Value                  | Rationale                                                        |
|----------------------------|------------------------|------------------------------------------------------------------|
| BackupRetentionPeriod      | 14                     | 14 days of recovery points; exceeds PLT-06 minimum of 7 days    |
| PreferredBackupWindow      | `19:00-19:30` (UTC)    | 00:30--01:00 IST -- off-peak for Indian veterinary clinics       |
| CopyTagsToSnapshot         | true                   | Propagates cost-allocation and environment tags to snapshots     |
| DeletionProtection         | true                   | Prevents accidental `delete-db-instance` in production           |
| StorageEncrypted           | true                   | AES-256 via AWS KMS -- mandatory for medical/clinical data       |
| EnablePerformanceInsights  | true                   | Aids in diagnosing slow queries and backup-window performance    |

### PITR Behavior

With `BackupRetentionPeriod > 0`, RDS automatically enables continuous WAL archiving.
This provides a Recovery Point Objective (RPO) of approximately 5 minutes and allows
restoring to any second within the retention window.

---

## 2. AWS CLI Commands

### 2.1 Staging (`breeyo-db-staging`)

```bash
aws rds modify-db-instance \
  --db-instance-identifier breeyo-db-staging \
  --backup-retention-period 14 \
  --preferred-backup-window "19:00-19:30" \
  --copy-tags-to-snapshot \
  --deletion-protection \
  --region ap-south-1 \
  --apply-immediately
```

### 2.2 Production (`breeyo-db-production`)

```bash
aws rds modify-db-instance \
  --db-instance-identifier breeyo-db-production \
  --backup-retention-period 14 \
  --preferred-backup-window "19:00-19:30" \
  --copy-tags-to-snapshot \
  --deletion-protection \
  --region ap-south-1 \
  --apply-immediately
```

### 2.3 Verify Current Configuration

```bash
aws rds describe-db-instances \
  --db-instance-identifier breeyo-db-production \
  --region ap-south-1 \
  --query 'DBInstances[0].{
    BackupRetentionPeriod: BackupRetentionPeriod,
    PreferredBackupWindow: PreferredBackupWindow,
    LatestRestorableTime: LatestRestorableTime,
    StorageEncrypted: StorageEncrypted,
    DeletionProtection: DeletionProtection,
    CopyTagsToSnapshot: CopyTagsToSnapshot
  }' \
  --output table
```

---

## 3. CloudWatch Alarm for Low Storage (Backup Failure Indicator)

When free storage drops below 5 GB, automated backups may fail. This alarm provides
early warning.

```bash
aws cloudwatch put-metric-alarm \
  --alarm-name breeyo-rds-backup-failed-staging \
  --alarm-description "Alert when RDS free storage drops below 5 GB (staging)" \
  --namespace AWS/RDS \
  --metric-name FreeStorageSpace \
  --dimensions Name=DBInstanceIdentifier,Value=breeyo-db-staging \
  --statistic Minimum \
  --period 86400 \
  --evaluation-periods 1 \
  --threshold 5368709120 \
  --comparison-operator LessThanThreshold \
  --alarm-actions <SNS_TOPIC_ARN> \
  --region ap-south-1
```

Replace `<SNS_TOPIC_ARN>` with the actual SNS topic ARN configured for the Breeyo
ops team. Repeat with `breeyo-db-production` for the production alarm.

---

## 4. RDS Event Subscription for Backup Alerts

Subscribe to backup-related RDS events so the team receives SNS notifications on
backup start, completion, and failure.

```bash
aws rds create-event-subscription \
  --subscription-name breeyo-backup-alerts \
  --sns-topic-arn <SNS_TOPIC_ARN> \
  --source-type db-instance \
  --event-categories "backup" "failure" "recovery" \
  --region ap-south-1
```

This subscription covers all RDS instances in the account. To scope it to specific
instances, add `--source-ids breeyo-db-staging breeyo-db-production`.

---

## 5. Terraform Reference Block

If the team adopts IaC, the following Terraform resource captures the same settings:

```hcl
resource "aws_db_instance" "breeyo_db" {
  identifier = "breeyo-db-production"
  engine     = "postgres"
  engine_version = "16.4"

  instance_class    = "db.t3.medium"
  allocated_storage = 50

  # Backup configuration
  backup_retention_period   = 14
  backup_window             = "19:00-19:30"
  copy_tags_to_snapshot     = true
  deletion_protection       = true
  storage_encrypted         = true
  kms_key_id                = aws_kms_key.breeyo_rds.arn
  performance_insights_enabled = true

  # Network
  db_subnet_group_name   = aws_db_subnet_group.breeyo.name
  vpc_security_group_ids = [aws_security_group.breeyo_rds.id]

  tags = {
    Project     = "breeyo"
    Environment = "production"
    ManagedBy   = "terraform"
  }
}

resource "aws_cloudwatch_metric_alarm" "rds_low_storage" {
  alarm_name          = "breeyo-rds-low-storage-production"
  alarm_description   = "RDS free storage below 5 GB"
  namespace           = "AWS/RDS"
  metric_name         = "FreeStorageSpace"
  statistic           = "Minimum"
  period              = 86400
  evaluation_periods  = 1
  threshold           = 5368709120
  comparison_operator = "LessThanThreshold"
  alarm_actions       = [aws_sns_topic.breeyo_ops.arn]

  dimensions = {
    DBInstanceIdentifier = aws_db_instance.breeyo_db.identifier
  }
}

resource "aws_db_event_subscription" "backup_alerts" {
  name             = "breeyo-backup-alerts"
  sns_topic        = aws_sns_topic.breeyo_ops.arn
  source_type      = "db-instance"
  event_categories = ["backup", "failure", "recovery"]
  source_ids       = [aws_db_instance.breeyo_db.identifier]
}
```

---

## 6. Backup Verification Checklist

Run this checklist before Beta launch and monthly thereafter. The automated
`scripts/backup/verify-pitr.sh` script checks items 1-4 and 6 automatically.

- [ ] **Automated backups enabled**: `BackupRetentionPeriod` > 0 (target: 14)
- [ ] **PITR active**: `LatestRestorableTime` is within the last 5 minutes
- [ ] **Backup window is off-peak**: `PreferredBackupWindow` is `19:00-19:30` UTC
- [ ] **Encryption at rest enabled**: `StorageEncrypted` is `true`
- [ ] **CloudWatch alarm active**: `breeyo-rds-backup-failed-*` alarm exists and is in OK state
- [ ] **Deletion protection enabled**: `DeletionProtection` is `true`
- [ ] **At least one automated snapshot exists**: `aws rds describe-db-snapshots --snapshot-type automated` returns results
- [ ] **Recovery runbook reviewed**: `scripts/backup/recovery-runbook.md` is current

---

## Related Files

- `scripts/backup/verify-pitr.sh` -- Automated PITR verification script
- `scripts/backup/recovery-runbook.md` -- Step-by-step recovery procedure
- `.github/workflows/backup-verify.yml` -- Weekly CI verification workflow
