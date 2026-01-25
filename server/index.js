import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from "@google/genai";
import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';
import { marked } from 'marked';
import { createRequire } from 'module';

// Import preprocessing modules
import { normalizeText } from './utils/textNormalizer.js';
import { createAIProvider } from './ai/aiProvider.js';
import { correctSegmentsBatch, applyCorrections, getCorrectionStats } from './utils/llmCorrector.js';
// mermaidValidator removed - now using visualStructure

const require = createRequire(import.meta.url);
const { initDB, run, get, all } = require('./database.cjs');

// Load environment variables
const envLocalPath = path.resolve(process.cwd(), '.env.local');
const envPath = path.resolve(process.cwd(), '.env');

if (fs.existsSync(envLocalPath)) {
    dotenv.config({ path: envLocalPath });
} else {
    dotenv.config({ path: envPath });
}

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Init DB
initDB().then(() => console.log('SQLite DB initialized')).catch(err => console.error(err));

// ==================== SSE SETUP ====================
const clients = new Map(); // lectureId -> Set<Response>

function sendEvent(lectureId, eventName, data) {
    const lectureClients = clients.get(lectureId);
    if (lectureClients) {
        const message = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
        lectureClients.forEach(client => {
            try {
                client.write(message);
            } catch (e) {
                console.error("Failed to send SSE", e);
            }
        });
    }
}

// SSE Endpoint
app.get('/api/lectures/:id/events', (req, res) => {
    const lectureId = req.params.id;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    if (!clients.has(lectureId)) {
        clients.set(lectureId, new Set());
    }
    clients.get(lectureId).add(res);

    // Initial connection message
    res.write(`event: connected\ndata: "Connected to lecture ${lectureId}"\n\n`);

    req.on('close', () => {
        const lectureClients = clients.get(lectureId);
        if (lectureClients) {
            lectureClients.delete(res);
            if (lectureClients.size === 0) {
                clients.delete(lectureId);
            }
        }
    });
});

// ==================== PREPROCESSING ====================

/**
 * Preprocess transcript text before analysis
 * Applies normalization and optional LLM correction
 *
 * @param {string} transcript - Raw transcript text
 * @param {Object} options - Preprocessing options
 * @param {boolean} options.llmCorrectionEnabled - Whether to use LLM for correction
 * @param {string} options.apiKey - API key for LLM correction
 * @param {string} options.model - Model to use for LLM correction
 * @returns {Promise<Object>} Preprocessed result with text and stats
 */
async function preprocessTranscript(transcript, options = {}) {
    const startTime = Date.now();
    const stats = {
        originalLength: transcript.length,
        normalizedLength: 0,
        correctedLength: 0,
        normalizationChanges: {},
        correctionStats: null,
        correctionDetails: null,
        processingTimeMs: 0
    };

    // Step 1: Basic text normalization (always applied)
    console.log('[Preprocess] Starting text normalization...');
    const normResult = normalizeText(transcript, {
        preserveTimestamps: true,
        normalizeWhitespace: true,
        removeControlChars: true,
        removeBOM: true,
        trimLines: true,
        collapseBlankLines: true,
        maxBlankLines: 2
    });

    let processedText = normResult.text;
    stats.normalizedLength = processedText.length;
    stats.normalizationChanges = normResult.changeLog;

    console.log(`[Preprocess] Normalization complete: ${stats.originalLength} -> ${stats.normalizedLength} chars`);

    // Step 2: LLM-based correction (optional)
    if (options.llmCorrectionEnabled && options.apiKey) {
        console.log('[Preprocess] Starting LLM correction...');

        try {
            // Create AI provider for correction
            const aiProvider = createAIProvider({
                provider: 'google',
                model: options.model || 'gemini-2.5-flash',
                apiKey: options.apiKey,
                temperature: 0.3
            });

            // Split text into manageable segments for correction
            const segmentSize = 2000;
            const segments = [];
            let remaining = processedText;

            while (remaining.length > 0) {
                if (remaining.length <= segmentSize) {
                    segments.push({ text: remaining });
                    break;
                }

                // Find a good break point (paragraph or sentence)
                let breakPoint = remaining.lastIndexOf('\n\n', segmentSize);
                if (breakPoint < segmentSize / 2) {
                    breakPoint = remaining.lastIndexOf('\n', segmentSize);
                }
                if (breakPoint < segmentSize / 2) {
                    breakPoint = remaining.lastIndexOf('. ', segmentSize);
                }
                if (breakPoint < 0 || breakPoint > segmentSize) {
                    breakPoint = segmentSize;
                }

                segments.push({ text: remaining.substring(0, breakPoint) });
                remaining = remaining.substring(breakPoint).trim();
            }

            console.log(`[Preprocess] Correcting ${segments.length} segments...`);

            // Apply LLM correction to segments
            const corrections = await correctSegmentsBatch(segments, aiProvider, {
                enabled: true,
                preserveTimestamps: true,
                correctTechnicalTerms: true,
                correctMishearings: true,
                semanticFactCheck: true
            });

            // Apply corrections and get stats
            const correctedSegments = applyCorrections(segments, corrections);
            stats.correctionStats = getCorrectionStats(corrections);
            stats.correctionDetails = corrections;

            // Rejoin segments
            processedText = correctedSegments.map(s => s.text || s).join('\n\n');
            stats.correctedLength = processedText.length;

            console.log(`[Preprocess] LLM correction complete: ${stats.correctionStats.totalCorrectionsApplied} corrections applied`);

        } catch (error) {
            console.error('[Preprocess] LLM correction failed:', error.message);
            // Continue with normalized text if correction fails
            stats.correctedLength = stats.normalizedLength;
        }
    } else {
        stats.correctedLength = stats.normalizedLength;
    }

    stats.processingTimeMs = Date.now() - startTime;
    console.log(`[Preprocess] Complete in ${stats.processingTimeMs}ms`);

    return {
        text: processedText,
        stats
    };
}

// ==================== SCHEMAS ====================
const INITIAL_SCAN_SCHEMA = {
    type: Type.OBJECT,
    properties: {
        title: { type: Type.STRING, description: "강의 전체 제목" },
        overview: { type: Type.STRING, description: "강의 전체 요약 (3-5문장)" },
        totalDuration: { type: Type.NUMBER, description: "전체 강의 시간 (분)" },
        chapters: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    id: { type: Type.STRING, description: "고유 ID (ch1, ch2...)" },
                    title: { type: Type.STRING, description: "챕터 제목" },
                    startTime: { type: Type.STRING, description: "시작 시간 (MM:SS)" },
                    endTime: { type: Type.STRING, description: "종료 시간 (MM:SS)" },
                    duration: { type: Type.NUMBER, description: "길이 (분)" },
                    summary: { type: Type.STRING, description: "내용 요약" },
                    keyTopics: { type: Type.ARRAY, items: { type: Type.STRING } },
                },
                required: ["id", "title", "startTime", "endTime"]
            },
        },
    },
    required: ["title", "overview", "chapters"],
};

