// ============================================================
// main.ts — 题注插件的入口文件
//
// 功能：
//   1. 注册"编号题注""移除编号""保存设置到 front matter"三个命令
//   2. 提供设置面板，让用户管理标签类型（增/删/改）与编号模式
//   3. 可选的自动编号（每隔 10 秒检查当前笔记一次）
//   4. 输入 ###### 时弹出下拉菜单选择标签（通过 EditorSuggest）
//   5. 可选的题注/图片/表格居中对齐（通过 body 上的 CSS 类）
// ============================================================
import { App, Plugin, PluginSettingTab, Setting } from 'obsidian'
import { getViewInfo, isViewActive } from './activeViewHelpers'
import { getFrontMatterSettingsOrAlternative, saveSettingsToFrontMatter } from './frontMatter'
import { updateCaptionNumbering, removeCaptionNumbering } from './numbering'
import { CaptionPluginSettings, DEFAULT_CAPTION_SETTINGS } from './settingsTypes'
import { CaptionTagSuggest } from './captionSuggest'

// ============================================================
// 设置选项卡
// ============================================================
class CaptionPluginSettingTab extends PluginSettingTab {
  plugin: CaptionPlugin

  constructor(app: App, plugin: CaptionPlugin) {
    super(app, plugin)
    this.plugin = plugin
  }

  display(): void {
    const { containerEl } = this
    containerEl.empty()

    new Setting(containerEl).setName('题注自动编号 - 设置').setHeading()

    containerEl.createEl('div', {
      text: '在文档中使用 ###### 加上标签名来创建题注。例如 "###### 图 系统架构图"，插件会自动编号为 "###### 图 1 系统架构图"。'
    })

    containerEl.createEl('br', {})

    containerEl.createEl('div', {
      text: '你也可以为每个文档单独设置标签。在文档的 front matter 中添加：'
    })

    containerEl.createEl('pre', {
      text: `---
caption numbering: 图, 表, auto
---`
    })

    containerEl.createEl('br', {})

    // ---- 标签管理区域标题 ----
    new Setting(containerEl).setName('标签类型管理').setHeading()

    // ---- 添加标签按钮 ----
    new Setting(containerEl)
      .setName('添加新标签')
      .setDesc('添加一个新的题注标签，例如 "图"、"表"、"算法"、"代码" 等')
      .addButton(button => button
        .setButtonText('+ 添加标签')
        .setCta()  // 使用强调色（蓝色按钮）
        .onClick(async () => {
          this.plugin.settings.tags.push({ name: '' })
          await this.plugin.saveSettings()
          this.display()  // 刷新面板
        }))

    // ---- 已有标签列表 ----
    for (let i = 0; i < this.plugin.settings.tags.length; i++) {
      const tag = this.plugin.settings.tags[i]

      const setting = new Setting(containerEl)
        .setName(`标签 #${i + 1}`)

      // 标签名输入框
      setting.addText(text => text
        .setValue(tag.name)
        .setPlaceholder('输入标签名，如 图')
        .onChange(async (value) => {
          this.plugin.settings.tags[i].name = value
          await this.plugin.saveSettings()
        }))

      // 删除按钮
      setting.addButton(button => button
        .setButtonText('✕')
        .setTooltip('删除此标签')
        .onClick(async () => {
          this.plugin.settings.tags.splice(i, 1)
          await this.plugin.saveSettings()
          this.display()  // 刷新面板
        }))
    }

    containerEl.createEl('br', {})

    // ---- 编号模式选择 ----
    new Setting(containerEl).setName('编号格式设置').setHeading()

    new Setting(containerEl)
      .setName('编号模式')
      .setDesc('选择题注的编号方式。\n单级编号：图 1, 图 2, 图 3...\n章节前缀：图 1-1, 图 1.1-1...（从指定级别标题提取已有编号作为前缀）')
      .addDropdown(dropdown => dropdown
        .addOption('single', '单级编号（图 1, 图 2…）')
        .addOption('fromHeading', '章节前缀（图 1-1, 图 1-2…）')
        .setValue(this.plugin.settings.numberingMode)
        .onChange(async (value) => {
          this.plugin.settings.numberingMode = value as 'single' | 'fromHeading'
          await this.plugin.saveSettings()
          this.display()  // 刷新以条件显示后续控件
        }))

    // ---- 仅 "章节前缀" 模式下显示的额外设置 ----
    if (this.plugin.settings.numberingMode === 'fromHeading') {
      // ---- 含上级标题编号开关 ----
      new Setting(containerEl)
        .setName('含上级标题编号')
        .setDesc('开启后，把「标题来源级别」及其以上各级标题的编号用 "." 连成前缀。例如来源级别选 2 时，"# 一、简介" / "## 2 简并半导体" 下的题注写成 "图 1.2-1"；选 3 时同一份文档写成 "图 1.2.1-1"。关闭则只取来源级别那一级标题的编号（"图 2-1"）。没有编号的上级标题自动跳过。')
        .addToggle(toggle => toggle
          .setValue(this.plugin.settings.useHeadingPath)
          .setTooltip('启用含上级标题编号')
          .onChange(async (value) => {
            this.plugin.settings.useHeadingPath = value
            await this.plugin.saveSettings()
            this.display()  // 刷新以条件显示后续控件
          }))

      new Setting(containerEl)
        .setName('标题来源级别')
        .setDesc('在哪一级标题上取编号？例如选 "2"，则从 H2 标题（如 "## 1 系统概述"、"## 2. 功能设计"、"## 一、绪论"）中取编号；同时决定编号前缀算到第几级')
        .addSlider(slider => slider
          .setLimits(1, 5, 1)
          .setValue(this.plugin.settings.sourceHeadingLevel)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.sourceHeadingLevel = value
            await this.plugin.saveSettings()
          }))

