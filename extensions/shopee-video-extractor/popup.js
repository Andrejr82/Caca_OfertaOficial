let currentVideoUrl = null;
let currentTitle = "Shopee_Video";
let currentOriginalUrl = null;

document.getElementById('extractBtn').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  if (!tab.url.includes("shopee.com.br")) {
    document.getElementById('status').innerText = "Erro: Abra uma página de produto da Shopee.";
    return;
  }

  document.getElementById('status').innerText = "Buscando vídeo e título...";
  document.getElementById('extractBtn').disabled = true;

  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['video-parser.js', 'content.js']
  }, (results) => {
    document.getElementById('extractBtn').disabled = false;
    
    if (chrome.runtime.lastError || !results || !results[0]) {
      document.getElementById('status').innerText = "Erro ao injetar script.";
      return;
    }

    const data = results[0].result;
    
    if (data && data.videoUrl) {
      currentVideoUrl = data.videoUrl;
      currentTitle = data.title || "Shopee_Video";
      currentOriginalUrl = data.originalUrl || "";
      window.currentImageUrl = data.imageUrl || "";
      window.currentPrice = data.price || "0";
      
      document.getElementById('status').innerText = `Vídeo encontrado!\nProduto: ${currentTitle}\nPreço: R$ ${window.currentPrice}`;
      
      const resultDiv = document.getElementById('result');
      resultDiv.style.display = 'block';
      resultDiv.innerHTML = `<a href="${currentVideoUrl}" target="_blank">Clique para visualizar vídeo</a>`;
      
      const dubBtn = document.getElementById('dubBtn');
      dubBtn.style.display = 'block';
    } else {
      document.getElementById('status').innerText = "Nenhum vídeo encontrado. (Dica: tente dar Play no vídeo primeiro).";
      document.getElementById('result').style.display = 'none';
      document.getElementById('dubBtn').style.display = 'none';
    }
  });
});

document.getElementById('dubBtn').addEventListener('click', async () => {
  if (currentVideoUrl) {
    const statusEl = document.getElementById('status');
    const dubBtn = document.getElementById('dubBtn');
    
    statusEl.innerText = "Preparando vídeo...\nEnviando para a Oracle preparar o vídeo...\nMontagem, narração e renderização em andamento.";
    dubBtn.disabled = true;
    dubBtn.innerText = "Dublando...";

    try {
      const response = await fetch('http://193.122.242.178:3002/api/shopee/dub-video', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          token: 'oracle-sec-v2-inhouse-2026',
          videoUrl: currentVideoUrl,
          title: currentTitle,
          price: window.currentPrice,
          originalUrl: currentOriginalUrl,
          imageUrl: window.currentImageUrl,
          tenantId: "7a9ca7b7-f464-46e0-a9de-9b322c73628a" // ID do usuário administrador para aparecer no painel
        })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        statusEl.innerText = `Sucesso! Vídeo salvo no painel! ID da Oferta: ${data.data.offerId}`;
      } else {
        statusEl.innerText = `Erro Oracle: ${data.error}`;
      }
    } catch (error) {
      statusEl.innerText = `Falha na conexão: O servidor Oracle remoto (193.122.242.178) está rodando?`;
      dubBtn.disabled = false;
    } finally {
      dubBtn.disabled = false;
      dubBtn.innerText = "Dublar e Enviar (Oracle)";
    }
  }
});
