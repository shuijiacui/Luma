# Luma UI Design System

Luma 的视觉语言是“安静的魔法”：以 Apple 式秩序承载 Pixar 式情感。界面应温暖、
清楚、有生命力，但不幼稚，也不过度装饰。

## 色彩

| 角色 | Token | 用途 |
|---|---|---|
| 主背景 | `luma-ivory-50` | 页面底色 |
| 次背景 | `luma-ivory-100` | 区块、柔和分层 |
| 品牌主色 | `luma-teal-600` | 主按钮、重点交互 |
| 深品牌色 | `luma-teal-900` | 标题、高对比文字 |
| 情感点缀 | `luma-gold-300` | 高光、徽标、焦点环 |
| 正文 | `luma-ink` | 主要阅读文字 |
| 辅助文字 | `luma-muted` | 描述和元信息 |

金色只用于小面积点缀，避免大面积金色削弱高级感。青绿色是唯一主操作色。

## 字体

- Brand：`Comfortaa Variable`，用于 Luma 英文字标与少量品牌信息。
- Display：`Noto Serif SC Variable`，用于中文标题、孩子原话和叙事性内容。
- Sans：`Noto Sans SC Variable`，用于正文、导航、表单和按钮。
- `luma-display`：品牌级大标题，48–88px。
- `luma-heading-1`：页面标题，36–64px。
- `luma-heading-2`：区块标题，28–44px。
- `luma-heading-3`：卡片标题，24px。
- `luma-body-lg`：引导正文，18px。
- `luma-body`：标准正文，16px。
- `luma-caption`：辅助信息，13px。
- `luma-eyebrow`：短标签，12px，大写并增加字距。

中文正文不使用全大写 Eyebrow；中文标题减少字距规则由系统字体自然处理。

## Button

- `primary`：页面唯一的主要行动。
- `secondary`：与主行动并列但优先级较低。
- `gold`：带情感或庆祝意味的少量行动。
- `ghost`：导航和低强调操作。
- 尺寸为 `sm`、`md`、`lg`；触控场景优先使用 `md` 或 `lg`。
- 支持 loading、disabled、前后图标与键盘焦点。

## Card

- `surface`：默认白色内容容器。
- `soft`：柔和青绿背景，用于轻量强调。
- `glass`：有空间感的半透明浮层。
- `outline`：低层级分组。
- `interactive` 只用于整张卡片确实可交互的场景。

## Navbar

Navbar 保持半透明米白表面、轻微模糊与低对比阴影。品牌位于左侧，核心导航居中，
行动区位于右侧。移动端暂时隐藏链接，具体业务实现时再接入菜单交互。
默认品牌区域使用统一的 `Brand` 组件，业务可通过 `brand` 属性覆盖。

## 动画

- Instant：160ms，用于微反馈。
- Quick：240ms，用于按钮和小型控件。
- Gentle：420ms，用于卡片、导航和内容进入。
- Expressive：受控弹簧，用于富有生命力的角色或创作反馈。
- 页面进入优先使用 `fadeUp`；聚焦内容使用 `softScale`。
- 列表使用 `staggerContainer`，子项间隔 80ms。
- 位移通常不超过 16px，悬浮不超过 4px，避免喧宾夺主。
- 系统启用“减少动态效果”时，全局自动关闭非必要动画。
