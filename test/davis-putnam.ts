import { RecursiveSet } from '../src/strict-tree';

/**
 * @module davies-putnam
 * @description
 * High-Performance Davis-Putnam-Logemann-Loveland (DPLL) SAT Solver.
 * Optimized for RecursiveSet v7.0.0 (Integer Mode).
 */

// ============================================================================
// TYPES
// ============================================================================

/** Integer representing a variable (e.g., 1, 2, 3). */
export type Variable = number;

/** Integer representing a literal (e.g., 1 for x, -1 for NOT x). */
export type Literal = number;

/** A set of literals representing a disjunction (OR). */
export type Clause = RecursiveSet<Literal>;

/** A set of clauses representing a conjunction (AND) - Conjunctive Normal Form. */
export type CNF = RecursiveSet<Clause>;

// ============================================================================
// UTILITIES
// ============================================================================

/** Returns the complement of a literal (-l). */
export function complement(l: Literal): Literal { return -l; }

/** Extracts the variable ID from a literal (absolute value). */
export function extractVariable(l: Literal): Variable { return Math.abs(l); }

/** Returns an arbitrary element from a set, or null if empty. */
export function arb<T extends number | RecursiveSet<any>>(S: RecursiveSet<T>): T | null {
    if (S.isEmpty()) return null;
    return S.raw[0];
}

/**
 * Heuristic for selecting the next branching literal.
 * Uses a scoring system based on occurrence frequency (DLIS - Dynamic Largest Individual Sum).
 */
export function selectLiteral(Clauses: CNF, Variables: RecursiveSet<Variable>, UsedVars: RecursiveSet<Variable>): Literal {
  let maxLiteral: Literal = 1;
  let maxScore = -Infinity;
  const varsRaw = Variables.raw;
  const lenV = varsRaw.length;
  const clausesRaw = Clauses.raw;
  const lenC = clausesRaw.length;

  for (let i = 0; i < lenV; i++) {
    const v = varsRaw[i];
    if (UsedVars.has(v)) continue;

    let posScore = 0;
    let negScore = 0;
    const pos = v;
    const neg = -v;

    // Linear scan for scoring (Hot Path)
    for (let j = 0; j < lenC; j++) {
        const c = clausesRaw[j];
        // Note: linear scan inside clause is fast for small sets (average clause size < 5)
        if (c.has(pos)) posScore += Math.pow(2, -c.raw.length);
        else if (c.has(neg)) negScore += Math.pow(2, -c.raw.length);
    }
    if (posScore > maxScore) { maxScore = posScore; maxLiteral = pos; }
    if (negScore > maxScore) { maxScore = negScore; maxLiteral = neg; }
  }
  return maxLiteral;
}

// ============================================================================
// CORE ALGORITHMS (High Performance)
// ============================================================================

/**
 * Simplifies the CNF based on the assumption that literal `l` is TRUE.
 * 1. Removes clauses containing `l` (they are satisfied).
 * 2. Removes `-l` from remaining clauses (it cannot be true).
 * * *Performance Note:* Uses fast array filtering and bulk loading (O(N log N)) 
 * instead of iterative set mutation.
 */
export function reduce(Clauses: CNF, l: Literal): CNF {
  const lBar = -l;
  
  // Use a raw array to collect results.
  // This avoids O(N^2) insertion sort behavior.
  const resultRaw: Clause[] = [];
  
  const clausesRaw = Clauses.raw;
  const len = clausesRaw.length;

  for (let i = 0; i < len; i++) {
    const clause = clausesRaw[i];
    
    // If clause contains l, it is satisfied -> Skip.
    if (clause.has(l)) continue;

    if (clause.has(lBar)) {
        // Unit Propagation: Remove lBar.
        // Optimization: Filtering a sorted array preserves order!
        const oldLits = clause.raw;
        const newLits: Literal[] = [];
        const oldLen = oldLits.length;
        for (let j = 0; j < oldLen; j++) {
            const lit = oldLits[j];
            if (lit !== lBar) newLits.push(lit);
        }
        // Created efficiently without re-sorting using UNSAFE bypass
        resultRaw.push(RecursiveSet.fromSortedUnsafe(newLits));
    } else {
        resultRaw.push(clause);
    }
  }

  // Add the unit clause representing the assignment
  const unitClause = RecursiveSet.fromSortedUnsafe([l]);
  resultRaw.push(unitClause);

  // Bulk Load: Sorts ONCE at the end. O(N log N).
  return RecursiveSet.fromArray(resultRaw);
}

