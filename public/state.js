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

// --- 状態ゲッター (Read) ---
export const getState = () => ({
    inventory: new Map(inventory),
    recipes: new Map(recipes),
    ais: new Map(ais),
    recipeCache: new Map(recipeCache),
    turn,
    aiCounter,
    recipeCounter,
    isLoading,
    craftMaterialsSelected: new Set(craftMaterialsSelected),
});

export const getInventory = () => new Map(inventory);
export const getRecipes = () => new Map(recipes);
export const getAis = () => new Map(ais);
export const getRecipeCache = () => new Map(recipeCache);
export const getTurn = () => turn;
export const getIsLoading = () => isLoading;
export const getCraftMaterialsSelected = () => new Set(craftMaterialsSelected);
export const getRecipeById = (id) => recipes.get(id);
export const getAiById = (id) => ais.get(id);


// --- 状態セッター/ミューテーター (Write) ---

export function setTurn(newTurn) {
    turn = newTurn;
}

export function incrementTurn() {
    turn++;
    return turn;
}

export function setLoading(loading) {
    isLoading = loading;
}

export function addRecipe(id, recipe) {
    recipes.set(id, recipe);
}

export function addAi(id, ai) {
    ais.set(id, ai);
}

export function updateAi(id, updates) {
    const ai = ais.get(id);
    if (ai) {
        ais.set(id, { ...ai, ...updates });
    }
}

export function incrementAiCounter() {
    aiCounter++;
    return aiCounter;
}

export function incrementRecipeCounter() {
    recipeCounter++;
    return recipeCounter;
}

export function addRecipeToCache(key, value) {
    recipeCache.set(key, value);
}

export function toggleCraftMaterial(item) {
    if (craftMaterialsSelected.has(item)) {
        craftMaterialsSelected.delete(item);
    } else {
        craftMaterialsSelected.add(item);
    }
}

export function clearCraftMaterials() {
    craftMaterialsSelected.clear();
}

// --- 複合ロジック (状態に密結合) ---

export function updateInventory(item, amount) {
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

export function checkMaterials(inputs) {
    if (!inputs || inputs.length === 0) return true; 
    for (const input of inputs) {
        if ((inventory.get(input.item) || 0) < input.amount) {
            return false; 
        }
    }
    return true;
}

export function consumeMaterials(inputs) {
    if (!inputs || inputs.length === 0) return true;
    if (checkMaterials(inputs)) {
        for (const input of inputs) {
            updateInventory(input.item, -input.amount);
        }
        return true;
    }
    return false;
}

export function initializeState() {
    inventory = new Map();
    recipes = new Map();
    ais = new Map();
    recipeCache = new Map();
    turn = 0;
    aiCounter = 0;
    recipeCounter = 0;
    isLoading = false;
    craftMaterialsSelected = new Set();

    // 初期アイテム
    updateInventory("木の棒", 10);
    updateInventory("尖った石", 5);
    updateInventory("不思議なコア", 1);
    updateInventory("壊れた機械", 1);
}
