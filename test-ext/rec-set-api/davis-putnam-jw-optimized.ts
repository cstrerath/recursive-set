/**
 * dp-jw.ts
 * Davis-Putnam Solver with Jeroslow-Wang (Two-Sided) Heuristic.
 * Optimized for Hash/Tuple Architecture.
 */

import { RecursiveSet, Value } from './recursive-set';
import { Variable } from './propositional-logic-parser';
import { NNFNegation, Literal, Clause, CNF } from './cnf';

// --- Helpers ---

/**
 * Computes the complement of a literal l.
 */
function complement(l: Literal): Literal {
  if (l instanceof NNFNegation) {
    return l.get(1) as string;
  } else {
    return new NNFNegation(l);
  }
}

/**
 * Extracts the variable from the literal l.
 */
function extractVariable(l: Literal): Variable {
  if (l instanceof NNFNegation) {
    return l.get(1) as string;
  } else {
    return l;
  }
}

/**
 * Returns an arbitrary element from the set S.
 * Uses O(1) pickRandom.
 */
function arb<T extends Value>(S: RecursiveSet<T>): T | null {
  if (S.isEmpty()) return null;
  return S.pickRandom() ?? null;
}

// --- Jeroslow-Wang Heuristic ---

/**
 * Selects the literal with the highest impact based on clause length weights.
 * J(l) = Sum(2^(-|C|)) for all C containing l.
 */
function selectLiteral(
    Clauses: CNF,
    Variables: RecursiveSet<Variable>,
    UsedVars: RecursiveSet<Variable>
): Literal {
    // 1. Calculate Scores for all literals in active clauses
    // Optimization: We use a Map to store scores dynamically
    // Keys: Variable string. Values: [posScore, negScore]
    const scores = new Map<Variable, [number, number]>();
    
    // Pre-calc powers of 2 for speed
    const weights = new Float64Array(500);
    for(let i=0; i<500; i++) weights[i] = Math.pow(2, -i);

    for (const C of Clauses) {
        const size = C.size;
        const w = size < 500 ? weights[size] : Math.pow(2, -size);

        for (const lit of C) {
            if (lit instanceof NNFNegation) {
                const v = lit.get(1) as string;
                const s = scores.get(v);
                if (s) s[1] += w;
                else scores.set(v, [0, w]);
            } else {
                const v = lit as string;
                const s = scores.get(v);
                if (s) s[0] += w;
                else scores.set(v, [w, 0]);
            }
        }
    }

    // 2. Find Max Score among UNUSED variables
    let maxLiteral: Literal | null = null;
    let maxScore = -Infinity;

    // Iterate over computed scores (implicitly filters vars not in clauses)
    for (const [v, [pos, neg]] of scores) {
        if (UsedVars.has(v)) continue;

        if (pos > maxScore) {
            maxScore = pos;
            maxLiteral = v;
        }
        if (neg > maxScore) {
            maxScore = neg;
            maxLiteral = new NNFNegation(v);
        }
    }

    // Fallback if no score found (e.g. disconnected variables or empty set)
    if (maxLiteral === null) {
        // Try to find ANY unused variable
        for (const v of Variables) {
            if (!UsedVars.has(v)) return v;
        }
        // Should not happen if check logic is correct
        return arb(Variables) as Literal;
    }

    return maxLiteral;
}

// --- Core Logic ---

function reduce(Clauses: CNF, l: Literal): CNF {
    const lBar = complement(l);
    const resultClauses: Clause[] = [];

    // Optimization check constants
    const isLBarTuple = lBar instanceof NNFNegation;
    const lBarVal = isLBarTuple ? (lBar as NNFNegation).get(1) : lBar;

    for (const clause of Clauses) {
        // Check if clause contains lBar (Unit Cut)
        // Optimized manual check to avoid object creation overhead in loop
        let hasLBar = false;
        let hasL = false;

        for(const lit of clause) {
            // Check lBar
            if (lit === lBar) hasLBar = true;
            else if (isLBarTuple && (lit instanceof NNFNegation) && lit.get(1) === lBarVal) hasLBar = true;
            
            // Check l (Subsumption)
            if (lit === l) hasL = true; // Strict equality works for string and Tuple reference if from same set logic
            // Safety deep check if instances differ but content same
            else if ((lit instanceof NNFNegation) && (l instanceof NNFNegation) && lit.get(1) === l.get(1)) hasL = true;
        }

        if (hasL) {
            continue; // Subsumption: Clause satisfied
        }

        if (hasLBar) {
            // Cut: Remove lBar
            const keptLiterals: Literal[] = [];
            for (const lit of clause) {
                // Check inequality to lBar
                let isLBar = (lit === lBar);
                if (!isLBar && isLBarTuple && (lit instanceof NNFNegation)) {
                    isLBar = (lit.get(1) === lBarVal);
                }
                
                if (!isLBar) {
                    keptLiterals.push(lit);
                }
            }
            resultClauses.push(new RecursiveSet(...keptLiterals));
        } else {
            // Keep clause as is
            resultClauses.push(clause);
        }
    }

    // Add unit clause {l}
    resultClauses.push(new RecursiveSet(l));

    return new RecursiveSet(...resultClauses);
}

