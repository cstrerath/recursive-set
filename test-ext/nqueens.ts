import { RecursiveSet } from './recursive-set';
import { Literal, Clause, CNF, NNFNegation } from './cnf'; // Deine CNF Definitionen
import * as DP from './davis-putnam-jw'; // Dein Solver

// ============================================================================
// 1. HELPER & CONSTRAINT GENERATION (STRICT NNF)
// ============================================================================

type Variable = string;

function varName(row: number, col: number): Variable {
    return `Q<${row},${col}>`;
}

/**
 * Erzeugt Klauseln mit strikten NNF Objekten.
 * Hier wird 'new NNFNegation(p)' statt Strings/Tuples genutzt.
 */
function atMostOne(S: RecursiveSet<Variable>): CNF {
    const result = new RecursiveSet<Clause>();
    const arr = Array.from(S);

    for (let i = 0; i < arr.length; i++) {
        for (let j = i + 1; j < arr.length; j++) {
            const p = arr[i];
            const q = arr[j];

            // Clause: { ¬p, ¬q }
            const clause = new RecursiveSet<Literal>();
            
            // WICHTIG: Hier entstehen die Objekte auf dem Heap!
            clause.add(new NNFNegation(p));
            clause.add(new NNFNegation(q));
            
            // Optional, falls deine Lib freeze verlangt
            clause.freeze();

            result.add(clause);
        }
    }
    return result as CNF;
}

function atMostOneInRow(row: number, n: number): CNF {
    const VarsInRow = new RecursiveSet<Variable>();
    for (let col = 1; col <= n; col++) {
        VarsInRow.add(varName(row, col));
    }
    return atMostOne(VarsInRow);
}

function oneInColumn(col: number, n: number): CNF {
    const VarsInColumn = new RecursiveSet<Literal>();
    for (let row = 1; row <= n; row++) {
        VarsInColumn.add(varName(row, col));
    }
    VarsInColumn.freeze();
    
    const result = new RecursiveSet<Clause>();
    result.add(VarsInColumn);
    return result as CNF;
}

function atMostOneInFallingDiagonal(k: number, n: number): CNF {
    const Vars = new RecursiveSet<Variable>();
    for (let row = 1; row <= n; row++) {
        for (let col = 1; col <= n; col++) {
            if (row - col === k) Vars.add(varName(row, col));
        }
    }
    return atMostOne(Vars);
}

function atMostOneInRisingDiagonal(k: number, n: number): CNF {
    const Vars = new RecursiveSet<Variable>();
    for (let row = 1; row <= n; row++) {
        for (let col = 1; col <= n; col++) {
            if (row + col === k) Vars.add(varName(row, col));
        }
    }
    return atMostOne(Vars);
}

function allClauses(n: number): CNF {
    const result = new RecursiveSet<Clause>();
    const add = (s: CNF) => { for (const c of s) result.add(c); };

    for (let row = 1; row <= n; row++) add(atMostOneInRow(row, n));
    for (let col = 1; col <= n; col++) add(oneInColumn(col, n));
    for (let k = -(n - 2); k <= n - 2; k++) add(atMostOneInFallingDiagonal(k, n));
    for (let k = 3; k <= 2 * n; k++) add(atMostOneInRisingDiagonal(k, n));
    
    return result as CNF;
}

// ============================================================================
// 2. VISUALIZATION (ASCII)
// ============================================================================

function removeNegativeLiterals(Solution: CNF): RecursiveSet<Variable> {
    const Result = new RecursiveSet<Variable>();
    for (const C of Solution) {
        for (const lit of C) {
            // Check auf Instanz! NNF Objekte filtern.
            if (!(lit instanceof NNFNegation)) {
                Result.add(lit as Variable);
            }
        }
    }
    return Result;
}

function transform(Solution: CNF): Record<number, number> {
    const positiveLiterals = removeNegativeLiterals(Solution);
    const Result: Record<number, number> = {};
    for (const name of positiveLiterals) {
        // String Parsen: Q<1,2>
        const left = (name as string).indexOf('<');
        const comma = (name as string).indexOf(',');
        const right = (name as string).indexOf('>');
        const row = (name as string).substring(left + 1, comma);
        const col = (name as string).substring(comma + 1, right);
        Result[parseInt(row, 10)] = parseInt(col, 10);
    }
    return Result;
}

function showSolutionASCII(Solution: CNF, n: number) {
    const transformed = transform(Solution);
    if (Object.keys(transformed).length === 0) return;

    const boardArray: string[][] = Array.from({ length: n }, () => Array(n).fill('.'));
    for (let row = 1; row <= n; row++) {
        const col = transformed[row];
        if (col !== undefined) {
            if (row - 1 < n && col - 1 < n) {
                boardArray[row - 1][col - 1] = 'Q';
            }
        }
    }
    console.log(`\nSolution for ${n}-Queens (Strict NNF):`);
    for (let r = 0; r < n; r++) {
        console.log(boardArray[r].join(' '));
    }
}

// ============================================================================
// 3. BENCHMARK RUNNER
// ============================================================================

function calculateStats(times: number[]) {
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
    console.log(`\n🚀 Starting Benchmark for ${n}-Queens (STRICT NNF Objects)`);
    console.log(`Runs: ${iterations}`);
    console.log("------------------------------------------------------------");

    console.log("Generating clauses...");
    const Clauses = allClauses(n);
    console.log(`Clauses generated: ${Clauses.size}`);

    console.log("🔥 Warming up engine (5 runs)...");
    for (let i = 0; i < 5; i++) DP.solve(Clauses);
    console.log("Warmup complete.");

    console.log("⏱️  Measuring...");
    const durations: number[] = [];
    let lastSolution: CNF | null = null;

    for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        lastSolution = DP.solve(Clauses);
        const end = performance.now();
        durations.push(end - start);
        if (i % 10 === 0) process.stdout.write('.');
    }
    console.log("\n");

    const stats = calculateStats(durations);

    console.log("📊 NNF RESULTS 📊");
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

// Run for 8 Queens, 100 Iterations
runBenchmark(16, 10);