      // 「含上级标题编号」模式下每一级都参与编号，此项不再生效
      if (!this.plugin.settings.useHeadingPath) {
        new Setting(containerEl)
          .setName('标题编号级数')
          .setDesc('提取标题编号的前几级？例如标题 "1.2.3"，选 "1" 得到 "1"，选 "2" 得到 "1.2"')
          .addSlider(slider => slider
            .setLimits(1, 4, 1)
            .setValue(this.plugin.settings.headingLevelsToUse)
            .setDynamicTooltip()
            .onChange(async (value) => {
              this.plugin.settings.headingLevelsToUse = value
              await this.plugin.saveSettings()
            }))
      }

      new Setting(containerEl)
        .setName('编号分隔符')
        .setDesc('前缀与序号之间的分隔符。例如 "-" → "图 1-1"，"." → "图 1.1"，":" → "图 1:1"')
        .addText(text => text
          .setValue(this.plugin.settings.twoLevelSeparator)
          .onChange(async (value) => {
            this.plugin.settings.twoLevelSeparator = value
            await this.plugin.saveSettings()
          }))
    }

    containerEl.createEl('br', {})

    // ---- 自动编号开关 ----
    new Setting(containerEl)
      .setName('自动编号')
      .setDesc('开启后，插件会每隔 10 秒自动检查并更新题注编号')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.auto)
        .setTooltip('启用自动编号')
        .onChange(async (value) => {
          this.plugin.settings.auto = value
          await this.plugin.saveSettings()
        }))

    containerEl.createEl('br', {})

    // ---- 居中对齐开关 ----
    new Setting(containerEl)
      .setName('居中对齐题注')
      .setDesc('让六级标题（题注）及其对应的图片、表格在阅读视图中居中对齐')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.centerCaptions)
        .setTooltip('启用居中对齐')
        .onChange(async (value) => {
          this.plugin.settings.centerCaptions = value
          await this.plugin.saveSettings()
          // 立即切换 body 类，无需重新加载
          document.body.classList.toggle('caption-numbering-centered', value)
        }))

    containerEl.createEl('div', {
      text: '💡 CSS 优先级说明：主题自定义样式 > 插件样式 > Obsidian 默认样式。如果你在主题中自定义了 h6 / img / table 的样式，插件居中样式可能被覆盖。',
      attr: { style: 'font-size: 0.85em; color: var(--text-muted); margin-top: 8px;' }
    })
  }
}

