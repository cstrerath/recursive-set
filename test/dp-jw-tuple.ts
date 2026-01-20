/**
 * davis-putnam.ts
 * Implements the Davis-Putnam algorithm using strict Tuple types instead of Arrays.
 */

import { RecursiveSet, Tuple, Value } from '../src/hash';

// --- Type Definitions ---

export type Variable = string;
// UPDATE: Literal ist Variable ODER Tuple (statt Array)
export type Literal = Variable | Tuple<['¬', Variable]>;
export type Clause = RecursiveSet<Literal>;

// --- Helper Functions ---

export function complement(l: Literal): Literal {
  if (l instanceof Tuple) {
    // Es ist ('¬', Var) -> Rückgabe Var
    return l.get(1) as Variable;
  }
  // Es ist Var -> Rückgabe ('¬', Var)
  return new Tuple('¬', l);
}

export function extractVariable(l: Literal): Variable {
  if (l instanceof Tuple) {
    return l.get(1) as Variable;
  }
  return l;
}

// Hilfsfunktion: Schneller Zugriff auf das erste Element (O(1) in Hash-Set)
function pickFirst<T extends Value>(S: RecursiveSet<T>): T | null {
    for (const val of S) {
        return val;
    }
    return null;
}

// --- Heuristics ---

export function selectLiteral(
  Clauses: RecursiveSet<Clause>,
  Variables: RecursiveSet<Variable>,
  UsedVars: RecursiveSet<Variable>
): Literal {
  // DLIS (Dynamic Largest Individual Sum) Heuristic
  // Scores: variable -> [posScore, negScore]
  const scores = new Map<Variable, [number, number]>();

  // Weight Cache: Pre-calculate powers of 2
  const weightCache = new Float64Array(100); 
  for(let i=0; i<100; i++) weightCache[i] = Math.pow(2, -i);

  for (const clause of Clauses) {
    const size = clause.size;
    const w = size < 100 ? weightCache[size] : Math.pow(2, -size);

    for (const lit of clause) {
      if (lit instanceof Tuple) {
        // Negative Literal ('¬', v)
        const v = lit.get(1) as Variable;
        const s = scores.get(v);
        if (s) s[1] += w;
        else scores.set(v, [0, w]);
      } else {
        // Positive Literal v
        const v = lit as Variable;
        const s = scores.get(v);
        if (s) s[0] += w;
        else scores.set(v, [w, 0]);
      }
    }
  }

  // Pick best literal among UNUSED variables
  let bestVar: Variable | null = null;
  let bestIsNeg = false;
  let bestScore = -1;

  for (const [v, [pos, neg]] of scores) {
      if (UsedVars.has(v)) continue;
      
      if (pos > bestScore) { bestScore = pos; bestVar = v; bestIsNeg = false; }
      if (neg > bestScore) { bestScore = neg; bestVar = v; bestIsNeg = true; }
  }

  if (bestVar === null) {
      // Fallback
      for(const v of Variables) {
          if (!UsedVars.has(v)) return v;
      }
      return 'x';
  }
  
  // UPDATE: Tuple Konstruktor statt Array Literal
  return bestIsNeg ? new Tuple('¬', bestVar) : bestVar;
}

export function reduce(Clauses: RecursiveSet<Clause>, l: Literal): RecursiveSet<Clause> {
  const lBar = complement(l);
  
  // Wir sammeln die Klauseln in einem Array, um Resizing im Set zu minimieren
  const outClauses: Clause[] = [];

  // OPTIMIERUNG: Constants für den Hot-Loop extrahieren
  const isLTuple = l instanceof Tuple;
  // TypeScript Cast: Wir wissen, dass es Variable ist, wenn wir get(1) machen
  const lVal = isLTuple ? (l as Tuple<any>).get(1) : l;
  
  const isLBarTuple = lBar instanceof Tuple;
  const lBarVal = isLBarTuple ? (lBar as Tuple<any>).get(1) : lBar;

  for (const clause of Clauses) {
    let satisfied = false;
    let removedAny = false;
    const keptLiterals: Literal[] = [];

    // Inner Loop: Literals in Clause
    for (const lit of clause) {
      // 1. Check Satisfied (lit === l)
      // Direkter Vergleich (Referenz oder Primitiv)
      if (lit === l) { satisfied = true; break; } 
      
      // Falls Referenzen unterschiedlich sind (verschiedene Tuple Instanzen), aber Inhalt gleich:
      if ((lit instanceof Tuple) && isLTuple && (lit.get(1) === lVal)) {
          satisfied = true; break;
      }

      // 2. Check Removed (lit === lBar)
      let matchLBar = false;
      if (lit === lBar) matchLBar = true;
      else if ((lit instanceof Tuple) && isLBarTuple && (lit.get(1) === lBarVal)) matchLBar = true;

      if (matchLBar) {
        removedAny = true;
        continue; // Skip this literal (Cut)
      }

      keptLiterals.push(lit);
    }

    if (satisfied) continue; // Subsumption: Klausel ist wahr, fliegt raus

    if (removedAny) {
        // Unit Cut performed: Create new Clause from kept literals
        outClauses.push(new RecursiveSet(...keptLiterals));
    } else {
        // Klausel unverändert übernehmen
        outClauses.push(clause);
    }
  }

  // Unit Propagation: Füge {l} als Fakt hinzu
  const unitClause = new RecursiveSet<Literal>(l);
  outClauses.push(unitClause);

  // Erzeuge resultierendes Set
  return new RecursiveSet(...outClauses);
}

