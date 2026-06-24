import React from 'react';
import { Composition } from 'remotion';
import { ReelTemplate, ReelTemplateProps } from './ReelTemplate';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="InstagramReel"
        component={ReelTemplate}
        durationInFrames={150} // 5 segundos a 30fps
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          productName: 'Tênis Nike Revolution 6 Next Nature Masculino - Edição Limitada',
          originalPrice: '399,99',
          currentPrice: '229,90',
          imageUrl: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?q=80&w=800&auto=format&fit=crop',
        } as ReelTemplateProps}
      />
    </>
  );
};
