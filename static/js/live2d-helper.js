/**
 * AI Live2D Galgame - Live2D 辅助模块
 * 封装 pixi-live2d-display 的模型加载与控制
 * 支持动态表情-动作映射
 */

class Live2DHelper {
    constructor(canvasId) {
        this.canvasId = canvasId;
        this.app = null;
        this.model = null;
        this.ready = false;
        // User-adjustable scale multiplier (0.3 ~ 1.5)
        this.userScale = parseFloat(localStorage.getItem('galgame_model_scale') || '0.5');

        /**
         * 表情 → 动作映射表 (从设置页面配置加载)
         * key: 表情名称 (如 "happy", "angry")
         * value: { group: "motionGroupName", index: 0 }
         */
        this.expressionMotionMap = {};

        /**
         * 情感关键词 → 表情名称映射
         * AI 回复中的 emotion tag 会映射到对应的表情
         */
        this.emotionExpressionMap = {};
    }

    async init(modelPath) {
        const canvas = document.getElementById(this.canvasId);
        if (!canvas) {
            console.error('Canvas not found:', this.canvasId);
            return false;
        }

        try {
            if (!this.app) {
                // Initialize PixiJS Application
                this.app = new PIXI.Application({
                    view: canvas,
                    autoStart: true,
                    resizeTo: window,
                    transparent: true,
                    backgroundAlpha: 0,
                    antialias: true,
                    resolution: window.devicePixelRatio || 1,
                    autoDensity: true,
                });

                // Handle window resize ONLY ONCE
                window.addEventListener('resize', () => this.onResize());
            }

            // Remove old model if it exists
            if (this.model) {
                this.app.stage.removeChild(this.model);
                this.model.destroy();
                this.model = null;
            }

            // Load Live2D model
            console.log('Loading Live2D model from:', modelPath);
            this.model = await PIXI.live2d.Live2DModel.from(modelPath, {
                autoInteract: false,
                autoUpdate: true,
            });

            // Configure model
            this.setupModel();
            this.app.stage.addChild(this.model);

            this.onResize();

            this.ready = true;
            console.log('Live2D model loaded successfully');

            // Load expression-motion mapping from backend config.yml
            await this.loadMappings();

            // Build emotion-to-expression map from model's expressions
            this.buildEmotionExpressionMap();

            // Play idle animation
            this.playMotion('Idle', 0);

            return true;
        } catch (error) {
            console.error('Failed to load Live2D model:', error);
            return false;
        }
    }

    setupModel() {
        if (!this.model) return;
        // Center and scale
        this.model.anchor.set(0.5, 0.5);
        // Enable interaction
        this.model.interactive = true;
        this.model.buttonMode = true;

        this.offsetX = 0;
        this.offsetY = 0;
        this.isDragging = false;
        this.dragStartX = 0;
        this.dragStartY = 0;
        this.hasMoved = false;

        this.model.on('pointerdown', (e) => {
            this.isDragging = true;
            this.hasMoved = false;
            // Record the initial global coordinates
            this.dragStartX = e.data.global.x;
            this.dragStartY = e.data.global.y;
        });

        this.model.on('pointermove', (e) => {
            if (this.isDragging) {
                const dx = e.data.global.x - this.dragStartX;
                const dy = e.data.global.y - this.dragStartY;
                
                // If moved more than 5 pixels, consider it a drag
                if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
                    this.hasMoved = true;
                }

                this.offsetX += dx;
                this.offsetY += dy;
                this.dragStartX = e.data.global.x;
                this.dragStartY = e.data.global.y;
                
                this.onResize(); // Re-apply position
            }
        });

        const onDragEnd = () => {
            this.isDragging = false;
            // If it was a click without dragging, trigger 'tap'
            if (!this.hasMoved) {
                console.log('Character clicked/tapped');
                this.playEmotionMotion('tap');
            }
        };

