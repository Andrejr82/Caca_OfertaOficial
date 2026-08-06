const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { exec } = require('child_process');
const axios = require('axios');
const ffmpeg = require('fluent-ffmpeg');

// Se o edge-tts não estiver no PATH global do sistema, usaremos este atalho validado:
const EDGE_TTS_BIN = 'C:\\Users\\André\\AppData\\Local\\Python\\pythoncore-3.14-64\\Scripts\\edge-tts.exe';

// --- ETAPA 0: Classificar gênero do produto ---
async function classifyProductGender(title, apiKey) {
  try {
    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: 'llama-3.3-70b-versatile',
        messages: [{
          role: 'user',
          content: `Você é um especialista em gramática portuguesa. Analise o título abaixo e identifique o SUBSTANTIVO PRINCIPAL do produto (a palavra que nomeia o objeto em si, ignorando adjetivos, marcas e especificações técnicas).\nDepois, responda APENAS com uma palavra: MASCULINO ou FEMININO, de acordo com o gênero gramatical desse substantivo principal em português.\nExemplos: "Torneira Elétrica Slim" → substantivo: torneira → FEMININO. "Copo Stanley 900ml" → substantivo: copo → MASCULINO. "Panela de Pressão" → substantivo: panela → FEMININO. "Aspirador Robô" → substantivo: aspirador → MASCULINO.\nTítulo: ${title}`
        }],
        max_tokens: 10,
        temperature: 0,
      },
      { headers: { Authorization: `Bearer ${apiKey}` } }
    );
    const answer = response.data.choices[0].message.content.trim().toUpperCase();
    return answer.includes('FEMININO') ? 'FEMININO' : 'MASCULINO';
  } catch(e) {
    return 'MASCULINO'; // fallback seguro
  }
}

// --- ETAPA 1: Gerar roteiro persuasivo com gênero correto ---
async function generateDubbingCopy(title, price, durationSecs = 15, gender = 'MASCULINO') {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY não configurada no .env.local');

  // Alvo: ~3.5 palavras/segundo (midpoint), sem preocupar exatamente — o rate do TTS vai ajustar depois
  const targetWords = Math.round(durationSecs * 3.5);
  // max_tokens dinâmico: ~2.5 tokens por palavra + margem de segurança generosa
  const dynamicMaxTokens = Math.max(350, Math.round(targetWords * 2.5) + 100);

  const genderInstruction = gender === 'FEMININO'
    ? `GÊNERO DO PRODUTO: FEMININO. Use OBRIGATORIAMENTE artigos e pronomes femininos: "A [produto]", "esta [produto]", "sua nova aliada", "ela é", "perfeita", "incrível", "prática". NUNCA use "o", "este", "seu" para referir ao produto.`
    : `GÊNERO DO PRODUTO: MASCULINO. Use OBRIGATORIAMENTE artigos e pronomes masculinos: "O [produto]", "este [produto]", "seu novo aliado", "ele é", "perfeito", "incrível", "prático". NUNCA use "a", "esta", "sua" para referir ao produto.`;

  const prompt = `Você é um dos melhores copywriters de vídeos curtos do Brasil, especialista em Reels e TikTok de Achadinhos.
Sua missão é criar um ROTEIRO FALADO que faça o espectador PARAR de rolar o feed, SENTIR desejo imediato e CLICAR para comprar na Shopee.

DADOS DO PRODUTO:
Título completo: ${title}
Preço: ${price}
Duração do vídeo: ${durationSecs} segundos
Tamanho alvo do roteiro: aproximadamente ${targetWords} palavras

${genderInstruction}

ESTRUTURA OBRIGATÓRIA DO ROTEIRO (siga essa ordem):
1. GANCHO (2-3 segundos): Frase de impacto que para o scroll. Ex: "Isso mudou minha vida!", "Chega de sofrer com [problema]!", "Esse [produto] é um absurdo!".
2. APRESENTAÇÃO (rápida): Diga o nome curto e comercial do produto. Ignore lixo de SEO do título — crie um nome simples.
3. BENEFÍCIOS (maior parte): 2-3 benefícios reais ditos com paixão. Use "imagina...", "chega de...", "você vai...", "transforma...".
4. URGÊNCIA: Uma frase criando pressa. Ex: "Tá com preço incrível agora na Chopí!", "Corre que pode acabar!".
5. CTA FINAL: Obrigatório e com energia máxima: "Acesse o link na publicação!".

REGRAS:
- Roteiro com aproximadamente ${targetWords} palavras — seja preciso.
- NUNCA mencione preço, valores ou porcentagem de desconto. O preço aparece na tela.
- Escreva "Shopee" como "Chopí" para a voz sintética pronunciar corretamente.
- Sem emojis, sem aspas, sem títulos ou numeração no texto final.
- O texto deve soar natural e entusiasmado quando lido em voz alta.
- Retorne APENAS o texto do roteiro, sem explicações.`;

  const response = await axios.post(
    'https://api.groq.com/openai/v1/chat/completions',
    {
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: dynamicMaxTokens,
      temperature: 0.75,
    },
    { headers: { Authorization: `Bearer ${apiKey}` } }
  );

  return response.data.choices[0].message.content.trim();
}

