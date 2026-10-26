// ============================================================
// numbering.test.ts — 编号与交叉引用的回归测试
// ============================================================
import { updateCaptionNumbering, removeCaptionNumbering } from '../src/numbering'
import { getFrontMatterSettingsOrAlternative } from '../src/frontMatter'
import { CaptionPluginSettings, DEFAULT_CAPTION_SETTINGS } from '../src/settingsTypes'
import { buildCache, buildViewInfo } from './fakeEditor'

const baseSettings = (over: Partial<CaptionPluginSettings> = {}): CaptionPluginSettings => ({
  ...DEFAULT_CAPTION_SETTINGS,
  tags: [{ name: '图' }, { name: '表' }],
  auto: true,
  ...over
})

function number (text: string, settings: CaptionPluginSettings): string {
  const { viewInfo, editor } = buildViewInfo(text)
  updateCaptionNumbering(viewInfo, settings)
  return editor.getValue()
}

describe('updateCaptionNumbering — 单级编号', () => {
  it('按标签分别计数，并给双链补上显示文字', () => {
    const before = [
      '###### 图 系统架构图',
      '',
      '如图 [[#图 1 系统架构图]] 所示。',
      '',
      '###### 图 流程图',
      '',
      '###### 表 数据对比',
      ''
    ].join('\n')

    const after = number(before, baseSettings())

    expect(after).toBe([
      '###### 图 1 系统架构图',
      '',
      '如图 [[#图 1 系统架构图|图 1]] 所示。',
      '',
      '###### 图 2 流程图',
      '',
      '###### 表 1 数据对比',
      ''
    ].join('\n'))
  })

  it('★ 引用里已经写成新编号时，也要补显示文字', () => {
    const before = [
      '###### 图 系统架构图',
      '',
      '如图 [[#图 1 系统架构图]] 所示。',
      ''
    ].join('\n')

    expect(number(before, baseSettings())).toContain('[[#图 1 系统架构图|图 1]]')
  })

  it('编号已正确时也会补全缺失的显示文字（Phase 2）', () => {
    const before = [
      '###### 图 1 系统架构图',
      '',
      '如图 [[#图 1 系统架构图]] 所示。',
      ''
    ].join('\n')

    expect(number(before, baseSettings({ auto: false })))
      .toContain('[[#图 1 系统架构图|图 1]]')
  })

  it('支持自定义标签（Figure）', () => {
    const settings = baseSettings({
      tags: [{ name: 'Figure' }, { name: 'Table' }]
    })
    const before = '###### Figure Setup\n\n见 [[#Figure 1 Setup]]。\n'
    const after = number(before, settings)

    expect(after).toContain('###### Figure 1 Setup')
    expect(after).toContain('[[#Figure 1 Setup|Figure 1]]')
  })

  it('编号变化时同步更新引用目标与显示文字', () => {
    const before = [
      '###### 图 新插入的图',   // 排到第 1 位
      '',
      '###### 图 1 旧图',       // 顺延为第 2 位
      '',
      '见 [[#图 1 旧图|图 1]]。',
      ''
    ].join('\n')

    const after = number(before, baseSettings({ auto: false }))

    expect(after).toContain('###### 图 2 旧图')
    expect(after).toContain('[[#图 2 旧图|图 2]]')
  })

  it('一条引用也不重复修改（不会给同一处产生两个 change）', () => {
    const { viewInfo, editor } = buildViewInfo([
      '###### 图 系统架构图',
      '',
      '见 [[#图 1 系统架构图]]。',
      ''
    ].join('\n'))
    const seen: string[] = []
    editor.transaction = function (tx: { changes?: { from: { line: number, ch: number } }[] }) {
      for (const c of tx.changes ?? []) seen.push(`${c.from.line}:${c.from.ch}`)
    } as any

    updateCaptionNumbering(viewInfo, baseSettings())

    expect(new Set(seen).size).toBe(seen.length)
  })
})

describe('updateCaptionNumbering — 章节前缀模式', () => {
  it('从 "## 1 系统概述" 提取前缀', () => {
    const before = [
      '## 1 系统概述',
      '',
      '###### 图 系统架构图',
      '',
      '###### 图 流程图',
      '',
      '## 2 功能设计',
      '',
      '###### 图 部署图',
      ''
    ].join('\n')

    const after = number(before, baseSettings({ numberingMode: 'fromHeading' }))
    expect(after).toContain('###### 图 1-1 系统架构图')
    expect(after).toContain('###### 图 1-2 流程图')
    expect(after).toContain('###### 图 2-1 部署图')
  })

  it('★ 兼容 "## 2. 大君李" 这种编号后带点的写法', () => {
    const before = [
      '## 2. 大君李',
      '',
      '###### 图 部署图',
      ''
    ].join('\n')

    expect(number(before, baseSettings({ numberingMode: 'fromHeading' })))
      .toContain('###### 图 2-1 部署图')
  })

  it('★ 中文数字标题 "一、" 识别为第 1 章', () => {
    const before = [
      '## 一、啊啊啊啊',
      '',
      '###### 图 部署图',
      '',
      '###### 表 数据对比',
      '',
      '## 二、系统设计',
      '',
      '###### 图 结构图',
      ''
    ].join('\n')

    const after = number(before, baseSettings({ numberingMode: 'fromHeading' }))
    expect(after).toContain('###### 图 1-1 部署图')
    expect(after).toContain('###### 表 1-1 数据对比')
    expect(after).toContain('###### 图 2-1 结构图')
  })

  it('中文数字支持 二. / 三 / 十一 / 一百零五 等写法', () => {
    const settings = baseSettings({ numberingMode: 'fromHeading' })

    const cases: [string, string][] = [
      ['## 二. 系统设计', '###### 图 2-1 图'],
      ['## 三 方法论', '###### 图 3-1 图'],
      ['## 十一、附录', '###### 图 11-1 图'],
      ['## 一百零五、附录', '###### 图 105-1 图'],
      ['## 第一章 引言', '###### 图 1-1 图'],
      ['## 第十二节 小结', '###### 图 12-1 图']
    ]

    for (const [heading, expected] of cases) {
      const after = number(`${heading}\n\n###### 图 图\n`, settings)
      expect(after).toContain(expected)
    }
  })

  it('★ "一般性讨论" 这类标题不会被误判成章节编号', () => {
    const before = [
      '## 一般性讨论',
      '',
      '###### 图 部署图',
      ''
    ].join('\n')

    const after = number(before, baseSettings({ numberingMode: 'fromHeading' }))
    expect(after).toContain('###### 图 1 部署图')
    expect(after).not.toContain('图 1-1')
  })
})

