import { PrismaClient } from '@prisma/client';
import { softDeleteExtension } from '../middlewares/softDelete.middleware.js';
import logger from './logger.js';

const basePrisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

// Automatic reconnection extension for transient connection drops (P1017, P1001, closed connection)
const retryExtension = {
  name: 'auto-retry-closed-connections',
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        try {
          return await query(args);
        } catch (error) {
          const isConnectionClosed = 
            error?.code === 'P1017' || 
            error?.code === 'P1001' || 
            error?.message?.includes('Server has closed the connection') ||
            error?.message?.includes('Connection pool') ||
            error?.message?.includes('socket has been closed');

          if (isConnectionClosed) {
            logger.warn({ model, operation, code: error?.code }, '[Prisma] Database connection dropped. Auto-reconnecting and retrying operation...');
            try {
              await basePrisma.$disconnect();
              await basePrisma.$connect();
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
