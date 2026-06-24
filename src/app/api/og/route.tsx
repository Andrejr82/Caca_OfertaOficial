import { ImageResponse } from 'next/og';

export const runtime = 'edge';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const title = searchParams.get('title') || 'Oferta Imperdível';
    const price = searchParams.get('price') || 'R$ 0,00';
    const oldPrice = searchParams.get('oldPrice');
    const imageUrl = searchParams.get('imageUrl') || 'https://res.cloudinary.com/demo/image/upload/sample.jpg';
    const platform = searchParams.get('platform') || 'Caça Ofertas';

    // Mapeamento de Cores Oficiais das Marcas
    const platformColors: Record<string, string> = {
      'mercado livre': 'linear-gradient(135deg, #FFE600 0%, #FFB000 100%)', // Amarelo Mercado Livre
      'amazon': 'linear-gradient(135deg, #131A22 0%, #232F3E 100%)', // Azul escuro Amazon
      'shopee': 'linear-gradient(135deg, #f53d2d 0%, #ff6633 100%)', // Laranja Shopee
      'magalu': 'linear-gradient(135deg, #0086FF 0%, #0045FF 100%)', // Azul Magalu
      'magazine luiza': 'linear-gradient(135deg, #0086FF 0%, #0045FF 100%)', // Azul Magalu
      'aliexpress': 'linear-gradient(135deg, #FF4747 0%, #CC0000 100%)', // Vermelho AliExpress
      'default': 'linear-gradient(135deg, #FF416C 0%, #FF4B2B 100%)', // Gradiente Premium Padrão
    };

    // Tentar encontrar a cor da plataforma (ignorando maiúsculas/minúsculas)
    const normalizedPlatform = platform.toLowerCase().trim();
    let bgGradient = platformColors['default'];
    for (const key in platformColors) {
      if (normalizedPlatform.includes(key)) {
        bgGradient = platformColors[key];
        break;
      }
    }

    return new ImageResponse(
      (
        <div
          style={{
            height: '100%',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundImage: bgGradient,
            fontFamily: '"Inter", sans-serif',
            padding: '60px',
          }}
        >
          {/* Main Card */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              backgroundColor: '#ffffff',
              borderRadius: '40px',
              width: '100%',
              height: '100%',
              boxShadow: '0 30px 60px rgba(0,0,0,0.3)',
              overflow: 'hidden',
            }}
          >
            {/* Header Row (Badges) */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                width: '100%',
                padding: '40px 40px 0 40px',
              }}
            >
              {/* Platform Badge */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: '#f3f4f6',
                  color: '#374151',
                  padding: '15px 30px',
                  borderRadius: '50px',
                  fontSize: 24,
                  fontWeight: 'bold',
                  border: '2px solid #e5e7eb',
                }}
              >
                🛒 Na {platform}
              </div>

              {/* Top Badge */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: '#111111',
                  color: '#ffffff',
                  padding: '15px 30px',
                  borderRadius: '50px',
                  fontSize: 26,
                  fontWeight: '900',
                  letterSpacing: '2px',
                  boxShadow: '0 10px 20px rgba(0,0,0,0.2)',
                }}
              >
                🔥 SUPER OFERTA
              </div>
            </div>

            {/* Image Section */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexGrow: 1,
                width: '100%',
                padding: '20px',
              }}
            >
              <img
                src={imageUrl}
                style={{
                  objectFit: 'contain',
                  maxWidth: '80%',
                  maxHeight: '400px',
                }}
              />
            </div>

            {/* Details Section */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: '#fafafa',
                width: '100%',
                padding: '40px',
                borderTop: '2px solid #f3f4f6',
                minHeight: '35%',
              }}
            >
              {/* Product Title */}
              <div
                style={{
                  display: 'flex',
                  fontSize: 42,
                  fontWeight: '800',
                  color: '#111827',
                  textAlign: 'center',
                  marginBottom: '20px',
                  lineHeight: 1.2,
                  maxHeight: '100px',
                  overflow: 'hidden',
                }}
              >
                {title}
              </div>

              {/* Price Container */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '30px',
                  marginTop: '10px',
                }}
              >
                {oldPrice && oldPrice !== 'null' && (
                  <div
                    style={{
                      display: 'flex',
                      fontSize: 36,
                      color: '#9CA3AF',
                      textDecoration: 'line-through',
                      fontWeight: '600',
                    }}
                  >
                    De {oldPrice}
                  </div>
                )}
                <div
                  style={{
                    display: 'flex',
                    fontSize: 72,
                    fontWeight: '900',
                    color: '#FF4B2B',
                  }}
                >
                  Por {price}
                </div>
              </div>
            </div>
          </div>
        </div>
      ),
      {
        width: 1080,
        height: 1080,
      }
    );
  } catch (e: any) {
    console.log(`[OG Image Error] ${e.message}`);
    return new Response(`Failed to generate the image`, {
      status: 500,
    });
  }
}
