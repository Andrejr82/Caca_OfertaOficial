import type { Metadata } from "next";
import "@/app/globals.css";
import { officialBrand } from "@/lib/env";

export const metadata: Metadata = {
  title: officialBrand.appName,
  description: "Plataforma de automação de ofertas de afiliados."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
