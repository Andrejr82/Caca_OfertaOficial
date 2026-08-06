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
          content: `Qual é o gênero gramatical em português deste produto? Responda APENAS com uma palavra: MASCULINO ou FEMININO.\nProduto: ${title}`
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

// --- ETAPA 1: Gerar roteiro com gênero e duração explícitos ---
async function generateDubbingCopy(title, price, durationSecs = 15, gender = 'MASCULINO', adjustment = null) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY não configurada no .env.local');

  // Francisca fala ~3.7 palavras/segundo em pt-BR
  const targetWords = Math.round(durationSecs * 3.7);

  const genderInstruction = gender === 'FEMININO'
    ? `GÊNERO DO PRODUTO: FEMININO. Use OBRIGATORIAMENTE artigos e pronomes femininos: "A [produto]", "esta [produto]", "sua nova aliada", "incrível", "perfeita", "prática", etc.`
    : `GÊNERO DO PRODUTO: MASCULINO. Use OBRIGATORIAMENTE artigos e pronomes masculinos: "O [produto]", "este [produto]", "seu novo aliado", "incrível", "perfeito", "prático", etc.`;

  let adjustmentInstruction = '';
  if (adjustment === 'ENCURTAR') {
    adjustmentInstruction = `\nATENÇÃO: O roteiro anterior ficou LONGO demais. Escreva MENOS palavras — reduza para aproximadamente ${targetWords} palavras. Corte partes menos importantes mas mantenha a energia e a CTA final.`;
  } else if (adjustment === 'EXPANDIR') {
    adjustmentInstruction = `\nATENÇÃO: O roteiro anterior ficou CURTO demais. Escreva MAIS palavras — expanda para aproximadamente ${targetWords} palavras. Adicione mais benefícios, detalhes ou emoção.`;
  }

  const prompt = `Você é um copywriter de vídeos curtos hiper-persuasivos (estilo TikTok/Reels de Achadinhos).
Sua missão é escrever um ROTEIRO FALADO vibrante, envolvente e focado em venda para narrar um vídeo da Shopee.
IMPORTANTE: O vídeo tem exatamente ${durationSecs} segundos. Escreva um roteiro com aproximadamente ${targetWords} palavras (isso fará a locução durar o tempo certo).${adjustmentInstruction}

DADOS ORIGINAIS DO PRODUTO:
Título completo da loja: ${title}
Preço: ${price}

${genderInstruction}

REGRAS OBRIGATÓRIAS PARA O ROTEIRO:
1. NOME CURTO E COMERCIAL: O "Título completo" tem muito lixo de SEO. Crie e use apenas um nome curto (Ex: de "Coturno Militar Feminino..." para "Bota Militar").
2. PERSUASÃO E DESEJO: Crie urgência, destaque o benefício de forma energética estilo TikTok, e faça a pessoa querer comprar na hora! Use palavras de emoção.
3. NÃO CITE O PREÇO: Nunca fale o preço no áudio. O preço será colocado na tela em texto, então o áudio não deve mencionar nenhum valor financeiro.
4. REVISÃO DE PORTUGUÊS E PRONÚNCIA: Escreva a palavra "Shopee" exatamente como "Chopí" para a voz sintética ler corretamente.
5. FORMATO E ENCERRAMENTO: Não use emojis ou aspas. Finalize dizendo enérgico: "Acesse o link na publicação!".`;

  const response = await axios.post(
    'https://api.groq.com/openai/v1/chat/completions',
    {
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 300,
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
    const isWin = process.platform === 'win32';
    const cmd = isWin 
      ? `cmd /c "${EDGE_TTS_BIN} -f "${tmpTxtFile}" --voice pt-BR-FranciscaNeural --write-media "${outputPath}""`
      : `/home/ubuntu/.local/bin/edge-tts -f "${tmpTxtFile}" --voice pt-BR-FranciscaNeural --write-media "${outputPath}"`;
    
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

    // 2. Duração exata do vídeo
    const durationSecs = await getVideoDuration(rawVideoPath);
    console.log(`[Job ${jobId}] Duração do vídeo: ${durationSecs}s`);

    // 3. Classificar gênero do produto
    const apiKey = process.env.GROQ_API_KEY;
    const gender = await classifyProductGender(title, apiKey);
    console.log(`[Job ${jobId}] Gênero detectado: ${gender}`);

    // 4. Loop de geração de roteiro + áudio até encaixar no tempo (máx 3 tentativas)
    let copy = '';
    let adjustment = null;
    const MAX_ATTEMPTS = 3;
    const TOLERANCE = 0.10; // 10% de tolerância

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      console.log(`[Job ${jobId}] Tentativa ${attempt}: gerando roteiro (ajuste: ${adjustment || 'nenhum'})...`);
      copy = await generateDubbingCopy(title, price, durationSecs, gender, adjustment);
      console.log(`[Job ${jobId}] Roteiro:\n${copy}`);

      console.log(`[Job ${jobId}] Gerando áudio TTS...`);
      await generateTTS(copy, audioPath);

      const audioDuration = await getAudioDuration(audioPath);
      if (audioDuration === null) {
        console.log(`[Job ${jobId}] Não foi possível medir áudio. Usando como está.`);
        break;
      }

      const diff = audioDuration - durationSecs;
      const diffRatio = Math.abs(diff) / durationSecs;
      console.log(`[Job ${jobId}] Áudio: ${audioDuration.toFixed(1)}s | Vídeo: ${durationSecs}s | Diferença: ${diff > 0 ? '+' : ''}${diff.toFixed(1)}s (${(diffRatio * 100).toFixed(0)}%)`);

      if (diffRatio <= TOLERANCE) {
        console.log(`[Job ${jobId}] ✅ Sincronizado! Diferença dentro da tolerância.`);
        break;
      }

      if (attempt < MAX_ATTEMPTS) {
        adjustment = diff > 0 ? 'ENCURTAR' : 'EXPANDIR';
        console.log(`[Job ${jobId}] ⚠️ Fora do tempo. Ajuste: ${adjustment}.`);
        // Apaga áudio anterior antes de gerar novo
        try { fs.unlinkSync(audioPath); } catch(e) {}
      } else {
        console.log(`[Job ${jobId}] Máx tentativas atingidas. Usando melhor resultado disponível.`);
      }
    }

    // 5. Merge vídeo + áudio
    console.log(`[Job ${jobId}] Mesclando vídeo e áudio...`);
    await mergeAudioVideo(rawVideoPath, audioPath, finalVideoPath);

    // 6. Cleanup
    fs.unlinkSync(rawVideoPath);
    fs.unlinkSync(audioPath);

    // Reverter "Chopí" para "Shopee" na copy do banco/frontend
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
