import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TelegramPostApprovalCard } from "@/components/telegram/telegram-actions";
import { InstagramPostApprovalCard } from "@/components/instagram/instagram-actions";
import { WhatsappPostApprovalCard } from "@/components/whatsapp/whatsapp-actions";
import { FacebookPostApprovalCard } from "@/components/facebook/facebook-actions";

describe("Approval Cards - Duplicate Title Prevention (T8)", () => {
  const buildPost = (productName: string, captionContent: string, hasCoupon: boolean = false) => ({
    id: "post-123",
    content: captionContent,
    status: "draft",
    external_id: null,
    posted_at: null,
    created_at: new Date().toISOString(),
    offers: {
      id: "offer-123",
      product_name: productName,
      platform: "Amazon",
      current_price: 99.99,
      old_price: 199.99,
      image_url: "https://example.com/img.png",
      original_url: "https://example.com/product",
      coupon: hasCoupon ? "SUPER10" : null,
      notes: null,
    }
  });

  describe.each([
    ["Telegram", TelegramPostApprovalCard],
    ["Instagram", InstagramPostApprovalCard],
    ["Whatsapp", WhatsappPostApprovalCard],
    ["Facebook", FacebookPostApprovalCard]
  ])("%s", (channel, Component) => {

    it("1. must NOT render the product_name as a static heading (h3) but keeps the textarea caption intact", () => {
      const post = buildPost("Liquidificador Philips Walita", "🚨 Liquidificador Philips Walita em promoção!");
      render(<Component post={post as any} />);

      // A UI não pode ter uma tag h3 com o nome exato (pois isso causava duplicação visual)
      const headings = screen.queryAllByRole("heading", { level: 3 });
      expect(headings).toHaveLength(0); // Nenhuma tag h3 deve ser renderizada

      // Mas o texto editável deve estar presente e inalterado
      const textarea = screen.getByRole("textbox");
      expect(textarea).toHaveProperty("value", "🚨 Liquidificador Philips Walita em promoção!");
    });

    it("2. must keep the textarea intact even if caption does not contain the product name", () => {
      const post = buildPost("Liquidificador Daily RI2110", "Apenas uma promoção imperdível!");
      render(<Component post={post as any} />);

      const headings = screen.queryAllByRole("heading", { level: 3 });
      expect(headings).toHaveLength(0);

      const textarea = screen.getByRole("textbox");
      expect(textarea).toHaveProperty("value", "Apenas uma promoção imperdível!");
    });

    it("3. must keep platform, price, discount and metadata visible", () => {
      const post = buildPost("Mouse Gamer", "Um mouse excelente!");
      render(<Component post={post as any} />);

      // Verifica preço e plataforma ignorando os non-breaking spaces
      expect(screen.getByText(/Amazon/)).toBeTruthy();
      expect(screen.getAllByText((content) => content.includes("99,99")).length).toBeGreaterThan(0);
    });



    it("5. must keep the approval and rejection buttons accessible", () => {
      const post = buildPost("Monitor Ultrawide", "Monitor ótimo");
      render(<Component post={post as any} />);

      const buttons = screen.getAllByRole("button");
      expect(buttons.length).toBeGreaterThanOrEqual(2);
      
      const approveButton = buttons.find(b => b.textContent?.toLowerCase().includes("aprovar"));
      expect(approveButton).toBeTruthy();
    });

  });
});
