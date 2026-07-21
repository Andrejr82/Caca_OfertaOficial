import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const sql = readFileSync('supabase/migrations/20260721100000_classification_v2_foundation.sql', 'utf8')

describe('classification v2 schema', () => {
  it('keeps raw discovery, classification and groups separated with RLS', () => {
    for (const table of ['discovery_runs', 'discovery_items', 'offer_classifications', 'product_groups', 'product_group_members']) {
      expect(sql).toContain(`create table if not exists public.${table}`)
      expect(sql).toContain(`alter table public.${table} enable row level security`)
    }
    expect(sql).toContain('classifier_version text not null')
    expect(sql).toContain('rule_trace jsonb not null default')
    expect(sql).toContain("classification_status text not null check (classification_status in ('classified', 'review_required', 'excluded'))")
  })
})
