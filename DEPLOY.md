# 工时管理系统 - 部署指南

## 架构概览

```
用户浏览器 → Oceanus 网关 → Nest/HULK 容器 → Supabase (内网)
                                    ↓
                          美团 SSO (ssosv.it.test.sankuai.com)
```

## 方案一：Nest Serverless 部署（推荐）

> 适合后台管理类服务，运维成本低，秒级弹性伸缩，稳定性 99.995%

### 前置条件

1. 在 [Avatar](https://avatar.mws.sankuai.com/#/service/mine) 申请 AppKey（如 `com.sankuai.worktime.web`）
2. 将代码推送到公司 Git 仓库（dev.sankuai.com）
3. 确保 `nest.yml` 中的 appKey 与申请的一致

### 操作步骤

#### 1. 在 Nest 平台创建服务

- 访问 [Nest Serverless 平台](https://nest.sankuai.com)
- 点击「新建服务」
- 选择已有 AppKey 或新建
- 填写 Git 仓库地址
- 描述文件路径填写：`deploy/manifest.yaml`

#### 2. 新建函数

- 进入服务详情 → 函数 tab → 新建函数
- 函数名称：`main`
- 函数类型：`WEB`
- 编程语言：`Node.js`
- 场景选择：`Next.js`

#### 3. 配置环境变量

在 Nest 平台的「配置」页面添加以下环境变量：

| 变量名 | 值 | 说明 |
|--------|-----|------|
| NODE_ENV | production | 生产环境 |
| NEXT_PUBLIC_SUPABASE_URL | https://dbdc3dyni0vleropcc.database.sankuai.com | Supabase 地址 |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | (见 .env.production) | 匿名 Key |
| SUPABASE_SERVICE_ROLE_KEY | (见 .env.production) | 服务端 Key |
| SUPABASE_JWT_SECRET | (见 .env.production) | JWT 密钥 |
| MEITUAN_SSO_CLIENT_ID | b1ca76fb8f | SSO 客户端 ID |
| MEITUAN_SSO_SECRET | (见 .env.production) | SSO 密钥 |

#### 4. 配置资源

- 最小副本数：2（保证高可用）
- 最大副本数：5（应对 100+ 用户并发）
- 内存限制：512MB
- CPU 核心数：1

#### 5. 构建部署

- 在 Nest 平台点击「部署」
- 选择环境（test → ppe → prod）
- 等待构建完成（约 2-3 分钟）

#### 6. 配置域名（Oceanus）

- 访问 [Oceanus](https://oceanus.sankuai.com)
- 申请域名（如 `worktime.sankuai.com`）
- 配置上游为 Nest 服务的 AppKey
- 设置健康检查路径：`/api/health`

---

## 方案二：HULK 容器部署

> 适合需要稳定低延迟、有状态服务的场景

### 前置条件

1. 在 Avatar 申请 AppKey
2. 代码推送到公司 Git 仓库
3. 确保 `deploy/manifest.yaml` 配置正确

### 操作步骤

#### 1. 在 Avatar 创建服务

- 访问 [Avatar](https://avatar.mws.sankuai.com)
- 服务类型选择「容器服务」
- 语言/组件选择「Node.js」

#### 2. 在 Plus 创建发布项

- 访问 [Plus](https://plus.sankuai.com)
- 新建发布项，绑定 AppKey
- 配置 Git 仓库地址
- 描述文件：`deploy/manifest.yaml`

#### 3. 构建部署

- 在 Plus 触发构建
- 构建成功后自动推送镜像到 Pier
- 在 HULK 平台部署容器

#### 4. 容器配置

- 实例数：2-5
- 单实例内存：1GB
- CPU：1核
- 端口：8080
- 健康检查：GET /api/health

#### 5. 配置 Oceanus 域名

同方案一的步骤 6。

---

## 方案三：Docker 自定义部署

如果以上平台不可用，可使用 Dockerfile 手动构建：

```bash
# 构建镜像
docker build -t worktime:latest .

# 运行容器
docker run -d \
  --name worktime \
  -p 8080:8080 \
  --env-file .env.production \
  worktime:latest
```

---

## SSO 回调地址配置

部署完成后，需要在 Supabase 的 `auth.meituan_config` 表中更新回调地址：

```sql
UPDATE auth.meituan_config 
SET redirect_uri = 'https://你的域名.sankuai.com/api/auth/callback'
WHERE client_id = 'b1ca76fb8f';
```

同时确保 Supabase Dashboard 中的 Site URL 配置为生产域名。

---

## 监控与日志

### Nest 模式
- 日志：Nest 平台 → 函数详情 → 日志
- 监控：Nest 平台 → 函数详情 → 监控
- 登录节点：状态 → 查看 → 登录节点

### HULK 模式
- 日志路径：`/opt/logs/{appkey}/`
- 启动日志：`/data/applogs/hulk_start_log.*`
- Cat 监控：配置 AppKey 后自动接入

---

## 常见问题

### Q: 构建失败提示找不到 nest-test 模板？
A: 在 Plus 中手动创建名为 `nest-{env}` 的构建和部署模板。

### Q: 启动后访问 502？
A: 检查端口是否为 8080，检查健康检查接口是否正常返回。

### Q: SSO 登录后跳转失败？
A: 确认回调地址已更新为生产域名，且 Oceanus 上配置了对应路由。

### Q: 内网 Supabase 连接超时？
A: 确认容器网络可以访问 `dbdc3dyni0vleropcc.database.sankuai.com`，必要时联系网络团队开通白名单。
