// ============================================================
// 导入 Obsidian 核心类型：
//   EditorChange  - 描述一次文档修改操作（从哪到哪、替换成什么）
// ============================================================
import { EditorChange } from 'obsidian'

// 当前活动视图的信息（包含编辑器、文档元数据等）
import { ViewInfo } from './activeViewHelpers'

// 设置类型与默认值统一由 settingsTypes.ts 提供，避免重复定义导致类型不兼容
import { CaptionPluginSettings } from './settingsTypes'

/**
 * 从标题行中提取标签名和说明文字
 *
 * 例如：
 *   "###### 图 1 系统架构图"  → { tagName: "图", cleanText: "系统架构图" }
 *   "###### 算法 快速排序"    → { tagName: "算法", cleanText: "快速排序" }
 *   "###### 普通标题"        → null（不是匹配的题注行）
 *
 * @param lineText  标题行的完整文本
 * @param tagNames  用户定义的所有标签名数组，如 ["图", "表", "算法"]
 * @returns 解析结果；如果不匹配任何标签则返回 null
 */
function parseCaptionLine(lineText: string, tagNames: string[]): {
  tagName: string
  cleanText: string
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
      cleanText: match[3].trim()   // 如 "系统架构图"
    }
  }

  return null  // 不匹配任何标签
}

// ============================================================
// 中文数字解析
// ============================================================

// 中文数字字符（"两" 也当 2 用，学位论文里 "两块" 不常见但 "两" 偶有出现）
const CHINESE_DIGITS: Record<string, number> = {
  零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4,
  五: 5, 六: 6, 七: 7, 八: 8, 九: 9
}

// 中文数位
const CHINESE_UNITS: Record<string, number> = {
  十: 10, 百: 100, 千: 1000, 万: 10000
}

/**
 * 把中文数字转换成阿拉伯数字
 *
 *   "一"     → 1      "十"     → 10
 *   "十一"   → 11     "二十三" → 23
 *   "一百零五" → 105   "一万二千" → 12000
 *   "一〇一" → 101    ← 纯数位写法（没有数位字，按位拼接）
 *
 * @param text 只包含中文数字字符的字符串
 * @returns 数值；包含非中文数字字符时返回 null
 */
function parseChineseNumber(text: string): number | null {
  if (text.length === 0) return null

  // 纯数位写法（如 "一〇一"）：没有十百千万，逐位拼起来
  const hasUnit = Array.from(text).some(ch => CHINESE_UNITS[ch] !== undefined)
  if (!hasUnit) {
    let value = ''
    for (const ch of text) {
      const digit = CHINESE_DIGITS[ch]
      if (digit === undefined) return null
      value += String(digit)
    }
    return Number(value)
  }

  // 带数位的写法（如 "二十三"、"一百零五"）
  let total = 0     // 已结算的部分（"万" 以上）
  let section = 0   // 当前千位段内的累计
  let current = 0   // 还没结算的数字

  for (const ch of text) {
    const digit = CHINESE_DIGITS[ch]
    if (digit !== undefined) {
      current = digit
      continue
    }

    const unit = CHINESE_UNITS[ch]
    if (unit === undefined) return null

    if (unit === 10000) {
      total += (section + current) * unit
      section = 0
      current = 0
    } else {
      // "十" 前面没有数字时按 1 计（"十一" = 11）
      section += (current === 0 ? 1 : current) * unit
      current = 0
    }
  }

  return total + section + current
}

/**
 * 从标题文本中提取已有的编号
 *
 * 支持格式：
 *   "1 系统概述"       → "1"
 *   "1. 系统概述"      → "1"      ← 常见的中文学位论文写法（编号后带点）
 *   "1、系统概述"      → "1"
 *   "1.1 子系统"      → "1.1"
 *   "1.1. 子系统"     → "1.1"
 *   "1.1.1 方法"      → "1.1.1"
 *   "第1章 引言"      → "1"
 *   "第一章 引言"      → "1"      ← 中文数字
 *   "一、绪论"        → "1"      ← 中文数字 + 顿号
 *   "二. 系统设计"     → "2"
 *   "三 方法论"       → "3"
 *   "十一、附录"      → "11"
 *   "背景介绍"        → null（没有编号）
 *   "一般性讨论"      → null（"一" 后面没有分隔符，不当编号）
 *
 * @param headingText 标题的纯文本（不含 ### 前缀）
 * @returns 提取到的编号字符串，如果没有编号则返回 null
 */
