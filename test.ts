import { RecursiveSet, emptySet, Tuple } from './dist/esm/index.js';

// === Test Utilities ===

function measure<T>(label: string, fn: () => T): T {
    const start = performance.now();
    const result = fn();
    const end = performance.now();
    console.log(`[PERF] ${label}: ${(end - start).toFixed(2)}ms`);
    return result;
}

function assert(condition: boolean, message: string) {
    if (!condition) {
        console.error(`❌ FAIL: ${message}`);
        process.exit(1);
    } else {
        console.log(`✅ PASS: ${message}`);
    }
}

console.log('=== RecursiveSet Test Suite (V2.4.0 Strict) ===\n');

// ============================================================================
// 1. Primitive Value Semantics
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
// 2. Type Handling & Ordering
// ============================================================================
console.log('--- Test 2: Mixed Types (Primitives vs Sets) ---');
const mixedSet = new RecursiveSet<number | RecursiveSet<number>>();
const innerSet = new RecursiveSet(1);

mixedSet.add(1);          
mixedSet.add(innerSet);   

assert(mixedSet.size === 2, "Set contains both primitive 1 and set {1}");
assert(mixedSet.has(1), "Contains primitive 1");
assert(mixedSet.has(new RecursiveSet(1)), "Contains set {1}");

// Verify sort order: Primitives < Tuples < Sets
const it = mixedSet[Symbol.iterator]();
const first = it.next().value;
assert(typeof first === 'number', "Ordering: Primitives must precede Sets");
console.log();


// ============================================================================
// 3. Deep Structural Equality (ZFC Core)
// ============================================================================
console.log('--- Test 3: Deep Structural Equality ---');
const A = new RecursiveSet(new RecursiveSet(1, 2), new RecursiveSet(3));
const B = new RecursiveSet(new RecursiveSet(3), new RecursiveSet(2, 1));

assert(A.equals(B), "Sets are equal regardless of insertion order");
console.log();


// ============================================================================
// 4. Cartesian Product
// ============================================================================
console.log('--- Test 4: Cartesian Product (Tuples) ---');
const setX = new RecursiveSet(1);
const setY = new RecursiveSet(2);
const product = setX.cartesianProduct(setY);

assert(product.size === 1, "Product size is correct");

const tuple = product.toSet().values().next().value as Tuple<[number, number]>;
assert(tuple instanceof Tuple, "Result contains Tuple instances");
assert(tuple.length === 2, "Tuple has length 2");
assert(tuple.get(0) === 1, "First element is 1");
assert(tuple.get(1) === 2, "Second element is 2");

const manualTuple = new Tuple(1, 2);
assert(product.has(manualTuple), "Product contains structurally equal tuple");
console.log();


// ============================================================================
// 5. Pure Operations
// ============================================================================
console.log('--- Test 5: Immutability of Operations ---');
const base = new RecursiveSet(1);
const unionResult = base.union(new RecursiveSet(2));

assert(base.size === 1, "Original set remains unmodified");
assert(unionResult.size === 2, "New set contains result");
console.log();


// ============================================================================
// 6. REJECTED Types (The V3.0 Feature)
// ============================================================================
console.log('--- Test 6: Rejected Types (Arrays/Objects) ---');

const setArr = new RecursiveSet<number[]>();
let threwArr = false;
try {
    setArr.add([1, 2]);
} catch (e: any) {
    threwArr = true;
    // assert(e.message.includes("Use 'new Tuple(...)'")); // Optional check
}
assert(threwArr, "Plain Arrays are REJECTED");

const setObj = new RecursiveSet<object>();
let threwObj = false;
try {
    setObj.add({ a: 1 });
} catch (e) {
    threwObj = true;
}
assert(threwObj, "Plain Objects are REJECTED");

const setTup = new RecursiveSet<Tuple<[number, number]>>();
setTup.add(new Tuple(1, 2));
setTup.add(new Tuple(1, 2));
assert(setTup.size === 1, "Tuples work correctly (Value Equality)");
console.log();


// ============================================================================
// 7. Basic Performance
// ============================================================================
console.log('--- Test 7: Basic Stress Test (1k items) ---');
const start = performance.now();
const stressSet = new RecursiveSet<number>();
for(let i=0; i<1000; i++) {
    stressSet.add(i);
}
assert(stressSet.size === 1000, "Successfully added 1000 items");
console.log(`Took ${(performance.now() - start).toFixed(2)}ms`);
console.log();


