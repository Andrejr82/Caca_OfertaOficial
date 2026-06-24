import React from 'react';
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
  Sequence,
} from 'remotion';

// Ícones SVG oficiais das redes sociais
const InstagramIcon: React.FC<{ size?: number }> = ({ size = 45 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <defs>
      <linearGradient id="ig" x1="0" y1="24" x2="24" y2="0">
        <stop offset="0%" stopColor="#feda75" />
        <stop offset="20%" stopColor="#fa7e1e" />
        <stop offset="40%" stopColor="#d62976" />
        <stop offset="60%" stopColor="#962fbf" />
        <stop offset="80%" stopColor="#4f5bd5" />
      </linearGradient>
    </defs>
    <rect width="24" height="24" rx="6" fill="url(#ig)" />
    <rect x="3" y="3" width="18" height="18" rx="4" stroke="white" strokeWidth="1.5" fill="none" />
    <circle cx="12" cy="12" r="4.5" stroke="white" strokeWidth="1.5" fill="none" />
    <circle cx="17.5" cy="6.5" r="1.2" fill="white" />
  </svg>
);

const TelegramIcon: React.FC<{ size?: number }> = ({ size = 45 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="12" fill="#26A5E4" />
    <path d="M5.5 11.5l11.2-4.3c.5-.2 1 .1.8.7l-1.9 9c-.1.5-.5.6-.9.4l-2.8-2.1-1.3 1.3c-.2.2-.3.2-.4 0l-.2-2.1L16 9.6c.2-.1 0-.3-.2-.2L8.3 13.7l-2.7-.8c-.6-.2-.6-.6.0-.8z" fill="white" />
  </svg>
);

const WhatsAppIcon: React.FC<{ size?: number }> = ({ size = 45 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="12" fill="#25D366" />
    <path d="M17.5 14.4c-.3-.1-1.6-.8-1.8-.9-.3-.1-.5-.1-.7.2-.2.2-.7.9-.9 1.1-.2.2-.3.2-.6.1-.3-.2-1.3-.5-2.4-1.5-.9-.8-1.5-1.8-1.7-2.1-.2-.3 0-.4.1-.6.1-.1.3-.3.4-.5.1-.2.2-.3.2-.5.1-.2 0-.4 0-.5-.1-.2-.7-1.6-.9-2.2-.3-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.4s1 2.8 1.2 3c.1.2 2 3.1 4.9 4.3.7.3 1.2.5 1.6.6.7.2 1.3.2 1.8.1.6-.1 1.6-.7 1.8-1.3.2-.6.2-1.2.2-1.3-.1-.1-.3-.2-.6-.3z" fill="white" />
  </svg>
);

export const PromoTemplate: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // Animações
  const fadeIn = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: 'clamp' });
  const scaleTitle = spring({ frame: frame - 5, fps, config: { damping: 12 } });
  const slideItems = (delay: number) => spring({ frame: frame - delay, fps, config: { damping: 14 } });
  const pulse = interpolate(Math.sin(frame / 6), [-1, 1], [0.95, 1.05]);
  const fadeOut = interpolate(frame, [durationInFrames - 20, durationInFrames], [1, 0], { extrapolateLeft: 'clamp' });

  const platforms = [
    { emoji: '🛒', name: 'Shopee', delay: 25 },
    { emoji: '📦', name: 'Amazon', delay: 30 },
    { emoji: '🏪', name: 'Magalu', delay: 35 },
    { emoji: '🤝', name: 'Mercado Livre', delay: 40 },
  ];

  const benefits = [
    { emoji: '🔥', text: 'Ofertas todo dia', delay: 55 },
    { emoji: '🎟️', text: 'Cupons exclusivos', delay: 62 },
    { emoji: '📉', text: 'Preços que caem de verdade', delay: 69 },
    { emoji: '⚡', text: 'Promoções relâmpago', delay: 76 },
  ];

  const socials = [
    { icon: <InstagramIcon size={50} />, text: '@caca.ofertaoficial', delay: 100 },
    { icon: <TelegramIcon size={50} />, text: 'Telegram', delay: 107 },
    { icon: <WhatsAppIcon size={50} />, text: 'Canal WhatsApp', delay: 114 },
  ];

  return (
    <AbsoluteFill style={{ backgroundColor: '#0B132B', fontFamily: 'sans-serif', overflow: 'hidden', opacity: fadeOut }}>
      
      {/* Glow de fundo */}
      <div style={{
        position: 'absolute',
        top: '30%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 1200,
        height: 1200,
        background: 'radial-gradient(circle, rgba(255,215,0,0.2) 0%, rgba(11,19,43,0) 70%)',
        zIndex: 0
      }} />

      {/* Partículas decorativas */}
      {[...Array(8)].map((_, i) => (
        <div key={i} style={{
          position: 'absolute',
          top: `${15 + (i * 12)}%`,
          left: `${10 + (i * 11) % 80}%`,
          width: 8,
          height: 8,
          borderRadius: '50%',
          backgroundColor: '#FFD700',
          opacity: interpolate(Math.sin((frame + i * 20) / 10), [-1, 1], [0.1, 0.6]),
          transform: `translateY(${Math.sin((frame + i * 15) / 8) * 20}px)`,
        }} />
      ))}

      {/* 1. Logo e Nome */}
      <Sequence from={0}>
        <div style={{ 
          width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 120, 
          zIndex: 1, opacity: fadeIn, transform: `scale(${scaleTitle})`
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <span style={{ fontSize: 100, filter: 'drop-shadow(0 0 30px rgba(255,150,0,0.8))' }}>🔥</span>
            <h1 style={{ color: '#FFD700', fontSize: 90, fontWeight: '900', margin: 0, letterSpacing: -2, textShadow: '0 5px 20px rgba(255,215,0,0.4)' }}>
              CAÇA OFERTA
            </h1>
          </div>
          <h2 style={{ color: '#FFFFFF', fontSize: 45, fontWeight: 'bold', margin: '15px 0 0 0', opacity: 0.9 }}>
            Oficial
          </h2>
        </div>
      </Sequence>

      {/* 2. Plataformas */}
      <Sequence from={20}>
        <div style={{ 
          position: 'absolute', top: 420, width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 2
        }}>
          <div style={{ 
            color: '#FFFFFF', fontSize: 40, fontWeight: '700', marginBottom: 30, opacity: 0.7
          }}>
            As melhores ofertas de:
          </div>
          <div style={{ display: 'flex', gap: 30, flexWrap: 'wrap', justifyContent: 'center' }}>
            {platforms.map((p) => (
              <div key={p.name} style={{ 
                transform: `scale(${slideItems(p.delay)})`,
                backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 25, padding: '20px 35px',
                display: 'flex', alignItems: 'center', gap: 12,
                border: '1px solid rgba(255,215,0,0.3)',
              }}>
                <span style={{ fontSize: 45 }}>{p.emoji}</span>
                <span style={{ color: '#FFD700', fontSize: 38, fontWeight: 'bold' }}>{p.name}</span>
              </div>
            ))}
          </div>
        </div>
      </Sequence>

      {/* 3. Benefícios */}
      <Sequence from={50}>
        <div style={{ 
          position: 'absolute', top: 780, width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 2
        }}>
          {benefits.map((b) => (
            <div key={b.text} style={{ 
              transform: `translateX(${interpolate(slideItems(b.delay), [0, 1], [300, 0])}px)`,
              opacity: slideItems(b.delay),
              display: 'flex', alignItems: 'center', gap: 20, marginBottom: 20
            }}>
              <span style={{ fontSize: 50 }}>{b.emoji}</span>
              <span style={{ color: '#FFFFFF', fontSize: 45, fontWeight: '700' }}>{b.text}</span>
            </div>
          ))}
        </div>
      </Sequence>

      {/* 4. Redes Sociais */}
      <Sequence from={95}>
        <div style={{ 
          position: 'absolute', top: 1250, width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 2
        }}>
          <div style={{ 
            color: '#FFD700', fontSize: 45, fontWeight: '900', marginBottom: 30, textShadow: '0 3px 15px rgba(255,215,0,0.3)'
          }}>
            📲 Siga e economize!
          </div>
          {socials.map((s) => (
            <div key={s.text} style={{ 
              transform: `scale(${slideItems(s.delay)})`,
              display: 'flex', alignItems: 'center', gap: 20, marginBottom: 22
            }}>
              {s.icon}
              <span style={{ color: '#FFFFFF', fontSize: 42, fontWeight: '600' }}>{s.text}</span>
            </div>
          ))}
        </div>
      </Sequence>

      {/* 5. CTA Final */}
      <Sequence from={0}>
        <AbsoluteFill style={{ justifyContent: 'flex-end', zIndex: 6 }}>
          <div style={{ 
            background: 'linear-gradient(90deg, #FFB800 0%, #FFD700 50%, #FFB800 100%)', 
            width: '100%', height: 220, display: 'flex', flexDirection: 'column', 
            justifyContent: 'center', alignItems: 'center', borderTopLeftRadius: 50, borderTopRightRadius: 50,
            boxShadow: '0 -15px 50px rgba(255,215,0,0.5)'
          }}>
            <div style={{ 
              color: '#000000', fontSize: 55, fontWeight: '900', display: 'flex', alignItems: 'center', gap: 15,
              transform: `scale(${pulse})`, textShadow: '0 3px 10px rgba(0,0,0,0.15)'
            }}>
              🚀 ENTRE AGORA! É GRÁTIS 🚀
            </div>
            <div style={{ 
              color: '#D10000', fontSize: 35, fontWeight: '900', marginTop: 15, 
              backgroundColor: '#FFFFFF', padding: '12px 50px', borderRadius: 30,
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
