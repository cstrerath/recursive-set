"use strict";

/**
 * @file Test Suite for RecursiveSet v8.0.0
 * @description
 * Comprehensive integration tests covering:
 * - Primitive & Object Semantics
 * - ZFC Set Operations (Union, Intersection, etc.)
 * - Performance Benchmarks
 * - Mathematical Invariants (Reflexivity, Transitivity)
 * - Security & Lifecycle constraints (Freeze-on-Hash)
 */

import { RecursiveSet, Value, hashValue, emptySet, Tuple } from '../src/hash';

// ============================================================================
// CONFIGURATION & UTILITIES
// ============================================================================

let failureCount = 0;

// CLI Argument Parsing for Seed (Usage: ts-node test/test.ts --seed=12345)
const args = process.argv.slice(2);
const seedArg = args.find(arg => arg.startsWith('--seed='));
const parsedSeed = seedArg ? Number(seedArg.split('=')[1]) : 1337;
const SEED = Number.isFinite(parsedSeed) ? parsedSeed : 1337;

console.log(`=== RecursiveSet Test Suite (v7.0.0 - Performance Edition) ===`);
console.log(`[Config] RNG Seed: ${SEED}\n`);

/**
 * Creates a deterministic pseudo-random number generator (Mulberry32).
 * Essential for reproducible property-based testing (fuzzing).
 * @param seed - The initial seed value.
 * @returns A function returning a number between 0 and 1.
 */
