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
          content: `Você é um especialista em gramática portuguesa. Analise o título abaixo e identifique o SUBSTANTIVO PRINCIPAL do produto (a palavra que nomeia o objeto em si, ignorando adjetivos, marcas e especificações técnicas).\nDepois, responda APENAS com uma palavra: MASCULINO ou FEMININO, de acordo com o gênero gramatical desse substantivo principal em português.\nExemplos: "Torneira Elétrica Slim" → substantivo: torneira → FEMININO. "Copo Stanley 900ml" → substantivo: copo → MASCULINO.\nTítulo: ${title}`
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

  // Francisca fala ~3.2 palavras/segundo em pt-BR (calibrado para não cortar antes do fim)
  const targetWords = Math.round(durationSecs * 3.2);
  // max_tokens dinâmico: ~2 tokens por palavra + margem de segurança
  const dynamicMaxTokens = Math.max(300, targetWords * 2 + 80);

  const genderInstruction = gender === 'FEMININO'
    ? `GÊNERO DO PRODUTO: FEMININO. Use OBRIGATORIAMENTE artigos e pronomes femininos: "A [produto]", "esta [produto]", "sua nova aliada", "incrível", "perfeita", "prática", etc.`
    : `GÊNERO DO PRODUTO: MASCULINO. Use OBRIGATORIAMENTE artigos e pronomes masculinos: "O [produto]", "este [produto]", "seu novo aliado", "incrível", "perfeito", "prático", etc.`;

  let adjustmentInstruction = '';
  if (adjustment === 'ENCURTAR') {
    adjustmentInstruction = ` ATENÇÃO: O roteiro anterior ficou LONGO demais. Reduza para EXATAMENTE aproximadamente ${targetWords} palavras. Corte partes menos importantes mas mantenha a energia e a CTA final.`;
  } else if (adjustment === 'EXPANDIR') {
    adjustmentInstruction = ` ATENÇÃO: O roteiro anterior ficou CURTO demais. Expanda para EXATAMENTE aproximadamente ${targetWords} palavras. Adicione mais benefícios, detalhes ou emoção.`;
  }

  const prompt = `Você é um dos melhores copywriters de vídeos curtos do Brasil, especialista em Reels e TikTok de Achadinhos.
Sua missão é criar um ROTEIRO FALADO que faça o espectador PARAR de rolar o feed, SENTIR desejo imediato pelo produto e CLICAR para comprar.
IMPORTANTE: O vídeo tem exatamente ${durationSecs} segundos. Escreva um roteiro com EXATAMENTE aproximadamente ${targetWords} palavras — nem mais, nem menos.${adjustmentInstruction}

DADOS DO PRODUTO:
Título completo: ${title}
Preço: ${price}

${genderInstruction}

REGRAS OBRIGATÓRIAS:
1. NOME CURTO: Crie um nome comercial curto e impactante. Ignore o lixo de SEO do título original (ex: "Torneira Elétrica Aquecida 5500W Premium" → "torneira quente").
2. GANCHO INICIAL PODEROSO: Comece com uma frase de impacto que desperte curiosidade ou desejo imediato. Ex: "Sabe aquela [produto] dos seus sonhos?", "Isso vai transformar sua [rotina/cozinha/banheiro]!".
3. BENEFÍCIOS COM EMOÇÃO: Apresente 2-3 benefícios reais de forma apaixonada. Use verbos de ação e transformação: "elimina", "transforma", "resolve", "chega de...", "imagina...".
4. URGÊNCIA E ESCASSEZ: Crie senso de urgência. Ex: "Tá com preço absurdo agora!", "Corre que vai acabar!", "Só hoje na Chopí!".
5. NÃO CITE O PREÇO: Nunca mencione valores financeiros. O preço aparece na tela.
6. PRONÚNCIA: Escreva "Shopee" como "Chopí" para a voz sintética pronunciar corretamente.
7. ENCERRAMENTO: Finalize com energia máxima: "Acesse o link na publicação!". Sem emojis, sem aspas.`;

  const response = await axios.post(
    'https://api.groq.com/openai/v1/chat/completions',
    {
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: dynamicMaxTokens,
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
