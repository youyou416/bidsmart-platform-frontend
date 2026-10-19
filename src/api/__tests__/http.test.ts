import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, RequestClient } from '../http'

const csrf = { token: 'synthetic-csrf-token', headerName: 'X-CSRF-TOKEN' }
function response(data: unknown, status = 200, code = 'OK'): Response {
  return new Response(
    JSON.stringify({ code, message: 'synthetic test response', data, traceId: 'trace-test' }),
    { status, headers: { 'Content-Type': 'application/json' } },
  )
}
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
function abortableFetch(): typeof fetch {
  return vi.fn((_input: RequestInfo | URL, options?: RequestInit) => {
    return new Promise<Response>((_resolve, reject) => {
      options?.signal?.addEventListener('abort', () =>
        reject(new DOMException('Aborted', 'AbortError')),
      )
    })
  })
}
function pendingJsonFetch() {
  const bodyStarted = deferred<void>()
  const fetcher = vi.fn<typeof fetch>((_input, options) => {
    const headersOnly = response(null)
    vi.spyOn(headersOnly, 'json').mockImplementation(() => {
      bodyStarted.resolve()
      return new Promise((_resolve, reject) => {
        const cancel = () => reject(new DOMException('Body read aborted', 'AbortError'))
        if (options?.signal?.aborted) cancel()
        else options?.signal?.addEventListener('abort', cancel, { once: true })
      })
    })
    return Promise.resolve(headersOnly)
  })
  return { fetcher, bodyStarted: bodyStarted.promise }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('HTTP response contract', () => {
  it('uses a unified login failure prompt for unknown, disabled, and incorrect-password accounts', async () => {
    const backendMessages = ['账号不存在', '账号已停用', '密码错误']
    const prompts = await Promise.all(
      backendMessages.map(async (message) => {
        const fetcher = vi
          .fn<typeof fetch>()
          .mockResolvedValueOnce(response(csrf))
          .mockResolvedValueOnce(
            new Response(JSON.stringify({ code: 'INVALID_CREDENTIALS', message, data: null }), {
              status: 401,
            }),
          )
        const client = new RequestClient('/api/v1', fetcher)
        client.onUnauthorized = vi.fn()
        const failure = await client
          .request('/auth/login', {
            method: 'POST',
            body: { username: 'synthetic-user', password: 'synthetic-password' },
            notifyUnauthorized: false,
          })
          .catch((error: unknown) => error)
        expect(failure).toBeInstanceOf(ApiError)
        expect(failure).toMatchObject({ status: 401, code: 'INVALID_CREDENTIALS' })
        expect(client.onUnauthorized).not.toHaveBeenCalled()
        return (failure as ApiError).message
      }),
    )
    expect(new Set(prompts).size).toBe(1)
    expect(prompts[0]).toBe('账号或密码错误，或账号暂不可用')
    expect(prompts[0]).not.toContain('会话已失效')
  })

  it('maps CAPTCHA_INVALID to a safe prompt while preserving its error code', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response(csrf))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 'CAPTCHA_INVALID',
            message: 'private detail',
            traceId: 'captcha-trace',
          }),
          { status: 400 },
        ),
      )
    const client = new RequestClient('/api/v1', fetcher)
    await expect(client.request('/auth/login', { method: 'POST', body: {} })).rejects.toMatchObject(
      {
        status: 400,
        code: 'CAPTCHA_INVALID',
        message: '验证码错误或已失效，请重新输入',
        traceId: 'captcha-trace',
      },
    )
  })

  it('uses same-origin cookies, disables caching, and unwraps successful envelopes', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response({ id: '9007199254740993' }))
    const client = new RequestClient('/api/v1', fetcher)
    expect(await client.request('/auth/me')).toEqual({ id: '9007199254740993' })
    expect(fetcher).toHaveBeenCalledWith(
      '/api/v1/auth/me',
      expect.objectContaining({
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
      }),
    )
  })

  it.each([400, 401, 403, 429, 500, 502])(
    'preserves HTTP %s as an error without exposing server internals',
    async (status) => {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
        new Response(
          JSON.stringify({
            code: 'TEST_REJECTION',
            message: 'jdbc:mysql://secret.invalid private-password',
            data: null,
            traceId: 'trace-rejected',
          }),
          { status },
        ),
      )
      const client = new RequestClient('/api/v1', fetcher)
      const error = await client.request('/auth/me').catch((value: unknown) => value)
      expect(error).toBeInstanceOf(ApiError)
      expect(error).toMatchObject({ status, code: 'TEST_REJECTION', traceId: 'trace-rejected' })
      expect((error as ApiError).message).not.toContain('private-password')
      expect((error as ApiError).message).not.toContain('jdbc:mysql')
    },
  )

  it('handles proxy failures that do not contain JSON', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('<html>gateway error</html>', { status: 502 }))
    await expect(new RequestClient('/api/v1', fetcher).request('/auth/me')).rejects.toMatchObject({
      status: 502,
      code: 'HTTP_ERROR',
    })
  })

  it.each([{ code: 'OK' }, { code: 'BUSINESS_ERROR', data: null }, null, true, 42, 'OK'])(
    'rejects a malformed success envelope: %j',
    async (payload) => {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(payload)))
      await expect(new RequestClient('/api/v1', fetcher).request('/auth/me')).rejects.toMatchObject(
        {
          code: 'INVALID_RESPONSE',
        },
      )
    },
  )

  it.each(['https://outside.example/api', '//outside.example/api', '/auth/me?token=secret'])(
    'rejects unsafe API paths before sending a request: %s',
    async (path) => {
      const fetcher = vi.fn<typeof fetch>()
      await expect(new RequestClient('/api/v1', fetcher).request(path)).rejects.toMatchObject({
        code: 'INVALID_PATH',
      })
      expect(fetcher).not.toHaveBeenCalled()
    },
  )

  it('reports connection failure without leaking transport details', async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error('private-network-detail'))
    const client = new RequestClient('/api/v1', fetcher)
    await expect(client.request('/auth/me')).rejects.toMatchObject({ code: 'NETWORK_ERROR' })
  })
})