function saturate(Clauses: CNF): CNF {
  let S = Clauses;
  const Used = new RecursiveSet<Clause>();
  
  while (true) {
    const Units = new RecursiveSet<Clause>();
    for (const C of S) {
      if (C.size === 1 && !Used.has(C)) {
        Units.add(C);
      }
    }
    
    if (Units.isEmpty()) {
      break;
    }
    
    const unit = arb(Units)!;
    Used.add(unit);
    const l = arb(unit)!;
    S = reduce(S, l);
  }
  return S;
}

function solveRecursive(
  Clauses: CNF,
  Variables: RecursiveSet<Variable>,
  UsedVars: RecursiveSet<Variable>
): CNF {
  const S = saturate(Clauses);
  
  // Check for empty clause (contradiction)
  const EmptyClause = new RecursiveSet<Literal>();
  
  if (S.has(EmptyClause)) {
    const Falsum = new RecursiveSet<Clause>();
    Falsum.add(EmptyClause);
    return Falsum as CNF;
  }

  // Check if all clauses are units (Solution Found)
  let allUnits = true;
  for (const C of S) {
    if (C.size !== 1) {
      allUnits = false;
      break;
    }
  }
  if (allUnits) return S;

  // Branching using JW Heuristic
  const l = selectLiteral(S, Variables, UsedVars);
  const lBar = complement(l);
  const p = extractVariable(l);
  
  const nextUsedVars = UsedVars.clone();
  nextUsedVars.add(p);

  // Branch 1: Set l to True
  const unitL = new RecursiveSet<Clause>();
  const cL = new RecursiveSet<Literal>();
  cL.add(l);
  unitL.add(cL);
  
  const Result1 = solveRecursive(S.union(unitL) as CNF, Variables, nextUsedVars);
  if (!Result1.has(EmptyClause)) {
    return Result1;
  }

  // Branch 2: Set lBar to True
  const unitLBar = new RecursiveSet<Clause>();
  const cLBar = new RecursiveSet<Literal>();
  cLBar.add(lBar);
  unitLBar.add(cLBar);
  
  return solveRecursive(S.union(unitLBar) as CNF, Variables, nextUsedVars);
}

// --- Main Export ---

export function solve(Clauses: CNF): CNF {
  const Variables = new RecursiveSet<Variable>();
  for (const clause of Clauses) {
    for (const lit of clause) {
      Variables.add(extractVariable(lit));
    }
  }
  const UsedVars = new RecursiveSet<Variable>();
  return solveRecursive(Clauses, Variables, UsedVars);
}

// --- Visualization ---

function literal_to_str(C: Clause): string {
  const val = arb(C);
  if (val === null) return "{}";
  const l = val;

  if (l instanceof NNFNegation) {
    return `${l.get(1)} ↦ False`;
  } else {
    return `${l} ↦ True`;
  }
}

export function prettify(Clauses: CNF): string {
    // Sort for deterministic output
    const res: string[] = [];
    const sorted = Array.from(Clauses).sort((a,b) => RecursiveSet.compare(a,b));
    for (const C of sorted) res.push(C.toString());
    return `{${res.join(', ')}}`;
}

export function toString(S: CNF, Simplified: CNF): string {
  const EmptyClause = new RecursiveSet<Literal>();
  
  if (Simplified.has(EmptyClause)) {
    return `UNSAT`;
  }

  const parts: string[] = [];
  const sortedClauses = Array.from(Simplified).sort((a,b) => RecursiveSet.compare(a, b));
  
  for (const C of sortedClauses) {
    parts.push(literal_to_str(C));
  }
  return '{ ' + parts.join(', ') + ' }';
}