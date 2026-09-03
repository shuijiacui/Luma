const parseBoolean = (value: string | undefined, fallback: boolean) => {
  if (value === undefined) return fallback
  return value.toLowerCase() === 'true'
}

export const env = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL || '/api',
  useMocks: parseBoolean(import.meta.env.VITE_USE_MOCKS, true),
} as const
