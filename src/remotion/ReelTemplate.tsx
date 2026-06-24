import React from 'react';
import {
  AbsoluteFill,
  Img,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
  Sequence,
} from 'remotion';

export type ReelTemplateProps = {
  productName: string;
  originalPrice: string;
  currentPrice: string;
  imageUrl: string;
};

export const ReelTemplate: React.FC<ReelTemplateProps> = ({
  productName,
  originalPrice,
  currentPrice,
  imageUrl,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Animação de Surgimento
  const popIn = spring({ frame: frame - 5, fps, config: { damping: 14 } });
  const pricePop = spring({ frame: frame - 10, fps, config: { damping: 12 } });
  
  // Efeito de pulso para a oferta
  const pulse = interpolate(Math.sin(frame / 6), [-1, 1], [0.95, 1.05]);

  return (
    <AbsoluteFill style={{ backgroundColor: '#0B132B', fontFamily: 'sans-serif', overflow: 'hidden' }}>
      
      {/* Luz de Fundo (Glow) */}
      <div style={{
        position: 'absolute',
        top: '40%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 1000,
        height: 1000,
        background: 'radial-gradient(circle, rgba(255,215,0,0.25) 0%, rgba(11,19,43,0) 70%)',
        zIndex: 0
      }} />

      {/* 1. Header: Logo e Destaque */}
      <Sequence from={0}>
        <div style={{ 
          width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 100, zIndex: 1 
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <span style={{ fontSize: 90, filter: 'drop-shadow(0 0 20px rgba(255,150,0,0.8))' }}>🔥</span>
            <h1 style={{ color: '#FFD700', fontSize: 85, fontWeight: '900', margin: 0, letterSpacing: -2 }}>
              CAÇA OFERTA
            </h1>
          </div>
          <h2 style={{ color: '#FFFFFF', fontSize: 50, fontWeight: 'bold', margin: '10px 0 0 0' }}>
            Destaque do Dia
          </h2>
        </div>
      </Sequence>

      {/* 2. Tag: Oferta Imperdível */}
      <Sequence from={5}>
        <div style={{ 
          width: '100%', display: 'flex', justifyContent: 'center', marginTop: 320, zIndex: 2, transform: `scale(${popIn})`
        }}>
          <div style={{ 
            backgroundColor: '#FFFFFF', borderRadius: 40, padding: '15px 40px', textAlign: 'center', boxShadow: '0 10px 30px rgba(0,0,0,0.5)'
          }}>
            <div style={{ color: '#000000', fontSize: 35, fontWeight: '900' }}>
              OFERTA IMPERDÍVEL ⚡
            </div>
            <div style={{ color: '#555555', fontSize: 25, fontWeight: 'bold', marginTop: 5 }}>
              📅 Válido por 24h
            </div>
          </div>
        </div>
      </Sequence>

      {/* 3. Bloco Central Integrado (Card + Preços + Tag) */}
      <Sequence from={0}>
        <div style={{ 
          position: 'absolute', top: 430, left: '50%', 
          transform: `translateX(-50%)`, 
          width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 3
        }}>
          
          {/* Card do Produto (Branco) */}
          <div style={{ 
            width: 860, height: 850, backgroundColor: '#FFFFFF', borderRadius: 50, display: 'flex', flexDirection: 'column',
            alignItems: 'center', padding: '20px', boxShadow: '0 0 50px rgba(255, 255, 255, 0.1)'
          }}>
            <div style={{ width: '100%', height: 600, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
              <Img src={imageUrl} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
            </div>
            <h3 style={{ 
              color: '#000000', fontSize: 45, fontWeight: 'bold', textAlign: 'center', marginTop: 15, width: '95%',
              display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden'
            }}>
              {productName}
            </h3>
          </div>

          {/* Banner de Preços (Azul Escuro) */}
          <div style={{ 
            width: 900, backgroundColor: '#0A1128', borderRadius: 40, padding: '40px 20px 60px 20px', 
            display: 'flex', flexDirection: 'column', alignItems: 'center', boxShadow: '0 20px 40px rgba(0,0,0,0.8)',
            border: '2px solid rgba(255,255,255,0.1)', marginTop: -60, zIndex: 4, transform: `scale(${pricePop})`
          }}>
            {originalPrice && originalPrice !== currentPrice && (
              <div style={{ color: '#888888', fontSize: 40, fontWeight: 'bold', textDecoration: 'line-through' }}>
                DE: R$ {originalPrice}
              </div>
            )}
            <div style={{ color: '#FFD700', fontSize: 90, fontWeight: '900', marginTop: 10, textShadow: '0 5px 20px rgba(255,215,0,0.3)' }}>
              POR: R$ {currentPrice}
            </div>
          </div>

          {/* Tag de Escassez (Amarela) */}
          <div style={{ 
            transform: `scale(${interpolate(pricePop, [0, 1], [0, pulse])})`, 
            backgroundColor: '#FFD700', borderRadius: 20, padding: '15px 70px', 
            display: 'flex', flexDirection: 'column', alignItems: 'center', boxShadow: '0 10px 40px rgba(255,215,0,0.5)',
            clipPath: 'polygon(5% 0%, 100% 0%, 95% 100%, 0% 100%)', marginTop: -40, zIndex: 5
          }}>
            <div style={{ color: '#000000', fontSize: 50, fontWeight: '900' }}>
              🔥 OFERTA LIMITADA!
            </div>
          </div>

        </div>
      </Sequence>

      {/* 4. Botão Comprar Agora no Rodapé */}
      <Sequence from={0}>
        <AbsoluteFill style={{ justifyContent: 'flex-end', zIndex: 6 }}>
          <div style={{ 
            background: 'linear-gradient(90deg, #FFB800 0%, #FFD700 50%, #FFB800 100%)', 
            width: '100%', height: 200, display: 'flex', flexDirection: 'column', 
            justifyContent: 'center', alignItems: 'center', borderTopLeftRadius: 50, borderTopRightRadius: 50,
            boxShadow: '0 -15px 50px rgba(255,215,0,0.5)'
          }}>
            <div style={{ 
              color: '#000000', fontSize: 65, fontWeight: '900', display: 'flex', alignItems: 'center', gap: 20,
              transform: `scale(${pulse})`, textShadow: '0 5px 15px rgba(0,0,0,0.2)'
            }}>
              👉 COMPRAR AGORA 🛒
            </div>
            <div style={{ 
              color: '#D10000', fontSize: 35, fontWeight: '900', marginTop: 15, 
              backgroundColor: '#FFFFFF', padding: '10px 40px', borderRadius: 30,
              boxShadow: '0 5px 15px rgba(0,0,0,0.2)', textTransform: 'uppercase', letterSpacing: 1
            }}>
              Link na Bio e nos Stories!
            </div>
          </div>
        </AbsoluteFill>
      </Sequence>

    </AbsoluteFill>
  );
};

