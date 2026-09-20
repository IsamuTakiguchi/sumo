/** トラックの識別子。crypto.randomUUID が無い環境のための控えも用意しておく */
export function createTrackId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `t_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e9).toString(36)}`;
}
