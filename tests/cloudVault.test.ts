import {describe,expect,it} from 'vitest';
import {isSafeVaultName,CLOUD_VAULT_LIMIT} from '../src/cloudVault';

describe('encrypted cloud vault safety',()=>{
 const valid='workspace-2026-11-15T13-50-01-000Z-123e4567-e89b-42d3-a456-426614174000.pwenc';
 it('accepts only the generated immutable encrypted backup filename',()=>{
  expect(isSafeVaultName(valid)).toBe(true);
  expect(isSafeVaultName('../'+valid)).toBe(false);
  expect(isSafeVaultName('another-user/'+valid)).toBe(false);
  expect(isSafeVaultName(valid.replace('.pwenc','.zip'))).toBe(false);
  expect(isSafeVaultName('workspace-2026-11-15T13-50-01-000Z-../../private.pwenc')).toBe(false);
 });
 it('limits encrypted uploads below 50MiB',()=>{
  expect(CLOUD_VAULT_LIMIT).toBeLessThan(50*1024*1024);
 });
});
