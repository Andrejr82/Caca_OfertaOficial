import { Metadata } from "next";
import { officialBrand } from "@/lib/env";

export const metadata: Metadata = {
  title: `Links e Ofertas | ${officialBrand.appName}`,
  description: "Confira todos os produtos, achadinhos e ofertas postadas recentemente nas nossas redes sociais.",
  robots: "index, follow",
};

export default function BioLayout({ children }: { children: React.ReactNode }) {
  // Retorna os filhos sem a sidebar administrativa (que provavelmente está em app/dashboard/layout)
  // O layout base do Next.js (app/layout.tsx) já contém <html> e <body>.
  return (
    <>
      {children}
    </>
  );
}
