import { RecursiveSet, Tuple } from '../src/hash';
// Wir nehmen an, dass diese Datei im selben Verzeichnis liegt (oder ../src/davis-putnam)
import * as DP from './dp-jw-tuple'; 

// ============================================================================
// 1. TYP-DEFINITIONEN
// ============================================================================

type Variable = string;
// NEU: Tuple statt Array
type Literal  = Variable | Tuple<['¬', Variable]>;
type Clause   = RecursiveSet<Literal>;

// ============================================================================
// 2. VARIABLEN-NAMENSGEBUNG
// ============================================================================

function varName(row: number, col: number): Variable {
    return `Q<${row},${col}>`;
}

// ============================================================================
// 3. HILFSFUNKTIONEN FÜR KLAUSELN (Constraints)
// ============================================================================

function atMostOne(S: RecursiveSet<Variable>): RecursiveSet<Clause> {
    const result = new RecursiveSet<Clause>();
    // Iterator zu Array für Index-Zugriff
    const arr: Variable[] = Array.from(S);
    
    for (let i = 0; i < arr.length; i++) {
        for (let j = i + 1; j < arr.length; j++) {
            const p = arr[i];
            const q = arr[j];

            const clause = new RecursiveSet<Literal>();
            // NEU: Tuple Konstruktor
            clause.add(new Tuple('¬', p));
            clause.add(new Tuple('¬', q));

            result.add(clause);
        }
    }
    return result;
}

// ============================================================================
// 4. CONSTRAINT GENERATOREN (Schach-Logik)
// ============================================================================

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

// ============================================================================
// 5. ZUSAMMENFÜHRUNG DER KLAUSELN
// ============================================================================

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
// 6. VISUALISIERUNG & HELPER
// ============================================================================

function removeNegativeLiterals(Solution: RecursiveSet<Clause>): RecursiveSet<Variable> {
    const Result = new RecursiveSet<Variable>();
    for (const C of Solution) {
        const clause = C as Clause;
        for (const lit of clause) {
            // NEU: Tuple Check statt Array.isArray
            if (!(lit instanceof Tuple)) {
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

function showSolution(Solution: RecursiveSet<Clause>) {
    const transformed = transform(Solution);
    const n = Object.keys(transformed).length;
    
    console.log(`\nSolution for ${n}-Queens:`);
    const boardArray: string[][] = Array.from({ length: n }, () => Array(n).fill('.'));
    
    for (let row = 1; row <= n; row++) {
        const col = transformed[row];
        if (col !== undefined) {
             if (row - 1 < n && col - 1 < n) {
                boardArray[row - 1][col - 1] = 'Q';
            }
        }
    }
    
    for (let r = 0; r < n; r++) {
        console.log(boardArray[r].join(' '));
    }
}

// ============================================================================
// 7. BENCHMARK UTILS
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

async function runBenchmark(n: number, iterations: number) {
    console.log(`\n🚀 Starting Benchmark for ${n}-Queens (${iterations} iterations)`);
    console.log("------------------------------------------------------------");

    console.log("Generating clauses...");
    const Clauses = allClauses(n);
    console.log(`Clauses generated. Size: ${Clauses.size}`);

    console.log("🔥 Warming up engine (5 runs)...");
    for (let i = 0; i < 5; i++) {
        DP.solve(Clauses);
    }
    console.log("Warmup complete.");

    console.log("⏱️  Measuring...");
    const durations: number[] = [];
    
    for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        const Solution = DP.solve(Clauses);
        const end = performance.now();
        
        durations.push(end - start);
        if (i % 10 === 0) process.stdout.write('.');
    }
    console.log("\n");

    const stats = calculateStats(durations);

    console.log("📊 RESULTS 📊");
    console.log("============================");
    console.log(`Runs:    ${iterations}`);
    console.log(`Min:     ${stats.min.toFixed(2)} ms`);
    console.log(`Max:     ${stats.max.toFixed(2)} ms`);
    console.log(`Avg:     ${stats.avg.toFixed(2)} ms`);
    console.log(`Median:  ${stats.median.toFixed(2)} ms`);
    console.log(`StdDev:  ±${stats.stdDev.toFixed(2)} ms`);
    console.log("============================");
}

// 16 Damen ist die Königsdisziplin für JS Solver
runBenchmark(16,20);