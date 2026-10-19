import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

// All API responses and accounts in this test are synthetic browser fixtures.
// This does not test Spring Security, passwords, OceanBase, or production cookies.
assert.equal(process.version, 'v20.19.5', 'Run this smoke test with Node.js 20.19.5')
const baseURL = process.env.BROWSER_BASE_URL || 'http://127.0.0.1:5173'
const origin = new URL(baseURL).origin
assert.ok(
  ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(baseURL).hostname),
  'Only local browser test targets are allowed',
)
const executablePath = process.env.BROWSER_EXECUTABLE || '/usr/bin/chromium'
assert.ok(
  existsSync(executablePath),
  'Set BROWSER_EXECUTABLE to a local Chromium/Chrome executable',
)

let playwright
if (process.env.PLAYWRIGHT_MODULE) {
  playwright = await import(pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE)).href)
} else {
  try {
    playwright = await import('playwright-core')
  } catch {
    throw new Error(
      'Install playwright-core outside the project or set PLAYWRIGHT_MODULE to its index.js; see browser-tests/README.md',
    )
  }
}
const chromium = playwright.chromium || playwright.default?.chromium
assert.ok(chromium, 'The selected module must export Playwright Chromium')
const screenshotDirectory = process.env.BROWSER_SCREENSHOT_DIR
if (screenshotDirectory) await mkdir(screenshotDirectory, { recursive: true })

const accounts = new Map([
  [
    'browser-first',
    {
      id: '9007199254740993',
      displayName: '合成首次账户',
      password: 'synthetic-initial-password',
      first: true,
      granted: true,
    },
  ],
  [
    'browser-member',
    {
      id: '9007199254740994',
      displayName: '合成普通账户',
      password: 'synthetic-user-password',
      first: false,
      granted: true,
    },
  ],
  [
    'browser-denied',
    {
      id: '9007199254740995',
      displayName: '合成无授权账户',
      password: 'synthetic-denied-password',
      first: false,
      granted: false,
    },
  ],
])
accounts.set('browser-supplier', {
  id: '9007199254740996',
  displayName: '合成供应商账户',
  password: 'synthetic-supplier-password',
  first: false,
  granted: true,
  identityType: 'SUPPLIER',
})
// Known digits exist only in synthetic test fixtures, never in the frontend bundle.
const captchaAnswer = '2468'
const captchaPng = `data:image/png;base64,${(await readFile(new URL('./fixtures/captcha.png', import.meta.url))).toString('base64')}`
let activeCaptcha = null
let captchaLifetime = 120
let failNextCaptcha = false
let credentialChecks = 0
let activeUsername = null
let csrfToken = null
let cookieId = null
const calls = []
const pageErrors = []
const consoleErrors = []
const externalRequests = []
const results = []
const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})
const context = await browser.newContext({
  viewport: { width: 1440, height: 1050 },
  locale: 'zh-CN',
  timezoneId: 'Asia/Shanghai',
})
const page = await context.newPage()
page.on('pageerror', (error) => pageErrors.push(error.message))
page.on('console', (message) => {
  const expectedHttpFailure =
    message.text().startsWith('Failed to load resource:') &&
    /status of (400|401|429|503)\b/.test(message.text())
  if (message.type() === 'error' && !expectedHttpFailure) {
    consoleErrors.push(message.text())
  }
})