const CHAPTER_DEEP_DIVE_SCHEMA = {
    type: Type.OBJECT,
    properties: {
        keyMessage: { type: Type.STRING, description: "이 챕터의 핵심 메시지 (1-2문장, 강사의 의도를 담아)" },
        narrative: {
            type: Type.STRING,
            description: `🚨 핵심 필드 - 반드시 아래 조건을 모두 충족해야 합니다:

**📏 분량 요구사항 (필수)**
- 최소 1500자 이상, 권장 2000-3000자
- 150자 미만의 짧은 요약은 실패로 처리됨

**📋 구조 요구사항 (필수)**
- 반드시 2~4개의 ## 소제목으로 섹션 구분
- 각 ## 섹션에 최소 1개의 인용문 + 타임스탬프 포함
- ### 소제목 사용 금지 (## 만 사용)

**✍️ 인용 형식 (필수)**
> "강사의 실제 발언" [MM:SS]

인용 후 반드시 해석을 덧붙인다.

**❌ 금지 사항**
- 요약 형태의 짧은 글 (예: "이 챕터에서는 X를 다룬다")
- 인용 없는 섹션
- "~합니다/~입니다" 체 (평서형 "~한다/~이다" 사용)

**✅ 예시 구조:**
## 첫 번째 주제
강사는 [주제]를 설명하며 핵심을 짚었다.
> "실제 발언 인용" [00:05:30]
이 발언은 [해석]...

## 두 번째 주제
이어서 [다음 주제]로 논의가 전환되었다...`
        },
        quotesWithTimeline: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    timestamp: { type: Type.STRING },
                    quote: { type: Type.STRING },
                    context: { type: Type.STRING }
                },
                required: ["timestamp", "quote", "context"]
            },
            description: "강사의 페르소나가 느껴지는 핵심 인용구 (6-10개)"
        },
        keyTerms: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    term: { type: Type.STRING },
                    definition: { type: Type.STRING },
                    context: { type: Type.STRING, description: "이 강의에서 해당 용어가 사용된 구체적 맥락" },
                    example: { type: Type.STRING }
                },
                required: ["term", "definition", "context"]
            },
            description: "핵심 용어 및 개념 (Contextual Definition 포함)"
        },
        keyTakeaways: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "Narrative에서 도출된 명제 형태의 핵심 결론 (5-8개)"
        },
        actionableItems: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "청중이 당장 실천해야 할 구체적 행동 지침 (명령형)"
        },
        visualStructure: {
            type: Type.OBJECT,
            properties: {
                type: {
                    type: Type.STRING,
                    description: "시각화 유형: 'process' (단계별 절차), 'comparison' (비교), 'hierarchy' (계층/분류), 'timeline' (시간순 이벤트)"
                },
                title: { type: Type.STRING, description: "다이어그램 제목" },
                items: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            label: { type: Type.STRING, description: "항목 제목/이름" },
                            description: { type: Type.STRING, description: "설명 (1-2문장)" },
                            subItems: {
                                type: Type.ARRAY,
                                items: { type: Type.STRING },
                                description: "하위 항목들 (hierarchy 타입에서 사용)"
                            }
                        },
                        required: ["label"]
                    },
                    description: "시각화할 항목들 (3-6개 권장)"
                }
            },
            required: ["type", "title", "items"],
            description: `챕터 내용을 시각적으로 요약하는 구조화된 데이터.

**타입 선택 가이드:**
- process: 설치 과정, 작업 순서, 단계별 절차가 있을 때
- comparison: A vs B, 장단점, 옵션 비교가 있을 때
- hierarchy: 카테고리 분류, 구성 요소, 개념 체계가 있을 때
- timeline: 시간순 이벤트, 발전 과정, 역사적 흐름이 있을 때

**예시 (process):**
{ "type": "process", "title": "서버 설정 과정", "items": [
  { "label": "1. 환경 준비", "description": "Node.js 설치 확인" },
  { "label": "2. 의존성 설치", "description": "npm install 실행" },
  { "label": "3. 서버 실행", "description": "npm start로 구동" }
]}`
        }
    },
    required: ["narrative", "quotesWithTimeline", "keyTakeaways", "keyTerms", "actionableItems", "keyMessage"]
};

// ==================== UTILS ====================
function generateId() {
    return 'lec_' + Math.random().toString(36).substr(2, 9);
}

function parseTime(timeStr) {
    if (!timeStr) return 0;
    const parts = timeStr.split(':').map(Number);
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return 0;
}

// VTT 텍스트에서 특정 시간대 추출 (Robust Version)
function extractSlice(text, startStr, endStr) {
    const startSec = parseTime(startStr);
    const endSec = parseTime(endStr);
    
    // 0. 전처리: 라인별 타임스탬프 파싱
    const lines = text.split('\n');
    const timePattern = /(?:\[)?(\d{1,2}:\d{2}(?::\d{2})?)(?:\])?/;
    const timestamps = []; // { time: number, index: number }

    for (let i = 0; i < lines.length; i++) {
        const match = lines[i].match(timePattern);
        if (match) {
            timestamps.push({
                time: parseTime(match[1]),
                index: i
            });
        }
    }

    if (timestamps.length === 0) {
        // 타임스탬프가 하나도 없으면 전체 반환 (혹은 상위 로직에서 처리)
        return text;
    }

    // 1. 시작 라인 찾기
    // startSec보다 작거나 같은 것 중 가장 뒤에 있는 것, 없으면 첫 번째 타임스탬프
    let startLineIndex = 0;
    const startPoint = timestamps.filter(t => t.time <= startSec).pop();
    
    if (startPoint) {
        startLineIndex = Math.max(0, startPoint.index - 2); // 약간의 문맥(2줄) 포함
    } else {
        // startSec보다 이른 타임스탬프가 없다면?
        // 만약 startSec가 0이면 처음부터.
        // startSec가 큰데 이른게 없다면 -> 아마 텍스트 앞부분에 타임스탬프가 없는 경우일 듯.
        // 가장 첫 타임스탬프가 startSec보다 크더라도, 그 전 내용일 수 있으니 일단 0부터 시작?
        // 아니면 startSec와 가장 가까운 타임스탬프 찾기
        const firstTs = timestamps[0];
        if (firstTs && firstTs.time > startSec) {
             // 요청시간(예: 0분) < 첫 타임스탬프(예: 5분) -> 0분부터 5분까지 내용일 수 있음
             startLineIndex = 0;
        } else {
            // 그 외의 경우 (타임스탬프 구조가 이상함)
            startLineIndex = 0;
        }
    }

    // 2. 종료 라인 찾기
    // endSec보다 크거나 같은 것 중 가장 앞에 있는 것
    let endLineIndex = lines.length - 1;
    if (endSec > 0) {
        const endPoint = timestamps.find(t => t.time >= endSec);
        if (endPoint) {
            endLineIndex = endPoint.index;
        } else {
            // endSec보다 큰 타임스탬프가 없다 -> 끝까지
            endLineIndex = lines.length - 1;
        }
    }

    // 3. 추출
    // 유효성 검사
    if (startLineIndex > endLineIndex) {
        // 뭔가 꼬임 -> 그냥 start부터 일정량(예: 50줄) 혹은 끝까지
        return lines.slice(startLineIndex, startLineIndex + 100).join('\n');
    }

    return lines.slice(startLineIndex, endLineIndex + 1).join('\n');
}

