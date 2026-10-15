# 浏览器冒烟检查

`smoke.mjs` 使用真实 Chromium 打开前端，但所有 `/api/v1/**` 均由浏览器测试拦截并返回合成响应。它不连接后端或数据库，也不证明真实的 Spring Security、Cookie、国密或 OceanBase 集成已经通过。合成账户与口令只属于测试夹具，不能用于实际部署。

先用 Node.js **20.19.5** 在前端根目录运行 `npm ci`，然后在一个终端执行 `npm run dev`。另一个终端准备本机 Chromium/Chrome 和 Playwright Core **1.57.0**。可以将浏览器辅助依赖安装到工程之外，不改动工程依赖锁：

```bash
npm install --prefix /tmp/bidsmart-browser-runner --ignore-scripts playwright-core@1.57.0
PLAYWRIGHT_MODULE=/tmp/bidsmart-browser-runner/node_modules/playwright-core/index.js \
BROWSER_EXECUTABLE=/usr/bin/chromium \
node browser-tests/smoke.mjs
```

`BROWSER_BASE_URL` 默认为 `http://127.0.0.1:5173`，仅接受回环目标。`BROWSER_EXECUTABLE` 可覆盖本机浏览器路径；`PLAYWRIGHT_MODULE` 可覆盖辅助模块路径。未指定辅助模块时尝试正常导入 `playwright-core`。可选 `BROWSER_SCREENSHOT_DIR` 将截图写到工程之外的本机目录；截图不是交付业务数据。

检查涵盖匿名跳转、空表单、错误口令提示、429 提示、首次改密限制及 Unicode 表单、重新登录、授权菜单及页签、直接刷新动态路由、404、无授权 403、退出与跨账户状态清理、站外回跳拒绝、浏览器无凭据持久化和运行时异常。真正的后端安全检查由后端测试负责；准备实际 OceanBase 和外部秘密后，还需完成数据库接入与真实浏览器联调清单。
