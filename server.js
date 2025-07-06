import express from "express";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import "dotenv/config.js";
import sqlite3 from "sqlite3";
import { open } from "sqlite";

const app = express();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// データベース接続の準備
const dbPromise = open({
  filename: './nutrition.db', // SQLiteデータベースファイル
  driver: sqlite3.Database
});

// JSONボディのパースとサイズ制限
app.use(express.json({ limit: "25mb" }));
// 静的ファイルの提供（publicディレクトリ）
app.use(express.static("public"));

// 1. Zodでスキーマ定義
const DetectedFoodSchema = z.object({
    name: z.string().describe("食材名"),
    weight: z.number().describe("重量(g)"),
});

const GptResponseSchema = z.object({
    foods: z.array(DetectedFoodSchema),
});

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
        const db = await dbPromise;

        const promptText = `
あなたは食事画像の食材とその量を特定するAIです。画像に含まれる食材をベクターストア（file_searchツール）から取得したfoodsList.txtの食材に同定し、その重量(g)を推定してください。一般的な知識や推測は一切使わないでください。必ず後述のJSONスキーマに厳密に従い、foods配列として出力してください。
`;

        const results = await Promise.all(
            images.map(async (image_url, idx) => {
                try {
                    const gptResponse = await openai.responses.parse({
                        model: "gpt-4.1-mini",
                        tools: [{ type: "file_search", vector_store_ids: ["vs_6866a21f849881918c591b243a7ceafe"] }],
                        input: [{ 
                            role: "user", 
                            content: [
                                { type: "input_text", text: promptText },
                                { type: "input_image", image_url }
                            ]
                        }],
                        text: { format: zodTextFormat(GptResponseSchema, "food_extraction") },
                        temperature: 0.0,
                        top_p: 0.1,
                        store: false
                    });

                    const detectedFoods = gptResponse.output_parsed.foods;

                    if (!detectedFoods || detectedFoods.length === 0) {
                        return {
                            index: idx,
                            data: {
                                foods: [],
                                sum: { name: "合計", 量: 0, カルシウム: 0, 鉄: 0, ビタミンA: 0, ビタミンD: 0, ビタミンB1: 0, ビタミンB2: 0, ビタミンB6: 0, ビタミンB12: 0 }
                            }
                        };
                    }

                    const calculatedFoods = (await Promise.all(
                        detectedFoods.map(async (food) => {

                            const row = await db.get(
                                `SELECT "カルシウム(mg)" AS "カルシウム", "鉄(mg)" AS "鉄", "ビタミンA(μg)" AS "ビタミンA", "ビタミンD(μg)" AS "ビタミンD", "ビタミンB1(mg)" AS "ビタミンB1", "ビタミンB2(mg)" AS "ビタミンB2", "ビタミンB6(mg)" AS "ビタミンB6", "ビタミンB12(μg)" AS "ビタミンB12" FROM nutrition WHERE "食品名" LIKE ?`,
                                `%${food.name}%`
                            );
                            
                            if (!row) return null;

                            const scale = food.weight / 100.0;

                            return {
                                name: food.name,
                                量: food.weight,
                                カルシウム: (row.カルシウム || 0) * scale,
                                鉄: (row.鉄 || 0) * scale,
                                ビタミンA: (row.ビタミンA || 0) * scale,
                                ビタミンD: (row.ビタミンD || 0) * scale,
                                ビタミンB1: (row.ビタミンB1 || 0) * scale,
                                ビタミンB2: (row.ビタミンB2 || 0) * scale,
                                ビタミンB6: (row.ビタミンB6 || 0) * scale,
                                ビタミンB12: (row.ビタミンB12 || 0) * scale,
                            };
                        })
                    )).filter(Boolean);

                    const sum = calculatedFoods.reduce((acc, food) => {
                        acc.量 += food.量;
                        acc.カルシウム += food.カルシウム;
                        acc.鉄 += food.鉄;
                        acc.ビタミンA += food.ビタミンA;
                        acc.ビタミンD += food.ビタミンD;
                        acc.ビタミンB1 += food.ビタミンB1;
                        acc.ビタミンB2 += food.ビタミンB2;
                        acc.ビタミンB6 += food.ビタミンB6;
                        acc.ビタミンB12 += food.ビタミンB12;
                        return acc;
                    }, { name: "合計", 量: 0, カルシウム: 0, 鉄: 0, ビタミンA: 0, ビタミンD: 0, ビタミンB1: 0, ビタミンB2: 0, ビタミンB6: 0, ビタミンB12: 0 });

                    return {
                        index: idx,
                        data: {
                            foods: calculatedFoods,
                            sum: sum
                        }
                    };
                } catch (err) {
                    return { index: idx, error: err.message };
                }
            })
        );
        results.sort((a, b) => a.index - b.index);
        return res.json({ results: results.map(r => r.data || { error: r.error }) });
    } catch (err) {
        return res.status(500).json({ error: "Server error" });
    }
});

// サーバー起動
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});