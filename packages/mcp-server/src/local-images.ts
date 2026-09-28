/**
 * 把 Markdown / HTML 里的本地相对路径图片转成 data URI
 * （相对路径 images/xxx.jpg 各站都读不到，必须先嵌进正文）
 */
import fs from 'node:fs'
import path from 'node:path'

const MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
}

function findLocalImageRefs(content: string): { full: string; imgPath: string }[] {
  const results: { full: string; imgPath: string }[] = []
  const seen = new Set<string>()

  const mdRe = /!\[([^\]]*)\]\(([^)]+)\)/g
  let m: RegExpExecArray | null
  while ((m = mdRe.exec(content)) !== null) {
    const imgPath = m[2].trim()
    if (imgPath.startsWith('http://') || imgPath.startsWith('https://') || imgPath.startsWith('data:')) {
      continue
    }
    if (!seen.has(imgPath)) {
      seen.add(imgPath)
      results.push({ full: m[0], imgPath })
    }
  }

  const htmlRe = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi
  while ((m = htmlRe.exec(content)) !== null) {
    const imgPath = m[1].trim()
    if (imgPath.startsWith('http://') || imgPath.startsWith('https://') || imgPath.startsWith('data:')) {
      continue
    }
    if (!seen.has(imgPath)) {
      seen.add(imgPath)
      results.push({ full: m[0], imgPath })
    }
  }

  return results
}

export function convertLocalImagesToDataUri(
  content: string,
  baseDir: string
): { content: string; convertedCount: number; failed: string[] } {
  const refs = findLocalImageRefs(content)
  let next = content
  let convertedCount = 0
  const failed: string[] = []

  for (const ref of refs) {
    const abs = path.resolve(baseDir, ref.imgPath)
    if (!fs.existsSync(abs)) {
      failed.push(ref.imgPath)
      continue
    }
    const ext = path.extname(abs).toLowerCase()
    const mime = MIME_TYPES[ext]
    if (!mime) {
      failed.push(ref.imgPath)
      continue
    }
    const dataUri = `data:${mime};base64,${fs.readFileSync(abs).toString('base64')}`
    next = next.split(ref.full).join(ref.full.replace(ref.imgPath, dataUri))
    convertedCount++
  }

  return { content: next, convertedCount, failed }
}

export function parseMarkdownFile(filePath: string): {
  title: string
  markdown: string
  convertedCount: number
  failed: string[]
} {
  const abs = path.resolve(filePath)
  if (!fs.existsSync(abs)) {
    throw new Error(`文件不存在: ${abs}`)
  }
  const raw = fs.readFileSync(abs, 'utf8')
  const baseDir = path.dirname(abs)

  // YAML front matter
  let body = raw
  let fmTitle = ''
  if (raw.startsWith('---')) {
    const end = raw.indexOf('\n---', 3)
    if (end !== -1) {
      const fm = raw.slice(3, end)
      const titleMatch = fm.match(/^title:\s*["']?(.+?)["']?\s*$/m)
      if (titleMatch) fmTitle = titleMatch[1].trim()
      body = raw.slice(end + 4).replace(/^\r?\n/, '')
    }
  }

  // # 标题
  let title = fmTitle
  const h1 = body.match(/^#\s+(.+)$/m)
  if (h1) {
    if (!title) title = h1[1].trim()
    body = body.replace(h1[0], '').replace(/^\r?\n/, '')
  }
  if (!title) {
    title = path.basename(abs, path.extname(abs))
  }

  const { content, convertedCount, failed } = convertLocalImagesToDataUri(body, baseDir)
  return { title, markdown: content, convertedCount, failed }
}