function currentUser() {
  const account = accounts.get(activeUsername)
  return {
    id: account.id,
    username: activeUsername,
    displayName: account.displayName,
    department: { id: '1001', name: '合成根部门' },
    identityType: account.identityType || 'BUYER',
    enterpriseId: account.identityType === 'SUPPLIER' ? '5001' : null,
    roles: account.first ? [] : [{ id: '1001', name: '合成角色' }],
    permissions: account.first || !account.granted ? [] : ['framework:home:view'],
    firstPasswordChangeRequired: account.first,
  }
}
function menus() {
  return [
    {
      id: '1001',
      parentId: null,
      name: '框架说明',
      type: 'MENU',
      routeName: 'FrameworkHome',
      path: '/home',
      component: 'Home',
      icon: 'House',
      visible: true,
      enabled: true,
      permission: 'framework:home:view',
      children: [],
    },
  ]
}
function setCookie(value, expired = false) {
  return `BIDSMARTSESSION=${value}; Path=/; HttpOnly; SameSite=Lax${expired ? '; Max-Age=0' : ''}`
}
async function reply(route, status, code, data = null, extraHeaders = {}) {
  await route.fulfill({
    status,
    contentType: 'application/json',
    headers: { 'Cache-Control': 'no-store', ...extraHeaders },
    body: JSON.stringify({
      code,
      message: code === 'OK' ? '成功' : '合成测试响应',
      data,
      traceId: 'synthetic-browser-trace',
    }),
  })
}
await context.route('**/*', async (route) => {
  const request = route.request()
  const url = new URL(request.url())
  if (url.origin !== origin) {
    externalRequests.push(`${url.origin}${url.pathname}`)
    await route.abort()
    return
  }
  if (!url.pathname.startsWith('/api/v1/')) {
    await route.continue()
    return
  }
  const path = url.pathname.slice('/api/v1'.length)
  const method = request.method()
  calls.push({ path, method })
  if (path === '/app/public-config') {
    await reply(route, 200, 'OK', {
      systemName: '智采 · 合成浏览器验收',
      logoPath: '/mark.svg',
      themeColor: '#087f78',
      tabsEnabled: true,
    })
    return
  }
  if (path === '/security/csrf') {
    csrfToken = randomUUID()
    cookieId ||= randomUUID()
    await reply(
      route,
      200,
      'OK',
      { token: csrfToken, headerName: 'X-CSRF-TOKEN' },
      { 'Set-Cookie': setCookie(cookieId) },
    )
    return
  }
  if (method === 'POST' && request.headers()['x-csrf-token'] !== csrfToken) {
    await reply(route, 403, 'CSRF_INVALID')
    return
  }
  if (path === '/security/captcha') {
    assert.equal(method, 'POST')
    if (failNextCaptcha) {
      failNextCaptcha = false
      await reply(route, 503, 'UNAVAILABLE')
      return
    }
    activeCaptcha = {
      id: randomBytes(24).toString('base64url'),
      cookie: cookieId,
      until: Date.now() + captchaLifetime * 1000,
    }
    await reply(route, 200, 'OK', {
      captchaId: activeCaptcha.id,
      imageDataUrl: captchaPng,
      expiresAt: new Date(activeCaptcha.until).toISOString(),
      expiresInSeconds: captchaLifetime,
    })
    return
  }
  if (path === '/auth/login') {
    const input = request.postDataJSON()
    assert.deepEqual(
      Object.keys(input).sort(),
      ['captchaCode', 'captchaId', 'password', 'username'],
      'The browser must not set server-side identity or grants',
    )
    const challenge = activeCaptcha
    activeCaptcha = null
    if (
      !challenge ||
      input.captchaId !== challenge.id ||
      input.captchaCode !== captchaAnswer ||
      challenge.cookie !== cookieId ||
      Date.now() >= challenge.until
    ) {
      await reply(route, 400, 'CAPTCHA_INVALID')
      return
    }
    credentialChecks++
    if (input.username === 'browser-rate') {
      await reply(route, 429, 'RATE_LIMITED')
      return
    }
    const account = accounts.get(input.username)
    if (!account || input.password !== account.password) {
      await reply(route, 401, 'LOGIN_FAILED')
      return
    }
    activeUsername = input.username
    cookieId = randomUUID()
    csrfToken = null
    await reply(route, 200, 'OK', currentUser(), { 'Set-Cookie': setCookie(cookieId) })
    return
  }
  if (!activeUsername) {
    await reply(route, 401, 'UNAUTHENTICATED')
    return
  }
  if (path === '/auth/me') {
    await reply(route, 200, 'OK', currentUser())
    return
  }
  if (path === '/auth/menus') {
    const account = accounts.get(activeUsername)
    await reply(
      route,
      account.first ? 403 : 200,
      account.first ? 'PASSWORD_CHANGE_REQUIRED' : 'OK',
      account.granted ? menus() : [],
    )
    return
  }
  if (path === '/auth/password') {
    const input = request.postDataJSON()
    const account = accounts.get(activeUsername)
    if (input.currentPassword !== account.password) {
      await reply(route, 400, 'PASSWORD_CHANGE_FAILED')
      return
    }
    assert.ok([...input.newPassword].length >= 12 && [...input.newPassword].length <= 128)
    assert.notEqual(input.newPassword, account.password)
    account.password = input.newPassword
    account.first = false
    activeUsername = null
    csrfToken = null
    cookieId = null
    await reply(route, 200, 'OK', null, { 'Set-Cookie': setCookie('', true) })
    return
  }
  if (path === '/auth/logout') {
    activeUsername = null
    csrfToken = null
    cookieId = null
    await reply(route, 200, 'OK', null, { 'Set-Cookie': setCookie('', true) })
    return
  }
  await reply(route, 404, 'NOT_FOUND')
})

