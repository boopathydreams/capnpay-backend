#!/bin/sh

# Database initialization script for NestJS backend
set -e

echo "🔄 Starting database initialization..."

# Wait for database to be ready
echo "⏳ Waiting for database connection..."
until node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.\$connect().then(() => {
  console.log('✅ Database connected');
  process.exit(0);
}).catch(() => {
  console.log('❌ Database not ready, retrying...');
  process.exit(1);
});
"; do
  echo "Database not ready, waiting 5 seconds..."
  sleep 5
done

# Run database migrations
echo "🏗️  Running Prisma migrations..."
npx prisma migrate deploy

# Generate Prisma client (if not already done)
echo "⚙️  Generating Prisma client..."
npx prisma generate

# Seed default data if needed
echo "🌱 Checking for seed data..."
if [ -f "/app/seed-default-data.js" ]; then
  echo "🌱 Running seed script..."
  node /app/seed-default-data.js
fi

echo "✅ Database initialization complete!"
