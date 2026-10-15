import { describe, expect, it } from 'vitest'
import { hasPermission, safeReturnPath, shanghaiTime } from '../permissions'

describe('safe login return destinations', () => {
  it('accepts only exact registered internal paths', () => {
    expect(safeReturnPath('/home', ['/home'])).toBe('/home')
    expect(safeReturnPath('/not-registered', ['/home'])).toBe('/')
    expect(safeReturnPath('/not-registered', ['/home'], '/home')).toBe('/home')
  })

  it.each([
    'https://outside.example',
    'http://outside.example',
    '//outside.example',
    '/\\outside.example',
    '/%2f%2foutside.example',
    '/%252f%252foutside.example',
    '/home?next=https://outside.example',
    '/home#outside.example',
    '/home\n',
    '/home\t',
    '/ home',
    'javascript:alert(1)',
    'home',
    null,
    ['/home'],
    { path: '/home' },
  ])('rejects an external, ambiguous, or non-string value: %j', (value) => {
    expect(safeReturnPath(value, ['/home'])).toBe('/')
  })
})

describe('display permissions and timezone', () => {
  it('checks exact grants and does not treat missing permissions or wildcard as authorized', () => {
    expect(hasPermission(['platform:home:view'], 'platform:home:view')).toBe(true)
    expect(hasPermission(['*'], 'platform:home:view')).toBe(false)
    expect(hasPermission(['platform:home:view'], undefined)).toBe(false)
    expect(hasPermission(['platform:home:view'], null)).toBe(false)
    expect(hasPermission(['platform:home:view'], 'platform:home:edit')).toBe(false)
  })

  it('renders a UTC timestamp in Asia/Shanghai regardless of the host timezone', () => {
    const result = shanghaiTime('2026-01-01T00:00:00Z')
    expect(result).toContain('08:00')
    expect(result).toContain('2026')
  })
})
