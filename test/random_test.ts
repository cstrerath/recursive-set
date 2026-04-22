import { RecursiveSet } from '../src/index';

const iterations = 100_000;
const mySet = new RecursiveSet<number>(1, 2, 3, 4, 5);

// Maps to track the frequency of each drawn number
const tallyForOf = new Map<number, number>();
const tallyPickRandom = new Map<number, number>();

// Initialize all counters to zero
for (let i = 1; i <= 5; i++) {
    tallyForOf.set(i, 0);
    tallyPickRandom.set(i, 0);
}

// ---------------------------------------------------------
// Method 1: The flawed approach (for...of with break)
// ---------------------------------------------------------
for (let i = 0; i < iterations; i++) {
    let pseudoRandom: number | undefined = undefined;
    
    // Naively picking the first element yielded by the iterator
    for (const item of mySet) {
        pseudoRandom = item;
        break; 
    }

    if (pseudoRandom !== undefined) {
        // '?? 0' satisfies TS that the result is definitely a number
        const currentCount = tallyForOf.get(pseudoRandom) ?? 0;
        tallyForOf.set(pseudoRandom, currentCount + 1);
    }
}

// ---------------------------------------------------------
// Method 2: The correct approach (pickRandom)
// ---------------------------------------------------------
for (let i = 0; i < iterations; i++) {
    const realRandom = mySet.pickRandom();
    
    if (realRandom !== undefined) {
        const currentCount = tallyPickRandom.get(realRandom) ?? 0;
        tallyPickRandom.set(realRandom, currentCount + 1);
    }
}

// ---------------------------------------------------------
// Evaluation & Console Output
// ---------------------------------------------------------
console.log(`=== Test run with ${iterations.toLocaleString('en-US')} iterations ===\n`);

console.log("❌ Method 1: for...of with break (Not random)");
console.log("Expectation: It consistently grabs only the very first element from the internal _values array.");
console.table(Object.fromEntries(tallyForOf));

console.log("\n✅ Method 2: pickRandom() (API function)");
console.log("Expectation: A relatively clean uniform distribution (~20,000 hits per number).");
console.table(Object.fromEntries(tallyPickRandom));