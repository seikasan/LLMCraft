import { DOMElements } from './constants.js';
import { getInventory, getAis, getRecipes, getCraftMaterialsSelected, getIsLoading, toggleCraftMaterial } from './state.js';
import { handlePlayerExecuteRecipe } from './gameLogic.js';

// --- UIレンダリング ---
export function renderAll() {
    renderInventory();
    renderAIs();
    renderRecipes();
    updateAiSelectors();
    renderCraftInventorySource();
    renderCraftSelection();
}

function renderInventory() {
    const inventory = getInventory();
    const inventoryList = DOMElements.inventoryList;

    // 既存のDOM要素をMapに格納 (data-item属性をキー)
    const existingItemEls = new Map();
    inventoryList.querySelectorAll('[data-item]').forEach(el => {
        existingItemEls.set(el.dataset.item, el);
    });

    // インベントリが空の場合の処理
    const placeholder = inventoryList.querySelector('.placeholder');
    if (inventory.size === 0) {
        if (!placeholder) {
            inventoryList.innerHTML = `<span class="text-gray-500 col-span-full text-center p-4 placeholder">インベントリは空です...</span>`;
        }
        // 既存のアイテム要素が残っていれば削除
        existingItemEls.forEach(el => el.remove());
        return;
    } else {
        placeholder?.remove();
    }

    const sortedInventory = [...inventory.entries()].sort((a, b) => a[0].localeCompare(b[0]));

    // 新しい状態に基づいてDOMを更新・追加
    for (const [item, amount] of sortedInventory) {
        const existingEl = existingItemEls.get(item);

        if (existingEl) {
            // 存在する場合: 数量を更新
            const amountEl = existingEl.querySelector('.item-amount');
            const currentAmount = parseInt(amountEl.textContent.replace('x ', ''), 10);
            if (currentAmount !== amount) {
                amountEl.textContent = `x ${amount}`;
            }
            // 処理済みの要素をMapから削除
            existingItemEls.delete(item);
        } else {
            // 存在しない場合: 新しく作成して追加
            const itemEl = document.createElement('div');
            itemEl.className = "bg-gray-700 rounded-md p-2 shadow text-center";
            itemEl.dataset.item = item; // 差分更新のための識別子
            itemEl.innerHTML = `
                <span class="font-medium text-white">${item}</span>
                <span class="block text-sm text-gray-300 item-amount">x ${amount}</span>
            `;
            inventoryList.appendChild(itemEl);
        }
    }

    // Mapに残った要素はインベントリから削除されたものなので、DOMから削除
    existingItemEls.forEach(el => el.remove());
}

function renderAIs() {
    const ais = getAis();
    const recipes = getRecipes();
    const aiList = DOMElements.aiList;

    const existingAiEls = new Map();
    aiList.querySelectorAll('[data-ai-id]').forEach(el => {
        existingAiEls.set(el.dataset.aiId, el);
    });

    const placeholder = aiList.querySelector('.placeholder');
    if (ais.size === 0) {
        if (!placeholder) {
            aiList.innerHTML = `<span class="text-gray-500 text-center p-4 placeholder">AIはまだいません...</span>`;
        }
        existingAiEls.forEach(el => el.remove());
        return;
    } else {
        placeholder?.remove();
    }

    const sortedAis = [...ais.values()].sort((a, b) => a.id.localeCompare(b.id));

    for (const ai of sortedAis) {
        const existingEl = existingAiEls.get(ai.id);

        let recipeName = "待機中";
        let persistentText = "";
        if (ai.assignedRecipeId) {
            const recipe = recipes.get(ai.assignedRecipeId);
            recipeName = recipe ? `実行中: ${recipe.name}` : "不明なレシピ";
            if (ai.isPersistent) {
                persistentText = `<span class="text-xs font-mono text-purple-300">[永続]</span>`;
            }
        }
        const newInnerHtml = `
            <div class="flex justify-between items-center">
                <span class="font-bold text-lg text-white">${ai.name} <span class="text-sm font-mono text-gray-400">(${ai.id})</span></span>
                ${persistentText}
            </div>
            <div class="text-sm text-gray-300">${recipeName}</div>
        `;

        if (existingEl) {
            // 存在する場合: 内容が変更されていれば更新
            if (existingEl.innerHTML.trim() !== newInnerHtml.trim()) {
                existingEl.innerHTML = newInnerHtml;
            }
            existingAiEls.delete(ai.id);
        } else {
            // 存在しない場合: 新しく作成して追加
            const aiEl = document.createElement('div');
            aiEl.className = "bg-gray-700 rounded-md p-3 shadow";
            aiEl.dataset.aiId = ai.id;
            aiEl.innerHTML = newInnerHtml;
            aiList.appendChild(aiEl);
        }
    }

    existingAiEls.forEach(el => el.remove());
}

