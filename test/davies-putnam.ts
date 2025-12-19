import { RecursiveSet } from '../src/index';

/**
 * Davis-Putnam-Logemann-Loveland (DPLL) SAT Solver.
 * 
 * Logic adapted from Karl Stroetmann.
 * Optimized for RecursiveSet v4.0 with manual inlining for speed.
 */

export type Variable = string;
export type Literal = Variable | ['¬', Variable];
export type Clause = RecursiveSet<Literal>;

// === Helper Functions (Inlined Logic) ===

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

/**
 * Fast specialized equality check for Literals.
 * Faster than generic RecursiveSet.compare() because it skips type checks.
 */
function sameLiteral(a: Literal, b: Literal): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a[1] === b[1]; // We know [0] is '¬'
  }
  return a === b;
}

export function arb<T>(S: RecursiveSet<T>): T | null {
  for (const x of S) {
    return x;
  }
  return null;
}

// === Jereslow-Wang Heuristic ===

export function selectLiteral(
  Clauses: RecursiveSet<Clause>,
  Variables: RecursiveSet<Variable>,
  UsedVars: RecursiveSet<Variable>
): Literal {
  // Optimization: Direct iterator access is O(1) vs Array.from O(N)
  let maxLiteral: Literal = Variables[Symbol.iterator]().next().value ?? 'x';
  let maxScore = -Infinity;

  for (const variable of Variables) {
    if (!UsedVars.has(variable)) {
      const pos: Literal = variable;
      const neg: Literal = ['¬', variable];
      let posScore = 0;
      let negScore = 0;
      
      // Calculate J(l) = Sum(2^(-|C|)) for l in C
      for (const clause of Clauses) {
        const size = clause.size;
        
        // Fast scan through clause (Hot Path!)
        for (const lit of clause) {
          // Manual inline check instead of generic compare
          if (!Array.isArray(lit) && lit === variable) {
            posScore += Math.pow(2, -size);
          } else if (Array.isArray(lit) && lit[1] === variable) {
            negScore += Math.pow(2, -size);
          }
        }
      }

      if (posScore > maxScore) {
        maxScore = posScore;
        maxLiteral = pos;
      }
      if (negScore > maxScore) {
        maxScore = negScore;
        maxLiteral = neg;
      }
    }
  }
  return maxLiteral;
}

// === DPLL Logic ===

export function reduce(Clauses: RecursiveSet<Clause>, l: Literal): RecursiveSet<Clause> {
  const lBar = complement(l);
  const result = new RecursiveSet<Clause>();

  for (const clause of Clauses) {
    let hasL = false;
    let hasLBar = false;

    for (const lit of clause) {
      if (sameLiteral(lit, l)) hasL = true;
      if (sameLiteral(lit, lBar)) hasLBar = true;
    }

    if (hasLBar) {
      // Remove ¬l from clause (Unit Propagation logic)
      const newClause = new RecursiveSet<Literal>();
      for (const lit of clause) {
        if (!sameLiteral(lit, lBar)) {
          newClause.add(lit);
        }
      }
      result.add(newClause);
    } else if (!hasL) {
      // Keep clause as is
      result.add(clause);
    }
    // If hasL is true, the clause is satisfied -> dropped
  }

  // Add the unit clause {l} to represent the assignment
  const unitClause = new RecursiveSet<Literal>();
  unitClause.add(l);
  result.add(unitClause);
  
  return result;
}

export function saturate(Clauses: RecursiveSet<Clause>): RecursiveSet<Clause> {
  let S = Clauses;
  const Used = new RecursiveSet<Clause>();
  
  while (true) {
    const Units = new RecursiveSet<Clause>();
    for (const clause of S) {
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
    if (l) S = reduce(S, l);
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
  
  // Contradiction found?
  if (S.has(EmptyClause)) {
    const Falsum = new RecursiveSet<Clause>();
    Falsum.add(EmptyClause);
    return Falsum;
  }
  
  // Check if all clauses are units (Solution found)
  let allUnits = true;
  for (const C of S) {
    if (C.size !== 1) {
      allUnits = false;
      break;
    }
  }
  if (allUnits) {
    return S;
  }

  // Branching Step
  const l = selectLiteral(S, Variables, UsedVars);
  const lBar = complement(l);
  const p = extractVariable(l);
  const nextUsedVars = UsedVars.union(new RecursiveSet<Variable>(p));

  // Branch 1: Try adding {l}
  const unitL = new RecursiveSet<Clause>();
  const cL = new RecursiveSet<Literal>();
  cL.add(l);
  unitL.add(cL);
  
  const Result1 = solveRecursive(S.union(unitL), Variables, nextUsedVars);
  if (!Result1.has(EmptyClause)) {
    return Result1;
  }

  // Branch 2: Try adding {¬l}
  const unitLBar = new RecursiveSet<Clause>();
  const cLBar = new RecursiveSet<Literal>();
  cLBar.add(lBar);
  unitLBar.add(cLBar);
  
  return solveRecursive(S.union(unitLBar), Variables, nextUsedVars);
}

export function solve(Clauses: RecursiveSet<Clause>): RecursiveSet<Clause> {
  const Variables = new RecursiveSet<Variable>();
  // Extract all variables from clauses
  for (const clause of Clauses) {
    for (const lit of clause) {
      Variables.add(extractVariable(lit));
    }
  }
  
  const UsedVars = new RecursiveSet<Variable>();
  return solveRecursive(Clauses, Variables, UsedVars);
}
