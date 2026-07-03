// ============================================================
// main.ts — 题注插件的入口文件
//
// 功能：
//   1. 注册"编号题注"和"移除编号"两个命令
//   2. 提供设置面板，让用户管理标签类型（增/删/改）
//   3. 支持自动编号（每隔 10 秒检查一次）
//   4. 输入 ###### 时弹出下拉菜单选择标签（通过 EditorSuggest）
// ============================================================
import { App, Plugin, PluginSettingTab, Setting } from 'obsidian'
import { getViewInfo, isViewActive } from './activeViewHelpers'
import { getFrontMatterSettingsOrAlternative, saveSettingsToFrontMatter } from './frontMatter'
import { updateCaptionNumbering, removeCaptionNumbering, CaptionPluginSettings } from './numbering'
import { DEFAULT_CAPTION_SETTINGS } from './settingsTypes'
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
          this.plugin.settings.tags.push({ name: '', counter: 0 })
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
      new Setting(containerEl)
        .setName('标题来源级别')
        .setDesc('从第几级标题提取编号作为前缀？例如选 "2"，则从 H2 标题（如 ## 1 系统概述）中提取编号')
        .addSlider(slider => slider
          .setLimits(1, 5, 1)
          .setValue(this.plugin.settings.sourceHeadingLevel)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.sourceHeadingLevel = value
            await this.plugin.saveSettings()
          }))

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
  }
}

// ============================================================
// 插件主类
// ============================================================
export default class CaptionPlugin extends Plugin {
  settings!: CaptionPluginSettings

  async onload(): Promise<void> {
    await this.loadSettings()

    // ---- 命令 1：编号题注 ----
    this.addCommand({
      id: 'number-captions',
      name: '编号文档中所有图/表题注',
      checkCallback: (checking: boolean) => {
        if (checking) return isViewActive(this.app)

        const viewInfo = getViewInfo(this.app)
        if (viewInfo) {
          const settings = getFrontMatterSettingsOrAlternative(viewInfo.data, this.settings)
          if (settings.off) return false

          updateCaptionNumbering(viewInfo, settings)
        }

        return false
      }
    })

    // ---- 命令 2：移除编号 ----
    this.addCommand({
      id: 'remove-caption-numbering',
      name: '移除文档中所有题注编号',
      checkCallback: (checking: boolean) => {
        if (checking) return isViewActive(this.app)

        const viewInfo = getViewInfo(this.app)
        if (viewInfo) {
          removeCaptionNumbering(viewInfo, this.settings)
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

        return false
      }
    })

    // ---- 注册设置面板 ----
    this.addSettingTab(new CaptionPluginSettingTab(this.app, this))

    // ---- 自动编号定时器（每 10 秒） ----
    this.registerInterval(window.setInterval(() => {
      const viewInfo = getViewInfo(this.app)
      if (viewInfo) {
        const settings = getFrontMatterSettingsOrAlternative(viewInfo.data, this.settings)

        if (settings.off) return

        if (settings.auto) {
          updateCaptionNumbering(viewInfo, settings)
        }
      }
    }, 10 * 1000))

    // ---- 注册输入建议（输入 ###### 时弹出标签选择） ----
    // 由于 CaptionTagSuggest 需要从外部文件导入，
    // 用户新建 captionSuggest.ts 后，在这里取消注释即可启用
    this.registerEditorSuggest(new CaptionTagSuggest(this.app, this.settings.tags))
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_CAPTION_SETTINGS, await this.loadData())
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings)
  }
}