export function saturate(Clauses: RecursiveSet<Clause>): RecursiveSet<Clause> {
  let S = Clauses;
  const UsedUnits = new RecursiveSet<Clause>(); 
  
  while (true) {
    let unitClause: Clause | null = null;
    
    // Find Unit Clause O(N)
    for (const C of S) {
        if (C.size === 1 && !UsedUnits.has(C)) {
            unitClause = C;
            break; 
        }
    }

    if (!unitClause) break;

    UsedUnits.add(unitClause);
    const l = pickFirst(unitClause) as Literal; 
    S = reduce(S, l);
  }
  return S;
}

export function solveRecursive(
  Clauses: RecursiveSet<Clause>,
  Variables: RecursiveSet<Variable>,
  UsedVars: RecursiveSet<Variable>
): RecursiveSet<Clause> {
  
  // 1. Saturate (Unit Propagation)
  const S = saturate(Clauses);
  const EmptyClause = new RecursiveSet<Literal>();
  
  // Conflict Check
  if (S.has(EmptyClause)) {
     return new RecursiveSet(EmptyClause); // Return { {} }
  }

  // Solution Check
  let allUnits = true;
  for (const C of S) {
    if (C.size !== 1) { allUnits = false; break; }
  }
  if (allUnits) return S;

  // 2. Branching (Heuristic)
  const l = selectLiteral(S, Variables, UsedVars);
  const lBar = complement(l);
  const p = extractVariable(l);
  
  // Update UsedVars (Copy-On-Write)
  const nextUsedVars = UsedVars.clone();
  nextUsedVars.add(p);

  // Branch 1: Assume l is True -> S + {l}
  const S_plus_l = S.clone();
  S_plus_l.add(new RecursiveSet(l)); 

  const Result1 = solveRecursive(S_plus_l, Variables, nextUsedVars);
  if (!Result1.has(EmptyClause)) return Result1;

  // Branch 2: Assume l is False (lBar is True) -> S + {lBar}
  const S_plus_lBar = S.clone();
  S_plus_lBar.add(new RecursiveSet(lBar));

  return solveRecursive(S_plus_lBar, Variables, nextUsedVars);
}

// --- Main Export ---

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

// --- Debug / Output ---

function arb<T extends Value>(S: RecursiveSet<T>): T | null {
    if (S.isEmpty()) return null;
    return S.pickRandom() ?? null;
}

export function literal_to_str(C: Clause): string {
  const val = arb(C);
  if (val === null) return "{}";
  const l = val as Literal;
  
  if (l instanceof Tuple) {
    // Tuple ('¬', Var)
    return `${l.get(1)} ↦ False`;
  } else {
    // Variable
    return `${l} ↦ True`;
  }
}

export function prettify(Clauses: RecursiveSet<Clause>): string {
  const res: string[] = [];
  // Sortiere Output für Determinismus
  const sorted = Array.from(Clauses).sort((a,b) => RecursiveSet.compare(a,b));
  
  for (const C of sorted) res.push(C.toString());
  return `{${res.join(', ')}}`;
}

export function toString(S: RecursiveSet<Clause>, Simplified: RecursiveSet<Clause>): string {
  const EmptyClause = new RecursiveSet<Literal>();
  if (Simplified.has(EmptyClause)) {
    return `UNSAT`;
  }
  const parts: string[] = [];
  for (const C of Simplified) {
    parts.push(literal_to_str(C));
  }
  return '{ ' + parts.join(', ') + ' }';
}