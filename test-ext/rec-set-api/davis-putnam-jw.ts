/**
 * davis-putnam.ts
 * "Clean Architecture" Version.
 * Prioritizes readability, type safety, and clear abstraction over raw performance.
 */

import { RecursiveSet, Value } from './recursive-set';
import { Variable } from './propositional-logic-parser';
import { NNFNegation, Literal, Clause, CNF, getComplement } from './cnf';

// ============================================================================
// 1. HELPER FUNCTIONS (Clean & Simple)
// ============================================================================

/**
 * Extracts the variable name from a literal.
 */
function extractVariable(l: Literal): Variable {
    if (l instanceof NNFNegation) {
        return l.get(1) as string;
    }
    return l;
}

/**
 * Returns an arbitrary element from a set (for unit selection).
 */
function arb<T extends Value>(S: RecursiveSet<T>): T | null {
    if (S.isEmpty()) return null;
    return S.pickRandom() ?? null;
}

// ============================================================================
// 2. HEURISTICS (Jeroslow-Wang / DLIS)
// ============================================================================
/**
 * Selects a literal to branch on using the Jeroslow-Wang heuristic.
 * * Strategy:
 * Iterate over all unused variables. For each variable, calculate the score 
 * for its positive and negative literal by checking all clauses.
 * * J(l) = Sum( 2^(-|C|) ) for all C containing l.
 */
/**
 * Selects a literal to branch on using the Jeroslow-Wang heuristic.
 * * Strategy:
 * Iterate over all unused variables. For each variable, calculate the score 
 * for its positive and negative literal by checking all clauses.
 * * J(l) = Sum( 2^(-|C|) ) for all C containing l.
 */
