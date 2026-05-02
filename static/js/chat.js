/**
 * AI Live2D Galgame - 对话界面逻辑
 * 处理 AI 对话、打字机效果、情感动作触发和历史记录
 * 支持动态角色和表情-动作映射
 */

// === State ===
let currentSessionId = null;

const state = {
    messages: [],
    history: [],
    isTyping: false,
    isWaitingAPI: false,
    live2d: null,
    typewriterAbort: null,
    charId: '',
    charName: 'Character',
};

// === Build emotion instruction from character's expressions ===
function buildEmotionInstruction() {
    // Get character's available expressions from stored data
    const charId = localStorage.getItem('galgame_character');
    let expressionsSet = new Set();

    try {
        // Try to get from cached character data
        const cachedChars = localStorage.getItem('galgame_characters_cache');
        if (cachedChars) {
            const chars = JSON.parse(cachedChars);
            const char = chars.find(c => c.id === charId);
            if (char && char.expressions) {
                char.expressions.forEach(e => expressionsSet.add(e.display));
            }
        }
    } catch (e) {
        console.warn('Failed to load expressions for emotion instruction:', e);
    }

    // Add mapped emotions from Live2D helper
    if (state.live2d && state.live2d.expressionMotionMap) {
        Object.keys(state.live2d.expressionMotionMap).forEach(k => {
            if (k && k !== 'tap') expressionsSet.add(k);
        });
    }

    let expressionsArr = Array.from(expressionsSet);

    // Fallback default emotions
    if (expressionsArr.length === 0) {
        expressionsArr = ['happy', 'sad', 'angry', 'surprised', 'neutral', 'shy', 'excited'];
    }

    const emotionList = expressionsArr.join('、');

    return `

【重要格式要求】每次回复时，请在回复的最开头加上一个情感标签，格式为 [emotion:xxx]，其中 xxx 是以下情感之一：
${emotionList}
例如：[emotion:happy]你好呀！
请根据回复内容的情感自然选择最合适的标签。标签只加在开头，正文不要再重复标签。`;
}

// === Settings from localStorage ===
function getSettings() {
    return {
        apiUrl: localStorage.getItem('galgame_api_url') || '',
        apiKey: localStorage.getItem('galgame_api_key') || '',
        model: localStorage.getItem('galgame_model_name') || 'gpt-3.5-turbo',
        charName: (localStorage.getItem('galgame_character') ? localStorage.getItem(`galgame_char_name_${localStorage.getItem('galgame_character')}`) : null) || localStorage.getItem('galgame_char_name') || 'Character',
        charPersona: (localStorage.getItem('galgame_character') ? localStorage.getItem(`galgame_char_persona_${localStorage.getItem('galgame_character')}`) : null) || localStorage.getItem('galgame_char_persona') || '',
        worldScenario: localStorage.getItem('galgame_world_scenario') || '',
        charGreeting: (localStorage.getItem('galgame_character') ? localStorage.getItem(`galgame_char_greeting_${localStorage.getItem('galgame_character')}`) : null) || localStorage.getItem('galgame_char_greeting') || '你好呀！',
        userPersona: localStorage.getItem('galgame_user_persona') || '',
        customSystemPrompt: localStorage.getItem('galgame_custom_system_prompt') || '',
        temperature: parseFloat(localStorage.getItem('galgame_temperature')) || 1.0,
        maxTokens: parseInt(localStorage.getItem('galgame_max_tokens'), 10) || 3000,
        contextSize: parseInt(localStorage.getItem('galgame_context_size'), 10) || 20,
        top_p: parseFloat(localStorage.getItem('galgame_top_p')) || 1.0,
        frequency_penalty: parseFloat(localStorage.getItem('galgame_frequency_penalty')) || 0.0,
        presence_penalty: parseFloat(localStorage.getItem('galgame_presence_penalty')) || 0.0,
        n_choices: parseInt(localStorage.getItem('galgame_n_choices'), 10) || 1,
        chatBackground: localStorage.getItem('galgame_chat_background') || '',
        dialogueOpacity: localStorage.getItem('galgame_dialogue_opacity') || '0.75',
        modelUrl: localStorage.getItem('galgame_model_url') || '',
        charId: localStorage.getItem('galgame_character') || '',
    };
}

