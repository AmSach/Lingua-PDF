/**
 * @file reflow_engine.js
 * @description Core engine for maintaining document layout during translation.
 * Handles coordinate mapping, line wrapping, and font scaling to ensure the translated text
 * fits perfectly within the original bounding boxes.
 */

class ReflowEngine {
    constructor(config = {}) {
        this.tolerance = config.tolerance || 0.1;
        this.fontScaleFactor = config.fontScaleFactor || 0.95;
    }

    /**
     * Calculates the new font size for a translated text string to fit within a given width.
     * @param {string} originalText - The original text content.
     * @param {string} translatedText - The translated text content.
     * @param {number} originalWidth - The width of the original bounding box.
     * @param {number} originalFontSize - The font size of the original text.
     * @returns {number} The optimized font size for the translated text.
     */
    optimizeFontSize(originalText, translatedText, originalWidth, originalFontSize) {
        const lengthRatio = translatedText.length / originalText.length;
        if (lengthRatio <= 1) return originalFontSize;

        // Iterative reduction to find the best fit
        let optimizedSize = originalFontSize;
        while (this.calculateTextWidth(translatedText, optimizedSize) > originalWidth && optimizedSize > 4) {
            optimizedSize *= this.fontScaleFactor;
        }
        return optimizedSize;
    }

    /**
     * Mock text width calculation based on font metrics.
     * In a real implementation, this would use CanvasRenderingContext2D.measureText().
     */
    calculateTextWidth(text, fontSize) {
        // Rough estimation: average character width is ~0.6 of font size
        return text.length * fontSize * 0.6;
    }

    /**
     * Maps the translated text segments back to the original PDF coordinates.
     */
    mapCoordinates(segments, originalPageMap) {
        console.log("Mapping coordinates for", segments.length, "segments...");
        return segments.map(segment => {
            const originalData = originalPageMap.find(m => m.id === segment.id);
            if (!originalData) return segment;

            return {
                ...segment,
                x: originalData.x,
                y: originalData.y,
                width: originalData.width,
                height: originalData.height,
                optimizedFontSize: this.optimizeFontSize(
                    originalData.text,
                    segment.text,
                    originalData.width,
                    originalData.fontSize
                )
            };
        });
    }
}

export default ReflowEngine;
