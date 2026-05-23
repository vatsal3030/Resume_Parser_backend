import { generateMockInterview } from './src/services/ai.service.js';
import dotenv from 'dotenv';
dotenv.config();

async function test() {
  try {
    const res = await generateMockInterview("Test resume content", "Software Engineer", "openai/gpt-4o");
    console.log("Success:", res);
  } catch(e) {
    console.error("Failed:", e);
  }
}
test();
