import { describe, expect, it } from 'vitest';
import {
  getVideoAssetManifest,
  selectProductionMotionMaster,
} from '@/lib/videos/asset-manifest';

describe('video asset manifest', () => {
  it('does not select the legacy master as production source', () => {
    const manifest = getVideoAssetManifest();
    expect(
      selectProductionMotionMaster({
        ...manifest,
        assets: manifest.assets.filter((asset) => asset.role === 'legacy'),
      }),
    ).toBeNull();
  });

  it('requires explicit approval and a hash for the motion master', () => {
    const manifest = getVideoAssetManifest();
    const proposed = selectProductionMotionMaster(manifest);
    expect(proposed).toBeNull();

    const approved = selectProductionMotionMaster({
      ...manifest,
      assets: manifest.assets.map((asset) =>
        asset.id === 'motion-master-v1'
          ? { ...asset, status: 'approved', sha256: 'a'.repeat(64), approvedAt: '2026-07-22' }
          : asset,
      ),
    });
    expect(approved?.id).toBe('motion-master-v1');
  });
});
