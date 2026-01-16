
import { VTTLine } from "../types";

export const parseVTT = (content: string): VTTLine[] => {
  const lines = content.split(/\r?\n/);
  const result: VTTLine[] = [];
  let current: Partial<VTTLine> = {};

  const timeRegex = /(\d{2}:\d{2}:\d{2}\.\d{3}) --> (\d{2}:\d{2}:\d{2}\.\d{3})/;

  // VTT 헤더 체크 (단순 텍스트와 구분하기 위함)
  const isVTT = lines[0]?.includes("WEBVTT");

  if (!isVTT && !content.includes("-->")) {
    return parseRawText(content);
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line === "WEBVTT") continue;

    const match = line.match(timeRegex);
    if (match) {
      current.start = match[1];
      current.end = match[2];
      current.text = "";
    } else if (current.start) {
      if (/^\d+$/.test(line) && !current.text) continue;
      current.text = current.text ? `${current.text} ${line}` : line;
      
      const nextLine = lines[i + 1]?.trim();
      if (!nextLine || timeRegex.test(nextLine)) {
        result.push(current as VTTLine);
        current = {};
      }
    }
  }

  return result.length > 0 ? result : parseRawText(content);
};

export const parseRawText = (content: string): VTTLine[] => {
  // 타임스탬프가 없는 경우 문단 단위로 쪼개어 가상 라인 생성
  const paragraphs = content.split(/\n\s*\n/);
  return paragraphs
    .filter(p => p.trim())
    .map((p, idx) => ({
      start: "", // 타임라인 없음
      end: "",
      text: p.trim()
    }));
};

export const vttToText = (lines: VTTLine[]): string => {
  return lines.map(l => l.start ? `[${l.start}] ${l.text}` : l.text).join('\n');
};
