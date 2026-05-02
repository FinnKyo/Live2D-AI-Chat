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
    for f in os.listdir(directory):
        if f.endswith(".model3.json"):
            return f
    return None


def find_thumbnail(directory):
    """在目录中查找缩略图"""
    for f in os.listdir(directory):
        if "thumbnail" in f.lower() and f.endswith(".png"):
            return f
    return None


def get_character_dir(char_id):
    """获取角色目录路径"""
    char_dir = os.path.join(CHARACTERS_DIR, char_id)
    if os.path.isdir(char_dir):
        return char_dir
    return None


def load_mappings():
    """加载表情-动作映射配置"""
    if os.path.exists(MAPPING_FILE):
        with open(MAPPING_FILE, "r", encoding="utf-8") as f:
            try:
                return yaml.safe_load(f) or {}
            except yaml.YAMLError:
                return {}
    return {}


def save_mappings(data):
    """保存表情-动作映射配置"""
    with open(MAPPING_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


# ============================================================
# 页面路由
# ============================================================
@app.route("/")
def index():
    """主页 - 直接进入对话界面"""
    return render_template("chat.html")


# ============================================================
# Live2D 角色文件服务
# ============================================================
@app.route("/live2d/<char_id>/<path:filename>")
def serve_live2d(char_id, filename):
    """提供 Live2D 角色文件（从对应角色目录）"""
    char_dir = get_character_dir(char_id)
    if not char_dir:
        abort(404)
    # 安全检查：防止路径遍历
    full_path = os.path.normpath(os.path.join(char_dir, filename))
    if not full_path.startswith(os.path.normpath(char_dir)):
        abort(403)
    if not os.path.isfile(full_path):
        abort(404)
    directory = os.path.dirname(full_path)
    basename = os.path.basename(full_path)
    return send_from_directory(directory, basename)


# ============================================================
# 角色管理 API
# ============================================================
@app.route("/api/characters", methods=["GET"])
def api_characters():
    """获取所有可用角色列表"""
    characters = get_all_characters()
    result = []
    for c in characters:
        # 解析 model3.json 获取表情和动作信息
        model_path = os.path.join(c["path"], c["model_json"])
        expressions = []
        motions = []
        thumbnail = None

        try:
            with open(model_path, "r", encoding="utf-8") as f:
                model_data = json.load(f)
            file_refs = model_data.get("FileReferences", {})

            # 获取表情列表
            for exp in file_refs.get("Expressions", []):
                name = exp.get("Name", "")
                # 去掉 .exp3.json 后缀作为显示名
                display_name = name.replace(".exp3.json", "")
                expressions.append({"name": name, "display": display_name})

            # 获取动作列表
            motion_groups = file_refs.get("Motions", {})
            for group_name, group_motions in motion_groups.items():
                for idx, motion in enumerate(group_motions):
                    motion_file = motion.get("File", "")
                    # 提取动作文件名作为显示名
                    display = os.path.basename(motion_file).replace(".motion3.json", "").replace("[FIXED]", "")
                    motions.append({
                        "group": group_name,
                        "index": idx,
                        "file": motion_file,
                        "display": display,
                    })
        except Exception:
            pass

        # 查找缩略图
        thumb = find_thumbnail(c["path"])
        if thumb:
            thumbnail = f"/live2d/{c['id']}/{thumb}"

        result.append({
            "id": c["id"],
            "name": c["name"],
            "model_url": f"/live2d/{c['id']}/{c['model_json']}",
            "thumbnail": thumbnail,
            "expressions": expressions,
            "motions": motions,
        })

    return jsonify(result)


# ============================================================
# 表情-动作映射 API
# ============================================================
@app.route("/api/mappings/<char_id>", methods=["GET"])
def api_get_mappings(char_id):
    """获取指定角色的表情-动作映射"""
    mappings = load_mappings()
    char_mappings = mappings.get(char_id, {})
    return jsonify(char_mappings)


@app.route("/api/mappings/<char_id>", methods=["POST"])
def api_save_mappings(char_id):
    """保存指定角色的表情-动作映射 (已禁用，请手动修改 config.yml)"""
    return jsonify({
        "error": "配置目前为只读模式。请直接修改根目录下的 config.yml 文件以更新映射，这样可以保留您的注释和格式。",
        "success": False
    }), 403


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


if __name__ == "__main__":
    app.run(debug=True, port=5001, use_reloader=False)
