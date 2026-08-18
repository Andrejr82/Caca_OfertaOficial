type Box = { type: string; start: number; end: number; dataStart: number };

export type ParsedMp4Metadata = {
  width: number;
  height: number;
  durationSeconds: number;
  codec: string | null;
  hasAudio: boolean;
  source: "mp4-parser";
};

function readUInt64BE(buffer: Buffer, offset: number) {
  const high = buffer.readUInt32BE(offset);
  const low = buffer.readUInt32BE(offset + 4);
  return high * 2 ** 32 + low;
}

function boxes(buffer: Buffer, start = 0, end = buffer.length): Box[] {
  const result: Box[] = [];
  let offset = start;

  while (offset + 8 <= end) {
    let size = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    let headerSize = 8;

    if (size === 1) {
      if (offset + 16 > end) break;
      size = readUInt64BE(buffer, offset + 8);
      headerSize = 16;
    } else if (size === 0) {
      size = end - offset;
    }

    if (!Number.isFinite(size) || size < headerSize || offset + size > end) break;

    result.push({ type, start: offset, end: offset + size, dataStart: offset + headerSize });
    offset += size;
  }

  return result;
}

function child(buffer: Buffer, parent: Box, type: string) {
  return boxes(buffer, parent.dataStart, parent.end).find((box) => box.type === type) ?? null;
}

function handlerType(buffer: Buffer, mdia: Box) {
  const hdlr = child(buffer, mdia, "hdlr");
  if (!hdlr || hdlr.dataStart + 12 > hdlr.end) return null;
  return buffer.toString("ascii", hdlr.dataStart + 8, hdlr.dataStart + 12);
}

function trackDimensions(buffer: Buffer, trak: Box) {
  const tkhd = child(buffer, trak, "tkhd");
  if (!tkhd || tkhd.end - tkhd.dataStart < 8) return { width: 0, height: 0 };
  const widthFixed = buffer.readUInt32BE(tkhd.end - 8);
  const heightFixed = buffer.readUInt32BE(tkhd.end - 4);
  return {
    width: Math.round(widthFixed / 65536),
    height: Math.round(heightFixed / 65536),
  };
}

function mediaDuration(buffer: Buffer, mdia: Box) {
  const mdhd = child(buffer, mdia, "mdhd");
  if (!mdhd || mdhd.dataStart + 4 > mdhd.end) return 0;

  const version = buffer.readUInt8(mdhd.dataStart);
  if (version === 1) {
    if (mdhd.dataStart + 32 > mdhd.end) return 0;
    const timescale = buffer.readUInt32BE(mdhd.dataStart + 20);
    const duration = readUInt64BE(buffer, mdhd.dataStart + 24);
    return timescale ? duration / timescale : 0;
  }

  if (mdhd.dataStart + 20 > mdhd.end) return 0;
  const timescale = buffer.readUInt32BE(mdhd.dataStart + 12);
  const duration = buffer.readUInt32BE(mdhd.dataStart + 16);
  return timescale ? duration / timescale : 0;
}

function videoCodec(buffer: Buffer, mdia: Box) {
  const minf = child(buffer, mdia, "minf");
  if (!minf) return null;
  const stbl = child(buffer, minf, "stbl");
  if (!stbl) return null;
  const stsd = child(buffer, stbl, "stsd");
  if (!stsd || stsd.dataStart + 16 > stsd.end) return null;
  const entryCount = buffer.readUInt32BE(stsd.dataStart + 4);
  if (!entryCount) return null;
  return buffer.toString("ascii", stsd.dataStart + 12, stsd.dataStart + 16);
}

export function parseMp4Metadata(buffer: Buffer): ParsedMp4Metadata {
  const moov = boxes(buffer).find((box) => box.type === "moov");
  if (!moov) throw new Error("Arquivo MP4 inválido: caixa moov não encontrada.");

  let width = 0;
  let height = 0;
  let durationSeconds = 0;
  let codec: string | null = null;
  let hasAudio = false;

  for (const trak of boxes(buffer, moov.dataStart, moov.end).filter((box) => box.type === "trak")) {
    const mdia = child(buffer, trak, "mdia");
    if (!mdia) continue;

    const handler = handlerType(buffer, mdia);
    if (handler === "soun") hasAudio = true;
    if (handler !== "vide") continue;

    const dimensions = trackDimensions(buffer, trak);
    width = dimensions.width;
    height = dimensions.height;
    durationSeconds = mediaDuration(buffer, mdia);
    codec = videoCodec(buffer, mdia);
    break;
  }

  if (!width || !height || !durationSeconds) {
    throw new Error("Não foi possível identificar resolução e duração no arquivo MP4.");
  }

  return { width, height, durationSeconds, codec, hasAudio, source: "mp4-parser" };
}