describe('updateCaptionNumbering — 含上级标题编号（useHeadingPath）', () => {
  const pathSettings = (over: Partial<CaptionPluginSettings> = {}) =>
    baseSettings({ numberingMode: 'fromHeading', useHeadingPath: true, ...over })

  // 用户给的文档结构：章用中文序号、节/小节用阿拉伯数字
  const doc = [
    '# 一、简介',
    '',
    '## 1 半导体',
    '',
    '### 1.1 在一起',
    '',
    '###### 图 能带甲图',
    '',
    '## 2 简并半导体',
    '',
    '### 2.1 在一起',
    '',
    '###### 图 能带乙图',
    ''
  ].join('\n')

  it('★ 来源级别 = 2 时只算到第 2 级：图 1.2-1', () => {
    const after = number(doc, pathSettings({ sourceHeadingLevel: 2 }))

    expect(after).toContain('###### 图 1.1-1 能带甲图')
    expect(after).toContain('###### 图 1.2-1 能带乙图')
  })

  it('★ 来源级别 = 3 时算到第 3 级：图 1.2.1-1', () => {
    const after = number(doc, pathSettings({ sourceHeadingLevel: 3 }))

    expect(after).toContain('###### 图 1.1.1-1 能带甲图')
    expect(after).toContain('###### 图 1.2.1-1 能带乙图')
  })

  it('开关关闭时仍只取来源级别那一级标题的编号', () => {
    const after = number(doc, baseSettings({
      numberingMode: 'fromHeading',
      sourceHeadingLevel: 2
    }))

    expect(after).toContain('###### 图 1-1 能带甲图')
    expect(after).toContain('###### 图 2-1 能带乙图')
  })

  it('没有编号的上级标题自动跳过该级', () => {
    const before = [
      '# 简介',
      '',
      '## 1 半导体',
      '',
      '###### 图 能带图',
      ''
    ].join('\n')

    expect(number(before, pathSettings({ sourceHeadingLevel: 2 })))
      .toContain('###### 图 1-1 能带图')
  })

  it('前缀变化时各自重新计数，同一前缀内累加', () => {
    const before = [
      '## 1 半导体',
      '',
      '### 1.1 甲',
      '',
      '###### 图 甲图',
      '',
      '###### 图 甲图二',
      '',
      '## 2 器件',
      '',
      '###### 图 器件图',
      ''
    ].join('\n')

    const after = number(before, pathSettings({ sourceHeadingLevel: 2 }))

    expect(after).toContain('###### 图 1-1 甲图')
    expect(after).toContain('###### 图 1-2 甲图二')
    expect(after).toContain('###### 图 2-1 器件图')
  })

  it('没有任何带编号的上级标题时退回单级编号', () => {
    const before = [
      '## 前言',
      '',
      '###### 图 部署图',
      ''
    ].join('\n')

    expect(number(before, pathSettings())).toContain('###### 图 1 部署图')
  })

  it('单级编号模式不受该开关影响', () => {
    const before = '###### 图 部署图\n'
    expect(number(before, pathSettings({ numberingMode: 'single' })))
      .toContain('###### 图 1 部署图')
  })

  it('★ 有 front matter（只写标签）与没有 front matter 的编号结果完全一致', () => {
    const pluginSettings = pathSettings({ sourceHeadingLevel: 2 })

    const run = (text: string): string => {
      const { viewInfo, editor } = buildViewInfo(text)
      const { frontmatter } = buildCache(text)
      const settings = getFrontMatterSettingsOrAlternative(
        { frontmatter } as any,
        pluginSettings
      )
      updateCaptionNumbering(viewInfo, settings)
      return editor.getValue()
    }

    const withoutFm = run(doc)
    const withFm = run('---\ntitle: 我的论文\ncaption numbering: 图\n---\n\n' + doc)

    expect(withFm).toBe('---\ntitle: 我的论文\ncaption numbering: 图\n---\n\n' + withoutFm)
    expect(withoutFm).toContain('###### 图 1.2-1 能带乙图')
  })
})

describe('removeCaptionNumbering', () => {
  it('去掉编号且不抛异常', () => {
    const before = [
      '###### 图 3 系统架构图',
      '',
      '###### 表 1 数据对比',
      ''
    ].join('\n')

    const { viewInfo, editor } = buildViewInfo(before)
    expect(() => removeCaptionNumbering(viewInfo, baseSettings())).not.toThrow()
    expect(editor.getValue()).toBe([
      '###### 图 系统架构图',
      '',
      '###### 表 数据对比',
      ''
    ].join('\n'))
  })
})
