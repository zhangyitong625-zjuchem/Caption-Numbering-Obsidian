// ============================================================
// frontMatter.ts — 读写 Obsidian 文档的 front matter 元数据
//
// 题注插件的 front matter 格式示例：
//   ---
//   caption numbering: 图, 表, auto
//   ---
//
// 各选项含义（逗号分隔）：
//   - 标签名：如 "图"、"表"、"算法"，为文档启用哪些标签
//   - auto   ：启用自动编号
//   - off    ：关闭编号（优先级最高）
//
// ★ 语义：这里只覆盖写到的字段，没写的字段沿用插件设置，
//   因此"有没有 front matter"不会改变编号模式、来源级别等行为。
// ============================================================
import { CachedMetadata, FileManager, FrontMatterCache, TFile, parseFrontMatterEntry } from 'obsidian'
import { CaptionPluginSettings, TagDefinition } from './settingsTypes'

const AUTO_KEY = 'auto'
const OFF_KEY = 'off'

/**
 * 从 front matter 中解析题注设置
 *
 * ★ 只覆盖文档里**明确写到**的字段，其余字段一律沿用插件设置：
 *   `caption numbering: 图, 表`        → 只换标签；编号模式 / 来源级别 / 含上级标题编号 等全部沿用插件设置
 *   `caption numbering: 图, 表, auto`  → 换标签 + 打开自动编号
 *   `caption numbering: 图, off`       → 换标签 + 关闭该文档的编号
 *   没有这个键（哪怕有 title 等其它 front matter）→ 直接用插件设置
 *
 * 这样"有 front matter"和"没有 front matter"的编号行为完全一致。
 *
 * @param fm       front matter 缓存
 * @param fallback 插件全局设置（未被覆盖字段的来源）
 * @returns 合并后的设置；如果 front matter 中没有题注相关键则返回 undefined
 */
function parseCompactFrontMatterSettings (
  fm: FrontMatterCache,
  fallback: CaptionPluginSettings
): CaptionPluginSettings | undefined {
  const entry = parseFrontMatterEntry(fm, 'caption numbering') as string | null

  // ★ 关键判断：文档 front matter 里没有写 "caption numbering" 这个键时，
  //   必须返回 undefined，让调用方回退到插件全局设置。
  //   否则任何带 front matter 的笔记（哪怕只写了 title:）都会被当成
  //   "文档级设置" 处理，从而把 auto / tags / numberingMode 全部重置成默认值
  //   —— 表现就是自动编号和交叉引用补显示文字都失效。
  if (entry === null || entry === undefined || String(entry).trim() === '') {
    return undefined
  }

  const parts = String(entry).split(',').map(s => s.trim()).filter(s => s.length > 0)

  const tags: TagDefinition[] = []
  let auto: boolean | undefined
  let off: boolean | undefined

  for (const part of parts) {
    if (part === AUTO_KEY) {
      auto = true
    } else if (part === OFF_KEY) {
      off = true
    } else {
      // 其他字段视为标签名
      tags.push({ name: part })
    }
  }

  return {
    ...fallback,
    ...(tags.length > 0 ? { tags } : {}),
    ...(auto === undefined ? {} : { auto }),
    ...(off === undefined ? {} : { off })
  }
}

/**
 * 获取 front matter 中的设置（优先），如果不存在则返回插件全局设置
 *
 * @param metadata            文档的元数据（包含 front matter）
 * @param alternativeSettings 插件全局设置（作为备选）
 * @returns 有效的题注设置
 */
/**
 * 获取文档实际生效的题注设置
 *
 * front matter 里写到的字段覆盖插件设置，没写的字段沿用插件设置；
 * 文档没有 "caption numbering" 键时直接用插件设置。
 *
 * @param metadata            文档的元数据（包含 front matter）
 * @param alternativeSettings 插件全局设置（未被覆盖字段的来源）
 * @returns 有效的题注设置
 */
export const getFrontMatterSettingsOrAlternative = (
  { frontmatter }: CachedMetadata,
  alternativeSettings: CaptionPluginSettings
): CaptionPluginSettings => {
  if (frontmatter !== undefined) {
    const decompactedSettings = parseCompactFrontMatterSettings(frontmatter, alternativeSettings)
    if (decompactedSettings !== undefined) return decompactedSettings
  }
  return alternativeSettings
}

/**
 * 将设置序列化为紧凑的 front matter 值
 *
 * 例如：{ tags: [{name:"图"},{name:"表"}], auto: true, off: false }
 *   → "图, 表, auto"
 */
function settingsToCompactFrontMatterValue(settings: CaptionPluginSettings): string {
  const parts: string[] = []

  // 标签名
  for (const tag of settings.tags) {
    const name = tag.name.trim()
    if (name.length > 0) {
      parts.push(name)
    }
  }

  // auto / off
  if (settings.off) {
    parts.push(OFF_KEY)
  } else if (settings.auto) {
    parts.push(AUTO_KEY)
  }

  return parts.join(', ')
}

/**
 * 将当前设置保存到文档的 front matter 中
 *
 * @param fileManager Obsidian 文件管理器
 * @param file        目标文件
 * @param settings    要保存的设置
 */
export const saveSettingsToFrontMatter = (
  fileManager: FileManager,
  file: TFile,
  settings: CaptionPluginSettings
): void => {
  void fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
    const v = settingsToCompactFrontMatterValue(settings)
    frontmatter['caption numbering'] = v
  })
}
