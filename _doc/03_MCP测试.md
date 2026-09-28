# MCP 自动发文怎么测

> MCP 不是扩展自己发文，而是：**本机 MCP Server / CLI** 通过 WebSocket 连上扩展，再让扩展用你浏览器里已登录的账号，把文章写进各站**草稿箱**。

## 架构（人话）

```
Cursor / Claude / CLI
        ↓（MCP 或 CLI 命令）
MCP Server（本机 Node，默认 ws://localhost:9527）
        ↓ WebSocket + Token
Chrome 扩展「可见发文助手」（已开 MCP）
        ↓ 各站官方接口
知乎 / 掘金 / 头条… 草稿箱
```

## 一、扩展侧（先做）

1. 加载最新 `packages/extension/dist`
2. 点扩展图标 → 顶栏 **添加** 右边第二个 **MCP**
3. 打开「CLI / MCP 连接」开关
4. **复制 Token**
5. 服务器地址本机测可留空（默认 `ws://localhost:9527`）
6. 页面会显示「等待连接…」；等 Server 起来后应变为「已连接」

## 二、本机起 MCP Server

在仓库根目录：

```powershell
cd E:\00_code\99_self\Wechatsync
pnpm build:mcp
```

把扩展里复制的 Token 设进环境变量后启动（PowerShell）：

```powershell
$env:MCP_TOKEN = "这里粘贴扩展里的 Token"
pnpm mcp
```

保持这个窗口开着。再回到扩展 MCP 页，应显示 **已连接**。

## 三、最快验通路：用 CLI（可不装 Cursor MCP）

另开终端：

```powershell
cd E:\00_code\99_self\Wechatsync
pnpm build:cli
$env:WECHATSYNC_TOKEN = "同一个 Token"   # CLI 用这个变量名
node packages/cli/dist/index.js platforms --auth
```

准备 `test-article.md` 后同步到已登录平台（示例掘金）：

```powershell
node packages/cli/dist/index.js sync test-article.md -p juejin
```

然后去该站**草稿箱**核对。

## 四、用 Cursor / Claude 测 MCP（可选）

在 Cursor MCP 配置里加（路径按本机改）：

```json
{
  "mcpServers": {
    "kejian-fabwen": {
      "command": "node",
      "args": ["E:/00_code/99_self/Wechatsync/packages/mcp-server/dist/index.js"],
      "env": {
        "MCP_TOKEN": "与扩展里同一 Token"
      }
    }
  }
}
```

重启 Cursor MCP 后，对助手说：

> 用 list_platforms 看登录状态；再把某某 md 同步到掘金草稿

工具名常见：`list_platforms` / `check_auth` / `sync_article` / `extract_article`。

## 五、验收清单

- [ ] 扩展 MCP 页：开关开、有 Token
- [ ] `pnpm mcp` 在跑，扩展显示「已连接」
- [ ] 浏览器已登录目标站（网页端，不是 App）
- [ ] CLI 或 MCP 调同步成功
- [ ] 目标站草稿箱能看到标题 / 正文 / 图

## 六、常见坑

| 现象 | 处理 |
|------|------|
| 一直「等待连接」 | Server 没起、Token 不一致、端口不是 9527、防火墙拦了 |
| 平台未登录 | 在同一 Chrome 打开目标站网页登录后再查 |
| 同步失败 | 先 CLI 单平台试；看扩展是否被禁用、目标站是否改版 |
| 重装扩展 Token 变了 | 重新复制 Token，更新环境变量 / Cursor MCP 配置后重启 |
| **文字有了、图是 `images/xxx.jpg`** | 相对路径各站读不到。**不要**再手抄博客园上传。用下面「带图同步」 |

## 七、带图同步（自动化，推荐）

根因：`![说明](images/fengmian03.jpg)` 这种相对路径，目标站服务器上没有这个文件，所以图挂、字还在。

**正确做法**：同步前把本地图嵌进正文（data URI），各站适配器再传到**本站图床**。

### 方式 A · CLI（日常最快）

```powershell
cd E:\00_code\99_self\Wechatsync
pnpm build:cli
$env:WECHATSYNC_TOKEN = "扩展里同一 Token"
# 外发 md 与 images/ 同目录；默认自动转 data URI，不要再指望博客园当图床
node packages/cli/dist/index.js sync "外发稿\article.md" -p cnblogs,zhihu,juejin,bilibili,baijiahao,csdn,sohu,weixin,51cto
```

可选：`--image-host juejin` 先传到掘金当图床（一般不需要；默认 data URI 更稳）。

### 方式 B · MCP 工具 `sync_markdown_file`

对 Cursor 说：

> 用 sync_markdown_file，filePath 指向外发 article.md，platforms 填 9 站

不要用裸 `sync_article` 塞带 `images/xxx.jpg` 的字符串。

### 方式 C · 扩展 UI

打开已发布的**带图网页**（博客园 / 官网）再点同步——页面上的图已是 https，扩展能转存。纯本地 md 相对路径不行。

## 相关入口

- 扩展顶栏：**添加 → MCP → 历史 → 关于 → 设置**
- 上游 MCP 说明：`packages/mcp-server/README.md`
- 扩展加载：`packages/extension/dist`
