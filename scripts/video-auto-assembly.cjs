const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const ffmpeg = require('fluent-ffmpeg');
let ffmpegBinary = 'ffmpeg';
try {
  ffmpegBinary = require('ffmpeg-static') || ffmpegBinary;
} catch {
  // Oracle usa o binário FFmpeg do sistema quando o pacote opcional não existe.
}

function createJobWorkspace(baseDir, jobId) {
  const safeJobId = String(jobId || '').replace(/[^a-zA-Z0-9_-]/gu, '_');
  if (!safeJobId) throw new Error('jobId obrigatório para isolar artefatos.');
  const root = path.join(baseDir, safeJobId);
  return {
    root,
    input: path.join(root, 'source.mp4'),
    assembled: path.join(root, 'assembled.mp4'),
    audio: path.join(root, 'voice.mp3'),
    output: path.join(root, 'preview.mp4'),
  };
}

function roundDuration(value) {
  return Number(Number(value).toFixed(3));
}

function selectAutoSegments({ duration, targetDuration = 12, boundaries = [] }) {
  const sourceDuration = roundDuration(Math.max(0, Number(duration) || 0));
  const target = roundDuration(Math.min(15, Math.max(8, Number(targetDuration) || 12)));
  if (sourceDuration <= target || sourceDuration <= 0) {
    return {
      totalDuration: sourceDuration,
      boundaries: boundaries.filter((value) => value > 0 && value < sourceDuration),
      segments: sourceDuration ? [{ start: 0, end: sourceDuration, duration: sourceDuration, role: 'full_source' }] : [],
    };
  }

  const count = Math.min(5, Math.max(3, Math.round(target / 3)));
  const segmentDuration = roundDuration(target / count);
  const maxStart = sourceDuration - segmentDuration;
  const starts = Array.from({ length: count }, (_, index) => roundDuration((maxStart * index) / (count - 1)));
  const roles = ['opening', 'development', 'detail', 'alternate_view', 'closing'];
  const segments = starts.map((start, index) => ({
    start,
    end: roundDuration(start + segmentDuration),
    duration: segmentDuration,
    role: roles[index] || 'detail',
  }));

  return {
    totalDuration: roundDuration(segments.reduce((sum, segment) => sum + segment.duration, 0)),
    boundaries: boundaries.filter((value) => value > 0 && value < sourceDuration).map(roundDuration),
    segments,
  };
}

function buildVisualSpeechContext(plan) {
  const labels = {
    full_source: 'vídeo completo',
    opening: 'abertura com apresentação do produto',
    development: 'visão principal do produto',
    detail: 'detalhe ou característica visual',
    alternate_view: 'visão alternativa do produto',
    closing: 'encerramento com outra visão do produto',
  };
  return plan.segments.map((segment, index) => `${index + 1}. ${labels[segment.role] || 'trecho útil'} (${segment.duration}s)`).join('\n');
}

function shouldRegenerateSpeech(audioDuration, videoDuration, tolerance = 0) {
  const audio = Number(audioDuration);
  const video = Number(videoDuration);
  return Number.isFinite(audio) && Number.isFinite(video) && audio > video * (1 + tolerance);
}

function buildFinalRenderPlan({ visualDuration, audioDuration, endingMargin = 0.3 }) {
  const visual = roundDuration(Math.max(0, Number(visualDuration) || 0));
  const audio = roundDuration(Math.max(0, Number(audioDuration) || 0));
  const margin = roundDuration(Math.min(0.4, Math.max(0.2, Number(endingMargin) || 0.3)));
  const audioFits = audio <= visual;
  const finalDuration = roundDuration(Math.min(visual, audio + margin));
  return {
    visualDuration: visual,
    audioDuration: audio,
    endingMargin: roundDuration(Math.max(0, finalDuration - audio)),
    finalDuration,
    audioFits,
    audioCut: false,
    audioCutRisk: !audioFits,
    trimsVisualTail: finalDuration < visual,
  };
}

