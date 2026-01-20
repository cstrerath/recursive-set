/**
 * davis-putnam.ts
 * * Implements the Davis-Putnam algorithm using strict Tuple types.
 */

import { RecursiveSet, Tuple, Value } from '../src/hash';

// --- Type Definitions ---

export type Variable = string;

// NEU: Tuple statt Array
// Literal ist entweder der String 'A' oder das Tuple ('¬', 'A')
export type Literal = Variable | Tuple<['¬', Variable]>;

export type Clause = RecursiveSet<Literal>;

// --- Helper Functions ---

/**
 * Computes the complement of a literal l.
 * complement(p) = ('¬', p)
 * complement(('¬', p)) = p
 */
export function complement(l: Literal): Literal {
  if (l instanceof Tuple) {
    // Es ist ein Tuple ('¬', Var). Wir holen das zweite Element (Index 1).
    // Da wir Strict Typing haben, wissen wir, dass Index 1 die Variable ist.
    return l.get(1) as Variable;
  } else {
    // Es ist eine Variable p. Wir bauen ein Tuple ('¬', p).
    return new Tuple('¬', l);
  }
}

/**
 * Extracts the variable from the literal l.
 */
export function extractVariable(l: Literal): Variable {
  if (l instanceof Tuple) {
    return l.get(1) as Variable;
  } else {
    return l;
  }
}

/**
 * Returns an arbitrary element from the set S.
 */
function arb<T extends Value>(S: RecursiveSet<T>): T | undefined {
    return S.pickRandom();
}

/**
 * Selects an arbitrary variable from the set Variables that does not occur in the set UsedVars.
 */
export function selectVariable(
  Variables: RecursiveSet<Variable>,
  UsedVars: RecursiveSet<Variable>
): Variable | null {
    // 1. Fast Path (Heuristic)
    for (let i = 0; i < 10; i++) {
        const candidate = Variables.pickRandom();
        if (candidate && !UsedVars.has(candidate)) {
            return candidate;
        }
    }

    // 2. Deterministic Fallback
    for (const candidate of Variables) {
        if (!UsedVars.has(candidate)) {
            return candidate;
        }
    }    
    return null;
}

// --- Core Logic ---

/**
 * Performs unit cuts and unit subsumptions using unit clause {l}.
 */
export function reduce(Clauses: RecursiveSet<Clause>, l: Literal): RecursiveSet<Clause> {
  const lBar = complement(l);
  const result = new RecursiveSet<Clause>();

  for (const clause of Clauses) {
    if (clause.has(lBar)) {
      // Unit Cut: Remove ¬l from clause
      // In-Place Mutation auf Klon (Hash-Set kompatibel)
      const newClause = clause.clone();
      newClause.remove(lBar); 
      result.add(newClause);
    } else if (!clause.has(l)) {
      // Subsumption: Wenn l enthalten ist, fliegt die ganze Klausel raus (ist wahr).
      // Wenn l NICHT enthalten ist, bleibt sie unverändert.
      result.add(clause);
    }
  }

  // Unit-Clause {l} muss erhalten bleiben (für DPLL Korrektheit in dieser Variante)
  const unitClause = new RecursiveSet<Literal>();
  unitClause.add(l);
  result.add(unitClause);
  
  return result;
}

/**
 * Computes the set of clauses derived from Clauses via repeated unit cuts/subsumptions.
 */
export function saturate(Clauses: RecursiveSet<Clause>): RecursiveSet<Clause> {
  let S = Clauses;
  const Used = new RecursiveSet<Clause>();
  
  while (true) {
    const Units = new RecursiveSet<Clause>();
    for (const C of S) {
      // Wir casten explizit, da Iterator Value liefert
      const clause = C as Clause;
      if (clause.size === 1 && !Used.has(clause)) {
        Units.add(clause);
      }
    }
    
    if (Units.isEmpty()) {
      break;
    }
    
    // Nimm irgendeine Unit Clause
    const unit = arb(Units) as Clause;
    Used.add(unit);
    
    // Extrahiere das Literal aus der Unit Clause {l}
    const l = arb(unit) as Literal;
    S = reduce(S, l);
  }
  return S;
}

/**
 * Recursive helper for the Davis-Putnam algorithm.
 */
export function solveRecursive(
  Clauses: RecursiveSet<Clause>,
  Variables: RecursiveSet<Variable>,
  UsedVars: RecursiveSet<Variable>
): RecursiveSet<Clause> {
  const S = saturate(Clauses);
  const EmptyClause = new RecursiveSet<Literal>();

  // S is inconsistent (contains empty set) -> Return {{}} (Falsum)
  if (S.has(EmptyClause)) {
    const Falsum = new RecursiveSet<Clause>();
    Falsum.add(EmptyClause);
    return Falsum;
  }

  // S is trivial (contains only unit clauses) -> Solution found
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

  // Select branching variable
  const p = selectVariable(Variables, UsedVars) as Variable;
  
  // Update UsedVars
  // Performance-Tipp: Copy-On-Write ist sicherer als Union bei Rekursion
  const nextUsedVars = UsedVars.union(new RecursiveSet<Variable>(p));

  // Branch 1: Assume p is True -> Add Unit Clause {p}
  const unitP = new RecursiveSet<Clause>();
  const cP = new RecursiveSet<Literal>();
  cP.add(p);
  unitP.add(cP);
  
  const Result1 = solveRecursive(S.union(unitP), Variables, nextUsedVars);
  if (!Result1.has(EmptyClause)) {
    return Result1;
  }

  // Branch 2: Assume p is False -> Add Unit Clause {¬p}
  const unitNotP = new RecursiveSet<Clause>();
  const cNotP = new RecursiveSet<Literal>();
  // NEU: Tuple statt Array
  cNotP.add(new Tuple('¬', p));
  unitNotP.add(cNotP);
  
  return solveRecursive(S.union(unitNotP), Variables, nextUsedVars);
}

/**
 * Main entry point for the Davis-Putnam solver.
 */
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

// --- Formatting / Output ---

export function literal_to_str(C: Clause): string {
  const val = arb(C);
  if (val === null) return "{}";
  const l = val as Literal;

  if (l instanceof Tuple) {
    return `${l.get(1)} ↦ False`;
  } else {
    return `${l} ↦ True`;
  }
}

export function prettify(Clauses: RecursiveSet<Clause>): string {
  const res: string[] = [];
  // Wir sortieren für deterministischen Output, auch wenn Sets unsortiert sind
  const sorted = Array.from(Clauses).sort((a,b) => RecursiveSet.compare(a, b));
  for (const C of sorted) res.push(C.toString());
  return `{${res.join(', ')}}`;
}

export function toString(S: RecursiveSet<Clause>, Simplified: RecursiveSet<Clause>): string {
  const EmptyClause = new RecursiveSet<Literal>();
  if (Simplified.has(EmptyClause)) {
    return `Formula is unsolvable`;
  }

  const parts: string[] = [];
  // Sortiere Output für Lesbarkeit
  const sorted = Array.from(Simplified).sort((a,b) => RecursiveSet.compare(a, b));
  
  for (const C of sorted) {
    parts.push(literal_to_str(C as Clause));
  }
  return '{ ' + parts.join(', ') + ' }';
}