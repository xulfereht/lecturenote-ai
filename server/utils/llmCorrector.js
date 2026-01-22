/**
 * LLM-based Text Corrector for Lecture Transcripts
 *
 * Provides intelligent text correction using AI:
 * - Typo correction
 * - Mishearing correction (speech-to-text errors)
 * - Technical terminology normalization
 * - Preserves timestamps and structure
 *
 * @module llmCorrector
 */

import { Type } from "@google/genai";

/**
 * Correction configuration
 * @typedef {Object} CorrectionConfig
 * @property {boolean} [enabled=true] - Whether LLM correction is enabled
 * @property {number} [batchSize=3] - Number of segments to process in parallel
 * @property {number} [maxSegmentLength=5000] - Maximum segment length for processing
 * @property {boolean} [preserveTimestamps=true] - Preserve timestamp patterns
 * @property {boolean} [correctTechnicalTerms=true] - Correct technical terminology
 * @property {boolean} [correctMishearings=true] - Correct speech-to-text errors
 * @property {string} [language='ko'] - Primary language of content
 */

/**
 * Correction result for a single segment
 * @typedef {Object} CorrectionResult
 * @property {string} originalText - Original input text
 * @property {string} correctedText - Corrected output text
 * @property {Array<Object>} corrections - List of corrections made
 * @property {boolean} success - Whether correction succeeded
 * @property {string} [error] - Error message if failed
 */

/**
 * Default correction configuration
 * @type {CorrectionConfig}
 */
const DEFAULT_CONFIG = {
    enabled: true,
    batchSize: 3,
    maxSegmentLength: 5000,
    preserveTimestamps: true,
    correctTechnicalTerms: true,
    correctMishearings: true,
    language: 'ko'
};

/**
 * System prompt for LLM correction
 * @type {string}
 */
const CORRECTION_SYSTEM_PROMPT = `당신은 강의 녹취록 교정 전문가입니다.
음성 인식으로 생성된 텍스트의 오류를 교정하는 것이 임무입니다.

핵심 규칙:
1. 타임스탬프([HH:MM:SS] 또는 [MM:SS] 형식)는 절대 수정하지 마세요
2. 문맥을 고려하여 오청취된 단어를 교정하세요
3. 전문용어는 올바른 표기로 통일하세요
4. 원문의 의미를 변경하지 마세요
5. 불필요한 반복이나 말더듬은 정리하세요
6. 문장 구조는 가능한 유지하세요`;

/**
 * Schema for correction response
 * @type {Object}
 */
const CORRECTION_SCHEMA = {
    type: Type.OBJECT,
    properties: {
        correctedText: {
            type: Type.STRING,
            description: "교정된 텍스트 (타임스탬프 보존)"
        },
        corrections: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    original: { type: Type.STRING, description: "원본 텍스트" },
                    corrected: { type: Type.STRING, description: "교정된 텍스트" },
                    reason: { type: Type.STRING, description: "교정 이유 (typo/mishearing/terminology)" }
                },
                required: ["original", "corrected", "reason"]
            },
            description: "교정 내역 목록"
        },
        confidence: {
            type: Type.NUMBER,
            description: "교정 신뢰도 (0.0-1.0)"
        }
    },
    required: ["correctedText", "corrections"]
};

/**
 * Build correction prompt for a text segment
 * @param {string} text - Text to correct
 * @param {CorrectionConfig} config - Correction configuration
 * @returns {string} Formatted prompt
 */
function buildCorrectionPrompt(text, config) {
    const instructions = [];

    if (config.preserveTimestamps) {
        instructions.push("- 타임스탬프([HH:MM:SS] 또는 [MM:SS])를 절대 수정하지 마세요");
    }

    if (config.correctTechnicalTerms) {
        instructions.push("- IT/AI 관련 전문용어를 올바른 표기로 통일하세요 (예: GPT, LLM, AI, API 등)");
    }

    if (config.correctMishearings) {
        instructions.push("- 음성 인식 오류로 인한 오청취를 문맥에 맞게 교정하세요");
    }

    return `다음 강의 녹취록 텍스트를 교정하세요.

## 교정 규칙
${instructions.join('\n')}
- 원문의 의미와 문체를 최대한 유지하세요
- 확실하지 않은 교정은 하지 마세요

## 교정할 텍스트:
${text}

## 응답 형식
JSON 형식으로 교정 결과를 반환하세요.`;
}

