import type { MenuResource } from '../types/api'
import { hasPermission } from '../utils/permissions'

export const COMPONENT_PATHS: Readonly<Record<string, string>> = Object.freeze({ Home: '/home' })
const RESERVED_NAMES = new Set(['Layout', 'Login', 'Password', 'Forbidden', 'NotFound', 'Error'])
export function sanitizeMenus(
  resources: readonly MenuResource[],
  permissions: readonly string[],
): MenuResource[] {
  const ids = new Set<string>()
  const names = new Set<string>()
  const paths = new Set<string>()
  const visit = (nodes: readonly MenuResource[], depth: number): MenuResource[] => {
    if (depth > 16 || !Array.isArray(nodes)) return []
    const result: MenuResource[] = []
    for (const node of nodes.slice(0, 500)) {
      if (!node || !node.id || ids.has(node.id) || !node.enabled || node.type === 'BUTTON') continue
      ids.add(node.id)
      if (node.type === 'DIRECTORY') {
        const children = visit(node.children || [], depth + 1)
        if (children.length) result.push({ ...node, children })
        continue
      }
      const approvedPath = node.component ? COMPONENT_PATHS[node.component] : undefined
      if (
        node.type !== 'MENU' ||
        !approvedPath ||
        node.path !== approvedPath ||
        !node.routeName ||
        !/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(node.routeName) ||
        RESERVED_NAMES.has(node.routeName) ||
        names.has(node.routeName) ||
        paths.has(node.path) ||
        !hasPermission(permissions, node.permission)
      )
        continue
      names.add(node.routeName)
      paths.add(node.path)
      result.push({ ...node, children: [] })
    }
    return result
  }
  return visit(resources, 0)
}
export function flattenMenus(nodes: readonly MenuResource[]): MenuResource[] {
  return nodes.flatMap((node) => (node.type === 'MENU' ? [node] : flattenMenus(node.children)))
}
export function visibleMenus(nodes: readonly MenuResource[]): MenuResource[] {
  return nodes
    .filter((node) => node.visible)
    .map((node) => ({ ...node, children: visibleMenus(node.children) }))
}
