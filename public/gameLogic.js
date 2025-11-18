import { DOMElements, craftSystemPrompt, craftSchema, exploreSystemPrompt, exploreSchema } from './constants.js';
import * as state from './state.js';
import * as ui from './ui.js';
import { callLLM } from './api.js';

// --- ターン管理 ---
function nextTurn() {
    const newTurn = state.incrementTurn();
    ui.addLog(`--- ターン ${newTurn -1} 終了 ---`, "system-turn");
    
    // AIのターンを実行
    runAiTurn();
    
    // プレイヤーのターン開始
    ui.addLog(`--- ターン ${newTurn} 開始 ---`, "system-turn");
    setLoading(false); // プレイヤーの操作を許可
}

// --- UIと状態の連動ヘルパー ---
function setLoading(isLoading) {
    state.setLoading(isLoading);
    ui.updateLoadingUI(isLoading);
}

// --- ゲームロジック: プレイヤーアクション ---

export async function handlePlayerCraft() {
    const inputItems = [...state.getCraftMaterialsSelected()];
    const action = DOMElements.craftAction.value;

    if (inputItems.length === 0 || !action) {
        ui.showModal("入力エラー", "「素材」をインベントリから選択し、「アクション」を入力してください。");
        return;
    }

    setLoading(true);

    const cacheKey = `craft:${inputItems.sort().join('|')}:${action}`;
    const recipeCache = state.getRecipeCache();

    if (recipeCache.has(cacheKey)) {
        ui.addLog("（キャッシュから実行）", "system");
        const cachedResult = recipeCache.get(cacheKey);
        processRecipeResult(cachedResult.id, cachedResult.result, 'craft');
    } else {
        const userQuery = `クラフト判定: 素材=[${inputItems.map(i => `"${i}"`).join(', ')}], アクション="${action}"`;
        const result = await callLLM(craftSystemPrompt, userQuery, craftSchema);
        if (result) {
            processRecipeResult(null, result, 'craft', action);
        } else {
            ui.addLog("LLMの判定に失敗しました。世界が応答しません...", "error");
            setLoading(false); 
        }
    }
    
    DOMElements.craftAction.value = "";
    state.clearCraftMaterials(); 
    ui.renderAll();
}

export async function handlePlayerExplore() {
    const location = DOMElements.exploreLocation.value;
    if (!location) {
        ui.showModal("入力エラー", "「探索場所」を入力してください。");
        return;
    }

    setLoading(true);
    const cacheKey = `explore:${location}`;
    const recipeCache = state.getRecipeCache();

    if (recipeCache.has(cacheKey)) {
        ui.addLog("（キャッシュから実行）", "system");
        const cachedResult = recipeCache.get(cacheKey);
        processRecipeResult(cachedResult.id, cachedResult.result, 'explore');
    } else {
        const userQuery = `探索判定: 場所="${location}"`;
        const result = await callLLM(exploreSystemPrompt, userQuery, exploreSchema);
        if (result) {
            processRecipeResult(null, result, 'explore', location);
        } else {
            ui.addLog("LLMの判定に失敗しました。世界が応答しません...", "error");
            setLoading(false); 
        }
    }
    
    DOMElements.exploreLocation.value = "";
}

