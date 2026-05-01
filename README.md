# AI Live2D Galgame

这是一个基于 Flask 后端和 Live2D 前端展示的 AI 对话系统。它支持加载 Live2D 角色模型，并通过 OpenAI 兼容的 API 与 AI 进行对话，实现类似 Galgame 的互动体验。

## 特性

- **Live2D 互动**：支持加载 `.model3.json` 格式的 Live2D 角色。
- **AI 对话代理**：内置 OpenAI 兼容 API 代理，支持多种大模型后端，保护 API Key 不在前端暴露。
- **角色管理**：支持上传 ZIP 格式的 Live2D 角色包，自动解压和识别模型。
- **表情-动作映射**：可自定义 AI 回复中的表情对应的动作，实现丰富的肢体交互。
- **灵活配置**：支持自定义全局提示词（System Prompt），调整模型参数。

## 快速开始

### 环境要求

- Python 3.8+
- [Live2D Cubism SDK for Web](https://www.live2d.com/sdk/download/web/) (项目已内置基本逻辑，但需确保静态资源加载正常)

### 安装步骤

1. 克隆仓库：
   ```bash
   git clone <repository-url>
   cd <repository-name>
   ```

2. 安装依赖：
   ```bash
   pip install -r requirements.txt
   ```

3. 启动应用：
   ```bash
   python app.py
   ```

4. 访问系统：
   打开浏览器访问 `http://127.0.0.1:5001`。

## 使用说明

1. **API 设置**：在主页设置您的 API 地址和 API Key（支持所有 OpenAI 兼容接口）。
2. **角色上传**：在“角色设置”页面上传 Live2D 角色的 ZIP 压缩包。
3. **映射配置**：设置 AI 返回特定表情时角色应执行的动作。
4. **开始对话**：进入“对话界面”，选择角色并开始 AI 互动。

## 项目结构

- `app.py`: Flask 后端逻辑，处理 API 代理、文件管理和路由。
- `static/`: 包含 CSS、JavaScript 及 Live2D SDK 相关脚本。
- `templates/`: HTML 模板文件。
- `live2d_characters/`: 存放上传的 Live2D 角色模型。
- `emotion_mappings.json`: 存储表情与动作的映射配置。

## 注意事项

- 请确保上传的 Live2D 角色包符合 Cubism 4.x 标准。
- API 代理默认使用 `5001` 端口，如有冲突请在 `app.py` 中修改。

## 许可证

本项目遵循 [MIT License](LICENSE)。
