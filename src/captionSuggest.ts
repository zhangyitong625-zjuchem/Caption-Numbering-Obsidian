import { App, Editor, EditorPosition, EditorSuggest, EditorSuggestContext,
  EditorSuggestTriggerInfo, TFile } from 'obsidian'
import { TagDefinition } from './settingsTypes'

// ============================================================
// CaptionTagSuggest — 输入 "###### " 时弹出标签下拉菜单
// ============================================================
export class CaptionTagSuggest extends EditorSuggest<string> {
  tags: TagDefinition[]

  constructor (app: App, tags: TagDefinition[]) {
    super(app)
    this.tags = tags
  }

  // 判断何时触发下拉菜单
  onTrigger (
    cursor: EditorPosition,      // 当前光标位置
    editor: Editor,              // 编辑器实例
    file: TFile                  // 当前文件
  ): EditorSuggestTriggerInfo | null {
    // 获取当前行从行首到光标处的文本
    const lineText = editor.getLine(cursor.line)
    const textBeforeCursor = lineText.substring(0, cursor.ch)

    // ★ 触发条件：当前行恰好是 "###### "（六级标题 + 一个空格）
    // 例如 "###### " 就触发，"###### 图" 就不触发
    // 注意：必须是 6 个 #，1~5 级标题不会触发
    const triggerRegex = /^#{6}\s+$/
    if (!triggerRegex.test(textBeforeCursor)) return null

    return {
      start: cursor,   // 下拉选择的替换起点
      end: cursor,     // 替换终点（不替换任何已有文字）
      // 光标后还没有任何输入，因此查询串为空；
      // 不能把整行 "###### " 当作 query，否则会被当成过滤条件
      query: ''
    }
  }

  // 获取下拉列表的内容
  getSuggestions (context: EditorSuggestContext): string[] {
    // 返回所有非空的标签名
    return this.tags
      .map(tag => tag.name.trim())
      .filter(name => name.length > 0)
  }

  // 渲染下拉列表中的每一项
  renderSuggestion (tagName: string, el: HTMLElement): void {
    el.setText(tagName)
  }

  // 用户选择了一个标签后的处理
  selectSuggestion (tagName: string, evt: MouseEvent | KeyboardEvent): void {
    const context = this.context
    if (!context) return

    // 插入选中的标签名 + 一个空格，结果如 "###### 图 "
    context.editor.replaceRange(tagName + ' ', context.start, context.end)

    // 把光标移到标签名之后，方便用户继续输入题注内容
    // 例如 "###### 图 ‗"（‗ 表示光标位置）
    context.editor.setCursor(context.start.line, context.start.ch + tagName.length + 1)
  }
}
