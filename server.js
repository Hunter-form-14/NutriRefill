import express from "express";
import OpenAI from "openai";
import "dotenv/config.js";

const app = express();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.use(express.json({ limit: "25mb" }));
app.use(express.static("public"));

app.post("/api/analyze", async (req, res) => {
    try {
        const images = req.body;

        const promptText = `
食事画像内の全ての食材毎の種類と量(g)を推定し、nutrients.jsonファイルを参照して以下の栄養素の合計量を計算し、以下のJSON形式（各食材名ごとに値を持ち、sumで全体の合計値を出力）で出力してください。
{
  "ご飯(例)": {
    "量": 数値(g),
    "カルシウム": 数値(mg),
    "鉄": 数値(mg),
    "ビタミンA": 数値(μg),
    "ビタミンD": 数値(μg),
    "ビタミンB1": 数値(mg),
    "ビタミンB2": 数値(mg),
    "ビタミンB6": 数値(mg),
    "ビタミンB12": 数値(μg)
  },
  "サーモン(例)": {
    "量": 数値(g),
    "カルシウム": 数値(mg),
    "鉄": 数値(mg),
    "ビタミンA": 数値(μg),
    "ビタミンD": 数値(μg),
    "ビタミンB1": 数値(mg),
    "ビタミンB2": 数値(mg),
    "ビタミンB6": 数値(mg),
    "ビタミンB12": 数値(μg)
  },
  "トマト(例)": {
    "量": 数値(g),
    "カルシウム": 数値(mg),
    "鉄": 数値(mg),
    "ビタミンA": 数値(μg),
    "ビタミンD": 数値(μg),
    "ビタミンB1": 数値(mg),
    "ビタミンB2": 数値(mg),
    "ビタミンB6": 数値(mg),
    "ビタミンB12": 数値(μg)
  },
  "sum": {
    "カルシウム": 合計値(mg),
    "鉄": 合計値(mg),
    "ビタミンA": 合計値(μg),
    "ビタミンD": 合計値(μg),
    "ビタミンB1": 合計値(mg),
    "ビタミンB2": 合計値(mg),
    "ビタミンB6": 合計値(mg),
    "ビタミンB12": 合計値(μg)
  }
}
※上記の形式・順番・記号・単位を厳守し、他の説明文やコメントは一切含めないでください。
`;

        const results = await Promise.all(
            images.map(async (image_url, idx) => {
                try {
                    const content = [
                        {
                            type: "input_text",
                            text: promptText
                        },
                        {
                            type: "input_image",
                            image_url
                        }];
                    const oaRes = await openai.responses.create({
                        model: "gpt-4.1-mini",
                        tools: [
                            {
                                type: "file_search",
                                vector_store_ids: ["vs_683d0e070da88191825efbbe311baf7b"]
                            }
                        ],
                        input: [
                            {
                                role: "user",
                                content
                            }
                        ],
                        text: {
                            format: { type: "json_object" }
                        },
                        temperature: 0.2,
                        top_p: 0.1,
                        store: false
                    });
                    console.log("Raw response:", oaRes.output_text);
                    return {
                        index: idx,
                        data: JSON.parse(oaRes.output_text) // サーバー側でパース
                    };
                } catch (err) {
                    console.error(`画像 ${idx} の処理失敗:`, err);
                    return { index: idx, error: err.message };
                }
            })
        );

        results.sort((a, b) => a.index - b.index);

        return res.json({
            results: results.map(r => r.data || { error: r.error })
        });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Server error" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});