// --- ETAPA 2: Gerar TTS com parâmetros de rate e pitch ---
// rate: string como "+10%", "-5%", "+0%" — ajusta velocidade da fala
// pitch: string como "+5Hz" — deixa voz mais animada/entusiasta
function generateTTS(text, outputPath, rate = '+0%', pitch = '+5Hz') {
  return new Promise((resolve, reject) => {
    const tmpTxtFile = outputPath.replace('.mp3', '.txt');
    fs.writeFileSync(tmpTxtFile, text, 'utf8');
    const isWin = process.platform === 'win32';
    
    // Formata rate/pitch para o CLI — valores negativos precisam de = para não serem interpretados como flags
    const rateArg = rate.startsWith('-') ? `--rate=${rate}` : `--rate ${rate}`;
    const pitchArg = pitch.startsWith('-') ? `--pitch=${pitch}` : `--pitch ${pitch}`;

    const cmd = isWin
      ? `cmd /c "${EDGE_TTS_BIN} -f "${tmpTxtFile}" --voice pt-BR-FranciscaNeural ${rateArg} ${pitchArg} --write-media "${outputPath}""`
      : `/home/ubuntu/.local/bin/edge-tts -f "${tmpTxtFile}" --voice pt-BR-FranciscaNeural ${rateArg} ${pitchArg} --write-media "${outputPath}"`;

    exec(cmd, (error, stdout, stderr) => {
      try { fs.unlinkSync(tmpTxtFile); } catch(e) {}

      if (error) {
        console.error('Erro no Edge-TTS:', stderr);
        return reject(error);
      }
      resolve(outputPath);
    });
  });
}

async function downloadVideo(url, outputPath) {
  const writer = fs.createWriteStream(outputPath);
  const response = await axios({
    url,
    method: 'GET',
    responseType: 'stream',
  });

  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
}

function mergeAudioVideo(videoPath, audioPath, outputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(videoPath)
      .input(audioPath)
      .outputOptions([
        '-map 0:v',
        '-map 1:a',
        '-c:v copy',
        '-c:a aac'
      ])
      .save(outputPath)
      .on('end', resolve)
      .on('error', reject);
  });
}

function getAudioDuration(audioPath) {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(audioPath, (err, metadata) => {
      if (err || !metadata || !metadata.format || !metadata.format.duration) {
        return resolve(null);
      }
      resolve(metadata.format.duration);
    });
  });
}

function getVideoDuration(videoPath) {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err || !metadata || !metadata.format || !metadata.format.duration) {
        return resolve(15); // Fallback seguro
      }
      resolve(Math.floor(metadata.format.duration));
    });
  });
}

/**
 * Calcula o rate% necessário para o áudio durar exatamente o tempo do vídeo.
 * rate > 0 → fala mais rápido (áudio estava longo)
 * rate < 0 → fala mais devagar (áudio estava curto)
 * Limitado entre -30% e +50% para manter qualidade natural da voz.
 */
function calculateRateAdjustment(audioDuration, videoDuration) {
  // rate% = (audioDuration/videoDuration - 1) * 100
  // Ex: áudio=50s, vídeo=40s → rate = (50/40 - 1)*100 = +25% (falar mais rápido)
  // Ex: áudio=30s, vídeo=40s → rate = (30/40 - 1)*100 = -25% (falar mais devagar)
  let rate = (audioDuration / videoDuration - 1) * 100;
  rate = Math.max(-30, Math.min(50, rate)); // limita range seguro
  const sign = rate >= 0 ? '+' : '';
  return `${sign}${rate.toFixed(0)}%`;
}

