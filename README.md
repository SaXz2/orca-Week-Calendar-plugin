# Orca Week Calendar Plugin

一个用于Orca Note的周记插件，点击日历中的周号可以快速创建和打开周记页面。

## 功能特性

- 📅 点击日历中的周号创建/打开周记页面
- 🏷️ 自动为周记页面添加"周记"标签
- 🌍 支持多语言（中文/英文）
- 🎨 自定义周号样式，支持悬停和激活状态
- ⚡ 自动检测页面是否存在，避免重复创建

## 使用方法

1. 在Orca Note的日历侧边栏中找到周号（如 40、41、42 等）
2. 点击任意周号
3. 插件会自动：
   - 创建格式为"2025年-41周"的页面（如果不存在）
   - 添加"周记"标签
   - 在当前面板中打开该页面

## 安装

1. 将插件文件夹复制到 Orca Note 的 `plugins` 目录
2. 在 Orca Note 的设置中启用插件

## 开发

```bash
# 安装依赖
npm install

# 开发模式
npm run dev

# 构建
npm run build
```

## 项目结构

```
orca-week-calendar/
├── src/
│   ├── main.ts              # 主逻辑
│   ├── styles/
│   │   └── calendar.css     # 日历样式
│   ├── translations/
│   │   ├── zhCN.ts          # 中文翻译
│   │   └── enUS.ts          # 英文翻译
│   └── libs/
│       └── l10n.ts          # 国际化工具
├── dist/
│   └── index.js             # 编译后的插件文件
└── package.json
```

## API文档

更多 API 文档请查看 [plugin-docs](./plugin-docs) 文件夹。
