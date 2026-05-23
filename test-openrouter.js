import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

async function test() {
  console.log('API Key:', process.env.OPENROUTER_API_KEY ? 'Present' : 'Missing');
  try {
    const res = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "anthropic/claude-3.5-sonnet",
        max_tokens: 4000,
        messages: [
          { role: "system", content: "You are a test bot. Output ONLY a raw JSON object." },
          { role: "user", content: "Output a simple JSON object with key 'hello' and value 'world'" }
        ]
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "http://localhost:3000",
          "X-Title": "Elevara"
        }
      }
    );
    console.log("Success:", res.data.choices[0].message.content);
  } catch (err) {
    console.error("Error:", err.response?.data || err.message);
  }
}
test();