/**
 * Correct a single text segment using LLM
 * @param {string} segment - Text segment to correct
 * @param {Object} aiProvider - AI provider instance
 * @param {CorrectionConfig} config - Correction configuration
 * @returns {Promise<CorrectionResult>} Correction result
 */
export async function correctWithLLM(segment, aiProvider, config = {}) {
    const cfg = { ...DEFAULT_CONFIG, ...config };

    if (!cfg.enabled) {
        return {
            originalText: segment,
            correctedText: segment,
            corrections: [],
            success: true,
            skipped: true
        };
    }

    if (!segment || segment.trim().length === 0) {
        return {
            originalText: segment,
            correctedText: segment,
            corrections: [],
            success: true
        };
    }

    // Truncate if too long
    const textToProcess = segment.length > cfg.maxSegmentLength
        ? segment.substring(0, cfg.maxSegmentLength)
        : segment;

    try {
        const prompt = buildCorrectionPrompt(textToProcess, cfg);

        const response = await aiProvider.generateContent({
            prompt,
            schema: CORRECTION_SCHEMA,
            systemPrompt: CORRECTION_SYSTEM_PROMPT,
            temperature: 0.3 // Lower temperature for more consistent corrections
        });

        if (!response.success) {
            console.warn('LLM correction failed:', response.error);
            return {
                originalText: segment,
                correctedText: segment,
                corrections: [],
                success: false,
                error: response.error
            };
        }

        const result = response.data;

        // If segment was truncated, append the rest
        let finalText = result.correctedText;
        if (segment.length > cfg.maxSegmentLength) {
            finalText += segment.substring(cfg.maxSegmentLength);
        }

        return {
            originalText: segment,
            correctedText: finalText,
            corrections: result.corrections || [],
            confidence: result.confidence,
            success: true
        };

    } catch (error) {
        console.error('LLM correction error:', error.message);
        return {
            originalText: segment,
            correctedText: segment,
            corrections: [],
            success: false,
            error: error.message
        };
    }
}

/**
 * Correct multiple segments in batch with parallel processing
 * @param {Array<Object>} segments - Array of segment objects with text property
 * @param {Object} aiProvider - AI provider instance
 * @param {CorrectionConfig} config - Correction configuration
 * @returns {Promise<Array<CorrectionResult>>} Array of correction results
 */
export async function correctSegmentsBatch(segments, aiProvider, config = {}) {
    const cfg = { ...DEFAULT_CONFIG, ...config };

    if (!cfg.enabled || !segments || segments.length === 0) {
        return segments.map(seg => ({
            originalText: seg.text || seg,
            correctedText: seg.text || seg,
            corrections: [],
            success: true,
            skipped: !cfg.enabled
        }));
    }

    const results = [];
    const batchSize = cfg.batchSize;

    // Process in batches
    for (let i = 0; i < segments.length; i += batchSize) {
        const batch = segments.slice(i, i + batchSize);
        const batchNum = Math.floor(i / batchSize) + 1;
        const totalBatches = Math.ceil(segments.length / batchSize);

        console.log(`[LLM Corrector] Processing batch ${batchNum}/${totalBatches}`);

        // Process batch in parallel
        const batchPromises = batch.map(seg => {
            const text = typeof seg === 'string' ? seg : seg.text;
            return correctWithLLM(text, aiProvider, cfg);
        });

        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);

        // Rate limiting delay between batches
        if (i + batchSize < segments.length) {
            await sleep(500);
        }
    }

    return results;
}

