import { runAgentLoop, streamFinalResponse } from '../services/copilot.service.js';
import prisma from '../config/db.js';
import logger from '../config/logger.js';

/**
 * POST /api/chat
 * Handle chat message with agent loop execution and SSE streaming final response.
 * Accepts optional conversationId to target a specific thread.
 */
export const handleChat = async (req, res) => {
  try {
    const { message, context = {}, conversationId: requestedConvId, modelId } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Run the agent tool execution loops synchronously first
    const { conversationId, messages, actionInfo } = await runAgentLoop(
      req.user.id, 
      message, 
      { ...context, conversationId: requestedConvId, modelId }
    );

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // Stream final response to frontend
    let fullText = '';
    const stream = await streamFinalResponse(messages);
    
    for await (const chunk of stream) {
      if (chunk) {
        fullText += chunk;
        res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
      }
    }

    // Save final response to Prisma
    if (fullText.trim()) {
      await prisma.message.create({
        data: {
          conversationId,
          role: 'assistant',
          content: fullText
        }
      });
    }

    // Send action info if any tool was executed (e.g. navigation or job ID)
    if (actionInfo) {
      res.write(`data: ${JSON.stringify({ action: actionInfo })}\n\n`);
    }

    // Send the conversationId back so frontend can track it
    res.write(`data: ${JSON.stringify({ conversationId })}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (error) {
    logger.error({ err: error }, 'Chat processing failed');
    res.write(`data: ${JSON.stringify({ error: 'Failed to process chat: ' + error.message })}\n\n`);
    res.end();
  }
};

/**
 * GET /api/chat
 * Fetch the active conversation and its clean message history for the current user.
 * Accepts optional ?conversationId= query to fetch a specific thread.
 */
export const getActiveChat = async (req, res) => {
  try {
    const { conversationId } = req.query;
    
    let conversation;
    
    if (conversationId) {
      conversation = await prisma.conversation.findFirst({
        where: { id: conversationId, userId: req.user.id, deletedAt: null },
        include: {
          messages: {
            orderBy: { createdAt: 'asc' }
          }
        }
      });
    }
    
    if (!conversation) {
      conversation = await prisma.conversation.findFirst({
        where: { userId: req.user.id, deletedAt: null },
        orderBy: { updatedAt: 'desc' },
        include: {
          messages: {
            orderBy: { createdAt: 'asc' }
          }
        }
      });
    }

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          userId: req.user.id,
          title: 'New Chat'
        },
        include: {
          messages: {
            orderBy: { createdAt: 'asc' }
          }
        }
      });
    }

    // Filter out intermediate tool thoughts and execution results
    const cleanMessages = conversation.messages.filter(m => {
      const isToolCall = m.content.includes('"tool":');
      const isToolResult = m.content.startsWith('Tool execution result:');
      return !isToolCall && !isToolResult;
    });

    res.json({
      conversationId: conversation.id,
      title: conversation.title,
      messages: cleanMessages
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to fetch active chat');
    res.status(500).json({ error: 'Failed to fetch chat history' });
  }
};

/**
 * GET /api/chat/conversations
 * List all conversations for current user.
 */
export const listConversations = async (req, res) => {
  try {
    const conversations = await prisma.conversation.findMany({
      where: { userId: req.user.id, deletedAt: null },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        title: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { messages: true } }
      },
      take: 50
    });

    res.json(conversations);
  } catch (error) {
    logger.error({ err: error }, 'Failed to list conversations');
    res.status(500).json({ error: 'Failed to list conversations' });
  }
};

/**
 * POST /api/chat/conversations
 * Create a new conversation thread.
 */
export const createConversation = async (req, res) => {
  try {
    const { title = 'New Chat' } = req.body;
    
    const conversation = await prisma.conversation.create({
      data: {
        userId: req.user.id,
        title
      }
    });

    res.status(201).json(conversation);
  } catch (error) {
    logger.error({ err: error }, 'Failed to create conversation');
    res.status(500).json({ error: 'Failed to create conversation' });
  }
};

/**
 * PATCH /api/chat/conversations/:id
 * Rename a conversation.
 */
export const updateConversation = async (req, res) => {
  try {
    const { title } = req.body;
    
    await prisma.conversation.updateMany({
      where: { id: req.params.id, userId: req.user.id, deletedAt: null },
      data: { title }
    });

    res.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, 'Failed to update conversation');
    res.status(500).json({ error: 'Failed to update conversation' });
  }
};

/**
 * DELETE /api/chat/conversations/:id
 * Soft delete a conversation thread.
 */
export const deleteConversation = async (req, res) => {
  try {
    await prisma.conversation.updateMany({
      where: { id: req.params.id, userId: req.user.id, deletedAt: null },
      data: { deletedAt: new Date() }
    });

    res.json({ success: true, message: 'Conversation deleted' });
  } catch (error) {
    logger.error({ err: error }, 'Failed to delete conversation');
    res.status(500).json({ error: 'Failed to delete conversation' });
  }
};

/**
 * DELETE /api/chat
 * Clear messages in a specific conversation or the most recent one.
 */
export const clearChat = async (req, res) => {
  try {
    const { conversationId } = req.query;
    
    let conversation;
    if (conversationId) {
      conversation = await prisma.conversation.findFirst({
        where: { id: conversationId, userId: req.user.id, deletedAt: null }
      });
    } else {
      conversation = await prisma.conversation.findFirst({
        where: { userId: req.user.id, deletedAt: null },
        orderBy: { updatedAt: 'desc' }
      });
    }

    if (conversation) {
      await prisma.message.deleteMany({
        where: { conversationId: conversation.id }
      });
    }

    res.json({ success: true, message: 'Chat history cleared' });
  } catch (error) {
    logger.error({ err: error }, 'Failed to clear chat');
    res.status(500).json({ error: 'Failed to clear chat history' });
  }
};
