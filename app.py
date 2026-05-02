"""
AI Live2D Galgame - Flask 后端
提供页面路由、OpenAI 兼容 API 代理、Live2D 角色管理
支持表情-动作映射配置
"""
import os
import json
import yaml
import urllib.request
import urllib.error
from flask import Flask, render_template, request, jsonify, send_from_directory, abort

app = Flask(__name__)

# ============================================================
# Live2D 角色目录配置
# ============================================================
# 角色文件存放目录
CHARACTERS_DIR = os.path.join(app.root_path, "live2d_characters")
os.makedirs(CHARACTERS_DIR, exist_ok=True)

# 表情-动作映射配置文件
MAPPING_FILE = os.path.join(app.root_path, "config.yml")


def get_all_characters():
    """获取所有可用角色列表"""
    characters = []

    # 遍历角色目录
    if os.path.isdir(CHARACTERS_DIR):
        for name in sorted(os.listdir(CHARACTERS_DIR)):
            char_dir = os.path.join(CHARACTERS_DIR, name)
            if not os.path.isdir(char_dir):
                continue
            model_json = find_model_json(char_dir)
            if model_json:
                characters.append({
                    "id": name,
                    "name": name,
                    "path": char_dir,
                    "model_json": model_json,
                    "builtin": True,
                })

    return characters


def find_model_json(directory):
    """在目录中查找 .model3.json 文件"""
    return next((f for f in os.listdir(directory) if f.endswith(".model3.json")), None)


def find_thumbnail(directory):
    """在目录中查找缩略图"""
    return next((f for f in os.listdir(directory) if "thumbnail" in f.lower() and f.endswith(".png")), None)


def load_mappings():
    """加载表情-动作映射配置"""
    if os.path.exists(MAPPING_FILE):
        with open(MAPPING_FILE, "r", encoding="utf-8") as f:
            try:
                return yaml.safe_load(f) or {}
            except yaml.YAMLError:
                return {}
    return {}


# ============================================================
# 表情-动作映射 API
# ============================================================
@app.route("/api/mappings/<char_id>", methods=["GET"])
def api_get_mappings(char_id):
    """获取指定角色的表情-动作映射"""
    mappings = load_mappings()
    char_mappings = mappings.get(char_id, {})
    return jsonify(char_mappings)


@app.route("/api/characters", methods=["GET"])
def api_characters():
    """获取所有角色及其模型路径的列表"""
    characters = get_all_characters()
    results = []
    for char in characters:
        char_id = char["id"]
        model_json = char["model_json"]
        thumbnail = find_thumbnail(char["path"])

        results.append({
            "id": char_id,
            "name": char["name"],
            "model_url": f"/live2d_characters/{char_id}/{model_json}",
            "thumbnail": f"/live2d_characters/{char_id}/{thumbnail}" if thumbnail else None,
        })
    return jsonify(results)


@app.route("/live2d_characters/<path:filename>")
def serve_character_files(filename):
    """为 Live2D 模型文件提供静态资源路由"""
    return send_from_directory(CHARACTERS_DIR, filename)


# ============================================================
# AI API 代理
# ============================================================
@app.route("/api/chat", methods=["POST"])
def api_chat():
    """
    代理转发 AI API 请求到 OpenAI 兼容接口
    避免在前端暴露 API Key
    """
    data = request.json
    api_url = data.get("api_url", "").rstrip("/")
    api_key = data.get("api_key", "")
    model = data.get("model", "gpt-3.5-turbo")
    messages = data.get("messages", [])
    temperature = data.get("temperature", 1.0)
    max_tokens = data.get("max_tokens", 3000)
    top_p = data.get("top_p", 1.0)
    frequency_penalty = data.get("frequency_penalty", 0.0)
    presence_penalty = data.get("presence_penalty", 0.0)
    n = data.get("n", 1)

    if not api_url or not api_key:
        return jsonify({"error": "请先设置 API 地址和 Key"}), 400

    try:
        # 确保 URL 格式正确
        endpoint = f"{api_url}/v1/chat/completions"
        if "/v1/v1/" in endpoint:
            endpoint = f"{api_url}/chat/completions"

        payload = json.dumps({
            "model": model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "top_p": top_p,
            "frequency_penalty": frequency_penalty,
            "presence_penalty": presence_penalty,
            "n": n,
        }).encode("utf-8")

        req = urllib.request.Request(
            endpoint,
            data=payload,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            method="POST",
        )

        with urllib.request.urlopen(req, timeout=60) as resp:
            result = json.loads(resp.read().decode("utf-8"))
            return jsonify(result)

    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        return jsonify({
            "error": f"API 返回错误: {e.code}",
            "detail": body,
        }), e.code
    except urllib.error.URLError as e:
        return jsonify({"error": f"无法连接到 API 服务器: {e.reason}"}), 502
    except TimeoutError:
        return jsonify({"error": "API 请求超时，请检查网络连接"}), 504
    except Exception as e:
        return jsonify({"error": f"请求失败: {str(e)}"}), 500


@app.route("/api/models", methods=["POST"])
def api_models():
    """获取可用模型列表"""
    data = request.json
    api_url = data.get("api_url", "").rstrip("/")
    api_key = data.get("api_key", "")

    if not api_url or not api_key:
        return jsonify({"error": "请先设置 API 地址和 Key"}), 400

    try:
        endpoint = f"{api_url}/v1/models"
        if "/v1/v1/" in endpoint:
            endpoint = f"{api_url}/models"

        req = urllib.request.Request(
            endpoint,
            headers={"Authorization": f"Bearer {api_key}"},
            method="GET",
        )

        with urllib.request.urlopen(req, timeout=15) as resp:
            result = json.loads(resp.read().decode("utf-8"))
            return jsonify(result)

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/", methods=["GET"])
def index():
    """主页路由"""
    return render_template("chat.html")


if __name__ == "__main__":
    app.run(debug=True, port=5001, use_reloader=False)
