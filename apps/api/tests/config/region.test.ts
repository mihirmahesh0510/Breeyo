import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

/**
 * Region configuration verification tests.
 *
 * These tests ensure that the project is consistently configured
 * for the ap-south-1 (Mumbai) AWS region across all relevant files.
 */

// ESM-compatible __dirname
const __filename_local = fileURLToPath(import.meta.url);
const __dirname_local = dirname(__filename_local);

// The repository root is 4 levels up from this test file:
// apps/api/tests/config/region.test.ts -> repo root
const REPO_ROOT = resolve(__dirname_local, '..', '..', '..', '..');

describe('Region configuration', () => {
  it('should default AWS_REGION to ap-south-1 in the test environment', () => {
    // The test setup file sets AWS_REGION=ap-south-1
    expect(process.env.AWS_REGION).toBe('ap-south-1');
  });

  it('should specify AWS_REGION=ap-south-1 in .env.example', () => {
    const envExample = readFileSync(
      resolve(REPO_ROOT, '.env.example'),
      'utf-8',
    );
    expect(envExample).toContain('AWS_REGION=ap-south-1');
  });

  it('should reference ap-south-1 in deploy-staging.yml', () => {
    const stagingYml = readFileSync(
      resolve(REPO_ROOT, '.github', 'workflows', 'deploy-staging.yml'),
      'utf-8',
    );
    expect(stagingYml).toContain('ap-south-1');
  });

  it('should have deploy-production.yml that references ap-south-1', () => {
    const productionYml = readFileSync(
      resolve(REPO_ROOT, '.github', 'workflows', 'deploy-production.yml'),
      'utf-8',
    );
    expect(productionYml).toContain('ap-south-1');
  });
});