/**
 * 解析 AI 回复中的情感标签
 * 格式: [emotion:xxx]正文内容
 * @returns {{ emotion: string, text: string }}
 */
function parseEmotionTag(reply) {
    const match = reply.match(/^\[emotion:(\w+)\]\s*/i);
    if (match) {
        return {
            emotion: match[1].toLowerCase(),
            text: reply.slice(match[0].length).trim(),
        };
    }
    return { emotion: 'neutral', text: reply };
}

// === Init ===
document.addEventListener('DOMContentLoaded', async () => {
    const settings = getSettings();
    if (!settings.apiUrl || !settings.apiKey) {
        alert('请先在主页设置 API 信息');
        window.location.href = '/';
        return;
    }

    if (!settings.modelUrl) {
        alert('请先在主页选择一个角色');
        window.location.href = '/';
        return;
    }

    // Set character name in UI
    state.charName = settings.charName;
    state.charId = settings.charId;
    const charNameTag = document.getElementById('char-name-tag');
    if (charNameTag) charNameTag.textContent = `${state.charName} · AI 对话`;

    const dialogueName = document.getElementById('dialogue-name');
    if (dialogueName) dialogueName.textContent = state.charName;

    // Cache character data for emotion instruction
    await cacheCharacterData(settings.charId);

    // Load Last Session
    // Force Start a New Session on each load
    currentSessionId = Date.now().toString();
    state.history = [];
    state.messages = [];
    localStorage.setItem(`galgame_last_session_${state.charId}`, currentSessionId);

    // Set custom background
    const bgEl = document.querySelector('.game-bg');
    if (settings.chatBackground && bgEl) {
        bgEl.style.backgroundImage = `url(${settings.chatBackground})`;
        bgEl.style.backgroundSize = 'cover';
        bgEl.style.backgroundPosition = 'center';
    }

    // Set dialogue opacity
    const dialogueBox = document.querySelector('.dialogue-box');
    if (dialogueBox) {
        dialogueBox.style.setProperty('--box-opacity', settings.dialogueOpacity);
    }
    
    // Background and opacity settings
    const btnSettings = document.getElementById('btn-settings');
    const settingsPanel = document.getElementById('chat-settings-panel');
    const opacitySlider = document.getElementById('chat_opacity_slider');
    const opacityDisplay = document.getElementById('opacity_val_display');
    const bgInput = document.getElementById('chat_background_input');
    
    if (bgInput) {
        bgInput.value = settings.chatBackground;
        bgInput.addEventListener('input', (e) => {
            const val = e.target.value.trim();
            if (bgEl) {
                if (val) {
                    bgEl.style.backgroundImage = `url(${val})`;
                    bgEl.style.backgroundSize = 'cover';
                    bgEl.style.backgroundPosition = 'center';
                } else {
                    bgEl.style.backgroundImage = 'none';
                }
            }
            localStorage.setItem('galgame_chat_background', val);
        });
    }

    const sessionsPanel = document.getElementById('chat-sessions-panel');

    if (btnSettings && settingsPanel && opacitySlider) {
        btnSettings.addEventListener('click', () => {
            settingsPanel.style.display = settingsPanel.style.display === 'none' ? 'block' : 'none';
            if (sessionsPanel) sessionsPanel.style.display = 'none';
        });

        // Initialize slider value
        opacitySlider.value = settings.dialogueOpacity;
        if (opacityDisplay) opacityDisplay.textContent = settings.dialogueOpacity;

        // Listen for realtime changes
        opacitySlider.addEventListener('input', (e) => {
            const val = e.target.value;
            if (opacityDisplay) opacityDisplay.textContent = val;
            if (dialogueBox) {
                dialogueBox.style.setProperty('--box-opacity', val);
            }
            localStorage.setItem('galgame_dialogue_opacity', val);
        });
    }

    // Sessions Panel
    const btnSessions = document.getElementById('btn-sessions');
    const btnNewSession = document.getElementById('btn-new-session');

    if (btnSessions && sessionsPanel) {
        btnSessions.addEventListener('click', () => {
            sessionsPanel.style.display = sessionsPanel.style.display === 'none' ? 'block' : 'none';
            if (settingsPanel) settingsPanel.style.display = 'none';
            renderSessions();
        });
    }

    if (btnNewSession) {
        btnNewSession.addEventListener('click', () => {
            currentSessionId = Date.now().toString();
            state.history = [];
            state.messages = [];
            initSystemMessage();
            
            if (settings.charGreeting) {
                state.history.push({ role: 'assistant', content: settings.charGreeting });
                state.messages.push({ role: 'assistant', content: settings.charGreeting });
                showDialogue(state.charName, settings.charGreeting, false, 'happy');
            } else {
                const textEl = document.querySelector('.dialogue-text');
                if (textEl) textEl.innerHTML = '<i>(新对话已开启)</i>';
            }
            saveSession();
            sessionsPanel.style.display = 'none';
        });
    }

    // Init Live2D with Timeout Guard
    if (settings.modelUrl) {
        state.live2d = new Live2DHelper('live2d-canvas');
        
        // Create a 5-second timeout promise
        const initPromise = state.live2d.init(settings.modelUrl);
        const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve(false), 5000));
        
        console.log('Starting Live2D initialization...');
        const success = await Promise.race([initPromise, timeoutPromise]);
        
        if (!success) {
            console.warn('Live2D model failed to load or timed out, continuing without it');
        }
    } else {
        console.warn('No Live2D model URL found in settings');
    }

    // Hide loading overlay
    const loadingEl = document.getElementById('model-loading');
    if (loadingEl) {
        loadingEl.classList.add('hidden');
        setTimeout(() => loadingEl.style.display = 'none', 600);
    }

    // Init system message
    initSystemMessage();
    
    // Expand Dialogue Box
    const btnExpand = document.getElementById('btn-expand-dialogue');
    const dialogueText = document.querySelector('.dialogue-text');
    const dialogueHistory = document.getElementById('dialogue-history');
    
    if (btnExpand && dialogueBox) {
        btnExpand.addEventListener('click', () => {
            if (dialogueBox.classList.contains('expanded')) {
                dialogueBox.classList.remove('expanded');
                dialogueText.style.display = 'block';
                dialogueHistory.style.display = 'none';
                btnExpand.textContent = '▲ 展开记录';
            } else {
                dialogueBox.classList.add('expanded');
                dialogueText.style.display = 'none';
                dialogueHistory.style.display = 'block';
                btnExpand.textContent = '▼ 收起记录';
                renderDialogueHistory();
            }
        });
    }
    
    // Show welcome message with greeting emotion
    if (state.history.length === 0) {
        if (state.live2d && state.live2d.ready) {
            state.live2d.playEmotionMotion('happy');
        }
        state.history.push({ role: 'assistant', content: settings.charGreeting });
        state.messages.push({ role: 'assistant', content: settings.charGreeting });
        showDialogue(state.charName, settings.charGreeting, false, 'happy');
    }

    // Setup event listeners
    initChatEvents();

    // Setup size slider
    initSizeSlider();
});

