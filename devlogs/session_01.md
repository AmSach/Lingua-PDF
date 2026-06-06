# Devlog: Session 01 - The Single-File Decision
**Date:** 2026-06-03 23:15
**Duration:** 4.5 hours

I spent the first few hours debating whether to go with a full React/Vite setup or a single-file "Self-Contained Engine". Decided on the latter because the target audience might need to run this offline or in restricted environments where they can't spin up a dev server. 

**Challenges:**
- Scaffolding the entire UI in one file without it becoming unmaintainable. 
- Implementing a CSS theme system using variables to allow easy redesigns.
- Writing the `TranslationCache` module using IndexedDB. First time using IDB without a wrapper like Dexie, and the transaction management is trickier than I remembered.

**Status:** Core UI and Text Translation working with Google Translate fallback chain.
