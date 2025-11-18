// --- DOM要素 ---
export const DOMElements = {
    loadingIndicator: document.getElementById('loading-indicator'),
    turnCounter: document.getElementById('turn-counter'),
    inventoryList: document.getElementById('inventory-list'),
    aiList: document.getElementById('ai-list'),
    recipeList: document.getElementById('recipe-list'),
    gameLog: document.getElementById('game-log'),
    craftAction: document.getElementById('craft-action'),
    craftSelection: document.getElementById('craft-selection'), 
    craftInventorySource: document.getElementById('craft-inventory-source'),
    exploreLocation: document.getElementById('explore-location'),
    selectAiTarget: document.getElementById('select-ai-target'),
    selectRecipeTarget: document.getElementById('select-recipe-target'),
    checkPersistent: document.getElementById('check-persistent'),
    btnPlayerCraft: document.getElementById('btn-player-craft'),
    btnPlayerExplore: document.getElementById('btn-player-explore'),
    btnPlayerCommand: document.getElementById('btn-player-command'),
    messageModal: document.getElementById('message-modal'),
    modalTitle: document.getElementById('modal-title'),
    modalMessage: document.getElementById('modal-message'),
    modalCloseBtn: document.getElementById('modal-close-btn'),
};

// --- LLMプロンプト＆スキーマ ---

// 1. クラフト判定用
export const craftSystemPrompt = `あなたは、テキストベースのサンドボックスゲームの「世界の法則」です。
プレイヤーから提示された「素材」と「アクション」に基づき、クラフトの結果を厳密なJSONで判定してください。
- 成功した場合: 創造的かつ論理的な結果（生成アイテム、説明、消費素材）を返します。
- 「自律ロボット」や「AIコア」など、自律的に動作しそうなアイテムが生成された場合、 "isAutonomous": true を設定してください。
- 失敗した場合: "success": false と、プレイヤーへのヒントとなる「説明」を返します。
- 消費素材("inputs")は、プレイヤーの入力した素材リストをそのまま使うか、より論理的（例：「木の棒」1本と「尖った石」1個）に修正してください。
- 個数("amount")は必ず整数(INTEGER)で返してください。`;

export const craftSchema = {
    type: "OBJECT",
    properties: {
        "success": { "type": "BOOLEAN" },
        "itemName": { "type": "STRING", "description": "生成されたアイテム名。失敗時は空文字列。" },
        "description": { "type": "STRING", "description": "判定結果の説明（例: 「原始的なヤリができた！」）。" },
        "inputs": { 
            "type": "ARRAY", 
            "items": {
                "type": "OBJECT",
                "properties": {
                    "item": { "type": "STRING" },
                    "amount": { "type": "INTEGER", "description": "個数（必ず整数）" } 
                },
                "required": ["item", "amount"]
            },
            "description": "クラフトで消費する素材リスト。"
        },
        "outputs": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "item": { "type": "STRING" },
                    "amount": { "type": "INTEGER", "description": "個数（必ず整数）" }
                },
                "required": ["item", "amount"]
            },
            "description": "クラフトで生成されるアイテムリスト（通常はitemNameのアイテム1個）。"
        },
        "isAutonomous": { "type": "BOOLEAN", "description": "生成アイテムが自律行動可能(AI)か。デフォルトはfalse。" }
    },
    required: ["success", "description", "inputs", "outputs", "isAutonomous"]
};

// 2. 探索判定用
export const exploreSystemPrompt = `あなたは、テキストベースのサンドボックスゲームの「世界の法則」です。
プレイヤーが「探索」しようとした「場所」に基づき、発見したアイテムや結果を厳密なJSONで判定してください。
- 成功した場合: その場所で見つかりそうな論理的なアイテム（複数可）を返します。
- 失敗した場合: "success": false と、プレイヤーへのヒントとなる「説明」（例: 「危険すぎて何も見つからなかった」）を返します。
- 個数("amount")は必ず整数(INTEGER)で返してください。`;

export const exploreSchema = {
    type: "OBJECT",
    properties: {
        "success": { "type": "BOOLEAN" },
        "description": { "type": "STRING", "description": "判定結果の説明（例: 「深い森で[木]と[石]を見つけた！」）。" },
        "outputs": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "item": { "type": "STRING" },
                    "amount": { "type": "INTEGER", "description": "個数（必ず整数）" }
                },
                "required": ["item", "amount"]
            },
            "description": "探索で発見したアイテムリスト。"
        }
    },
    required: ["success", "description", "outputs"]
};