function initSystemMessage() {
    const settings = getSettings();
    const emotionInstruction = buildEmotionInstruction();
    
    let globalPrompt = settings.customSystemPrompt || "Write {{char}}'s next reply in a fictional chat between {{char}} and {{user}}.";
    globalPrompt = globalPrompt.replace(/\{\{char\}\}/g, settings.charName).replace(/\{\{user\}\}/g, 'User');

    let fullSystemPrompt = globalPrompt + '\n';

    if (settings.charPersona) {
        fullSystemPrompt += `\n[Character Persona]\n${settings.charPersona}\n`;
    }
    if (settings.worldScenario) {
        fullSystemPrompt += `\n[Scenario]\n${settings.worldScenario}\n`;
    }
    if (settings.userPersona) {
        fullSystemPrompt += `\n[User Persona]\n${settings.userPersona}\n`;
    }

    // Remove any existing system messages to avoid duplication
    state.messages = state.messages.filter(m => m.role !== 'system');

    // Prepend the updated system message
    state.messages.unshift({
        role: 'system',
        content: fullSystemPrompt + emotionInstruction,
    });
}

function renderDialogueHistory() {
    const hist = document.getElementById('dialogue-history');
    if (!hist) return;
    
    hist.innerHTML = state.history.map(msg => `
        <div class="history-msg">
            <div class="history-name ${msg.role === 'user' ? 'user' : 'char'}">
                ${msg.role === 'user' ? '你' : state.charName}
            </div>
            <div class="history-content">${formatMarkdown(msg.content)}</div>
        </div>
    `).join('');
    
    // Scroll to bottom
    hist.scrollTop = hist.scrollHeight;
}

