import { PrismaClient } from '@prisma/client';
import { softDeleteExtension } from '../middlewares/softDelete.middleware.js';
import logger from './logger.js';

const basePrisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

// Eager initial connection
basePrisma.$connect().catch((err) => {
  logger.warn({ err: err?.message }, '[Prisma] Initial connect failed, will retry on query');
});

const isConnectionError = (err) => {
  if (!err) return false;
  const msg = (err.message || '').toLowerCase();
  const code = err.code || '';
  return (
    code === 'P1017' ||
    code === 'P1001' ||
    code === 'P1002' ||
    code === 'P1008' ||
    code === 'P1011' ||
    msg.includes('engine is not yet connected') ||
    msg.includes('engine is disconnecting') ||
    msg.includes('engine is closing') ||
    msg.includes('server has closed the connection') ||
    msg.includes('connection pool') ||
    msg.includes('socket has been closed') ||
    msg.includes('closed connection') ||
    msg.includes("can't reach database server") ||
    msg.includes('connection timed out') ||
    msg.includes('econnreset') ||
    msg.includes('prepared statement')
  );
};

// Automatic reconnection extension for transient connection drops
const retryExtension = {
  name: 'auto-retry-closed-connections',
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        try {
          return await query(args);
        } catch (error) {
          if (isConnectionError(error)) {
            logger.warn({ model, operation, code: error?.code, msg: error?.message }, '[Prisma] Database connection interrupted. Auto-reconnecting and retrying operation...');
            try {
              await basePrisma.$disconnect().catch(() => {});
              await basePrisma.$connect().catch(() => {});
              // Small backoff before retrying
              await new Promise(r => setTimeout(r, 200));
            } catch (reconErr) {
              // Ignore reconnect error, let query attempt reconnect
            }
            return await query(args);
          }
          throw error;
        }
      }
    }
  }
};

// Apply soft-delete extension and retry extension
const prisma = basePrisma
  .$extends(softDeleteExtension)
  .$extends(retryExtension);

export default prisma;

