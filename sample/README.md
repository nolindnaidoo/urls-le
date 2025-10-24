# URLs-LE Sample Files

Test files for URLs-LE URL extraction functionality across all supported formats. Use these files to explore URL detection from various source types.

---

## 📋 Sample Files Overview

| File               | Format     | URLs | Description                                    |
| ------------------ | ---------- | ---- | ---------------------------------------------- |
| `web-page.html`    | HTML       | ~20  | Web page with links, images, scripts, styles   |
| `app-imports.js`   | JavaScript | ~10  | JavaScript with external resource URLs         |
| `documentation.md` | Markdown   | ~15  | Documentation with various URL types           |
| `styles.css`       | CSS        | ~40  | Stylesheet with fonts, images, imports         |
| `api-config.json`  | JSON       | ~50  | API configuration with endpoints and resources |
| `config.yaml`      | YAML       | ~45  | Application config with service URLs           |

**Total**: ~180 URLs across 6 file types demonstrating comprehensive format coverage

---

## 🚀 Quick Start

### 1. Extract URLs from HTML

1. Open `sample/web-page.html`
2. Run **Extract URLs** (`Cmd/Ctrl+Alt+U`)
3. See all URLs from links, images, scripts extracted

### 2. Extract from JavaScript

1. Open `sample/app-imports.js`
2. Run **Extract URLs** (`Cmd/Ctrl+Alt+U`)
3. See CDN URLs and external resources

### 3. Extract from Markdown

1. Open `sample/documentation.md`
2. Run **Extract URLs** (`Cmd/Ctrl+Alt+U`)
3. See documentation links extracted

### 4. Extract from CSS

1. Open `sample/styles.css`
2. Run **Extract URLs** (`Cmd/Ctrl+Alt+U`)
3. See font URLs, image URLs, imports

### 5. Extract from JSON

1. Open `sample/api-config.json`
2. Run **Extract URLs** (`Cmd/Ctrl+Alt+U`)
3. See API endpoints and external services

### 6. Extract from YAML

1. Open `sample/config.yaml`
2. Run **Extract URLs** (`Cmd/Ctrl+Alt+U`)
3. See configuration URLs extracted

---

## 📁 File Details

### web-page.html - HTML Web Page

**Size**: ~600 bytes  
**URLs**: ~20  
**Purpose**: Standard HTML page with various URL types

**Contents**:

- External stylesheets (`<link>`)
- Images (`<img src>`)
- Scripts (`<script src>`)
- Navigation links (`<a href>`)
- Responsive images (`srcset`)
- Video sources

**URL Types**:

