import manifest from '../../../assets/video/manifest.json';

export type VideoAsset = {
  id: string;
  role: 'legacy' | 'motion-master' | 'avatar' | 'template';
  status: 'archived' | 'proposed' | 'approved';
  path: string;
  sha256: string | null;
  approvedAt: string | null;
};

export type VideoAssetManifest = { version: number; assets: VideoAsset[] };

export function getVideoAssetManifest(): VideoAssetManifest {
  return manifest as VideoAssetManifest;
}

export function selectProductionMotionMaster(
  input: VideoAssetManifest = getVideoAssetManifest(),
): VideoAsset | null {
  return input.assets.find(
    (asset) =>
      asset.role === 'motion-master' &&
      asset.status === 'approved' &&
      Boolean(asset.sha256),
  ) ?? null;
}
