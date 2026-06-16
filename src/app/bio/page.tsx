import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import Image from "next/image";
import Link from "next/link";
import { officialBrand } from "@/lib/env";

export const dynamic = "force-dynamic";

// Tipagem esperada do retorno do Supabase
type BioPost = {
  id: string;
  posted_at: string;
  offers: {
    product_name: string;
    image_url: string;
    current_price: number;
    old_price: number | null;
  };
  affiliate_links: {
    tracked_url: string;
  };
};

export default async function BioPage() {
  const supabase = createSupabaseAdminClient();
  let posts: BioPost[] = [];

  if (supabase) {
    const { data, error } = await supabase
      .from("posts")
      .select(`
        id,
        posted_at,
        offers (
          product_name,
          image_url,
          current_price,
          old_price
        ),
        affiliate_links (
          tracked_url
        )
      `)
      .eq("channel", "instagram")
      .eq("status", "published")
      .not("affiliate_link_id", "is", null)
      .order("posted_at", { ascending: false })
      .limit(200);

    if (!error && data) {
      // O Supabase retorna os joins como array ou objeto dependendo da FK. 
      // Como posts pertence a 1 offer e 1 affiliate_link, tipamos asssim:
      posts = data as unknown as BioPost[];
    }
  }

  return (
    <div className="min-h-screen bg-paper text-ink pb-12 font-sans">
      {/* Header Profile */}
      <header className="pt-12 pb-8 px-4 text-center max-w-2xl mx-auto flex flex-col items-center">
        <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-moss shadow-glow mb-4 bg-surface flex items-center justify-center">
          <span className="text-3xl">🛒</span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight mb-2">
          {officialBrand.appName}
        </h1>
        <p className="text-sm text-gray-400 mb-6">
          Encontre aqui todas as ofertas e achadinhos postados recentemente no nosso Instagram.
        </p>
      </header>

      {/* Grid de Produtos */}
      <main className="px-4 max-w-5xl mx-auto">
        {posts.length === 0 ? (
          <div className="text-center text-gray-500 py-12">
            <p>Nenhuma oferta encontrada no momento.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {posts.map((post) => {
              const offer = post.offers;
              const link = post.affiliate_links?.tracked_url || "#";
              
              if (!offer) return null; // Prevenção contra dados órfãos

              return (
                <Link
                  key={post.id}
                  href={link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex flex-col bg-surface border border-border-glass rounded-2xl overflow-hidden hover:shadow-card-hover hover:border-moss/30 transition-all duration-300"
                >
                  {/* Imagem do Produto */}
                  <div className="relative w-full aspect-square bg-white flex items-center justify-center p-4">
                    {offer.image_url ? (
                      /* Usamos tag img nativa para não ter problema com domínios externos do next/image não configurados */
                      <img
                        src={offer.image_url}
                        alt={offer.product_name}
                        className="object-contain w-full h-full group-hover:scale-105 transition-transform duration-500"
                        loading="lazy"
                      />
                    ) : (
                      <span className="text-gray-300">Sem Imagem</span>
                    )}
                    
                    {/* Badge de Desconto */}
                    {offer.old_price && offer.old_price > offer.current_price && (
                      <div className="absolute top-3 right-3 bg-clay text-white text-xs font-bold px-2 py-1 rounded-md shadow-lg">
                        {Math.round(((offer.old_price - offer.current_price) / offer.old_price) * 100)}% OFF
                      </div>
                    )}
                  </div>

                  {/* Informações */}
                  <div className="p-5 flex flex-col flex-grow">
                    <h2 className="text-sm font-medium text-gray-200 line-clamp-2 mb-3 flex-grow">
                      {offer.product_name}
                    </h2>
                    
                    <div className="flex flex-col gap-1 mb-4">
                      {offer.old_price && offer.old_price > offer.current_price && (
                        <span className="text-xs text-gray-500 line-through">
                          R$ {offer.old_price.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </span>
                      )}
                      <span className="text-lg font-bold text-moss">
                        R$ {offer.current_price.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                      </span>
                    </div>

                    <button className="w-full bg-moss/10 hover:bg-moss text-moss hover:text-white border border-moss/50 font-semibold py-2.5 rounded-xl transition-colors duration-300">
                      Pegar Oferta
                    </button>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
