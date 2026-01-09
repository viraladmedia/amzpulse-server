import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const gracefullyDisconnect = async () => {
  try {
    await prisma.$disconnect();
  } catch {
    // ignore disconnect errors during process shutdown
  }
};

process.on('beforeExit', gracefullyDisconnect);

export default prisma;