- HTTPS URLs
- Relative URLs (./path, ../path)
- CDN URLs
- Protocol-relative URLs (//cdn.example.com)

**Best For**: Testing HTML attribute extraction

---

### app-imports.js - JavaScript Imports

**Size**: ~400 bytes  
**URLs**: ~10  
**Purpose**: JavaScript file with external resources

**Contents**:

- CDN script URLs
- External library URLs
- API endpoint URLs
- Asset URLs

**URL Types**:

- HTTPS URLs
- HTTP URLs (legacy)
- CDN URLs with version numbers

**Best For**: Testing JavaScript URL extraction

---

### documentation.md - Markdown Documentation

**Size**: ~300 bytes  
**URLs**: ~15  
**Purpose**: Documentation with various link types

**Contents**:

- External documentation links
- GitHub repository links
- API reference URLs
- Related resource links

**URL Types**:

- HTTPS URLs
- GitHub URLs
- Documentation site URLs

**Best For**: Testing Markdown link extraction

---

### styles.css - CSS Stylesheet

**Size**: ~3KB  
**URLs**: ~40  
**Purpose**: Comprehensive CSS with URL references

**Contents**:

- `@import` statements
- `url()` in backgrounds
- Font face declarations
- Cursor definitions
- Multiple protocols

**URL Types**:

- Google Fonts URLs
- CDN URLs
- Relative paths (./fonts, ../images)
- Absolute URLs
- Protocol-relative URLs
- Data URLs (excluded automatically)

**Best For**: Testing CSS url() and @import extraction

---

### api-config.json - API Configuration

**Size**: ~2KB  
**URLs**: ~50  
**Purpose**: JSON API configuration file

**Contents**:

- API endpoints
- OAuth URLs
- Webhook URLs
- CDN URLs
- Social media links
- External service integrations
- Resource URLs

**URL Types**:

- HTTPS API endpoints
- HTTP legacy APIs
- WebSocket URLs (wss://)
- FTP URLs
- Mailto links
- Tel links

**Best For**: Testing nested JSON URL extraction, multiple protocols

---

### config.yaml - Application Configuration

**Size**: ~1.8KB  
**URLs**: ~45  
**Purpose**: YAML application configuration

**Contents**:

- API endpoints
- External services
- OAuth providers
- Webhook configurations
- CDN resources
- Social media links
- Integration URLs

**URL Types**:

- HTTPS URLs
- HTTP URLs
- WebSocket URLs
- FTP URLs
- Mailto/Tel links

**Best For**: Testing YAML parsing, nested structures

---

## ⚙️ Configuration Test Cases

### Test 1: Basic Extraction (Default Settings)

**Goal**: Extract all URLs in original format  
**Steps**:

1. Open any sample file
2. Run **Extract URLs**
3. Verify all URLs extracted
4. Check order preserved

**Expected**: All URLs extracted, one per line

---

### Test 2: Deduplication Enabled

**Goal**: Remove duplicate URLs  
**Settings**: `urls-le.dedupeEnabled: true`  
**Steps**:

1. Open `api-config.json` (may have duplicate CDN URLs)
2. Run **Extract URLs**
3. Verify duplicates removed

**Expected**: Only unique URLs appear

---

### Test 3: Filter by Protocol

**Goal**: Extract only HTTPS URLs  
**Settings**: Configure protocol filters  
**Steps**:

1. Open `api-config.json` (has mixed protocols)
2. Enable HTTPS only
3. Run **Extract URLs**

**Expected**: Only HTTPS URLs extracted

---

### Test 4: Side-by-Side Results

**Goal**: Open results beside source  
**Settings**: `urls-le.openResultsSideBySide: true`  
**Steps**:

1. Open any sample file
2. Run **Extract URLs**
3. Verify split view

**Expected**: Source and results visible side-by-side

---

### Test 5: Copy to Clipboard

**Goal**: Auto-copy results  
**Settings**: `urls-le.copyToClipboardEnabled: true`  
**Steps**:

1. Open any sample file
2. Run **Extract URLs**
3. Paste clipboard (Cmd/Ctrl+V)

**Expected**: Extracted URLs in clipboard

---

### Test 6: Large File Warning

**Goal**: Test safety warning for large files  
**Settings**: `urls-le.safety.enabled: true`  
**Steps**:

1. Create large HTML file (>1MB)
2. Run **Extract URLs**
3. Verify warning appears

**Expected**: Warning before processing

---

### Test 7: Notification Levels

**Goal**: Test notification verbosity  
**Settings**: Try each:

- `urls-le.notificationsLevel: "silent"` - No notifications
- `urls-le.notificationsLevel: "important"` - Important only
- `urls-le.notificationsLevel: "all"` - All messages

**Expected**: Notifications match configured level

---

### Test 8: HTML Comment Filtering

**Goal**: Test comment exclusion  
**Steps**:

1. Add URLs in HTML comments to `web-page.html`
2. Run **Extract URLs**
3. Verify commented URLs excluded

**Expected**: URLs in comments not extracted

---

### Test 9: Data URL Exclusion

**Goal**: Verify data: URLs excluded  
**File**: `styles.css` (has data URL)  
**Steps**:

1. Open `styles.css`
2. Run **Extract URLs**
3. Check results

**Expected**: Data URLs automatically excluded

---

### Test 10: Multiple Protocols

**Goal**: Test various URL protocols  
**File**: `api-config.json` → protocols section  
**Steps**:

1. Open `api-config.json`
2. Run **Extract URLs**
3. Verify all protocols extracted

**Expected**: HTTP, HTTPS, FTP, WS, WSS, mailto, tel all extracted

---

## 🧪 Edge Cases & Error Scenarios

### Edge Case 1: Empty File

**File**: Create empty HTML file  
**Expected**: No URLs found message

### Edge Case 2: No URLs

**File**: HTML with only text, no links  
**Expected**: No URLs found message

### Edge Case 3: Malformed URLs

**File**: Add broken URLs (missing protocol)  
**Expected**: Invalid URLs skipped, valid ones extracted

### Edge Case 4: Very Long URLs

**File**: Add URL with 1000+ character query string  
**Expected**: Full URL extracted

### Edge Case 5: Unicode in URLs

**File**: Add URLs with unicode characters  
**Expected**: URLs with proper encoding extracted

### Edge Case 6: URLs with Fragments

**File**: `https://example.com/page#section`  
**Expected**: Full URL including fragment extracted

### Edge Case 7: URLs with Query Parameters

**File**: `https://api.example.com?key=value&param=123`  
**Expected**: Full URL with params extracted

### Edge Case 8: Protocol-Relative URLs

**File**: `//cdn.example.com/script.js`  
**Expected**: Protocol-relative URLs extracted

### Edge Case 9: IPv4/IPv6 URLs

**File**: `http://192.168.1.1` or `http://[::1]`  
**Expected**: IP-based URLs extracted

### Edge Case 10: URLs in Code Blocks

**File**: Markdown with URLs in code blocks  
**Expected**: Code block URLs extracted (they're valid)

---

## 📊 Performance Benchmarks

### Small Files (< 1KB)

- **All sample files except styles.css**
- **Expected**: < 100ms extraction

### Medium Files (1KB - 10KB)

- **styles.css**, **api-config.json**
- **Expected**: < 500ms extraction

### Large Files (10KB - 100KB)

- Create large HTML with 1000+ links
- **Expected**: < 2 seconds extraction

### Very Large Files (> 1MB)

- Should trigger safety warning
- **Expected**: Warning before processing

---

## 🛠️ Troubleshooting

### Issue: No URLs Extracted

**Possible Causes**:

1. File type not supported
2. No valid URLs in file
3. Parse error

**Solution**:

- Verify file extension (.html, .css, .js, .json, .yaml, .md)
- Check that URLs use valid protocols
- Enable `urls-le.showParseErrors: true`

---

### Issue: Performance Issues

**Possible Causes**:

1. Very large file (> 10MB)
2. Sorting/deduplication on large output

**Solution**:

- Enable safety warnings: `urls-le.safety.enabled: true`
- Disable sorting: `urls-le.sortEnabled: false`
- Disable deduplication: `urls-le.dedupeEnabled: false`

---

### Issue: Missing URLs

**Possible Causes**:

1. URLs in comments (excluded by default)
2. Invalid URL format
3. Protocol not supported

**Solution**:

- Check URL format (must have valid protocol)
- Verify not in HTML/CSS comments
- Check supported protocols (HTTP, HTTPS, FTP, WS, WSS, mailto, tel)

---

### Issue: Data URLs Extracted

**Possible Causes**:

1. Filter not working

**Solution**:

- Data URLs should be automatically excluded
- Check for extension bug if appearing
- Report issue with sample

---

## 💡 Best Practices

### 1. Enable Deduplication for Large Sites

```json
{
  "urls-le.dedupeEnabled": true
}
```

✓ Removes duplicate CDN URLs  
✓ Cleaner results

### 2. Use Side-by-Side for Review

```json
{
  "urls-le.openResultsSideBySide": true
}
```

✓ Compare source and results  
✓ Quick verification

### 3. Filter Protocols as Needed

```json
{
  "urls-le.extractHttp": false,
  "urls-le.extractHttps": true
}
```

✓ Focus on secure URLs only  
✓ Identify insecure resources

### 4. Enable Safety Checks

```json
{
  "urls-le.safety.enabled": true,
  "urls-le.safety.fileSizeWarnBytes": 1000000
}
```

✓ Prevents performance issues  
✓ Warns before large operations

---

## 🎯 Recommended Workflows

### For Web Development Audit

1. Open project HTML file
2. Run **Extract URLs**
3. Review for:
   - Broken links
   - Insecure (HTTP) resources
   - Missing CDN fallbacks
   - Outdated API endpoints

### For Documentation Maintenance

1. Open Markdown documentation
2. Run **Extract URLs**
3. Verify all links:
   - Still valid
   - Point to correct resources
   - Use HTTPS
   - No 404s (test externally)

### For API Configuration Review

1. Open API config JSON/YAML
2. Run **Extract URLs**
3. Document all endpoints
4. Verify environment-specific URLs
5. Check for hardcoded secrets in URLs

### For CSS Asset Analysis

1. Open stylesheet
2. Run **Extract URLs**
3. Identify all external resources:
   - Fonts
   - Images
   - Imports
4. Optimize/consolidate as needed

---

## 🚀 Next Steps

1. **Try all sample files** - Get familiar with different formats
2. **Experiment with settings** - Test filtering and sorting
3. **Create your own test files** - Add URLs from your projects
4. **Report issues** - [Open an issue](https://github.com/OffensiveEdge/urls-le/issues)
5. **Share feedback** - Rate on [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=OffensiveEdge.urls-le)

---

## 📚 Additional Resources

- **README**: Complete feature documentation
- **CONFIGURATION.md**: Detailed settings guide
- **TROUBLESHOOTING.md**: Common issues and solutions

---

**Need Help?** Check [GitHub Issues](https://github.com/OffensiveEdge/urls-le/issues) or open a new issue.

**Found a bug?** Report with:

1. Sample file (or minimal reproduction)
2. Expected URLs
3. Actual results
4. URLs-LE version
5. VS Code version

---

Copyright © 2025 @OffensiveEdge. All rights reserved.
