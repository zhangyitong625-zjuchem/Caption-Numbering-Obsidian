// ============================================================
// frontMatter.test.ts — 设置来源的回归测试
//
// 覆盖两件事：
//   1. 文档只要带 front matter（哪怕只有 title）不能被误判成「文档级题注设置」
//   2. 写了 caption numbering 时只覆盖写到的字段，其余沿用插件设置
//      → 有 / 没有 front matter 的编号行为完全一致
// ============================================================
import { getFrontMatterSettingsOrAlternative } from '../src/frontMatter'
import { CaptionPluginSettings, DEFAULT_CAPTION_SETTINGS } from '../src/settingsTypes'

const globalSettings: CaptionPluginSettings = {
  ...DEFAULT_CAPTION_SETTINGS,
  tags: [
    { name: '图' },
    { name: '表' },
    { name: 'Figure' },
    { name: 'Table' }
  ],
  numberingMode: 'fromHeading',
  sourceHeadingLevel: 3,
  headingLevelsToUse: 2,
  twoLevelSeparator: ':',
  useHeadingPath: true,
  auto: true,
  centerCaptions: true
}

const fm = (frontmatter: Record<string, unknown> | undefined) =>
  getFrontMatterSettingsOrAlternative({ frontmatter } as any, globalSettings)

describe('getFrontMatterSettingsOrAlternative', () => {
  it('没有 front matter 时使用插件全局设置', () => {
    expect(fm(undefined)).toBe(globalSettings)
  })

  it('★ 只有 title 的 front matter 也必须回退到插件设置（不能重置 auto/tags）', () => {
    expect(fm({ title: '我的论文' })).toBe(globalSettings)
  })

  it('★ 只写了标签时，编号模式/来源级别/含上级标题编号等全部沿用插件设置', () => {
    const s = fm({ 'caption numbering': '图, 表' })

    expect(s.tags.map(t => t.name)).toEqual(['图', '表'])
    // 与"没有 front matter"时完全相同
    expect(s.numberingMode).toBe(globalSettings.numberingMode)
    expect(s.sourceHeadingLevel).toBe(globalSettings.sourceHeadingLevel)
    expect(s.headingLevelsToUse).toBe(globalSettings.headingLevelsToUse)
    expect(s.twoLevelSeparator).toBe(globalSettings.twoLevelSeparator)
    expect(s.useHeadingPath).toBe(globalSettings.useHeadingPath)
    expect(s.auto).toBe(globalSettings.auto)
    expect(s.centerCaptions).toBe(globalSettings.centerCaptions)
  })

  it('front matter 里可以单独打开自动编号，标签不变时沿用插件标签', () => {
    const s = fm({ 'caption numbering': 'auto' })

    expect(s.tags).toBe(globalSettings.tags)
    expect(s.auto).toBe(true)
    expect(s.sourceHeadingLevel).toBe(globalSettings.sourceHeadingLevel)
  })

  it('写全了标签和 auto 时按写的来', () => {
    const s = fm({ 'caption numbering': '图, 表, auto' })

    expect(s).not.toBe(globalSettings)
    expect(s.tags.map(t => t.name)).toEqual(['图', '表'])
    expect(s.auto).toBe(true)
    expect(s.off).toBe(false)
  })

  it('caption numbering 里可以关闭编号', () => {
    const s = fm({ 'caption numbering': '图, off' })
    expect(s.off).toBe(true)
    expect(s.tags.map(t => t.name)).toEqual(['图'])
    expect(s.numberingMode).toBe(globalSettings.numberingMode)
  })

  it('caption numbering 写成空字符串时仍使用插件设置', () => {
    expect(fm({ 'caption numbering': '   ' })).toBe(globalSettings)
  })
})
