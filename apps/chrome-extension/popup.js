document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('extractBtn');
  const btnText = document.getElementById('btnText');
  const btnLoader = document.getElementById('btnLoader');
  const statusDiv = document.getElementById('status');
  const previewDiv = document.getElementById('preview');

  function setLoading(isLoading) {
    if (isLoading) {
      btn.disabled = true;
      btnText.style.display = 'none';
      btnLoader.style.display = 'block';
    } else {
      btn.disabled = false;
      btnText.style.display = 'inline';
      btnLoader.style.display = 'none';
    }
  }

  function showStatus(message, type) {
    statusDiv.textContent = message;
    statusDiv.className = `status ${type}`;
  }

  btn.addEventListener('click', async () => {
    setLoading(true);
    showStatus('Extraindo dados da página...', '');
    
    // Pegar a aba atual
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0];
      
      // Injetar script caso ainda não esteja
      chrome.scripting.executeScript({
        target: { tabId: activeTab.id },
        files: ['content.js']
      }, () => {
        // Enviar mensagem para extrair
        chrome.tabs.sendMessage(activeTab.id, { action: 'extract' }, async (response) => {
          if (!response) {
            showStatus('Erro: Não foi possível extrair os dados. Recarregue a página e tente novamente.', 'error');
            setLoading(false);
            return;
          }

          if (!response.price || response.price === 0) {
            showStatus('Aviso: Preço não encontrado na tela, mas vamos tentar enviar mesmo assim.', 'error');
          } else {
            showStatus('Dados extraídos! Enviando para o Caça Oferta...', 'success');
          }

          previewDiv.innerHTML = `
            <strong>Título:</strong> ${response.title}<br>
            <strong>Preço:</strong> R$ ${response.price}<br>
            <img src="${response.imageUrl}" alt="Produto">
          `;

          // Pegar canais selecionados
          const selectedChannels = [];
          if (document.getElementById('chk-telegram').checked) selectedChannels.push('telegram');
          if (document.getElementById('chk-whatsapp').checked) selectedChannels.push('whatsapp');
          if (document.getElementById('chk-instagram').checked) selectedChannels.push('instagram');

          if (selectedChannels.length === 0) {
             showStatus('Aviso: Nenhum canal selecionado.', 'error');
             setLoading(false);
             return;
          }

          response.channels = selectedChannels;

          // Enviar para o Backend da Vercel
          try {
            // URL de Produção (Vercel)
            const apiUrl = 'https://caca-oferta-oficial.vercel.app/api/publish/extension';
            // Para teste local, descomente a linha abaixo:
            // const apiUrl = 'http://localhost:3000/api/publish/extension';
            
            const res = await fetch(apiUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(response)
            });

            if (res.ok) {
              const result = await res.json();
              showStatus('Publicação enviada com sucesso para o Telegram!', 'success');
            } else {
              const err = await res.json();
              showStatus(`Erro do Servidor: ${err.error || 'Falha ao publicar'}`, 'error');
            }
          } catch (err) {
            showStatus(`Erro de Conexão: ${err.message}`, 'error');
          } finally {
            setLoading(false);
          }
        });
      });
    });
  });
});