function saveSession() {
    const settings = getSettings();
    if (state.history.length === 0) return;

    if (!currentSessionId) {
        currentSessionId = Date.now().toString();
    }
    localStorage.setItem(`galgame_last_session_${settings.charId}`, currentSessionId);

    let sessions = JSON.parse(localStorage.getItem('galgame_sessions_' + settings.charId) || '[]');
    const existingIndex = sessions.findIndex(s => s.id === currentSessionId);
    const sessionObj = {
        id: currentSessionId,
        date: new Date(parseInt(currentSessionId)).toLocaleString(),
        preview: state.history[state.history.length - 1].content.substring(0, 30) + '...',
        messages: state.messages,
        history: state.history
    };
    if (existingIndex >= 0) {
        sessions[existingIndex] = sessionObj;
    } else {
        sessions.push(sessionObj);
    }
    localStorage.setItem('galgame_sessions_' + settings.charId, JSON.stringify(sessions));
}

function renderSessions() {
    const settings = getSettings();
    const list = document.getElementById('sessions-list');
    if (!list) return;
    let sessions = JSON.parse(localStorage.getItem('galgame_sessions_' + settings.charId) || '[]');
    
    if (sessions.length === 0) {
        list.innerHTML = '<div style="color:#888; text-align:center; padding: 1rem 0;">暂无对话记录</div>';
        return;
    }

    list.innerHTML = sessions.reverse().map(s => `
        <div class="session-item" style="position:relative; padding:0.5rem; background:rgba(255,255,255,0.05); border-radius:4px; cursor:pointer; font-size:0.85rem; border: 1px solid ${s.id === currentSessionId ? 'var(--accent-primary)' : 'transparent'}" onclick="loadSession('${s.id}')">
            <div style="color:#aaa; margin-bottom:0.2rem;">${s.date}</div>
            <div style="color:#fff; padding-right: 24px; word-break: break-all;">${escapeHtml(s.preview)}</div>
            <button onclick="deleteSession('${s.id}', event)" style="position:absolute; right:0.5rem; top:50%; transform:translateY(-50%); background:transparent; border:none; color:var(--danger); cursor:pointer; font-size:1.2rem; padding:0.2rem;" title="删除对话">✕</button>
        </div>
    `).join('');
}

window.deleteSession = function(id, event) {
    event.stopPropagation();
    if (!confirm('确定要删除这条对话记录吗？')) return;
    
    const settings = getSettings();
    let sessions = JSON.parse(localStorage.getItem('galgame_sessions_' + settings.charId) || '[]');
    sessions = sessions.filter(s => s.id !== id);
    localStorage.setItem('galgame_sessions_' + settings.charId, JSON.stringify(sessions));
    
    // If the active session is deleted, reset the chat
    if (currentSessionId === id) {
        currentSessionId = Date.now().toString();
        state.history = [];
        state.messages = [];
        initSystemMessage();
        const textEl = document.querySelector('.dialogue-text');
        if (textEl) {
            textEl.innerHTML = '<i>(新对话已开启)</i>';
        }
    }
    
    renderSessions();
}

