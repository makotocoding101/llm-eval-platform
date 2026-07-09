// Human-vs-judge agreement computation for spot checks. Pure functions so the
// CLI's math is testable without a database.

export interface AgreementEntry {
  criterion: string;
  judgeModel: string; // api_name of the judge that produced the score
  judgeScore: number;
  humanScore: number;
}

export interface AgreementStats {
  n: number;
  /** Fraction of entries where human == judge (0..1). */
  exactRate: number;
  /** Fraction of entries where |judge - human| <= 1 (0..1). */
  within1Rate: number;
  meanAbsDiff: number;
  /** Mean of (judge - human): positive = judge more lenient than the human. */
  meanSignedDiff: number;
}

export interface AgreementReport {
  /** Null when there are no entries. */
  overall: AgreementStats | null;
  byCriterion: Record<string, AgreementStats>;
  byJudgeModel: Record<string, AgreementStats>;
}

const EPSILON = 1e-9;

function statsOf(entries: AgreementEntry[]): AgreementStats {
  let exact = 0;
  let within1 = 0;
  let absSum = 0;
  let signedSum = 0;
  for (const e of entries) {
    const diff = e.judgeScore - e.humanScore;
    if (Math.abs(diff) < EPSILON) exact++;
    if (Math.abs(diff) <= 1 + EPSILON) within1++;
    absSum += Math.abs(diff);
    signedSum += diff;
  }
  const n = entries.length;
  return {
    n,
    exactRate: exact / n,
    within1Rate: within1 / n,
    meanAbsDiff: absSum / n,
    meanSignedDiff: signedSum / n,
  };
}

function groupBy(entries: AgreementEntry[], key: (e: AgreementEntry) => string) {
  const groups = new Map<string, AgreementEntry[]>();
  for (const e of entries) {
    const k = key(e);
    const group = groups.get(k);
    if (group) group.push(e);
    else groups.set(k, [e]);
  }
  const result: Record<string, AgreementStats> = {};
  for (const [k, group] of groups) result[k] = statsOf(group);
  return result;
}

export function computeAgreement(entries: AgreementEntry[]): AgreementReport {
  return {
    overall: entries.length === 0 ? null : statsOf(entries),
    byCriterion: groupBy(entries, (e) => e.criterion),
    byJudgeModel: groupBy(entries, (e) => e.judgeModel),
  };
}
