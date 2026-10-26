// ============================================================
// fakeEditor.ts — 模拟 Obsidian 编辑器与元数据缓存，用于单元测试
//
// transaction() 的行为与 Obsidian 一致：所有 change 都相对于
// 「修改前的原文」定位，一次性原子应用（从后往前替换）。
// ============================================================

export interface Pos { line: number; ch: number }
export interface Change { from: Pos; to: Pos; text: string }

export class FakeEditor {
  lines: string[]

  constructor (text: string) {
    this.lines = text.split('\n')
  }

  getValue (): string { return this.lines.join('\n') }
  getLine (n: number): string { return this.lines[n] }
  lineCount (): number { return this.lines.length }
  lastLine (): number { return this.lines.length - 1 }
  getCursor (): Pos { return { line: 0, ch: 0 } }
  setCursor (): void {}

  transaction (tx: { changes?: Change[] }): void {
    const changes = tx.changes ?? []
    const original = this.getValue()
    const offsets = changes.map(c => ({
      from: this.toOffset(c.from),
      to: this.toOffset(c.to),
      text: c.text
    }))
    // 与 Obsidian 一致：从文档末尾往前改，保证偏移量有效
    offsets.sort((a, b) => b.from - a.from)
    let out = original
    for (const c of offsets) out = out.slice(0, c.from) + c.text + out.slice(c.to)
    this.lines = out.split('\n')
  }

  private toOffset (pos: Pos): number {
    let off = 0
    for (let i = 0; i < pos.line; i++) off += this.lines[i].length + 1
    return off + pos.ch
  }
}

export interface Cache {
  headings: { level: number, heading: string, position: { start: Pos, end: Pos } }[]
  frontmatter?: Record<string, unknown>
}

/**
 * 解析 front matter 与标题，模拟 Obsidian 的 metadataCache
 */
export function buildCache (text: string): Cache {
  const lines = text.split('\n')
  let frontmatter: Record<string, unknown> | undefined
  let start = 0

  if (lines[0] === '---') {
    for (let i = 1; i < lines.length; i++) {
      if (lines[i] === '---') {
        frontmatter = {}
        for (let j = 1; j < i; j++) {
          const m = lines[j].match(/^([^:\s][^:]*):\s*(.*)$/)
          if (m) frontmatter[m[1].trim()] = m[2].trim()
        }
        start = i + 1
        break
      }
    }
  }

  const headings: Cache['headings'] = []
  let inFence = false
  for (let i = start; i < lines.length; i++) {
    const line = lines[i]
    if (/^\s*(```|~~~)/.test(line)) { inFence = !inFence; continue }
    if (inFence) continue
    const m = line.match(/^(#{1,6})\s+(.*)$/)
    if (m) {
      headings.push({
        level: m[1].length,
        heading: m[2].trim(),
        position: { start: { line: i, ch: 0 }, end: { line: i, ch: line.length } }
      })
    }
  }

  return { headings, frontmatter }
}

/**
 * 组装 updateCaptionNumbering / removeCaptionNumbering 需要的 viewInfo
 */
export function buildViewInfo (text: string): { viewInfo: any, editor: FakeEditor } {
  const editor = new FakeEditor(text)
  const cache = buildCache(text)
  return {
    editor,
    viewInfo: {
      activeView: { file: { path: 'test.md' }, editor },
      data: cache,
      editor
    }
  }
}
