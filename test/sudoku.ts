import { RecursiveSet, Tuple, Value } from '../src/index';
import { solve } from './07-Davis-Putnam-JW';

// ============================================================================
// 1. TYPES & HELPERS
// ============================================================================

type Variable = string;
type Literal  = Variable | Tuple<['¬', Variable]>;
type Clause   = RecursiveSet<Literal>;
type RS<T extends Value> = RecursiveSet<T>;

/**
 * Creates an empty RecursiveSet with type inference.
 */
function empty<T extends Value>(): RS<T> { return new RecursiveSet<T>(); }

/**
 * Helper to format duration nicely (ms, s, or m:s).
 */
function formatTime(ms: number): string {
    if (ms < 1000) return `${ms.toFixed(2)}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
    const minutes = Math.floor(ms / 60000);
    const seconds = ((ms % 60000) / 1000).toFixed(0);
    return `${minutes}m ${seconds}s`;
}

/**
 * Defines the "Hardest Sudoku" by Arto Inkala.
 */
function createPuzzle(): (number | '*')[][] {
    return [
        [ 8 , '*', '*', '*', '*', '*', '*', '*', '*'],
        ['*', '*',  3,  6 , '*', '*', '*', '*', '*'],
        ['*',  7 , '*', '*',  9 , '*',  2 , '*', '*'],
        ['*',  5 , '*', '*', '*',  7 , '*', '*', '*'],
        ['*', '*', '*', '*',  4 ,  5 ,  7 , '*', '*'],
        ['*', '*', '*',  1 , '*', '*', '*',  3 , '*'],
        ['*', '*',  1 , '*', '*', '*', '*',  6 ,  8 ],
        ['*', '*',  8 ,  5 , '*', '*', '*',  1 , '*'],
        ['*',  9 , '*', '*', '*', '*',  4 , '*', '*']
    ];
}

/**
 * Formats the propositional variable name for a cell and digit.
 * e.g., Q<1,1,5> means "Row 1, Col 1 contains 5".
 */
function varName(row: number, col: number, digit: number): string { 
    return `Q<${row},${col},${digit}>`; 
}

/**
 * Generates clauses ensuring at most one variable in S is true (pairwise mutex).
 */
function atMostOne(S: RecursiveSet<Variable>): RecursiveSet<Clause> {
    const result: RecursiveSet<Clause> = empty();
    for (const p of S) {
        for (const q of S) {
            if (p < q) {
                const lit1: Literal = new Tuple('¬', p);
                const lit2: Literal = new Tuple('¬', q);
                result.add(new RecursiveSet<Literal>(lit1, lit2));
            }
        }
    }
    return result;
}

/**
 * Generates a clause ensuring at least one variable in S is true.
 */
function atLeastOne(S: RS<Variable>): RS<Clause> { 
    return new RecursiveSet<Clause>(S); 
}

/**
 * Generates clauses ensuring exactly one variable in S is true.
 */
function exactlyOne(S: RecursiveSet<Variable>): RecursiveSet<Clause> { 
    return atMostOne(S).union(atLeastOne(S)); 
}

/**
 * Generates constraints ensuring a specific digit appears exactly once in the given list of coordinates.
 */
function exactlyOneForDigit(L: Array<[number, number]>, digit: number): RS<Clause> {
    return exactlyOne(new RecursiveSet<Variable>(...L.map(([row, col]) => varName(row, col, digit))));
}

/**
 * Generates constraints ensuring that the given list of coordinates contains unique digits (1-9).
 */
function exactlyOnce(L: Array<[number, number]>): RS<Clause> {
    const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    return digits.reduce((clauses, digit) => clauses.union(exactlyOneForDigit(L, digit)), empty<Clause>());
}

/**
 * Generates constraints ensuring a specific cell contains exactly one digit.
 */
function exactlyOneDigit(row: number, col: number): RecursiveSet<Clause> {
    const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    return exactlyOne(new RecursiveSet<Variable>(...digits.map(digit => varName(row, col, digit))));
}

/**
 * Generates unit clauses for the initial numbers provided in the puzzle.
 */
function constraintsFromPuzzle(): RS<Clause> {
    const Puzzle  = createPuzzle();
    const Clauses = empty<Clause>();
    for (let row = 0; row < 9; row++) {
        for (let col = 0; col < 9; col++) {
            const value = Puzzle[row][col];
            if (value != '*') {
                Clauses.add(new RecursiveSet<Literal>(varName(row + 1, col + 1, value)));
            }
        }
    }
    return Clauses;
}

// ----------------------------------------------------------------------------
// HELPER FOR 3x3 BLOCKS
// ----------------------------------------------------------------------------

/**
 * Calculates the absolute coordinates for a 3x3 block.
 */
function getBlockCells(r: number, c: number): Array<[number, number]> {
    const baseIndices = new RecursiveSet<number>(1, 2, 3);
    const basePairs   = baseIndices.cartesianProduct(baseIndices);
    return [...basePairs].map(
        ([row, col]) => [r * 3 + row, c * 3 + col]
    );
}

// ============================================================================
// 2. CONSTRAINT GENERATION
// ============================================================================

function allConstraints(): RS<Clause> {
    const L = [1, 2, 3, 4, 5, 6, 7, 8, 9]; 
    // 1. Start with constraints from the puzzle
    const Clauses = constraintsFromPuzzle();
    // 2. There is exactly one digit in every field
    const allCoords = L.flatMap(r => L.map((c): [number, number] => [r, c]));
    Clauses.flatMap(allCoords, ([row, col]) => exactlyOneDigit(row, col));
    // 3. All entries in a row are unique
    Clauses.flatMap(L, (row) => exactlyOnce(L.map(col => [row, col])));
    // 4. All entries in a column are unique
    Clauses.flatMap(L, (col) => exactlyOnce(L.map(row => [row, col])));
    // 5. All entries in a 3x3 square are unique
    const outerIndices = new RecursiveSet<number>(0, 1, 2);
    const blockCoordinates = outerIndices.cartesianProduct(outerIndices);
    Clauses.flatMap(blockCoordinates, (t) => exactlyOnce(getBlockCells(t.get(0), t.get(1))));
    return Clauses;
}

// ============================================================================
// 3. MAIN RUNNER
// ============================================================================

function sudoku(): RecursiveSet<Clause> | null {
    console.log("------------------------------------------------");
    console.log("1. Generating Constraints...");
    
    const startGen = performance.now();
    const Clauses = allConstraints(); // Running the optimized flatMap here
    const endGen = performance.now();
    
    console.log(`   Done in ${formatTime(endGen - startGen)}`);
    console.log(`   Generated ${Clauses.size} clauses.`);

    console.log("2. Solving Sudoku... (This may take a while)");
    
    const startSolve = performance.now();
    const Solution = solve(Clauses); // Running the actual solver
    const endSolve = performance.now();
    
    console.log(`   Solved in ${formatTime(endSolve - startSolve)}`);
    console.log("------------------------------------------------");

    const EmptyClause = new RecursiveSet<Literal>();
    
    // If the empty clause is not present, a solution was found (Model).
    if (!Solution.has(EmptyClause)) {
        return Solution;
    } else {
        console.log('❌ The problem is not solvable!');
        return null;
    }
}

// ============================================================================
// 4. OUTPUT FORMATTING
// ============================================================================

/**
 * Helper to pick an arbitrary element from a set.
 */
function arb<T extends Value>(S: RecursiveSet<T>): T | null {
    return S.isEmpty() ? null : (S.pickRandom() ?? null);
}

/**
 * Extracts the variable assignments from the solver result.
 * Filters out negative literals (Tuples) and only keeps positive ones (Strings).
 */
function transformSolution(Solution: RecursiveSet<Clause>): Record<string, number> {
    const Result: Record<string, number> = {};
    
    for (const UnitClause of Solution) {
        // Extract the single literal from the unit clause
        const lit = arb(UnitClause);
        
        // We strictly filter for strings (Positive Literals).
        // Tuples represent negations (e.g., '¬Q...') and are ignored.
        if (typeof lit === 'string') {
            const m = lit.match(/^Q<(\d+),(\d+),(\d+)>$/);
            if (m) {
                // Map: V[Row][Col] = Digit
                Result[`V${m[1]}${m[2]}`] = parseInt(m[3], 10);
            }
        }
    }
    return Result;
}

/**
 * Prints the Sudoku grid to the console.
 */
function printSolution(Solution: RecursiveSet<Clause>) {
    const solutionMap = transformSolution(Solution);
    
    console.log("\n--- SUDOKU SOLUTION GRID ---");
    for (let row = 0; row < 9; row++) {
        let line = "";
        for (let col = 0; col < 9; col++) {
            const key = `V${row + 1}${col + 1}`;
            
            // Since the solution is complete (81 positive literals), 
            // every cell has an entry in solutionMap.
            const val = solutionMap[key];
            
            line += val + " ";
            if ((col + 1) % 3 === 0 && col < 8) line += "| ";
        }
        console.log(line);
        if ((row + 1) % 3 === 0 && row < 8) console.log("---------------------");
    }
}

// Start Execution
const solution = sudoku();
if (solution) {
    printSolution(solution);
}