import { supabase } from '../config/supabase.js';

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

    req.user = { id: user.id, email: user.email };
    next();
  } catch (err) {
    console.error('Auth Middleware Error:', err.message);
    return res.status(401).json({ error: 'Not authorized, token failed' });
  }
};
