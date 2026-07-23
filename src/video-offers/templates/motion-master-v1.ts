import { defaultCard, offerVideoCanvas, protectedFaceZone } from '../schema';

export const motionMasterV1 = {
  id: 'motion-master-v1' as const,
  canvas: offerVideoCanvas,
  protectedZones: [protectedFaceZone],
  card: defaultCard,
  subtitle: { x: 48, y: 1030, width: 624, height: 170 },
};
