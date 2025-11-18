import { addLog, showModal } from './ui.js';

// --- Gemini API 呼び出し (ローカルサーバー経由) ---
export async function callLLM(systemInstruction, userQuery, schema, retries = 3, delay = 1000) {
    // サーバーに送信するデータ構造を修正
    const payload = {
        systemInstruction: systemInstruction,
        userQuery: userQuery,
        schema: schema 
    };

    // Gemini APIへのリクエストを自前のサーバーエンドポイントに送る
    try {
        const response = await fetch('/api/gemini', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload) // 修正: payload全体を送信
        });

        if (!response.ok) {
            const errorBody = await response.json();
            throw new Error(`APIプロキシサーバーのエラー: ${response.status}. ${errorBody.error}`);
        }

        const data = await response.json();
        
        // サーバーから返されたテキスト（JSON形式のはず）をパースする
        // サーバーはGeminiからのテキスト応答をそのまま message として返す
        return JSON.parse(data.message);

    } catch (error) {
        console.error("LLMプロキシ呼び出しエラー:", error);
        if (retries > 0) {
            addLog(`LLMの応答エラー。${delay/1000}秒後にリトライします...`, "system");
            await new Promise(res => setTimeout(res, delay));
            return callLLM(systemInstruction, userQuery, schema, retries - 1, delay * 2);
        } else {
            addLog(`LLMの呼び出しに失敗しました: ${error.message}`, "error");
            showModal("APIエラー", `LLMの呼び出しに失敗しました。サーバーログを確認してください。\n${error.message}`);
            return null;
        }
    }
}
