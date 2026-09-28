import { useState, useEffect } from 'react'
import { X, Plus, Trash2, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SettingsDrawerProps {
  open: boolean
  onClose: () => void
}

interface CMSAccount {
  id: string
  name: string
  type: string
  url: string
}

export function SettingsDrawer({ open, onClose }: SettingsDrawerProps) {
  const [cmsAccounts, setCmsAccounts] = useState<CMSAccount[]>([])
  const [floatingButtonEnabled, setFloatingButtonEnabled] = useState(false)

  useEffect(() => {
    if (!open) return

    chrome.storage.local.get('cmsAccounts', (result) => {
      setCmsAccounts(result.cmsAccounts || [])
    })

    chrome.storage.local.get('floatingButtonEnabled', (result) => {
      setFloatingButtonEnabled(result.floatingButtonEnabled ?? false)
    })
  }, [open])

  const toggleFloatingButton = () => {
    const next = !floatingButtonEnabled
    setFloatingButtonEnabled(next)
    chrome.storage.local.set({ floatingButtonEnabled: next })
  }

  const deleteCmsAccount = async (id: string) => {
    const storage = await chrome.storage.local.get('cmsAccounts')
    const accounts: CMSAccount[] = storage.cmsAccounts || []
    const updated = accounts.filter(a => a.id !== id)
    await chrome.storage.local.set({ cmsAccounts: updated })
    await chrome.storage.local.remove(`cms_pwd_${id}`)
    setCmsAccounts(updated)
  }

  if (!open) return null

  return (
    <>
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onClose}
      />

      <div className={cn(
        'fixed inset-y-0 right-0 w-80 bg-background z-50 shadow-xl',
        'transform transition-transform duration-200',
        open ? 'translate-x-0' : 'translate-x-full'
      )}>
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="font-semibold">设置</h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-muted"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-6 overflow-y-auto h-[calc(100%-57px)]">
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground">网页功能</h3>

            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <div>
                <p className="text-sm font-medium">悬浮同步按钮</p>
                <p className="text-xs text-muted-foreground">在网页右下角显示快捷同步按钮</p>
              </div>
              <button
                onClick={toggleFloatingButton}
                type="button"
                role="switch"
                aria-checked={floatingButtonEnabled}
                className={cn(
                  'relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors',
                  floatingButtonEnabled ? 'bg-primary' : 'bg-muted-foreground/30',
                )}
              >
                <span
                  className={cn(
                    'pointer-events-none block h-4 w-4 rounded-full bg-white shadow transition-transform',
                    floatingButtonEnabled ? 'translate-x-6' : 'translate-x-1'
                  )}
                />
              </button>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-muted-foreground">自建站点</h3>
              <button
                onClick={() => {
                  onClose()
                  window.location.hash = '/add-cms'
                }}
                className="flex items-center gap-1 text-xs text-primary hover:underline"
              >
                <Plus className="w-3 h-3" />
                添加
              </button>
            </div>

            {cmsAccounts.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">
                暂无自建站点
              </p>
            ) : (
              <div className="space-y-2">
                {cmsAccounts.map(account => (
                  <div
                    key={account.id}
                    className="flex items-center justify-between p-2 bg-muted/50 rounded-lg"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{account.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{account.url}</p>
                    </div>
                    <button
                      onClick={() => deleteCmsAccount(account.id)}
                      className="p-1 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-3">
            <button
              onClick={() => {
                onClose()
                window.location.hash = '/history'
              }}
              className="flex items-center justify-between w-full p-3 bg-muted/50 rounded-lg hover:bg-muted"
            >
              <span className="text-sm font-medium">查看全部历史</span>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