async function check(name, action) {
  await action()
  results.push(name)
  console.log(`PASS ${name}`)
}
async function submitLogin(username, password) {
  await page.locator('#username').fill(username)
  await page.locator('#password').fill(password)
  await page.locator('#captcha-code').fill(captchaAnswer)
  await page.getByRole('button', { name: '登录', exact: true }).click()
}
async function expectRoute(path) {
  await page.waitForURL((url) => url.pathname === path)
}
async function expectVisible(text) {
  await page.getByText(text, { exact: true }).first().waitFor({ state: 'visible' })
}
async function screenshot(name) {
  if (screenshotDirectory)
    await page.screenshot({
      path: resolve(screenshotDirectory, name),
      fullPage: true,
      animations: 'disabled',
    })
}
async function logoutFromLayout() {
  await page.locator('.user-button').click()
  await page.getByRole('menuitem', { name: '退出登录' }).click()
  await expectRoute('/login')
}
function count(path) {
  return calls.filter((call) => call.path === path).length
}

try {
  await check('anonymous protected path redirects to login', async () => {
    await page.goto(`${origin}/home`)
    await expectRoute('/login')
    assert.equal(new URL(page.url()).searchParams.get('returnTo'), '/home')
    await page.getByRole('tab', { name: '采购方登录', exact: true }).waitFor({ state: 'visible' })
    await screenshot('browser-login.png')
  })
  await check('empty input validates before login request', async () => {
    const before = count('/auth/login')
    await page.getByRole('button', { name: '登录', exact: true }).click()
    await expectVisible('请输入账号和密码')
    assert.equal(count('/auth/login'), before)
    assert.equal(await page.locator('#username').getAttribute('maxlength'), '128')
    assert.equal(await page.locator('#password').getAttribute('maxlength'), '256')
  })
  await check('login portal tabs support keyboard navigation and clear credentials', async () => {
    const buyer = page.getByRole('tab', { name: '采购方登录', exact: true })
    const supplier = page.getByRole('tab', { name: '供应商登录', exact: true })
    assert.equal(await buyer.getAttribute('aria-selected'), 'true')
    await page.locator('#username').fill('synthetic-not-submitted')
    await page.locator('#password').fill('synthetic-not-submitted-password')
    await buyer.focus()
    await page.keyboard.press('ArrowLeft')
    assert.equal(await supplier.getAttribute('aria-selected'), 'true')
    assert.equal(await page.locator('#username').inputValue(), '')
    assert.equal(await page.locator('#password').inputValue(), '')
    await page.keyboard.press('End')
    assert.equal(await buyer.getAttribute('aria-selected'), 'true')
    await page.setViewportSize({ width: 1920, height: 919 })
    const photo = await page.locator('.corporate-login-photo').boundingBox()
    const card = await page.locator('.corporate-login-card').boundingBox()
    assert.equal(Math.round(photo.width), 500)
    assert.equal(Math.round(photo.height), 340)
    assert.equal(Math.round(card.width), 304)
    assert.equal(Math.round(photo.y), Math.round(card.y))
    for (const selector of ['.corporate-login-banner', '.corporate-login-photo img']) {
      if (await page.locator(selector).count()) {
        await page.locator(selector).evaluate(async (image) => {
          await image.decode()
          if (image.naturalWidth <= 0 || image.naturalHeight <= 0)
            throw new Error('Login image failed to load')
        })
      }
    }
    await screenshot('browser-login-reference-desktop.png')
    await page.setViewportSize({ width: 390, height: 844 })
    await page.waitForFunction(() => document.documentElement.scrollWidth <= window.innerWidth)
    await page.getByRole('button', { name: '登录', exact: true }).scrollIntoViewIfNeeded()
    await screenshot('browser-login-mobile.png')
    await page.setViewportSize({ width: 1440, height: 1050 })
  })
  await check(
    'captcha validates, refreshes after failure, and recovers from expiry and outage',
    async () => {
      await page.locator('#username').fill('browser-member')
      await page.locator('#password').fill('synthetic-user-password')
      const beforeLogin = count('/auth/login')
      await page.getByRole('button', { name: '登录', exact: true }).click()
      await expectVisible('请输入四位数字验证码')
      assert.equal(count('/auth/login'), beforeLogin)
      const previousId = activeCaptcha.id
      const beforeCredentials = credentialChecks
      await page.locator('#captcha-code').fill('0000')
      await page.getByRole('button', { name: '登录', exact: true }).click()
      await expectVisible('验证码错误或已失效，请重新输入')
      await page.waitForFunction(() => !document.querySelector('#captcha-code').disabled)
      assert.equal(credentialChecks, beforeCredentials)
      assert.notEqual(activeCaptcha.id, previousId)
      assert.equal(await page.locator('#captcha-code').inputValue(), '')
      assert.equal(await page.locator('#password').inputValue(), '')
      captchaLifetime = 1
      await page.getByRole('button', { name: '刷新验证码' }).click()
      await expectVisible('验证码已过期，请点击图片刷新')
      assert.equal(await page.getByRole('button', { name: '登录', exact: true }).isDisabled(), true)
      captchaLifetime = 120
      failNextCaptcha = true
      await page.getByRole('button', { name: '刷新验证码' }).click()
      await page.getByRole('button', { name: '刷新验证码' }).waitFor({ state: 'visible' })
      await page.waitForFunction(() =>
        document
          .querySelector('.corporate-login-captcha-refresh')
          ?.textContent.includes('点击刷新'),
      )
      assert.equal(await page.getByRole('button', { name: '登录', exact: true }).isDisabled(), true)
      await page.getByRole('button', { name: '刷新验证码' }).click()
      await page.locator('#captcha-code').fill(captchaAnswer)
      await page.getByRole('tab', { name: '供应商登录', exact: true }).click()
      assert.equal(await page.locator('#captcha-code').inputValue(), '')
      await page.getByRole('tab', { name: '采购方登录', exact: true }).click()
    },
  )
  await check(
    'wrong portal rejects the authenticated identity and clears the session',
    async () => {
      await page.getByRole('tab', { name: '供应商登录', exact: true }).click()
      await submitLogin('browser-member', 'synthetic-user-password')
      await expectVisible('当前账号为采购方账号，请切换到采购方登录')
      assert.equal(new URL(page.url()).pathname, '/login')
      assert.equal(activeUsername, null)
      assert.equal(await page.locator('.app-shell').count(), 0)
      assert.equal(await page.locator('#password').inputValue(), '')
      await page.getByRole('tab', { name: '采购方登录', exact: true }).click()
      assert.equal(await page.locator('#username').inputValue(), '')
    },
  )
  await check('wrong credentials and rate limit show safe messages', async () => {
    await submitLogin('browser-unknown', 'synthetic-wrong-password')
    await expectVisible('账号或密码错误，或账号暂不可用')
    assert.equal(await page.locator('#password').inputValue(), '')
    await submitLogin('browser-rate', 'synthetic-wrong-password')
    await expectVisible('请求过于频繁，请稍后重试')
  })
  await check('first login loads no ordinary menus and survives refresh', async () => {
    const beforeMenus = count('/auth/menus')
    await submitLogin('browser-first', 'synthetic-initial-password')
    await expectRoute('/password')
    await expectVisible('先为账户设置新密码')
    assert.equal(count('/auth/menus'), beforeMenus)
    await page.goto(`${origin}/home`)
    await expectRoute('/password')
    assert.equal(count('/auth/menus'), beforeMenus)
    await screenshot('browser-first-password.png')
  })
  const changedPassword = '🔐'.repeat(100)
  await check('first password validates Unicode and requires re-login', async () => {
    await page.getByRole('button', { name: '保存新密码' }).click()
    await expectVisible('请输入当前密码')
    await page.locator('#current-password').fill('synthetic-initial-password')
    await page.locator('#new-password').fill('short')
    await page.getByRole('button', { name: '保存新密码' }).click()
    await expectVisible('新密码长度应为 12 至 128 个字符')
    await page.locator('#new-password').fill(changedPassword)
    await page.locator('#confirm-password').fill('different-synthetic-password')
    await page.getByRole('button', { name: '保存新密码' }).click()
    await expectVisible('两次输入的新密码不一致')
    assert.equal(await page.locator('#new-password').getAttribute('maxlength'), '256')
    await page.locator('#confirm-password').fill(changedPassword)
    await page.getByRole('button', { name: '保存新密码' }).click()
    await expectRoute('/login')
    await submitLogin('browser-first', 'synthetic-initial-password')
    await expectVisible('账号或密码错误，或账号暂不可用')
    await submitLogin('browser-first', changedPassword)
    await expectRoute('/home')
    await expectVisible('平台工作台')
    await expectVisible('合成首次账户，工作空间已就绪。')
  })
  await check('authorized menu, layout, tabs, and refreshed dynamic route work', async () => {
    await page
      .locator('.side-menu')
      .getByText('框架说明', { exact: true })
      .waitFor({ state: 'visible' })
    assert.equal(await page.locator('.page-tabs .page-tab').count(), 1)
    await page.getByRole('button', { name: '折叠菜单' }).click()
    await page.getByRole('button', { name: '展开菜单' }).waitFor({ state: 'visible' })
    const beforeMe = count('/auth/me')
    const beforeMenus = count('/auth/menus')
    await page.reload()
    await expectRoute('/home')
    await expectVisible('平台工作台')
    assert.ok(count('/auth/me') > beforeMe)
    assert.ok(count('/auth/menus') > beforeMenus)
    await page.getByRole('button', { name: '展开菜单' }).click()
    await screenshot('browser-home-desktop.png')
    await page.setViewportSize({ width: 390, height: 844 })
    await page.waitForFunction(() => document.documentElement.scrollWidth <= window.innerWidth)
    await screenshot('browser-home-mobile.png')
    await page.setViewportSize({ width: 1440, height: 1050 })
  })
  await check('unknown path renders 404', async () => {
    await page.goto(`${origin}/not-a-registered-page`)
    await expectVisible('没有找到这个页面')
    assert.equal(await page.locator('.status-number').innerText(), '404')
  })
  await check('logout clears authorized navigation and stores no credentials', async () => {
    await page.goto(`${origin}/home`)
    await expectVisible('平台工作台')
    const beforeCsrf = count('/security/csrf')
    await logoutFromLayout()
    assert.ok(count('/security/csrf') > beforeCsrf)
    assert.equal(await page.locator('.page-tabs').count(), 0)
    const storage = await page.evaluate(() => ({
      local: Object.keys(localStorage),
      session: Object.keys(sessionStorage),
      cookieReadable: document.cookie.includes('BIDSMARTSESSION'),
    }))
    assert.ok(storage.local.every((key) => key === 'platform-ui-collapsed'))
    assert.deepEqual(storage.session, [])
    assert.equal(storage.cookieReadable, false)
    await page.goto(`${origin}/home`)
    await expectRoute('/login')
  })
  await check('different account receives 403 and can logout without old routes', async () => {
    await submitLogin('browser-denied', 'synthetic-denied-password')
    await expectRoute('/403')
    await expectVisible('暂时无法访问此页面')
    assert.equal(await page.locator('.app-shell').count(), 0)
    await page.goto(`${origin}/home`)
    await expectRoute('/403')
    await page.getByRole('button', { name: '退出登录' }).click()
    await expectRoute('/login')
  })
  await check('external login return is rejected and identity cache is replaced', async () => {
    await page.goto(
      `${origin}/login?returnTo=${encodeURIComponent('https://example.invalid/escape')}`,
    )
    await submitLogin('browser-member', 'synthetic-user-password')
    await expectRoute('/home')
    await expectVisible('合成普通账户，工作空间已就绪。')
    assert.equal(await page.getByText('合成首次账户', { exact: true }).count(), 0)
    assert.equal(new URL(page.url()).origin, origin)
    assert.deepEqual(externalRequests, [])
    await logoutFromLayout()
  })
  await check('supplier portal logs in with server identity and logs out normally', async () => {
    await page.getByRole('tab', { name: '供应商登录', exact: true }).click()
    await submitLogin('browser-supplier', 'synthetic-supplier-password')
    await expectRoute('/home')
    await expectVisible('合成供应商账户，工作空间已就绪。')
    await expectVisible('供应商企业')
    await logoutFromLayout()
    assert.equal(
      await page
        .getByRole('tab', { name: '采购方登录', exact: true })
        .getAttribute('aria-selected'),
      'true',
    )
  })
  assert.deepEqual(pageErrors, [], 'No unhandled browser exceptions')
  assert.deepEqual(consoleErrors, [], 'No unexpected browser console errors')
  console.log(
    JSON.stringify({
      mode: 'synthetic-api-mocks-only',
      browser: await browser.version(),
      checks: results.length,
      apiRequests: calls.length,
      result: 'PASS',
    }),
  )
} catch (error) {
  await screenshot('browser-failure.png')
  throw error
} finally {
  await browser.close()
}
