import { describe, expect, it } from 'vitest'
import type { MenuResource } from '../../types/api'
import { flattenMenus, sanitizeMenus, visibleMenus } from '../menu'

const granted = ['platform:home:view']
function menu(overrides: Partial<MenuResource> = {}): MenuResource {
  return {
    id: '1000000000000000001',
    parentId: null,
    name: '框架首页',
    type: 'MENU',
    routeName: 'Home',
    path: '/home',
    component: 'Home',
    icon: null,
    visible: true,
    enabled: true,
    permission: granted[0]!,
    children: [],
    ...overrides,
  }
}
function directory(children: MenuResource[], overrides: Partial<MenuResource> = {}): MenuResource {
  return menu({
    id: '2000000000000000001',
    type: 'DIRECTORY',
    routeName: null,
    path: null,
    component: null,
    permission: null,
    children,
    ...overrides,
  })
}

describe('authorized resource mapping', () => {
  it('maps registered pages without reducing long string identifiers', () => {
    const result = sanitizeMenus([directory([menu()])], granted)
    expect(flattenMenus(result)).toEqual([menu()])
    expect(result[0]?.id).toBe('2000000000000000001')
  })

  it.each([
    { component: 'https://outside.example/page.js' },
    { component: '../pages/Home.vue' },
    { component: 'window.alert(1)' },
    { component: 'UnregisteredPage' },
    { path: '/another-page' },
    { routeName: 'Login' },
    { routeName: 'Home;alert(1)' },
    { permission: null },
    { permission: 'platform:other:view' },
    { type: 'BUTTON' as const },
  ])('rejects an unsafe or unauthorized page: %j', (overrides) => {
    expect(sanitizeMenus([menu(overrides)], granted)).toEqual([])
  })

  it('requires explicit permission and grants no administrator or wildcard bypass', () => {
    expect(sanitizeMenus([menu()], [])).toEqual([])
    expect(sanitizeMenus([menu()], ['*', 'admin'])).toEqual([])
  })

  it('removes disabled pages and all descendants of a disabled directory', () => {
    expect(sanitizeMenus([menu({ enabled: false })], granted)).toEqual([])
    expect(sanitizeMenus([directory([menu()], { enabled: false })], granted)).toEqual([])
  })

  it('keeps hidden pages authorized while excluding them from the visible menu', () => {
    const tree = sanitizeMenus([directory([menu({ visible: false })])], granted)
    expect(flattenMenus(tree).map((node) => node.path)).toEqual(['/home'])
    expect(flattenMenus(visibleMenus(tree))).toEqual([])
  })

  it('allows hidden directories to preserve routes without displaying their descendants', () => {
    const tree = sanitizeMenus([directory([menu()], { visible: false })], granted)
    expect(flattenMenus(tree).map((node) => node.path)).toEqual(['/home'])
    expect(visibleMenus(tree)).toEqual([])
  })

  it('does not register two routes for the same path', () => {
    const tree = sanitizeMenus([menu(), menu({ id: '2', routeName: 'AnotherHome' })], granted)
    expect(flattenMenus(tree).map((node) => node.routeName)).toEqual(['Home'])
  })

  it('does not register a duplicate resource identifier', () => {
    const tree = sanitizeMenus([menu(), menu({ routeName: 'AnotherHome' })], granted)
    expect(flattenMenus(tree)).toHaveLength(1)
  })

  it('terminates a cyclic resource graph and still keeps valid independent pages', () => {
    const cycle = directory([])
    cycle.children = [cycle, menu()]
    const result = sanitizeMenus([cycle], granted)
    expect(flattenMenus(result).map((node) => node.path)).toEqual(['/home'])
    expect(result[0]?.children).toHaveLength(1)
  })

  it('drops empty directories rather than showing unauthorized entries', () => {
    expect(sanitizeMenus([directory([menu()])], [])).toEqual([])
  })
})
