import React from 'react';
import { Composition, staticFile } from 'remotion';
import { ReelTemplate, ReelTemplateProps } from './ReelTemplate';
import { PromoTemplate } from './PromoTemplate';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="InstagramReel"
        component={ReelTemplate}
        durationInFrames={300} // 10 segundos a 30fps
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          productName: 'JBL Tune 520BT',
          originalPrice: '199,90',
          currentPrice: '129,90',
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

