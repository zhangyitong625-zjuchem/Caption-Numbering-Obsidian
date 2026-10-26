// ============================================================
// settingsTypes.ts — 题注插件的设置类型定义
//
// ★ 本文件是设置相关的唯一来源（single source of truth）。
//   numbering.ts / frontMatter.ts / main.ts 都从这里导入类型与默认值，
//   不要在其他文件里再定义一份 CaptionPluginSettings / TagDefinition。
// ============================================================

// ============================================================
// TagDefinition — 用户自定义的标签类型
// ============================================================
export interface TagDefinition {
  // 标签名称，如 "图"、"表"、"算法"
  //
  // 注：早期版本这里还有一个 counter 字段，但计数实际上是每次运行
  //     从 0 重新累加的（见 numbering.ts 的 counterMap），该字段
  //     既不读也不影响结果，已删除。
  name: string
}

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
  sourceHeadingLevel: number  // 从第几级标题提取编号/在哪个级别重置计数器（1~5）
  headingLevelsToUse: number  // 取标题编号的前几级（1~4，如 1 表示 "3"，2 表示 "3.1"）
  twoLevelSeparator: string   // 前缀与序号之间的分隔符，如 "-" → "图 1-1"，"." → "图 1.1"

  // ★ 含上级标题编号：把 1 级到「标题来源级别」每一级标题的序号都用 "." 连起来作为前缀
  //   false → 只取「标题来源级别」那一级标题自带的编号（图 2-1）
  //   true  → 算到该级为止的多级前缀（图 1.2-1 / 图 1.2.1-1），此时 headingLevelsToUse 不生效
  useHeadingPath: boolean

  auto: boolean              // 是否自动编号
  off: boolean               // 是否关闭编号
  centerCaptions: boolean    // 是否居中对齐题注
}

// ============================================================
// 默认设置
// ============================================================
export const DEFAULT_CAPTION_SETTINGS: CaptionPluginSettings = {
  tags: [
    { name: '图' },
    { name: '表' }
  ],
  numberingMode: 'single',
  sourceHeadingLevel: 2,
  headingLevelsToUse: 1,
  twoLevelSeparator: '-',
  useHeadingPath: false,
  auto: false,
  off: false,
  centerCaptions: false
}
