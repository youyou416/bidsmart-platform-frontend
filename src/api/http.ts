import { API_BASE } from '../config/public'
import type { CsrfToken, Envelope } from '../types/api'

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public traceId = '',
  ) {
    super(message)
    this.name = 'ApiError'
  }
}
export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  body?: unknown
  signal?: AbortSignal
  timeoutMs?: number
  notifyUnauthorized?: boolean
}
function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const cancel = () => reject(new DOMException('Request aborted', 'AbortError'))
    if (signal.aborted) {
      cancel()
      return
    }
    signal.addEventListener('abort', cancel, { once: true })
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', cancel))
  })
}
const statusMessages: Record<number, string> = {
  400: '请求参数不正确，请检查后重试',
  401: '会话已失效，请重新登录',
  403: '操作被拒绝，请检查权限或重新获取安全令牌',
  429: '请求过于频繁，请稍后重试',
  500: '服务暂时不可用，请稍后重试',
}

export class RequestClient {
  private csrf: CsrfToken | null = null
  private csrfPromise: Promise<CsrfToken> | null = null
  private csrfGeneration = 0
  private mutations = new Set<string>()
  onUnauthorized?: () => void

  constructor(
    private base = API_BASE,
    private fetcher: typeof fetch = (...args) => fetch(...args),
  ) {}

  clearCsrf() {
    this.csrfGeneration++
    this.csrf = null
    this.csrfPromise = null
  }

  async refreshCsrf(): Promise<CsrfToken> {
    this.csrf = null
    if (!this.csrfPromise) {
      const generation = this.csrfGeneration
      this.csrfPromise = this.request<CsrfToken>('/security/csrf', { notifyUnauthorized: false })
        .then((value) => {
          if (generation !== this.csrfGeneration)
            throw new ApiError(0, 'STALE_CSRF', '安全会话已更新，请重试')
          if (!value?.token || value.headerName !== 'X-CSRF-TOKEN')
            throw new ApiError(0, 'INVALID_CSRF', '安全握手响应不正确')
          this.csrf = value
          return value
        })
        .finally(() => {
          if (generation === this.csrfGeneration) this.csrfPromise = null
        })
    }
    return this.csrfPromise
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    if (!/^\/[a-zA-Z0-9/_-]+$/.test(path)) throw new ApiError(0, 'INVALID_PATH', '接口路径不合法')
    const method = options.method || 'GET'
    const mutation = method !== 'GET'
    const key = `${method}:${path}`
    if (mutation && this.mutations.has(key))
      throw new ApiError(0, 'DUPLICATE_SUBMISSION', '请求正在处理，请勿重复提交')
    if (mutation) this.mutations.add(key)
    const controller = new AbortController()
    let timedOut = false
    const timeout = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, options.timeoutMs ?? 15000)
    const cancel = () => controller.abort()
    options.signal?.addEventListener('abort', cancel, { once: true })
    if (options.signal?.aborted) controller.abort()
    try {
      const headers: Record<string, string> = { Accept: 'application/json' }
      if (options.body !== undefined) headers['Content-Type'] = 'application/json'
      if (mutation) {
        const csrf = this.csrf || (await abortable(this.refreshCsrf(), controller.signal))
        headers[csrf.headerName] = csrf.token
      }
      if (controller.signal.aborted) throw new DOMException('Request aborted', 'AbortError')
      const response = await this.fetcher(`${this.base}${path}`, {
        method,
        headers,
        credentials: 'same-origin',
        cache: 'no-store',
        signal: controller.signal,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
      })
      let payload: Envelope<T> | null = null
      try {
        payload = (await response.json()) as Envelope<T>
      } catch {
        if (controller.signal.aborted) throw new DOMException('Request aborted', 'AbortError')
        /* Proxy or transport errors may not contain JSON. */
      }
      if (!response.ok) {
        if (response.status === 401) {
          this.clearCsrf()
          if (options.notifyUnauthorized !== false) this.onUnauthorized?.()
        }
        if (response.status === 403) this.clearCsrf()
        throw new ApiError(
          response.status,
          payload?.code || 'HTTP_ERROR',
          response.status === 401 && path === '/auth/login'
            ? '账号或密码错误，或账号暂不可用'
            : statusMessages[response.status] || '服务响应异常，请稍后重试',
          payload?.traceId || '',
        )
      }
      if (!payload || typeof payload !== 'object' || payload.code !== 'OK' || !('data' in payload))
        throw new ApiError(0, 'INVALID_RESPONSE', '服务响应格式不正确')
      return payload.data
    } catch (error) {
      if (error instanceof ApiError) throw error
      if (controller.signal.aborted)
        throw new ApiError(
          0,
          timedOut ? 'TIMEOUT' : 'CANCELLED',
          timedOut ? '请求超时，请稍后重试' : '请求已取消',
        )
      throw new ApiError(0, 'NETWORK_ERROR', '无法连接服务，请检查后端是否已启动')
    } finally {
      clearTimeout(timeout)
      options.signal?.removeEventListener('abort', cancel)
      if (mutation) this.mutations.delete(key)
    }
  }
}
export const http = new RequestClient()
export function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : '操作未完成，请稍后重试'
}
