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
        this.charId = null;
        // User-adjustable scale multiplier (0.3 ~ 1.5)
        this.userScale = parseFloat(localStorage.getItem('galgame_model_scale') || '0.5');

        /**
         * 表情 → 动作映射表 (从后端 config.yml 加载)
         * key: 表情名称 (如 "happy", "angry")
         * value: { expression: "expName", group: "motionGroupName", index: 0 }
         */
        this.expressionMotionMap = {};

        /**
         * 情感关键词 → 表情索引映射
         */
        this.emotionExpressionMap = {};
    }

    async init(charId, modelPath) {
        const canvas = document.getElementById(this.canvasId);
        if (!canvas) {
            console.error('Canvas not found:', this.canvasId);
            return false;
        }

        this.charId = charId;

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

            // Load expression-motion mapping from backend
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
        this.model.anchor.set(0.5, 0.5);
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
            this.dragStartX = e.data.global.x;
            this.dragStartY = e.data.global.y;
        });

        this.model.on('pointermove', (e) => {
            if (this.isDragging) {
                const dx = e.data.global.x - this.dragStartX;
                const dy = e.data.global.y - this.dragStartY;
                
                if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
                    this.hasMoved = true;
                }

                this.offsetX += dx;
                this.offsetY += dy;
                this.dragStartX = e.data.global.x;
                this.dragStartY = e.data.global.y;
                
                this.onResize();
            }
        });

        const onDragEnd = () => {
            this.isDragging = false;
            if (!this.hasMoved) {
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

        const baseScale = Math.min(w / 1000, h / 1200);
        const scale = baseScale * this.userScale;
        this.model.scale.set(scale);

        this.model.x = w / 2 + (this.offsetX || 0);
        this.model.y = h * 0.5 + (this.offsetY || 0);
    }

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
        if (!this.charId) return;

        try {
            const resp = await fetch(`/api/mappings/${this.charId}`);
            const mappings = await resp.json();
            
            if (mappings && Object.keys(mappings).length > 0) {
                this.expressionMotionMap = {};
                this.parseMappingData(mappings);
                console.log('Loaded mappings from backend:', this.expressionMotionMap);
            }
        } catch (e) {
            console.warn('Failed to load mappings from backend:', e);
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

        try {
            const settings = this.model.internalModel.settings;
            const expressions = settings.expressions || [];

            this.emotionExpressionMap = {};
            expressions.forEach((exp, index) => {
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
     * @param {string} emotion - 情感关键词
     */
    playEmotionMotion(emotion) {
        if (!this.model || !this.ready) return 'neutral';

        const key = (emotion || 'neutral').toLowerCase().trim();
        const mapping = this.expressionMotionMap[key];

        // 1. Expression Mapping
        if (mapping && mapping.expression) {
            const targetExpIndex = this.emotionExpressionMap[mapping.expression];
            if (targetExpIndex !== undefined) {
                this.setExpression(targetExpIndex);
            }
        }

        // 2. Motion Mapping
        if (mapping && mapping.group !== null && mapping.index !== null && mapping.group !== undefined) {
            this.playMotion(mapping.group, mapping.index);
            return key;
        } else {
            // Default motion
            try {
                this.playMotion('', Math.floor(Math.random() * 3));
            } catch (e) {
                this.playMotion('Idle', 0);
            }
            return key;
        }
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

window.Live2DHelper = Live2DHelper;
