import { RecursiveSet } from '../src/strict-tree';
// Wir nehmen an, dass diese Datei im selben Verzeichnis liegt
import * as DP from './dpll'; 

// Falls du das in Node ausführst und tslab nicht hast, musst du diesen Import entfernen
// und die showSolution Funktion unten anpassen.
// import { display } from 'tslab'; 

// ============================================================================
// 1. TYP-DEFINITIONEN
// ============================================================================

type Variable = string;
type Literal  = Variable | ['¬', Variable];
type Clause   = RecursiveSet<Literal>;

// ============================================================================
// 2. VARIABLEN-NAMENSGEBUNG
// ============================================================================

/**
 * The function varName(row, col) takes two integers row and col as its argument 
 * and returns a string of the form 'Q<row,col>'.
 * This string is interpreted as a propositional variable. 
 * This variable is true if there is a queen in the given row and column on the board.
 */
function varName(row: number, col: number): Variable {
    return `Q<${row},${col}>`;
}

// Beispiel:
// console.log(varName(11, 3));

// ============================================================================
// 3. HILFSFUNKTIONEN FÜR KLAUSELN (Constraints)
// ============================================================================

/**
 * Given a set of propositional variables S, the function atMostOne(S) 
 * returns a set containing clauses that expresses the fact that 
 * **at most one** of the variables in S is True.
 */
function atMostOne(S: RecursiveSet<Variable>): RecursiveSet<Clause> {
    const result = new RecursiveSet<Clause>();
    const arr: Variable[] = [];
    for(const v of S) {
        arr.push(v as Variable);
    }
    for (let i = 0; i < arr.length; i++) {
        for (let j = i + 1; j < arr.length; j++) {
            const p = arr[i];
            const q = arr[j];

            const clause = new RecursiveSet<Literal>();
            clause.add(['¬', p]);
            clause.add(['¬', q]);

            result.add(clause);
        }
    }
    return result;
}

// ============================================================================
// 4. CONSTRAINT GENERATOREN (Schach-Logik)
// ============================================================================

/**
 * Given a row and the size of the board n, the procedure atMostOneInRow(row, n) 
 * computes a set of clauses that is True if and only there is at most one queen 
 * in the given row.
 */
function atMostOneInRow(row: number, n: number): RecursiveSet<Clause> {
    const VarsInRow = new RecursiveSet<Variable>();
    for (let col = 1; col <= n; col++) {
        VarsInRow.add(varName(row, col));
    }
    return atMostOne(VarsInRow);
}

/**
 * Given a column col and the size of the board n, the procedure oneInColumn(col, n) 
 * computes a set of clauses that is true if and only if there is at least one queen 
 * in the given column.
 */
function oneInColumn(col: number, n: number): RecursiveSet<Clause> {
    const VarsInColumn = new RecursiveSet<Literal>();
    for (let row = 1; row <= n; row++) {
        VarsInColumn.add(varName(row, col));
    }
    const result = new RecursiveSet<Clause>();
    result.add(VarsInColumn as Clause);
    return result;
}

/**
 * Given a number k and the size of the board n, the procedure atMostOneInFallingDiagonal(k, n) 
 * computes a set of clauses that is True if and only if there is at most one queen 
 * in the falling diagonal specified by the equation: row - col = k.
 */
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

/**
 * Given a number k and the size of the board n, the procedure atMostOneInRisingDiagonal(k, n) 
 * computes a set of clauses that is True if and only if there is at most one queen 
 * in the rising diagonal specified by the equation: row + col = k.
 */
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

/**
 * The function allClauses(n) takes the size of the board n and computes a set of clauses 
 * that specify the full N-Queens rules.
 */
function allClauses(n: number): RecursiveSet<Clause> {
    const all: Array<RecursiveSet<Clause>> = [];
    
    // 1. Row Constraints
    for (let row = 1; row <= n; row++) {
        all.push(atMostOneInRow(row, n));
    }
    
    // 2. Rising Diagonals
    for (let k = 3; k <= 2 * n; k++) {
        all.push(atMostOneInRisingDiagonal(k, n));
    }
    
    // 3. Falling Diagonals
    for (let k = -(n - 2); k <= n - 2; k++) {
        all.push(atMostOneInFallingDiagonal(k, n));
    }
    
    // 4. Column Constraints
    for (let col = 1; col <= n; col++) {
        all.push(oneInColumn(col, n));
    }
    
    // Union all clauses
    const result = new RecursiveSet<Clause>();
    for (const clauses of all) {
        for (const clause of clauses) {
             result.add(clause);
        }
    }
    return result;
}

// ============================================================================
// 6. SOLVER WRAPPER
// ============================================================================

