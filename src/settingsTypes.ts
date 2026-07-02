// ============================================================
// settingsTypes.ts — 题注插件的设置类型定义
// ============================================================
import { TagDefinition } from './numbering'

// ============================================================
// CaptionPluginSettings — 题注插件的完整设置
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
// 默认设置
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