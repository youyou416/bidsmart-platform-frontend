# platform-base 前端工程

Vue 3、TypeScript、Vite、Vue Router、Pinia 与 Element Plus 的独立基础框架。后端工程位于独立目录 `bidsmart-platform-backend`；两者可以分别构建、分开维护。本期提供登录、首次改密、授权菜单、工作台说明、403、404 及通用错误页，不包含采购、报价、竞价、审批等业务功能。

## 运行

工具链按用户后续明确要求固定为 **Node.js 20.19.5、npm 10.8.2**，替代生成文档原来的 Node.js 22 基线。`.nvmrc`、`package.json` 和严格引擎检查保持一致；所选 Vite 7.3.7 支持 Node.js 20.19 以上。不要使用其他 Node.js 版本的检查结果替代此版本验证。

```sh
nvm install
nvm use
npm ci
npm run dev
```

默认地址 `http://127.0.0.1:5173`，仅监听回环地址。Vite 将 `/api` 代理到 `http://127.0.0.1:8080`，保留来源头。先按后端说明准备数据库、外部配置和合成初始化账户，再启动后端与前端。浏览器无需数据库参数。停止使用 `Ctrl+C`。

没有可用的后端或初始化账户时，页面能够加载，但无法完成真实登录。不会启用模拟成功或内置账户作为替代。

## 配置与安全边界

`.env.example` 仅包含公开系统名称、固定相对 API 路径和页签开关。应用启动后优先读取 `GET /api/v1/app/public-config` 的公开名称、本站标志、合法主题色与页签设置。本地存储仅保存侧栏折叠偏好 `platform-ui-collapsed`。

会话凭据只由后端设置的 HttpOnly Cookie 管理。身份、权限、菜单、页签及 CSRF 令牌仅放在内存中；刷新时重新读取当前身份和菜单，退出与账户切换清理授权及动态路由。登录、退出和改密前提交 CSRF 请求头；成功后更新令牌。修改密码后重新登录。

菜单页面组件通过 `src/router/menu.ts` 的白名单及 `src/router/index.ts` 的代码映射登记；当前只有 `Home` 对应 `/home`。未开发组件、禁用资源、重复路径及循环菜单无法注册路由。隐藏菜单仍由权限控制访问。新增页面时必须同时开发组件、登记允许路径和后端明确授权，不能直接执行资源配置中的表达式或脚本。

前端权限只控制展示和路由提示；服务端承担每个接口的实时认证与授权。本站回跳地址必须匹配授权路径白名单。统一请求层处理超时、取消、重复提交、401、403、429 和服务故障；对失败的写操作不自动重放。

## 检查与构建

```sh
npm run typecheck
npm run lint
npm run format:check
npm test
npm run build
npm audit --omit=dev
npm audit
```

`npm run check` 连续执行类型、静态、格式、单元测试与构建检查。`npm run format` 仅用于开发格式化。单元测试使用合成账户和响应，覆盖组件白名单、禁用和隐藏、树循环、站外跳转拒绝、请求处理、CSRF、会话恢复、首次改密、账户切换及竞态保护，不代表实际数据库接入结果。

真实 Chromium 的合成接口冒烟检查见 `browser-tests/README.md`。准备独立浏览器辅助依赖并启动 Vite 后运行 `npm run test:browser`。该检查不连接后端或数据库，不替代实际认证、数据库接入与浏览器联调。

构建产物在 `dist`，默认不输出 source map。`npm run preview` 仅供本机检查构建结果，默认 `127.0.0.1:4173`。

## 受控部署

正式静态部署应由同域反向代理提供 HTTPS、CSP、禁止嵌入与内容类型防护，并代理 `/api` 至后端。参考 `deploy/nginx.example.conf`，填入操作方受控证书和静态目录路径后按实际部署审核。示例只监听回环地址，不会自动开放公网。Element Plus 动态样式需要受控 `style-src 'unsafe-inline'`；脚本策略不允许 `unsafe-eval`、远程 CDN 或任意外站。

本机开发 HMR 的 WebSocket 例外只出现在 Vite 开发头中。生产配置不复制该例外。HTTPS 示例表示普通 TLS 配置，不能据此宣称国密 TLS 或商用密码合规。

## 项目结构

| 目录                           | 用途                                 |
| ------------------------------ | ------------------------------------ |
| `src/api`                      | 统一请求、CSRF 与认证接口            |
| `src/config`                   | 安全的公开配置                       |
| `src/components`、`src/layout` | 公共组件与独立后台布局               |
| `src/router`、`src/stores`     | 菜单白名单、路由、内存会话与界面偏好 |
| `src/views`、`src/styles`      | 基础页面与本地样式                   |
| `src/types`、`src/utils`       | 接口类型、权限与时区工具             |
| `deploy`                       | 静态代理配置样例                     |

依赖使用确切版本及 `package-lock.json` 锁定；无若依源码、依赖、品牌资源或公共 CDN。依赖扫描和最终验证结果见交付报告，扫描结果受查询时间与漏洞库覆盖范围限制。
