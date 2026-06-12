"use client";

import { useState } from "react";
import { Save, Sparkles, Loader2, AlertCircle } from "lucide-react";
import { createOfferAction } from "@/lib/offers/actions";
import { offerStatuses, platforms } from "@/types/domain";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";

export function OfferForm() {
  // Estados para autopreenchimento
  const [importUrl, setImportUrl] = useState("");
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState("");

  // Estados dos campos do formulário
  const [platform, setPlatform] = useState("Mercado Livre");
  const [status, setStatus] = useState("draft");
  const [productName, setProductName] = useState("");
  const [category, setCategory] = useState("");
  const [originalUrl, setOriginalUrl] = useState("");
  const [currentPrice, setCurrentPrice] = useState("");
  const [oldPrice, setOldPrice] = useState("");
  const [coupon, setCoupon] = useState("");
  const [rating, setRating] = useState("");
  const [image_url, setImageUrl] = useState("");
  const [notes, setNotes] = useState("");

  async function handleImport() {
    if (!importUrl) {
      setImportError("Insira a URL do produto.");
      return;
    }

    setImportLoading(true);
    setImportError("");

    try {
      const response = await fetch("/api/scraper/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: importUrl })
      });
      const data = await response.json();

      if (response.ok && data.ok) {
        const prod = data.product;
        setProductName(prod.product_name || "");
        setOriginalUrl(prod.original_url || importUrl);
        setImageUrl(prod.image_url || "");
        setCurrentPrice(prod.current_price ? String(prod.current_price) : "");
        setOldPrice(prod.old_price ? String(prod.old_price) : "");
        setRating(prod.rating ? String(prod.rating) : "");
        setPlatform("Mercado Livre");
        setImportUrl("");
      } else {
        setImportError(data.message || "Erro ao importar produto do Mercado Livre.");
      }
    } catch {
      setImportError("Erro de conexão ao tentar raspar o produto.");
    } finally {
      setImportLoading(false);
    }
  }

  return (
    <div className="grid gap-4 rounded-lg border border-moss/10 bg-white p-5 shadow-panel">
      {/* Seção 1: Importador Inteligente por Link */}
      <div className="border-b border-moss/10 pb-4 mb-2">
        <h3 className="font-bold text-sm text-ink mb-2 flex items-center gap-1.5">
          <Sparkles size={16} className="text-moss" />
          Importação Rápida (Mercado Livre)
        </h3>
        <div className="flex gap-2">
          <Input 
            value={importUrl} 
            onChange={(e) => setImportUrl(e.target.value)}
            placeholder="Cole o link do produto do Mercado Livre aqui..." 
            type="url"
            className="flex-1 min-h-10 text-sm"
          />
          <Button 
            type="button" 
            disabled={importLoading} 
            onClick={handleImport}
            className="bg-moss text-white hover:bg-ink shrink-0"
          >
            {importLoading ? (
              <>
                <Loader2 className="animate-spin" size={14} />
                Importando...
              </>
            ) : (
              "Importar"
            )}
          </Button>
        </div>
        {importError && (
          <p className="text-xs text-red-500 mt-1.5 flex items-center gap-1 font-semibold">
            <AlertCircle size={12} />
            {importError}
          </p>
        )}
      </div>

      {/* Formulário Principal */}
      <form action={createOfferAction} className="grid gap-4">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Plataforma">
            <Select 
              name="platform" 
              value={platform} 
              onChange={(e) => setPlatform(e.target.value)}
              required
            >
              {platforms.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </Select>
          </Field>
          <Field label="Status">
            <Select 
              name="status" 
              value={status} 
              onChange={(e) => setStatus(e.target.value)}
            >
              {offerStatuses.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Produto">
          <Input 
            name="product_name" 
            value={productName} 
            onChange={(e) => setProductName(e.target.value)}
            required 
            placeholder="Ex.: Fone Bluetooth com ANC" 
          />
        </Field>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Categoria">
            <Input 
              name="category" 
              value={category} 
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Eletrônicos" 
            />
          </Field>
          <Field label="Link original">
            <Input 
              name="original_url" 
              value={originalUrl} 
              onChange={(e) => setOriginalUrl(e.target.value)}
              required 
              type="url" 
              placeholder="https://..." 
            />
          </Field>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Preço atual">
            <Input 
              name="current_price" 
              value={currentPrice} 
              onChange={(e) => setCurrentPrice(e.target.value)}
              required 
              min="0" 
              step="0.01" 
              type="number" 
            />
          </Field>
          <Field label="Preço anterior">
            <Input 
              name="old_price" 
              value={oldPrice} 
              onChange={(e) => setOldPrice(e.target.value)}
              min="0" 
              step="0.01" 
              type="number" 
            />
          </Field>
          <Field label="Cupom">
            <Input 
              name="coupon" 
              value={coupon} 
              onChange={(e) => setCoupon(e.target.value)}
            />
          </Field>
        </div>
        <div className="grid gap-4 md:grid-cols-4">
          <Field label="Avaliação">
            <Input 
              name="rating" 
              value={rating} 
              onChange={(e) => setRating(e.target.value)}
              max="5" 
              min="0" 
              step="0.1" 
              type="number" 
            />
          </Field>
          <Field label="Comissão estimada">
            <Input name="estimated_commission" min="0" step="0.01" type="number" />
          </Field>
          <Field label="Taxa de comissão">
            <Input name="commission_rate" min="0" step="0.01" type="number" />
          </Field>
          <Field label="Sazonalidade">
            <Input name="seasonality" max="2" min="0" step="0.1" type="number" />
          </Field>
        </div>
        <Field label="URL da imagem">
          <Input 
            name="image_url" 
            value={image_url} 
            onChange={(e) => setImageUrl(e.target.value)}
            type="url" 
            placeholder="https://..." 
          />
        </Field>
        <Field label="Observações">
          <Textarea 
            name="notes" 
            value={notes} 
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>
        <Button className="justify-self-start bg-moss text-white hover:bg-ink" type="submit">
          <Save size={16} />
          Salvar oferta
        </Button>
      </form>
    </div>
  );
}
