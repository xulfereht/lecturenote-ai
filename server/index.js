import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from "@google/genai";
import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';
import { marked } from 'marked';
import { createRequire } from 'module';

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
            description: `스토리텔링 형식의 강의 노트. 마크다운 필수.

**필수 요소:**
1. ## 소제목으로 3-5개 섹션 구분
2. 각 섹션에서 강사의 직접 인용을 > "인용문" [HH:MM:SS] 형태로 삽입
3. 인용 후 해석이나 맥락 설명 추가
4. **핵심 키워드** 굵게 강조
5. 최소 2000자 이상

**금지 사항:**
- "~합니다", "~입니다"로 끝나는 무미건조한 문체 금지
- 일반론적 서술 금지 (예: "온라인 강의의 성공은...")
- 강사 인용 없이 진행하는 것 금지

**예시 형식:**
## 첫 번째 주제

강사는 먼저 X에 대해 설명하며 시작했다.

> "여기서 중요한 건 이겁니다. 여러분이 직접 해봐야 감이 와요." [00:05:23]

이 발언은 실습의 중요성을 강조한 것으로, 단순히 이론만 듣는 것으로는...`
        },
        quotesWithTimeline: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    timestamp: { type: Type.STRING, description: "HH:MM:SS 또는 MM:SS 형식" },
                    quote: { type: Type.STRING, description: "강사의 정확한 발언 인용 (구어체 그대로)" },
                    context: { type: Type.STRING, description: "발언의 맥락과 의미 설명" }
                },
                required: ["timestamp", "quote", "context"]
            },
            description: "핵심적인 타임스탬프 인용문 (6-10개). narrative에도 통합하고 여기에도 별도로 정리"
        },
        keyTerms: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    term: { type: Type.STRING },
                    definition: { type: Type.STRING },
                    example: { type: Type.STRING, description: "강의에서 언급된 실제 사용 예시" }
                },
                required: ["term", "definition"]
            },
            description: "이 챕터의 핵심 용어/개념 (3-7개)"
        },
        keyPoints: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "핵심 포인트 (5-8개), 구체적이고 실용적인 내용"
        },
        practicalTips: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "실무에서 바로 적용할 수 있는 팁 (3-5개)"
        }
    },
    required: ["narrative", "quotesWithTimeline", "keyPoints", "keyTerms", "practicalTips", "keyMessage"]
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

