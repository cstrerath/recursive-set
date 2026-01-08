import { RecursiveSet } from '../src/index'; 
import * as DP from './davis-putnam';

/**
 * @file N-Queens SAT Solver Example
 * @description
 * Generates CNF constraints for the N-Queens problem and solves them using DPLL.
 * * **Encoding:**
 * - Variables are encoded as 32-bit Integers: `(Row << 16) | Col`.
 * - Literals are Integers: Positive for TRUE, Negative for FALSE (NOT).
 * - Clauses are Sets of Literals (Disjunctions).
 * - CNF is a Set of Clauses (Conjunction).
 */

// ============================================================================
// TYPES (Integer Optimization)
// ============================================================================

type Variable = number; 
type Literal = number; 
type Clause = RecursiveSet<Literal>;
type CNF = RecursiveSet<Clause>;

// ============================================================================
// ENCODING LOGIC (Bit Packing)
// ============================================================================

/**
 * Packs Row and Column into a single unique 32-bit integer.
 * Limits: Row and Col must be < 65535.
 */
function encode(row: number, col: number): Variable {
    // High 16 bits = Row, Low 16 bits = Col
    return (row << 16) | col;
}

/**
 * Unpacks an integer variable back into [Row, Col].
 */
function decode(val: Variable): [number, number] {
    const v = Math.abs(val); // Handle potential negative literals safely
    return [v >> 16, v & 0xFFFF];
}

/**
 * Formats a variable for display (e.g., "Q<1,1>").
 */
function formatVar(val: Variable): string {
    const [r, c] = decode(val);
    return `Q<${r},${c}>`;
}

// ============================================================================
// CONSTRAINT GENERATORS
// ============================================================================

/**
 * Returns a set of clauses ensuring at most one variable in S is true.
 * Logic: Pairwise mutex. For every pair (A, B), add clause (NOT A or NOT B).
 * Complexity: O(|S|^2) clauses.
 */
function atMostOne(S: RecursiveSet<Variable>): CNF {
    const result = new RecursiveSet<Clause>();
    
    // Convert to array for indexed access (Fast Iteration)
    const vars: Variable[] = [];
    for (const v of S) vars.push(v);
    
    const len = vars.length;
    for (let i = 0; i < len; i++) {
        for (let j = i + 1; j < len; j++) {
            const p = vars[i];
            const q = vars[j];

            // Clause: ¬p V ¬q  =>  {-p, -q}
            const clause = new RecursiveSet<Literal>();
            clause.add(-p);
            clause.add(-q);

            result.add(clause);
        }
    }
    return result;
}

function atMostOneInRow(row: number, n: number): CNF {
    const varsInRow = new RecursiveSet<Variable>();
    for (let col = 1; col <= n; col++) {
        varsInRow.add(encode(row, col));
    }
    return atMostOne(varsInRow);
}

function oneInColumn(col: number, n: number): CNF {
    // "At least one in column": (A or B or C...)
    const clause = new RecursiveSet<Literal>();
    for (let row = 1; row <= n; row++) {
        clause.add(encode(row, col));
    }
    
    const result = new RecursiveSet<Clause>();
    result.add(clause);
    return result;
}

function atMostOneInFallingDiagonal(k: number, n: number): CNF {
    const varsInDiag = new RecursiveSet<Variable>();
    for (let row = 1; row <= n; row++) {
        for (let col = 1; col <= n; col++) {
            if (row - col === k) {
                varsInDiag.add(encode(row, col));
            }
        }
    }
    return atMostOne(varsInDiag);
}

function atMostOneInRisingDiagonal(k: number, n: number): CNF {
    const varsInDiag = new RecursiveSet<Variable>();
    for (let row = 1; row <= n; row++) {
        for (let col = 1; col <= n; col++) {
            if (row + col === k) {
                varsInDiag.add(encode(row, col));
            }
        }
    }
    return atMostOne(varsInDiag);
}

/**
 * Generates all CNF constraints for the N-Queens problem.
 */
function allClauses(n: number): CNF {
    // Collect groups of clauses in an array first to minimize Union operations
    const collection: CNF[] = [];

    // 1. Row Constraints
    for (let row = 1; row <= n; row++) {
        collection.push(atMostOneInRow(row, n));
    }

    // 2. Rising Diagonals
    for (let k = 3; k <= 2 * n; k++) {
        collection.push(atMostOneInRisingDiagonal(k, n));
    }

    // 3. Falling Diagonals
    for (let k = -(n - 2); k <= n - 2; k++) {
        collection.push(atMostOneInFallingDiagonal(k, n));
    }

    // 4. Column Constraints (At least one)
    for (let col = 1; col <= n; col++) {
        collection.push(oneInColumn(col, n));
    }

    // Merge all clause sets efficiently
    let result = new RecursiveSet<Clause>();
    for (const group of collection) {
        // Efficient O(N+M) union thanks to RecursiveSet optimization
        result = result.union(group);
    }
    return result;
}

// ============================================================================
// SOLVER WRAPPER
// ============================================================================

function queens(n: number): CNF | null {
    console.log(`Generating clauses for ${n} queens (Integer Mode)...`);
    const clauses = allClauses(n);
    console.log(`Generated ${clauses.size} clauses.`);
    
    console.log("Starting Davis-Putnam solver...");
    const solution = DP.solve(clauses);
    
    const emptyClause = new RecursiveSet<Literal>();
    if (solution.has(emptyClause)) {
        return null; // UNSAT
    }
    return solution;
}

// ============================================================================
// VISUALIZATION
// ============================================================================

/**
 * Extracts positive assignments from the solution set.
 */
function getBoardMap(solution: CNF): Record<number, number> {
    const result: Record<number, number> = {};
    
    // Iterate over unit clauses in the solution
    for (const clause of solution) {
        for (const lit of clause) {
            // Positive literal = Queen placed
            if (lit > 0) {
                const [row, col] = decode(lit);
                result[row] = col;
            }
        }
    }
    return result;
}

function printBoard(solution: CNF) {
    const board = getBoardMap(solution);
    const rows = Object.keys(board).map(Number);
    if (rows.length === 0) {
        console.log("Empty solution set.");
        return;
    }
    
    const n = Math.max(...rows); 
    
    console.log(`\nSolution for ${n}-Queens:`);
    console.log("   " + Array.from({length: n}, (_, i) => i + 1).join(" "));
    console.log("  +" + "-".repeat(n * 2) + "+");

    for (let row = 1; row <= n; row++) {
        let line = `${row} |`;
        if (row < 10) line = ` ${row} |`;

        for (let col = 1; col <= n; col++) {
            if (board[row] === col) {
                line += "Q ";
            } else {
                line += ". ";
            }
        }
        console.log(line + "|");
    }
    console.log("  +" + "-".repeat(n * 2) + "+");
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

const N = 16; 

console.time('Total Runtime');
const solution = queens(N);
console.timeEnd('Total Runtime');

if (solution) {
    printBoard(solution);
} else {
    console.log(`The problem is not solvable for ${N} queens.`);
}
