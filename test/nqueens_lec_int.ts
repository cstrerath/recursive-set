import { RecursiveSet } from '../src/index';
import * as DP from './dp-jw-int';

// ============================================================================
// TYPEN
// ============================================================================
type Variable = number; // 1 .. N*N
type Literal  = number; // -Variable .. +Variable
type Clause   = RecursiveSet<Literal>;

// ============================================================================
// MAPPING LOGIK (String -> Int)
// ============================================================================

/**
 * Maps (row, col) to a unique integer ID.
 * Formula: (row - 1) * N + col
 * 1-based index returns: 1 .. N*N
 */
function toId(row: number, col: number, n: number): Variable {
    return (row - 1) * n + col;
}

/**
 * Maps ID back to (row, col) for output.
 */
function toCoords(id: number, n: number): [number, number] {
    const adjusted = id - 1;
    const row = Math.floor(adjusted / n) + 1;
    const col = (adjusted % n) + 1;
    return [row, col];
}

// ============================================================================
// CONSTRAINT GENERATORS (Jetzt mit Integers)
// ============================================================================

function atMostOne(literals: Variable[]): RecursiveSet<Clause> {
    const result = new RecursiveSet<Clause>();
    // literals array ist implizit sortiert wenn wir sauber loopen,
    // aber sicherheitshalber sortieren wir für fromSortedUnsafe nicht hier,
    // da die Klauseln klein sind (Größe 2).
    
    for (let i = 0; i < literals.length; i++) {
        for (let j = i + 1; j < literals.length; j++) {
            // Klausel: {-p, -q}
            // Wir müssen sicherstellen, dass sie sortiert sind für High-Perf Construction
            // Da p und q positiv sind, ist -q < -p (wenn p < q).
            // literals[i] (p) < literals[j] (q) => -literals[j] < -literals[i]
            
            const p = literals[i];
            const q = literals[j];
            
            // Negierte Literale
            const notP = -p;
            const notQ = -q;
            
            // Sortierung beachten: kleineres zuerst
            const c = (notQ < notP) 
                ? RecursiveSet.fromSortedUnsafe([notQ, notP])
                : RecursiveSet.fromSortedUnsafe([notP, notQ]);
            
            result.add(c as Clause);
        }
    }
    return result;
}

function atMostOneInRow(row: number, n: number): RecursiveSet<Clause> {
    const vars: Variable[] = [];
    for (let col = 1; col <= n; col++) vars.push(toId(row, col, n));
    return atMostOne(vars);
}

function oneInColumn(col: number, n: number): RecursiveSet<Clause> {
    const vars: Variable[] = [];
    for (let row = 1; row <= n; row++) vars.push(toId(row, col, n));
    // Klausel: {x_1, x_2, ...} (Einer muss wahr sein)
    // Vars sind schon sortiert (da row aufsteigend)
    const c = RecursiveSet.fromSortedUnsafe(vars) as Clause;
    return RecursiveSet.fromSortedUnsafe([c]); // Einzelne Klausel im Set
}

function atMostOneInFallingDiagonal(k: number, n: number): RecursiveSet<Clause> {
    const vars: Variable[] = [];
    for (let row = 1; row <= n; row++) {
        for (let col = 1; col <= n; col++) {
            if (row - col === k) vars.push(toId(row, col, n));
        }
    }
    return atMostOne(vars);
}

function atMostOneInRisingDiagonal(k: number, n: number): RecursiveSet<Clause> {
    const vars: Variable[] = [];
    for (let row = 1; row <= n; row++) {
        for (let col = 1; col <= n; col++) {
            if (row + col === k) vars.push(toId(row, col, n));
        }
    }
    return atMostOne(vars);
}

function allClauses(n: number): RecursiveSet<Clause> {
    // Wir sammeln erst alle Klauseln in einem Array und bauen dann das Set
    // Das ist effizienter als 1000x .union()
    const allC: Clause[] = [];
    
    // Helper zum Mergen
    const add = (set: RecursiveSet<Clause>) => {
        for(const c of set) allC.push(c as Clause);
    };

    for (let row = 1; row <= n; row++) add(atMostOneInRow(row, n));
    for (let k = 3; k <= 2 * n; k++) add(atMostOneInRisingDiagonal(k, n));
    for (let k = -(n - 2); k <= n - 2; k++) add(atMostOneInFallingDiagonal(k, n));
    for (let col = 1; col <= n; col++) add(oneInColumn(col, n));
    
    return RecursiveSet.fromArray(allC);
}

// ============================================================================
// MAIN WRAPPER
// ============================================================================

function queens(n: number) {
    console.log(`Generating clauses for ${n} queens (Integer Mode)...`);
    const Clauses = allClauses(n);
    console.log(`Generated ${Clauses.size} clauses.`);
    
    console.log("Starting Davis-Putnam solver...");
    const start = performance.now();
    const Solution = DP.solve(Clauses);
    const end = performance.now();
    
    console.log(`DPLL Time: ${((end - start) / 1000).toFixed(3)}s`);
    
    // Check unsolvable
    for(const C of Solution) {
        if((C as Clause).isEmpty()) {
            console.log("Unsolvable.");
            return;
        }
    }
    
    showSolution(Solution, n);
}

function showSolution(Solution: RecursiveSet<Clause>, n: number) {
    const boardArray: string[][] = Array.from({ length: n }, () => Array(n).fill('.'));
    
    // Extract Logic
    // Wir suchen Unit Klauseln mit positivem Literal
    for(const C of Solution) {
        const clause = C as Clause;
        if(clause.size === 1) {
            // Erstes Element holen
            for(const lit of clause) {
                if(lit > 0) {
                    const [row, col] = toCoords(lit, n);
                    boardArray[row-1][col-1] = 'Q';
                }
            }
        }
    }
    
    console.log(`\nSolution for ${n}-Queens:`);
    for (let r = 0; r < n; r++) {
        console.log(boardArray[r].join(' '));
    }
}

// RUN
queens(16);