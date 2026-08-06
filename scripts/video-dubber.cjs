const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { exec } = require('child_process');
const axios = require('axios');
const ffmpeg = require('fluent-ffmpeg');

// Se o edge-tts não estiver no PATH global do sistema, usaremos este atalho validado:
const EDGE_TTS_BIN = 'C:\\Users\\Andr\u00E9\\AppData\\Local\\Python\\pythoncore-3.14-64\\Scripts\\edge-tts.exe';

async function generateDubbingCopy(title, price, durationSecs = 15) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY não configurada no .env.local');

  const maxWords = Math.floor(durationSecs * 2.5); // Aproximadamente 2.5 palavras por segundo de fala
  const prompt = `Você é um copywriter de vídeos curtos hiper-persuasivos (estilo TikTok/Reels de Achadinhos).
Sua missão é escrever um ROTEIRO FALADO vibrante, envolvente e focado em venda para narrar um vídeo da Shopee.
IMPORTANTE: O vídeo tem exatamente ${durationSecs} segundos. Escreva um roteiro cuja locução dure aproximadamente esse tempo (tamanho alvo: em torno de ${maxWords} palavras).

DADOS ORIGINAIS DO PRODUTO:
Título completo da loja: ${title}
Preço: ${price}

REGRAS OBRIGATÓRIAS PARA O ROTEIRO:
1. NOME CURTO E COMERCIAL: O "Título completo" tem muito lixo de SEO. Crie e use apenas um nome curto (Ex: de "Coturno Militar Feminino..." para "Bota Militar").
2. PERSUASÃO E DESEJO: Crie urgência, destaque o benefício de forma energética estilo TikTok, e faça a pessoa querer comprar na hora! Use palavras de emoção.
3. CONCORDÂNCIA GRAMATICAL DE GÊNERO: Se o produto for masculino (O triturador, O copo), use adjetivos masculinos (seu novo aliado, perfeito, prático). Se for feminino (A panela, A vassoura), use adjetivos femininos (sua nova aliada, perfeita, prática). Nunca erre o gênero!
4. PREÇO POR EXTENSO (MUITO IMPORTANTE): Escreva o valor EXATAMENTE como ele deve ser LIDO PELA VOZ. Nunca use vírgula para separar centavos no texto. Em vez de "R$ 135,76", você OBRIGATORIAMENTE deve escrever "cento e trinta e cinco reais e setenta e seis centavos". Se for "R$ 17,99", escreva "dezessete reais e noventa e nove centavos".
5. REVISÃO DE PORTUGUÊS E PRONÚNCIA: Escreva a palavra "Shopee" exatamente como "Chopí" para a voz sintética ler corretamente.
6. FORMATO E ENCERRAMENTO: Não use emojis ou aspas. Finalize dizendo enérgico: "O link está nos comentários!".`;

  const response = await axios.post(
    'https://api.groq.com/openai/v1/chat/completions',
    {
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 150,
      temperature: 0.7,
    },
    { headers: { Authorization: `Bearer ${apiKey}` } }
  );

  return response.data.choices[0].message.content.trim();
}

function generateTTS(text, outputPath) {
  return new Promise((resolve, reject) => {
    const tmpTxtFile = outputPath.replace('.mp3', '.txt');
    fs.writeFileSync(tmpTxtFile, text, 'utf8');
    
    const cmd = `cmd /c "${EDGE_TTS_BIN} -f "${tmpTxtFile}" --voice pt-BR-FranciscaNeural --write-media "${outputPath}""`;
    
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
      // Substitui a faixa de áudio original (0:v = vídeo original, 1:a = novo áudio)
      .outputOptions([
        '-map 0:v',
        '-map 1:a',
        '-c:v copy', // Copia o vídeo sem re-encodar (rápido)
        '-c:a aac'
        // Removido o -shortest: o vídeo original rodará até o final, e se a voz passar do tempo, ela também rodará até terminar.
      ])
      .save(outputPath)
      .on('end', resolve)
      .on('error', reject);
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

  console.log(`[Job ${jobId}] Iniciando processo de dublagem para: ${title}`);

  try {
    // 1. Download do MP4 original
    console.log(`[Job ${jobId}] Baixando vídeo original...`);
    await downloadVideo(videoUrl, rawVideoPath);

    // 1.5. Descobre a duração exata do vídeo baixado
    let durationSecs = 15;
    try {
      durationSecs = await getVideoDuration(rawVideoPath);
    } catch(e) {}
    console.log(`[Job ${jobId}] Duração do vídeo identificada: ${durationSecs} segundos.`);

    // 2. Gerar a Copy (LLM) adaptada ao tamanho do vídeo
    console.log(`[Job ${jobId}] Gerando roteiro com LLM (alvo: ${durationSecs}s)...`);
    let copy = await generateDubbingCopy(title, price, durationSecs);
    console.log(`[Job ${jobId}] Roteiro gerado:\n${copy}`);

    // 3. Gerar o Áudio (Edge-TTS)
    console.log(`[Job ${jobId}] Gerando áudio sintético (Francisca)...`);
    await generateTTS(copy, audioPath);

    // 4. Merge Vídeo e Áudio (FFmpeg)
    console.log(`[Job ${jobId}] Mesclando áudio e vídeo com FFmpeg...`);
    await mergeAudioVideo(rawVideoPath, audioPath, finalVideoPath);

    // 5. Cleanup
    fs.unlinkSync(rawVideoPath);
    fs.unlinkSync(audioPath);

    // Reverter "Chopí" para "Shopee" na copy que vai pro banco/frontend, para não postar escrito "Chopí"
    copy = copy.replace(/Chopí/gi, 'Shopee');

    console.log(`[Job ${jobId}] Concluído! Arquivo final: ${finalVideoPath}`);
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
