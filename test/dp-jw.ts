import { RecursiveSet, Value } from '../src/strict-tree';

export type Variable = string;
export type Literal = Variable | ['¬', Variable];
export type Clause = RecursiveSet<Literal>;

export function complement(l: Literal): Literal {
  if (Array.isArray(l)) {
    return l[1];
  } else {
    return ['¬', l];
  }
}

export function extractVariable(l: Literal): Variable {
  if (Array.isArray(l)) {
    return l[1];
  } else {
    return l;
  }
}

function sameLiteral(a: Literal, b: Literal): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a[0] === '¬' && b[0] === '¬' && a[1] === b[1];
  }
  return !Array.isArray(a) && !Array.isArray(b) && a === b;
}

function arb<T extends Value>(S: RecursiveSet<T>): T | null {
    if (S.isEmpty()) {
        return null;
    }
    return S.pickRandom();
}

export function selectLiteral(
  Clauses: RecursiveSet<Clause>,
  Variables: RecursiveSet<Variable>,
  UsedVars: RecursiveSet<Variable>
): Literal {
  // Cache weight by clause size
  const weightCache = new Map<number, number>();

  // Scores: variable -> [posScore, negScore]
  const scores = new Map<Variable, [number, number]>();

  for (const clause of Clauses) {
    const size = clause.size;
    let w = weightCache.get(size);
    if (w === undefined) {
      w = Math.pow(2, -size);
      weightCache.set(size, w);
    }

    for (const lit of clause) {
      if (Array.isArray(lit)) {
        const v = lit[1];
        const s = scores.get(v) ?? [0, 0];
        s[1] += w; // neg
        scores.set(v, s);
      } else {
        const v = lit;
        const s = scores.get(v) ?? [0, 0];
        s[0] += w; // pos
        scores.set(v, s);
      }
    }
  }

  // pick best literal among unused vars
  let bestVar: Variable | null = null;
  let bestIsNeg = false;
  let bestScore = -Infinity;

  for (const v of Variables) {
    if (UsedVars.has(v)) continue;
    const [pos, neg] = scores.get(v) ?? [0, 0];
    if (pos > bestScore) { bestScore = pos; bestVar = v; bestIsNeg = false; }
    if (neg > bestScore) { bestScore = neg; bestVar = v; bestIsNeg = true; }
  }

  if (bestVar === null) return Array.from(Variables)[0] ?? 'x';
  return bestIsNeg ? ['¬', bestVar] : bestVar;
}


export function reduce(Clauses: RecursiveSet<Clause>, l: Literal): RecursiveSet<Clause> {
  const lBar = complement(l);

  const out: Clause[] = [];

  for (const clause of Clauses) {
    let satisfied = false;
    let removedAny = false;
    const kept: Literal[] = [];

    for (const lit of clause) {
      if (sameLiteral(lit, l)) {
        satisfied = true;           // clause is true -> drop it
        break;
      }
      if (sameLiteral(lit, lBar)) {
        removedAny = true;          // drop complement
        continue;
      }
      kept.push(lit);
    }

    if (satisfied) continue;
    if (removedAny) out.push(RecursiveSet.fromArray(kept) as Clause);
    else out.push(clause);
  }

  // add unit clause {l}
  out.push(RecursiveSet.fromArray([l]) as Clause);

  return RecursiveSet.fromArray(out);
}


export function saturate(Clauses: RecursiveSet<Clause>): RecursiveSet<Clause> {
  let S = Clauses;
  const Used = new RecursiveSet<Clause>();
  while (true) {
    const Units = new RecursiveSet<Clause>();
    for (const C of S) {
      const clause = C as Clause;
      if (clause.size === 1 && !Used.has(clause)) {
        Units.add(clause);
      }
    }
    if (Units.isEmpty()) {
      break;
    }
    const unit = arb(Units) as Clause;
    Used.add(unit);
    const l = arb(unit) as Literal;
    S = reduce(S, l);
  }
  return S;
}

export function solveRecursive(
  Clauses: RecursiveSet<Clause>,
  Variables: RecursiveSet<Variable>,
  UsedVars: RecursiveSet<Variable>
): RecursiveSet<Clause> {
  const S = saturate(Clauses);
  const EmptyClause = new RecursiveSet<Literal>();
  if (S.has(EmptyClause)) {
    const Falsum = new RecursiveSet<Clause>();
    Falsum.add(EmptyClause);
    return Falsum;
  }
  let allUnits = true;
  for (const C of S) {
    if ((C as Clause).size !== 1) {
      allUnits = false;
      break;
    }
  }
  if (allUnits) {
    return S;
  }
  const l = selectLiteral(S, Variables, UsedVars);
  const lBar = complement(l);
  const p = extractVariable(l);
  const nextUsedVars = UsedVars.union(new RecursiveSet<Variable>(p));
  const unitL = new RecursiveSet<Clause>();
  const cL = new RecursiveSet<Literal>();
  cL.add(l);
  unitL.add(cL);
  const Result1 = solveRecursive(S.union(unitL), Variables, nextUsedVars);
  if (!Result1.has(EmptyClause)) {
    return Result1;
  }
  const unitLBar = new RecursiveSet<Clause>();
  const cLBar = new RecursiveSet<Literal>();
  cLBar.add(lBar);
  unitLBar.add(cLBar);
  return solveRecursive(S.union(unitLBar), Variables, nextUsedVars);
}

export function solve(Clauses: RecursiveSet<Clause>): RecursiveSet<Clause> {
  const Variables = new RecursiveSet<Variable>();
  for (const clause of Clauses) {
    for (const lit of clause) {
      Variables.add(extractVariable(lit));
    }
  }
  const UsedVars = new RecursiveSet<Variable>();
  return solveRecursive(Clauses, Variables, UsedVars);
}

export function literal_to_str(C: Clause): string {
  const val = arb(C);
  if (val === null) return "{}";
  const l = val as Literal;
  if (Array.isArray(l)) {
    return `${l[1]} ↦ False`;
  } else {
    return `${l} ↦ True`;
  }
}

export function prettify(Clauses: RecursiveSet<Clause>): string {
  const res: string[] = [];
  for (const C of Clauses) res.push(C.toString());
  return `{${res.join(', ')}}`;
}

export function toString(S: RecursiveSet<Clause>, Simplified: RecursiveSet<Clause>): string {
  const EmptyClause = new RecursiveSet<Literal>();
  if (Simplified.has(EmptyClause)) {
    return `${prettify(S)} is unsolvable`;
  }
  const parts: string[] = [];
  for (const C of Simplified) {
    parts.push(literal_to_str(C as Clause));
  }
  return '{ ' + parts.join(', ') + ' }';
}