/**
 * Iteratively applies Unit Propagation until no unit clauses remain.
 * @returns The simplified (saturated) CNF.
 */
export function saturate(Clauses: CNF): CNF {
  let S = Clauses;
  const Used = new RecursiveSet<Clause>();
  
  while (true) {
    // Find unit clauses efficiently (linear scan over sorted raw array)
    let unit: Clause | null = null;
    const sRaw = S.raw;
    const len = sRaw.length;
    
    for (let i = 0; i < len; i++) {
        const c = sRaw[i];
        if (c.size === 1 && !Used.has(c)) {
            unit = c;
            break; // Pick the first one we find
        }
    }
    
    if (!unit) break;
    
    Used.add(unit); 
    const l = unit.raw[0];
    S = reduce(S, l);
  }
  return S;
}

/**
 * Recursive DPLL Solver Step.
 */
export function solveRecursive(
  Clauses: CNF,
  Variables: RecursiveSet<Variable>,
  UsedVars: RecursiveSet<Variable>
): CNF {
  const S = saturate(Clauses);
  
  // Fast check for Empty clause (UNSAT condition)
  const sRaw = S.raw;
  for (let i = 0; i < sRaw.length; i++) {
      if (sRaw[i].size === 0) {
          // Found empty clause -> UNSAT
          return RecursiveSet.fromSortedUnsafe([sRaw[i]]); 
      }
  }
  
  // Check if all are units (SAT condition)
  let allUnits = true;
  for (let i = 0; i < sRaw.length; i++) {
      if (sRaw[i].size !== 1) { allUnits = false; break; }
  }
  if (allUnits) return S;

  // Branching Step
  const l = selectLiteral(S, Variables, UsedVars);
  const lBar = -l;
  const p = Math.abs(l);
  const nextUsedVars = UsedVars.union(RecursiveSet.fromSortedUnsafe([p]));

  // Branch 1: Positive Assignment
  const unitL = RecursiveSet.fromSortedUnsafe([RecursiveSet.fromSortedUnsafe([l])]);
  const Res1 = solveRecursive(S.union(unitL), Variables, nextUsedVars);
  
  // Fast check for empty clause in result without constructing new objects
  let hasEmpty = false;
  const res1Raw = Res1.raw;
  for(let i=0; i<res1Raw.length; i++) {
      if (res1Raw[i].size === 0) { hasEmpty = true; break; }
  }
  
  if (!hasEmpty) return Res1;

  // Branch 2: Negative Assignment (Backtracking)
  const unitLBar = RecursiveSet.fromSortedUnsafe([RecursiveSet.fromSortedUnsafe([lBar])]);
  return solveRecursive(S.union(unitLBar), Variables, nextUsedVars);
}

/**
 * Main Solver Entry Point.
 * @param Clauses - The problem definition in CNF.
 * @returns A set of unit clauses representing the solution, or a set containing an empty clause if UNSAT.
 */
export function solve(Clauses: CNF): CNF {
  const VariablesRaw: Variable[] = [];
  const clausesRaw = Clauses.raw;
  // Use a temporary JS Set to dedup variables efficiently O(N)
  const varSet = new Set<number>();
  
  for (let i = 0; i < clausesRaw.length; i++) {
      const lits = clausesRaw[i].raw;
      for (let j = 0; j < lits.length; j++) {
          varSet.add(Math.abs(lits[j]));
      }
  }
  
  return solveRecursive(Clauses, RecursiveSet.fromArray([...varSet]), new RecursiveSet<Variable>());
}