// 시간(초)을 MM:SS 또는 HH:MM:SS 형식으로 변환
function formatTime(totalSeconds) {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);

    if (hours > 0) {
        return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

// 텍스트를 타임스탬프 기반으로 세그먼트로 분할 (30분 단위)

// 문자 수 기준 세그먼트 분할 (타임스탬프 없는 텍스트용)
function splitByCharCount(transcript, charsPerSegment = 10000) {
    const paragraphs = transcript.split(/\n\s*\n/); // 빈 줄 기준 문단 분리
    const segments = [];
    let currentText = '';
    let segmentIndex = 0;

    for (const para of paragraphs) {
        const trimmedPara = para.trim();
        if (!trimmedPara) continue;

        // 현재 세그먼트에 추가했을 때 제한 초과하면 새 세그먼트 시작
        if (currentText.length > 0 && (currentText.length + trimmedPara.length + 2) > charsPerSegment) {
            segments.push({
                segmentIndex: segmentIndex++,
                startTime: "",
                endTime: "",
                startSeconds: 0,
                endSeconds: 0,
                text: currentText.trim()
            });
            currentText = '';
        }

        currentText += (currentText ? '\n\n' : '') + trimmedPara;
    }

    // 마지막 세그먼트 추가
    if (currentText.trim()) {
        segments.push({
            segmentIndex: segmentIndex,
            startTime: "",
            endTime: "",
            startSeconds: 0,
            endSeconds: 0,
            text: currentText.trim()
        });
    }

    // 세그먼트가 없으면 전체를 하나로
    if (segments.length === 0) {
        return [{
            segmentIndex: 0,
            startTime: "",
            endTime: "",
            startSeconds: 0,
            endSeconds: 0,
            text: transcript
        }];
    }

    return segments;
}

function splitIntoSegments(transcript, segmentMinutes = 30, charsPerSegment = 10000) {
    const segmentSeconds = segmentMinutes * 60;
    const lines = transcript.split('\n');
    const timePattern = /(?:\[)?(\d{1,2}:\d{2}(?::\d{2})?)(?:\])?/;

    // 모든 타임스탬프와 위치 추출
    let timestamps = [];
    let lastTime = 0;

    for (let i = 0; i < lines.length; i++) {
        const match = lines[i].match(timePattern);
        if (match) {
            const timeSec = parseTime(match[1]);
            timestamps.push({ lineIndex: i, time: timeSec, timeStr: match[1] });
            lastTime = Math.max(lastTime, timeSec);
        }
    }

    if (timestamps.length === 0) {
        // 타임스탬프가 없으면 문자 수 기준으로 분할
        return splitByCharCount(transcript, charsPerSegment);
    }

    // 세그먼트 분할 (시간 기준)
    const segments = [];
    const totalDuration = lastTime;
    const numSegments = Math.ceil(totalDuration / segmentSeconds);

    for (let seg = 0; seg < numSegments; seg++) {
        const segStartSec = seg * segmentSeconds;
        const segEndSec = Math.min((seg + 1) * segmentSeconds, totalDuration + 60); // 약간의 버퍼

        // 해당 시간대의 라인 찾기
        let startLineIdx = 0;
        let endLineIdx = lines.length - 1;

        for (const ts of timestamps) {
            if (ts.time >= segStartSec && startLineIdx === 0) {
                startLineIdx = Math.max(0, ts.lineIndex - 2); // 약간 앞에서 시작
            }
            if (ts.time > segEndSec) {
                endLineIdx = ts.lineIndex;
                break;
            }
        }

        const segmentText = lines.slice(startLineIdx, endLineIdx + 1).join('\n');

        if (segmentText.trim().length > 0) {
            segments.push({
                segmentIndex: seg,
                startTime: formatTime(segStartSec),
                endTime: formatTime(segEndSec),
                startSeconds: segStartSec,
                endSeconds: segEndSec,
                text: segmentText
            });
        }
    }

    return segments;
}

// 세그먼트별 챕터 추출 스키마
const SEGMENT_CHAPTER_SCHEMA = {
    type: Type.OBJECT,
    properties: {
        chapters: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    title: { type: Type.STRING, description: "챕터 제목 (구체적으로)" },
                    startTime: { type: Type.STRING, description: "시작 시간 (MM:SS 또는 HH:MM:SS)" },
                    endTime: { type: Type.STRING, description: "종료 시간 (MM:SS 또는 HH:MM:SS)" },
                    summary: { type: Type.STRING, description: "챕터 요약 (2-3문장)" },
                    keyTopics: { type: Type.ARRAY, items: { type: Type.STRING }, description: "핵심 주제 3-5개" }
                },
                required: ["title", "startTime", "endTime", "summary"]
            }
        }
    },
    required: ["chapters"]
};

// ==================== ROUTES ====================

// 1. 강의 생성 및 자동 분석 시작 (세그먼트 기반 병렬 처리)
app.post('/api/lectures', async (req, res) => {
    try {
        const { transcript, settings } = req.body;
        if (!transcript) return res.status(400).json({ error: "Transcript required" });

        const lectureId = generateId();
        const apiKey = settings?.apiKey || process.env.GEMINI_API_KEY || process.env.API_KEY;

        if (!apiKey) {
            return res.status(400).json({ 
                error: "API Key is required. Please set it in the application settings (top-left gear icon) or in the .env file." 
            });
        }

        const ai = new GoogleGenAI({ apiKey });

        console.log(`[${lectureId}] Starting lecture processing...`);
        console.log(`[${lectureId}] Settings received:`, JSON.stringify(settings, null, 2));

        // ========== Step 0: Preprocessing ==========
        const preprocessOptions = {
            llmCorrectionEnabled: settings?.llmCorrectionEnabled ?? false, // Use nullish coalescing
            apiKey: apiKey,
            model: settings?.model || 'gemini-2.5-flash'
        };

        console.log(`[${lectureId}] Preprocessing transcript (LLM correction: ${preprocessOptions.llmCorrectionEnabled})...`);
        const preprocessResult = await preprocessTranscript(transcript, preprocessOptions);
        const processedTranscript = preprocessResult.text;

        console.log(`[${lectureId}] Preprocessing stats:`, JSON.stringify(preprocessResult.stats, null, 2));
        
        // stats에 correctionDetails가 있는지 확인
        if (preprocessOptions.llmCorrectionEnabled && !preprocessResult.stats.correctionDetails) {
            console.warn(`[${lectureId}] WARNING: LLM correction was enabled but no details returned.`);
        }

        console.log(`[${lectureId}] Starting segmented analysis...`);

        // ========== Step 1: 세그먼트 분할 (로컬) ==========
        const segments = splitIntoSegments(processedTranscript, 30); // 30분 단위
        console.log(`[${lectureId}] Split into ${segments.length} segments`);

        // ========== Step 2: 세그먼트별 챕터 추출 (배치 처리) ==========
        const BATCH_SIZE = 3; // 한 번에 3개씩 처리
        const segmentResults = [];

        // 세그먼트 처리 함수
        const processSegment = async (segment, idx) => {
            const hasTimestamp = segment.startTime && segment.endTime;
            const segmentHeader = hasTimestamp
                ? `이 세그먼트(${segment.startTime} ~ ${segment.endTime})에서 챕터를 추출하세요.`
                : `세그먼트 ${idx + 1}/${segments.length}에서 챕터를 추출하세요.`;

            const timeRule = hasTimestamp
                ? `- 타임스탬프는 세그먼트 내 실제 시간 기준으로 정확히`
                : `- 타임스탬프가 없으므로 startTime/endTime은 빈 문자열("")로 반환`;

            const prompt = `
${segmentHeader}

## 규칙
- 챕터당 10-15분 분량 (8-20분 유동 가능)
- 주제 전환 지점에서 분할
- 구체적인 제목 사용 (예: "REF GPT 설정 방법")
${timeRule}

## 세그먼트 텍스트:
${segment.text}
            `;

            try {
                const resp = await ai.models.generateContent({
                    model: "gemini-2.5-flash",
                    contents: [{ role: "user", parts: [{ text: prompt }] }],
                    config: {
                        responseMimeType: "application/json",
                        responseSchema: SEGMENT_CHAPTER_SCHEMA,
                    },
                });

                if (!resp.text) return { segmentIndex: idx, chapters: [] };

                const cleanText = resp.text.replace(/```json/g, '').replace(/```/g, '').trim();
                const result = JSON.parse(cleanText);
                console.log(`[${lectureId}] Segment ${idx}: ${result.chapters?.length || 0} chapters found`);
                return { segmentIndex: idx, chapters: result.chapters || [] };
            } catch (err) {
                console.error(`[${lectureId}] Segment ${idx} error:`, err.message);
                return { segmentIndex: idx, chapters: [] };
            }
        };

        // 배치 처리: 3개씩 묶어서 순차 실행
        for (let i = 0; i < segments.length; i += BATCH_SIZE) {
            const batch = segments.slice(i, i + BATCH_SIZE);
            const batchNum = Math.floor(i / BATCH_SIZE) + 1;
            const totalBatches = Math.ceil(segments.length / BATCH_SIZE);
            console.log(`[${lectureId}] Processing batch ${batchNum}/${totalBatches} (segments ${i}-${i + batch.length - 1})`);

            const batchResults = await Promise.all(
                batch.map((segment, batchIdx) => processSegment(segment, i + batchIdx))
            );
            segmentResults.push(...batchResults);

            // 배치 사이 짧은 딜레이 (rate limit 방지)
            if (i + BATCH_SIZE < segments.length) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        // ========== Step 3: 챕터 병합 ==========
        let allChapters = [];
        const hasTimestamps = segments.some(s => s.startTime && s.endTime);

        for (const result of segmentResults.sort((a, b) => a.segmentIndex - b.segmentIndex)) {
            for (const ch of result.chapters) {
                if (hasTimestamps) {
                    // 타임스탬프 있음: 시간 기준 중복 체크 (±2분 내 유사 챕터 스킵)
                    const chStartSec = parseTime(ch.startTime);
                    const isDuplicate = allChapters.some(existing => {
                        const existingStart = parseTime(existing.startTime);
                        return Math.abs(existingStart - chStartSec) < 120;
                    });
                    if (!isDuplicate) {
                        allChapters.push(ch);
                    }
                } else {
                    // 타임스탬프 없음: 모든 챕터 포함 (세그먼트 순서대로)
                    allChapters.push(ch);
                }
            }
        }

        // 시간순 정렬 (타임스탬프 있을 때만)
        if (hasTimestamps) {
            allChapters.sort((a, b) => parseTime(a.startTime) - parseTime(b.startTime));
        }

        // ID 부여
        allChapters = allChapters.map((ch, idx) => ({
            ...ch,
            id: `ch${idx + 1}`
        }));

        console.log(`[${lectureId}] Total chapters after merge: ${allChapters.length}`);

        // ========== Step 4: 강의 제목 및 메타데이터 생성 ==========
        // 첫 세그먼트(앞부분) 텍스트를 함께 제공하여 강사/메타데이터 추출
        const introText = processedTranscript.substring(0, 5000);
        
        const titlePrompt = `
다음 강의의 전체 제목, 요약, 그리고 메타데이터를 추출하세요.

## 강의 앞부분 내용:
${introText}

## 챕터 목록:
${allChapters.map((ch, i) => `${i + 1}. ${ch.title}`).join('\n')}

## 요청사항
1. **Title**: 강의 내용을 포괄하는 매력적인 제목
2. **Overview**: 전체 내용을 3문장 내외로 요약
3. **Author**: 강사 이름 (없으면 빈칸)
4. **Tags**: 핵심 주제 태그 3-5개 (배열)

JSON 형식으로 출력하세요.
        `;

        let lectureTitle = "강의";
        let lectureOverview = "";
        let lectureAuthor = "";
        let lectureTags = [];

        try {
            const titleResp = await ai.models.generateContent({
                model: "gemini-2.5-flash",
                contents: [{ role: "user", parts: [{ text: titlePrompt }] }],
                config: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            title: { type: Type.STRING },
                            overview: { type: Type.STRING },
                            author: { type: Type.STRING },
                            tags: { type: Type.ARRAY, items: { type: Type.STRING } }
                        },
                        required: ["title", "overview"]
                    }
                }
            });
            if (titleResp.text) {
                const titleJson = JSON.parse(titleResp.text.replace(/```json/g, '').replace(/```/g, '').trim());
                lectureTitle = titleJson.title || "강의";
                lectureOverview = titleJson.overview || "";
                lectureAuthor = titleJson.author || "";
                lectureTags = titleJson.tags || [];
            }
        } catch (e) {
            console.error(`[${lectureId}] Title generation error:`, e.message);
        }

        // ========== Step 5: DB 저장 ==========
        await run(`INSERT INTO lectures (id, title, raw_text, original_text, correction_stats, author, tags, overview) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [lectureId, lectureTitle, processedTranscript, transcript, JSON.stringify(preprocessResult.stats), lectureAuthor, JSON.stringify(lectureTags), lectureOverview]);

        let chapterOrder = 0;
        for (const ch of allChapters) {
            const chId = `${lectureId}_${++chapterOrder}`;
            await run(`INSERT INTO chapters (id, lecture_id, chapter_number, title, start_time, end_time, status) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [chId, lectureId, chapterOrder, ch.title, ch.startTime || "", ch.endTime || "", 'pending']);
        }

        // ========== Step 6: 응답 ==========
        const scanJson = {
            title: lectureTitle,
            overview: lectureOverview,
            chapters: allChapters
        };

        res.json({ id: lectureId, title: lectureTitle, totalChapters: allChapters.length });

        // ========== Step 7: 백그라운드 Deep Dive ==========
        // scanJson은 이제 DB에서 로드할 수 있으므로 필수가 아니지만, 호환성을 위해 유지
        // apiKey 전달
        processLectureBackground(lectureId, apiKey).catch(console.error);

    } catch (error) {
        console.error("Error creating lecture:", error);
        res.status(500).json({ error: error.message });
    }
});

