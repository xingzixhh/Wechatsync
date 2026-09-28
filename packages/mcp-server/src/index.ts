/**
 * Sync Assistant MCP Server
 *
 * 支持两种模式：
 * 1. stdio 模式（推荐）: claude mcp add sync-assistant node dist/index.js
 * 2. SSE 模式: 先启动服务，再 claude mcp add --transport sse sync-assistant http://localhost:9528/sse
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import express, { type Request, type Response } from 'express'
import fs from 'fs'
import path from 'path'
import { ExtensionBridge } from './ws-bridge.js'
import { parseMarkdownFile } from './local-images.js'
import type { PlatformInfo, SyncResult } from './types.js'

const WS_PORT = parseInt(process.env.SYNC_WS_PORT || '9527', 10)
const HTTP_PORT = parseInt(process.env.SYNC_HTTP_PORT || '9528', 10)

// 检查是否是 SSE 模式
const isSSEMode = process.argv.includes('--sse')

// Extension WebSocket 桥接
const bridge = new ExtensionBridge(WS_PORT)

/**
 * 创建 MCP Server
 */
function createServer(): Server {
  const server = new Server(
    {
      name: 'sync-assistant',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  )

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: 'list_platforms',
          description: '列出所有支持的平台及其登录状态',
          inputSchema: {
            type: 'object',
            properties: {
              forceRefresh: {
                type: 'boolean',
                description: '是否强制刷新登录状态（默认使用缓存）',
              },
            },
          },
        },
        {
          name: 'check_auth',
          description: '检查指定平台的登录状态',
          inputSchema: {
            type: 'object',
            properties: {
              platform: {
                type: 'string',
                description: '平台 ID，如 zhihu, juejin, toutiao 等',
              },
            },
            required: ['platform'],
          },
        },
        {
          name: 'sync_article',
          description:
            '同步文章到指定平台（保存为草稿）。有本地图片时优先用 sync_markdown_file（传 md 文件路径，自动把 images/xxx.jpg 转成 data URI）。若直接传 markdown 字符串，本地相对路径图片不会上传，必须已是 https 或 data URI。',
          inputSchema: {
            type: 'object',
            properties: {
              platforms: {
                type: 'array',
                items: { type: 'string' },
                description: '目标平台 ID 列表，如 ["zhihu", "juejin"]',
              },
              title: {
                type: 'string',
                description: '文章标题（纯文本，不含 # 号）',
              },
              markdown: {
                type: 'string',
                description:
                  '文章正文（Markdown）。不要带标题行；图片须为 https 或 data:image/...;base64,...，禁止残留 images/xxx.jpg',
              },
              content: {
                type: 'string',
                description: '文章正文（HTML，可选）。有 markdown 时可忽略。',
              },
              cover: {
                type: 'string',
                description: '封面图 URL 或 base64 data URI（可选）',
              },
            },
            required: ['platforms', 'title', 'markdown'],
          },
        },
        {
          name: 'sync_markdown_file',
          description:
            '【推荐·带图外发】读取本地 Markdown 文件，自动把相对路径图片（如 images/fengmian03.jpg）转成 data URI，再同步到各站草稿；各站适配器会把图传到本站图床。不要再手抄到博客园再一个个点同步。',
          inputSchema: {
            type: 'object',
            properties: {
              filePath: {
                type: 'string',
                description: '本地 .md 绝对路径（同目录或相对路径下要有 images/）',
              },
              platforms: {
                type: 'array',
                items: { type: 'string' },
                description: '目标平台，如 ["cnblogs","zhihu","juejin","bilibili","baijiahao","csdn","sohu","weixin","51cto"]',
              },
              title: {
                type: 'string',
                description: '可选；不传则从 # 标题或 front matter 取',
              },
            },
            required: ['filePath', 'platforms'],
          },
        },
        {
          name: 'extract_article',
          description: '从当前浏览器页面提取文章内容',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'upload_image_file',
          description: '从本地文件路径上传图片到图床平台，返回可公开访问的 URL。推荐使用此方法，无需手动转换 base64。',
          inputSchema: {
            type: 'object',
            properties: {
              filePath: {
                type: 'string',
                description: '本地图片文件的绝对路径，如 /Users/xxx/image.png',
              },
              platform: {
                type: 'string',
                description: '上传到哪个平台作为图床，默认 weibo。可选: weibo, zhihu, juejin, jianshu, woshipm',
              },
            },
            required: ['filePath'],
          },
        },
      ],
    }
  })

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params

    try {
      // 检查 Extension 是否连接
      if (!bridge.isConnected()) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: 'Chrome Extension 未连接。请确保：\n1. 已安装同步助手扩展\n2. 扩展已启用 MCP 连接（点击设置图标开启）',
              }),
            },
          ],
          isError: true,
        }
      }

      let result: unknown

      switch (name) {
        case 'list_platforms':
          result = await bridge.request<PlatformInfo[]>('listPlatforms', {
            forceRefresh: (args as { forceRefresh?: boolean })?.forceRefresh,
          })
          break

        case 'check_auth':
          result = await bridge.request<PlatformInfo>('checkAuth', {
            platform: (args as { platform: string }).platform,
          })
          break

        case 'sync_article':
          result = await bridge.request<SyncResult[]>('syncArticle', {
            platforms: (args as { platforms: string[] }).platforms,
            article: {
              title: (args as { title: string }).title,
              content: (args as { content: string }).content,
              markdown: (args as { markdown?: string }).markdown,
              cover: (args as { cover?: string }).cover,
            },
          })
          break

        case 'sync_markdown_file': {
          const filePath = (args as { filePath: string }).filePath
          const platforms = (args as { platforms: string[] }).platforms
          const overrideTitle = (args as { title?: string }).title
          const parsed = parseMarkdownFile(filePath)
          const title = overrideTitle || parsed.title
          const syncResults = await bridge.request<SyncResult[]>('syncArticle', {
            platforms,
            article: {
              title,
              markdown: parsed.markdown,
              content: parsed.markdown,
            },
          })
          result = {
            title,
            imagesConverted: parsed.convertedCount,
            imagesFailed: parsed.failed,
            results: syncResults,
          }
          break
        }

        case 'extract_article':
          result = await bridge.request('extractArticle')
          break

        case 'upload_image_file': {
          // 从文件路径读取图片并上传
          const filePath = (args as { filePath: string }).filePath
          const platform = (args as { platform?: string }).platform || 'weibo'

          // 检查文件是否存在
          if (!fs.existsSync(filePath)) {
            throw new Error(`File not found: ${filePath}`)
          }

          // 读取文件并转为 base64
          const fileBuffer = fs.readFileSync(filePath)
          const imageData = fileBuffer.toString('base64')

          // 根据扩展名确定 MIME 类型
          const ext = path.extname(filePath).toLowerCase()
          const mimeTypes: Record<string, string> = {
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.gif': 'image/gif',
            '.webp': 'image/webp',
            '.svg': 'image/svg+xml',
          }
          const mimeType = mimeTypes[ext] || 'image/png'

          // 使用分片上传
          result = await bridge.uploadImageChunked(imageData, mimeType, platform)
          break
        }

        default:
          return {
            content: [{ type: 'text', text: `Unknown tool: ${name}` }],
            isError: true,
          }
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      }
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ error: (error as Error).message }),
          },
        ],
        isError: true,
      }
    }
  })

  return server
}

