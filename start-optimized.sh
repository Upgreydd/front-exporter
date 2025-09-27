#!/bin/bash

# Start script with memory optimization flags
echo "🚀 Starting Front Exporter with memory optimizations..."

# Set Node.js memory and garbage collection flags
export NODE_OPTIONS="--max-old-space-size=4096 --expose-gc --optimize-for-size"

echo "📊 Memory settings:"
echo "  - Max heap size: 4GB"
echo "  - Garbage collection: Exposed"
echo "  - Optimized for size: Yes"
echo ""

# Run the application
npx ts-node ./src/index.ts "$@"
