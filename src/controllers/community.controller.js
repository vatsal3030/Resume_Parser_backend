import prisma from '../config/db.js';
import logger from '../config/logger.js';

export const createPost = async (req, res) => {
  try {
    const { title, content, documentId, category } = req.body;
    
    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    // Verify document exists and belongs to user if provided
    if (documentId) {
      const doc = await prisma.document.findUnique({
        where: { id: documentId, userId: req.user.id }
      });
      if (!doc) return res.status(404).json({ error: 'Document not found' });
    }

    const post = await prisma.communityPost.create({
      data: {
        userId: req.user.id,
        title,
        content,
        documentId,
        category: category || 'General'
      },
      include: {
        user: { select: { id: true, name: true } }
      }
    });

    res.status(201).json(post);
  } catch (error) {
    logger.error({ err: error }, 'Failed to create community post');
    res.status(500).json({ error: 'Failed to create post' });
  }
};

export const getPosts = async (req, res) => {
  try {
    const { category, search } = req.query;
    
    const where = {};
    
    if (category && category !== 'All') {
      where.category = category;
    }
    
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { content: { contains: search, mode: 'insensitive' } }
      ];
    }

    const posts = await prisma.communityPost.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { name: true } },
        _count: { select: { upvotes: true, comments: true } }
      }
    });
    res.json(posts);
  } catch (error) {
    logger.error({ err: error }, 'Failed to fetch posts');
    res.status(500).json({ error: 'Failed to fetch posts' });
  }
};

export const getPostById = async (req, res) => {
  try {
    const { id } = req.params;
    const post = await prisma.communityPost.findUnique({
      where: { id },
      include: {
        user: { select: { name: true } },
        comments: {
          include: { user: { select: { name: true } } },
          orderBy: { createdAt: 'asc' }
        },
        _count: { select: { upvotes: true } }
      }
    });

    if (!post) return res.status(404).json({ error: 'Post not found' });

    // Check if current user has upvoted
    const upvote = await prisma.postUpvote.findUnique({
      where: {
        postId_userId: { postId: id, userId: req.user.id }
      }
    });

    // Fetch basic document details if documentId is present
    let document = null;
    if (post.documentId) {
      document = await prisma.document.findFirst({
        where: { id: post.documentId },
        select: { id: true, title: true }
      });
    }

    res.json({ ...post, document, hasUpvoted: !!upvote });
  } catch (error) {
    logger.error({ err: error }, 'Failed to fetch post');
    res.status(500).json({ error: 'Failed to fetch post' });
  }
};

export const addComment = async (req, res) => {
  try {
    const { id } = req.params;
    const { content } = req.body;

    if (!content) return res.status(400).json({ error: 'Content is required' });

    const comment = await prisma.postComment.create({
      data: {
        postId: id,
        userId: req.user.id,
        content
      },
      include: {
        user: { select: { name: true } }
      }
    });

    res.status(201).json(comment);
  } catch (error) {
    logger.error({ err: error }, 'Failed to add comment');
    res.status(500).json({ error: 'Failed to add comment' });
  }
};

export const toggleUpvote = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const existing = await prisma.postUpvote.findUnique({
      where: {
        postId_userId: { postId: id, userId }
      }
    });

    if (existing) {
      await prisma.postUpvote.delete({
        where: { id: existing.id }
      });
      res.json({ upvoted: false });
    } else {
      await prisma.postUpvote.create({
        data: { postId: id, userId }
      });
      res.json({ upvoted: true });
    }
  } catch (error) {
    logger.error({ err: error }, 'Failed to toggle upvote');
    res.status(500).json({ error: 'Failed to toggle upvote' });
  }
};
