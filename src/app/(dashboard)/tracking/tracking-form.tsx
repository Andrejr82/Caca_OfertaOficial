"use client";

import { useActionState, useEffect, useState } from "react";
import { generateAffiliateLinkAction } from "@/lib/offers/actions";
import { channels, Offer } from "@/types/domain";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/field";
import { Link2, CheckCircle2, AlertCircle } from "lucide-react";

export function TrackingForm({ offers }: { offers: Offer[] }) {
  const [state, formAction, isPending] = useActionState(generateAffiliateLinkAction, null);
  const [selectedOffer, setSelectedOffer] = useState("");

  return (
    <div className="grid gap-4">
      <form action={formAction} className="grid gap-4 md:grid-cols-2 lg:grid-cols-5 items-end">
        <div className="lg:col-span-2">
          <Field label="Oferta / Produto">
            <Select name="offer_id" required value={selectedOffer} onChange={(e) => setSelectedOffer(e.target.value)}>
              <option value="">Selecione uma oferta...</option>
              <option value="manual" className="font-bold text-emerald-400">+ Inserir Link Avulso</option>
              {offers.map((offer) => (
                <option key={offer.id} value={offer.id}>
                  {offer.product_name} ({offer.platform})
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {selectedOffer === "manual" && (
          <div className="lg:col-span-5">
            <Field label="Nome do Produto / Oferta (Para Identificação)">
              <input
                type="text"
                name="product_name_manual"
                placeholder="Ex: Tênis Nike Preto, Fone Bluetooth, etc."
                className="glass-input focus-ring w-full rounded-lg py-2.5 px-3.5 text-sm"
                required
              />
            </Field>
          </div>
        )}
        <div className="lg:col-span-3">
          <Field label="Link de Afiliado (URL Convertida)">
            <input
              type="url"
              name="affiliate_url"
              placeholder="Cole o link de afiliado da loja..."
              className="glass-input focus-ring w-full rounded-lg py-2.5 px-3.5 text-sm"
              required
            />
          </Field>
        </div>
        <div className="lg:col-span-2">
          <Field label="Canal / Destino">
            <Select name="channel" required>
              {channels.map((channel) => (
                <option key={channel} value={channel}>
                  {channel.toUpperCase()}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="lg:col-span-2">
          <Field label="UTM Source (Origem)">
            <input
              type="text"
              name="utm_source"
              placeholder="Ex: instagram, site"
              className="glass-input focus-ring w-full rounded-lg py-2.5 px-3.5 text-sm"
            />
          </Field>
        </div>
        <div className="lg:col-span-1">
          <Field label="UTM Campaign (Campanha)">
            <input
              type="text"
              name="utm_campaign"
              placeholder="Ex: black_friday"
              className="glass-input focus-ring w-full rounded-lg py-2.5 px-3.5 text-sm"
            />
          </Field>
        </div>
        <input type="hidden" name="utm_medium" value="social" />

        <div className="lg:col-span-5 flex items-center justify-between mt-2">
          <div className="text-sm font-medium">
            {state?.ok === true && (
              <span className="flex items-center gap-1.5 text-emerald-400">
                <CheckCircle2 size={16} />
                {state.message}
              </span>
            )}
            {state?.ok === false && (
              <span className="flex items-center gap-1.5 text-red-400">
                <AlertCircle size={16} />
                {state.message}
              </span>
            )}
          </div>
          <Button disabled={isPending} type="submit" variant="gradient">
            <Link2 size={16} />
            {isPending ? "Gerando..." : "Gerar Link de Afiliado"}
          </Button>
        </div>
      </form>
    </div>
  );
}
