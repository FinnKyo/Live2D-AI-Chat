"""
AI Live2D Galgame - Flask 后端
提供页面路由、OpenAI 兼容 API 代理、Live2D 角色管理
支持表情-动作映射配置和 ZIP 角色上传
"""
import os
import json
import shutil
import zipfile
import urllib.request
import urllib.error
from flask import Flask, render_template, request, jsonify, send_from_directory, abort

app = Flask(__name__)

# ============================================================
# Live2D 角色目录配置
# ============================================================
# 上传角色存放目录
UPLOAD_DIR = os.path.join(app.root_path, "live2d_characters")
os.makedirs(UPLOAD_DIR, exist_ok=True)

# 表情-动作映射配置文件
MAPPING_FILE = os.path.join(app.root_path, "emotion_mappings.json")


def get_all_characters():
    """获取所有可用角色列表"""
    characters = []

    # 上传的角色
    if os.path.isdir(UPLOAD_DIR):
        for name in sorted(os.listdir(UPLOAD_DIR)):
            char_dir = os.path.join(UPLOAD_DIR, name)
            if not os.path.isdir(char_dir):
                continue
            model_json = find_model_json(char_dir)
            if model_json:
                characters.append({
                    "id": name,
                    "name": name,
                    "path": char_dir,
                    "model_json": model_json,
                    "builtin": False,
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
    char_dir = os.path.join(UPLOAD_DIR, char_id)
    if os.path.isdir(char_dir):
        return char_dir
    return None


def load_mappings():
    """加载表情-动作映射配置"""
    if os.path.exists(MAPPING_FILE):
        with open(MAPPING_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
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
    """主页 - API 设置"""
    return render_template("api.html")

@app.route("/character")
def character():
    """角色设置"""
    return render_template("character.html")

@app.route("/prompt")
def prompt():
    """全局提示词设置"""
    return render_template("prompt.html")


@app.route("/chat")
def chat():
    """Galgame 对话界面"""
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


@app.route("/api/upload_character", methods=["POST"])
def api_upload_character():
    """上传 Live2D 角色 ZIP 文件"""
    if "file" not in request.files:
        return jsonify({"error": "没有上传文件"}), 400

    file = request.files["file"]
    if not file.filename or not file.filename.endswith(".zip"):
        return jsonify({"error": "请上传 .zip 文件"}), 400

    # 使用文件名(去扩展名)作为角色 ID
    char_name = os.path.splitext(file.filename)[0]
    # 清理名称中的特殊字符
    char_name = "".join(c for c in char_name if c.isalnum() or c in "._- ").strip()
    if not char_name:
        char_name = "uploaded_character"

    char_dir = os.path.join(UPLOAD_DIR, char_name)

    # 如果已存在则先删除
    if os.path.exists(char_dir):
        shutil.rmtree(char_dir)

    try:
        # 保存临时文件
        tmp_path = os.path.join(UPLOAD_DIR, "_tmp_upload.zip")
        file.save(tmp_path)

        # 解压
        with zipfile.ZipFile(tmp_path, "r") as zf:
            zf.extractall(char_dir)

        os.remove(tmp_path)

        # 清理 macOS 生成的垃圾文件
        macosx_dir = os.path.join(char_dir, "__MACOSX")
        if os.path.exists(macosx_dir):
            shutil.rmtree(macosx_dir)

        # 检查是否嵌套了一层目录 (常见的 ZIP 打包方式)
        items = [i for i in os.listdir(char_dir) if not i.startswith(".")]
        if len(items) == 1 and os.path.isdir(os.path.join(char_dir, items[0])):
            # 将子目录内容移到上层
            nested_dir = os.path.join(char_dir, items[0])
            for item in os.listdir(nested_dir):
                shutil.move(os.path.join(nested_dir, item), char_dir)
            os.rmdir(nested_dir)

        # 验证是否有 model3.json
        model_json = find_model_json(char_dir)
        if not model_json:
            shutil.rmtree(char_dir)
            return jsonify({"error": "ZIP 中未找到 .model3.json 文件，请确保文件结构正确"}), 400

        return jsonify({
            "success": True,
            "character_id": char_name,
            "model_json": model_json,
            "message": f"角色 '{char_name}' 上传成功！",
        })

    except zipfile.BadZipFile:
        if os.path.exists(char_dir):
            shutil.rmtree(char_dir)
        return jsonify({"error": "无效的 ZIP 文件"}), 400
    except Exception as e:
        if os.path.exists(char_dir):
            shutil.rmtree(char_dir)
        return jsonify({"error": f"上传处理失败: {str(e)}"}), 500


@app.route("/api/delete_character/<char_id>", methods=["DELETE"])
def api_delete_character(char_id):
    """删除上传的角色"""
    char_dir = os.path.join(UPLOAD_DIR, char_id)
    if not os.path.exists(char_dir):
        return jsonify({"error": "角色不存在"}), 404

    shutil.rmtree(char_dir)

    # 同时删除相关的映射配置
    mappings = load_mappings()
    if char_id in mappings:
        del mappings[char_id]
        save_mappings(mappings)

    return jsonify({"success": True, "message": f"角色 '{char_id}' 已删除"})


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
    """保存指定角色的表情-动作映射"""
    data = request.json
    if data is None:
        return jsonify({"error": "无效的数据"}), 400

    mappings = load_mappings()
    mappings[char_id] = data
    save_mappings(mappings)

    return jsonify({"success": True, "message": "映射配置已保存"})


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