export function handlePlayerCommand() {
    const aiId = DOMElements.selectAiTarget.value;
    const recipeId = DOMElements.selectRecipeTarget.value;
    const isPersistent = DOMElements.checkPersistent.checked;

    if (!aiId || !recipeId) {
        ui.showModal("入力エラー", "「指示対象のAI」と「実行させるレシピ」の両方を選択してください。");
        return;
    }

    setLoading(true);

    const ai = state.getAiById(aiId);
    const recipe = state.getRecipeById(recipeId);

    if (!ai || !recipe) {
        ui.showModal("エラー", "選択されたAIまたはレシピが見つかりません。");
        setLoading(false);
        return;
    }

    state.updateAi(aiId, { assignedRecipeId: recipeId, isPersistent: isPersistent });

    ui.addLog(`[${ai.name}]に「${recipe.name}」を${isPersistent ? '[永続]' : ''}指示しました。`, "success");

    const newRecipeId = `R-${String(state.incrementRecipeCounter()).padStart(3, '0')}`;
    const commandRecipeName = `指示: ${ai.name}に[${recipe.name}]を実行`;
    const commandRecipeDesc = `${ai.name}(${ai.id})に${recipe.name}(${recipe.id})を${isPersistent ? '永続実行' : '単発実行'}させる`;
    
    const newRecipe = {
        id: newRecipeId,
        name: commandRecipeName,
        description: commandRecipeDesc,
        type: 'command',
        targetAiId: aiId,
        targetRecipeId: recipeId,
        isPersistent: isPersistent,
        inputs: [], 
        outputs: []
    };

    state.addRecipe(newRecipeId, newRecipe);
    ui.addLog(`新しい[指示レシピ]「${commandRecipeName}」(${newRecipeId})が発見されました。`, "system");
    
    DOMElements.selectAiTarget.value = "";
    DOMElements.selectRecipeTarget.value = "";
    DOMElements.checkPersistent.checked = false;

    nextTurn();
}

export function handlePlayerExecuteRecipe(recipe) {
    if (state.getIsLoading()) return;
    if (recipe.type === 'command') return;

    setLoading(true);

    if (!state.checkMaterials(recipe.inputs)) {
        ui.showModal("素材不足", `「${recipe.name}」の実行に必要な素材がありません。`);
        setLoading(false);
        return;
    }

    state.consumeMaterials(recipe.inputs);

    recipe.outputs.forEach(output => {
        state.updateInventory(output.item, output.amount);
    });
    ui.addLog(`プレイヤーが「${recipe.name}」を実行。 ( ${recipe.outputs.map(o => `${o.item}x${o.amount}`).join(', ')} )`, "success");

    if (recipe.type === 'craft' && recipe.isAutonomous && recipe.autonomousItemName) {
        const newAiId = `AI-${String(state.incrementAiCounter()).padStart(3, '0')}`;
        const newAi = {
            id: newAiId,
            name: recipe.autonomousItemName,
            assignedRecipeId: null,
            isPersistent: false
        };
        state.addAi(newAiId, newAi);
        ui.addLog(`プレイヤーが新しいAI [${newAi.name}] (${newAiId}) をクラフトしました！`, "success");
    }

    nextTurn();
}

// --- ゲームロジック: AIターン ---
function runAiTurn() {
    ui.addLog("--- AIターン開始 ---", "system-turn");
    let aiDidSomething = false;
    const ais = state.getAis();
    
    [...ais.values()].sort((a, b) => a.id.localeCompare(b.id)).forEach(ai => {
        if (ai.assignedRecipeId) {
            const recipe = state.getRecipeById(ai.assignedRecipeId);
            if (recipe) {
                executeRecipe(ai, recipe);
                aiDidSomething = true;
            } else {
                ui.addLog(`[${ai.name}]は不明なレシピ(${ai.assignedRecipeId})を実行しようとした。`, "error");
                state.updateAi(ai.id, { assignedRecipeId: null });
            }
        }
    });

    if (!aiDidSomething && ais.size > 0) {
        ui.addLog("全AIが待機中...", "ai");
    }

    ui.renderAll(); 
    ui.addLog("--- AIターン終了 ---", "system-turn");
}

// --- ゲームロジック: レシピ実行 ---

