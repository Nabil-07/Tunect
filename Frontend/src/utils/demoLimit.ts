export function hasUsedDemoForTutor(tutorId: string): boolean {
  try { return localStorage.getItem(`demo:tutor:${tutorId}`) === '1'; } catch { return false; }
}
export function markDemoUsed(tutorId: string): void {
  try { localStorage.setItem(`demo:tutor:${tutorId}`, '1'); } catch {}
}
