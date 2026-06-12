export function maskSecret(value: string | undefined | null) {
  if (!value) return "não configurado";
  if (value.length <= 6) return "configurado";
  return `${value.slice(0, 3)}...${value.slice(-3)}`;
}

export function isPublicSafeEnvName(name: string) {
  return name.startsWith("NEXT_PUBLIC_") || !/(TOKEN|SECRET|PASSWORD|KEY)/i.test(name);
}