/**
 * Apply corrections to segments and return updated segment objects
 * @param {Array<Object>} segments - Original segments with text property
 * @param {Array<CorrectionResult>} corrections - Correction results
 * @returns {Array<Object>} Updated segments with corrected text
 */
export function applyCorrections(segments, corrections) {
    if (!corrections || corrections.length !== segments.length) {
        console.warn('Correction count mismatch, returning original segments');
        return segments;
    }

    return segments.map((segment, index) => {
        const correction = corrections[index];

        if (!correction || !correction.success) {
            return segment;
        }

        // Create new segment with corrected text
        if (typeof segment === 'string') {
            return correction.correctedText;
        }

        return {
            ...segment,
            text: correction.correctedText,
            correctionApplied: correction.corrections.length > 0,
            correctionCount: correction.corrections.length
        };
    });
}

/**
 * Get correction statistics from batch results
 * @param {Array<CorrectionResult>} results - Correction results
 * @returns {Object} Statistics summary
 */
export function getCorrectionStats(results) {
    const stats = {
        totalSegments: results.length,
        successfulCorrections: 0,
        failedCorrections: 0,
        skippedCorrections: 0,
        totalCorrectionsApplied: 0,
        correctionsByType: {
            typo: 0,
            mishearing: 0,
            terminology: 0,
            other: 0
        },
        averageConfidence: 0
    };

    let confidenceSum = 0;
    let confidenceCount = 0;

    for (const result of results) {
        if (result.skipped) {
            stats.skippedCorrections++;
        } else if (result.success) {
            stats.successfulCorrections++;
            stats.totalCorrectionsApplied += result.corrections.length;

            // Count by type
            for (const correction of result.corrections) {
                const type = correction.reason?.toLowerCase() || 'other';
                if (type.includes('typo')) {
                    stats.correctionsByType.typo++;
                } else if (type.includes('mishearing') || type.includes('오청취')) {
                    stats.correctionsByType.mishearing++;
                } else if (type.includes('terminology') || type.includes('용어')) {
                    stats.correctionsByType.terminology++;
                } else {
                    stats.correctionsByType.other++;
                }
            }

            // Track confidence
            if (result.confidence !== undefined) {
                confidenceSum += result.confidence;
                confidenceCount++;
            }
        } else {
            stats.failedCorrections++;
        }
    }

    if (confidenceCount > 0) {
        stats.averageConfidence = confidenceSum / confidenceCount;
    }

    return stats;
}

/**
 * Quick correction for a single text string
 * @param {string} text - Text to correct
 * @param {Object} aiProvider - AI provider instance
 * @param {CorrectionConfig} [config] - Optional configuration
 * @returns {Promise<string>} Corrected text
 */
export async function quickCorrect(text, aiProvider, config = {}) {
    const result = await correctWithLLM(text, aiProvider, config);
    return result.correctedText;
}

/**
 * Check if text needs correction (heuristic check)
 * @param {string} text - Text to check
 * @returns {boolean} Whether text likely needs correction
 */
export function needsCorrection(text) {
    if (!text || text.length < 50) {
        return false;
    }

    // Heuristic checks for common transcription issues
    const indicators = [
        // Common Korean mishearing patterns
        /[ㄱ-ㅎ]{2,}/, // Consecutive consonants (likely errors)
        /[ㅏ-ㅣ]{3,}/, // Consecutive vowels (likely errors)

        // Repeated words (stuttering in transcription)
        /(\b\w+\b)\s+\1\b/,

        // Incomplete sentences
        /[가-힣]+\s+[가-힣]{1,2}\s+[가-힣]+\s*$/,

        // Mixed case issues in technical terms
        /\b(gpt|llm|ai|api)\b/i,
    ];

    return indicators.some(pattern => pattern.test(text));
}

/**
 * Sleep helper function
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Export configuration and schema for external use
export {
    DEFAULT_CONFIG as CORRECTOR_DEFAULT_CONFIG,
    CORRECTION_SCHEMA,
    CORRECTION_SYSTEM_PROMPT
};
