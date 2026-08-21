export interface TimedLyricsLine {
  startSec: number;
  endSec: number;
  text: string;
}

export interface TimedLyricsWord {
  text: string;
  startSec: number;
  endSec: number;
}

export interface TimedLyricsPayload {
  lines: TimedLyricsLine[];
  words?: TimedLyricsWord[];
}

export interface TimedLyricsDisplayLine {
  startSec: number;
  endSec: number;
  words: TimedLyricsWord[];
}

export interface TimedLyricsResponseDto {
  lines: TimedLyricsLine[];
  words?: TimedLyricsWord[];
  cached: boolean;
}
