# AI-Live2D-Galgame

这是一个基于 **Flask** 和 **Live2D** 的 AI 角色对话互动系统。它将大语言模型（LLM）的强大对话能力与 Live2D 角色的生动表现力相结合，为您提供类似 Galgame（视觉小说）的沉浸式互动体验。

## 🌟 核心特性

- **🎭 沉浸式 Live2D 互动**：支持加载 `.model3.json` 格式的 Live2D 角色，具备呼吸、视线追踪（跟随鼠标）及动态动作触发。
- **🧠 情感联动系统**：AI 的回复会自动携带情感标签（如 `[emotion:happy]`），前端解析后实时触发角色对应的 **表情（Expression）** 和 **动作（Motion）**。
- **🔒 安全 API 代理**：通过 Flask 后端中转 AI 请求，有效隐藏 API Key，支持所有 OpenAI 兼容格式的接口（如 DeepSeek, GPT-4, Claude 等）。
- **📖 深度角色设定**：支持自定义角色性格（Persona）、世界观背景（Scenario）、对话开场白以及 Author's Note（深度指令），让 AI 完美扮演指定角色。
- **💾 会话记录管理**：支持多会话管理，所有对话历史自动保存至浏览器本地存储，可随时切换或删除。
- **📱 响应式 Galgame 界面**：
  - 经典的对话框设计，支持**打字机效果**。
  - 可调节的对话框透明度与自定义背景图片。
  - 模型大小可动态调节，支持拖拽位移。

## 🛠️ 技术栈

- **后端**：Python 3.x, Flask, PyYAML
- **前端**：Vanilla JS, CSS3, HTML5
- **渲染引擎**：[PixiJS v6](https://pixijs.com/), [pixi-live2d-display](https://github.com/guansss/pixi-live2d-display)
- **Live2D 支持**：Cubism 4.x

## 🚀 快速开始

### 1. 克隆项目
```bash
git clone https://github.com/FinnKyo/Live2D-AI-Chat.git
cd AI-Live2D-Galgame
```

### 2. 安装依赖
建议使用虚拟环境：
```bash
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

### 3. 配置角色与映射
- 将您的 Live2D 角色文件夹放入 `live2d_characters/` 目录下。
- 在 `config.yml` 中配置情感标签与模型动作的对应关系（详见下方“配置说明”）。

### 4. 运行应用
```bash
python app.py
```
默认运行在 `http://127.0.0.1:5001`。

## ⚙️ 配置说明

### 情感-动作映射 (`config.yml`)
该文件定义了 AI 输出的标签如何映射到 Live2D 模型的具体动作。

```yaml
character1:
  happy:
    expression: "happy"              # 模型表情文件名
    motion: "[FIXED]Mgirl07_keai_a"   # 动作组名称或动作文件名       
```

### 角色目录结构
每个角色应在 `live2d_characters` 下有独立文件夹：
```
live2d_characters/
└── character_name/
    ├── character_name.model3.json  # 必须
    ├── expressions/
    ├── motions/
    └── textures/
```

## 🎮 使用指南

1. **设置 API**：点击界面右上角的 ⚙️ 图标，进入 API 选项卡，填写您的 API 地址（如 `https://api.deepseek.com`）和 Key。
2. **设定角色**：在“提示词”选项卡中设置角色名字、性格设定及开场白。
3. **开始对话**：在对话框输入内容，AI 将根据您的输入进行角色扮演，并自动触发 Live2D 动作。
4. **历史记录**：点击 📜 图标可查看过往对话，或开启新的故事线。

## 📝 许可证

本项目采用 MIT 许可证。Live2D 模型文件的版权归原作者所有，本项目仅供技术研究与学习使用。
