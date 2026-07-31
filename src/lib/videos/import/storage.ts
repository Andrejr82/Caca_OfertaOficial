export type ImportedStorageJob = { id: string; user_id: string; offer_id: string };

const imageKinds = new Set(["instagram-cover", "facebook-cover", "thumbnail", "reference-frame"]);

export function importedStoragePrefix(job: ImportedStorageJob) {
  return `videos/${job.user_id}/${job.offer_id}/${job.id}`;
}

export function importedAssetPath(job: ImportedStorageJob, kind: string) {
  const extension = imageKinds.has(kind) ? "jpg" : kind === "audio" ? "mp3" : "mp4";
  return `${importedStoragePrefix(job)}/${kind}.${extension}`;
}
