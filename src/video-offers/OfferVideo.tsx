import React from 'react';
import { AbsoluteFill, Audio, Img, OffthreadVideo, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { OfferVideoInput } from './schema';
import { motionMasterV1 } from './templates/motion-master-v1';

export type OfferVideoProps = OfferVideoInput;

export const OfferVideo: React.FC<OfferVideoProps> = (props) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const cardIn = spring({ frame: frame - fps * 0.8, fps, config: { damping: 16, stiffness: 120 } });
  const cardX = interpolate(cardIn, [0, 1], [720, motionMasterV1.card.x], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const captionOpacity = interpolate(frame, [fps * 0.4, fps * 0.8], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const card = props.card ?? motionMasterV1.card;

  return (
    <AbsoluteFill style={{ backgroundColor: '#080b10', fontFamily: 'Arial, sans-serif', overflow: 'hidden' }}>
      <OffthreadVideo src={props.masterVideo} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      <Audio src={props.audio} />

      <div style={{
        position: 'absolute', left: cardX, top: card.y, width: card.width, height: card.height,
        padding: 14, boxSizing: 'border-box', borderRadius: 18, border: '2px solid #ffbe00',
        backgroundColor: 'rgba(12, 17, 24, 0.96)', boxShadow: '0 10px 30px rgba(0,0,0,.55)',
      }}>
        <div style={{ height: 190, borderRadius: 12, background: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          <Img src={props.productImage} style={{ maxWidth: '92%', maxHeight: '92%', objectFit: 'contain' }} />
        </div>
        <div style={{ color: '#fff', fontWeight: 700, fontSize: 16, lineHeight: 1.1, marginTop: 12 }}>
          {props.productName}
        </div>
        <div style={{ color: '#aeb7c4', fontSize: 12, marginTop: 6 }}>{props.platform}</div>
        {props.originalPrice && props.originalPrice !== props.price && (
          <div style={{ color: '#aeb7c4', textDecoration: 'line-through', fontSize: 13, marginTop: 8 }}>{props.originalPrice}</div>
        )}
        <div style={{ color: '#ffbe00', fontWeight: 900, fontSize: 25, marginTop: 4 }}>{props.price}</div>
        <div style={{ color: '#fff', fontWeight: 700, fontSize: 10, marginTop: 17 }}>OFERTA VERIFICADA</div>
      </div>

      <div style={{
        position: 'absolute', left: motionMasterV1.subtitle.x, top: motionMasterV1.subtitle.y,
        width: motionMasterV1.subtitle.width, minHeight: motionMasterV1.subtitle.height,
        padding: '14px 18px', boxSizing: 'border-box', borderRadius: 14,
        backgroundColor: 'rgba(4, 7, 12, .82)', border: '1px solid rgba(255, 190, 0, .8)',
        color: '#fff', fontSize: 19, lineHeight: 1.2, fontWeight: 700, opacity: captionOpacity,
      }}>
        {props.script}
      </div>
    </AbsoluteFill>
  );
};