/**
 * Processa a dublagem de um vídeo da Shopee
 * @param {string} videoUrl - URL do MP4 extraído pela extensão
 * @param {string} title - Título extraído
 * @param {string} price - Preço extraído
 */
async function processShopeeVideoDubbing(videoUrl, title, price) {
  const jobId = crypto.randomUUID();
  const workDir = path.join(__dirname, '..', 'videos_processados');
  if (!fs.existsSync(workDir)) fs.mkdirSync(workDir, { recursive: true });

  const rawVideoPath = path.join(workDir, `${jobId}_raw.mp4`);
  const audioPath = path.join(workDir, `${jobId}_audio.mp3`);
  const finalVideoPath = path.join(workDir, `${jobId}_final.mp4`);

  console.log(`[Job ${jobId}] Iniciando dublagem: ${title}`);

  try {
    // 1. Download
    console.log(`[Job ${jobId}] Baixando vídeo...`);
    await downloadVideo(videoUrl, rawVideoPath);

    // 2. Duração exata do vídeo
    const durationSecs = await getVideoDuration(rawVideoPath);
    console.log(`[Job ${jobId}] Duração do vídeo: ${durationSecs}s`);

    // 3. Gênero do produto
    const apiKey = process.env.GROQ_API_KEY;
    const gender = await classifyProductGender(title, apiKey);
    console.log(`[Job ${jobId}] Gênero: ${gender}`);

    // 4. Gerar roteiro
    console.log(`[Job ${jobId}] Gerando roteiro...`);
    let copy = await generateDubbingCopy(title, price, durationSecs, gender);
    console.log(`[Job ${jobId}] Roteiro:\n${copy}`);

    // 5. Gerar áudio inicial (sem ajuste de rate) com pitch +5Hz para entusiasmo
    const PITCH = '+5Hz';
    console.log(`[Job ${jobId}] Gerando áudio TTS inicial (pitch: ${PITCH})...`);
    await generateTTS(copy, audioPath, '+0%', PITCH);

    // 6. Medir duração do áudio gerado
    const audioDuration = await getAudioDuration(audioPath);
    console.log(`[Job ${jobId}] Áudio inicial: ${audioDuration ? audioDuration.toFixed(1) : '?'}s | Vídeo: ${durationSecs}s`);

    // 7. Se temos a duração, calcular rate exato e regenerar
    if (audioDuration !== null) {
      const diffRatio = Math.abs(audioDuration - durationSecs) / durationSecs;

      if (diffRatio > 0.05) { // só ajusta se diferença > 5%
        const rate = calculateRateAdjustment(audioDuration, durationSecs);
        console.log(`[Job ${jobId}] Diferença: ${((audioDuration - durationSecs) > 0 ? '+' : '')}${(audioDuration - durationSecs).toFixed(1)}s. Ajustando rate para: ${rate}`);

        try { fs.unlinkSync(audioPath); } catch(e) {}
        await generateTTS(copy, audioPath, rate, PITCH);

        const finalAudioDuration = await getAudioDuration(audioPath);
        console.log(`[Job ${jobId}] ✅ Áudio ajustado: ${finalAudioDuration ? finalAudioDuration.toFixed(1) : '?'}s (rate: ${rate})`);
      } else {
        console.log(`[Job ${jobId}] ✅ Áudio já dentro da tolerância (${(diffRatio * 100).toFixed(0)}%). Sem ajuste de rate necessário.`);
      }
    }

    // 8. Merge vídeo + áudio
    console.log(`[Job ${jobId}] Mesclando vídeo e áudio...`);
    await mergeAudioVideo(rawVideoPath, audioPath, finalVideoPath);

    // 9. Cleanup
    fs.unlinkSync(rawVideoPath);
    fs.unlinkSync(audioPath);

    // Reverter "Chopí" → "Shopee" na copy para banco/frontend
    copy = copy.replace(/Chopí/gi, 'Shopee');

    console.log(`[Job ${jobId}] Concluído! Arquivo: ${finalVideoPath}`);
    return {
      success: true,
      jobId,
      finalVideoPath,
      copy
    };

  } catch (error) {
    console.error(`[Job ${jobId}] Falha:`, error);
    return { success: false, error: error.message };
  }
}

module.exports = {
  processShopeeVideoDubbing
};
