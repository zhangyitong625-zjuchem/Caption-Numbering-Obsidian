# Caption Numbering

> **Automatically number figure/table captions using 6th-level headings (`######`) in Obsidian.**

[中文文档](#caption-numbering-中文文档)

---

## Features

- **Tag-based auto-numbering**: Define custom tags (e.g., `图` / `Figure`, `表` / `Table`, `Algorithm`). Headings starting with `###### 图 xxx` are automatically numbered as `###### 图 1 xxx`, `###### 图 2 xxx`, etc.
- **Custom tag management**: Add, edit, or delete tags in the settings panel. Each tag gets its own independent counter.
- **Chapter prefix numbering（Optional）**: Optionally prepend the chapter number from section headings (e.g., `###### 图 1-1 xxx` when under `## 1 System Overview`).
- **Smart tag suggestion**: Type `###### ` and a dropdown automatically appears to select a tag.
- **Auto-numbering**: Optional timer-based auto-numbering (every 10 seconds) to keep captions up to date.
- **Wikilink cross-reference sync**: When a caption heading is renumbered, all `[[#caption]]` wikilinks pointing to it are automatically updated:
  - `[[#图 1 系统架构]]` → `[[#图 2 系统架构|图 2]]` (target + display text updated)
  - `[[#图 1 系统架构]]` → `[[#图 1 系统架构|图 1]]` (display text auto-added if missing)
- **Front matter support**: Per-document settings via YAML front matter (e.g., `caption numbering: 图, 表, auto`).
- **Remove numbering**: One-click command to strip all caption numbers.

## How to install

### From Obsidian Community Plugins (recommended)

1. Go to **Settings → Community Plugins → Browse**.
2. Search for "Caption Numbering".
3. Click **Install**, then **Enable**.

### Manual installation

1. Download the latest release from the [Releases](https://github.com/your-username/caption-numbering-obsidian/releases) page.
2. Unzip into your vault's `.obsidian/plugins/caption-numbering/` folder.
3. Enable the plugin in **Settings → Community Plugins**.

## How to use

### Basic workflow

1. Open the **Command Palette** (`Cmd/Ctrl + P`).
2. Type one of the following commands:

| Command | Description |
|---------|-------------|
| **Number captions in document** | Auto-number all `######` captions with matching tags |
| **Remove caption numbering** | Strip all numbers from captions |
| **Save settings to front matter** | Write current tag settings to document front matter |

3. You can also assign hotkeys to these commands in **Settings → Hotkeys**.

### Writing captions

There are two ways to create captions:

**Method A — Using the tag suggestion popup:**
1. Type `###### ` (six hash marks + space).
2. A dropdown appears with your configured tags.
3. Select a tag (e.g., `图`).
4. The cursor is placed after the tag, ready for you to type the caption text.
5. Result: `###### 图 系统架构图`

**Method B — Manually:**
```markdown
###### 图 系统架构图
###### 表 数据对比
###### 算法 快速排序
```

### Running numbering

After writing captions, run the **Number captions in document** command. The result:

```markdown
###### 图 1 系统架构图
###### 图 2 流程图
###### 表 1 数据对比
###### 算法 1 快速排序
```

### Chapter prefix numbering

If your document has numbered section headings like:

```markdown
## 1 系统概述
  ###### 图 系统架构图
  ###### 图 流程图
## 2 功能设计
  ###### 图 部署图
```

Enable **"章节前缀"** (Chapter Prefix) in settings. The result:

```markdown
## 1 系统概述
  ###### 图 1-1 系统架构图
  ###### 图 1-2 流程图
## 2 功能设计
  ###### 图 2-1 部署图
```

### Cross-referencing with wikilinks

You can reference captions using Obsidian's built-in wikilink syntax:

```markdown
[[#图 1 系统架构]]
```

After numbering, this automatically becomes:

```markdown
[[#图 1 系统架构|图 1]]
```

If the caption is renumbered, the link updates automatically:

```markdown
[[#图 2 系统架构|图 2]]
```

### Per-document settings via front matter

Add to your document's front matter:

```yaml
---
caption numbering: 图, 表, auto
---
```

This sets the tags to `图` and `表` and enables auto-numbering for this document only.

Available options:
- `图, 表, 算法` — comma-separated tag names
- `auto` — enable auto-numbering
- `off` — disable numbering for this document

## Settings

| Setting | Description |
|---------|-------------|
| **Tags** | Add, edit, or delete caption tags. Each tag gets its own counter. |
| **Numbering Mode** | `Single` — 图 1, 图 2... / `Chapter Prefix` — 图 1-1, 图 1-2... |
| **Source Heading Level** | Which heading level to extract chapter numbers from (1–5) |
| **Heading Level Digits** | How many digits of the heading number to use (e.g., `1` → `1`, `2` → `1.2`) |
| **Number Separator** | Separator between chapter prefix and sequence number (e.g., `-`, `.`, `:`) |
| **Auto-numbering** | Toggle automatic numbering every 10 seconds |

## Development

```bash
# Install dependencies
npm install

# Build for development (watch mode)
npm run dev

# Build for production
npm run build

# Run tests
npm test
```

## License

MIT

