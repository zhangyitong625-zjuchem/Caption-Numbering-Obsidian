// ============================================================
// 导入 Obsidian 核心类型：
//   EditorChange  - 描述一次文档修改操作（从哪到哪、替换成什么）
// ============================================================
import { EditorChange } from 'obsidian'

// 当前活动视图的信息（包含编辑器、文档元数据等）
import { ViewInfo } from './activeViewHelpers'

// ============================================================
// TagDefinition — 用户自定义的标签类型
// ============================================================
export interface TagDefinition {
  name: string       // 标签名称，如 "图"、"表"、"算法"
  counter: number    // 当前计数（从0开始，编号时+1）
}

// ============================================================
// CaptionPluginSettings — 题注插件的设置类型
// ============================================================
export interface CaptionPluginSettings {
  tags: TagDefinition[]      // 用户自定义的标签列表

  // 编号模式
  numberingMode: 'single' | 'fromHeading'
                              // 'single'      → 图 1, 图 2, 图 3...
                              // 'fromHeading' → 图 1-1, 图 1.1-1...

  // 从标题提取编号相关的设置（仅 numberingMode === 'fromHeading' 时生效）
  sourceHeadingLevel: number  // 从第几级标题提取编号（2~5，如 2 表示取 H2 标题的编号）
  headingLevelsToUse: number  // 取标题编号的前几级（1~4，如 1 表示 "3"，2 表示 "3.1"）
  twoLevelSeparator: string   // 前缀与序号之间的分隔符，如 "-" → "图 1-1"，"." → "图 1.1"

  auto: boolean              // 是否自动编号
  off: boolean               // 是否关闭编号
}

// ============================================================
// 题注插件的默认设置
// ============================================================
export const DEFAULT_CAPTION_SETTINGS: CaptionPluginSettings = {
  tags: [
    { name: '图', counter: 0 },
    { name: '表', counter: 0 }
  ],
  numberingMode: 'single',
  sourceHeadingLevel: 2,
  headingLevelsToUse: 1,
  twoLevelSeparator: '-',
  auto: false,
  off: false
}

/**
 * 从标题行中提取标签名和说明文字
 *
 * 例如：
 *   "###### 图 1 系统架构图"  → { tagName: "图", cleanText: "系统架构图", hasNumber: true }
 *   "###### 算法 快速排序"    → { tagName: "算法", cleanText: "快速排序", hasNumber: false }
 *   "###### 普通标题"        → null（不是匹配的题注行）
 *
 * @param lineText  标题行的完整文本
 * @param tagNames  用户定义的所有标签名数组，如 ["图", "表", "算法"]
 * @returns 解析结果；如果不匹配任何标签则返回 null
 */
function parseCaptionLine(lineText: string, tagNames: string[]): {
  tagName: string
  cleanText: string
  hasNumber: boolean
} | null {
  const trimmed = lineText.trim()

  // 动态构建正则：^#{1,6}\s+(图|表|算法)\s*([\d.+-]*)\s*(.*)
  // 注意：(\d*) 改为 ([\d.+-]*) 以匹配 "1-1"、"1.1-1" 等带分隔符的编号格式
  const escapedTags = tagNames.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const pattern = `^#{1,6}\\s+(${escapedTags.join('|')})\\s*([\\d.+\\-]*)\\s*(.*)`
  const regex = new RegExp(pattern)
  const match = trimmed.match(regex)

  if (match) {
    return {
      tagName: match[1],           // 如 "图"
      cleanText: match[3].trim(),  // 如 "系统架构图"
      hasNumber: match[2] !== ''   // 是否已有编号
    }
  }

  return null  // 不匹配任何标签
}

/**
 * 从标题文本中提取已有的编号
 *
 * 支持格式：
 *   "1 系统概述"       → "1"
 *   "1.1 子系统"      → "1.1"
 *   "1.1.1 方法"      → "1.1.1"
 *   "第1章 引言"      → "1"
 *   "背景介绍"        → null（没有编号）
 *   "前言"            → null（没有编号）
 *
 * @param headingText 标题的纯文本（不含 ### 前缀）
 * @returns 提取到的编号字符串，如果没有编号则返回 null
 */
function extractHeadingNumber(headingText: string): string | null {
  const trimmed = headingText.trim()

  // 英文数字格式：如 "1"、"1.1"、"1.2.3"
  const numberMatch = trimmed.match(/^(\d+(?:\.\d+)*)\s+(.+)$/)
  if (numberMatch) return numberMatch[1]

  // 中文格式：如 "第1章"、"第2节"、"第3篇"
  const chineseMatch = trimmed.match(/^第(\d+)[章节篇篇]/)
  if (chineseMatch) return chineseMatch[1]

  return null
}