// 2. 강의 목록 조회
app.get('/api/lectures', async (req, res) => {
    try {
        const lectures = await all(`SELECT id, title, created_at FROM lectures ORDER BY created_at DESC`);
        res.json(lectures);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 3. 강의 상세 조회 (챕터 포함)
app.get('/api/lectures/:id', async (req, res) => {
    try {
        const lecture = await get(`SELECT * FROM lectures WHERE id = ?`, [req.params.id]);
        if (!lecture) return res.status(404).json({ error: "Not found" });

        const chapters = await all(`SELECT * FROM chapters WHERE lecture_id = ? ORDER BY chapter_number`, [req.params.id]);

        // JSON 파싱 (저장된 상세 데이터)
        const parsedChapters = chapters.map(ch => ({
            ...ch,
            // detailed_note 등의 JSON 문자열 필드를 객체로 파싱하지 않음. 
            // 클라이언트에서 사용하기 편하게 일부 필드는 파싱해서 내려줌
            content: ch.detailed_note ? JSON.parse(ch.detailed_note) : null
        }));
        
        // correction_stats 파싱
        let correctionStats = null;
        try {
            if (lecture.correction_stats) {
                correctionStats = JSON.parse(lecture.correction_stats);
            }
        } catch (e) {
            console.error("Failed to parse correction_stats", e);
        }

        // tags 파싱
        let tags = [];
        try {
            if (lecture.tags) {
                tags = JSON.parse(lecture.tags);
            }
        } catch (e) {
            console.error("Failed to parse tags", e);
        }

        // final_summary 파싱
        let finalSummary = null;
        try {
            if (lecture.final_summary) {
                finalSummary = JSON.parse(lecture.final_summary);
            }
        } catch (e) {
            console.error("Failed to parse final_summary", e);
        }

        res.json({ 
            ...lecture, 
            correction_stats: correctionStats, 
            tags, 
            finalSummary, 
            chapters: parsedChapters 
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 5. 챕터 재생성 (피드백 반영)
app.post('/api/chapters/:id/regenerate', async (req, res) => {
    try {
        const { feedback, apiKey: clientApiKey } = req.body;
        const chapter = await get('SELECT * FROM chapters WHERE id = ?', [req.params.id]);
        if (!chapter) return res.status(404).json({ error: "Chapter not found" });
        if (!chapter.detailed_note) return res.status(400).json({ error: "Chapter not ready - run analysis first" });

        const meta = JSON.parse(chapter.detailed_note);
        const lecture = await get('SELECT raw_text FROM lectures WHERE id = ?', [chapter.lecture_id]);

        const slice = extractSlice(lecture.raw_text, meta.startTime, meta.endTime);
        const apiKey = clientApiKey || process.env.GEMINI_API_KEY || process.env.API_KEY;
        if (!apiKey) return res.status(400).json({ error: "API Key required" });
        const ai = new GoogleGenAI({ apiKey });

        await run("UPDATE chapters SET status = 'processing' WHERE id = ?", [req.params.id]);

        // Background regeneration
        (async () => {
            try {
                const prompt = `
당신은 강의 내용을 생생하게 전달하는 전문 에디터입니다.
사용자 피드백을 반영하여, 마치 강의를 직접 듣는 것처럼 생동감 있는 학습 노트를 재작성하세요.

## 챕터 정보
- 제목: ${chapter.title}
- 시간: ${meta.startTime} ~ ${meta.endTime}

## 사용자 피드백 (반드시 반영)
${feedback}

## 핵심 작성 원칙

### ⚠️ 반드시 지켜야 할 것
1. **강사 인용을 본문에 직접 통합**: 각 섹션에 최소 1-2개의 강사 발언을 인용하고, 해당 타임스탬프를 표시
2. **구어체 보존**: 강사가 실제로 말한 표현을 살려서 인용 (예: "이게 핵심이에요", "여러분이 해보셔야 해요")
3. **맥락 연결**: 인용 후에는 왜 이 말이 중요한지, 어떤 의미인지 해석 추가
4. **스토리 흐름**: 강의가 어떻게 전개되었는지 시간순으로 자연스럽게 서술

### ❌ 하지 말 것
- "~합니다", "~입니다"로 끝나는 딱딱한 문체 (대신: "~한다", "~이다", "~했다" 등 사용)
- 일반론적 서술 금지
- 강사 인용 없이 진행하는 것
- 교과서처럼 무미건조하게 정보만 나열

### 📝 narrative 작성 형식 (필수)

## 소제목

강사는 [주제]에 대해 이야기하며 강조했다.

> "강사의 실제 발언 인용" [MM:SS]

이 발언의 의미는... [해석과 맥락 설명]. **핵심 키워드**는 특히 중요한데...

### quotesWithTimeline
- narrative에 포함된 인용들을 여기에도 별도로 정리 (최소 6개)

## 분석할 텍스트:
${slice}
                `;

                const resp = await ai.models.generateContent({
                    model: "gemini-2.5-flash",
                    contents: [{ role: "user", parts: [{ text: prompt }] }],
                    config: { responseMimeType: "application/json", responseSchema: CHAPTER_DEEP_DIVE_SCHEMA }
                });

                if (!resp.text) {
                    throw new Error('Gemini API returned empty response');
                }
                const resultText = resp.text.replace(/```json/g, '').replace(/```/g, '').trim();
                const resultJson = JSON.parse(resultText);

                const fullData = { ...meta, ...resultJson };

                await run(`UPDATE chapters SET narrative = ?, detailed_note = ?, status = 'completed' WHERE id = ?`,
                    [resultJson.narrative, JSON.stringify(fullData), req.params.id]);
            } catch (e) {
                console.error("Regen failed:", e.message);
                await run("UPDATE chapters SET status = 'error' WHERE id = ?", [req.params.id]);
            }
        })();

        res.json({ status: 'processing', message: 'Regeneration started' });

    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 5-1. 챕터 수동 업데이트 (사용자 편집 저장)
app.put('/api/chapters/:id', async (req, res) => {
    try {
        const { narrative, content } = req.body;
        
        // 1. narrative 컬럼 업데이트
        // 2. detailed_note JSON 내의 narrative 필드 등도 업데이트
        
        const chapter = await get('SELECT detailed_note FROM chapters WHERE id = ?', [req.params.id]);
        if (!chapter) return res.status(404).json({ error: "Chapter not found" });

        let detailedNote = {};
        try {
            detailedNote = JSON.parse(chapter.detailed_note || '{}');
        } catch (e) {}

        // 업데이트할 내용 병합
        // content 객체가 넘어오면 그것을 우선 사용 (narrative 포함)
        const updatedNote = { ...detailedNote, ...content };
        if (narrative) updatedNote.narrative = narrative;

        await run(`UPDATE chapters SET narrative = ?, detailed_note = ? WHERE id = ?`,
            [updatedNote.narrative, JSON.stringify(updatedNote), req.params.id]);

        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 4. PDF 다운로드
app.get('/api/lectures/:id/pdf', async (req, res) => {
    try {
        const { type } = req.query; // 'full' or 'summary'
        const lecture = await get(`SELECT * FROM lectures WHERE id = ?`, [req.params.id]);
        if (!lecture) return res.status(404).send("Lecture not found");

        const chapters = await all(`SELECT * FROM chapters WHERE lecture_id = ? ORDER BY chapter_number`, [req.params.id]);
        const completedChapters = chapters.filter(c => c.status === 'completed')
            .map(c => {
                try {
                    // detailed_note 필드는 JSON string임
                    return JSON.parse(c.detailed_note);
                } catch (e) { return {}; }
            });

        if (completedChapters.length === 0) return res.status(400).send("No completed chapters to export. Please wait for analysis to finish.");

        // 태그 파싱
        let tags = [];
        try {
            if (lecture.tags) tags = JSON.parse(lecture.tags);
        } catch (e) {}

        // 파이널 서머리 파싱 (글로벌 용어집 포함됨)
        let finalSummary = null;
        try {
            if (lecture.final_summary) finalSummary = JSON.parse(lecture.final_summary);
        } catch (e) {}

        const noteForMd = {
            title: lecture.title,
            overview: "", 
            author: lecture.author,
            tags: tags,
            chapters: completedChapters,
            finalSummary: finalSummary
        };

        const markdown = generateMarkdown(noteForMd, type);
        const contentHtml = await marked.parse(markdown);
        const fullHtml = generateStyledPDFHtml(noteForMd, contentHtml);

        const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
        const page = await browser.newPage();
        await page.setContent(fullHtml, { waitUntil: 'networkidle0' });
        const pdfBuffer = await page.pdf({ format: 'A4', margin: { top: '20mm', bottom: '20mm', left: '20mm', right: '20mm' }, printBackground: true });
        await browser.close();

        const filename = type === 'summary' ? `[Summary] ${lecture.title}` : lecture.title;

        res.set({
            'Content-Type': 'application/pdf',
            'Content-Length': pdfBuffer.length,
            'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}.pdf"`
        });
        res.send(pdfBuffer);

    } catch (e) {
        console.error("PDF Export Error:", e);
        res.status(500).json({ error: e.message });
    }
});

// 6. 강의 삭제
app.delete('/api/lectures/:id', async (req, res) => {
    try {
        const lectureId = req.params.id;
        await run(`DELETE FROM chapters WHERE lecture_id = ?`, [lectureId]);
        await run(`DELETE FROM lectures WHERE id = ?`, [lectureId]);
        res.json({ message: "Lecture deleted successfully" });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 7. 강의 재시도 (실패/미완료 챕터 다시 분석)
app.post('/api/lectures/:id/retry', async (req, res) => {
    try {
        const lectureId = req.params.id;
        const { apiKey } = req.body;
        
        if (!apiKey) {
            // 서버 env가 없으면 클라이언트에서 받아야 함
            if (!process.env.GEMINI_API_KEY && !process.env.API_KEY) {
                return res.status(400).json({ error: "API Key required for retry" });
            }
        }
        
        const finalApiKey = apiKey || process.env.GEMINI_API_KEY || process.env.API_KEY;

        // 백그라운드 프로세스 다시 시작
        // (processLectureBackground 내에서 'completed'는 스킵하도록 되어 있음)
        processLectureBackground(lectureId, finalApiKey).catch(console.error);

        res.json({ message: "Retry started in background" });

    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 7.4. 미완료 챕터 이어서 처리 (Continue All)
app.post('/api/lectures/:id/continue-processing', async (req, res) => {
    try {
        const lectureId = req.params.id;
        const { apiKey } = req.body;

        const finalApiKey = apiKey || process.env.GEMINI_API_KEY || process.env.API_KEY;
        if (!finalApiKey) {
            return res.status(400).json({ error: "API Key required" });
        }

        // 미완료 챕터가 있는지 확인
        const pendingChapters = await all(
            `SELECT id FROM chapters WHERE lecture_id = ? AND status != 'completed'`,
            [lectureId]
        );

        if (pendingChapters.length === 0) {
            return res.status(400).json({ error: "All chapters are already completed" });
        }

        // 백그라운드로 처리 시작 (기존 함수 재사용 - 이미 완료된 챕터는 스킵됨)
        processLectureBackground(lectureId, finalApiKey);

        res.json({
            message: "Continue processing started",
            pendingCount: pendingChapters.length
        });

    } catch (e) {
        console.error("Continue processing error:", e);
        res.status(500).json({ error: e.message });
    }
});

// 7.5. Final Summary 생성 (기존 완료된 강의에 대해 수동 호출)
app.post('/api/lectures/:id/generate-summary', async (req, res) => {
    try {
        const lectureId = req.params.id;
        const { apiKey } = req.body;

        const finalApiKey = apiKey || process.env.GEMINI_API_KEY || process.env.API_KEY;
        if (!finalApiKey) {
            return res.status(400).json({ error: "API Key required" });
        }

        // 완료된 챕터가 있는지 확인
        const chapters = await all(`SELECT * FROM chapters WHERE lecture_id = ? AND status = 'completed'`, [lectureId]);
        if (chapters.length === 0) {
            return res.status(400).json({ error: "No completed chapters to summarize" });
        }

        // 비동기로 Final Summary 생성
        generateFinalSummary(lectureId, finalApiKey).catch(console.error);

        res.json({ message: "Final summary generation started" });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 8. 강의 메타데이터 업데이트
app.put('/api/lectures/:id', async (req, res) => {
    try {
        const { title, author, source_url, tags, memo } = req.body;
        const lectureId = req.params.id;

        await run(`UPDATE lectures SET 
            title = ?, 
            author = ?, 
            source_url = ?, 
            tags = ?, 
            memo = ? 
            WHERE id = ?`,
            [title, author, source_url, JSON.stringify(tags || []), memo, lectureId]);

        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ==================== FINAL SUMMARY GENERATOR ====================
async function generateFinalSummary(lectureId, apiKey) {
    console.log(`[${lectureId}] Generating Final Summary...`);
    sendEvent(lectureId, 'progress', { message: 'Generating Final Summary & Global Glossary...' });

    try {
        const chapters = await all(`SELECT * FROM chapters WHERE lecture_id = ? ORDER BY chapter_number`, [lectureId]);
        const completedChapters = chapters.filter(c => c.status === 'completed');

        if (completedChapters.length === 0) return;

        // 1. Collect Context
        const context = completedChapters.map(ch => {
            try {
                const data = JSON.parse(ch.detailed_note);
                return `Chapter ${ch.chapter_number}: ${ch.title}\nSummary: ${ch.summary || data.keyMessage}\nKey Terms: ${(data.keyTerms || []).map(t => t.term).join(', ')}`;
            } catch (e) { return ''; }
        }).join('\n\n');

        // 2. Aggregate Glossary (Deduplication)
        const globalGlossaryMap = new Map();
        completedChapters.forEach(ch => {
            try {
                const data = JSON.parse(ch.detailed_note);
                if (data.keyTerms) {
                    data.keyTerms.forEach(t => {
                        // 간단한 중복 제거: 소문자 기준
                        const key = t.term.toLowerCase();
                        if (!globalGlossaryMap.has(key)) {
                            globalGlossaryMap.set(key, t);
                        } else {
                            // 이미 있으면 정의가 더 긴 것을 유지하거나, 병합? (일단 유지)
                        }
                    });
                }
            } catch (e) {}
        });
        const globalGlossary = Array.from(globalGlossaryMap.values());

        // 3. LLM Generation for Insights
        const ai = new GoogleGenAI({ apiKey });
        const prompt = `
다음은 강의의 챕터별 요약입니다. 이를 바탕으로 전체 강의를 관통하는 종합 요약과 학습 자료를 생성하세요.

## 강의 내용:
${context}

## 요청사항 (JSON 형식)
1. **oneSentenceSummary**: 강의 전체를 한 문장으로 요약 (명언처럼 강렬하게)
2. **coreInsights**: 전체를 관통하는 핵심 통찰 3-5가지
3. **actionChecklist**: 수강생이 실천해야 할 행동 지침 (체크리스트)
4. **practiceAssignments**: 실습 과제 3가지 (난이도, 소요시간 포함)
5. **reviewQuestions**: 복습용 질문 5가지
6. **furtherLearning**: 더 공부하면 좋은 관련 주제/키워드

JSON 포맷으로 출력하세요.
        `;

        const resp = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            config: { responseMimeType: "application/json" }
        });

        if (resp.text) {
            const resultJson = JSON.parse(resp.text.replace(/```json/g, '').replace(/```/g, '').trim());
            
            // Add Glossary to result (though not part of LLM generation to avoid token limit, we aggregated it manually)
            // But wait, the FinalSummary interface doesn't have glossary field yet. 
            // We should add it to the final JSON structure we save.
            
            const finalData = {
                ...resultJson,
                globalGlossary // Add aggregated glossary
            };

            // Rich Overview 생성
            let richOverview = finalData.oneSentenceSummary || "";
            if (finalData.coreInsights && finalData.coreInsights.length > 0) {
                // Handle both formats: string or {insight: string}
                richOverview += "\n\n**핵심 인사이트:**\n" + finalData.coreInsights.map(i => {
                    const text = typeof i === 'string' ? i : i.insight;
                    return `- ${text}`;
                }).join('\n');
            }

            await run(`UPDATE lectures SET final_summary = ?, overview = ? WHERE id = ?`, 
                [JSON.stringify(finalData), richOverview, lectureId]);
            
            sendEvent(lectureId, 'final_summary_complete', finalData);
        }

    } catch (e) {
        console.error(`[${lectureId}] Final Summary Error:`, e);
        sendEvent(lectureId, 'error', { message: "Final summary generation failed" });
    }
}

// ==================== BACKGROUND PROCESS ====================
async function processLectureBackground(lectureId, apiKey) {
    console.log(`[${lectureId}] Background analysis started.`);
    sendEvent(lectureId, 'status', { message: 'Background analysis started', status: 'started' });

    try {
        // Lecture 정보(transcript) 로드
        const lecture = await get(`SELECT raw_text FROM lectures WHERE id = ?`, [lectureId]);
        if (!lecture || !lecture.raw_text) {
            console.error(`[${lectureId}] Lecture not found or no transcript.`);
            sendEvent(lectureId, 'error', { message: 'Lecture data not found' });
            return;
        }
        const transcript = lecture.raw_text;

        // DB에서 챕터 목록 조회 (처리되지 않은 것들만 우선 처리하도록 개선 가능하나, 여기서는 전체 순회)
        // Retry 시에는 'completed'가 아닌 것만 처리하는 로직이 필요할 수 있음. 
        // 일단 기본 프로세스는 전체를 훑되, status check를 할 수 있음.
        const chapters = await all(`SELECT * FROM chapters WHERE lecture_id = ? ORDER BY chapter_number`, [lectureId]);
        
        // API Key fallback
        const finalApiKey = apiKey || process.env.GEMINI_API_KEY || process.env.API_KEY;
        if (!finalApiKey) {
             console.error(`[${lectureId}] No API Key available for background process.`);
             // 에러 상태 업데이트
             await run(`UPDATE chapters SET status = 'error' WHERE lecture_id = ? AND status != 'completed'`, [lectureId]);
             sendEvent(lectureId, 'error', { message: 'API Key missing for background process' });
             return;
        }

        const ai = new GoogleGenAI({ apiKey: finalApiKey });

        // Context Passing: 이전 챕터의 핵심 내용을 저장하여 다음 챕터 분석 시 제공
        let previousContext = "";

        for (let i = 0; i < chapters.length; i++) {
            const dbChapter = chapters[i];
            
            // 이미 완료된 챕터는 스킵 (Retry 지원을 위해)
            // 단, Context는 로드해서 다음 챕터에 넘겨줘야 함
            if (dbChapter.status === 'completed') {
                try {
                    const existingData = JSON.parse(dbChapter.detailed_note);
                    const keyTerms = existingData.keyTerms ? existingData.keyTerms.map(t => t.term).join(', ') : '';
                    previousContext = `이전 챕터(${dbChapter.title}) 핵심: ${existingData.keyMessage || ''}\n주요 용어: ${keyTerms}`;
                } catch (e) { /* ignore */ }
                continue;
            }

            console.log(`[${lectureId}] Analyzing Ch ${dbChapter.chapter_number}: ${dbChapter.title}`);
            sendEvent(lectureId, 'progress', { 
                chapterId: dbChapter.id, 
                chapterNumber: dbChapter.chapter_number, 
                message: `Analyzing Chapter ${dbChapter.chapter_number}: ${dbChapter.title}` 
            });
            
            await run(`UPDATE chapters SET status = 'processing' WHERE id = ?`, [dbChapter.id]);

            try {
                // 시간 정보가 DB에 저장되어 있어야 함
                const startTime = dbChapter.start_time;
                const endTime = dbChapter.end_time;

                // 텍스트 자르기
                let textToAnalyze = "";
                if (startTime && endTime) {
                    const slice = extractSlice(transcript, startTime, endTime);
                    
                    // Slice가 너무 짧으면 fallback: 전체 텍스트에서 비율로 추정하여 자르기
                    if (slice.length < 100) {
                        const totalLen = transcript.length;
                        const totalChapters = chapters.length;
                        // 현재 챕터가 몇 번째인지 (0-indexed i)
                        // 단순 등분할 (정확하지 않지만 첫 챕터 반복보다는 나음)
                        const approxChunkSize = Math.floor(totalLen / totalChapters);
                        const startIdx = i * approxChunkSize;
                        const endIdx = Math.min((i + 1) * approxChunkSize + 500, totalLen); // 약간의 오버랩
                        
                        console.warn(`[${lectureId}] Ch ${dbChapter.chapter_number}: Slice too short (${slice.length} chars). Using proportional fallback.`);
                        textToAnalyze = transcript.substring(startIdx, endIdx);
                    } else {
                        textToAnalyze = slice;
                    }
                } else {
                    // 타임스탬프 정보 자체가 없음 -> 등분할
                    const totalLen = transcript.length;
                    const totalChapters = chapters.length;
                    const approxChunkSize = Math.floor(totalLen / totalChapters);
                    const startIdx = i * approxChunkSize;
                    const endIdx = Math.min((i + 1) * approxChunkSize + 500, totalLen);
                    
                    console.warn(`[${lectureId}] Ch ${dbChapter.chapter_number}: No timestamps. Using proportional fallback.`);
                    textToAnalyze = transcript.substring(startIdx, endIdx);
                }

                // Deep Dive Prompt - 스토리텔링 중심
                const prompt = `
당신은 IT/기술 분야의 전문 테크니컬 라이터입니다.
독자가 이 글만 읽어도 강의의 깊은 통찰을 얻을 수 있도록 완성도 높은 아티클을 작성하세요.

## 챕터 정보
- 제목: ${dbChapter.title}
- 시간: ${startTime || 'N/A'} ~ ${endTime || 'N/A'}

${previousContext ? `## 이전 챕터 문맥 (참고용)\n${previousContext}\n(위 내용을 참고하여 문맥을 자연스럽게 연결하고, 용어를 일관되게 사용하세요)` : ''}

---
## 🚨 문체 규칙 (최우선 준수사항)

**반드시 평서형 종결어미만 사용하세요:**
- ✅ 올바른 예: "~한다", "~이다", "~했다", "~된다", "~있다"
- ❌ 금지: "~합니다", "~입니다", "~됩니다", "~있습니다"

이 규칙을 어기면 전체 결과물이 무효 처리됩니다.
모든 문장의 종결어미를 작성 후 반드시 검토하세요.
---

## 📝 narrative 구조 (필수 형식)

### 도입부 (첫 문단)
- "이 챕터에서는..." 으로 시작하지 마세요
- 바로 본론으로 진입: "강사는 [주제]로 강의를 시작했다" 또는 "[핵심 개념]에 대한 논의가 이어졌다" 형태로 시작

### 본문 구조 (반드시 ## 소제목 사용)
- 반드시 2~4개의 ## 소제목으로 섹션을 나눌 것
- ### 소제목은 사용하지 마세요 (## 만 사용)
- 각 섹션에 최소 1개의 인용문 포함

### 인용 형식
> "강사의 실제 발언" [MM:SS]

인용 후 반드시 해석을 덧붙인다. 이것이 의미하는 바는...

### 예시 구조:
---
## 첫 번째 주제

강사는 [주제]를 설명하며 핵심을 짚었다.

> "실제 발언 인용" [00:05:30]

이 발언은 [해석]. 특히 **핵심 개념**이 중요한데...

## 두 번째 주제

이어서 [다음 주제]로 논의가 전환되었다.

> "또 다른 발언" [00:12:45]

실제로 이것이 의미하는 바는...

- 포인트 1
- 포인트 2
---

## ⚠️ 작성 시 주의사항

1. **강사 인용 필수**: 각 ## 섹션에 최소 1개의 인용문과 타임스탬프
2. **구어체 보존**: 강사가 실제로 말한 표현을 살려서 인용
3. **맥락 연결**: 인용 후에는 왜 이 말이 중요한지 해석
4. **스토리 흐름**: 시간순으로 자연스럽게 서술
5. **일반론 금지**: "온라인 강의의 성공은..." 같은 뻔한 서술 금지
6. **마무리 검증**: 모든 문장이 평서형 종결어미(~한다/~이다)로 끝나는지 확인

## 분석할 텍스트:
${textToAnalyze}
                `;

                const resp = await ai.models.generateContent({
                    model: "gemini-2.5-flash", // Pro model for better quality
                    contents: [{ role: "user", parts: [{ text: prompt }] }],
                    config: { responseMimeType: "application/json", responseSchema: CHAPTER_DEEP_DIVE_SCHEMA }
                });

                if (!resp.text) {
                    throw new Error(`Gemini API returned empty response for chapter ${dbChapter.id}`);
                }
                const resultText = resp.text.replace(/```json/g, '').replace(/```/g, '').trim();
                const resultJson = JSON.parse(resultText);

                // 결과 병합 (메타데이터 포함)
                const fullData = {
                    ...resultJson,
                    id: dbChapter.id,
                    title: dbChapter.title,
                    startTime: startTime,
                    endTime: endTime
                };

                // DB 업데이트
                await run(`UPDATE chapters SET 
                    narrative = ?, 
                    detailed_note = ?, 
                    status = 'completed' 
                    WHERE id = ?`,
                    [resultJson.narrative, JSON.stringify(fullData), dbChapter.id]);
                
                // Context Update for next chapter
                const currentKeyTerms = resultJson.keyTerms ? resultJson.keyTerms.map(t => t.term).join(', ') : '';
                previousContext = `이전 챕터(${dbChapter.title}) 핵심: ${resultJson.keyMessage || ''}\n주요 용어: ${currentKeyTerms}`;
                
                sendEvent(lectureId, 'chapter_complete', { 
                    chapterId: dbChapter.id, 
                    title: dbChapter.title 
                });

            } catch (err) {
                console.error(`[${lectureId}] Error on Ch ${dbChapter.chapter_number}:`, err);
                await run(`UPDATE chapters SET status = 'error' WHERE id = ?`, [dbChapter.id]);
                sendEvent(lectureId, 'chapter_error', { 
                    chapterId: dbChapter.id, 
                    message: err.message 
                });
            }
        }
        
        // 모든 챕터 완료 후 Final Summary & Glossary 생성
        await generateFinalSummary(lectureId, finalApiKey);

        console.log(`[${lectureId}] Analysis finished.`);
        sendEvent(lectureId, 'complete', { message: 'All analysis finished' });
    } catch (e) {
        console.error(`[${lectureId}] Fatal background error:`, e);
        sendEvent(lectureId, 'error', { message: e.message });
    }
}

// ========== Markdown Generator ==========
function generateMarkdown(note, type = 'full') {
    let md = "";

    // 1. Final Summary (Big Picture)
    if (note.finalSummary) {
        md += `# 🎯 종합 요약 (Final Summary)\n\n`;
        
        if (note.finalSummary.oneSentenceSummary) {
            md += `> ${note.finalSummary.oneSentenceSummary}\n\n`;
        }

        if (note.finalSummary.coreInsights) {
            md += `### 💎 핵심 인사이트\n\n`;
            note.finalSummary.coreInsights.forEach(ins => {
                // Handle both formats: string or {insight: string}
                const insightText = typeof ins === 'string' ? ins : ins.insight;
                md += `- ${insightText}\n`;
            });
            md += `\n`;
        }

        if (note.finalSummary.actionChecklist) {
            md += `### ✅ 실천 체크리스트\n\n`;
            note.finalSummary.actionChecklist.forEach(item => {
                // Handle both formats: string or {action: string, priority?: string}
                const actionText = typeof item === 'string' ? item : item.action;
                const priority = typeof item === 'string' ? '보통' : (item.priority || '보통');
                md += `- **${actionText}** (${priority})\n`;
            });
            md += `\n`;
        }
        
        md += `<div class="page-break"></div>\n\n`;
    }

    // 2. Consolidated Takeaways & Actions (For Summary Mode)
    if (type === 'summary' && note.chapters) {
        md += `# 🚀 한눈에 보는 핵심 결론 & 액션\n\n`;
        
        md += `## 💡 모든 핵심 결론 (All Takeaways)\n\n`;
        note.chapters.forEach(ch => {
            const takeaways = ch.keyTakeaways || ch.keyPoints;
            if (takeaways && takeaways.length > 0) {
                md += `**[${ch.title}]**\n`;
                takeaways.forEach(p => md += `- ${p}\n`);
                md += `\n`;
            }
        });

        md += `## ✅ 모든 실천 지침 (All Actions)\n\n`;
        note.chapters.forEach(ch => {
            const actions = ch.actionableItems || ch.practicalTips;
            if (actions && actions.length > 0) {
                md += `**[${ch.title}]**\n`;
                actions.forEach(tip => md += `- ${tip}\n`);
                md += `\n`;
            }
        });

        md += `<div class="page-break"></div>\n\n`;
    }

    // 3. Chapter Details
    if (note.chapters) {
        if (type === 'full') md += `# 📖 상세 강의 노트 (Full Notes)\n\n`;
        else md += `# 📋 챕터별 요약 (Chapter Summaries)\n\n`;

        note.chapters.forEach((ch, index) => {
            const takeaways = ch.keyTakeaways || ch.keyPoints;
            const actions = ch.actionableItems || ch.practicalTips;
            
            if (type === 'full' || (takeaways?.length > 0 || actions?.length > 0)) {
                md += `## Chapter ${index + 1}: ${ch.title}\n\n`;
                
                if (ch.startTime) {
                    md += `<div class="chapter-meta">⏱️ Time: ${ch.startTime} ~ ${ch.endTime || ''}</div>\n\n`;
                }

                // Summary Mode에서는 Narrative(줄글) 생략
                if (type === 'full' && ch.narrative) {
                    md += `${ch.narrative}\n\n`;
                }

                if (takeaways && takeaways.length > 0) {
                    md += `### 💡 핵심 결론\n\n`;
                    takeaways.forEach(p => md += `- ${p}\n`);
                    md += `\n`;
                }

                if (actions && actions.length > 0) {
                    md += `### ✅ 실천 지침\n\n`;
                    actions.forEach(tip => md += `- ${tip}\n`);
                    md += `\n`;
                }
                
                md += `---\n\n`; // Divider between chapters
            }
        });
    }

    // 4. Global Glossary
    if (note.finalSummary && note.finalSummary.globalGlossary && note.finalSummary.globalGlossary.length > 0) {
        md += `<div class="page-break"></div>\n\n`;
        md += `# 📚 통합 용어 사전 (Global Glossary)\n\n`;
        md += `<div class="glossary-grid">\n\n`;
        note.finalSummary.globalGlossary.forEach(t => {
            md += `#### ${t.term}\n${t.definition}\n\n`;
        });
        md += `</div>\n\n`;
    }

    return md;
}

function generateStyledPDFHtml(note, contentHtml) {
    const today = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
    const author = note.author || 'LectureNote AI';
    const tags = note.tags && note.tags.length > 0 ? note.tags.map(t => `#${t}`).join('  ') : '';
    
    return `
<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <title>${note.title}</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;700;900&family=Noto+Serif+KR:wght@400;700&display=swap');
        
        :root {
            --primary-color: #2563eb;
            --text-main: #1e293b;
            --text-sub: #475569;
            --bg-accent: #f8fafc;
        }

        body { 
            font-family: 'Noto Sans KR', sans-serif; 
            line-height: 1.75; 
            color: var(--text-main); 
            max-width: 100%;
            margin: 0;
            padding: 0;
            -webkit-print-color-adjust: exact;
        }

        /* Page Layout */
        @page {
            size: A4;
            margin: 20mm;
            @bottom-center {
                content: counter(page);
                font-size: 10pt;
                color: #94a3b8;
            }
        }

        .page-break { 
            page-break-before: always; 
        }
        
        /* Page Break Safety */
        blockquote, ul, .chapter-meta, pre { 
            page-break-inside: avoid; 
        }
        
        h2, h3 { 
            page-break-after: avoid; 
        }
        
        li {
            page-break-inside: auto; /* 리스트 아이템은 길면 잘려도 됨, 하지만 짧으면 유지 */
        }

        /* Cover Page */
        .cover-page {
            height: 90vh; /* Adjust for PDF rendering */
            display: flex;
            flex-direction: column;
            justify-content: center;
            text-align: center;
            border: 8px double var(--primary-color);
            padding: 40px;
            margin-bottom: 40px;
            page-break-after: always;
        }

        .cover-title {
            font-size: 42px;
            font-weight: 900;
            color: #1e3a8a;
            margin-bottom: 20px;
            line-height: 1.3;
        }

        .cover-subtitle {
            font-size: 24px;
            color: #64748b;
            font-weight: 300;
            margin-bottom: 40px;
        }
        
        .cover-author {
            font-size: 20px;
            font-weight: 700;
            color: #334155;
            margin-bottom: 10px;
        }

        .cover-tags {
            font-size: 16px;
            color: var(--primary-color);
            margin-bottom: 60px;
        }

        .cover-meta {
            margin-top: auto;
            font-size: 16px;
            color: #94a3b8;
            border-top: 1px solid #e2e8f0;
            padding-top: 20px;
        }

        /* Typography */
        h1 { 
            font-size: 32px; 
            color: #1e3a8a; 
            border-bottom: 3px solid var(--primary-color); 
            padding-bottom: 15px; 
            margin-top: 0;
            margin-bottom: 30px; 
        }

        h2 { 
            font-size: 24px; 
            margin-top: 40px; 
            margin-bottom: 20px; 
            color: #0f172a; 
            display: flex;
            align-items: center;
        }
        
        h2::before {
            content: '';
            display: inline-block;
            width: 8px;
            height: 24px;
            background: var(--primary-color);
            margin-right: 12px;
            border-radius: 4px;
        }

        h3 { 
            font-size: 20px; 
            margin-top: 30px; 
            margin-bottom: 15px; 
            color: #334155; 
            font-weight: 700;
        }

        p { 
            margin-bottom: 18px; 
            text-align: justify; 
            word-break: keep-all;
        }

        /* Quotes */
        blockquote { 
            background: #f1f5f9; 
            border-left: 6px solid var(--primary-color); 
            padding: 20px 24px; 
            margin: 25px 0; 
            font-family: 'Noto Serif KR', serif;
            font-size: 17px;
            color: #334155; 
            border-radius: 0 8px 8px 0;
        }

        /* Lists */
        ul { 
            padding-left: 20px; 
            margin-bottom: 20px; 
        }
        
        li { 
            margin-bottom: 8px; 
            padding-left: 5px;
        }

        li::marker {
            color: var(--primary-color);
            font-weight: bold;
        }

        strong {
            color: #0f172a;
            background: rgba(253, 224, 71, 0.3);
            padding: 0 2px;
            border-radius: 2px;
        }

        /* Meta info */
        .chapter-meta {
            font-family: 'Noto Sans KR', sans-serif;
            font-size: 14px;
            color: #64748b;
            background: #f8fafc;
            display: inline-block;
            padding: 6px 12px;
            border-radius: 20px;
            border: 1px solid #e2e8f0;
            margin-bottom: 20px;
            font-weight: 500;
        }

        /* Glossary */
        .glossary-grid h4 {
            color: var(--primary-color);
            margin-top: 25px;
            margin-bottom: 8px;
            font-size: 18px;
            border-bottom: 1px solid #e2e8f0;
            padding-bottom: 5px;
        }
    </style>
</head>
<body>
    <!-- Cover Page -->
    <div class="cover-page">
        <div style="flex:1"></div>
        <div class="cover-title">${note.title}</div>
        <div class="cover-subtitle">AI Generated Lecture Note</div>
        
        <div class="cover-author">${author}</div>
        <div class="cover-tags">${tags}</div>
        
        <div style="flex:1"></div>
        <div class="cover-meta">
            Generated on ${today}<br>
            LectureNote AI
        </div>
    </div>

    <!-- Content -->
    ${contentHtml}
</body>
</html>
    `;
}

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
