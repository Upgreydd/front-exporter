# JSON Cache Corruption Fix

## 🐛 **Issue: "Unexpected end of JSON input"**

### **What Causes This Error?**

The error occurs when cached conversation list files (`./export/[inbox-name]/inb_*.json`) are **incomplete or corrupted**. This happens when:

1. **Export interrupted** (Ctrl+C, network error, system crash)
2. **Disk full** during write operation
3. **Permission issues** preventing file completion
4. **System shutdown** during active export

### **How the Cache Works**

The system creates JSON files in streaming fashion:
```
[                          <- Opening bracket (first batch)
  {"id":"conv_1",...},     <- Conversation data
  {"id":"conv_2",...},     <- More conversations
  {"id":"conv_3",...}      <- Last conversation
]                          <- Closing bracket (final batch)
```

If the export stops before the **final batch**, the file ends without the closing `]`, making it invalid JSON.

### **The Error Chain**
1. Previous export interrupted → Incomplete JSON file
2. Next export starts → Tries to read cached file
3. `JSON.parse()` fails → "Unexpected end of JSON input"
4. Export fails → User sees error

## 🔧 **Solutions**

### **Automatic Recovery (Built-in)**
The system now automatically detects and fixes corrupted cache files:

```
⚠️  Cached conversation list is corrupted or incomplete
🔄 Rebuilding conversation list from API...
```

### **Manual Cleanup (Optional)**
Check and clean corrupted files manually:

```bash
# Check all cache files
node scripts/check-cache.js

# Check and clean corrupted files
node scripts/check-cache.js --clean
```

### **Prevention**
- **Don't interrupt exports** with Ctrl+C if possible
- **Monitor disk space** before large exports
- **Use `--resume` flag** to continue interrupted exports

## 🎯 **What's Fixed**

### **Before:**
```
❌ [1/67] Failed: gargi - Unexpected end of JSON input
❌ [2/67] Failed: OnlineArya - Unexpected end of JSON input
```

### **After:**
```
⚠️  Cached conversation list is corrupted or incomplete
🔄 Rebuilding conversation list from API...
📥 Processing conversations from inbox: gargi
```

The system now gracefully handles corrupted cache files and rebuilds them automatically! 🎉

## 📝 **Technical Details**

### **Validation Logic:**
1. **File exists check** - Does the cache file exist?
2. **Structure check** - Does it start with `[` and end with `]`?
3. **Parse check** - Can it be parsed as valid JSON?
4. **Array check** - Is the parsed result an array?

### **Recovery Process:**
1. **Detect corruption** - Validation fails
2. **Remove bad file** - Delete corrupted cache
3. **Rebuild from API** - Fetch fresh conversation list
4. **Continue export** - Process normally

### **Enhanced Logging:**
- **Cache validation** logged to debug logs
- **Corruption detection** shown in console
- **Recovery process** documented in logs
- **Completion status** tracked properly
