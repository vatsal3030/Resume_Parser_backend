import { PrismaClient } from '@prisma/client';
import { softDeleteExtension } from '../middlewares/softDelete.middleware.js';

const basePrisma = new PrismaClient();

// Apply soft-delete extension (Prisma v5+ $extends API)
const prisma = basePrisma.$extends(softDeleteExtension);

export default prisma;