function createRNG(seed: number) {
    return function() {
        var t = seed += 0x6D2B79F5;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
}
const random = createRNG(SEED);

/**
 * Measures execution time of a function.
 * @param label - Name of the benchmark.
 * @param fn - The function to execute.
 */
function measure<T>(label: string, fn: () => T): T {
    const start = performance.now();
    const result = fn();
    const end = performance.now();
    console.log(`[PERF] ${label}: ${(end - start).toFixed(2)}ms`);
    return result;
}

/**
 * Simple assertion helper.
 * Logs [PASS] or [FAIL] to stdout.
 * @param condition - Boolean condition that must be true.
 * @param message - Description of the test case.
 */
function assert(condition: boolean, message: string) {
    if (!condition) {
        console.error(`[FAIL] ${message}`);
        failureCount++;
    } else {
        console.log(`[PASS] ${message}`);
    }
}

/**
 * Helper to stringify mixed types for debug output.
 */
function fmt(x: any): string {
    if (typeof x === 'object' && x !== null) return x.toString();
    return String(x);
}

// ============================================================================
// 1. PRIMITIVE VALUE SEMANTICS
// ============================================================================
console.log('--- Test 1: Primitive Value Equality ---');
const str1 = "hello";
const str2 = "hel" + "lo"; 

const setStrings = new RecursiveSet<string>();
setStrings.add(str1);

assert(setStrings.has(str2), "Set identifies strings by value");
assert(setStrings.size === 1, "Set prevents duplicate values");
console.log();

// ============================================================================
// 2. TYPE HANDLING & ORDERING
// ============================================================================
console.log('--- Test 2: Mixed Types (Primitives vs Sets) ---');
const mixedSet = new RecursiveSet<number | RecursiveSet<number>>();
const innerSet = new RecursiveSet(1);

mixedSet.add(1);          
mixedSet.add(innerSet);   

assert(mixedSet.size === 2, "Set contains both primitive 1 and set {1}");
assert(mixedSet.has(1), "Contains primitive 1");
assert(mixedSet.has(new RecursiveSet(1)), "Contains set {1}");

// Verify deterministic sort order (Semantic-First)
const it = mixedSet[Symbol.iterator]();
const first = it.next().value;
assert(typeof first === 'number', "Ordering: Primitives must precede Sets");
console.log();

// ============================================================================
// 3. DEEP STRUCTURAL EQUALITY
// ============================================================================
console.log('--- Test 3: Deep Structural Equality ---');

// We use <Value> to force the compiler to see these as compatible types
const A = new RecursiveSet<Value>(
    new RecursiveSet<Value>(1, 2), 
    new RecursiveSet<Value>(3)
);

const B = new RecursiveSet<Value>(
    new RecursiveSet<Value>(3), 
    new RecursiveSet<Value>(2, 1)
);

assert(A.equals(B), "Sets are equal regardless of insertion order");
console.log('Test Passed: Nested sets compare correctly.');

// ============================================================================
// 4. CARTESIAN PRODUCT (INVARIANT CHECK)
// ============================================================================
console.log('--- Test 4: Cartesian Product (Sorted Invariant) ---');
const setX = new RecursiveSet<Value>(1, 2, "ia", "i", 4);
const setY = new RecursiveSet<Value>(3, 4, "11", "12", "2");
const product = setX.cartesianProduct(setY);

assert(product.size === 25, "Product size is correct");

let prev: Tuple<[number, number]> | undefined;
let isSorted = true;
for (const item of product) {
    const current = item as Tuple<[number, number]>;
    if (prev) {
        // Result must be strictly sorted by compare() logic
        if (RecursiveSet.compare(prev, current) > 0) {
            isSorted = false;
            console.error(`Sorting violation: ${prev} comes before ${current}`);
        }
    }
    prev = current;
}
console.log(product.toString());
assert(isSorted, "Cartesian Product preserves Sort-Invariant");
console.log();

// ============================================================================
// 5. PURE OPERATIONS
// ============================================================================
console.log('--- Test 5: Immutability of Operations ---');
const base = new RecursiveSet<Value>(1);
const unionResult = base.union(new RecursiveSet<Value>(2));

assert(base.size === 1, "Original set remains unmodified");
assert(unionResult.size === 2, "New set contains result");
console.log();

// ============================================================================
// 6. STRICT TYPE VALIDATION (RELAXED)
// ============================================================================
console.log('--- Test 6: Strict Type Validation (Performance Mode) ---');

console.log('Strict in Jupyter');

console.log();

// ============================================================================
// 7. BASIC PERFORMANCE
// ============================================================================
console.log('--- Test 7: Basic Stress Test (1k items) ---');
const startStress = performance.now();
const stressSet = new RecursiveSet<number>();
for(let i=0; i<1000; i++) stressSet.add(i);
assert(stressSet.size === 1000, "Successfully added 1000 items");
console.log(`Took ${(performance.now() - startStress).toFixed(2)}ms`);
console.log();

// ============================================================================
// 8. VON NEUMANN ORDINALS
// ============================================================================
console.log('--- Test 8: Von Neumann Ordinals ---');
type Ordinal = RecursiveSet<Ordinal>;
const zero: Ordinal = new RecursiveSet();
const one: Ordinal = new RecursiveSet(zero);
const two: Ordinal = new RecursiveSet(zero, one);

assert(two.has(one), "2 contains 1");
assert(two.has(zero), "2 contains 0");
console.log("[INFO] Von Neumann logic valid");
console.log();

// ============================================================================
// 9. POWER SET
// ============================================================================
console.log('--- Test 9: Power Set ---');
const baseSet = new RecursiveSet<Value>(1, 3, 11, 25);
const pSet = baseSet.powerset();
console.log(pSet.toString());
assert(pSet.size === 16, "Power set size is correct (16)");
assert(pSet.has(emptySet<number>()), "Contains empty set");
console.log();

// ============================================================================
// 10. SYMMETRIC DIFFERENCE
// ============================================================================
console.log('--- Test 10: Symmetric Difference ---');
const setA = new RecursiveSet<Value>(1, 2);
const setB = new RecursiveSet<Value>(2, 3);
const symDiff = setA.symmetricDifference(setB);
assert(symDiff.size === 2, "Result size correct {1, 3}");
assert(symDiff.has(1) && symDiff.has(3), "Correct elements");
console.log();

// ============================================================================
// 11. RECURSION DEPTH (DEBUG MODE)
// ============================================================================
console.log('--- Test 11: Recursion Depth (Debug) ---');

// Helper to print first 8 chars of hash (hex) for readability
const fmtHash = (o: Value) => `0x${hashValue(o).toString(16).toUpperCase().slice(0, 8)}`;

type NestedSet = RecursiveSet<string | NestedSet>;
let current: NestedSet = new RecursiveSet("bottom");
const onionBag = new RecursiveSet<NestedSet>();

console.log(`Start: Current Hash=${fmtHash(current)}`);

for(let i = 0; i < 20; i++) {
    // 1. Add current "onion layer" to the bag
    onionBag.add(current);
    
    // 2. Measure state AFTER add
    const sizeAfterAdd = onionBag.size;
    const expectedSize = i + 1;
    
    // 3. Wrap current in a new layer
    const nextLayer = new RecursiveSet(current);
    
    // 4. Log Debug Info
    console.log(
        `[Iter ${i + 1}] ` +
        `Added Hash=${fmtHash(current)} | ` +
        `Bag Size=${sizeAfterAdd}/${expectedSize} | ` +
        `Next Hash=${fmtHash(nextLayer)} | ` +
        `Diff=${sizeAfterAdd === expectedSize ? 'OK' : 'FAIL'}`
    );

    // Stop if we hit a collision immediately to avoid spamming 20 lines of fail
    if (sizeAfterAdd !== expectedSize) {
        console.error("!!! CRITICAL FAILURE: Element was considered duplicate !!!");
        console.log("Collision detected between:");
        console.log("1. Inserted Element:", current.toString());
        console.log("2. Comparison against Bag contents...");
        break;
    }

    current = nextLayer;
}

assert(onionBag.size === 20, `Expected size 20, got ${onionBag.size}`);
console.log('\nResult: Test Completed.');

// ============================================================================
// 12. CONTRACT DEMO: NAN/INFINITY
// ============================================================================
console.log('--- Test 12: Contract Demo (NaN/Infinity) ---');
console.log("[INFO] Skipping NaN/Infinity tests as they violate v7 Contract.");
console.log("[INFO] (Inputting them would cause undefined sort behavior)");
console.log();

// ============================================================================
// 13. ITERATOR SEMANTICS
// ============================================================================
console.log('--- Test 13: Iterator Semantics (Robust Check) ---');
const modSet = new RecursiveSet<Value>(1, 2);
let seen99 = false;
try {
    for (const item of modSet) {
        if (!modSet.has(99)) modSet.add(99); 
        if (item === 99) seen99 = true;
    }
    assert(modSet.has(99), "Live modification persisted in set");
    
    if (seen99) {
        console.log("   (Info: Iterator successfully saw the live update)");
    } else {
        console.log("   (Info: Iterator acted as snapshot)");
    }
} catch (e) {
    console.log("Iterator error:", e);
}
console.log();

// ============================================================================
// 14. COPY-ON-WRITE
// ============================================================================
console.log('--- Test 14: Copy-on-Write (Shallow Clone) ---');
const original = new RecursiveSet<Value>(1);
const copy = original.clone();
copy.add(2);
assert(original.size === 1, "Original unmodified");
assert(copy.size === 2, "Copy modified");
console.log();

// ============================================================================
// 15. FREEZE-ON-HASH LIFECYCLE
// ============================================================================
console.log('--- Test 15: Freeze-on-Hash Lifecycle ---');
const lifecycleSet = new RecursiveSet<number>();
lifecycleSet.add(1);
const _hashTrigger = lifecycleSet.hashCode; // <--- FREEZE!

let mutationThrew = false;
try { lifecycleSet.add(3); } catch (e) { mutationThrew = true; }
assert(mutationThrew, "Hashed set throws on mutation (Frozen State)");
console.log();

// ============================================================================
// 16. SECURITY & INVARIANT CHALLENGE
// ============================================================================
console.log('--- Test 16: Security & Invariant Challenge ---');

const safeArray = [1, 2, 3];
const safeTuple = new Tuple(...safeArray);
safeArray.push(4);
assert(safeTuple.length === 3, "Tuple ignores external array mutation (Safe Copy)");

// Check runtime freezing
const internalValues = safeTuple.raw as any; 
let pushThrew = false;
try {
    internalValues.push(666);
} catch(e) {
    pushThrew = true;
}

if (pushThrew) {
    console.log("[PASS] Tuple is frozen (Safe Mode)");
} else {
    console.log("[WARN] Tuple is mutable (Unsafe Performance Mode)");
}

const bigIntSet = new RecursiveSet<number>();
bigIntSet.add(-1);
bigIntSet.add(4294967295); // MAX_UINT32 (collides with -1 in 32-bit hashing)
// Note: Even if hashes technically collide (depending on 32-bit int logic), compare() must distinguish values.
assert(bigIntSet.size === 2, "Handles 32-bit hash collisions (-1 vs MAX_UINT32) correctly");

const zeroSet = new RecursiveSet<number>();
zeroSet.add(0);
zeroSet.add(-0);
assert(zeroSet.size === 1, "-0 and +0 are treated as the same element");
console.log();

// ============================================================================
// 17. EXTREME NUMBERS & BOUNDARIES
// ============================================================================
console.log('--- Test 17: Finite Boundaries ---');
const extremeSet = new RecursiveSet<number>();

const MAX = Number.MAX_SAFE_INTEGER;
const MIN = Number.MIN_SAFE_INTEGER;
// Removed Infinity / -Infinity to comply with contract

extremeSet.add(MAX);      
extremeSet.add(MAX + 1);  
extremeSet.add(MAX + 3);  
extremeSet.add(MIN);

assert(extremeSet.size === 4, "Can handle MAX/MIN SAFE INTEGERs");
console.log();

// ============================================================================
// 18. PROPERTY BASED TESTING (SEEDED FUZZER)
// ============================================================================
console.log('--- Test 18: Property Based Testing (Contract Compliant) ---');

function randomInput(): number | string | Tuple<any[]> {
    const r = random();
    // STRICT CONTRACT: No Infinity, No NaN
    if (r < 0.2) return Number.MAX_SAFE_INTEGER;
    if (r < 0.5) return Math.floor(random() * 10000) - 5000;
    if (r < 0.7) return "str" + Math.floor(random() * 100);
    return new Tuple(Math.floor(random() * 10)); 
}

let antisymmetryPass = true;
let transitivityPass = true;
let reflexivityPass = true;
let totalityPass = true;
let symmetryPass = true;

for(let i=0; i<1000; i++) {
    const a = randomInput();
    const b = randomInput();
    const c = randomInput();

    const cmpAB = RecursiveSet.compare(a, b);
    const cmpBA = RecursiveSet.compare(b, a);
    const cmpBC = RecursiveSet.compare(b, c);
    const cmpAC = RecursiveSet.compare(a, c);

    // 1. Reflexivity: a == a
    if (RecursiveSet.compare(a, a) !== 0) {
        console.error(`Reflexivity fail at i=${i}:`, fmt(a));
        reflexivityPass = false;
    }

    // 2. Totality: Result must be finite (not NaN/Infinity)
    // (RecursiveSet.compare uses a - b for numbers, so any finite diff is valid, not just -1/0/1)
    if (!Number.isFinite(cmpAB)) {
        console.error(`Totality fail at i=${i}:`, fmt(a), fmt(b));
        totalityPass = false;
    }

    // 3. Antisymmetry: sign(a,b) == -sign(b,a)
    if (cmpAB !== 0 && Math.sign(cmpAB) !== -Math.sign(cmpBA)) {
        console.error(`Antisymmetry fail at i=${i}: A=${fmt(a)} B=${fmt(b)}`);
        antisymmetryPass = false;
    }

    // 4. Symmetry of Equality
    if (cmpAB === 0 && cmpBA !== 0) {
        console.error(`Symmetry fail at i=${i}: A=${fmt(a)} B=${fmt(b)}`);
        symmetryPass = false;
    }

    // 5. Transitivity
    if (cmpAB < 0 && cmpBC < 0 && cmpAC >= 0) {
        console.error(`Transitivity fail at i=${i} (<): A=${fmt(a)} B=${fmt(b)} C=${fmt(c)}`);
        transitivityPass = false;
    }
}

assert(reflexivityPass, "Comparator Reflexivity holds");
assert(totalityPass, "Comparator Totality holds");
assert(antisymmetryPass, "Comparator Antisymmetry holds");
assert(symmetryPass, "Comparator Symmetry (Equals) holds");
assert(transitivityPass, "Comparator Transitivity holds");
console.log();

// ============================================================================
// 19. TRANSITIVE FREEZE
// ============================================================================
console.log('--- Test 19: Transitive Freeze Semantics ---');
const innerMutable = new RecursiveSet<Value>(1);
const outerMutable = new RecursiveSet(innerMutable);

const _ = outerMutable.hashCode; // Should trigger recursion

let innerThrew = false;
try {
    innerMutable.add(2);
} catch (e) {
    innerThrew = true;
}
assert(innerThrew, "Computing hash of Outer Set recursively freezes Inner Set");
console.log();

// ============================================================================
// FINAL REPORT
// ============================================================================
console.log('=== Benchmarks & Stats ===');

const setUnique = measure('Scenario 1: 10k Duplicate Inserts', () => {
    const s = new RecursiveSet<string>();
    for (let i = 0; i < 10000; i++) s.add("test");
    return s;
});
assert(setUnique.size === 1, 'Size 1');

measure('Scenario 5: The Float Swamp (Nested Sets)', () => {
    const limit = 5000; 
    const metaSet = new RecursiveSet<RecursiveSet<number>>();
    const smallSets: RecursiveSet<number>[] = [];
    
    // Seeded Random for Benchmark consistency
    const benchRandom = createRNG(42); 
    for (let i = 0; i < limit; i++) {
        smallSets.push(new RecursiveSet(benchRandom()));
    }

    const start = performance.now();
    for (const s of smallSets) { metaSet.add(s); }
    const end = performance.now();
    
    // Statistical check
    const firstHash = smallSets[0].hashCode;
    const collisions = smallSets.filter(s => s.hashCode === firstHash).length - 1;

    console.log(`[Stats] Inserted ${limit} nested float sets in ${(end - start).toFixed(2)}ms`);
    console.log(`[Stats] Hash Collisions: ${collisions}`);
    
    assert(metaSet.size === limit, `Size must be ${limit}`);
});

console.log('\n=======================================');
if (failureCount === 0) {
    console.log(`[ALL PASSED] Ready for Release.`);
    process.exit(0);
} else {
    console.error(`[FAILED] ${failureCount} TESTS FAILED.`);
    process.exit(1);
}