/**
 * 只在文本真正发生变化时才添加修改操作到 changes 数组中
 *
 * 这样做的目的是：如果编号没有变化（例如重新编号时内容一样），
 * 就不产生新的历史记录，避免污染 Obsidian 的撤销（Undo）栈
 */
function replaceRangeEconomically(
  editor: Editor,
  changes: EditorChange[],
  from: { line: number; ch: number },
  to: { line: number; ch: number },
  text: string
): void {
  changes.push({ text, from, to })
}

/**
 * 将字符串中的字符偏移量转换为编辑器中的行列位置
 *
 * 例如 "Hello\nWorld" 中偏移量 7 → { line: 1, ch: 1 }
 * 因为 7 个字符 = "Hello\nW"，位于第 1 行第 1 列
 */
function offsetToPos(text: string, offset: number): { line: number; ch: number } {
  const before = text.substring(0, offset)
  const lines = before.split('\n')
  return {
    line: lines.length - 1,
    ch: lines[lines.length - 1].length
  }
}

/** ============================================================
 *  ★★★ 核心函数：按标签分别累计编号 ★★★
 *
 *  支持两种编号模式：
 *
 *  模式 1：'single'（单级编号）
 *    ###### 图 系统架构图  → ###### 图 1 系统架构图
 *    ###### 图 流程图      → ###### 图 2 流程图
 *    ###### 表 数据对比    → ###### 表 1 数据对比
 *
 *  模式 2：'fromHeading'（从标题取编号作为前缀）
 *    ## 1 系统概述                     ← 提取编号 "1"
 *      ###### 图 系统架构图           → ###### 图 1-1
 *      ###### 图 流程图               → ###### 图 1-2
 *    ## 1.1 子系统                    ← 提取编号 "1.1"
 *      ###### 图 模块图               → ###### 图 1.1-1
 *      ###### 表 接口定义             → ###### 表 1.1-1
 *    ## 2 功能设计                    ← 提取编号 "2"（重置计数器）
 *      ###### 图 部署图               → ###### 图 2-1
 *
 *  关键规则：
 *  1. 遇到来源标题级别（如 H2）→ 提取编号作为前缀 → 重置所有计数器
 *  2. 只处理第6级标题（######）→ 匹配标签 → 计数器+1 → 组装编号
 * ============================================================ */
