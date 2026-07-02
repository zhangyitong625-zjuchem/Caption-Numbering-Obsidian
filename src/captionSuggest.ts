import { App, Editor, EditorPosition, EditorSuggest, EditorSuggestContext, 
         EditorSuggestTriggerInfo, TFile } from 'obsidian'
import { TagDefinition } from './numbering'

export class CaptionTagSuggest extends EditorSuggest<string> {
  tags: TagDefinition[]

  constructor(app: App, tags: TagDefinition[]) {
    super(app)
    this.tags = tags
  }

  // 判断何时触发下拉菜单
  onTrigger(
    cursor: EditorPosition,      // 当前光标位置
    editor: Editor,              // 编辑器实例
    file: TFile                  // 当前文件
  ): EditorSuggestTriggerInfo | null {
    // 获取当前行从行首到光标处的文本
    const lineText = editor.getLine(cursor.line)
    const cursorCh = cursor.ch
    const textBeforeCursor = lineText.substring(0, cursorCh)

    // ★ 触发条件：当前行以 "###### " 结尾，且后面还没有标签名
    // 例如 "###### " 就触发，"###### 图" 就不触发
    // 注意：必须是 6 个 #（六级标题），1~5 级标题不会触发
    const triggerRegex = /^#{6}\s+$/
    if (triggerRegex.test(textBeforeCursor)) {
      return {
        start: cursor,            // 选择结果的插入起始位置
        end: cursor,              // 结束位置
        query: textBeforeCursor   // 查询内容
      }
    }

    return null  // 不触发
  }

  // 获取下拉列表的内容
  getSuggestions(context: EditorSuggestContext): string[] {
    // 返回所有标签的名称
    return this.tags.map(tag => tag.name)
  }

  // 渲染下拉列表中的每一项
  renderSuggestion(tagName: string, el: HTMLElement): void {
    el.setText(tagName)
  }

  // 用户选择了一个标签后的处理
  selectSuggestion(tagName: string, evt: MouseEvent | KeyboardEvent): void {
    const editor = this.context?.editor
    if (!editor) return

    // 当前光标位置（在 "###### " 的末尾）
    const cursor = editor.getCursor()

    // 插入选中的标签名 + 一个空格，结果如 "###### 图 "
    editor.replaceRange(tagName + ' ', cursor)

    // 把光标移到标签名之后，方便用户继续输入题注内容
    // 例如 "###### 图 ‗"（‗ 表示光标位置）
    editor.setCursor(cursor.line, cursor.ch + tagName.length + 1)
  }
}