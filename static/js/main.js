/**
 * AI Live2D Galgame - 主页逻辑
 * 处理设置保存、角色管理、表情-动作映射配置和 ZIP 上传
 */

// === Global state ===
let allCharacters = [];
let selectedCharacterId = null;
let currentCharacterData = null;

document.addEventListener('DOMContentLoaded', () => {
    initParticles();
    loadSettings();
    initEventListeners();
    loadCharacters();
});

/* === Particle Background === */
function initParticles() {
    const container = document.getElementById('particles');
    if (!container) return;
    const count = 25;
    for (let i = 0; i < count; i++) {
        const p = document.createElement('div');
        p.className = 'particle';
        p.style.left = Math.random() * 100 + '%';
        p.style.animationDuration = (8 + Math.random() * 12) + 's';
        p.style.animationDelay = Math.random() * 8 + 's';
        p.style.width = p.style.height = (2 + Math.random() * 3) + 'px';
        container.appendChild(p);
    }
}

/* === Settings Management === */
function loadSettings() {
    const fields = ['api_url', 'api_key', 'model_name', 'custom_system_prompt', 'temperature', 'top_p', 'frequency_penalty', 'presence_penalty', 'max_tokens', 'context_size', 'n_choices', 'reasoning_effort', 'reply_length_limit', 'char_name', 'char_persona', 'world_scenario', 'char_greeting', 'user_persona'];
    fields.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            const saved = localStorage.getItem('galgame_' + id);
            if (saved) el.value = saved;
        }
    });
    const streamEl = document.getElementById('stream_output');
    if (streamEl) streamEl.checked = localStorage.getItem('galgame_stream_output') !== 'false';
    const cotEl = document.getElementById('request_cot');
    if (cotEl) cotEl.checked = localStorage.getItem('galgame_request_cot') === 'true';
}

function saveSettings() {
    const fields = ['api_url', 'api_key', 'model_name', 'custom_system_prompt', 'temperature', 'top_p', 'frequency_penalty', 'presence_penalty', 'max_tokens', 'context_size', 'n_choices', 'reasoning_effort', 'reply_length_limit', 'char_name', 'char_persona', 'world_scenario', 'char_greeting', 'user_persona'];
    fields.forEach(id => {
        const el = document.getElementById(id);
        if (el) localStorage.setItem('galgame_' + id, el.value.trim());
    });
    const streamEl = document.getElementById('stream_output');
    if (streamEl) localStorage.setItem('galgame_stream_output', streamEl.checked);
    const cotEl = document.getElementById('request_cot');
    if (cotEl) localStorage.setItem('galgame_request_cot', cotEl.checked);

    showStatus('settings-status', '✓ 设置已保存', 'success');
}

function saveCharacterInfo() {
    const nameEl = document.getElementById('char_name');
    const personaEl = document.getElementById('char_persona');
    const greetingEl = document.getElementById('char_greeting');

    const name = nameEl ? nameEl.value.trim() : '';
    const persona = personaEl ? personaEl.value.trim() : '';
    const greeting = greetingEl ? greetingEl.value.trim() : '';

    // Set global values for starting chat
    localStorage.setItem('galgame_char_name', name);
    localStorage.setItem('galgame_char_persona', persona);
    localStorage.setItem('galgame_char_greeting', greeting);

    // Persist per character ID
    if (selectedCharacterId) {
        localStorage.setItem(`galgame_char_name_${selectedCharacterId}`, name);
        localStorage.setItem(`galgame_char_persona_${selectedCharacterId}`, persona);
        localStorage.setItem(`galgame_char_greeting_${selectedCharacterId}`, greeting);
    }

    showStatus('char-info-status', '✓ 角色信息已保存', 'success');
}

function showStatus(id, msg, type) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = msg;
    el.className = 'status-msg show ' + type;
    setTimeout(() => el.className = 'status-msg', 3000);
}

/* === Test API Connection === */
async function testConnection() {
    const url = document.getElementById('api_url').value.trim();
    const key = document.getElementById('api_key').value.trim();
    if (!url || !key) {
        showStatus('settings-status', '✗ 请填写 API 地址和 Key', 'error');
        return;
    }
    showStatus('settings-status', '⏳ 正在测试连接...', 'success');
    try {
        const resp = await fetch('/api/models', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ api_url: url, api_key: key })
        });
        const data = await resp.json();
        if (data.error) {
            showStatus('settings-status', '✗ ' + data.error, 'error');
        } else {
            showStatus('settings-status', '✓ 连接成功！', 'success');
        }
    } catch (e) {
        showStatus('settings-status', '✗ 连接失败: ' + e.message, 'error');
    }
}