function selectLiteral(
    Clauses: CNF,
    Variables: RecursiveSet<Variable>,
    UsedVars: RecursiveSet<Variable>
): Literal {
    let maxLiteral: Literal | null = null;
    let maxScore = -Infinity;

    // 1. Iterate over all variables (candidates)
    for (const v of Variables) {
        if (!UsedVars.has(v)){
            // Construct the two possible literals
            const pos: Literal = v;
            const neg: Literal = new NNFNegation(v);

            let posScore = 0;
            let negScore = 0;

            // 2. Iterate over all clauses to calculate the score (Inefficient but clear)
            for (const C of Clauses) {
                // Weight based on clause length
                const weight = Math.pow(2, -C.size);

                // Structural check: Is the literal in the clause?
                if (C.has(pos)) {
                    posScore += weight;
                }
                if (C.has(neg)) {
                    negScore += weight;
                }
            }

            // 3. Update Maximum
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

    // Fallback: If no literal was found (e.g. set empty), pick arbitrary one.
    if (maxLiteral === null) {
        // Find first unused variable as fallback
        for (const v of Variables) {
            if (!UsedVars.has(v)) return v;
        }
        return arb(Variables) as Literal; // Should never happen if Variables > UsedVars
    }

    return maxLiteral;
}

// ============================================================================
// 3. CORE LOGIC (The Teaching Part)
// ============================================================================



/**
 * Reduces the set of clauses based on the assumption that literal `l` is true.
 * Applies:
 * 1. Unit Subsumption (Clause contains l -> Clause is True -> Remove Clause)
 * 2. Unit Cut (Clause contains ¬l -> ¬l is False -> Remove ¬l from Clause)
 */
function reduce(Clauses: CNF, l: Literal): CNF {
    const lBar = getComplement(l);
    const result = new RecursiveSet<Clause>();

    for (const clause of Clauses) {
        // TEACHING POINT: 
        // We rely on clause.has() using the correct hashCode/equals of the Tuple class.
        // No manual checking needed!
        
        if (clause.has(l)) {
            // Subsumption: Clause satisfied. Drop it.
            continue; 
        }

        if (clause.has(lBar)) {
            // Unit Cut: Remove the falsified literal.
            // Since our Sets are mutable, we must clone first.
            const newClause = clause.clone() as Clause;
            newClause.remove(lBar);
            result.add(newClause);
        } else {
            // Clause unaffected. Keep it.
            result.add(clause);
        }
    }

    // Add {l} as a fact to the result (Unit Propagation history)
    const unitClause = new RecursiveSet<Literal>(l);
    result.add(unitClause);

    return result as CNF;
}

/**
 * Repeatedly applies Unit Propagation until no new units are found.
 */
function saturate(Clauses: CNF): CNF {
    let S = Clauses;
    const UsedUnits = new RecursiveSet<Clause>();

    while (true) {
        // Find all unit clauses {l}
        const Units = new RecursiveSet<Clause>();
        for (const C of S) {
            if (C.size === 1 && !UsedUnits.has(C)) {
                Units.add(C);
            }
        }

        if (Units.isEmpty()) break;

        // Pick one unit and propagate
        const unitClause = arb(Units)!;
        UsedUnits.add(unitClause);

        const l = arb(unitClause)!;
        S = reduce(S, l);
    }
    return S;
}

/**
 * The recursive DPLL function.
 */
function solveRecursive(
    Clauses: CNF,
    Variables: RecursiveSet<Variable>,
    UsedVars: RecursiveSet<Variable>
): CNF {
    // 1. Propagation
    const S = saturate(Clauses);

    // 2. Check for Contradiction (Empty Clause {{}})
    const EmptyClause = new RecursiveSet<Literal>();
    if (S.has(EmptyClause)) {
        const Falsum = new RecursiveSet<Clause>();
        Falsum.add(EmptyClause);
        return Falsum as CNF;
    }

    // 3. Check for Solution (All clauses are units)
    let allUnits = true;
    for (const C of S) {
        if (C.size !== 1) {
            allUnits = false;
            break;
        }
    }
    if (allUnits) return S;

    // 4. Branching
    const l = selectLiteral(S, Variables, UsedVars);
    const lBar = getComplement(l);
    const v = extractVariable(l);

    const nextUsedVars = UsedVars.clone();
    nextUsedVars.add(v);

    // Branch A: Assume l is True
    const unitL = new RecursiveSet<Clause>(new RecursiveSet<Literal>(l));
    const ResA = solveRecursive(S.union(unitL) as CNF, Variables, nextUsedVars);
    
    if (!ResA.has(EmptyClause)) return ResA;

    // Branch B: Assume l is False (lBar is True)
    const unitLBar = new RecursiveSet<Clause>(new RecursiveSet<Literal>(lBar));
    return solveRecursive(S.union(unitLBar) as CNF, Variables, nextUsedVars);
}

// ============================================================================
// 4. MAIN EXPORT
// ============================================================================

export function solve(Clauses: CNF): CNF {
    // Extract all variables for the heuristic
    const Variables = new RecursiveSet<Variable>();
    for (const C of Clauses) {
        for (const lit of C) {
            Variables.add(extractVariable(lit));
        }
    }
    const UsedVars = new RecursiveSet<Variable>();
    
    return solveRecursive(Clauses, Variables, UsedVars);
}

// ============================================================================
// 5. OUTPUT UTILS
// ============================================================================

export function prettify(Clauses: CNF): string {
    const sorted = Array.from(Clauses).sort((a,b) => RecursiveSet.compare(a, b));
    return `{${sorted.map(c => c.toString()).join(', ')}}`;
}

function literal_to_str(C: Clause): string {
    const val = arb(C);
    if (!val) return "{}";
    
    if (val instanceof NNFNegation) {
        return `${val.get(1)} ↦ False`;
    } else {
        return `${val} ↦ True`;
    }
}

export function toString(S: CNF, Simplified: CNF): string {
    const EmptyClause = new RecursiveSet<Literal>();
    if (Simplified.has(EmptyClause)) return "UNSAT";

    const parts: string[] = [];
    const sorted = Array.from(Simplified).sort((a,b) => RecursiveSet.compare(a, b));
    
    for (const C of sorted) {
        parts.push(literal_to_str(C));
    }
    return '{ ' + parts.join(', ') + ' }';
}