// VTT 텍스트에서 특정 시간대 추출 (단순 라인 기반 검색)
function extractSlice(text, startStr, endStr) {
    const startSec = parseTime(startStr);
    const endSec = parseTime(endStr);

    // VTT나 일반 텍스트에서 타임스탬프 [MM:SS] 패턴을 찾아 해당 범위만 추출
    // 만약 타임스탬프가 없다면 전체 텍스트에서 비율로 자름 (fallback)

    const lines = text.split('\n');
    let included = [];
    let isInside = false;
    let foundStart = false;

    // 타임스탬프 패턴: [MM:SS] or MM:SS
    const timePattern = /(?:\[)?(\d{1,2}:\d{2}(?::\d{2})?)(?:\])?/;

    for (const line of lines) {
        const match = line.match(timePattern);
        if (match) {
            const timeSec = parseTime(match[1]);

            // 시작 시간보다 조금 전부터 포함 (여유분)
            if (!foundStart && timeSec >= startSec) {
                isInside = true;
                foundStart = true;
            }
            if (foundStart && endSec > 0 && timeSec > endSec) {
                isInside = false;
                break; // 종료 시간 지나면 중단
            }
        }

        if (isInside || !foundStart) { // 시작점을 못 찾았으면 일단 포함하다가 찾으면 정리? 아니면 시작점 찾을때까지 대기?
            // 단순화: 시작점 찾기 전에는 포함 X (단, 첫 챕터는 처음부터 포함)
            if (startSec === 0) isInside = true;

            if (isInside) included.push(line);
        }
    }

    // 만약 추출된 게 너무 적으면 (타임스탬프 파싱 실패 시) 전체 텍스트의 일정 비율을 반환하도록 fallback 필요하지만,
    // 일단 AI가 타임스탬프를 잘 줬다고 가정.
    return included.join('\n');
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
        const { transcript } = req.body;
        if (!transcript) return res.status(400).json({ error: "Transcript required" });

        const lectureId = generateId();
        const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
        const ai = new GoogleGenAI({ apiKey });

        console.log(`[${lectureId}] Starting segmented analysis...`);

        // ========== Step 1: 세그먼트 분할 (로컬) ==========
        const segments = splitIntoSegments(transcript, 30); // 30분 단위
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
        for (const result of segmentResults.sort((a, b) => a.segmentIndex - b.segmentIndex)) {
            for (const ch of result.chapters) {
                // 중복 체크 (시간 기준 ±2분 내 유사 챕터 스킵)
                const chStartSec = parseTime(ch.startTime);
                const isDuplicate = allChapters.some(existing => {
                    const existingStart = parseTime(existing.startTime);
                    return Math.abs(existingStart - chStartSec) < 120; // 2분 이내면 중복
                });

                if (!isDuplicate) {
                    allChapters.push(ch);
                }
            }
        }

        // 시간순 정렬
        allChapters.sort((a, b) => parseTime(a.startTime) - parseTime(b.startTime));

        // ID 부여
        allChapters = allChapters.map((ch, idx) => ({
            ...ch,
            id: `ch${idx + 1}`
        }));

        console.log(`[${lectureId}] Total chapters after merge: ${allChapters.length}`);

        // ========== Step 4: 강의 제목 생성 ==========
        // 첫 세그먼트 요약으로 제목 추출
        const titlePrompt = `
다음 강의의 전체 제목과 요약을 작성하세요.

챕터 목록:
${allChapters.map((ch, i) => `${i + 1}. ${ch.title} (${ch.startTime}~${ch.endTime})`).join('\n')}

JSON 형식으로 출력:
- title: 강의 전체 제목
- overview: 2-3문장 요약
        `;

        let lectureTitle = "강의";
        let lectureOverview = "";
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
                            overview: { type: Type.STRING }
                        },
                        required: ["title", "overview"]
                    }
                }
            });
            if (titleResp.text) {
                const titleJson = JSON.parse(titleResp.text.replace(/```json/g, '').replace(/```/g, '').trim());
                lectureTitle = titleJson.title || "강의";
                lectureOverview = titleJson.overview || "";
            }
        } catch (e) {
            console.error(`[${lectureId}] Title generation error:`, e.message);
        }

        // ========== Step 5: DB 저장 ==========
        await run(`INSERT INTO lectures (id, title, raw_text) VALUES (?, ?, ?)`,
            [lectureId, lectureTitle, transcript]);

        let chapterOrder = 0;
        for (const ch of allChapters) {
            const chId = `${lectureId}_${++chapterOrder}`;
            await run(`INSERT INTO chapters (id, lecture_id, chapter_number, title, status) VALUES (?, ?, ?, ?, ?)`,
                [chId, lectureId, chapterOrder, ch.title, 'pending']);
        }

        // ========== Step 6: 응답 ==========
        const scanJson = {
            title: lectureTitle,
            overview: lectureOverview,
            chapters: allChapters
        };

        res.json({ id: lectureId, title: lectureTitle, totalChapters: allChapters.length });

        // ========== Step 7: 백그라운드 Deep Dive ==========
        processLectureBackground(lectureId, scanJson, transcript).catch(console.error);

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

        res.json({ ...lecture, chapters: parsedChapters });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 5. 챕터 재생성 (피드백 반영)
