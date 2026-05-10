import { chatWithCopilot } from '../services/ai.service.js';
import logger from '../config/logger.js';

export const handleChat = async (req, res) => {
  try {
    const { message, history = [] } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // Generate response using generator
    const stream = await chatWithCopilot(history, message);
    
    for await (const chunk of stream) {
      if (chunk) {
        res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
      }
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (error) {
    logger.error({ err: error }, 'Chat processing failed');
    res.write(`data: ${JSON.stringify({ error: 'Failed to process chat' })}\n\n`);
    res.end();
  }
};
