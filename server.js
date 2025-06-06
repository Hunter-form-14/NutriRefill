import express from "express";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import "dotenv/config.js";

const app = express();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// JSONボディのパースとサイズ制限
app.use(express.json({ limit: "25mb" }));
// 静的ファイルの提供（publicディレクトリ）
app.use(express.static("public"));

// 1. Zodでスキーマ定義
const FoodSchema = z.object({
    name: z.string(),
    量: z.number(),
    カルシウム: z.number(),
    鉄: z.number(),
    ビタミンA: z.number(),
    ビタミンD: z.number(),
    ビタミンB1: z.number(),
    ビタミンB2: z.number(),
    ビタミンB6: z.number(),
    ビタミンB12: z.number(),
});

const NutritionSchema = z.object({
    foods: z.array(FoodSchema),
    sum: FoodSchema,
});

// 食事画像の栄養分析APIエンドポイント
app.post("/api/analyze", async (req, res) => {
    try {
        const images = req.body;
        const promptText = `
あなたは食事画像の栄養分析を行うAIです。必ず、ベクターストア（file_searchツール）から取得したnutrition_list.jsonの内容だけを根拠にして、食材と栄養素情報を抽出・分析してください。ベクターストアに該当データが見つからない場合は除外してください。一般的な知識や推測は一切使わないでください。必ず後述のJSONスキーマに厳密に従いfoods配列として出力し、foods全体の合計値をsumとして同じ形式で出力してください。
`;

        // 画像ごとにOpenAI APIへリクエスト
        const results = await Promise.all(
            images.map(async (image_url, idx) => {
                try {
                    const content = [
                        { type: "input_text", text: promptText },
                        { type: "input_image", image_url }
                    ];
                    const oaRes = await openai.responses.parse({
                        model: "gpt-4.1-mini",
                        tools: [{ type: "file_search", vector_store_ids: ["vs_68421997e1f881918887df55ce3eebc3"] }],
                        input: [{ role: "user", content }],
                        text: { format: zodTextFormat(NutritionSchema, "nutrition_analysis") },
                        temperature: 0.0,
                        top_p: 0.1,
                        store: false
                    });
                    return { index: idx, data: oaRes.output_parsed };
                } catch (err) {
                    // 画像ごとのエラーも返す
                    return { index: idx, error: err.message };
                }
            })
        );
        // 元の順番にソート
        results.sort((a, b) => a.index - b.index);
        // 結果を返す
        return res.json({ results: results.map(r => r.data || { error: r.error }) });
    } catch (err) {
        // サーバーエラー
        return res.status(500).json({ error: "Server error" });
    }
});

// サーバー起動
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});
