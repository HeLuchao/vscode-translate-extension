# English to Arabic Translator VSCode 扩展

一个用于将英文文本翻译成阿拉伯语的 VSCode 扩展，同时支持提取并翻译代码中的 i18n `$t` 标记。

## 功能特点

### 1. 翻译选中文本
- 在编辑器中选中文本，右键选择"翻译为阿拉伯语"
- 或使用命令面板（Ctrl+Shift+P）输入"翻译为阿拉伯语"

### 2. 提取并翻译 i18n 标记
- 在文件资源管理器中右键点击文件，选择"提取并翻译$t标记"
- 在编辑器中右键选择"提取并翻译$t标记"
- 自动提取文件中的 `$t('key')` 格式的标记
- 生成英文和阿拉伯语的翻译文件
- 支持嵌套的翻译 key（如 `common.button.submit`）

## 安装

1. 在 VS Code 中打开扩展面板（Ctrl+Shift+X）
2. 搜索 "English to Arabic Translator"
3. 点击安装

## 使用方法

### 翻译选中文本
1. 在编辑器中选中要翻译的英文文本
2. 右键点击，选择"翻译为阿拉伯语"
3. 选中的文本将被替换为阿拉伯语翻译

### 提取并翻译 i18n 标记
1. 在文件资源管理器中右键点击要处理的文件
2. 选择"提取并翻译$t标记"
3. 输入英文翻译文件的输出路径（例如：./locales/en.json）
4. 输入阿拉伯语翻译文件的输出路径（例如：./locales/ar.json）
5. 扩展将自动：
   - 提取所有 `$t()` 标记
   - 生成英文翻译文件
   - 翻译并生成阿拉伯语翻译文件
   - 保持已有的翻译内容不变

## 特性

- 自动格式化翻译 key 为可读的英文文本
- 支持增量更新翻译文件
- 保留现有翻译内容
- 支持嵌套的翻译结构
- 实时翻译进度显示
- 详细的翻译完成统计

## 配置要求

- VS Code 版本: ^1.95.0
- Node.js

## 开发

1. 克隆仓库
bash
git clone https://github.com/HeLuchao/vscode-translate-extension.git
```

2. 安装依赖
```bash
npm install
```
3. 编译
```bash
npm run compile
```

4. 运行/调试
- 在 VS Code 中按 F5 启动调试
- 在新窗口中测试扩展功能

## 许可证

MIT

## 问题反馈

如果你发现任何问题或有功能建议，欢迎在 [GitHub Issues](https://github.com/HeLuchao/vscode-translate-extension/issues) 提出。

## 作者

[HeLuchao](https://github.com/HeLuchao)