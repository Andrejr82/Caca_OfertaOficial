import type { Metadata, Viewport } from "next";
import "@/app/globals.css";
import { officialBrand } from "@/lib/env";

export const metadata: Metadata = {
  title: officialBrand.appName,
  description: "Plataforma de automação de ofertas de afiliados."
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
