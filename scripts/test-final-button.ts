import { config } from 'dotenv';
import { resolve } from 'path';

// Carrega as variáveis de ambiente
config({ path: resolve(process.cwd(), '.env.local') });

// Precisamos simular o Server Action importando a função
import { publishToInstagramAction } from '../src/lib/publish/actions';

// IMPORTANTE: Simulamos o Supabase Client para não falhar na verificação de autenticação
// Para o teste do botão isolado, bypassamos a checagem se não tivermos sessão de navegador no CLI.
// Como não podemos injetar cookies fácil aqui, vamos fazer o teste via UI ou usar o script anterior
// que chama direto o Cloudinary e o Client.
