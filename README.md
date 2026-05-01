# AI Live2D Galgame

一个基于 Flask 和 Live2D 的 AI 对话系统，旨在打造沉浸式的 Galgame 式 AI 互动体验。


## 🌟 特性

- **沉浸式 Galgame 体验**：精美的对话框设计，支持背景切换，模拟真实的视觉小说互动。
- **Live2D 模型集成**：支持加载 .model3.json 格式的 Live2D 角色，拥有生动的动作和表情。
- **情感联动系统**：AI 的回答会根据内容自动匹配角色的动作和表情（基于自定义映射配置）。
- **角色管理**：支持在线上传 ZIP 压缩包添加新角色，支持模型预览和映射配置。
- **多模型支持**：兼容所有 OpenAI 格式的 API。

## 🚀 快速开始


### 1. 环境配置
建议使用 Python 3.9+。

```bash
# 创建虚拟环境
python -m venv .venv
source .venv/bin/activate  # macOS/Linux
# .venv\Scripts\activate  # Windows

# 安装依赖
pip install -r requirements.txt
```

### 2. 运行应用
```bash
python app.py
```
访问 `http://127.0.0.1:5001` 即可开始体验。

## 🛠️ 使用指南

### API 设置
在首页（API 设置）输入您的 API URL 和 API Key。支持自定义模型选择和参数调整（Temperature, Max Tokens 等）。

### 角色管理
1. 切换到“角色设置”页面。
2. 上传包含 Live2D 模型的 ZIP 压缩包（确保包内直接或在子目录下有 `.model3.json` 文件）。
3. 在页面上为不同的关键词配置对应的“表情”和“动作”。

### 开始对话
进入“对话”界面，点击底部的对话框即可与您的 AI 角色开始互动。角色会根据对话内容展现不同的神态和动作。

## 📂 项目结构

- `app.py`: Flask 后端逻辑，包含 API 转发和文件管理。
- `live2d_characters/`: 存放上传的 Live2D 角色文件。
- `static/`: 前端静态资源（JS, CSS）。
  - `js/live2d-helper.js`: Live2D 加载与控制逻辑。
  - `js/chat.js`: 对话逻辑与情感解析。
- `templates/`: HTML 模板页面。
- `emotion_mappings.json`: 存储角色表情与动作的映射配置。

## 🔧 技术栈

- **后端**: Python, Flask
- **前端**: HTML5, CSS3, JavaScript (Vanilla JS)
- **动画**: Live2D Cubism SDK
- **AI 接口**: OpenAI API 兼容协议