export const updateCaptionNumbering = (
  viewInfo: ViewInfo | undefined,
  settings: CaptionPluginSettings
): void => {
  if (!viewInfo) return

  const headings = viewInfo.data.headings ?? []
  const editor = viewInfo.editor

  // 收集所有标签名，跳过空名称
  const tagNames = settings.tags
    .map(t => t.name.trim())
    .filter(name => name.length > 0)

  if (tagNames.length === 0) return  // 没有任何标签，不做处理

  // 用 Map 跟踪每个标签的当前计数
  // ★ 每次运行都从 0 开始，确保不同文件、自动编号时编号始终从 1 开始
  const counterMap = new Map<string, number>()
  for (const tag of settings.tags) {
    if (tag.name.trim().length > 0) {
      counterMap.set(tag.name.trim(), 0)
    }
  }

  // ★ 当前章节编号前缀（仅 fromHeading 模式使用）
  let currentHeadingPrefix = ''

  const changes: EditorChange[] = []

  // ★ 跟踪旧→新标题文本变化，用于后续更新双链引用
  const headingChanges: {
    oldHeading: string    // 旧标题文本（不含 ###），如 "图 1 系统架构"
    newHeading: string    // 新标题文本，如 "图 2 系统架构"
    tagName: string       // 标签名，如 "图"
    oldNumber: string     // 旧编号，如 "1"
    newNumber: string     // 新编号，如 "2"
  }[] = []

  // ========== 遍历文档中的每一个标题 ==========
  for (const heading of headings) {
    // ----- 检查#1：是否是需要提取编号的来源标题级别？ -----
    if (settings.numberingMode === 'fromHeading' &&
        heading.level === settings.sourceHeadingLevel) {

      const number = extractHeadingNumber(heading.heading)
      if (number) {
        // 截取指定位数的编号
        // 例：headingLevelsToUse=1 → "1.2.3" → "1"
        //     headingLevelsToUse=2 → "1.2.3" → "1.2"
        const parts = number.split('.')
        const truncated = parts.slice(0, settings.headingLevelsToUse).join('.')
        currentHeadingPrefix = truncated

        // ★ 遇到新标题 → 重置所有标签的计数器
        for (const key of counterMap.keys()) {
          counterMap.set(key, 0)
        }
      }
      continue  // 原标题级别本身不做任何修改
    }

    // ----- 检查#2：是否是题注标题（######）？ -----
    if (heading.level !== 6) continue

    const lineNumber = heading.position.start.line
    const lineText = editor.getLine(lineNumber)
    if (!lineText) continue

    // 解析当前行：匹配哪个标签？
    const parsed = parseCaptionLine(lineText, tagNames)
    if (!parsed) continue  // 不匹配任何标签，跳过

    const { tagName, cleanText } = parsed

    // ★ 该标签的计数器 +1
    const currentCount = counterMap.get(tagName) ?? 0
    counterMap.set(tagName, currentCount + 1)

    // 提取井号前缀（######）
    const hashPrefix = lineText.match(/^#{1,6}/)?.[0] || '######'

    // ★ 组装编号字符串（根据模式）
    let numberStr: string
    if (settings.numberingMode === 'fromHeading' && currentHeadingPrefix) {
      // 带章节前缀：图 1-1, 图 1.1-1 ...
      numberStr = `${currentHeadingPrefix}${settings.twoLevelSeparator}${currentCount + 1}`
    } else {
      // 单级编号：图 1, 图 2 ...
      numberStr = `${currentCount + 1}`
    }

    // 提取旧标题文本（不含 ### 前缀），用于双链引用更新
    const oldHeadingText = lineText.replace(/^#{1,6}\s+/, '')

    // 组装新行：###### 图 1 系统架构图  /  ###### 图 1-1 系统架构图
    const newText = `${hashPrefix} ${tagName} ${numberStr} ${cleanText}`.trimEnd()

    // 提取新标题文本
    const newHeadingText = newText.replace(/^#{1,6}\s+/, '')

    // 经济替换：只在文本变化时才记录修改
    if (lineText !== newText) {
      changes.push({
        text: newText,
        from: { line: lineNumber, ch: 0 },
        to: { line: lineNumber, ch: lineText.length }
      })

      // 记录旧→新标题映射，用于后续更新双链引用
      headingChanges.push({
        oldHeading: oldHeadingText,
        newHeading: newHeadingText,
        tagName,
        oldNumber: numberStr, // 注意：oldNumber 在这里不准确；
        newNumber: numberStr   // 实际上我们只知道新编号，没有直接解析旧编号
      })
      // ★ 修正 oldNumber：从旧行文本中提取旧的编号字符串
      const escapedTag = tagName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const oldNumMatch = lineText.match(
        new RegExp(`${escapedTag}\\s*([\\d.+\\-]+)\\s+`)
      )
      if (oldNumMatch) {
        headingChanges[headingChanges.length - 1].oldNumber = oldNumMatch[1]
      }
    }
  }

  // ========== 更新文档中的双链引用 ==========
  // 获取全文内容（在应用任何修改之前截取，用于正则扫描）
  const fullContent = editor.getValue()

  // ── Phase 1：题注标题变化时，更新双链目标 + 显示文字 ──
  //         例如 [[#图 1 系统架构]] → [[#图 2 系统架构|图 2]]
  if (headingChanges.length > 0) {
    for (const hc of headingChanges) {
      // 转义正则特殊字符
      const escapedOld = hc.oldHeading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const escapedTag = hc.tagName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const escapedOldNum = hc.oldNumber.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

      // 匹配 [[...#旧标题...]] 或 [[...#旧标题|显示文字]] 或 [[文件#旧标题...]]
      const wikiRegex = new RegExp(
        `\\[\\[([^\\]]*?)${escapedOld}(\\|[^\\]]*)?\\]\\]`,
        'g'
      )

      let match: RegExpExecArray | null
      while ((match = wikiRegex.exec(fullContent)) !== null) {
        const fullMatch = match[0]
        const prefix = match[1] || ''   // "file#" 或空字符串
        const displayPart = match[2] || '' // "|图 1" 或空字符串

        // 更新显示文字（| 后面的部分）
        let newDisplay = displayPart
        if (!displayPart) {
          // ★ 没有显示文字 → 自动添加 "标签+编号" 缩写
          //    例如 [[#图 1 系统架构]] → [[#图 1 系统架构|图 1]]
          newDisplay = `|${hc.tagName} ${hc.newNumber}`
        } else if (hc.oldNumber !== hc.newNumber) {
          // 已有显示文字且编号变化 → 更新显示文字中的编号
          //    例如 [[#图 1 系统架构|图 1]] → [[#图 2 系统架构|图 2]]
          newDisplay = displayPart.replace(
            new RegExp(`${escapedTag}\\s*${escapedOldNum}`),
            `${hc.tagName} ${hc.newNumber}`
          )
        }

        // 构建新的双链引用
        const newWikilink = `[[${prefix}${hc.newHeading}${newDisplay}]]`

        // 跳过没有变化的引用
        if (newWikilink === fullMatch) continue

        // 计算字符偏移量 → 行列位置
        const from = offsetToPos(fullContent, match.index)
        const to = offsetToPos(fullContent, match.index + fullMatch.length)

        changes.push({ text: newWikilink, from, to })
      }
    }
  }

  // ── Phase 2：为当前所有题注引用补全缩写显示文字 ──
  //         即使题注编号没有变化，也把 [[#图 1 系统架构]]
  //         自动补全为 [[#图 1 系统架构|图 1]]
  //         跳过 Phase 1 已经处理过的标题（避免重复修改同一位置）
  {
    const changedHeadingsSet = new Set(headingChanges.map(hc => hc.oldHeading))

    for (const h of headings) {
      if (h.level !== 6) continue

      const lineText = editor.getLine(h.position.start.line)
      if (!lineText) continue

      const parsed = parseCaptionLine(lineText, tagNames)
      if (!parsed) continue

      const headingText = lineText.replace(/^#{1,6}\s+/, '')

      // ★ 跳过 Phase 1 已经处理过的标题
      if (changedHeadingsSet.has(headingText)) continue

      // 从当前文本中提取已有编号
      const escTag = parsed.tagName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const numMatch = headingText.match(new RegExp(`${escTag}\\s*([\\d.+\\-]+)\\s+`))
      if (!numMatch) continue

      const number = numMatch[1]

      // 扫描没有 |显示文字 的双链引用：[[#图 1 系统架构]]
      const escapedHeading = headingText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const noDisplayRegex = new RegExp(
        `\\[\\[([^\\]]*?)${escapedHeading}(?!\\|)(?=\\]\\])`,
        'g'
      )

      let match: RegExpExecArray | null
      while ((match = noDisplayRegex.exec(fullContent)) !== null) {
        const fullMatch = match[0]
        const prefix = match[1] || ''

        // 添加显示文字：|图 1
        const newWikilink = `[[${prefix}${headingText}|${parsed.tagName} ${number}]]`
        if (newWikilink === fullMatch) continue

        const from = offsetToPos(fullContent, match.index)
        const to = offsetToPos(fullContent, match.index + fullMatch.length)

        changes.push({ text: newWikilink, from, to })
      }
    }
  }

  // ========== 一次性应用所有修改（题注编号 + 双链引用更新）==========
  if (changes.length > 0) {
    editor.transaction({ changes })
  }
}

/** ============================================================
 *  移除所有题注编号
 *
 *  例如：
 *    ###### 图 3 系统架构图  → ###### 图 系统架构图
 *    ###### 表 1 数据对比    → ###### 表 数据对比
 * ============================================================ */
export const removeCaptionNumbering = (
  viewInfo: ViewInfo | undefined,
  settings: CaptionPluginSettings
): void => {
  if (!viewInfo) return

  const headings = viewInfo.data.headings ?? []
  const editor = viewInfo.editor

  const tagNames = settings.tags
    .map(t => t.name.trim())
    .filter(name => name.length > 0)

  if (tagNames.length === 0) return

  const changes: EditorChange[] = []

  for (const heading of headings) {
    if (heading.level !== 6) continue

    const lineNumber = heading.position.start.line
    const lineText = editor.getLine(lineNumber)
    if (!lineText) continue

    const parsed = parseCaptionLine(lineText, tagNames)
    if (!parsed) continue

    const { tagName, cleanText } = parsed
    const hashPrefix = lineText.match(/^#{1,6}/)?.[0] || '######'

    // 去掉编号：###### 图 系统架构图
    const newText = `${hashPrefix} ${tagName} ${cleanText}`.trimEnd()

    replaceRangeEconomically(
      changes,
      { line: lineNumber, ch: 0 },
      { line: lineNumber, ch: lineText.length },
      newText
    )
  }

  if (changes.length > 0) {
    editor.transaction({ changes })

    // 重置所有标签的计数器为 0
    for (const tag of settings.tags) {
      tag.counter = 0
    }
  }
}