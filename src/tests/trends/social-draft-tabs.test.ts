import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const projectRoot = resolve(__dirname, "../..", "..");

function readProjectFile(relativePath: string) {
  return readFileSync(resolve(projectRoot, relativePath), "utf8");
}

describe("abas de drafts sociais", () => {
  it("consulta drafts por canal e status draft nas quatro abas", () => {
    for (const channel of ["telegram", "instagram", "whatsapp", "facebook"]) {
      const page = readProjectFile(`src/app/(dashboard)/${channel}/page.tsx`);
      expect(page).toContain(`eq("channel", "${channel}")`);
      expect(page).toContain('eq("status", "draft")');
      expect(page).toContain("SocialChannelPostsView");
    }
  });

  it("mantém marketplace no contrato dos cards e filtros", () => {
    const view = readProjectFile("src/components/dashboard/social-channel-posts-view.tsx");
    const cards = [
      "src/components/telegram/telegram-actions.tsx",
      "src/components/instagram/instagram-actions.tsx",
      "src/components/whatsapp/whatsapp-actions.tsx",
      "src/components/facebook/facebook-actions.tsx",
    ].map(readProjectFile).join("\n");

    expect(view).toContain('"mercado-livre"');
    expect(view).toContain("post.offers?.marketplace");
    expect(cards).toContain("post.offers.platform");
    expect(cards).toContain("Marketplace:");
  });

  it("não acopla publicação automática à visualização dos drafts", () => {
    const view = readProjectFile("src/components/dashboard/social-channel-posts-view.tsx");
    expect(view).not.toMatch(/publish|publicar/i);
  });
});
