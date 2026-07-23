import React from 'react';
import { Composition, staticFile } from 'remotion';
import { ReelTemplate, ReelTemplateProps } from './ReelTemplate';
import { PromoTemplate } from './PromoTemplate';
import { OfferVideo } from '../video-offers/OfferVideo';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="OfferVideoV1"
        component={OfferVideo}
        durationInFrames={625}
        fps={25}
        width={720}
        height={1280}
        defaultProps={{
          masterVideo: staticFile('motion-master-v1.mp4'),
          productImage: staticFile('product-placeholder.png'),
          productName: 'Produto de oferta',
          price: 'R$ 0,00',
          platform: 'Marketplace',
          script: 'Confira esta oferta verificada agora!',
          audio: staticFile('audio-placeholder.mp3'),
          templateId: 'motion-master-v1',
          card: { x: 430, y: 430, width: 250, height: 370 },
        }}
      />
      <Composition
        id="InstagramReel"
        component={ReelTemplate}
        durationInFrames={300} // 10 segundos a 30fps
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          productName: 'Produto de oferta',
          originalPrice: '',
          currentPrice: '0,00',
          imageUrl: 'https://images.unsplash.com/photo-1618366712010-f4ae9c647dcb?q=80&w=800&auto=format&fit=crop',
          avatarImageUrl: staticFile('avatar.png'),
        } as ReelTemplateProps}
      />
      <Composition
        id="PromoReel"
        component={PromoTemplate}
        durationInFrames={210} // 7 segundos a 30fps
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{}}
      />
    </>
  );
};

