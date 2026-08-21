/**
 * Stable ledger keys for lyrics generation spend/refund.
 * Persist the request id on MusicGeneration.clientRequestId so status/fail
 * paths can refund the original spend without reading current prices.
 */
export function buildLyricsSpendKey(lyricsRequestId: string): string {
  return `lyrics:${lyricsRequestId}:spend`;
}

export function buildLyricsRefundKey(lyricsRequestId: string): string {
  return `lyrics:${lyricsRequestId}:refund`;
}
