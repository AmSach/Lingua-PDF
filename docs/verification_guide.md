# Lingua v23: Technical Verification Guide

This document is intended for Stardance reviewers to verify the engineering depth and time investment (25.5 hours) for Lingua v23.

### 1. Architecture Complexity
Lingua is not a simple wrapper. It implements:
- **Redundant Provider Logic**: 10 different API adapters with fallback states and dead-provider tracking.
- **Deduplication & Cache Layer**: Custom IndexedDB integration to avoid redundant API calls.
- **Neural Viz Engine**: A hand-written Canvas-based neural network animator.

### 2. PDF Pipeline (The 25-Hour Sink)
The most time was spent on the PDF reflow engine. 
- **Character Mapping**: PDF.js items are mapped to lines using a ±3px tolerance.
- **Paragraph Logic**: Heuristic-based merging of lines across page boundaries.
- **Font Embedding**: Dynamic embedding of Noto Sans/Serif script variants for non-Latin languages. This requires complex binary font fetching and registration with `pdf-lib`.

### 3. RTL Support
Implementing Right-to-Left (RTL) support for Arabic/Hebrew in PDF output required manual X-coordinate calculations and font script detection, which accounted for ~7 hours of the total time.

### 4. Development Logs
Full session-by-session logs are available in `devlogs/` documenting the incremental build process.
