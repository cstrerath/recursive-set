import { LogicParser, Formula, Variable, Constant, Negation, BinaryFormula } from './propositional-logic-parser';
import { RecursiveSet } from './recursive-set';

// ============================================================================
// 1. Strict NNF Classes
// ============================================================================

/** * Strict Negation for NNF: Can ONLY wrap a Variable.
 * Extends the Tuple-based Negation class.
 */
export class NNFNegation extends Negation {
    constructor(v: Variable) {
        super(v);
    }
}

/** Strict Conjunction (AND) for NNF */
export class NNFConjunction extends BinaryFormula {
    constructor(left: NNF, right: NNF) {
        super('∧', left, right);
    }
}

/** Strict Disjunction (OR) for NNF */
export class NNFDisjunction extends BinaryFormula {
    constructor(left: NNF, right: NNF) {
        super('∨', left, right);
    }
}

// ============================================================================
// 2. Types
// ============================================================================

// An NNF formula is valid if it is one of these specific types.
export type NNF = Variable | Constant | NNFNegation | NNFConjunction | NNFDisjunction;

// A Literal in NNF is either a raw Variable or a strictly negated Variable.
export type Literal = Variable | NNFNegation;
export type Clause = RecursiveSet<Literal>;
export type CNF = RecursiveSet<Clause>;

// ============================================================================
// 3. Conversion Logic
// ============================================================================

export function parse(s: string): Formula {
    return new LogicParser(s).parse();
}



/**
 * Eliminates ↔ and ⊕.
 * A ↔ B  => (A → B) ∧ (B → A)
 * A ⊕ B  => (A ∨ B) ∧ (¬A ∨ ¬B)
 */
function eliminateBiconditional(f: Formula): Formula {
    if (typeof f === 'string') return f;
    if (f instanceof Constant) return f;
    
    if (f instanceof Negation) {
        // Clean getter access
        return new Negation(eliminateBiconditional(f.phi));
    }
    
    if (f instanceof BinaryFormula) {
        const op = f.operator;
        const l = eliminateBiconditional(f.left);
        const r = eliminateBiconditional(f.right);
        
        if (op === '↔') {
            // (L → R) ∧ (R → L)
            return new BinaryFormula('∧', 
                new BinaryFormula('→', l, r), 
                new BinaryFormula('→', r, l)
            );
        }

        if (op === '⊕') {
            // (L ∨ R) ∧ (¬L ∨ ¬R)
            return new BinaryFormula('∧',
                new BinaryFormula('∨', l, r),
                new BinaryFormula('∨', new Negation(l), new Negation(r))
            );
        }

        return new BinaryFormula(op, l, r);
    }
    throw new Error("Unknown formula type");
}

/**
 * Eliminates → by converting A → B to ¬A ∨ B.
 */
function eliminateConditional(f: Formula): Formula {
    if (typeof f === 'string') return f;
    if (f instanceof Constant) return f;
    
    if (f instanceof Negation) {
        return new Negation(eliminateConditional(f.phi));
    }
    
    if (f instanceof BinaryFormula) {
        const op = f.operator;
        const l = eliminateConditional(f.left);
        const r = eliminateConditional(f.right);
        
        if (op === '→') {
            // ¬L ∨ R
            return new BinaryFormula('∨', new Negation(l), r);
        }
        return new BinaryFormula(op, l, r);
    }
    return f;
}



/**
 * Converts formula to Negation Normal Form (NNF).
 * Pushes negations inwards until they hit variables.
 */
function nnf(f: Formula): NNF {
    if (typeof f === 'string') return f; 
    if (f instanceof Constant) return f; 
    
    if (f instanceof Negation) {
        return neg(f.phi);
    }
    
    if (f instanceof BinaryFormula) {
        const op = f.operator;
        
        if (op === '∧') return new NNFConjunction(nnf(f.left), nnf(f.right));
        if (op === '∨') return new NNFDisjunction(nnf(f.left), nnf(f.right));
        
        throw new Error(`Operator ${op} should have been eliminated`);
    }
    throw new Error("Unknown formula type");
}

