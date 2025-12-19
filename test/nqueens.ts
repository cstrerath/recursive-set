import { RecursiveSet } from '../src/index';
import * as DP from './davies-putnam'; 

/**
 * N-Queens SAT Problem Generator & Visualizer.
 * Uses Davies-Putnam solver to find placements.
 * 
 * Logic adapted from Karl Stroetmann.
 */

// === Types ===
// Literal types are inferred from the Library usage, but aliases help readability
type Variable = DP.Variable;
type Literal = DP.Literal;
type Clause = DP.Clause;

// === Helper Functions ===

function varName(row: number, col: number): Variable {
    return `Q<${row},${col}>`;
}

/**
 * Returns a set containing clauses that expresses that at most one of the variables in S is True.
 */
function atMostOne(S: RecursiveSet<Variable>): RecursiveSet<Clause> {
    const result = new RecursiveSet<Clause>();
    const arr: Variable[] = [];
    for(const v of S) {
        arr.push(v);
    }
    
    // Pairwise constraint: NOT (A and B) <=> (NOT A or NOT B)
    for (let i = 0; i < arr.length; i++) {
        for (let j = i + 1; j < arr.length; j++) {
            const p = arr[i];
            const q = arr[j];

            const clause = new RecursiveSet<Literal>();
            // Using raw arrays for Literals is natively supported by v4.0.0
            clause.add(['¬', p]);
            clause.add(['¬', q]);

            result.add(clause);
        }
    }
    return result;
}

function atMostOneInRow(row: number, n: number): RecursiveSet<Clause> {
    const VarsInRow = new RecursiveSet<Variable>();
    for (let col = 1; col <= n; col++) {
        VarsInRow.add(varName(row, col));
    }
    return atMostOne(VarsInRow);
}

function oneInColumn(col: number, n: number): RecursiveSet<Clause> {
    const VarsInColumn = new RecursiveSet<Literal>();
    for (let row = 1; row <= n; row++) {
        VarsInColumn.add(varName(row, col));
    }
    // "At least one" is just the clause of all variables OR'd
    const result = new RecursiveSet<Clause>();
    result.add(VarsInColumn);
    return result;
}

function atMostOneInFallingDiagonal(k: number, n: number): RecursiveSet<Clause> {
    const VarsInDiagonal = new RecursiveSet<Variable>();
    for (let row = 1; row <= n; row++) {
        for (let col = 1; col <= n; col++) {
            if (row - col === k) {
                VarsInDiagonal.add(varName(row, col));
            }
        }
    }
    return atMostOne(VarsInDiagonal);
}

function atMostOneInRisingDiagonal(k: number, n: number): RecursiveSet<Clause> {
    const VarsInDiagonal = new RecursiveSet<Variable>();
    for (let row = 1; row <= n; row++) {
        for (let col = 1; col <= n; col++) {
            if (row + col === k) {
                VarsInDiagonal.add(varName(row, col));
            }
        }
    }
    return atMostOne(VarsInDiagonal);
}

function allClauses(n: number): RecursiveSet<Clause> {
    const all: Array<RecursiveSet<Clause>> = [];
    
    // 1. At most one queen per row
    for (let row = 1; row <= n; row++) {
        all.push(atMostOneInRow(row, n));
    }
    
    // 2. At most one queen per rising diagonal
    for (let k = 3; k <= 2 * n; k++) {
        all.push(atMostOneInRisingDiagonal(k, n));
    }
    
    // 3. At most one queen per falling diagonal
    for (let k = -(n - 2); k <= n - 2; k++) {
        all.push(atMostOneInFallingDiagonal(k, n));
    }
    
    // 4. At least one queen per column
    for (let col = 1; col <= n; col++) {
        all.push(oneInColumn(col, n));
    }
    
    const result = new RecursiveSet<Clause>();
    for (const clauses of all) {
        for (const clause of clauses) {
             result.add(clause);
        }
    }
    return result;
}

// === Solving Logic ===

function queens(n: number): RecursiveSet<Clause> | null {
    console.log(`Generating clauses for ${n} queens...`);
    const Clauses = allClauses(n);
    console.log(`Generated ${Clauses.size} clauses.`);
    
    console.log("Starting Davis-Putnam solver...");
    const Solution = DP.solve(Clauses);
    
    const EmptyClause = new RecursiveSet<Literal>();
    if (Solution.has(EmptyClause)) {
        console.log(`The problem is not solvable for ${n} queens!`);
        return null;
    }
    return Solution;
}

// === Visualization Logic (Console Version) ===

function removeNegativeLiterals(Solution: RecursiveSet<Clause>): RecursiveSet<Variable> {
    const Result = new RecursiveSet<Variable>();
    for (const C of Solution) {
        for (const lit of C) {
            // Positive literals are strings "Q<1,1>", negative are arrays ["¬", "Q<1,1>"]
            if (!Array.isArray(lit)) {
                Result.add(lit);
            }
        }
    }
    return Result;
}

function extractRowCol(varName: string): [string, string] {
    const left = varName.indexOf('<');
    const comma = varName.indexOf(',');
    const right = varName.indexOf('>');
    const row = varName.substring(left + 1, comma);
    const col = varName.substring(comma + 1, right);
    return [row, col];
}

function transform(Solution: RecursiveSet<Clause>): Record<number, number> {
    const positiveLiterals = removeNegativeLiterals(Solution);
    const Result: Record<number, number> = {};
    for (const name of positiveLiterals) {
        const [row, col] = extractRowCol(name);
        Result[parseInt(row, 10)] = parseInt(col, 10);
    }
    return Result;
}

function printBoard(Solution: RecursiveSet<Clause>) {
    const transformed = transform(Solution);
    const n = Object.keys(transformed).length;
    
    console.log(`\nSolution for ${n}-Queens:`);
    console.log("   " + Array.from({length: n}, (_, i) => i + 1).join(" "));
    console.log("  +" + "-".repeat(n * 2) + "+");

    for (let row = 1; row <= n; row++) {
        let line = `${row} |`;
        if (row < 10) line = ` ${row} |`; // Padding

        for (let col = 1; col <= n; col++) {
            const placedCol = transformed[row];
            if (placedCol === col) {
                line += "Q ";
            } else {
                line += ". ";
            }
        }
        console.log(line + "|");
    }
    console.log("  +" + "-".repeat(n * 2) + "+");
}

// === Main Execution ===

const N = 16; 

console.time('Total Runtime');
const solution = queens(N);
console.timeEnd('Total Runtime');

if (solution) {
    printBoard(solution);
} else {
    console.log("No solution found.");
}
