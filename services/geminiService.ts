import { Chapter } from "../types";

export const performInitialScan = async (transcript: string): Promise<any> => {
  const response = await fetch('http://localhost:3000/api/analyze', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ transcript }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to perform initial scan');
  }

  return response.json();
};

export const performChapterDeepDive = async (
  chapterTitle: string,
  transcriptSlice: string,
  chapterInfo?: Partial<Chapter>
): Promise<any> => {
  const response = await fetch('http://localhost:3000/api/deep-dive', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      chapterTitle,
      transcriptSlice,
      chapterInfo
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to perform deep dive');
  }

  return response.json();
};
