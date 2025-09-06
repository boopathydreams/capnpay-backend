const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

console.log('Available Prisma models:');
console.log(Object.keys(prisma));

// Look for payment receipt specifically
const models = Object.keys(prisma);
const receiptModels = models.filter((m) => m.toLowerCase().includes('receipt'));
console.log('Receipt-related models:', receiptModels);

prisma.$disconnect();
