import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration=fs.readFileSync(new URL('../supabase/migrations/20260926_finance_ledger_foundation.sql',import.meta.url),'utf8');
const adapter=fs.readFileSync(new URL('../js/finance-ledger.js',import.meta.url),'utf8');

test('ledger foundation defines private financial tables',()=>{
  assert.match(migration,/create table if not exists private\.finance_accounts/);
  assert.match(migration,/create table if not exists private\.finance_ledger_entries/);
  assert.match(migration,/create table if not exists private\.finance_integration_events/);
  assert.match(migration,/create table if not exists private\.finance_audit_log/);
});

test('ledger foundation protects external idempotency at database level',()=>{
  assert.match(migration,/create unique index if not exists finance_ledger_external_unique/);
  assert.match(migration,/on private\.finance_ledger_entries\(source, external_id\)/);
});

test('ledger writes lock the account before changing its balance',()=>{
  assert.match(migration,/from private\.finance_accounts where id=p_account_id for update/);
  assert.match(migration,/update private\.finance_accounts set current_balance=current_balance\+v_delta/);
});

test('transfers lock both accounts in deterministic order',()=>{
  assert.match(migration,/if p_from_account_id<p_to_account_id then/);
  assert.match(migration,/for update/);
  assert.match(migration,/current_balance=current_balance-p_amount/);
  assert.match(migration,/current_balance=current_balance\+p_amount/);
});

test('browser adapter uses authenticated RPCs instead of direct private-table access',()=>{
  assert.match(adapter,/\/rest\/v1\/rpc\//);
  assert.match(adapter,/PanoramaAuth\?\.headers/);
  assert.match(adapter,/post_finance_entry/);
  assert.match(adapter,/post_finance_transfer/);
});