/* === Load Characters from API === */
async function loadCharacters() {
    try {
        const resp = await fetch('/api/characters');
        allCharacters = await resp.json();
        renderCharacterGrid();

        // Restore previous selection
        const savedId = localStorage.getItem('galgame_character');
        if (savedId && allCharacters.find(c => c.id === savedId)) {
            selectCharacter(savedId);
        } else if (allCharacters.length > 0) {
            selectCharacter(allCharacters[0].id);
        }
    } catch (e) {
        const grid = document.getElementById('character-grid');
        if (grid) {
            grid.innerHTML = '<div class="character-card-loading"><span>❌ 加载角色失败: ' + e.message + '</span></div>';
        }
    }
}

function renderCharacterGrid() {
    const grid = document.getElementById('character-grid');
    if (!grid) return;

    if (allCharacters.length === 0) {
        grid.innerHTML = '<div class="character-card-loading"><span>暂无可用角色，请上传 Live2D 角色 ZIP 文件</span></div>';
        return;
    }

    grid.innerHTML = allCharacters.map(char => `
        <div class="character-card ${char.id === selectedCharacterId ? 'selected' : ''}" 
             data-char-id="${char.id}" onclick="selectCharacter('${char.id}')">
            ${char.thumbnail 
                ? `<img class="card-image" src="${char.thumbnail}" alt="${char.name}" loading="lazy">`
                : `<div class="card-image card-image-placeholder"><span>🎭</span></div>`
            }
            <div class="card-info">
                <div class="card-name">${escapeHtml(char.name)}</div>
                <div class="card-desc">
                    表情: ${char.expressions.length} 个 · 动作: ${char.motions.length} 个
                </div>
            </div>
            <button class="card-delete-btn" onclick="event.stopPropagation(); deleteCharacter('${char.id}')" title="删除角色">✕</button>
        </div>
    `).join('');
}

/* === Character Selection === */
function selectCharacter(charId) {
    selectedCharacterId = charId;
    localStorage.setItem('galgame_character', charId);

    // Update visual selection
    document.querySelectorAll('.character-card').forEach(c => c.classList.remove('selected'));
    const card = document.querySelector(`.character-card[data-char-id="${charId}"]`);
    if (card) card.classList.add('selected');

    // Find character data
    currentCharacterData = allCharacters.find(c => c.id === charId);
    if (currentCharacterData) {
        // Store model URL for chat page
        localStorage.setItem('galgame_model_url', currentCharacterData.model_url);
        
        // Update persona fields on character.html page
        const nameEl = document.getElementById('char_name');
        const personaEl = document.getElementById('char_persona');
        const greetingEl = document.getElementById('char_greeting');
        
        if (nameEl) {
            nameEl.value = localStorage.getItem(`galgame_char_name_${charId}`) || currentCharacterData.name || '';
        }
        if (personaEl) {
            personaEl.value = localStorage.getItem(`galgame_char_persona_${charId}`) || currentCharacterData.persona || '';
        }
        if (greetingEl) {
            greetingEl.value = localStorage.getItem(`galgame_char_greeting_${charId}`) || currentCharacterData.greeting || '';
        }

        // Load expression-motion mapping
        loadMappingUI(currentCharacterData);
    }
}

/* === Delete Character === */
async function deleteCharacter(charId) {
    if (!confirm(`确定要删除角色 "${charId}" 吗？`)) return;

    try {
        const resp = await fetch(`/api/delete_character/${charId}`, { method: 'DELETE' });
        const data = await resp.json();
        if (data.success) {
            if (selectedCharacterId === charId) {
                selectedCharacterId = null;
                currentCharacterData = null;
            }
            await loadCharacters();
        } else {
            alert(data.error || '删除失败');
        }
    } catch (e) {
        alert('删除失败: ' + e.message);
    }
}

/* === ZIP Upload === */
function initUpload() {
    const dropzone = document.getElementById('upload-dropzone');
    const input = document.getElementById('upload-input');
    if (!dropzone || !input) return;

    dropzone.addEventListener('click', () => input.click());
    
    dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.classList.add('dragover');
    });

    dropzone.addEventListener('dragleave', () => {
        dropzone.classList.remove('dragover');
    });

    dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files.length > 0 && files[0].name.endsWith('.zip')) {
            uploadFile(files[0]);
        } else {
            alert('请上传 .zip 文件');
        }
    });

    input.addEventListener('change', () => {
        if (input.files.length > 0) {
            uploadFile(input.files[0]);
            input.value = '';
        }
    });
}