describe('CSRF and submit protection', () => {
  it('gets a session-bound CSRF token before writes and sends it only in the requested header', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response(csrf))
      .mockResolvedValueOnce(response({ authenticated: true }))
    const client = new RequestClient('/api/v1', fetcher)
    await client.request('/auth/login', {
      method: 'POST',
      body: { username: 'synthetic-user', password: 'synthetic-secret' },
    })
    expect(fetcher.mock.calls[0]?.[0]).toBe('/api/v1/security/csrf')
    expect(fetcher.mock.calls[1]?.[1]).toMatchObject({
      method: 'POST',
      headers: { 'X-CSRF-TOKEN': csrf.token, 'Content-Type': 'application/json' },
      credentials: 'same-origin',
    })
  })

  it.each([
    { token: '', headerName: 'X-CSRF-TOKEN' },
    { token: 'synthetic', headerName: 'Authorization' },
  ])('rejects invalid CSRF handshakes before submitting credentials: %j', async (token) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response(token))
    const client = new RequestClient('/api/v1', fetcher)
    await expect(client.request('/auth/login', { method: 'POST', body: {} })).rejects.toMatchObject(
      { code: 'INVALID_CSRF' },
    )
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('deduplicates concurrent CSRF handshakes', async () => {
    const pending = deferred<Response>()
    const fetcher = vi.fn<typeof fetch>().mockReturnValue(pending.promise)
    const client = new RequestClient('/api/v1', fetcher)
    const first = client.refreshCsrf()
    const second = client.refreshCsrf()
    pending.resolve(response(csrf))
    await expect(Promise.all([first, second])).resolves.toEqual([csrf, csrf])
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('blocks an overlapping write, then frees that path after completion', async () => {
    const pending = deferred<Response>()
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response(csrf))
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce(response(null))
    const client = new RequestClient('/api/v1', fetcher)
    await client.refreshCsrf()
    const first = client.request('/auth/logout', { method: 'POST' })
    await expect(client.request('/auth/logout', { method: 'POST' })).rejects.toMatchObject({
      code: 'DUPLICATE_SUBMISSION',
    })
    pending.resolve(response(null))
    await first
    await expect(client.request('/auth/logout', { method: 'POST' })).resolves.toBeNull()
    expect(fetcher).toHaveBeenCalledTimes(3)
  })

  it('frees duplicate submission protection after an error', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response(csrf))
      .mockResolvedValueOnce(response(null, 500, 'INTERNAL_ERROR'))
      .mockResolvedValueOnce(response(null))
    const client = new RequestClient('/api/v1', fetcher)
    await expect(client.request('/auth/logout', { method: 'POST' })).rejects.toMatchObject({
      status: 500,
    })
    await expect(client.request('/auth/logout', { method: 'POST' })).resolves.toBeNull()
  })

  it('clears a rejected token so the next write redoes the handshake', async () => {
    const nextCsrf = { ...csrf, token: 'synthetic-next-csrf' }
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response(csrf))
      .mockResolvedValueOnce(response(null, 403, 'CSRF_INVALID'))
      .mockResolvedValueOnce(response(nextCsrf))
      .mockResolvedValueOnce(response(null))
    const client = new RequestClient('/api/v1', fetcher)
    await expect(client.request('/auth/logout', { method: 'POST' })).rejects.toMatchObject({
      status: 403,
    })
    await client.request('/auth/logout', { method: 'POST' })
    expect(fetcher.mock.calls[2]?.[0]).toBe('/api/v1/security/csrf')
    expect(fetcher.mock.calls[3]?.[1]?.headers).toMatchObject({ 'X-CSRF-TOKEN': nextCsrf.token })
  })

  it('notifies on 401, clears the prior token, and allows anonymous calls to suppress notification', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response(csrf))
      .mockResolvedValueOnce(response(null, 401, 'UNAUTHENTICATED'))
      .mockResolvedValueOnce(response({ ...csrf, token: 'next' }))
      .mockResolvedValueOnce(response(null, 401, 'UNAUTHENTICATED'))
    const client = new RequestClient('/api/v1', fetcher)
    client.onUnauthorized = vi.fn()
    await client.refreshCsrf()
    await expect(client.request('/auth/me')).rejects.toMatchObject({ status: 401 })
    await client.refreshCsrf()
    await expect(client.request('/auth/me', { notifyUnauthorized: false })).rejects.toMatchObject({
      status: 401,
    })
    expect(client.onUnauthorized).toHaveBeenCalledTimes(1)
    expect(fetcher.mock.calls[2]?.[0]).toBe('/api/v1/security/csrf')
  })

  it('does not reuse a stale handshake completed after a session reset', async () => {
    const oldHandshake = deferred<Response>()
    const nextCsrf = { ...csrf, token: 'synthetic-next-session-token' }
    const fetcher = vi
      .fn<typeof fetch>()
      .mockReturnValueOnce(oldHandshake.promise)
      .mockResolvedValueOnce(response(nextCsrf))
      .mockResolvedValueOnce(response(null))
    const client = new RequestClient('/api/v1', fetcher)
    const old = client.refreshCsrf().catch(() => null)
    client.clearCsrf()
    await client.refreshCsrf()
    oldHandshake.resolve(response(csrf))
    await old
    await client.request('/auth/logout', { method: 'POST' })
    expect(fetcher.mock.calls[2]?.[1]?.headers).toMatchObject({ 'X-CSRF-TOKEN': nextCsrf.token })
  })
})

