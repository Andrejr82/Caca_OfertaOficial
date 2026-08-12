export async function readApiJson<T extends { message?: string; ok?: boolean }>(response: Response): Promise<T> {
  const body = await response.text();
  let payload: T | null = null;
  try {
    payload = body ? JSON.parse(body) as T : null;
  } catch {
    const message = response.status === 504
      ? `Servidor demorou além do limite (${response.status})`
      : `Servidor retornou uma resposta inválida (${response.status})`;
    throw new Error(message);
  }
  if (!payload) throw new Error(`Servidor retornou uma resposta vazia (${response.status})`);
  return payload;
}
