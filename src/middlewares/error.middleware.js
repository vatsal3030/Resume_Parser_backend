import logger from '../config/logger.js';

export const globalErrorHandler = (err, req, res, next) => {
  logger.error({ 
    err, 
    path: req.path, 
    method: req.method, 
    body: req.body 
  }, 'Unhandled Exception Captured');

  const status = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  res.status(status).json({
    error: {
      message,
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    }
  });
};