async function uploadFile(file) {
    const progressEl = document.getElementById('upload-progress');
    const progressFill = document.getElementById('progress-fill');
    const progressText = document.getElementById('progress-text');
    const dropzone = document.getElementById('upload-dropzone');

    if (dropzone) dropzone.style.display = 'none';
    if (progressEl) progressEl.style.display = 'block';
    if (progressFill) progressFill.style.width = '0%';
    if (progressText) progressText.textContent = `正在上传 ${file.name}...`;

    const formData = new FormData();
    formData.append('file', file);

    try {
        // Simulate progress (actual progress would need XMLHttpRequest)
        let progress = 0;
        const progressInterval = setInterval(() => {
            progress = Math.min(progress + Math.random() * 15, 90);
            if (progressFill) progressFill.style.width = progress + '%';
        }, 200);

        const resp = await fetch('/api/upload_character', {
            method: 'POST',
            body: formData,
        });

        clearInterval(progressInterval);
        if (progressFill) progressFill.style.width = '100%';

        const data = await resp.json();
        if (data.success) {
            if (progressText) progressText.textContent = '✓ ' + data.message;
            setTimeout(async () => {
                if (dropzone) dropzone.style.display = '';
                if (progressEl) progressEl.style.display = 'none';
                await loadCharacters();
                // Auto select newly uploaded character
                if (data.character_id) {
                    selectCharacter(data.character_id);
                }
            }, 1500);
        } else {
            if (progressText) progressText.textContent = '✗ ' + (data.error || '上传失败');
            if (progressFill) {
                progressFill.style.width = '100%';
                progressFill.style.background = 'var(--danger)';
            }
            setTimeout(() => {
                if (dropzone) dropzone.style.display = '';
                if (progressEl) progressEl.style.display = 'none';
                if (progressFill) progressFill.style.background = '';
            }, 3000);
        }
    } catch (e) {
        if (progressText) progressText.textContent = '✗ 上传失败: ' + e.message;
        setTimeout(() => {
            if (dropzone) dropzone.style.display = '';
            if (progressEl) progressEl.style.display = 'none';
        }, 3000);
    }
}

// Build motion options
let currentMotionOptions = '';
let currentExpressionOptions = '';

async function loadMappingUI(charData) {
    const container = document.getElementById('mapping-container');
    const infoEl = document.getElementById('mapping-info');
    const list = document.getElementById('mapping-list');

    if (!charData || charData.expressions.length === 0) {
        if (container) container.style.display = 'none';
        if (infoEl) {
            infoEl.style.display = 'block';
            infoEl.innerHTML = '<div class="info-hint">⚠️ 当前角色没有可用的表情文件</div>';
        }
        return;
    }

    if (infoEl) infoEl.style.display = 'none';
    if (container) container.style.display = 'block';

    // Load saved mappings from server
    let savedMappings = {};
    try {
        const resp = await fetch(`/api/mappings/${charData.id}`);
        savedMappings = await resp.json();
    } catch (e) {
        console.warn('Failed to load mappings:', e);
    }

    // Build motion options
    currentMotionOptions = charData.motions.map((m, i) => {
        const label = `[${m.group}] ${m.display}`;
        const value = `${m.group}:${m.index}`;
        return `<option value="${value}">${escapeHtml(label)}</option>`;
    }).join('');

    // Build expression options
    currentExpressionOptions = charData.expressions.map((e, i) => {
        const label = e.display || e.name;
        return `<option value="${escapeHtml(e.name)}">${escapeHtml(label)}</option>`;
    }).join('');

    // Build mapping rows
    if (list) {
        list.innerHTML = '';
        
        // 1. Add 'tap' mapping specifically
        addMappingRowToDOM('tap', savedMappings['tap'] || '', '🖐️ 鼠标点击/触摸 (tap)');

        // 2. Add saved mappings
        const added = new Set(['tap']);
        for (const [expName, motion] of Object.entries(savedMappings)) {
            if (!added.has(expName)) {
                addMappingRowToDOM(expName, motion);
                added.add(expName);
            }
        }

        // 3. Add unmapped expressions from character
        charData.expressions.forEach(exp => {
            const expName = exp.display;
            if (!added.has(expName)) {
                addMappingRowToDOM(expName, '');
                added.add(expName);
            }
        });
    }
}

window.addMappingRow = function() {
    addMappingRowToDOM('', '');
};

window.removeMappingRow = function(btn) {
    btn.closest('.mapping-row').remove();
};

