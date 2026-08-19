import { afterEach, describe, expect, it, vi } from "vitest";
import { getGoogleDriveIntegrationStatus, validateDriveVideo, validateInspectedVideo } from "@/lib/videos/google-drive";

const DRIVE_ENV = [
  "GOOGLE_DRIVE_CLIENT_ID",
  "GOOGLE_DRIVE_CLIENT_SECRET",
  "GOOGLE_DRIVE_REFRESH_TOKEN",
  "GOOGLE_DRIVE_FOLDER_ID",
] as const;

afterEach(() => {
  for (const key of DRIVE_ENV) vi.unstubAllEnvs();
});

describe("Google Drive video integration status", () => {
  it("reports missing OAuth configuration without throwing", () => {
    vi.stubEnv("GOOGLE_DRIVE_CLIENT_ID", "");
    vi.stubEnv("GOOGLE_DRIVE_CLIENT_SECRET", "");
    vi.stubEnv("GOOGLE_DRIVE_REFRESH_TOKEN", "");
    vi.stubEnv("GOOGLE_DRIVE_FOLDER_ID", "");

    const status = getGoogleDriveIntegrationStatus();

    expect(status.configured).toBe(false);
    expect(status.missing).toEqual([
      "GOOGLE_DRIVE_CLIENT_ID",
      "GOOGLE_DRIVE_CLIENT_SECRET",
      "GOOGLE_DRIVE_REFRESH_TOKEN",
    ]);
    expect(status.folderId).toBe("1tj6S-Gr7hxt5RNRIAd7BkpR8_2tuGaFB");
  });

  it("reports ready configuration and preserves a custom folder", () => {
    vi.stubEnv("GOOGLE_DRIVE_CLIENT_ID", "client-id");
    vi.stubEnv("GOOGLE_DRIVE_CLIENT_SECRET", "client-secret");
    vi.stubEnv("GOOGLE_DRIVE_REFRESH_TOKEN", "refresh-token");
    vi.stubEnv("GOOGLE_DRIVE_FOLDER_ID", "folder-123");

    const status = getGoogleDriveIntegrationStatus();

    expect(status.configured).toBe(true);
    expect(status.missing).toEqual([]);
    expect(status.folderId).toBe("folder-123");
  });
});

describe("Google Drive video validation", () => {
  it("does not reject an MP4 just because Drive metadata is missing", () => {
    expect(validateDriveVideo({
      id: "drive-file-1",
      name: "video.mp4",
      mimeType: "video/mp4",
      size: String(2 * 1024 * 1024),
    })).toBeNull();
  });

  it("validates 9:16 and duration using metadata inspected from the actual MP4", () => {
    expect(validateInspectedVideo({ width: 720, height: 1280, durationSeconds: 10 })).toBeNull();
    expect(validateInspectedVideo({ width: 1920, height: 1080, durationSeconds: 10 })).toBe("O vídeo precisa estar no formato vertical 9:16.");
    expect(validateInspectedVideo({ width: 720, height: 1280, durationSeconds: 2 })).toBe("A duração precisa estar entre 3 e 90 segundos.");
  });
});