// ============================================================
// 插件主类
// ============================================================
export default class CaptionPlugin extends Plugin {
  settings!: CaptionPluginSettings

  async onload(): Promise<void> {
    await this.loadSettings()

    // ---- 恢复居中样式（body 类只在切换开关时设置，重启后会丢失） ----
    document.body.classList.toggle('caption-numbering-centered', this.settings.centerCaptions)

    // ---- 命令 1：编号题注 ----
    this.addCommand({
      id: 'number-captions',
      name: '编号文档中所有图/表题注',
      checkCallback: (checking: boolean) => {
        if (checking) return isViewActive(this.app)

        this.numberActiveDocument(false)
        return true
      }
    })

    // ---- 命令 2：移除编号 ----
    this.addCommand({
      id: 'remove-numbering-of-captions',
      name: '移除文档中所有题注编号',
      checkCallback: (checking: boolean) => {
        if (checking) return isViewActive(this.app)

        const viewInfo = getViewInfo(this.app)
        if (viewInfo) {
          // 与编号命令保持一致：使用该文档实际生效的（front matter 合并后的）设置
          const settings = getFrontMatterSettingsOrAlternative(viewInfo.data, this.settings)
          removeCaptionNumbering(viewInfo, settings)
        }

        return true
      }
    })

    // ---- 命令 3：保存设置到 front matter ----
    this.addCommand({
      id: 'save-caption-settings-to-front-matter',
      name: '将当前标签设置保存到文档 front matter',
      checkCallback: (checking: boolean) => {
        if (checking) return isViewActive(this.app)

        const viewInfo = getViewInfo(this.app)
        const file = this.app.workspace.getActiveFile()
        if (viewInfo && file) {
          const settings = getFrontMatterSettingsOrAlternative(viewInfo.data, this.settings)
          saveSettingsToFrontMatter(this.app.fileManager, file, settings)
        }

        return true
      }
    })

    // ---- 注册设置面板 ----
    this.addSettingTab(new CaptionPluginSettingTab(this.app, this))

    // ---- 自动编号定时器（每 10 秒） ----
    this.registerInterval(window.setInterval(() => {
      this.numberActiveDocument(true)
    }, 10 * 1000))

    // ---- 注册输入建议（输入 ###### 时弹出标签选择） ----
    this.registerEditorSuggest(new CaptionTagSuggest(this.app, this.settings.tags))
  }

  /**
   * 对当前活动笔记执行一次题注编号
   *
   * 命令与定时器共用这段逻辑：先解析出该文档实际生效的设置
   * （front matter 优先），再判断是否被关闭 / 是否开启自动编号。
   *
   * @param onlyWhenAuto 为 true 时，只有开启了自动编号才执行（供定时器使用）
   */
  private numberActiveDocument (onlyWhenAuto: boolean): void {
    const viewInfo = getViewInfo(this.app)
    if (!viewInfo) return

    const settings = getFrontMatterSettingsOrAlternative(viewInfo.data, this.settings)

    if (settings.off) return
    if (onlyWhenAuto && !settings.auto) return

    updateCaptionNumbering(viewInfo, settings)
  }

  async loadSettings(): Promise<void> {
    const loadedData = (await this.loadData()) as Partial<CaptionPluginSettings> | undefined
    this.settings = Object.assign({}, DEFAULT_CAPTION_SETTINGS, loadedData)
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings)
  }

  onunload(): void {
    // 卸载时移除 body 类，避免残留样式
    document.body.classList.remove('caption-numbering-centered')
  }
}
