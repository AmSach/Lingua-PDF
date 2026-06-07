# Devlog: Session 04 - RTL and Font Embedding
**Date:** 2026-06-06 02:15
**Duration:** 7 hours

This was the hardest part. PDF-lib doesn't support RTL out of the box. 

**The Fix:**
- **Manual Right Alignment**: For Arabic/Hebrew/Persian, I have to calculate the width of every translated line and manually offset the X position from the right margin.
- **Noto Font Embedding**: Standard PDF fonts (Helvetica/Times) only support Latin-1. I had to integrate dynamic WOFF2 embedding for Noto Sans Arabic, Devanagari, and CJK.
- **CORS Issues**: Fetching fonts from CDNs required specific jsDelivr headers.

**Status:** Full Arabic and Hindi PDF output confirmed. Layout preservation is looking solid.
