# Rate Limit Monitoring and Management Guide

## Overview

The Front Exporter now includes comprehensive rate limit monitoring based on Front's official API documentation. This helps you understand your API usage and prevents hitting rate limits that could interrupt your export.

## Rate Limit Information Displayed

### 📊 **Headers Monitored**
- **`x-ratelimit-limit`**: Maximum requests per minute allowed
- **`x-ratelimit-remaining`**: Requests left in current time window
- **`x-ratelimit-reset`**: When the rate limit resets (UNIX timestamp)
- **`x-ratelimit-burst-limit`**: Additional burst allowance (50% of your plan limit)
- **`x-ratelimit-burst-remaining`**: Burst requests remaining in 10-minute window
- **`retry-after`**: Seconds to wait when rate limited
- **`x-front-tier`**: Tier-specific rate limiting indicator

### 🎯 **Front's Rate Limits**
- **Starter Plan**: 50 requests/minute
- **Growth Plan**: 100 requests/minute
- **Scale Plan**: 200 requests/minute
- **Burst Allowance**: Additional 50% of your plan limit for traffic spikes

## Smart Rate Limit Management

### 🤖 **Proactive Management**
The exporter automatically:
- **Monitors usage** in real-time during export
- **Slows down** when approaching rate limits (< 20% remaining)
- **Adds delays** when very low on requests (< 10% remaining)
- **Shows warnings** when rate limits are getting low

### ⚠️ **Rate Limit Exceeded Handling**
When you hit a rate limit:
- **Global Limit**: Shows your plan limits and suggests waiting
- **Burst Limit**: Indicates which tier caused the limit
- **Countdown Timer**: Shows exactly how long to wait
- **Auto-retry**: Automatically resumes after the wait period

## What You'll See During Export

### 📈 **Startup Information**
```
📥 Processing conversations from inbox: Support
📊 API Rate Limit: 45/50 requests available
```

### 🔄 **During Processing**
```
🔄 Processing batch 2 (100 conversations)...
⚠️ Low API requests: 8/50 remaining
▶ Processed: 150 conversations [5/50 API calls left]
```

### 🚨 **Rate Limit Warnings**
```
⚠️ Low on API requests: 5/50 remaining. Slowing down...
📊 API Rate Limit Status: 3/50 requests remaining
   Resets in: 1 minute(s)
   Burst: 15/25 remaining
```

### 🛑 **Rate Limit Exceeded**
```
⚠️  BURST RATE LIMIT EXCEEDED
   Tier: 2
   Regular requests remaining: 15/50
   Burst requests remaining: 0/25
⏳ Waiting 60 seconds before retry...
⏳ Waiting 0:59 before retry...
✅ Ready to resume requests
```

### 📋 **Final Summary**
```
🎉 Export completed for Support!
📈 Total conversations processed: 500
📊 Total conversations in inbox: 500
📊 API Usage: Used 47/50 requests (94.0%). 3 remaining.
```

## Rate Limit Tiers and Special Endpoints

### 🏆 **Tier 1 Limits** (1 request/second)
- Analytics exports and reports

### 🥈 **Tier 2 Limits** (5 requests/second per resource)
- Conversation updates
- Message posting
- Channel operations

### 📧 **Message Seen Limits** (10 requests/hour per message)
- Message seen status updates

## Tips for Efficient API Usage

### ✅ **Best Practices**
1. **Always use `resume`** - Prevents reprocessing completed conversations
2. **Export during off-peak hours** - Less competition for API calls
3. **Monitor the progress output** - Watch for rate limit warnings
4. **Process one inbox at a time** for large exports

### 🚀 **Optimization Features**
- **Memory-efficient streaming** - Processes in small batches
- **Intelligent pacing** - Automatically slows down when needed
- **Burst detection** - Handles temporary traffic spikes
- **Progress preservation** - Never lose progress due to rate limits

## Troubleshooting Rate Limits

### 🔍 **If You See Frequent Rate Limiting**
1. **Check your plan** - Upgrade for higher limits
2. **Reduce concurrent operations** - Don't run multiple exports
3. **Use smaller batch sizes** - The app handles this automatically
4. **Export during quiet periods** - Early morning or late evening

### 📞 **Upgrading Your Rate Limit**
Front offers API rate limit add-ons:
- Available on Professional plan or higher
- Contact Front support for custom limits
- See: https://help.front.com/en/articles/2438#api_rate_limit_add_on

## Error Messages Explained

| Message | Cause | Solution |
|---------|-------|----------|
| "Global rate limit exceeded" | Used all requests/minute | Wait for reset (up to 1 minute) |
| "Burst rate limit exceeded" | Used burst allowance too quickly | Wait 10 minutes for burst replenishment |
| "Tier X resource burst limit" | Hit endpoint-specific limit | Wait for retry-after period |
| "Low on API requests" | Approaching limit | App automatically slows down |

The new rate limiting system ensures your exports complete successfully while respecting Front's API limits and providing full visibility into your usage!
