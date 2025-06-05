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
        const images = req.body; // 画像URL配列を受け取る
        const promptText = `
食事画像内の全ての食材ごとに「name（食材名）」「量(g)」「カルシウム」「鉄」「ビタミンA」「ビタミンD」「ビタミンB1」「ビタミンB2」「ビタミンB6」「ビタミンB12」を推定し、foods配列として出力してください。またfoods全体の合計値をsumとして同じ形式で出力してください。必ず以下のJSONスキーマに厳密に従ってください。
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
                        tools: [{ type: "file_search", vector_store_ids: ["vs_683d0e070da88191825efbbe311baf7b"] }],
                        input: [{ role: "user", content }],
                        text: { format: zodTextFormat(NutritionSchema, "nutrition_analysis") },
                        temperature: 0.2,
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