/**
 * stdio 模式启动
 */
async function startStdioMode() {
  // 启动 WebSocket 服务器（Extension 连接）
  await bridge.start()

  const server = createServer()
  const transport = new StdioServerTransport()

  await server.connect(transport)

  // 日志输出到 stderr（不影响 stdio 通信）
  console.error('[MCP] Sync Assistant started (stdio mode)')
  console.error(`[MCP] Extension WebSocket: ws://localhost:${WS_PORT}`)
}

/**
 * SSE 模式启动
 */
async function startSSEMode() {
  // 启动 WebSocket 服务器（Extension 连接）
  await bridge.start()

  const server = createServer()
  const app = express()
  let transport: SSEServerTransport | null = null

  // SSE 端点
  app.get('/sse', async (req: Request, res: Response) => {
    console.error('[MCP] New SSE connection from Claude Code')
    transport = new SSEServerTransport('/message', res)

    res.on('close', () => {
      console.error('[MCP] SSE connection closed')
      transport = null
    })

    await server.connect(transport)
  })

  // 消息端点
  app.post('/message', express.json(), async (req: Request, res: Response) => {
    if (transport) {
      await transport.handlePostMessage(req, res)
    } else {
      res.status(400).json({ error: 'No active SSE connection' })
    }
  })

  // 健康检查
  app.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      extensionConnected: bridge.isConnected(),
    })
  })

  app.get('/', (_req: Request, res: Response) => {
    res.json({
      name: 'Sync Assistant MCP Server',
      version: '1.0.0',
      extensionConnected: bridge.isConnected(),
    })
  })

  app.listen(HTTP_PORT, () => {
    console.error('[MCP] Sync Assistant started (SSE mode)')
    console.error(`[MCP] HTTP Server: http://localhost:${HTTP_PORT}`)
    console.error(`[MCP] Claude Code: http://localhost:${HTTP_PORT}/sse`)
    console.error(`[MCP] Extension WebSocket: ws://localhost:${WS_PORT}`)
  })
}

// 启动
if (isSSEMode) {
  startSSEMode().catch((error) => {
    console.error('[MCP] Failed to start:', error)
    process.exit(1)
  })
} else {
  startStdioMode().catch((error) => {
    console.error('[MCP] Failed to start:', error)
    process.exit(1)
  })
}

// 处理退出信号
process.on('SIGINT', () => {
  console.error('[MCP] Shutting down...')
  process.exit(0)
})

process.on('SIGTERM', () => {
  console.error('[MCP] Shutting down...')
  process.exit(0)
})
