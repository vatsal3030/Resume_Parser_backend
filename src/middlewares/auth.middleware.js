import { supabase } from '../config/supabase.js';
import prisma from '../config/db.js';

export const protect = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    console.error('Auth Middleware Error: Token entirely missing from headers');
    return res.status(401).json({ error: 'Not authorized, token missing in request' });
  }

  try {
    // Verify token directly using Supabase Native Auth!
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) {
        throw new Error('Invalid Supabase token');
    }

    // Ensure user exists in Prisma DB with auto-retry on transient disconnects
    try {
      await prisma.user.upsert({
        where: { id: user.id },
        update: {},
        create: {
          id: user.id,
          email: user.email || 'unknown@example.com'
        }
      });
    } catch (dbErr) {
      try {
        await prisma.user.upsert({
          where: { id: user.id },
          update: {},
          create: {
            id: user.id,
            email: user.email || 'unknown@example.com'
          }
        });
      } catch (retryErr) {
        console.warn('Auth Middleware DB sync warn (proceeding with verified Supabase session):', retryErr.message);
      }
    }

    req.user = { id: user.id, email: user.email };
    next();
  } catch (err) {
    console.error('Auth Middleware Error:', err.message);
    return res.status(401).json({ error: 'Not authorized, token failed' });
  }
};
