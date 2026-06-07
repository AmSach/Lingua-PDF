/**
 * @file font_mapper.js
 * @description Maps PDF system fonts to browser-safe web fonts or embedded CFF/Type1 fonts.
 * Ensures visual consistency across different language families (e.g., Cyrillic, Han, Arabic).
 */

const FONT_MAP = {
    'Arial': 'sans-serif',
    'Times-Roman': 'serif',
    'Courier': 'monospace',
    'Helvetica': 'sans-serif',
    'Symbol': 'serif',
    'ZapfDingbats': 'serif'
};

class FontMapper {
    /**
     * Resolves the best available web font for a given PDF font name and language code.
     */
    resolveFont(pdfFontName, langCode) {
        let baseFont = FONT_MAP[pdfFontName] || 'sans-serif';
        
        // Language specific overrides for better character support
        switch (langCode) {
            case 'ja': return `'Noto Sans JP', ${baseFont}`;
            case 'zh': return `'Noto Sans SC', ${baseFont}`;
            case 'ar': return `'Noto Sans Arabic', ${baseFont}`;
            case 'ru': return `'Noto Sans', ${baseFont}`;
            default: return baseFont;
        }
    }

    /**
     * Generates @font-face rules for custom embedded fonts.
     */
    generateFontFace(fontData) {
        return `
            @font-face {
                font-family: '${fontData.name}';
                src: url(data:font/opentype;base64,${fontData.base64});
                font-weight: normal;
                font-style: normal;
            }
        `;
    }
}

export default FontMapper;
