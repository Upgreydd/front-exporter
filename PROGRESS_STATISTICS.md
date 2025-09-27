# Progress Statistics Logging Enhancement

## 🔧 **New Progress Statistics Features**

### **1. Session Progress Tracking**
- **Session Start Time**: Tracks when export session began
- **Total API Requests**: Running count of all API calls made
- **Total Items Processed**: Count of conversations, messages, etc. processed
- **Request Rate**: Real-time requests per minute calculation
- **Item Processing Rate**: Items processed per minute
- **Session Duration**: Human-readable uptime (1h 23m, 45m 30s, etc.)

### **2. Enhanced Debug Logging**
Each API request now logs:
```
API Request [142] - Conversations (attempt 1) | RPM: 8.3 | Session: 2h 15m
```
- **Request Number**: Sequential API call counter
- **Endpoint Type**: Conversations, Messages, Comments, Inboxes, Attachments
- **Attempt Number**: Retry attempt for failed requests
- **RPM**: Current requests per minute rate
- **Session Duration**: Time since export started

### **3. Periodic Progress Reports**
Every 2 minutes, logs comprehensive session statistics:
```
📊 Session Progress: 156 API calls | 42 items processed | 8.1 req/min | 1.7 items/min | Rate limit: 144/200 (72%) | Uptime: 2h 18m
```

### **4. Paginated Operation Logging**
Tracks progress for batch operations:
```
Paginated processing completed: 25 items | Total processed: 167 items | Rate: 2.1 items/min
```

### **5. Export Completion Statistics**
Enhanced final summary with completion rates:
```
🎉 Export completed for Support Inbox!
📈 Total conversations processed: 156
📊 Total conversations in inbox: 160
📊 Completion rate: 97.5%
📊 API Usage: Used 178/200 requests (89%). 22 remaining.
```

## 📊 **Log File Examples**

### **Debug Log (.logs/debug.log):**
```
[2024-09-27 14:23:45] INFO [C] 📊 Progress tracking reset for new export session
[2024-09-27 14:23:46] DEBUG [C] API Request [1] - Inboxes (attempt 1) | RPM: 0.0 | Session: 1s
[2024-09-27 14:23:47] DEBUG [C] API Request [2] - Conversations (attempt 1) | RPM: 2.0 | Session: 2s
[2024-09-27 14:23:48] DEBUG [C] Paginated completed: 50 items | Total processed: 50 | Rate: 25.0 items/min
[2024-09-27 14:25:47] INFO [C] 📊 Session Progress: 45 API calls | 142 items processed | 22.5 req/min | 71.0 items/min | Rate limit: 155/200 (78%) | Uptime: 2m 2s
```

### **Main Log (.logs/main.log):**
```
[2024-09-27 14:23:45] INFO [M] Starting export for inbox: Support (inb_abc123)
[2024-09-27 14:25:47] INFO [C] 📊 Session Progress: 45 API calls | 142 items processed | 22.5 req/min | 71.0 items/min | Rate limit: 155/200 (78%) | Uptime: 2m 2s
[2024-09-27 14:26:23] INFO [E] Export completed. Total conversations processed: 156. Completion: 97.5%
```

## 🎯 **Benefits**

### **1. Performance Monitoring**
- Track export speed and efficiency
- Identify bottlenecks and slow periods
- Monitor API rate limit usage patterns

### **2. Progress Estimation**
- Real-time throughput calculations
- Session duration tracking
- Completion percentage for known totals

### **3. Troubleshooting**
- Detailed request-level logging
- Retry attempt tracking
- Endpoint-specific performance data

### **4. Resource Planning**
- API quota usage forecasting
- Export time estimation
- Optimal concurrency monitoring

## 🚀 **Usage**

The progress statistics are automatically enabled and will appear in:

1. **Console Output**: Key progress milestones and summaries
2. **Debug Logs**: Detailed per-request statistics and periodic reports
3. **Main Logs**: Important session progress and completion statistics

**Commands remain the same:**
```bash
yarn start list-inboxes
yarn start export-all
yarn start export-from inb_123abc
```

The enhanced logging provides rich progress insights while maintaining the clean, simple CLI interface! 📊
