# AI Live2D Galgame

这是一个基于 Flask 后端和 Live2D 前端展示的 AI 对话系统。通过集成大语言模型（LLM），实现具有情感反馈和肢体动作的 Live2D 角色互动体验。

## 🌟 特性

- **Live2D 交互增强**：支持 Cubism 4.x 模型，利用 PIXI.js 实现高性能渲染。
- **情感动作联动**：AI 能够根据对话内容自动触发对应的 Live2D 表情和动作（通过 `[emotion:xxx]` 标签）。
- **OpenAI 兼容后端**：内置 API 代理，支持所有 OpenAI 兼容接口（如 One API, New API, Claude 等），保护 API Key 安全。
- **沉浸式 UI**：采用 Galgame 风格对话框，支持打字机效果、历史记录查看。
- **高度可定制**：
  - **角色配置**：自定义角色 Persona、世界观设定、开场白。
  - **视觉调整**：支持动态修改模型缩放比例、对话框透明度及自定义背景图片。
  - **映射系统**：通过 `config.yml` 灵活配置特定情感对应的模型动作及索引。
- **会话管理**：支持多会话切换及本地持久化存储。

## 🛠️ 技术栈

- **前端**：HTML5, CSS3, JavaScript (ES6+), [PIXI.js v6](https://pixijs.com/), [pixi-live2d-display](https://github.com/guansss/pixi-live2d-display)
- **后端**：Python 3.8+, Flask, PyYAML
- **AI 接口**：OpenAI Chat Completions API 兼容接口

## 🚀 快速开始

### 1. 克隆项目
```bash
git clone https://github.com/FinnKyo/Live2D-AI-Chat.git
cd Live2D-AI-Chat
```

### 2. 安装依赖
```bash
pip install -r requirements.txt
```

### 3. 准备 Live2D 模型
将您的 Live2D 角色文件夹放入 `live2d_characters/` 目录下。确保每个角色文件夹内包含 `.model3.json` 文件。

### 4. 运行应用
```bash
python app.py
```
默认在 `http://127.0.0.1:5001` 启动。

## ⚙️ 配置说明

### 情感动作映射 (`config.yml`)
在 `config.yml` 中定义 AI 返回的情感标签与 Live2D 模型动作/表情的对应关系：

```yaml
character1:
  happy:
    expression: "happy"     # 对应的表情文件名 (不含 .exp3.json)
    motion: ":25"           # 对应的动作组索引 (group:index)
  angry:
    expression: "angry"
    motion: "Group:0"
```

### 系统设置
在网页端的“设置”面板中：
- **API 设置**：填入您的 API Base URL 和 API Key。
- **角色设置**：选择模型，并填写角色名、性格设定及开场白。
- **提示词设置**：调整全局 System Prompt 以优化 AI 回复风格。

## 📂 项目结构

```text
├── app.py                # Flask 后端服务
├── config.yml            # 情感动作映射配置
├── live2d_characters/    # Live2D 模型存放目录
├── static/
│   ├── css/              # 样式文件
│   └── js/               # 前端核心逻辑 (chat.js, live2d-helper.js)
├── templates/
│   └── chat.html         # 主界面模板
└── requirements.txt      # Python 依赖项
```

## 📝 许可证

本项目遵循 [MIT License](LICENSE)。
