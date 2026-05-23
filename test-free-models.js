import { generateAI } from './src/providers/ai.provider.js';
import dotenv from 'dotenv';
dotenv.config();

async function test(modelId) {
  try {
    console.log(`Testing model: ${modelId}`);
    const res = await generateAI({
      prompt: "Reply with the exact word 'SUCCESS'",
      systemInstruction: "You are a helpful assistant.",
      responseFormat: "text",
      modelId: modelId
    });
    console.log(`Response for ${modelId}:`, res);
  } catch(e) {
    console.error(`Failed for ${modelId}:`, e.message);
  }
}

async function run() {
  await test("deepseek/deepseek-v4-flash:free");
  await test("meta-llama/llama-3.3-70b-instruct:free");
}

run();
