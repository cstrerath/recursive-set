/**
 * davis-putnam.ts
 * Implements the Davis-Putnam algorithm with Hash-Sets and Tuple-based Literals.
 */

import { RecursiveSet, Value } from './recursive-set';
import { Variable } from './propositional-logic-parser';
import { NNFNegation, Literal, Clause, CNF } from './cnf'; 

// --- Helper Functions ---

/**
 * Computes the complement of a literal l.
 * complement(p) = ¬p (wrapped in NNFNegation Tuple)
 * complement(¬p) = p
 */
function complement(l: Literal): Literal {
  if (l instanceof NNFNegation) {
    // l is ¬p (Tuple), return p (index 1)
    return l.get(1) as string;
  } else {
    // l is p (string), return ¬p
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
 * Uses O(1) random access from the Hash Map implementation.
 */
function arb<T extends Value>(S: RecursiveSet<T>): T | null {
  return S.pickRandom() ?? null;
}

/**
 * Selects a variable to branch on.
 * Strategy: Try to find a random unused variable quickly (Heuristic),
 * fallback to linear scan if the set is dense.
 */
function selectVariable(
  Variables: RecursiveSet<Variable>,
  UsedVars: RecursiveSet<Variable>
): Variable | null {
  // 1. Fast Path: Random Guessing (O(1))
  for (let i = 0; i < 10; i++) {
      const candidate = Variables.pickRandom();
      if (candidate && !UsedVars.has(candidate)) {
          return candidate;
      }
  }

  // 2. Slow Path: Linear Scan (O(N))
  // Iterate to find any unused variable
  for (const candidate of Variables) {
      if (!UsedVars.has(candidate)) {
          return candidate;
      }
  }    
  return null;
}

// --- Core Logic ---

function reduce(Clauses: CNF, l: Literal): CNF {
  const lBar = complement(l);
  const result = new RecursiveSet<Clause>();
  
  for (const clause of Clauses) {
    if (clause.has(lBar)) {
      // Unit cut: Remove lBar from the clause
      // Important: clone() first, because remove() modifies in-place!
      const newClause = clause.clone() as Clause;
      newClause.remove(lBar);
      result.add(newClause);
    } else if (!clause.has(l)) {
      // Unit subsumption: If clause has l, it is satisfied -> skip.
      // If NOT, keep it.
      result.add(clause);
    }
  }
  
  // Add the unit clause {l} back to result
  const unitClause = new RecursiveSet<Literal>();
  unitClause.add(l);
  result.add(unitClause);
  
  return result as CNF;
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
    
    // Use arb() as requested by lecturer style
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
  
  // Check for empty clause (Contradiction)
  const EmptyClause = new RecursiveSet<Literal>();
  
  if (S.has(EmptyClause)) {
    // Return { {} } (Falsum)
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

  // Branching
  const p = selectVariable(Variables, UsedVars);
  if (!p) return S; // Should not happen

  const nextUsedVars = UsedVars.union(new RecursiveSet<Variable>(p)) as RecursiveSet<Variable>;

  // Branch 1: assume p is true -> add clause {p}
  const unitP = new RecursiveSet<Clause>();
  const cP = new RecursiveSet<Literal>();
  cP.add(p);
  unitP.add(cP);
  
  const Result1 = solveRecursive(S.union(unitP) as CNF, Variables, nextUsedVars);
  if (!Result1.has(EmptyClause)) {
    return Result1;
  }

  // Branch 2: assume p is false -> add clause {¬p}
  const unitNotP = new RecursiveSet<Clause>();
  const cNotP = new RecursiveSet<Literal>();
  cNotP.add(new NNFNegation(p));
  unitNotP.add(cNotP);
  
  return solveRecursive(S.union(unitNotP) as CNF, Variables, nextUsedVars);
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