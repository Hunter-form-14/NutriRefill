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
                text:
                    `食事画像（複数枚）と nutrients.json ファイルを用いて、以下の手順で全画像に写っている “すべて” の食品をまとめて評価し、その合計栄養量を算出してください。

                    1. 画像を 1 枚ずつ処理し、写っている食品を種類ごとに列挙し、各画像内での量（g）を推定する。  
                    2. 同一食品が複数画像に含まれている場合、画像ごとに推定した量を加算し、その食品の合計量を求める。  
                    3. 得られた〈食品 × 合計量〉リストを nutrients.json に照合し、下記 8 栄養素ごとの寄与量を計算する。  
                    4. すべての食品について栄養量を合算し、最終的な総量を算出する。  
                    5. 以下の構成・順序・単位・記号を厳守して出力すること。  

                    ---

                    計算過程：

                    ~~~

                    出力：

                    カルシウム:合計値(mg), 鉄:合計値(mg), ビタミンA:合計値(μg), ビタミンD:合計値(μg), ビタミンB1:合計値(mg), ビタミンB2:合計値(mg), ビタミンB6:合計値(mg), ビタミンC:合計値(mg)

                    ※上記形式・順番・単位を厳守し、余分な文言は追加しないでください。`
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
                // {
                //     //栄養素一覧表に食品がない場合は、Web検索で代用するためのツール
                //     "type": "web_search"
                // }
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
