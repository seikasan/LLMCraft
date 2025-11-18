require('dotenv').config();
const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const rateLimit = require('express-rate-limit');

const app = express();
const port = 3000;

// APIキーのチェック
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey || apiKey === 'YOUR_API_KEY_HERE') {
  console.error('エラー: GEMINI_API_KEYが.envファイルに設定されていません。');
  console.error('.envファイルを開き、"YOUR_API_KEY_HERE"を実際のAPIキーに置き換えてください。');
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(apiKey);

app.use(express.json());
app.use(express.static('public')); // Serve static files from the 'public' directory

// レートリミッターの設定
const apiLimiter = rateLimit({
	windowMs: 15 * 60 * 1000, // 15 minutes
	max: 100, // Limit each IP to 100 requests per `window` (here, per 15 minutes)
	standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
	legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message: { error: 'リクエストが多すぎます。15分後に再試行してください。' },
});

// APIルートにリミッターを適用
app.post('/api/gemini', apiLimiter, async (req, res) => {
  try {
    const { systemInstruction, userQuery, schema } = req.body;

    if (!userQuery) {
      return res.status(400).json({ error: 'userQuery is required' });
    }

    // GeminiにJSONを生成させるためのプロンプトを構築
    const fullPrompt = `${systemInstruction}\n\nUser Query: "${userQuery}"\n\nYour response MUST be a single, valid JSON object that conforms to the following schema. Do not output any text, explanation, or code block markers outside of the JSON object.\n\nSchema:\n${JSON.stringify(schema, null, 2)}`;

    // より新しいモデルを使用し、JSONモードを指定
    const model = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL_NAME || "gemini-2.5-flash" });
    
    const generationConfig = {
        responseMimeType: "application/json",
    };

    const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: fullPrompt }] }],
        generationConfig: generationConfig,
    });

    const response = await result.response;
    const text = response.text();
    
    res.json({ message: text }); // textはJSON文字列になっているはず
  } catch (error) {
    // サーバー側にはエラーの詳細をログ出力
    console.error('Gemini API Error in /api/gemini endpoint:', error);
    // クライアントには一般的なエラーメッセージを返す
    res.status(500).json({ 
        error: 'サーバー内部エラーが発生しました。'
    });
  }
});

app.listen(port, () => {
  console.log(`サーバーが http://localhost:${port} で起動しました。`);
  console.log('ゲームを始めるには、このURLにアクセスしてください。');
});
