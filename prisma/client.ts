import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

prisma.$on('beforeExit', async () => {
  await prisma.$disconnect();
});

export default prisma;