/** * Helper: Computes NNF of ¬f using De Morgan's Laws. 
 */
function neg(f: Formula): NNF {
    // ¬Variable -> NNFNegation
    if (typeof f === 'string') {
        return new NNFNegation(f);
    }
    // ¬Constant -> Flip Truth Value
    if (f instanceof Constant) {
        return new Constant(f.value === '⊤' ? '⊥' : '⊤');
    }
    // ¬(¬A) -> A (Double Negation)
    if (f instanceof Negation) {
        return nnf(f.phi);
    }
    // De Morgan
    if (f instanceof BinaryFormula) {
        const op = f.operator;
        
        // ¬(A ∧ B) -> ¬A ∨ ¬B
        if (op === '∧') return new NNFDisjunction(neg(f.left), neg(f.right));
        // ¬(A ∨ B) -> ¬A ∧ ¬B
        if (op === '∨') return new NNFConjunction(neg(f.left), neg(f.right));
    }
    throw new Error("Unexpected formula in neg()");
}

/**
 * Converts NNF to Conjunctive Normal Form (CNF).
 */
function cnf(f: NNF): CNF {
    // Case 1: Variable -> {{A}}
    if (typeof f === 'string') {
        const clause = new RecursiveSet<Literal>();
        clause.add(f);
        const result = new RecursiveSet<Clause>();
        result.add(clause);
        return result;
    }
    
    // Case 2: Literal Negation -> {{¬A}}
    if (f instanceof NNFNegation) {
        const clause = new RecursiveSet<Literal>();
        clause.add(f);
        const result = new RecursiveSet<Clause>();
        result.add(clause);
        return result;
    }
    
    // Case 3: Constant
    if (f instanceof Constant) {
        if (f.value === '⊤') return new RecursiveSet<Clause>(); // Empty set of clauses (True)
        
        // False: Set containing empty clause {{}}
        const emptyClause = new RecursiveSet<Literal>();
        const result = new RecursiveSet<Clause>();
        result.add(emptyClause);
        return result;
    }
    
    // Case 4: Conjunction (AND) -> Union of sets
    // CNF(A ∧ B) = CNF(A) ∪ CNF(B)
    if (f instanceof NNFConjunction) {
        const left = cnf(f.left as NNF);
        const right = cnf(f.right as NNF);
        return left.union(right) as CNF;
    }
    
    // Case 5: Disjunction (OR) -> Distributivity
    // CNF(A ∨ B) = { C1 ∪ C2 | C1 ∈ CNF(A), C2 ∈ CNF(B) }
    if (f instanceof NNFDisjunction) {
        const left = cnf(f.left as NNF);
        const right = cnf(f.right as NNF);
        
        const result = new RecursiveSet<Clause>();
        // Cartesian-like product but creating Unions of Clauses
        for (const c1 of left) {
            for (const c2 of right) {
                const unionClause = c1.union(c2) as Clause;
                result.add(unionClause);
            }
        }
        return result;
    }
    throw new Error("Unknown NNF type");
}

// ============================================================================
// 4. Cleanup & API
// ============================================================================

export function getComplement(l: Literal): Literal {
    if (typeof l === 'string') return new NNFNegation(l);
    // Safe because Literal can only be Variable (string) or NNFNegation
    return l.phi as Variable; 
}

function isTrivial(clause: Clause): boolean {
    for (const lit of clause) {
        const comp = getComplement(lit);
        if (clause.has(comp)) return true;
    }
    return false;
}

/**
 * Removes trivial clauses (those containing A and ¬A).
 */
function simplify(clauses: CNF): CNF {
    const result = new RecursiveSet<Clause>();
    for (const clause of clauses) {
        if (!isTrivial(clause)) result.add(clause);
    }
    return result;
}

/**
 * Main pipeline: Formula -> CNF
 */
export function normalize(f: Formula): CNF {
    const n1 = eliminateBiconditional(f);
    const n2 = eliminateConditional(n1);
    const n3 = nnf(n2);
    const n4 = cnf(n3);
    return simplify(n4);
}

export function prettify(M: CNF): string {
    return M.toString();
}