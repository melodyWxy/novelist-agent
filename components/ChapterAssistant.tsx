'use client';

import { AIAssistantPanel } from './AIAssistantPanel';

interface Props {
  novelId: string;
  chapterNumber: number;
}

export function ChapterAssistant({ novelId, chapterNumber }: Props) {
  return (
    <AIAssistantPanel
      novelId={novelId}
      scope="chapter"
      chapterNumber={chapterNumber}
      className="assistant-panel-chapter"
    />
  );
}