describe('request timeout and cancellation', () => {
  it('reports timeout during a pending JSON body read as TIMEOUT', async () => {
    vi.useFakeTimers()
    const { fetcher, bodyStarted } = pendingJsonFetch()
    const client = new RequestClient('/api/v1', fetcher)
    const request = client.request('/auth/me', { timeoutMs: 50 })
    const assertion = expect(request).rejects.toMatchObject({ code: 'TIMEOUT' })
    await bodyStarted
    await vi.advanceTimersByTimeAsync(50)
    await assertion
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('reports cancellation during a pending JSON body read as CANCELLED', async () => {
    const { fetcher, bodyStarted } = pendingJsonFetch()
    const client = new RequestClient('/api/v1', fetcher)
    const controller = new AbortController()
    const request = client.request('/auth/me', { signal: controller.signal })
    const assertion = expect(request).rejects.toMatchObject({ code: 'CANCELLED' })
    await bodyStarted
    controller.abort()
    await assertion
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('reports a timed-out fetch as TIMEOUT', async () => {
    vi.useFakeTimers()
    const client = new RequestClient('/api/v1', abortableFetch())
    const request = client.request('/auth/me', { timeoutMs: 50 })
    const assertion = expect(request).rejects.toMatchObject({ code: 'TIMEOUT' })
    await vi.advanceTimersByTimeAsync(50)
    await assertion
  })

  it('reports caller cancellation as CANCELLED', async () => {
    const client = new RequestClient('/api/v1', abortableFetch())
    const controller = new AbortController()
    const request = client.request('/auth/me', { signal: controller.signal })
    const assertion = expect(request).rejects.toMatchObject({ code: 'CANCELLED' })
    controller.abort()
    await assertion
  })

  it('does not send an already-cancelled request', async () => {
    const fetcher = vi.fn<typeof fetch>()
    const controller = new AbortController()
    controller.abort()
    const client = new RequestClient('/api/v1', fetcher)
    await expect(client.request('/auth/me', { signal: controller.signal })).rejects.toMatchObject({
      code: 'CANCELLED',
    })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('settles a cancelled mutation promptly even if the CSRF handshake is pending', async () => {
    const handshake = deferred<Response>()
    const fetcher = vi.fn<typeof fetch>().mockReturnValue(handshake.promise)
    const client = new RequestClient('/api/v1', fetcher)
    const controller = new AbortController()
    const observed = client
      .request('/auth/login', { method: 'POST', signal: controller.signal })
      .catch((error: unknown) => error)
    controller.abort()
    const outcome = await Promise.race([
      observed,
      new Promise<string>((resolve) => setTimeout(() => resolve('still-pending'), 30)),
    ])
    handshake.resolve(response(csrf))
    await observed
    expect(outcome).toMatchObject({ code: 'CANCELLED' })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
})
