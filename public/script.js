import { DOMElements } from './constants.js';
import { initializeState } from './state.js';
import { renderAll, addLog, closeModal } from './ui.js';
import { handlePlayerCraft, handlePlayerExplore, handlePlayerCommand } from './gameLogic.js';

// --- 初期化 ---
function initializeGame() {
    // 状態の初期化
    initializeState();

    // イベントリスナー設定
    DOMElements.btnPlayerCraft.addEventListener('click', handlePlayerCraft);
    DOMElements.btnPlayerExplore.addEventListener('click', handlePlayerExplore);
    DOMElements.btnPlayerCommand.addEventListener('click', handlePlayerCommand);
    DOMElements.modalCloseBtn.addEventListener('click', closeModal);

    // 初期ログメッセージ
    addLog("ようこそ！世界はまだ何も定義されていません。", "system");
    addLog("「クラフト」や「探索」で世界を開拓しましょう。", "system");
    
    // 初回レンダリング
    renderAll();
}

// --- ゲーム開始 ---
window.onload = initializeGame;
