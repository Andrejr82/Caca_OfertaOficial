const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { exec } = require('child_process');
const axios = require('axios');
const ffmpeg = require('fluent-ffmpeg');

// Se o edge-tts não estiver no PATH global do sistema, usaremos este atalho validado:
const EDGE_TTS_BIN = 'C:\\Users\\Andr\u00E9\\AppData\\Local\\Python\\pythoncore-3.14-64\\Scripts\\edge-tts.exe';

async function generateDubbingCopy(title, price) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY não configurada no .env.local');

  const prompt = `Você é um copywriter de vídeos curtos hiper-persuasivos (estilo TikTok/Reels de Achadinhos).
Sua missão é escrever um ROTEIRO FALADO vibrante, envolvente e focado em venda (com até 20 segundos de locução) para narrar um vídeo da Shopee.

DADOS ORIGINAIS DO PRODUTO:
Título completo da loja: ${title}
Preço: ${price}

REGRAS OBRIGATÓRIAS PARA O ROTEIRO:
1. NOME CURTO E COMERCIAL: O "Título completo" acima tem muito lixo de SEO. No seu roteiro, NUNCA leia o título completo. Crie e use apenas um nome curto (Ex: de "Coturno Militar Feminino Tratorado..." para "Bota Militar"; de "Torneira cozinha parede preta..." para "Torneira Flexível").
2. PERSUASÃO E DESEJO: Crie urgência, destaque o benefício de forma energética estilo TikTok, e faça a pessoa querer comprar na hora! Use palavras de emoção.
3. CONCORDÂNCIA GRAMATICAL E GÊNERO: Preste muita atenção ao GÊNERO da palavra (A Torneira, A Bota, O Coturno). NUNCA mude a palavra para forçar o gênero (NÃO invente "torneiro" se for torneira). Diga "Esta é a torneira", "Este é o coturno".
4. REVISÃO DE PORTUGUÊS: Escreva em português perfeito. Cuidado com erros de digitação (use "conforto" e não "conforte").
5. PRONÚNCIA: Sempre escreva a palavra "Shopee" exatamente como "Chopí" para a voz sintética pronunciar certo.
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
        '-c:a aac',
        '-shortest' // Corta o vídeo/áudio no menor tamanho
      ])
      .save(outputPath)
      .on('end', resolve)
      .on('error', reject);
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

    // 2. Gerar a Copy (LLM)
    console.log(`[Job ${jobId}] Gerando roteiro com LLM...`);
    let copy = await generateDubbingCopy(title, price);
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