function renderRecipes() {
    const recipes = getRecipes();
    const recipeList = DOMElements.recipeList;

    const existingRecipeEls = new Map();
    recipeList.querySelectorAll('[data-recipe-id]').forEach(el => {
        existingRecipeEls.set(el.dataset.recipeId, el);
    });

    const placeholder = recipeList.querySelector('.placeholder');
    if (recipes.size === 0) {
        if (!placeholder) {
            recipeList.innerHTML = `<span class="text-gray-500 text-center p-4 placeholder">発見済みのレシピはありません...</span>`;
        }
        existingRecipeEls.forEach(el => el.remove());
        return;
    } else {
        placeholder?.remove();
    }

    const sortedRecipes = [...recipes.values()].sort((a, b) => a.id.localeCompare(b.id));

    for (const recipe of sortedRecipes) {
        const existingEl = existingRecipeEls.get(recipe.id);

        if (existingEl) {
            // レシピは不変なので、更新は不要。Mapから削除するだけ。
            existingRecipeEls.delete(recipe.id);
        } else {
            // 存在しない場合: 新しく作成して追加
            const recipeEl = document.createElement('div');
            recipeEl.dataset.recipeId = recipe.id;

            let icon = "💡";
            let color = "text-white";
            let cursorStyle = "";

            if(recipe.type === 'craft') { icon = "🔧"; color = "text-blue-300"; cursorStyle = "cursor-pointer hover:bg-gray-600"; }
            if(recipe.type === 'explore') { icon = "🌲"; color = "text-green-300"; cursorStyle = "cursor-pointer hover:bg-gray-600"; }
            if(recipe.type === 'command') { icon = "🤖"; color = "text-purple-300"; cursorStyle = "cursor-not-allowed"; }

            recipeEl.className = `bg-gray-700 rounded-md p-2 shadow text-sm ${cursorStyle} transition-colors duration-150`;
            recipeEl.innerHTML = `
                <div class="font-semibold ${color}">${icon} ${recipe.name} <span class="font-mono text-xs text-gray-400">(${recipe.id})</span></div>
                <div class="text-xs text-gray-300 pl-5">${recipe.description}</div>
            `;

            if (recipe.type === 'craft' || recipe.type === 'explore') {
                recipeEl.addEventListener('click', () => handlePlayerExecuteRecipe(recipe));
            }

            recipeList.appendChild(recipeEl);
        }
    }

    existingRecipeEls.forEach(el => el.remove());
}

export function addLog(message, type = "normal") {
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
    DOMElements.gameLog.scrollTop = DOMElements.gameLog.scrollHeight;
}

// --- クラフトパネルUI関連 ---

function renderCraftInventorySource() {
    DOMElements.craftInventorySource.innerHTML = "";
    const inventory = getInventory();
    const craftMaterialsSelected = getCraftMaterialsSelected();
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
            button.addEventListener('click', () => {
                if (getIsLoading()) return;
                toggleCraftMaterial(item);
                renderCraftInventorySource();
                renderCraftSelection();
            });
            DOMElements.craftInventorySource.appendChild(button);
        }
    });

    if (!hasItems) {
        DOMElements.craftInventorySource.innerHTML = `<span class="text-gray-500 text-sm">インベントリに素材がありません</span>`;
    }
}

function renderCraftSelection() {
    DOMElements.craftSelection.innerHTML = ""; 
    const craftMaterialsSelected = getCraftMaterialsSelected();
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
export function updateLoadingUI(isLoading) {
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

export function showModal(title, message) {
    DOMElements.modalTitle.textContent = title;
    DOMElements.modalMessage.textContent = message;
    DOMElements.messageModal.classList.remove('hidden');
}

export function closeModal() {
    DOMElements.messageModal.classList.add('hidden');
}

function updateAiSelectors() {
    const ais = getAis();
    const recipes = getRecipes();
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