        this.model.on('pointerup', onDragEnd);
        this.model.on('pointerupoutside', onDragEnd);
    }

    onResize() {
        if (!this.model || !this.app) return;
        const w = window.innerWidth;
        const h = window.innerHeight;

        // Base scale calculation, then multiply by user scale
        const baseScale = Math.min(w / 1000, h / 1200);
        const scale = baseScale * this.userScale;
        this.model.scale.set(scale);

        // Position: center + offset
        this.model.x = w / 2 + (this.offsetX || 0);
        this.model.y = h * 0.5 + (this.offsetY || 0);
    }

    /**
     * Set model scale (0.3 ~ 1.5)
     * @param {number} scale
     */
    setScale(scale) {
        this.userScale = Math.max(0.3, Math.min(1.5, scale));
        localStorage.setItem('galgame_model_scale', this.userScale.toString());
        this.onResize();
    }

    getScale() {
        return this.userScale;
    }

    /**
     * 加载表情-动作映射配置
     */
    async loadMappings() {
        const charId = localStorage.getItem('galgame_character');
        if (!charId) return;

        try {
            // 首先尝试从后端获取 config.yml 的配置
            const resp = await fetch(`/api/mappings/${charId}`);
            const mappings = await resp.json();
            
            if (mappings && Object.keys(mappings).length > 0) {
                // Convert mapping config to helper's internal format
                this.expressionMotionMap = {};
                this.parseMappingData(mappings);
                console.log('Loaded mappings from backend config.yml:', this.expressionMotionMap);
            } else {
                // 如果后端没有配置，尝试回退到 localStorage (兼容旧版本)
                const saved = localStorage.getItem(`galgame_mapping_${charId}`);
                if (saved) {
                    // ... (保持原有的解析逻辑，或者简单合并)
                    const localMappings = JSON.parse(saved);
                    // (此处省略详细解析逻辑以节省篇幅，实际应用中可以复用上面的循环)
                    this.parseMappingData(localMappings);
                }
            }
        } catch (e) {
            console.warn('Failed to load mappings from backend:', e);
            // Error fallback: try localStorage
            try {
                const saved = localStorage.getItem(`galgame_mapping_${charId}`);
                if (saved) this.parseMappingData(JSON.parse(saved));
            } catch (e2) {}
        }
    }

    /**
     * 将映射数据解析为内部格式
     */
    parseMappingData(mappings) {
        if (!mappings) return;
        for (const [expName, config] of Object.entries(mappings)) {
            let motionGroup = null;
            let motionIndex = null;
            let expressionName = null;

            if (typeof config === 'string') {
                const parts = config.split(':');
                if (parts.length === 2) {
                    motionGroup = parts[0];
                    motionIndex = parseInt(parts[1], 10);
                }
            } else if (typeof config === 'object' && config !== null) {
                expressionName = config.expression || null;
                if (config.motion) {
                    const parts = config.motion.split(':');
                    if (parts.length === 2) {
                        motionGroup = parts[0];
                        motionIndex = parseInt(parts[1], 10);
                    }
                }
            }

            this.expressionMotionMap[expName.toLowerCase()] = {
                expression: expressionName ? expressionName.toLowerCase().replace('.exp3.json', '') : null,
                group: motionGroup,
                index: motionIndex,
            };
        }
    }

    /**
     * 根据模型的表情文件名构建 emotion → expression 映射
     */
    buildEmotionExpressionMap() {
        if (!this.model || !this.model.internalModel) return;

        // 获取模型的表情列表
        try {
            const settings = this.model.internalModel.settings;
            const expressions = settings.expressions || [];

            this.emotionExpressionMap = {};
            expressions.forEach((exp, index) => {
                // 从文件名提取表情名
                const name = (exp.Name || exp.name || '').replace('.exp3.json', '').toLowerCase();
                if (name) {
                    this.emotionExpressionMap[name] = index;
                }
            });
            console.log('Emotion-Expression map:', this.emotionExpressionMap);
        } catch (e) {
            console.warn('Could not build emotion-expression map:', e);
        }
    }

    playMotion(group, index = 0) {
        if (!this.model || !this.ready) return;
        try {
            this.model.motion(group, index);
        } catch (e) {
            console.warn('Motion play failed:', group, index, e);
        }
    }

    /**
     * 设置表情
     * @param {number} index - 表情索引
     */
    setExpression(index) {
        if (!this.model || !this.ready) return;
        try {
            this.model.expression(index);
        } catch (e) {
            console.warn('Expression set failed:', index, e);
        }
    }

    /**
     * 根据情感标签播放对应的表情和动作
     * @param {string} emotion - 情感关键词 (如 'happy', 'angry' 等)
     * @returns {string} 实际使用的情感关键词
     */
    playEmotionMotion(emotion) {
        if (!this.model || !this.ready) return 'neutral';

        const key = (emotion || 'neutral').toLowerCase().trim();
        console.log(`Processing emotion: "${key}"`);

        const mapping = this.expressionMotionMap[key];

        // 1. Strict Expression Mapping
        if (mapping && mapping.expression) {
            const targetExpIndex = this.emotionExpressionMap[mapping.expression];
            if (targetExpIndex !== undefined) {
                console.log(`Setting mapped expression: ${mapping.expression} (index: ${targetExpIndex})`);
                this.setExpression(targetExpIndex);
            } else {
                console.warn(`Mapped expression not found: ${mapping.expression}`);
            }
        } else {
            console.log(`No expression mapped for emotion: "${key}"`);
        }

        // 2. Strict Motion Mapping
        if (mapping && mapping.group !== null && mapping.index !== null && mapping.group !== undefined) {
            console.log(`Playing mapped motion: ${mapping.group}[${mapping.index}]`);
            this.playMotion(mapping.group, mapping.index);
            return key;
        } else {
            // Default motion if no explicit motion is mapped
            console.log(`Emotion "${key}" not mapped to a motion, using default motion`);
        try {
            // Try to play a motion from the default group (empty string key or "Idle")
            this.playMotion('', Math.floor(Math.random() * 3));
        } catch (e) {
            this.playMotion('Idle', 0);
        }

        return key;
    }
    }

    /**
     * 获取所有支持的表情列表
     */
    getSupportedEmotions() {
        return Object.keys(this.emotionExpressionMap);
    }

    destroy() {
        if (this.app) {
            this.app.destroy(true);
            this.app = null;
            this.model = null;
            this.ready = false;
        }
    }
}

// Export as global
window.Live2DHelper = Live2DHelper;