function extractHeadingNumber(headingText: string): string | null {
  const trimmed = headingText.trim()

  // 1) 阿拉伯数字：如 "1 系统概述"、"1.1 子系统"、"2. 大君李"、"3、功能设计"
  //    数字后必须是分隔符或空格，"2020年的总结" 这类不会被误判
  const numberMatch = trimmed.match(
    /^(\d+(?:\.\d+)*)(?:\s*[、．.，,)）:：]\s*|\s+)(.+)$/
  )
  if (numberMatch) return numberMatch[1]

  // 2) "第X章 / 第X节 / 第X篇 / 第X部"，X 可以是阿拉伯数字或中文数字
  const chapterMatch = trimmed.match(
    /^第\s*([0-9]+|[零〇一二两三四五六七八九十百千万]+)\s*[章节篇部]/
  )
  if (chapterMatch) {
    const raw = chapterMatch[1]
    if (/^[0-9]+$/.test(raw)) return raw

    const value = parseChineseNumber(raw)
    return value === null ? null : String(value)
  }

  // 3) 中文数字 + 分隔符/空格：如 "一、啊啊啊啊"、"二. 系统设计"、"三 方法论"
  //    ★ 必须带分隔符或空格，否则 "一般性讨论" 这类标题会被误判成第一章
  const chineseMatch = trimmed.match(
    /^[（(【[]?\s*([零〇一二两三四五六七八九十百千万]+)\s*(?:[、．.，,)）】\]:：]\s*|\s+)(.+)$/
  )
  if (chineseMatch) {
    const value = parseChineseNumber(chineseMatch[1])
    if (value !== null) return String(value)
  }

  return null
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
 *  支持三种编号模式：
 *
 *  模式 1：'single'（单级编号）
 *    ###### 图 系统架构图  → ###### 图 1 系统架构图
 *    ###### 图 流程图      → ###### 图 2 流程图
 *    ###### 表 数据对比    → ###### 表 1 数据对比
 *
 *  模式 2：'fromHeading'（从标题取编号作为前缀，只取一级）
 *    ## 1 系统概述                     ← 提取编号 "1"
 *      ###### 图 系统架构图           → ###### 图 1-1
 *      ###### 图 流程图               → ###### 图 1-2
 *    ## 1.1 子系统                    ← 提取编号 "1.1"
 *      ###### 图 模块图               → ###### 图 1.1-1
 *    ## 2 功能设计                    ← 提取编号 "2"（重置计数器）
 *      ###### 图 部署图               → ###### 图 2-1
 *
 *  模式 3：'fromHeading' + useHeadingPath（含上级标题编号，只算到「标题来源级别」）
 *    # 一、简介                       ← 第 1 级序号 "1"
 *    ## 1 半导体                      ← 第 2 级序号 "1"
 *      ###### 图 能带图               → ###### 图 1.1-1  （来源级别 = 2）
 *    ## 2 简并半导体                   ← 第 2 级序号 "2"
 *    ### 2.1 在一起                    ← 第 3 级序号 "1"
 *      ###### 图 能带图               → ###### 图 1.2-1  （来源级别 = 2）
 *                                     → ###### 图 1.2.1-1（来源级别 = 3）
 *
 *  关键规则：
 *  1. 模式 2：只取「标题来源级别」那一级标题自带的编号，在该级标题处重置计数器
 *     模式 3：把 1~「标题来源级别」每一级标题的序号都拼进前缀，前缀一变就重置计数器
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

  // ★ 各级标题当前的"本级序号"（如 "1.2" → "2"）
  //   仅"含上级标题编号"模式使用：用它把 # 章 / ## 节 / ### 小节 拼成 1.2.1
  const levelSegments = new Map<number, string>()

  // ★ 当前章节编号前缀（仅 fromHeading 模式使用）
  let currentHeadingPrefix = ''

  const changes: EditorChange[] = []

  // ★ 跟踪旧→新标题文本变化，用于后续更新双链引用
  const headingChanges: {
    line: number          // 标题所在行号（用于避免与整行替换冲突）
    oldHeading: string    // 旧标题文本（不含 ###），如 "图 1 系统架构"
    newHeading: string    // 新标题文本，如 "图 2 系统架构"
    tagName: string       // 标签名，如 "图"
    oldNumber: string     // 旧编号，如 "1"
    newNumber: string     // 新编号，如 "2"
  }[] = []

  // ========== 遍历文档中的每一个标题 ==========
  for (const heading of headings) {
    // ----- 检查#1：1~5 级标题（章节标题） -----
    //   作用有两个：① 维护标题层级路径；② 在「标题来源级别」处重置计数器
    if (settings.numberingMode === 'fromHeading' && heading.level < 6) {
      const number = extractHeadingNumber(heading.heading)
      const parts = number === null ? [] : number.split('.')

      // 出现更浅的标题后，更深层级的旧序号就失效了
      for (const knownLevel of Array.from(levelSegments.keys())) {
        if (knownLevel > heading.level) levelSegments.delete(knownLevel)
      }

      // 记录本级序号：取编号的"末段"（"1.2" → "2"），没有编号则清掉这一级
      if (number === null) {
        levelSegments.delete(heading.level)
      } else {
        levelSegments.set(heading.level, parts[parts.length - 1])
      }

      if (settings.useHeadingPath) {
        // ★ 含上级标题编号：把 1~「标题来源级别」每一级的序号用 "." 串起来
        //   例（来源级别 = 3）： # 一、简介(1) / ## 2 简并半导体(2) / ### 2.1 在一起(1)
        //                      → "1.2.1"
        //   例（来源级别 = 2）：同一份文档 → "1.2"，第 3 级不参与
        const path: string[] = []
        for (let level = 1; level <= settings.sourceHeadingLevel; level++) {
          const segment = levelSegments.get(level)
          if (segment !== undefined && segment !== '') path.push(segment)
        }
        const nextPrefix = path.join('.')

        // 前缀变化 = 进入了新的章节 → 重置所有标签的计数器
        if (nextPrefix !== currentHeadingPrefix) {
          currentHeadingPrefix = nextPrefix
          for (const key of counterMap.keys()) {
            counterMap.set(key, 0)
          }
        }
      } else if (number !== null && heading.level === settings.sourceHeadingLevel) {
        // 老行为：只取「标题来源级别」那一级的编号，按「标题编号级数」截断
        // 例：headingLevelsToUse=1 → "1.2.3" → "1"
        //     headingLevelsToUse=2 → "1.2.3" → "1.2"
        currentHeadingPrefix = parts.slice(0, settings.headingLevelsToUse).join('.')

        // ★ 遇到来源级别的（有编号的）标题 → 重置所有标签的计数器
        for (const key of counterMap.keys()) {
          counterMap.set(key, 0)
        }
      }

      continue  // 章节标题本身不做任何修改
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

      // 从旧行文本中提取旧编号（没有编号时留空）
      const escapedTag = tagName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const oldNumMatch = lineText.match(
        new RegExp(`${escapedTag}\\s*([\\d.+\\-]+)\\s+`)
      )

      // 记录旧→新标题映射，用于后续更新双链引用
      headingChanges.push({
        line: lineNumber,
        oldHeading: oldHeadingText,
        newHeading: newHeadingText,
        tagName,
        oldNumber: oldNumMatch ? oldNumMatch[1] : '',
        newNumber: numberStr
      })
    }
  }

  // ========== 更新文档中的双链引用 ==========
  // 获取全文内容（在应用任何修改之前截取，用于正则扫描）
  const fullContent = editor.getValue()

  // 被整行替换的题注行：这些行上的双链交给整行替换处理，避免区间重叠
  const changedLines = new Set(headingChanges.map(hc => hc.line))

  // 已经登记过的修改区间，防止多个 Phase 重复/重叠修改同一段文字
  const claimedSpans = new Set<string>()

  /**
   * 登记一处双链修改
   *
   * @param wikilink    替换后的完整双链文本
   * @param startOffset 该双链在原文档中的起始字符偏移
   * @param length      原双链的字符长度
   */
  const addWikilinkChange = (wikilink: string, startOffset: number, length: number): void => {
    const from = offsetToPos(fullContent, startOffset)
    const to = offsetToPos(fullContent, startOffset + length)

    // 与整行替换重叠 → 跳过（否则 editor.transaction 会收到冲突的区间）
    if (changedLines.has(from.line)) return

    const key = `${from.line}:${from.ch}-${to.line}:${to.ch}`
    if (claimedSpans.has(key)) return
    claimedSpans.add(key)

    changes.push({ text: wikilink, from, to })
  }

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

        addWikilinkChange(newWikilink, match.index, fullMatch.length)
      }
    }
  }

  // ── Phase 1b：引用里已经写成了「新」编号，但缺少显示文字 ──
  //         例如题注原为 "###### 图 系统架构图"，正文里却已经写成
  //         [[#图 1 系统架构图]] —— Phase 1 只认旧标题，这里补一次，
  //         否则这条引用永远拿不到 |图 1
  if (headingChanges.length > 0) {
    for (const hc of headingChanges) {
      const escapedNew = hc.newHeading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

      const newHeadingRegex = new RegExp(
        `\\[\\[([^\\]]*?)${escapedNew}(?!\\|)\\]\\]`,
        'g'
      )

      let match: RegExpExecArray | null
      while ((match = newHeadingRegex.exec(fullContent)) !== null) {
        const fullMatch = match[0]
        const prefix = match[1] || ''

        const newWikilink = `[[${prefix}${hc.newHeading}|${hc.tagName} ${hc.newNumber}]]`
        if (newWikilink === fullMatch) continue

        addWikilinkChange(newWikilink, match.index, fullMatch.length)
      }
    }
  }

  // ── Phase 2：为当前所有题注引用补全缩写显示文字 ──
  //         即使题注编号没有变化，也把 [[#图 1 系统架构]]
  //         自动补全为 [[#图 1 系统架构|图 1]]
  //         跳过 Phase 1 / 1b 已经处理过的标题（避免重复修改同一位置）
  {
    // 旧标题与新标题都算「已处理」：旧标题由 Phase 1 负责，新标题由 Phase 1b 负责
    const changedHeadingsSet = new Set<string>()
    for (const hc of headingChanges) {
      changedHeadingsSet.add(hc.oldHeading)
      changedHeadingsSet.add(hc.newHeading)
    }

    for (const h of headings) {
      if (h.level !== 6) continue

      const lineText = editor.getLine(h.position.start.line)
      if (!lineText) continue

      const parsed = parseCaptionLine(lineText, tagNames)
      if (!parsed) continue

      const headingText = lineText.replace(/^#{1,6}\s+/, '')

      // ★ 跳过 Phase 1 / 1b 已经处理过的标题
      if (changedHeadingsSet.has(headingText)) continue

      // 从当前文本中提取已有编号
      const escTag = parsed.tagName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const numMatch = headingText.match(new RegExp(`${escTag}\\s*([\\d.+\\-]+)\\s+`))
      if (!numMatch) continue

      const number = numMatch[1]

      // 扫描没有 |显示文字 的双链引用：[[#图 1 系统架构]]
      const escapedHeading = headingText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const noDisplayRegex = new RegExp(
        `\\[\\[([^\\]]*?)${escapedHeading}(?!\\|)\\]\\]`,
        'g'
      )

      let match: RegExpExecArray | null
      while ((match = noDisplayRegex.exec(fullContent)) !== null) {
        const fullMatch = match[0]
        const prefix = match[1] || ''

        // 添加显示文字：|图 1
        const newWikilink = `[[${prefix}${headingText}|${parsed.tagName} ${number}]]`
        if (newWikilink === fullMatch) continue

        addWikilinkChange(newWikilink, match.index, fullMatch.length)
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

    // 只改真正带编号的行，避免无意义的修改污染撤销栈
    if (lineText === newText) continue

    changes.push({
      text: newText,
      from: { line: lineNumber, ch: 0 },
      to: { line: lineNumber, ch: lineText.length }
    })
  }

  if (changes.length > 0) {
    editor.transaction({ changes })
  }
}