app.post('/api/chapters/:id/regenerate', async (req, res) => {
    try {
        const { feedback } = req.body;
        const chapter = await get('SELECT * FROM chapters WHERE id = ?', [req.params.id]);
        if (!chapter || !chapter.detailed_note) return res.status(400).send("Chapter not ready for regeneration");

        const meta = JSON.parse(chapter.detailed_note);
        const lecture = await get('SELECT raw_text FROM lectures WHERE id = ?', [chapter.lecture_id]);

        const slice = extractSlice(lecture.raw_text, meta.startTime, meta.endTime);
        const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
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

// 4. PDF 다운로드
app.get('/api/lectures/:id/pdf', async (req, res) => {
    try {
        const lecture = await get(`SELECT title FROM lectures WHERE id = ?`, [req.params.id]);
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

        const noteForMd = {
            title: lecture.title,
            overview: "", // Overview 정보 부족 시 공란
            chapters: completedChapters
        };

        const markdown = generateMarkdown(noteForMd);
        const contentHtml = await marked.parse(markdown);
        const fullHtml = generateStyledPDFHtml(lecture.title, contentHtml);

        const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
        const page = await browser.newPage();
        await page.setContent(fullHtml, { waitUntil: 'networkidle0' });
        const pdfBuffer = await page.pdf({ format: 'A4', margin: { top: '20mm', bottom: '20mm', left: '20mm', right: '20mm' }, printBackground: true });
        await browser.close();

        res.set({
            'Content-Type': 'application/pdf',
            'Content-Length': pdfBuffer.length,
            'Content-Disposition': `attachment; filename="${encodeURIComponent(lecture.title)}.pdf"`
        });
        res.send(pdfBuffer);

    } catch (e) {
        console.error("PDF Export Error:", e);
        res.status(500).json({ error: e.message });
    }
});

// ==================== BACKGROUND PROCESS ====================
async function processLectureBackground(lectureId, initialScan, transcript) {
    console.log(`[${lectureId}] Background analysis started.`);

    // DB에서 챕터 목록 다시 조회 (ID 확보용)
    const chapters = await all(`SELECT * FROM chapters WHERE lecture_id = ? ORDER BY chapter_number`, [lectureId]);
    const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
    const ai = new GoogleGenAI({ apiKey });

    // 챕터별 시간 정보는 initialScan.chapters와 순서가 같다고 가정 (chapter_number 순)
    // initialScan 객체는 메모리에 있지만 DB에는 startTime, endTime 저장을 안 했으므로 여기서 매핑해야 함.
    // (개선: DB schema에 start_time, end_time 추가했어야 하나, 일단 initialScan을 씁니다)

    for (let i = 0; i < chapters.length; i++) {
        const dbChapter = chapters[i];
        const metaChapter = initialScan.chapters[i]; // 순서 일치 가정

        console.log(`[${lectureId}] Analyzing Ch ${dbChapter.chapter_number}: ${dbChapter.title}`);
        await run(`UPDATE chapters SET status = 'processing' WHERE id = ?`, [dbChapter.id]);

        try {
            // 텍스트 자르기
            const slice = extractSlice(transcript, metaChapter.startTime, metaChapter.endTime);
            // 너무 짧으면(slice가 비면) 전체에서 추정치로 자름 (fallback)
            const textToAnalyze = slice.length > 50 ? slice : transcript.substring(0, 10000); // 임시

            // Deep Dive Prompt - 스토리텔링 중심
            const prompt = `
당신은 강의 내용을 생생하게 전달하는 전문 에디터입니다.
강의 녹취록을 분석하여 마치 강의를 직접 듣는 것처럼 생동감 있는 학습 노트를 작성하세요.

## 챕터 정보
- 제목: ${dbChapter.title}
- 시간: ${metaChapter.startTime} ~ ${metaChapter.endTime}

## 핵심 작성 원칙

### ⚠️ 반드시 지켜야 할 것
1. **강사 인용을 본문에 직접 통합**: 각 섹션에 최소 1-2개의 강사 발언을 인용하고, 해당 타임스탬프를 표시
2. **구어체 보존**: 강사가 실제로 말한 표현을 살려서 인용 (예: "이게 핵심이에요", "여러분이 해보셔야 해요")
3. **맥락 연결**: 인용 후에는 왜 이 말이 중요한지, 어떤 의미인지 해석 추가
4. **스토리 흐름**: 강의가 어떻게 전개되었는지 시간순으로 자연스럽게 서술

### ❌ 하지 말 것
- "~합니다", "~입니다"로 끝나는 딱딱한 문체 (대신: "~한다", "~이다", "~했다" 등 사용)
- "온라인 강의의 성공은..." 같은 일반론 서술
- 강사 인용 없이 진행하는 것
- 교과서처럼 무미건조하게 정보만 나열

### 📝 narrative 작성 형식 (필수)

## 첫 번째 소제목

강사는 [주제]에 대해 이야기하며 강조했다.

> "강사의 실제 발언 인용" [MM:SS]

이 발언의 의미는... [해석과 맥락 설명]. **핵심 키워드**는 특히 중요한데...

## 두 번째 소제목

이어서 강사는 구체적인 예시를 들었다.

> "또 다른 인용문" [MM:SS]

실제로 이것이 의미하는 바는...

- 첫 번째 포인트
- 두 번째 포인트

### quotesWithTimeline
- narrative에 포함된 인용들을 여기에도 별도로 정리
- 최소 6개 이상, 구어체 그대로 인용

### keyTerms, keyPoints, practicalTips
- 강의에서 실제로 언급된 내용 기반으로 작성

## 분석할 텍스트:
${textToAnalyze}
            `;

            const resp = await ai.models.generateContent({
                model: "gemini-2.5-flash", // Pro model for better quality
                contents: [{ role: "user", parts: [{ text: prompt }] }],
                config: { responseMimeType: "application/json", responseSchema: CHAPTER_DEEP_DIVE_SCHEMA }
            });

            if (!resp.text) {
                throw new Error(`Gemini API returned empty response for chapter ${metaChapter.id}`);
            }
            const resultText = resp.text.replace(/```json/g, '').replace(/```/g, '').trim();
            const resultJson = JSON.parse(resultText);

            // 결과 병합 (메타데이터 포함)
            const fullData = {
                ...resultJson,
                id: metaChapter.id,
                title: metaChapter.title,
                startTime: metaChapter.startTime,
                endTime: metaChapter.endTime,
                duration: metaChapter.duration
            };

            // DB 업데이트
            await run(`UPDATE chapters SET 
                narrative = ?, 
                detailed_note = ?, 
                status = 'completed' 
                WHERE id = ?`,
                [resultJson.narrative, JSON.stringify(fullData), dbChapter.id]);

        } catch (err) {
            console.error(`[${lectureId}] Error on Ch ${dbChapter.chapter_number}:`, err);
            await run(`UPDATE chapters SET status = 'error' WHERE id = ?`, [dbChapter.id]);
        }
    }
    console.log(`[${lectureId}] Analysis finished.`);
}

// ========== Markdown Generator ==========
function generateMarkdown(note) {
    let md = `# ${note.title}\n\n`;
    if (note.overview) md += `> ${note.overview}\n\n`;

    if (note.chapters) {
        md += `---\n\n## 📋 목차\n\n`;
        note.chapters.forEach((ch, i) => {
            md += `${i + 1}. **${ch.title}**\n`;
        });
        md += `\n---\n\n`;

        note.chapters.forEach((ch, index) => {
            md += `# Chapter ${index + 1}: ${ch.title}\n\n`;
            if (ch.startTime) {
                md += `⏱️ **시간**: ${ch.startTime} ~ ${ch.endTime || ''}\n\n`;
            }
            // 핵심 메시지
            if (ch.keyMessage) {
                md += `💡 **핵심 메시지**: ${ch.keyMessage}\n\n`;
            }
            // 내용 (인용이 이미 통합되어 있음)
            if (ch.narrative) {
                md += `## 📝 내용\n\n${ch.narrative}\n\n`;
            }
            // 핵심 포인트
            if (ch.keyPoints && ch.keyPoints.length > 0) {
                md += `## 🔑 핵심 포인트\n`;
                ch.keyPoints.forEach(p => md += `- ${p}\n`);
                md += `\n`;
            }
            // 핵심 용어
            if (ch.keyTerms && ch.keyTerms.length > 0) {
                md += `## 📚 핵심 용어\n`;
                ch.keyTerms.forEach(t => {
                    md += `- **${t.term}**: ${t.definition}`;
                    if (t.example) md += ` _(예: ${t.example})_`;
                    md += `\n`;
                });
                md += `\n`;
            }
            // 실용 팁
            if (ch.practicalTips && ch.practicalTips.length > 0) {
                md += `## 💪 실용 팁\n`;
                ch.practicalTips.forEach(tip => md += `- ${tip}\n`);
                md += `\n`;
            }
        });
    }
    return md;
}

function generateStyledPDFHtml(title, contentHtml) {
    return `
<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <title>${title || 'Lecture Note'}</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;700&display=swap');
        body { font-family: 'Noto Sans KR', sans-serif; line-height: 1.7; color: #333; max-width: 800px; margin: 0 auto; padding: 40px; }
        h1 { font-size: 28px; border-bottom: 2px solid #333; padding-bottom: 15px; margin-bottom: 30px; }
        h2 { font-size: 22px; margin-top: 40px; margin-bottom: 15px; color: #111; border-left: 4px solid #4f46e5; padding-left: 12px; }
        h3 { font-size: 19px; margin-top: 30px; margin-bottom: 10px; color: #333; }
        p { margin-bottom: 15px; text-align: justify; }
        blockquote { background: #f8fafc; border-left: 4px solid #e2e8f0; padding: 15px 20px; margin: 20px 0; color: #475569; }
        ul { padding-left: 20px; margin-bottom: 15px; }
        li { margin-bottom: 8px; }
        hr { border: 0; border-top: 1px solid #e5e7eb; margin: 30px 0; }
    </style>
</head>
<body>
    ${contentHtml}
</body>
</html>
    `;
}

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
