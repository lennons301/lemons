export function maskApiKey(key: string | null | undefined): string | null {
  if (!key) return null
  const last4 = key.slice(-4)
  const prefix = key.startsWith('sk-ant-') ? 'sk-ant-' : ''
  return `${prefix}...${last4}`
}
