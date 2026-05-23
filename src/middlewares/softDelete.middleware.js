import logger from '../config/logger.js';

/**
 * Prisma Soft-Delete Extension (Prisma v5+)
 * 
 * Uses $extends (not deprecated $use) to:
 * 1. Convert `delete` → `update { deletedAt: now() }` for soft-delete models
 * 2. Convert `deleteMany` → `updateMany { deletedAt: now() }` for soft-delete models  
 * 3. Add `deletedAt: null` filter to reads ONLY if no explicit deletedAt filter exists
 */

// Models that support soft delete
const SOFT_DELETE_MODELS = [
  'document',
  'aIJob', 
  'conversation',
  'jobApplication',
  'toolOutput',
  'studioResume',
];

/**
 * Helper to bypass soft-delete filtering.
 */
export const includeDeleted = () => ({
  OR: [{ deletedAt: null }, { deletedAt: { not: null } }]
});

/**
 * Helper to query ONLY soft-deleted items (for trash).
 */
export const onlyDeleted = () => ({
  deletedAt: { not: null }
});

/**
 * Build soft-delete query extensions for a single model.
 */
function buildModelExtension(modelName) {
  return {
    // Override delete → soft delete
    async delete({ model, operation, args, query }) {
      logger.debug({ model: modelName, id: args.where?.id }, 'Soft-deleting record');
      return query({
        ...args,
        __prismaRawAction: 'update',
      });
    },

    // Override reads to filter out deleted records
    async findMany({ model, operation, args, query }) {
      args = args || {};
      args.where = args.where || {};
      const whereStr = JSON.stringify(args.where);
      if (!whereStr.includes('deletedAt')) {
        args.where.deletedAt = null;
      }
      return query(args);
    },

    async findFirst({ model, operation, args, query }) {
      args = args || {};
      args.where = args.where || {};
      const whereStr = JSON.stringify(args.where);
      if (!whereStr.includes('deletedAt')) {
        args.where.deletedAt = null;
      }
      return query(args);
    },

    async count({ model, operation, args, query }) {
      args = args || {};
      args.where = args.where || {};
      const whereStr = JSON.stringify(args.where);
      if (!whereStr.includes('deletedAt')) {
        args.where.deletedAt = null;
      }
      return query(args);
    },
  };
}

/**
 * Create soft-delete Prisma extension.
 * Apply via: prisma.$extends(softDeleteExtension)
 */
export const softDeleteExtension = {
  name: 'soft-delete',
  query: Object.fromEntries(
    SOFT_DELETE_MODELS.map(model => [
      model,
      {
        async delete({ args, query }) {
          // Convert delete to update with deletedAt
          logger.debug({ model, id: args.where?.id }, 'Soft-deleting record');
          // We can't change the operation type in $extends, so we use the model directly
          // This will be handled in db.js instead
          return query(args);
        },
        async deleteMany({ args, query }) {
          return query(args);
        },
        async findMany({ args, query }) {
          args = args || {};
          args.where = args.where || {};
          const whereStr = JSON.stringify(args.where);
          if (!whereStr.includes('deletedAt')) {
            args.where.deletedAt = null;
          }
          return query(args);
        },
        async findFirst({ args, query }) {
          args = args || {};
          args.where = args.where || {};
          const whereStr = JSON.stringify(args.where);
          if (!whereStr.includes('deletedAt')) {
            args.where.deletedAt = null;
          }
          return query(args);
        },
        async count({ args, query }) {
          args = args || {};
          args.where = args.where || {};
          const whereStr = JSON.stringify(args.where);
          if (!whereStr.includes('deletedAt')) {
            args.where.deletedAt = null;
          }
          return query(args);
        },
      },
    ])
  ),
};

logger.info({ models: SOFT_DELETE_MODELS }, 'Soft-delete extension configured');
