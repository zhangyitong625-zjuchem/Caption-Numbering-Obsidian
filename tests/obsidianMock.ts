// ============================================================
// obsidianMock.ts — 让 jest 能在 Node 里跑插件的纯逻辑部分
//
// jest.config.js 把 'obsidian' 映射到这里。类型仍然来自 node_modules 里的
// 真实 obsidian.d.ts，只有运行时函数被替换成下面这些最小实现。
// ============================================================

export class Plugin {}
export class PluginSettingTab {}
export class Setting {}
export class MarkdownView {}
export class EditorSuggest {}
export class TFile {}
export class Modal {}
export class Notice {}

/**
 * 与 Obsidian 行为一致：只有在 frontmatter 里真的存在该键时才返回值
 */
export function parseFrontMatterEntry(
  frontmatterCache: Record<string, unknown> | undefined,
  key: string | RegExp
): unknown {
  if (!frontmatterCache) return null
  if (typeof key === 'string') {
    return Object.prototype.hasOwnProperty.call(frontmatterCache, key)
      ? frontmatterCache[key]
      : null
  }
  for (const k of Object.keys(frontmatterCache)) {
    if (key.test(k)) return frontmatterCache[k]
  }
  return null
}