window.loadSession = function(id) {
    const settings = getSettings();
    let sessions = JSON.parse(localStorage.getItem('galgame_sessions_' + settings.charId) || '[]');
    const s = sessions.find(x => x.id === id);
    if (s) {
        currentSessionId = id;
        state.messages = s.messages;
        state.history = s.history;
        
        const textEl = document.querySelector('.dialogue-text');
        if (textEl) {
            textEl.textContent = state.history.length > 0 ? state.history[state.history.length - 1].content : '';
        }
        
        document.getElementById('chat-sessions-panel').style.display = 'none';
        
        // Trigger motion if last msg is assistant
        if (state.history.length > 0 && state.history[state.history.length - 1].role === 'assistant') {
            const rawText = state.history[state.history.length - 1].content;
            const expRegex = /\[emotion:\s*([^\]]+)\]/i;
            const match = rawText.match(expRegex);
            if (match && state.live2d) {
                const expObj = state.live2d.getExpressionByName(match[1]);
                if (expObj) state.live2d.playEmotionMotion(expObj.Name);
            }
        }
    }
};

// Cache character data for building emotion instructions
async function cacheCharacterData(charId) {
    if (!charId) return;
    try {
        const resp = await fetch('/api/characters');
        const chars = await resp.json();
        localStorage.setItem('galgame_characters_cache', JSON.stringify(chars));
    } catch (e) {
        console.warn('Failed to cache character data:', e);
    }
}

// === Size Slider ===
function initSizeSlider() {
    const slider = document.getElementById('size-slider');
    const valueEl = document.getElementById('size-value');
    if (!slider || !state.live2d) return;

    // Set initial value from live2d helper
    slider.value = state.live2d.getScale();
    if (valueEl) valueEl.textContent = Math.round(state.live2d.getScale() * 100) + '%';

    slider.addEventListener('input', () => {
        const val = parseFloat(slider.value);
        state.live2d.setScale(val);
        if (valueEl) valueEl.textContent = Math.round(val * 100) + '%';
    });
}

// === Event Listeners ===
function initChatEvents() {
    // Input enter key
    const input = document.getElementById('chat-input');
    const sendBtn = document.getElementById('btn-send');
    
    if (input) {
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                sendMessage();
            }
        });
    }

    if (sendBtn) {
        sendBtn.addEventListener('click', sendMessage);
    }

    // Back button
    document.getElementById('btn-back').addEventListener('click', () => {
        window.location.href = '/';
    });
    
    // Click dialogue to skip typewriter
    const dialogueBox = document.querySelector('.dialogue-box');
    if (dialogueBox) {
        dialogueBox.addEventListener('click', (e) => {
            if (e.target.closest('.input-area')) return;
            if (state.typewriterAbort) {
                state.typewriterAbort();
            }
        });
    }
}

