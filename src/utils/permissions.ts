export function hasPermission(permissions: readonly string[], permission?: string | null): boolean {
  return Boolean(permission && permissions.includes(permission))
}
export function safeReturnPath(
  value: unknown,
  allowedPaths: readonly string[],
  fallback = '/',
): string {
  if (
    typeof value !== 'string' ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    /[\\\s%?#]/.test(value)
  )
    return fallback
  return allowedPaths.includes(value) ? value : fallback
}
export function displayIdentity(identityType?: string): string {
  return (
    (
      { BUYER: '采购方组织', SUPPLIER: '供应商企业', PLATFORM: '平台身份' } as Record<
        string,
        string
      >
    )[identityType || ''] || '组织身份'
  )
}
export function shanghaiTime(value: string | Date): string {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}
