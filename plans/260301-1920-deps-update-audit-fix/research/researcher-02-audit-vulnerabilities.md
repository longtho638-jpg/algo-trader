# NPM/PNPM Audit Vulnerabilities Report

**Report Date:** 2026-03-01
**Project:** algo-trader
**Scope:** Monorepo audit (all packages analyzed)

---

## Executive Summary

**Total Vulnerabilities Found:** 3
**Severity Breakdown:** 2 HIGH | 1 LOW
**Direct Dependency Impact:** NONE (algo-trader unaffected)
**Mitigation Status:** PARTIAL (ai@>=5.0.52 override applied, xlsx unhandled)

---

## Vulnerability Details

### 1. **[HIGH] Prototype Pollution in SheetJS**
- **Package:** `xlsx@0.18.5`
- **Vulnerability ID:** GHSA-4r6h-8v6p-xvw6
- **Vulnerable Versions:** <0.19.3
- **Patched Versions:** No patch available (marked <0.0.0 in advisory)
- **Affected Location:** `apps/com-anh-duong-10x > xlsx@0.18.5`
- **Risk:** Prototype pollution attack vector via malicious spreadsheet input
- **Status:** ⚠️ UNPATCHED — xlsx has no patch path forward

### 2. **[HIGH] SheetJS ReDoS (Regular Expression Denial of Service)**
- **Package:** `xlsx@0.18.5`
- **Vulnerability ID:** GHSA-5pgg-2g8v-p4x9
- **Vulnerable Versions:** <0.20.2
- **Patched Versions:** No patch available (marked <0.0.0 in advisory)
- **Affected Location:** `apps/com-anh-duong-10x > xlsx@0.18.5`
- **Risk:** CPU exhaustion via malformed spreadsheet strings
- **Status:** ⚠️ UNPATCHED — advisory indicates library inactive

### 3. **[LOW] Vercel AI SDK File Upload Bypass**
- **Package:** `ai@4.3.19`
- **Vulnerability ID:** GHSA-rwvc-j5jr-mgvh
- **Vulnerable Versions:** <5.0.52
- **Patched Versions:** >=5.0.52
- **Affected Locations:**
  - `apps/apex-os > ai@4.3.19`
  - `apps/well > ai@4.3.19`
- **Risk:** File type whitelist bypass on upload operations
- **Status:** ✅ OVERRIDE APPLIED in monorepo root `package.json` (ai@>=5.0.52)

---

## Monorepo Overrides Already In Place

**File:** `/Users/macbookprom1/mekong-cli/package.json` (lines 48-72)

```json
"pnpm": {
  "overrides": {
    "ai@<5.0.52": ">=5.0.52"
  }
}
```

**Coverage:** ✅ Addresses ai vulnerability; ❌ Does NOT handle xlsx (no stable patch)

---

## Impact Analysis on algo-trader

✅ **algo-trader is NOT directly affected:**
- Does NOT depend on `xlsx` (only `com-anh-duong-10x` uses it)
- Does NOT depend on `ai@<5.0.52` (override applies to project scope)
- Direct dependencies: ccxt, chalk, commander, dotenv, technicalindicators, winston (all clean)

---

## Recommendations

| Action | Priority | Scope |
|--------|----------|-------|
| Upgrade `ai` to >=5.0.52 | MEDIUM | apex-os, well (already overridden) |
| Replace `xlsx@0.18.5` or migrate | HIGH | com-anh-duong-10x only |
| Implement input validation | HIGH | Any spreadsheet processing |
| Monitor SheetJS advisories | ONGOING | com-anh-duong-10x maintenance |

---

## Unresolved Questions

1. **xlsx patch availability:** Library marked inactive; should com-anh-duong-10x migrate to alternative?
2. **Spreadsheet input source:** Is xlsx processing untrusted user input in com-anh-duong-10x?
3. **ai override verification:** Do apex-os/well explicitly test ai@>=5.0.52 compatibility?
