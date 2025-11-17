// --- Gemini API設定 ---
const apiKey = ""; // APIキーは不要です
const geminiApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;

// --- ゲームの状態 ---
let inventory = new Map();
let recipes = new Map();
let ais = new Map();
let recipeCache = new Map();
let turn = 0;
let aiCounter = 0;
let recipeCounter = 0;
let isLoading = false;
let craftMaterialsSelected = new Set(); // クラフト選択中の素材

// --- DOM要素 ---
const DOMElements = {
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
const craftSystemPrompt = `あなたは、テキストベースのサンドボックスゲームの「世界の法則」です。
プレイヤーから提示された「素材」と「アクション」に基づき、クラフトの結果を厳密なJSONで判定してください。
- 成功した場合: 創造的かつ論理的な結果（生成アイテム、説明、消費素材）を返します。
- 「自律ロボット」や「AIコア」など、自律的に動作しそうなアイテムが生成された場合、 "isAutonomous": true を設定してください。
- 失敗した場合: "success": false と、プレイヤーへのヒントとなる「説明」を返します。
- 消費素材("inputs")は、プレイヤーの入力した素材リストをそのまま使うか、より論理的（例：「木の棒」1本と「尖った石」1個）に修正してください。
- 個数("amount")は必ず整数(INTEGER)で返してください。`;

const craftSchema = {
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
const exploreSystemPrompt = `あなたは、テキストベースのサンドボックスゲームの「世界の法則」です。
プレイヤーが「探索」しようとした「場所」に基づき、発見したアイテムや結果を厳密なJSONで判定してください。
- 成功した場合: その場所で見つかりそうな論理的なアイテム（複数可）を返します。
- 失敗した場合: "success": false と、プレイヤーへのヒントとなる「説明」（例: 「危険すぎて何も見つからなかった」）を返します。
- 個数("amount")は必ず整数(INTEGER)で返してください。`;

const exploreSchema = {
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


// --- 初期化 ---
function initializeGame() {
    // 初期アイテム
    updateInventory("木の棒", 10);
    updateInventory("尖った石", 5);
    updateInventory("不思議なコア", 1);
    updateInventory("壊れた機械", 1);

    // イベントリスナー設定
    DOMElements.btnPlayerCraft.addEventListener('click', handlePlayerCraft);
    DOMElements.btnPlayerExplore.addEventListener('click', handlePlayerExplore);
    DOMElements.btnPlayerCommand.addEventListener('click', handlePlayerCommand);
    DOMElements.modalCloseBtn.addEventListener('click', closeModal);

    addLog("ようこそ！世界はまだ何も定義されていません。", "system");
    addLog("「クラフト」や「探索」で世界を開拓しましょう。", "system");
    
    renderAll();
}

// --- ターン管理 ---
function nextTurn() {
    turn++;
    DOMElements.turnCounter.textContent = `TURN: ${turn}`;
    addLog(`--- ターン ${turn} 終了 ---`, "system-turn");
    
    // AIのターンを実行
    runAiTurn();
    
    // プレイヤーのターン開始
    addLog(`--- ターン ${turn + 1} 開始 ---`, "system-turn");
    setLoading(false); // プレイヤーの操作を許可
}

// --- UIレンダリング ---
function renderAll() {
    renderInventory();
    renderAIs();
    renderRecipes();
    renderLog();
    updateAiSelectors();
    renderCraftInventorySource(); // クラフトUI更新
    renderCraftSelection(); // クラフトUI更新
}

function renderInventory() {
    DOMElements.inventoryList.innerHTML = "";
    if (inventory.size === 0) {
        DOMElements.inventoryList.innerHTML = `<span class="text-gray-500 col-span-full text-center p-4">インベントリは空です...</span>`;
        return;
    }
    // アイテム名でソート
    const sortedInventory = [...inventory.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    
    for (const [item, amount] of sortedInventory) {
        const itemEl = document.createElement('div');
        itemEl.className = "bg-gray-700 rounded-md p-2 shadow text-center";
        itemEl.innerHTML = `
            <span class="font-medium text-white">${item}</span>
            <span class="block text-sm text-gray-300">x ${amount}</span>
        `;
        DOMElements.inventoryList.appendChild(itemEl);
    }
}

function renderAIs() {
    DOMElements.aiList.innerHTML = "";
    if (ais.size === 0) {
        DOMElements.aiList.innerHTML = `<span class="text-gray-500 text-center p-4">AIはまだいません...</span>`;
        return;
    }
    [...ais.values()].sort((a, b) => a.id.localeCompare(b.id)).forEach(ai => {
        const aiEl = document.createElement('div');
        aiEl.className = "bg-gray-700 rounded-md p-3 shadow";
        
        let recipeName = "待機中";
        let persistentText = "";
        if (ai.assignedRecipeId) {
            const recipe = recipes.get(ai.assignedRecipeId);
            recipeName = recipe ? `実行中: ${recipe.name}` : "不明なレシピ";
            if (ai.isPersistent) {
                persistentText = `<span class="text-xs font-mono text-purple-300">[永続]</span>`;
            }
        }
        
        aiEl.innerHTML = `
            <div class="flex justify-between items-center">
                <span class="font-bold text-lg text-white">${ai.name} <span class="text-sm font-mono text-gray-400">(${ai.id})</span></span>
                ${persistentText}
            </div>
            <div class="text-sm text-gray-300">${recipeName}</div>
        `;
        DOMElements.aiList.appendChild(aiEl);
    });
}

// ★変更: レシピクリック実行機能
function renderRecipes() {
    DOMElements.recipeList.innerHTML = "";
    if (recipes.size === 0) {
        DOMElements.recipeList.innerHTML = `<span class="text-gray-500 text-center p-4">発見済みのレシピはありません...</span>`;
        return;
    }
    [...recipes.values()].sort((a, b) => a.id.localeCompare(b.id)).forEach(recipe => {
        const recipeEl = document.createElement('div');
        
        let icon = "💡";
        let color = "text-white";
        let cursorStyle = ""; // カーソルスタイル用

        if(recipe.type === 'craft') { 
            icon = "🔧"; 
            color = "text-blue-300";
            cursorStyle = "cursor-pointer hover:bg-gray-600"; // クリック可能
        }
        if(recipe.type === 'explore') { 
            icon = "🌲"; 
            color = "text-green-300";
            cursorStyle = "cursor-pointer hover:bg-gray-600"; // クリック可能
        }
        if(recipe.type === 'command') { 
            icon = "🤖"; 
            color = "text-purple-300";
            cursorStyle = "cursor-not-allowed"; // クリック不可
        }

        recipeEl.className = `bg-gray-700 rounded-md p-2 shadow text-sm ${cursorStyle} transition-colors duration-150`; // スタイル適用

        recipeEl.innerHTML = `
            <div class="font-semibold ${color}">${icon} ${recipe.name} <span class="font-mono text-xs text-gray-400">(${recipe.id})</span></div>
            <div class="text-xs text-gray-300 pl-5">${recipe.description}</div>
        `;

        // クリックイベントリスナーを追加
        if (recipe.type === 'craft' || recipe.type === 'explore') {
            recipeEl.addEventListener('click', () => handlePlayerExecuteRecipe(recipe));
        }

        DOMElements.recipeList.appendChild(recipeEl);
    });
}

function renderLog() {
    // ログ追加時に自動スクロール
}

function addLog(message, type = "normal") {
    const logEl = document.createElement('div');
    let colorClass = "text-gray-300";
    if (type === "success") colorClass = "text-green-400";
    if (type === "error") colorClass = "text-red-400";
    if (type === "system") colorClass = "text-yellow-300";
    if (type === "system-turn") colorClass = "text-gray-500 text-center font-mono text-xs";
    if (type === "ai") colorClass = "text-cyan-300";
    if (type === "ai-command") colorClass = "text-purple-300";

    logEl.className = `break-words ${colorClass}`;
    logEl.textContent = message;
    DOMElements.gameLog.appendChild(logEl);
    
    // 常に最下部にスクロール
    DOMElements.gameLog.scrollTop = DOMElements.gameLog.scrollHeight;
}

// --- クラフトパネルUI関連 ---

function renderCraftInventorySource() {
    DOMElements.craftInventorySource.innerHTML = "";
    const sortedInventory = [...inventory.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    
    let hasItems = false;
    sortedInventory.forEach(([item, amount]) => {
        if (amount > 0) {
            hasItems = true;
            const button = document.createElement('button');
            
            if (craftMaterialsSelected.has(item)) {
                button.className = "bg-blue-600 text-white ring-2 ring-blue-400 p-1.5 rounded text-xs transition-colors duration-150";
            } else {
                button.className = "bg-gray-700 hover:bg-gray-600 p-1.5 rounded text-xs transition-colors duration-150";
            }
            button.textContent = `${item} (x${amount})`;
            button.dataset.item = item;
            button.addEventListener('click', () => toggleCraftMaterial(item));
            DOMElements.craftInventorySource.appendChild(button);
        }
    });

    if (!hasItems) {
        DOMElements.craftInventorySource.innerHTML = `<span class="text-gray-500 text-sm">インベントリに素材がありません</span>`;
    }
}

function toggleCraftMaterial(item) {
    if (isLoading) return; 
    if (craftMaterialsSelected.has(item)) {
        craftMaterialsSelected.delete(item);
    } else {
        craftMaterialsSelected.add(item);
    }
    renderCraftInventorySource(); 
    renderCraftSelection(); 
}

function renderCraftSelection() {
    DOMElements.craftSelection.innerHTML = ""; 
    if (craftMaterialsSelected.size === 0) {
        DOMElements.craftSelection.innerHTML = `<span id="craft-selection-placeholder" class="text-gray-500 text-sm">↓のインベントリから選択</span>`;
    } else {
        craftMaterialsSelected.forEach(item => {
            const el = document.createElement('span');
            el.className = "bg-blue-600 text-white rounded px-2 py-0.5 text-sm font-medium";
            el.textContent = item;
            DOMElements.craftSelection.appendChild(el);
        });
    }
}

// --- UIヘルパー ---
function setLoading(isLoadingFlag) {
    isLoading = isLoadingFlag;
    if (isLoading) {
        DOMElements.loadingIndicator.classList.remove('hidden');
        DOMElements.loadingIndicator.classList.add('flex');
        DOMElements.btnPlayerCraft.disabled = true;
        DOMElements.btnPlayerExplore.disabled = true;
        DOMElements.btnPlayerCommand.disabled = true;
    } else {
        DOMElements.loadingIndicator.classList.add('hidden');
        DOMElements.loadingIndicator.classList.remove('flex');
        DOMElements.btnPlayerCraft.disabled = false;
        DOMElements.btnPlayerExplore.disabled = false;
        DOMElements.btnPlayerCommand.disabled = false;
    }
}

function showModal(title, message) {
    DOMElements.modalTitle.textContent = title;
    DOMElements.modalMessage.textContent = message;
    DOMElements.messageModal.classList.remove('hidden');
}

function closeModal() {
    DOMElements.messageModal.classList.add('hidden');
}

function updateAiSelectors() {
    const currentAi = DOMElements.selectAiTarget.value;
    const currentRecipe = DOMElements.selectRecipeTarget.value;

    DOMElements.selectAiTarget.innerHTML = `<option value="">指示対象のAIを選択...</option>`;
    [...ais.values()].sort((a, b) => a.id.localeCompare(b.id)).forEach(ai => {
        const option = document.createElement('option');
        option.value = ai.id;
        option.textContent = `${ai.name} (${ai.id})`;
        DOMElements.selectAiTarget.appendChild(option);
    });

    DOMElements.selectRecipeTarget.innerHTML = `<option value="">実行させるレシピを選択...</option>`;
    [...recipes.values()].sort((a, b) => a.id.localeCompare(b.id)).forEach(recipe => {
        const option = document.createElement('option');
        option.value = recipe.id;
        option.textContent = `${recipe.name} (${recipe.id})`;
        DOMElements.selectRecipeTarget.appendChild(option);
    });

    if ([...DOMElements.selectAiTarget.options].some(o => o.value === currentAi)) {
        DOMElements.selectAiTarget.value = currentAi;
    }
    if ([...DOMElements.selectRecipeTarget.options].some(o => o.value === currentRecipe)) {
        DOMElements.selectRecipeTarget.value = currentRecipe;
    }
}

// --- ゲームロジック: インベントリ ---
function updateInventory(item, amount) {
    const intAmount = Math.round(amount);
    if (intAmount === 0) return;

    const currentAmount = inventory.get(item) || 0;
    const newAmount = currentAmount + intAmount;

    if (newAmount <= 0) {
        inventory.delete(item);
    } else {
        inventory.set(item, newAmount);
    }
}

function checkMaterials(inputs) {
    if (!inputs || inputs.length === 0) return true; 
    for (const input of inputs) {
        if ((inventory.get(input.item) || 0) < input.amount) {
            return false; 
        }
    }
    return true;
}

function consumeMaterials(inputs) {
    if (!inputs || inputs.length === 0) return true;
    if (checkMaterials(inputs)) {
        for (const input of inputs) {
            updateInventory(input.item, -input.amount);
        }
        return true;
    }
    return false;
}

// --- ゲームロジック: プレイヤーアクション ---

async function handlePlayerCraft() {
    const inputItems = [...craftMaterialsSelected];
    const action = DOMElements.craftAction.value;

    if (inputItems.length === 0 || !action) {
        showModal("入力エラー", "「素材」をインベントリから選択し、「アクション」を入力してください。");
        return;
    }

    setLoading(true);

    const cacheKey = `craft:${inputItems.sort().join('|')}:${action}`;

    if (recipeCache.has(cacheKey)) {
        addLog("（キャッシュから実行）", "system");
        const cachedResult = recipeCache.get(cacheKey);
        processRecipeResult(cachedResult.id, cachedResult.result, 'craft');
    } else {
        const userQuery = `クラフト判定: 素材=[${inputItems.map(i => `"${i}"`).join(', ')}], アクション="${action}"`;
        const result = await callLLM(craftSystemPrompt, userQuery, craftSchema);
        if (result) {
            processRecipeResult(null, result, 'craft', action);
        } else {
            addLog("LLMの判定に失敗しました。世界が応答しません...", "error");
            setLoading(false); 
        }
    }
    
    DOMElements.craftAction.value = "";
    craftMaterialsSelected.clear(); 
    renderCraftInventorySource(); 
    renderCraftSelection(); 
}

async function handlePlayerExplore() {
    const location = DOMElements.exploreLocation.value;
    if (!location) {
        showModal("入力エラー", "「探索場所」を入力してください。");
        return;
    }

    setLoading(true);
    const cacheKey = `explore:${location}`;

    if (recipeCache.has(cacheKey)) {
        addLog("（キャッシュから実行）", "system");
        const cachedResult = recipeCache.get(cacheKey);
        processRecipeResult(cachedResult.id, cachedResult.result, 'explore');
    } else {
        const userQuery = `探索判定: 場所="${location}"`;
        const result = await callLLM(exploreSystemPrompt, userQuery, exploreSchema);
        if (result) {
            processRecipeResult(null, result, 'explore', location);
        } else {
            addLog("LLMの判定に失敗しました。世界が応答しません...", "error");
            setLoading(false); 
        }
    }
    
    DOMElements.exploreLocation.value = "";
}

function handlePlayerCommand() {
    const aiId = DOMElements.selectAiTarget.value;
    const recipeId = DOMElements.selectRecipeTarget.value;
    const isPersistent = DOMElements.checkPersistent.checked;

    if (!aiId || !recipeId) {
        showModal("入力エラー", "「指示対象のAI」と「実行させるレシピ」の両方を選択してください。");
        return;
    }

    setLoading(true);

    const ai = ais.get(aiId);
    const recipe = recipes.get(recipeId);

    if (!ai || !recipe) {
        showModal("エラー", "選択されたAIまたはレシピが見つかりません。");
        setLoading(false);
        return;
    }

    ai.assignedRecipeId = recipeId;
    ai.isPersistent = isPersistent;

    addLog(`[${ai.name}]に「${recipe.name}」を${isPersistent ? '[永続]' : ''}指示しました。`, "success");

    const commandRecipeId = `R-${String(++recipeCounter).padStart(3, '0')}`;
    const commandRecipeName = `指示: ${ai.name}に[${recipe.name}]を実行`;
    const commandRecipeDesc = `${ai.name}(${ai.id})に${recipe.name}(${recipe.id})を${isPersistent ? '永続実行' : '単発実行'}させる`;
    
    const newRecipe = {
        id: commandRecipeId,
        name: commandRecipeName,
        description: commandRecipeDesc,
        type: 'command',
        targetAiId: aiId,
        targetRecipeId: recipeId,
        isPersistent: isPersistent,
        inputs: [], 
        outputs: []
    };

    recipes.set(commandRecipeId, newRecipe);
    addLog(`新しい[指示レシピ]「${commandRecipeName}」(${commandRecipeId})が発見されました。`, "system");
    
    DOMElements.selectAiTarget.value = "";
    DOMElements.selectRecipeTarget.value = "";
    DOMElements.checkPersistent.checked = false;

    nextTurn();
}

// --- ★新規: プレイヤーによる既知レシピ実行 ---
function handlePlayerExecuteRecipe(recipe) {
    if (isLoading) return; // 実行中は何もしない
    if (recipe.type === 'command') return; // 指示レシピは実行不可

    setLoading(true);

    // 1. 素材チェック
    if (!checkMaterials(recipe.inputs)) {
        showModal("素材不足", `「${recipe.name}」の実行に必要な素材がありません。`);
        setLoading(false); // ターン消費なし
        return;
    }

    // 2. 素材消費
    consumeMaterials(recipe.inputs);

    // 3. アイテム生成
    recipe.outputs.forEach(output => {
        updateInventory(output.item, output.amount);
    });
    addLog(`プレイヤーが「${recipe.name}」を実行。 ( ${recipe.outputs.map(o => `${o.item}x${o.amount}`).join(', ')} )`, "success"); // プレイヤーの成功ログ

    // 4. AI生成チェック
    if (recipe.type === 'craft' && recipe.isAutonomous && recipe.autonomousItemName) {
        const newAiId = `AI-${String(++aiCounter).padStart(3, '0')}`;
        const newAi = {
            id: newAiId,
            name: recipe.autonomousItemName,
            assignedRecipeId: null,
            isPersistent: false
        };
        ais.set(newAiId, newAi);
        addLog(`プレイヤーが新しいAI [${newAi.name}] (${newAiId}) をクラフトしました！`, "success");
    }

    // 5. ターン終了
    nextTurn();
}


// --- ゲームロジック: AIターン ---
function runAiTurn() {
    addLog("--- AIターン開始 ---", "system-turn");
    let aiDidSomething = false;
    
    [...ais.values()].sort((a, b) => a.id.localeCompare(b.id)).forEach(ai => {
        if (ai.assignedRecipeId) {
            const recipe = recipes.get(ai.assignedRecipeId);
            if (recipe) {
                executeRecipe(ai, recipe);
                aiDidSomething = true;
            } else {
                addLog(`[${ai.name}]は不明なレシピ(${ai.assignedRecipeId})を実行しようとした。`, "error");
                ai.assignedRecipeId = null; 
            }
        }
    });

    if (!aiDidSomething && ais.size > 0) {
        addLog("全AIが待機中...", "ai");
    }

    renderAll(); 
    addLog("--- AIターン終了 ---", "system-turn");
}

// --- ゲームロジック: レシピ実行 ---

function processRecipeResult(existingRecipeId, result, type, actionName = "") {
    let turnConsumed = false;
    try {
        if (result.success) {
            if (!consumeMaterials(result.inputs)) {
                addLog(`「${actionName || 'クラフト'}」を実行しようとしたが、素材不足で失敗。`, "error");
                setLoading(false);
                return; 
            }
            
            turnConsumed = true; 

            result.outputs.forEach(output => {
                const amount = Math.max(0, Math.round(output.amount)); 
                if (amount > 0) { 
                    updateInventory(output.item, amount);
                }
            });
            
            // プレイヤーによるAI生成
            if (type === 'craft' && result.isAutonomous && result.itemName) {
                const newAiId = `AI-${String(++aiCounter).padStart(3, '0')}`;
                const newAi = {
                    id: newAiId,
                    name: result.itemName,
                    assignedRecipeId: null,
                    isPersistent: false
                };
                ais.set(newAiId, newAi);
                addLog(`新しいAI [${newAi.name}] (${newAiId}) が起動しました！`, "success");
            }

            // レシピ登録（新規の場合）
            let recipeId = existingRecipeId;
            if (!recipeId) {
                recipeId = `R-${String(++recipeCounter).padStart(3, '0')}`;
                let recipeName = "";
                let recipeDesc = "";
                let cacheKey = "";

                if (type === 'craft') {
                    recipeName = result.itemName || "謎のクラフト";
                    recipeDesc = `${result.inputs.map(i => `${i.item}x${i.amount}`).join('+')} => ${result.outputs.map(o => `${o.item}x${o.amount}`).join('+')}`;
                    const inputItems = [...craftMaterialsSelected];
                    cacheKey = `craft:${inputItems.sort().join('|')}:${actionName}`;
                
                } else if (type === 'explore') {
                    recipeName = `探索: ${actionName}`;
                    recipeDesc = `${actionName} => ${result.outputs.map(o => `${o.item}x${o.amount}`).join('+')}`;
                    cacheKey = `explore:${actionName}`;
                }
                
                const newRecipe = {
                    id: recipeId,
                    name: recipeName,
                    description: recipeDesc,
                    type: type,
                    inputs: result.inputs,
                    outputs: result.outputs,
                    isAutonomous: (type === 'craft' && result.isAutonomous) || false,
                    autonomousItemName: (type === 'craft' && result.isAutonomous) ? result.itemName : null
                };
                recipes.set(recipeId, newRecipe);

                if (cacheKey) {
                    recipeCache.set(cacheKey, { id: recipeId, result: result });
                }
                
                addLog(`新しい[${type}]レシピ「${recipeName}」(${recipeId})が発見されました！`, "system");
            }
            
            addLog(result.description, "success");

        } else {
            addLog(result.description, "error");
            turnConsumed = true; 
        }
    } catch (e) {
        console.error("レシピ結果の処理中にエラー:", e, result);
        addLog(`結果の処理中に予期せぬエラーが発生しました: ${e.message}`, "error");
        turnConsumed = true;
    }

    if (turnConsumed) {
        nextTurn();
    }
}


/**
 * AIがレシピを実行する
 */
function executeRecipe(ai, recipe) {
    if (!checkMaterials(recipe.inputs)) {
        addLog(`[${ai.name}]は「${recipe.name}」を実行しようとしたが、素材不足で失敗。`, "ai");
        
        if (ai.isPersistent) {
            addLog(`[${ai.name}]の永続指示は素材不足のため停止しました。`, "error");
            ai.assignedRecipeId = null;
            ai.isPersistent = false;
        }
        return; 
    }

    consumeMaterials(recipe.inputs);

    switch (recipe.type) {
        case 'craft':
            recipe.outputs.forEach(output => {
                updateInventory(output.item, output.amount);
            });
            addLog(`[${ai.name}]が「${recipe.name}」を実行。 ( ${recipe.outputs.map(o => `${o.item}x${o.amount}`).join(', ')} )`, "ai");

            if (recipe.isAutonomous && recipe.autonomousItemName) {
                const newAiId = `AI-${String(++aiCounter).padStart(3, '0')}`;
                const newAi = {
                    id: newAiId,
                    name: recipe.autonomousItemName, 
                    assignedRecipeId: null,
                    isPersistent: false
                };
                ais.set(newAiId, newAi);
                addLog(`[${ai.name}]が新しいAI [${newAi.name}] (${newAiId}) をクラフトしました！`, "success");
            }
            break;
        
        case 'explore':
            recipe.outputs.forEach(output => {
                updateInventory(output.item, output.amount);
            });
            addLog(`[${ai.name}]が「${recipe.name}」を実行。 ( ${recipe.outputs.map(o => `${o.item}x${o.amount}`).join(', ')} )`, "ai");
            break;
        
        case 'command':
            const targetAi = ais.get(recipe.targetAiId);
            if (targetAi) {
                const targetRecipe = recipes.get(recipe.targetRecipeId);
                if (targetRecipe) {
                    targetAi.assignedRecipeId = recipe.targetRecipeId;
                    targetAi.isPersistent = recipe.isPersistent;
                    addLog(`[${ai.name}]が[${targetAi.name}]に指示: 「${targetRecipe.name}」${recipe.isPersistent ? '[永続]' : ''}`, "ai-command");
                } else {
                    addLog(`[${ai.name}]は存在しないレシピ(${recipe.targetRecipeId})を指示しようとした。`, "error");
                }
            } else {
                addLog(`[${ai.name}]は存在しないAI(${recipe.targetAiId})に指示しようとした。`, "error");
            }
            break;
    }

    if (!ai.isPersistent) {
        ai.assignedRecipeId = null;
    }
}


// --- Gemini API 呼び出し (指数バックオフ付き) ---
async function callLLM(systemInstruction, userQuery, schema, retries = 3, delay = 1000) {
    const payload = {
        contents: [{ 
            role: "user", 
            parts: [{ text: userQuery }] 
        }],
        systemInstruction: {
            parts: [{ text: systemInstruction }]
        },
        generationConfig: {
            responseMimeType: "application/json",
            responseSchema: schema,
        }
    };

    try {
        const response = await fetch(geminiApiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`API error: ${response.status} ${response.statusText}. Body: ${errorBody}`);
        }

        const result = await response.json();
        
        if (result.candidates && result.candidates[0].content && result.candidates[0].content.parts[0].text) {
            const jsonText = result.candidates[0].content.parts[0].text;
            return JSON.parse(jsonText);
        } else {
            let errorInfo = "Invalid LLM response structure.";
            if (result.candidates && result.candidates[0].finishReason !== "STOP") {
                errorInfo = `LLM generation stopped: ${result.candidates[0].finishReason}`;
            } else if (result.promptFeedback) {
                errorInfo = `Prompt feedback: ${JSON.stringify(result.promptFeedback)}`;
            }
            throw new Error(errorInfo);
        }
    } catch (error) {
        console.error("LLM Call Error:", error);
        if (retries > 0) {
            addLog(`LLMの応答エラー。${delay/1000}秒後にリトライします...`, "system");
            await new Promise(res => setTimeout(res, delay));
            return callLLM(systemInstruction, userQuery, schema, retries - 1, delay * 2);
        } else {
            addLog(`LLMの呼び出しに${retries}回失敗しました: ${error.message}`, "error");
            return null;
        }
    }
}

// --- ゲーム開始 ---
window.onload = initializeGame;
