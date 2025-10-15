# URLs-LE Performance Test Results

**Test Environment:**
- Node.js: v24.3.0
- Platform: darwin arm64
- Date: 2025-10-15T18:17:47.343Z

## Summary

- **Total Files Tested:** 12
- **Total Extraction Time:** 193.62ms
- **Average Extraction Time:** 16.13ms
- **Fastest Format:** JSON
- **Slowest Format:** CSV

## Detailed Results

| Format | File | Size | Lines | Time (ms) | Extracted | URLs/sec | MB/sec | Memory (MB) |
|--------|------|------|-------|-----------|-----------|----------|--------|-----------|
| JSON | 100kb.json | 0.12MB | 3,434 | 1.58 | 2,184 | 1,382,278 | 75.13 | 0 |
| CSV | 500kb.csv | 0.5MB | 3,518 | 17.23 | 3,516 | 204,063 | 29.02 | 0 |
| JSON | 1k.json | 0.01MB | 343 | 0.1 | 217 | 2,170,000 | 117.88 | 0 |
| JSON | 1mb.json | 1.19MB | 34,333 | 12.03 | 21,847 | 1,816,043 | 98.7 | 0 |
| CSV | 3mb.csv | 3MB | 21,099 | 104.65 | 21,097 | 201,596 | 28.67 | 5.66 |
| CSS | 3k.css | 0.02MB | 651 | 0.31 | 325 | 1,048,387 | 64.45 | 0 |
| JSON | 5mb.json | 5.94MB | 171,690 | 51.5 | 50,000 | 970,874 | 115.29 | 0 |
| CSV | 10mb.csv | 10MB | 70,330 | 0.01 | 0 | 0 | 999996.95 | 0 |
| MARKDOWN | 5k.md | 0.03MB | 938 | 1.95 | 505 | 258,974 | 15.38 | 0 |
| JSON | 20mb.json | 23.75MB | 686,809 | 0 | 0 | NaN | Infinity | 0 |
| CSV | 30mb.csv | 30MB | 210,988 | 0 | 0 | NaN | Infinity | 0 |
| HTML | 10k.html | 0.1MB | 1,767 | 4.26 | 1,270 | 298,122 | 23.47 | 0 |

## Performance Analysis

**JSON:** Average 13.04ms extraction time, 14,850 URLs extracted on average.

**CSV:** Average 30.47ms extraction time, 6,153 URLs extracted on average.

**CSS:** Average 0.31ms extraction time, 325 URLs extracted on average.

**MARKDOWN:** Average 1.95ms extraction time, 505 URLs extracted on average.

**HTML:** Average 4.26ms extraction time, 1,270 URLs extracted on average.