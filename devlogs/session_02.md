# Devlog: Session 02 - The PDF Extraction Nightmare
**Date:** 2026-06-04 01:45
**Duration:** 6 hours

PDF.js is powerful but its `getTextContent` returns individual character glyphs with coordinates. Reconstructing them into logical lines and then paragraphs is a massive logic puzzle. 

**Hurdles:**
- **Y-coordinate jitter**: Text items on the "same line" often have Y coordinates off by 0.5–1.5 pixels. Built a ±3px tolerance bucket system to group them.
- **Paragraph Logic**: How do you know if a line is a new paragraph or a continuation? Implemented a "Gap Ratio" system comparing the vertical distance between lines to the median font size.
- **Bold/Italic Detection**: PDF font names are strings like `ABCDE+Helvetica-Bold`. Wrote regex to extract styles per line.

**Status:** Can now extract and regroup paragraphs from 100+ page PDFs.