function detectSceneBoundaries(inputPath, threshold = 0.2) {
  return new Promise((resolve) => {
    execFile(ffmpegBinary, [
      '-hide_banner', '-i', inputPath,
      '-vf', `select='gt(scene,${threshold})',showinfo`,
      '-f', 'null', '-',
    ], { maxBuffer: 4 * 1024 * 1024 }, (_error, _stdout, stderr) => {
      const boundaries = [];
      for (const match of String(stderr || '').matchAll(/pts_time:([0-9.]+)/gu)) {
        const value = Number(match[1]);
        if (Number.isFinite(value) && !boundaries.some((existing) => Math.abs(existing - value) < 0.1)) boundaries.push(value);
      }
      resolve(boundaries.sort((left, right) => left - right));
    });
  });
}

function getMediaInfo(inputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(inputPath, (error, metadata) => {
      if (error) return reject(error);
      const video = metadata.streams?.find((stream) => stream.codec_type === 'video') || {};
      resolve({
        duration: Number(metadata.format?.duration || 0),
        size: Number(metadata.format?.size || 0),
        bitrate: Number(metadata.format?.bit_rate || 0),
        codec: video.codec_name || null,
        width: Number(video.width || 0),
        height: Number(video.height || 0),
        fps: video.avg_frame_rate || video.r_frame_rate || null,
        hasAudio: metadata.streams?.some((stream) => stream.codec_type === 'audio') || false,
      });
    });
  });
}

function renderAutoAssembly(inputPath, outputPath, plan, { hasAudio = true, fps = null } = {}) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    const command = ffmpeg(inputPath);
    const filters = [];
    const concatLabels = [];
    plan.segments.forEach((segment, index) => {
      const videoLabel = `v${index}`;
      filters.push(`[0:v]trim=start=${segment.start}:end=${segment.end},setpts=PTS-STARTPTS[${videoLabel}]`);
      concatLabels.push(`[${videoLabel}]`);
      if (hasAudio) {
        const audioLabel = `a${index}`;
        filters.push(`[0:a]atrim=start=${segment.start}:end=${segment.end},asetpts=PTS-STARTPTS[${audioLabel}]`);
        concatLabels.push(`[${audioLabel}]`);
      }
    });
    const concatInputs = concatLabels.join('');
    filters.push(`${concatInputs}concat=n=${plan.segments.length}:v=1:a=${hasAudio ? 1 : 0}[vout]${hasAudio ? '[aout]' : ''}`);
    command
      .complexFilter(filters)
      .outputOptions(['-map [vout]', ...(hasAudio ? ['-map [aout]'] : []), '-c:v libx264', '-preset medium', '-crf 18', ...(fps ? ['-r', String(fps)] : []), ...(hasAudio ? ['-c:a aac', '-b:a 128k'] : []), '-movflags +faststart'])
      .on('end', () => resolve(outputPath))
      .on('error', reject)
      .save(outputPath);
  });
}

async function analyzeAndAssemble(inputPath, outputPath, options = {}) {
  const inputQuality = await getMediaInfo(inputPath);
  const boundaries = await detectSceneBoundaries(inputPath, options.sceneThreshold || 0.2);
  const plan = selectAutoSegments({
    duration: inputQuality.duration,
    targetDuration: options.targetDuration || 12,
    boundaries,
  });
  await renderAutoAssembly(inputPath, outputPath, plan, { hasAudio: inputQuality.hasAudio, fps: inputQuality.fps });
  const outputQuality = await getMediaInfo(outputPath);
  return { plan, inputQuality, outputQuality };
}

module.exports = {
  createJobWorkspace,
  selectAutoSegments,
  buildVisualSpeechContext,
  shouldRegenerateSpeech,
  buildFinalRenderPlan,
  detectSceneBoundaries,
  getMediaInfo,
  renderAutoAssembly,
  analyzeAndAssemble,
};