function addMappingRowToDOM(expName, mappingValue, customLabel = null) {
    const list = document.getElementById('mapping-list');
    if (!list) return;

    let expVal = '';
    let motVal = '';
    if (typeof mappingValue === 'string') {
        motVal = mappingValue;
    } else if (mappingValue) {
        expVal = mappingValue.expression || '';
        motVal = mappingValue.motion || '';
    }

    const row = document.createElement('div');
    row.className = 'mapping-row';
    
    const isFixed = customLabel !== null;
    const nameHtml = isFixed 
        ? `<span class="mapping-exp-name">${customLabel}</span><input type="hidden" class="mapping-exp-input" value="${expName}">`
        : `<input type="text" class="mapping-exp-input" value="${escapeHtml(expName)}" placeholder="输入情感(如 happy)" style="width:100%; padding: 0.3rem; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); color:white; border-radius:4px;">`;
    
    row.innerHTML = `
        <div class="mapping-expression" style="flex:1;">
            <span class="mapping-exp-icon">😊</span>
            ${nameHtml}
        </div>
        <div class="mapping-arrow">→</div>
        <div class="mapping-motion" style="flex:3; display:flex; gap:0.5rem;">
            <select class="mapping-select-exp" style="flex:1;">
                <option value="">-- 无表情 --</option>
                ${currentExpressionOptions}
            </select>
            <select class="mapping-select-motion" style="flex:1;">
                <option value="">-- 无动作 --</option>
                ${currentMotionOptions}
            </select>
        </div>
        ${!isFixed ? `<button class="btn btn-secondary btn-sm" onclick="removeMappingRow(this)" style="padding: 0.3rem 0.6rem; color: var(--danger); border-color: rgba(255,107,107,0.3); background: rgba(255,107,107,0.1);">✕</button>` : ''}
    `;
    
    // Set selected value
    const selectExp = row.querySelector('.mapping-select-exp');
    const selectMot = row.querySelector('.mapping-select-motion');
    if (expVal && selectExp) selectExp.value = expVal;
    if (motVal && selectMot) selectMot.value = motVal;
    
    list.appendChild(row);
}

async function saveMappings() {
    if (!currentCharacterData) return;

    const mappings = {};
    const rows = document.querySelectorAll('.mapping-row');
    rows.forEach(row => {
        const expInput = row.querySelector('.mapping-exp-input');
        const selectExp = row.querySelector('.mapping-select-exp');
        const selectMot = row.querySelector('.mapping-select-motion');
        if (expInput && selectExp && selectMot) {
            const expName = expInput.value.trim().toLowerCase();
            const expVal = selectExp.value;
            const motVal = selectMot.value;
            if (expName && (expVal || motVal)) {
                mappings[expName] = {
                    expression: expVal,
                    motion: motVal
                };
            }
        }
    });

    try {
        const resp = await fetch(`/api/mappings/${currentCharacterData.id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(mappings),
        });
        const data = await resp.json();
        if (data.success) {
            showStatus('mapping-status', '✓ 映射配置已保存', 'success');
            // Also save to localStorage for quick access in chat
            localStorage.setItem(`galgame_mapping_${currentCharacterData.id}`, JSON.stringify(mappings));
        } else {
            showStatus('mapping-status', '✗ ' + (data.error || '保存失败'), 'error');
        }
    } catch (e) {
        showStatus('mapping-status', '✗ 保存失败: ' + e.message, 'error');
    }
}

function resetMappings() {
    document.querySelectorAll('.mapping-select-exp, .mapping-select-motion').forEach(select => {
        select.value = '';
    });
    showStatus('mapping-status', '✓ 已重置为无映射', 'success');
}

/* === Start Game === */
function startGame() {
    // Save current settings first
    saveSettings();
    const url = localStorage.getItem('galgame_api_url');
    const key = localStorage.getItem('galgame_api_key');
    if (!url || !key) {
        showStatus('settings-status', '✗ 请先配置 API 设置', 'error');
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
    }
    if (!selectedCharacterId) {
        alert('请先选择一个角色');
        return;
    }
    // Save mappings before starting
    saveMappings();
    window.location.href = '/chat';
}

/* === Event Listeners === */
function initEventListeners() {
    const saveBtn = document.getElementById('btn-save');
    if (saveBtn) saveBtn.addEventListener('click', saveSettings);

    const testBtn = document.getElementById('btn-test');
    if (testBtn) testBtn.addEventListener('click', testConnection);

    const startBtn = document.getElementById('btn-start');
    if (startBtn) startBtn.addEventListener('click', startGame);

    const saveCharInfoBtn = document.getElementById('btn-save-char-info');
    if (saveCharInfoBtn) saveCharInfoBtn.addEventListener('click', saveCharacterInfo);

    const saveMappingBtn = document.getElementById('btn-save-mapping');
    if (saveMappingBtn) saveMappingBtn.addEventListener('click', saveMappings);

    const resetMappingBtn = document.getElementById('btn-reset-mapping');
    if (resetMappingBtn) resetMappingBtn.addEventListener('click', resetMappings);

    // Init upload functionality
    initUpload();
}

/* === Utility === */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
