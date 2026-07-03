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
// ============================================================
import { CachedMetadata, FileManager, FrontMatterCache, TFile, parseFrontMatterEntry } from 'obsidian'
import { TagDefinition } from './numbering'
import { CaptionPluginSettings, DEFAULT_CAPTION_SETTINGS } from './settingsTypes'

const AUTO_KEY = 'auto'
const OFF_KEY = 'off'

/**
 * 从 front matter 中解析题注设置
 *
 * @param fm  front matter 缓存
 * @returns 解析后的设置，如果 front matter 中没有题注相关键则返回 undefined
 */
function parseCompactFrontMatterSettings(fm: FrontMatterCache): CaptionPluginSettings | undefined {
  const entry = parseFrontMatterEntry(fm, 'caption numbering') as string | null

  const entryString = entry ?? ''
  const parts = entryString.split(',').map(s => s.trim()).filter(s => s.length > 0)

  const tags: TagDefinition[] = []
  let auto = false
  let off = false

  for (const part of parts) {
    if (part === AUTO_KEY) {
      auto = true
    } else if (part === OFF_KEY) {
      off = true
    } else {
      // 其他字段视为标签名
      tags.push({ name: part, counter: 0 })
    }
  }

  // 如果没有指定任何标签，使用默认值
  if (tags.length === 0) {
    tags.push(
      { name: '图', counter: 0 },
      { name: '表', counter: 0 }
    )
  }

  return {
    ...DEFAULT_CAPTION_SETTINGS,
    tags,
    auto,
    off
  }
}

/**
 * 兼容旧格式："first-level 1, max 6, 1.1, auto, contents ^toc"
 * 旧格式中我们只提取 auto/off 信息，其余忽略
 */
function parseOldFormat(oldString: string): CaptionPluginSettings {
  const parts = oldString.split(',').map(s => s.trim()).filter(s => s.length > 0)
  const auto = parts.includes(AUTO_KEY)
  const off = parts.includes(OFF_KEY)

  return {
    ...DEFAULT_CAPTION_SETTINGS,
    auto,
    off
  }
}

/**
 * 获取 front matter 中的设置（优先），如果不存在则返回插件全局设置
 *
 * @param metadata            文档的元数据（包含 front matter）
 * @param alternativeSettings 插件全局设置（作为备选）
 * @returns 有效的题注设置
 */
export const getFrontMatterSettingsOrAlternative = (
  { frontmatter }: CachedMetadata,
  alternativeSettings: CaptionPluginSettings
): CaptionPluginSettings => {
  if (frontmatter !== undefined) {
    const decompactedSettings = parseCompactFrontMatterSettings(frontmatter)
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