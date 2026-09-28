import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Copy, Check, Plug, PlugZap } from 'lucide-react'
import { cn } from '@/lib/utils'
import { trackFeatureDiscovery } from '../../lib/analytics'

interface McpStatus {
  enabled: boolean
  connected: boolean
  token?: string
  serverUrl?: string
}

export function McpPage() {
  const navigate = useNavigate()
  const [mcpStatus, setMcpStatus] = useState<McpStatus>({ enabled: false, connected: false })
  const [loading, setLoading] = useState(false)
  const [serverUrlInput, setServerUrlInput] = useState('')
  const [copied, setCopied] = useState(false)
  const serverUrlTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const refreshStatus = () => {
    chrome.runtime.sendMessage({ type: 'MCP_STATUS' }, (response) => {
      if (response && !response.error) {
        setMcpStatus({
          enabled: response.enabled ?? false,
          connected: response.connected ?? false,
          token: response.token,
          serverUrl: response.serverUrl,
        })
        setServerUrlInput(response.serverUrl || '')
      }
    })
  }

  useEffect(() => {
    refreshStatus()
  }, [])

  // 开启后轮询连接状态，并通知 background 加速重连
  useEffect(() => {
    if (!mcpStatus.enabled) return

    chrome.runtime.sendMessage({ type: 'MCP_WATCH_START' })
    const interval = setInterval(() => {
      chrome.runtime.sendMessage({ type: 'MCP_STATUS' }, (response) => {
        if (response && !response.error) {
          setMcpStatus((prev) => ({ ...prev, connected: response.connected ?? false }))
        }
      })
    }, 2000)

    return () => {
      clearInterval(interval)
      chrome.runtime.sendMessage({ type: 'MCP_WATCH_STOP' })
    }
  }, [mcpStatus.enabled])

  const toggleMcp = () => {
    setLoading(true)
    const action = mcpStatus.enabled ? 'MCP_DISABLE' : 'MCP_ENABLE'
    if (!mcpStatus.enabled) {
      trackFeatureDiscovery('mcp', 'mcp_page').catch(() => {})
    }
    chrome.runtime.sendMessage({ type: action }, (response) => {
      setLoading(false)
      if (response?.success) {
        setMcpStatus((prev) => ({
          ...prev,
          enabled: !prev.enabled,
          connected: false,
          token: response.token,
        }))
      }
    })
  }

  const handleServerUrlChange = (value: string) => {
    setServerUrlInput(value)
    if (serverUrlTimer.current) clearTimeout(serverUrlTimer.current)
    serverUrlTimer.current = setTimeout(() => {
      chrome.runtime.sendMessage({
        type: 'MCP_SET_SERVER_URL',
        payload: { url: value.trim() },
      })
      setMcpStatus((prev) => ({ ...prev, serverUrl: value.trim() }))
    }, 800)
  }

  const copyToken = async () => {
    if (!mcpStatus.token) return
    await navigator.clipboard.writeText(mcpStatus.token)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="flex flex-col h-[500px]">
      <header className="flex-shrink-0 flex items-center gap-2 px-4 py-3 border-b">
        <button
          onClick={() => navigate(-1)}
          className="p-1.5 rounded-lg hover:bg-muted transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h1 className="font-semibold">MCP</h1>
        {mcpStatus.enabled && (
          <span
            className={cn(
              'ml-auto text-[10px] px-1.5 py-0.5 rounded-full',
              mcpStatus.connected
                ? 'bg-green-100 text-green-700'
                : 'bg-yellow-100 text-yellow-700'
            )}
          >
            {mcpStatus.connected ? '已连接' : '等待连接'}
          </span>
        )}
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
          <div className="flex items-center gap-2">
            {mcpStatus.connected ? (
              <PlugZap className="w-5 h-5 text-green-500" />
            ) : (
              <Plug className="w-5 h-5 text-muted-foreground" />
            )}
            <div>
              <p className="text-sm font-medium">CLI / MCP 连接</p>
              <p className="text-xs text-muted-foreground">
                {mcpStatus.enabled
                  ? mcpStatus.connected
                    ? '桥接已通，可自动发草稿'
                    : '已开启，等 MCP Server / CLI 连上来'
                  : '关闭中 — 打开后才能自动发文'}
              </p>
            </div>
          </div>
          <button
            onClick={toggleMcp}
            disabled={loading}
            type="button"
            role="switch"
            aria-checked={mcpStatus.enabled}
            className={cn(
              'relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors',
              mcpStatus.enabled ? 'bg-primary' : 'bg-muted-foreground/30',
              loading && 'opacity-50'
            )}
          >
            <span
              className={cn(
                'pointer-events-none block h-4 w-4 rounded-full bg-white shadow transition-transform',
                mcpStatus.enabled ? 'translate-x-6' : 'translate-x-1'
              )}
            />
          </button>
        </div>

        {mcpStatus.enabled && (
          <>
            {mcpStatus.token && (
              <div className="p-3 bg-muted/50 rounded-lg space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">Token（须与 MCP_TOKEN 一致）</p>
                  <button
                    onClick={copyToken}
                    className="flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    {copied ? '已复制' : '复制'}
                  </button>
                </div>
                <code className="block bg-background p-2 rounded break-all select-all text-xs font-mono">
                  {mcpStatus.token}
                </code>
              </div>
            )}

            <div className="p-3 bg-muted/50 rounded-lg space-y-2">
              <p className="text-xs text-muted-foreground">服务器地址（本机默认留空）</p>
              <input
                type="text"
                value={serverUrlInput}
                onChange={(e) => handleServerUrlChange(e.target.value)}
                placeholder="ws://localhost:9527"
                className="w-full bg-background p-2 rounded border border-border text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </>
        )}

        <div className="rounded-lg border p-3 space-y-2 text-xs text-muted-foreground leading-relaxed">
          <p className="text-sm font-medium text-foreground">怎么测自动发文</p>
          <ol className="list-decimal pl-4 space-y-1">
            <li>上面打开 MCP 开关，复制 Token</li>
            <li>
              本机跑 MCP Server（见仓库 <code className="text-[10px]">_doc/03_MCP测试.md</code>）
            </li>
            <li>本页显示「已连接」后再用 CLI / Cursor 调同步</li>
            <li>目标站草稿箱核对标题与正文</li>
          </ol>
        </div>
      </div>
    </div>
  )
}
