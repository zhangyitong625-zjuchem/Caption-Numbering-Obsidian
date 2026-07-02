// ============================================================
// messages.ts — 编号完成后显示提示对话框
//
// 让用户选择是否将当前标签设置保存到文档的 front matter
// ============================================================
import { App, Modal } from 'obsidian'
import { saveSettingsToFrontMatter } from './frontMatter'
import { CaptionPluginSettings } from './numbering'

export interface NumberingDoneConfig {
  message: string
  preformattedMessage: string
  saveSettingsCallback: (shouldAddAutoFlag: boolean) => void
}

class NumberingDoneModal extends Modal {
  config: NumberingDoneConfig

  constructor(app: App, config: NumberingDoneConfig) {
    super(app)
    this.config = config
  }

  onOpen(): void {
    const { contentEl, titleEl } = this
    titleEl.setText('题注编号 - 完成')

    contentEl.createEl('div', { text: this.config.message })
    contentEl.createEl('pre', { text: this.config.preformattedMessage })

    contentEl.createEl('div', {
      text: "是否将这些设置保存到文档的 front matter 中？",
      cls: 'caption-numbering-question'
    })

    const containerForButtons = contentEl.createEl('div', { cls: 'caption-numbering-button-container' })

    const noButton = containerForButtons.createEl('button', {})
    noButton.setText('不保存')
    noButton.onClickEvent((ev: MouseEvent) => {
      this.close()
      return ev
    })

    const yesButton = containerForButtons.createEl('button', {})
    yesButton.setText('保存到文档')
    yesButton.onClickEvent((ev: MouseEvent) => {
      this.config.saveSettingsCallback(false)
      this.close()
      return ev
    })

    const yesAndAutoButton = containerForButtons.createEl('button', {})
    yesAndAutoButton.setText('保存并启用自动编号')
    yesAndAutoButton.onClickEvent((ev: MouseEvent) => {
      this.config.saveSettingsCallback(true)
      this.close()
      return ev
    })
  }

  onClose(): void {
    const { contentEl, titleEl } = this
    contentEl.empty()
    titleEl.empty()
  }
}

/**
 * 显示编号完成对话框
 *
 * @param app      Obsidian App 实例
 * @param settings 当前的题注设置
 */
export function showNumberingDoneMessage(
  app: App,
  settings: CaptionPluginSettings
): void {
  const saveSettingsCallback = (shouldAddAutoFlag: boolean): void => {
    const tweakedSettings: CaptionPluginSettings = {
      ...settings,
      auto: shouldAddAutoFlag ? true : settings.auto
    }
    const file = app.workspace.getActiveFile()
    if (file) {
      saveSettingsToFrontMatter(app.fileManager, file, tweakedSettings)
    }
  }

  // 生成标签信息文本
  const tagInfoLines = settings.tags
    .filter(t => t.name.trim().length > 0)
    .map(t => `  ${t.name}: 当前计数 = ${t.counter}`)

  const config: NumberingDoneConfig = {
    message: '已成功更新文档中的所有题注编号。在设置面板中可以修改标签类型。',
    preformattedMessage: `标签列表:
${tagInfoLines.join('\n')}
自动编号: ${settings.auto ? '开' : '关'}
状态: ${settings.off ? '已关闭' : '启用中'}`,
    saveSettingsCallback
  }

  const leaf = app.workspace.activeLeaf
  if (leaf) {
    new NumberingDoneModal(app, config).open()
  }
}