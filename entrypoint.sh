#!/bin/sh
set -e

echo "=== Starting Kogna Application ==="

# Generate Prisma Client if needed
echo "Generating Prisma Client..."
npx prisma generate

# Run migrations if needed (optional - be careful in production)
# echo "Running database migrations..."
# npx prisma migrate deploy

# Start the server
echo "Starting server..."
exec node server.js
