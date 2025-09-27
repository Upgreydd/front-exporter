# Memory Optimization Troubleshooting Guide

## What Changed

I've implemented several memory optimizations to prevent the "JavaScript heap out of memory" error:

### 1. **Streaming Processing**
- Replaced memory-intensive bulk loading with streaming pagination
- Process conversations in small batches instead of loading all at once
- Each batch is processed and cleared from memory before the next

### 2. **Memory-Efficient Caching**
- Conversations are now written to cache file incrementally
- No longer keeping entire conversation list in memory
- Progress tracking prevents reprocessing on resume

### 3. **Optimized Node.js Settings**
- Added memory flags to increase heap size
- Enabled garbage collection exposure
- Size-optimized compilation

## How to Run

### Option 1: Using optimized yarn script (Recommended)
```bash
yarn start:optimized list-inboxes
yarn start:optimized export-from <inboxID> resume
yarn start:optimized export-all resume
```

### Option 2: Using the shell script
```bash
./start-optimized.sh list-inboxes
./start-optimized.sh export-from <inboxID> resume
./start-optimized.sh export-all resume
```

### Option 3: Manual with memory flags
```bash
node --max-old-space-size=4096 --expose-gc -r ts-node/register ./src/index.ts export-from <inboxID> resume
```

## Memory Settings Explained

- `--max-old-space-size=4096`: Sets heap size to 4GB (increase to 8192 for 8GB if needed)
- `--expose-gc`: Allows manual garbage collection between batches
- `--optimize-for-size`: Optimizes for memory usage over speed

## If You Still Get Memory Errors

1. **Increase heap size further:**
   ```bash
   yarn start:safe export-from <inboxID> resume
   ```

2. **Check available system memory:**
   ```bash
   free -h
   ```

3. **Monitor memory usage during export:**
   ```bash
   htop  # or top
   ```

4. **Process smaller batches by exporting one inbox at a time:**
   ```bash
   yarn start:optimized export-from inb_123 resume
   ```

## Resume Functionality

Always use the `resume` parameter to:
- Continue from where you left off if interrupted
- Skip already processed conversations
- Maintain progress across restarts

## Expected Behavior

✅ **Before:** Loading 10,000+ conversations into memory → Crash
✅ **After:** Process ~100 conversations at a time → Success

The new approach should handle large datasets without memory issues by:
- Processing in small, manageable chunks
- Clearing memory between batches
- Saving progress continuously
- Resuming from last processed conversation