// === Send Message ===
async function sendMessage() {
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if (!text || state.isWaitingAPI) return;

    input.value = '';

    // Add user message
    state.messages.push({ role: 'user', content: text });
    state.history.push({ role: 'user', content: text });

    // 5. Save session
    saveSession();

    // Show loading
    state.isWaitingAPI = true;
    updateSendButton(true);
    showDialogue(state.charName, null, true);

    try {
        const settings = getSettings();
        
        // Limit context size
        const systemMsgs = state.messages.filter(m => m.role === 'system');
        const historyMsgs = state.messages.filter(m => m.role !== 'system');
        // keep last N messages (multiply by 2 because 1 interaction = user + assistant)
        const keptHistory = historyMsgs.slice(-(settings.contextSize * 2));
        const apiMessages = [...systemMsgs, ...keptHistory];

        const resp = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                api_url: settings.apiUrl,
                api_key: settings.apiKey,
                model: settings.model,
                messages: apiMessages,
                temperature: settings.temperature,
                max_tokens: settings.maxTokens,
                top_p: settings.top_p,
                frequency_penalty: settings.frequency_penalty,
                presence_penalty: settings.presence_penalty,
                n: settings.n_choices,
            }),
        });

        const data = await resp.json();
        if (data.error) {
            showDialogue('System', '❌ ' + data.error, false, 'neutral');
            return;
        }

        const rawReply = data.choices?.[0]?.message?.content || '(无回复)';

        // Parse emotion tag from reply
        const { emotion, text: cleanReply } = parseEmotionTag(rawReply);

        // Store the raw reply in messages (with tag) for context continuity
        state.messages.push({ role: 'assistant', content: rawReply });
        state.history.push({ role: 'assistant', content: cleanReply });

        // Play emotion-based motion and expression
        let resolvedEmotion = emotion;
        if (state.live2d && state.live2d.ready) {
            resolvedEmotion = state.live2d.playEmotionMotion(emotion);
        }

        // Show reply with typewriter effect + emotion tag
        showDialogue(state.charName, cleanReply, false, resolvedEmotion);

    } catch (error) {
        showDialogue('System', '❌ 请求失败: ' + error.message, false, 'neutral');
    } finally {
        state.isWaitingAPI = false;
        updateSendButton(false);
    }
}

function showDialogue(name, text, isLoading, emotion) {
    const nameEl = document.querySelector('.dialogue-name');
    const textEl = document.querySelector('.dialogue-text');
    const continueEl = document.querySelector('.click-continue');
    const emotionEl = document.querySelector('.emotion-tag');

    if (nameEl) nameEl.textContent = name;

    // 3. Save session
    saveSession();

    // 4. Update display text (trim emotion tag for UI)
    if (emotionEl) {
        if (emotion && emotion !== 'neutral') {
            emotionEl.textContent = `[${emotion}]`;
            emotionEl.style.display = 'inline-block';
        } else {
            emotionEl.style.display = 'none';
        }
    }

    if (isLoading) {
        if (textEl) {
            textEl.innerHTML = '<span class="loading-dots"><span></span><span></span><span></span></span>';
        }
        if (continueEl) continueEl.style.display = 'none';
        if (emotionEl) emotionEl.style.display = 'none';
        return;
    }

    // Clear loading dots
    if (textEl) textEl.innerHTML = '';

    if (!text) text = '(无回复)';

    if (textEl) textEl.innerHTML = formatMarkdown(text);
    if (continueEl) continueEl.style.display = 'none'; // Optional to display block if waiting

    // If history is currently expanded, re-render it to show new message
    const dialogueBox = document.querySelector('.dialogue-box');
    if (dialogueBox && dialogueBox.classList.contains('expanded')) {
        renderDialogueHistory();
    }

    // Typewriter effect
    if (textEl) {
        textEl.textContent = '';
        if (continueEl) continueEl.style.display = 'none';
        state.isTyping = true;

        typeWriter(text, textEl, 40).then(() => {
            state.isTyping = false;
            if (continueEl) continueEl.style.display = 'block';
        });
    }
}

// === Typewriter Effect ===
function typeWriter(text, element, speed = 40) {
    return new Promise((resolve) => {
        let i = 0;
        let aborted = false;

        state.typewriterAbort = () => {
            aborted = true;
            element.textContent = text;
            state.typewriterAbort = null;
            resolve();
        };

        function tick() {
            if (aborted) return;
            if (i < text.length) {
                element.textContent += text.charAt(i);
                i++;
                // Pause longer at punctuation
                const ch = text.charAt(i - 1);
                const delay = '。！？、，；'.includes(ch) ? speed * 3 :
                              '.,!?;'.includes(ch) ? speed * 2 : speed;
                setTimeout(tick, delay);
            } else {
                state.typewriterAbort = null;
                resolve();
            }
        }

        tick();
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// === UI Helpers ===
function updateSendButton(disabled) {
    const btn = document.getElementById('btn-send');
    if (btn) btn.disabled = disabled;
}

function formatMarkdown(text) {
    if (!text) return '';
    let html = escapeHtml(text);
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\n/g, '<br>');
    return html;
}