function queens(n: number): RecursiveSet<Clause> | null {
    // "Solve the n queens problem."
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

// ============================================================================
// 7. VISUALISIERUNG & HELPER (Lösung extrahieren)
// ============================================================================

/**
 * Returns the set of all those unit clauses in Solution that do not contain negative literals.
 */
function removeNegativeLiterals(Solution: RecursiveSet<Clause>): RecursiveSet<Variable> {
    const Result = new RecursiveSet<Variable>();
    for (const C of Solution) {
        const clause = C as Clause;
        for (const lit of clause) {
            if (!Array.isArray(lit)) {
                Result.add(lit);
            }
        }
    }
    return Result;
}

/**
 * Extracts row and col from string 'Q<row,col>'.
 */
function extractRowCol(varName: string): [string, string] {
    const left = varName.indexOf('<');
    const comma = varName.indexOf(',');
    const right = varName.indexOf('>');
    const row = varName.substring(left + 1, comma);
    const col = varName.substring(comma + 1, right);
    return [row, col];
}

/**
 * Transforms the solution set into a Map { row: col }.
 */
function transform(Solution: RecursiveSet<Clause>): Record<number, number> {
    const positiveLiterals = removeNegativeLiterals(Solution);
    const Result: Record<number, number> = {};
    for (const name of positiveLiterals) {
        const [row, col] = extractRowCol(name as string);
        Result[parseInt(row, 10)] = parseInt(col, 10);
    }
    return Result;
}

/**
 * Zeigt die Lösung an.
 * Hinweis: Die Original-Funktion nutzt `tslab.display.html`. 
 * Dies funktioniert nur in Jupyter/TSLab.
 */
function showSolution(Solution: RecursiveSet<Clause>, width = "50%") {
    const transformed = transform(Solution);
    const n = Object.keys(transformed).length;
    
    // Text-basierte Ausgabe für Node.js Konsole
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
    
    // Print ASCII Board
    for (let r = 0; r < n; r++) {
        console.log(boardArray[r].join(' '));
    }

    /* // ORIGINAL TSLAB HTML CODE (Funktioniert nur im Notebook):
    let html = `<div style="display:grid; grid-template-columns:repeat(${n}, 1fr); width:${width}; aspect-ratio: 1/1; border: 2px solid black;">`;
    for (let row = 0; row < n; row++) {
        for (let col = 0; col < n; col++) {
            const piece = boardArray[row][col] === 'Q' ? '♕' : '';
            const bgColor = (row + col) % 2 === 0 ? '#f0d9b5' : '#b58863'; 
            html += `<div style="
                display: flex; 
                align-items: center; 
                justify-content: center; 
                font-size: 2em; 
                background-color:${bgColor};
                color: black;
                ">${piece}</div>`;
        }
    }
    html += `</div>`;
    // display.html(html); // Benötigt import { display } from 'tslab';
    */
}

// ============================================================================
// 8. MAIN EXECUTION
// ============================================================================
// ============================================================================
// BENCHMARK UTILS
// ============================================================================

function calculateStats(times: number[]) {
    const min = Math.min(...times);
    const max = Math.max(...times);
    const sum = times.reduce((a, b) => a + b, 0);
    const avg = sum / times.length;
    
    // Median berechnen
    const sorted = [...times].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;

    // Standardabweichung
    const squareDiffs = times.map(t => Math.pow(t - avg, 2));
    const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / times.length;
    const stdDev = Math.sqrt(avgSquareDiff);

    return { min, max, avg, median, stdDev };
}

async function runBenchmark(n: number, iterations: number) {
    console.log(`\n🚀 Starting Benchmark for ${n}-Queens (${iterations} iterations)`);
    console.log("------------------------------------------------------------");

    // 1. Clause Generation (wird meist nicht mitgemessen beim Solver-Vergleich)
    console.log("Generating clauses...");
    const Clauses = allClauses(n);
    console.log(`Clauses generated. Size: ${Clauses.size}`);

    // 2. Warmup Phase (Wichtig für JIT Optimierung!)
    console.log("🔥 Warming up engine (5 runs)...");
    for (let i = 0; i < 5; i++) {
        DP.solve(Clauses); // Ergebnis ignorieren
    }
    console.log("Warmup complete.");

    // 3. Measurement Phase
    console.log("⏱️  Measuring...");
    const durations: number[] = [];
    
    for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        const Solution = DP.solve(Clauses);
        const end = performance.now();
        
        // Safety check: Wurde eine Lösung gefunden? (Sollte immer ja sein bei 8)
        // const isEmpty = Solution.has(new RecursiveSet<Literal>());
        // if(isEmpty) console.warn(`Warn: Run ${i} found no solution (random logic?)`);

        durations.push(end - start);
        
        // Kleiner Fortschrittsbalken
        if (i % 10 === 0) process.stdout.write('.');
    }
    console.log("\n");

    // 4. Stats Output
    const stats = calculateStats(durations);

    console.log("📊 RESULTS 📊");
    console.log("============================");
    console.log(`Runs:    ${iterations}`);
    console.log(`Min:     ${stats.min.toFixed(2)} ms`);
    console.log(`Max:     ${stats.max.toFixed(2)} ms`);
    console.log(`Avg:     ${stats.avg.toFixed(2)} ms`);
    console.log(`Median:  ${stats.median.toFixed(2)} ms  <-- WICHTIGSTER WERT`);
    console.log(`StdDev:  ±${stats.stdDev.toFixed(2)} ms`);
    console.log("============================");
}

// ============================================================================
// RUN
// ============================================================================

// Führe Benchmark für 8 Damen mit 100 Durchläufen aus
runBenchmark(8, 100);