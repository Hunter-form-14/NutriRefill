import express from "express";
import OpenAI from "openai";
import "dotenv/config.js";

const app = express();
//.envファイルから環境変数を読み込む
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.use(express.json({ limit: "25mb" }));   // base64変換された画像を受け取れるように
app.use(express.static("public"));          // / で index.html を配信

app.post("/api/analyze", async (req, res) => {
    try {
        const images = req.body;

        // Base64データURLの配列を受け取る想定
        const content = [
            {
                //プロンプト
                type: "input_text",
                text: `食事画像とnutrients.jsonファイルを用いて、全ての食品の種類と量の推定値から後述の栄養素の量を計算し、その合計値を以下の形式で出力してください：
計算過程：

~~~

出力：

カルシウム:値(mg), 鉄:値(mg), ビタミンA:値(μg), ビタミンD:値(μg), ビタミンB1:値(mg), ビタミンB2:値(mg), ビタミンB6:値(mg), ビタミンC:値(mg)

※上記の形式・順番・記号・単位を厳守し、他の説明文やコメントは一切含めないでください。`
            },
            ...images.map(image_url => ({
                type: "input_image",
                image_url
            }))
        ];

        const oaRes = await openai.responses.create({
            model: "gpt-4.1",
            tools: [
                {
                    //栄養素一覧表を参照するためのツール
                    //nutrients.json（栄養素一覧表）を格納しているベクターストアのIDを指定する
                    "type": "file_search",
                    "vector_store_ids": ["vs_680ded984ba48191a1a9fa2b06dd3ae1"]
                },
                {
                    //栄養素一覧表に食品がない場合は、Web検索で代用するためのツール
                    "type": "web_search"
                }
            ],
            input: [
                {
                    role: "user",
                    content
                }
            ],
            //決定的な応答を得るための設定
            temperature: 0.0,
            top_p: 0.1,
            //チャットの履歴を保存しない設定
            store: false
        });

        return res.json({ text: oaRes.output_text });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "OpenAI request failed" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});
