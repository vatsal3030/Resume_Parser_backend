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
  await test("google/gemma-4-26b-a4b-it:free");
  await test("nvidia/nemotron-3.5-lightning:free");
}

run();