// ============================================================================
// 8. Von Neumann Ordinals
// ============================================================================
console.log('--- Test 8: Von Neumann Ordinals ---');
// Recursive type structure requires flexibility
type Ordinal = RecursiveSet<Ordinal>;
const zero: Ordinal = new RecursiveSet();
const one: Ordinal = new RecursiveSet(zero);
const two: Ordinal = new RecursiveSet(zero, one);

assert(two.has(one), "2 contains 1");
assert(two.has(zero), "2 contains 0");
console.log("✓ Von Neumann logic valid");
console.log();


// ============================================================================
// 9. Power Set
// ============================================================================
console.log('--- Test 9: Power Set ---');
const baseSet = new RecursiveSet(1, 2, 3);
const pSet = baseSet.powerset();

assert(pSet.size === 8, "Power set size is correct (8)");
assert(pSet.has(emptySet<number>()), "Contains empty set");
console.log();


// ============================================================================
// 10. Symmetric Difference
// ============================================================================
console.log('--- Test 10: Symmetric Difference ---');
const setA = new RecursiveSet(1, 2);
const setB = new RecursiveSet(2, 3);
const symDiff = setA.symmetricDifference(setB);

assert(symDiff.size === 2, "Result size correct {1, 3}");
assert(symDiff.has(1) && symDiff.has(3), "Correct elements");
console.log();


// ============================================================================
// 11. Recursion Depth
// ============================================================================
console.log('--- Test 11: Recursion Depth ---');
type NestedSet = RecursiveSet<string | NestedSet>;
let current: NestedSet = new RecursiveSet("bottom");
const onionBag = new RecursiveSet<NestedSet>();

for(let i=0; i<20; i++) {
    onionBag.add(current);
    current = new RecursiveSet(current); 
}
assert(onionBag.size === 20, "Distinguishes 20 levels of recursion");
console.log();


// ============================================================================
// 12. NaN Handling
// ============================================================================
console.log('--- Test 12: NaN Handling ---');
const nanSet = new RecursiveSet<number>();
let threw = false;
try {
    nanSet.add(NaN);
} catch (e) {
    threw = true;
}
assert(threw, "Explicitly rejects NaN");
console.log();


// ============================================================================
// 13. Iterator Snapshot
// ============================================================================
console.log('--- Test 13: Iterator Snapshot ---');
const modSet = new RecursiveSet(1, 2);
const items: number[] = [];

for (const item of modSet) {
    items.push(item as number);
    modSet.add(99); 
}

assert(items.length === 2, "Iterator respects snapshot");
assert(!items.includes(99), "New elements hidden from iterator");
console.log();


// ============================================================================
// 14. Copy-on-Write
// ============================================================================
console.log('--- Test 14: Copy-on-Write ---');
const original = new RecursiveSet(1);
const copy = original.clone();
copy.add(2);

assert(original.size === 1, "Original unmodified");
assert(copy.size === 2, "Copy modified");
console.log();


console.log("=== Functional Tests Passed ✓ ===");


console.log('\n=== RecursiveSet Performance Benchmarks ===\n');

// 1. Idempotency
const setUnique = measure('Scenario 1: 10k Duplicates', () => {
    const s = new RecursiveSet<string>();
    for (let i = 0; i < 10000; i++) s.add("test");
    return s;
});
assert(setUnique.size === 1, 'Size 1');

// 2. Flat Insert
const setRandom = measure('Scenario 2: 10k Random', () => {
    const s = new RecursiveSet<number>();
    for (let i = 0; i < 10000; i++) s.add(Math.random());
    return s;
});
assert(setRandom.size === 10000, 'Size 10k');

// 3. Recursion Stress
const limit = 2000; 
measure(`Scenario 3: ${limit} Von Neumann Ordinals`, () => {
    type Ord = RecursiveSet<Ord>;
    let current: Ord = new RecursiveSet();
    const all = new Array(limit);
    for (let i = 0; i < limit; i++) {
        all[i] = current;
        const next = current.clone();
        next.add(current);
        current = next;
    }
    assert(current.size === limit, `Size ${limit}`);
});

// 4. Lazy Iterator
const setC = new RecursiveSet<number>();
const setD = new RecursiveSet<number>();
for(let i=1000; i<51000; i++) { setC.add(i); setD.add(i); }
setC.add(0); setD.add(1);

measure('Scenario 4: Lazy Compare (50k)', () => {
    assert(setC.equals(setD) === false, 'Not equal');
});

console.log('\n✅ All Benchmarks Completed');
