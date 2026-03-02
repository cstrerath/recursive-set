import { RecursiveSet, Tuple, Value } from '../src/index';
// Import the Professor's Solver
import { solve } from './07-Davis-Putnam-JW';

// ============================================================================
// 1. TYPES
// ============================================================================

type Variable = string;
type Literal  = Variable | Tuple<['¬', Variable]>;
type Clause   = RecursiveSet<Literal>;
type Clauses  = RecursiveSet<Clause>;
type RS<T extends Value> = RecursiveSet<T>;

function empty<T extends Value>(): RS<T> {
    return new RecursiveSet<T>()
}

// ============================================================================
// 2. CONSTRAINT GENERATION
// ============================================================================

function varName(row: number, col: number): Variable {
    return `Q<${row},${col}>`;
}

/**
 * Generates clauses for "At most one Queen in set S".
 * Logic: For all pairs (p, q) in S, add the clause { ¬p, ¬q }.
 */
function atMostOne(S: RS<Variable>): RS<Clause> {
    const result: RS<Clause> = empty();
    const arr = Array.from(S); 
    for (let i = 0; i < arr.length; i++) {
        for (let j = i + 1; j < arr.length; j++) {
            const clause: RS<Literal> = empty();
            clause.add(new Tuple('¬', arr[i]));
            clause.add(new Tuple('¬', arr[j]));
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
    const result = new RecursiveSet<Clause>();
    result.add(VarsInColumn as Clause);
    return result;
}

function atMostOneInFallingDiagonal(k: number, n: number): RecursiveSet<Clause> {
    const VarsInDiagonal = new RecursiveSet<Variable>();
    for (let row = 1; row <= n; row++) {
        for (let col = 1; col <= n; col++) {
            if (row - col == k) {
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
            if (row + col == k) {
                VarsInDiagonal.add(varName(row, col));
            }
        }
    }
    return atMostOne(VarsInDiagonal);
}

function allClauses(n: number): RecursiveSet<Clause> {
    const all: Array<RecursiveSet<Clause>> = [];
    for (let row = 1; row <= n; row++) {
        all.push(atMostOneInRow(row, n));
    }
    for (let k = 3; k <= 2 * n; k++) {
        all.push(atMostOneInRisingDiagonal(k, n));
    }
    for (let k = -(n - 2); k <= n - 2; k++) {
        all.push(atMostOneInFallingDiagonal(k, n));
    }
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

// ============================================================================
// 3. VISUALIZATION (ASCII)
// ============================================================================

/**
 * Filters the solution and returns only variables that are TRUE.
 * (Positive literals in the unit clauses of the solution).
 */
function removeNegativeLiterals(Solution: Clauses): RecursiveSet<Variable> {
    const Result = new RecursiveSet<Variable>();
    for (const clause of Solution) {
        for (const lit of clause) {
            // Strings are variables (positive), Tuples are negations.
            if (typeof lit === 'string') {
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
        const [row, col] = extractRowCol(name as string);
        Result[parseInt(row, 10)] = parseInt(col, 10);
    }
    return Result;
}

function showSolutionASCII(Solution: RS<Clause>, n: number) {
    const transformed = transform(Solution);
    
    // No positive variables found? Then it is UNSAT (or empty solution).
    if (Object.keys(transformed).length === 0) {
        console.log("No solution found (UNSAT).");
        return;
    }

    const boardArray: string[][] = Array.from({ length: n }, () => Array(n).fill('.'));
    for (let row = 1; row <= n; row++) {
        const col = transformed[row];
        if (col !== undefined) {
            // Array Index is 0-based, Logic is 1-based
            if (row - 1 < n && col - 1 < n) {
                boardArray[row - 1][col - 1] = 'Q';
            }
        }
    }
    
    console.log(`\nSolution for ${n}-Queens (Professor's Solver):`);
    for (let r = 0; r < n; r++) {
        console.log(boardArray[r].join(' '));
    }
}

// ============================================================================
// 4. BENCHMARK RUNNER
// ============================================================================

function calculateStats(times: number[]) {
    if (times.length === 0) return { min: 0, max: 0, avg: 0, median: 0, stdDev: 0 };

    const min = Math.min(...times);
    const max = Math.max(...times);
    const sum = times.reduce((a, b) => a + b, 0);
    const avg = sum / times.length;
    
    const sorted = [...times].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;

    const squareDiffs = times.map(t => Math.pow(t - avg, 2));
    const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / times.length;
    const stdDev = Math.sqrt(avgSquareDiff);

    return { min, max, avg, median, stdDev };
}

function runBenchmark(n: number, iterations: number) {
    console.log(`\nStarting Benchmark for ${n}-Queens`);
    console.log(`Runs: ${iterations}`);
    console.log("------------------------------------------------------------");

    console.log("Generating clauses...");
    const Clauses = allClauses(n);
    console.log(`Clauses generated: ${Clauses.size}`);

    console.log("Warming up engine (5 runs)...");
    // Short warmup to trigger JIT optimizations
    for (let i = 0; i < 5; i++) solve(Clauses);
    console.log("Warmup complete.");

    console.log("⏱️  Measuring...");
    const durations: number[] = [];
    let lastSolution: RS<Clause> | null = null;

    for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        lastSolution = solve(Clauses);
        const end = performance.now();
        
        durations.push(end - start);
        if (i % 10 === 0) process.stdout.write('.');
    }
    console.log("\n");

    const stats = calculateStats(durations);

    console.log("SOLVER RESULTS");
    console.log("============================");
    console.log(`Min:     ${stats.min.toFixed(2)} ms`);
    console.log(`Max:     ${stats.max.toFixed(2)} ms`);
    console.log(`Avg:     ${stats.avg.toFixed(2)} ms`);
    console.log(`Median:  ${stats.median.toFixed(2)} ms`);
    console.log(`StdDev:  ±${stats.stdDev.toFixed(2)} ms`);
    console.log("============================");

    if (lastSolution) {
        showSolutionASCII(lastSolution, n);
    }
}

// Start Benchmark
runBenchmark(16, 10);