function processRecipeResult(existingRecipeId, result, type, actionName = "") {
    let turnConsumed = false;
    try {
        if (result.success) {
            if (!state.consumeMaterials(result.inputs)) {
                ui.addLog(`「${actionName || 'クラフト'}」を実行しようとしたが、素材不足で失敗。`, "error");
                setLoading(false);
                return; 
            }
            
            turnConsumed = true; 

            result.outputs.forEach(output => {
                const amount = Math.max(0, Math.round(output.amount)); 
                if (amount > 0) { 
                    state.updateInventory(output.item, amount);
                }
            });
            
            if (type === 'craft' && result.isAutonomous && result.itemName) {
                const newAiId = `AI-${String(state.incrementAiCounter()).padStart(3, '0')}`;
                const newAi = { id: newAiId, name: result.itemName, assignedRecipeId: null, isPersistent: false };
                state.addAi(newAiId, newAi);
                ui.addLog(`新しいAI [${newAi.name}] (${newAiId}) が起動しました！`, "success");
            }

            let recipeId = existingRecipeId;
            if (!recipeId) {
                recipeId = `R-${String(state.incrementRecipeCounter()).padStart(3, '0')}`;
                let recipeName = "";
                let recipeDesc = "";
                let cacheKey = "";

                if (type === 'craft') {
                    recipeName = result.itemName || "謎のクラフト";
                    recipeDesc = `${result.inputs.map(i => `${i.item}x${i.amount}`).join('+')} => ${result.outputs.map(o => `${o.item}x${o.amount}`).join('+')}`;
                    const inputItems = [...state.getCraftMaterialsSelected()];
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
                state.addRecipe(recipeId, newRecipe);

                if (cacheKey) {
                    state.addRecipeToCache(cacheKey, { id: recipeId, result: result });
                }
                
                ui.addLog(`新しい[${type}]レシピ「${recipeName}」(${recipeId})が発見されました！`, "system");
            }
            
            ui.addLog(result.description, "success");

        } else {
            ui.addLog(result.description, "error");
            turnConsumed = true; 
        }
    } catch (e) {
        console.error("レシピ結果の処理中にエラー:", e, result);
        ui.addLog(`結果の処理中に予期せぬエラーが発生しました: ${e.message}`, "error");
        turnConsumed = true;
    }

    if (turnConsumed) {
        nextTurn();
    }
}

function executeRecipe(ai, recipe) {
    if (!state.checkMaterials(recipe.inputs)) {
        ui.addLog(`[${ai.name}]は「${recipe.name}」を実行しようとしたが、素材不足で失敗。`, "ai");
        
        if (ai.isPersistent) {
            ui.addLog(`[${ai.name}]の永続指示は素材不足のため停止しました。`, "error");
            state.updateAi(ai.id, { assignedRecipeId: null, isPersistent: false });
        }
        return; 
    }

    state.consumeMaterials(recipe.inputs);

    switch (recipe.type) {
        case 'craft':
            recipe.outputs.forEach(output => state.updateInventory(output.item, output.amount));
            ui.addLog(`[${ai.name}]が「${recipe.name}」を実行。 ( ${recipe.outputs.map(o => `${o.item}x${o.amount}`).join(', ')} )`, "ai");

            if (recipe.isAutonomous && recipe.autonomousItemName) {
                const newAiId = `AI-${String(state.incrementAiCounter()).padStart(3, '0')}`;
                const newAi = { id: newAiId, name: recipe.autonomousItemName, assignedRecipeId: null, isPersistent: false };
                state.addAi(newAiId, newAi);
                ui.addLog(`[${ai.name}]が新しいAI [${newAi.name}] (${newAiId}) をクラフトしました！`, "success");
            }
            break;
        
        case 'explore':
            recipe.outputs.forEach(output => state.updateInventory(output.item, output.amount));
            ui.addLog(`[${ai.name}]が「${recipe.name}」を実行。 ( ${recipe.outputs.map(o => `${o.item}x${o.amount}`).join(', ')} )`, "ai");
            break;
        
        case 'command':
            const targetAi = state.getAiById(recipe.targetAiId);
            if (targetAi) {
                const targetRecipe = state.getRecipeById(recipe.targetRecipeId);
                if (targetRecipe) {
                    state.updateAi(targetAi.id, { assignedRecipeId: recipe.targetRecipeId, isPersistent: recipe.isPersistent });
                    ui.addLog(`[${ai.name}]が[${targetAi.name}]に指示: 「${targetRecipe.name}」${recipe.isPersistent ? '[永続]' : ''}`, "ai-command");
                } else {
                    ui.addLog(`[${ai.name}]は存在しないレシピ(${recipe.targetRecipeId})を指示しようとした。`, "error");
                }
            } else {
                ui.addLog(`[${ai.name}]は存在しないAI(${recipe.targetAiId})に指示しようとした。`, "error");
            }
            break;
    }

    if (!ai.isPersistent) {
        state.updateAi(ai.id, { assignedRecipeId: null });
    }
}
