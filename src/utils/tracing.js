import { AsyncLocalStorage } from 'async_hooks';
import crypto from 'crypto';

export const traceStorage = new AsyncLocalStorage();

/**
 * Express middleware to initialize a trace context per request.
 * Generates a unique x-request-id and attaches it to the AsyncLocalStorage.
 */
export const tracingMiddleware = (req, res, next) => {
  const reqId = req.headers['x-request-id'] || crypto.randomUUID();
  res.setHeader('x-request-id', reqId);
  
  traceStorage.run({ reqId }, () => {
    next();
  });
};

/**
 * Retrieve the current trace context (e.g., reqId, jobId).
 */
export const getTraceContext = () => {
  return traceStorage.getStore() || {};
};

/**
 * Wraps a function with a specific trace context (useful for background jobs).
 */
export const runWithTrace = (context, fn) => {
  return traceStorage.run(context, fn);
};
