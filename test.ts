import { RecursiveSet, emptySet } from './dist/esm/index.js';

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

console.log('=== RecursiveSet Test Suite ===\n');

// ============================================================================
// 1. Primitive Value Semantics
// ============================================================================
console.log('--- Test 1: Primitive Value Equality ---');
const str1 = "hello";
const str2 = "hel" + "lo"; // Different reference, same value

const setStrings = new RecursiveSet<string>();
setStrings.add(str1);

assert(setStrings.has(str2), "Set identifies strings by value, not reference");
assert(setStrings.size === 1, "Set prevents duplicate values");
console.log();


// ============================================================================
// 2. Type Handling & Ordering
// ============================================================================
console.log('--- Test 2: Mixed Types (Primitives vs Sets) ---');
const mixedSet = new RecursiveSet<any>();
const innerSet = new RecursiveSet(1);

mixedSet.add(1);          // Primitive
mixedSet.add(innerSet);   // Set containing 1

assert(mixedSet.size === 2, "Set contains both primitive 1 and set {1}");
assert(mixedSet.has(1), "Contains primitive 1");
assert(mixedSet.has(new RecursiveSet(1)), "Contains set {1}");

// Verify internal sort order: Primitives should come before Sets
const it = mixedSet[Symbol.iterator]();
const first = it.next().value;
assert(typeof first === 'number', "Ordering violation: Primitives must precede Sets");
console.log();


// ============================================================================
// 3. Deep Structural Equality (ZFC Core)
// ============================================================================
console.log('--- Test 3: Deep Structural Equality ---');
// A = {{1, 2}, {3}}
const A = new RecursiveSet(
    new RecursiveSet(1, 2),
    new RecursiveSet(3)
);

// B = {{3}, {2, 1}} (Differs in insertion order)
const B = new RecursiveSet(
    new RecursiveSet(3),
    new RecursiveSet(2, 1)
);

assert(A.equals(B), "Sets are equal regardless of insertion order");

const container = new RecursiveSet();
container.add(A);
assert(container.has(B), "Container identifies B as present because A is equal to B");
console.log();


// ============================================================================
// 4. Cartesian Product
// ============================================================================
console.log('--- Test 4: Cartesian Product (Kuratowski Pairs) ---');
const setX = new RecursiveSet(1);
const setY = new RecursiveSet(2);
const product = setX.cartesianProduct(setY);

// Expected: { { {1}, {1, 2} } }
assert(product.size === 1, "Product size is correct");

const pair = product.toSet().values().next().value as RecursiveSet<any>;
assert(pair.size === 2, "Kuratowski pair has exactly 2 elements");
assert(pair.has(new RecursiveSet(1)), "Pair contains singleton {a}");
assert(pair.has(new RecursiveSet(1, 2)), "Pair contains {a, b}");
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
// 6. Foundation Axiom
// ============================================================================
console.log('--- Test 6: Foundation Axiom (Cycle Detection) ---');
const cycleSet = new RecursiveSet(1);
try {
    cycleSet.add(cycleSet);
    assert(false, "Should have thrown an Error");
} catch (e: any) {
    assert(e.message.includes("Foundation axiom"), "Correctly identified cycle violation");
}
console.log();


// ============================================================================
// 7. Basic Performance
// ============================================================================
console.log('--- Test 7: Basic Stress Test (1k items) ---');
const start = performance.now();
const stressSet = new RecursiveSet();
for(let i=0; i<1000; i++) {
    stressSet.add(i);
}
assert(stressSet.size === 1000, "Successfully added 1000 items");
assert(stressSet.has(999), "Successfully retrieved last item");
const end = performance.now();
console.log(`Took ${(end - start).toFixed(2)}ms`);
console.log();


// ============================================================================
// 8. Von Neumann Ordinals
// ============================================================================
console.log('--- Test 8: Von Neumann Ordinals (Construction) ---');
// 0 = ∅
const zero = new RecursiveSet();
// 1 = {0}
const one = new RecursiveSet(zero);
// 2 = {0, 1}
const two = new RecursiveSet(zero, one);
// 3 = {0, 1, 2}
const three = new RecursiveSet(zero, one, two);

assert(zero.size === 0, "0 is empty");
assert(one.size === 1 && one.has(zero), "1 contains 0");
assert(two.size === 2 && two.has(zero) && two.has(one), "2 contains 0 and 1");
assert(three.size === 3, "3 contains 0, 1, and 2");

assert(three.has(two), "Transitivity: 3 contains 2");
assert(!two.has(three), "Asymmetry: 2 does not contain 3");
console.log("✓ Von Neumann logic valid");
console.log();


// ============================================================================
// 9. Power Set
// ============================================================================
console.log('--- Test 9: Power Set ---');
const baseSet = new RecursiveSet(1, 2, 3);
const pSet = baseSet.powerset();

// |P(S)| = 2^|S| -> 2^3 = 8
assert(pSet.size === 8, "Power set size is correct (8)");
assert(pSet.has(emptySet<number>()), "Contains empty set");
assert(pSet.has(baseSet), "Contains original set");

// P(P(∅)) -> {∅, {∅}}
const pEmpty = emptySet().powerset(); 
const ppEmpty = pEmpty.powerset(); 

assert(pEmpty.size === 1, "P(∅) size is 1");
assert(ppEmpty.size === 2, "P(P(∅)) size is 2");
console.log();


// ============================================================================
// 10. Graph Representation
// ============================================================================
console.log('--- Test 10: Graphs (Sets as Nodes/Edges) ---');
const V = new RecursiveSet("a", "b", "c");

// Edge (a, b) as Kuratowski Pair {{a}, {a,b}}
const edgeAB = new RecursiveSet(new RecursiveSet("a"), new RecursiveSet("a", "b"));
const edgeBC = new RecursiveSet(new RecursiveSet("b"), new RecursiveSet("b", "c"));
const edgeCA = new RecursiveSet(new RecursiveSet("c"), new RecursiveSet("c", "a"));

const E = new RecursiveSet(edgeAB, edgeBC, edgeCA);
const G = new RecursiveSet(V, E); 

assert(G.size === 2, "Graph defined as {V, E}");
assert(E.has(edgeAB), "Edge definition is valid");
console.log();


// ============================================================================
// 11. Symmetric Difference
// ============================================================================
console.log('--- Test 11: Symmetric Difference ---');
// A = { 1, {2}, {3,4} }
const setA = new RecursiveSet<any>(1, new RecursiveSet(2), new RecursiveSet(3, 4));
// B = { 1, {2}, {5} }
const setB = new RecursiveSet<any>(1, new RecursiveSet(2), new RecursiveSet(5));

// A ∆ B = (A \ B) U (B \ A) => { {3,4}, {5} }
const symDiff = setA.symmetricDifference(setB);

assert(symDiff.size === 2, "Result size correct");
assert(!symDiff.has(1), "Intersection removed (1)");
assert(!symDiff.has(new RecursiveSet(2)), "Intersection removed ({2})");
assert(symDiff.has(new RecursiveSet(3, 4)), "Unique A kept");
assert(symDiff.has(new RecursiveSet(5)), "Unique B kept");
console.log();


// ============================================================================
// 12. Recursion Depth Stress
// ============================================================================
console.log('--- Test 12: Recursion Depth (Onion Structure) ---');
const deepSet = new RecursiveSet();
let current = new RecursiveSet("bottom");
const onionBag = new RecursiveSet();

for(let i=0; i<20; i++) {
    onionBag.add(current);
    current = new RecursiveSet(current); 
}

assert(onionBag.size === 20, "Distinguishes 20 levels of recursion depth");
const bottom = new RecursiveSet("bottom");
assert(onionBag.has(bottom), "Contains level 0");
assert(onionBag.has(new RecursiveSet(bottom)), "Contains level 1");
console.log();


// ============================================================================
// 13. Edge Case: NaN
// ============================================================================
console.log('--- Test 13: NaN Handling ---');
const nanSet = new RecursiveSet<number>();
let threw = false;
try {
    nanSet.add(NaN);
} catch (e: any) {
    threw = true;
}
assert(threw, "Explicitly rejects NaN");
console.log();


// ============================================================================
// 14. Iterator Snapshot Isolation
// ============================================================================
console.log('--- Test 14: Iterator Snapshot Isolation ---');
const modSet = new RecursiveSet(1, 2, 3);
const items: number[] = [];

for (const item of modSet) {
    items.push(item as number);
    // Concurrent modification
    modSet.add(99); 
}

assert(items.length === 3, "Iterator respects initial snapshot");
assert(!items.includes(99), "New elements not visible to active iterator");
assert(modSet.size === 4, "Underlying set updated successfully");
console.log();


// ============================================================================
// 15. Copy-on-Write
// ============================================================================
console.log('--- Test 15: Copy-on-Write (Clone) ---');
const original = new RecursiveSet(1, 2, 3);
const copy = original.clone();

assert(original.equals(copy), "Clone is identical to original");
copy.add(4);

assert(original.size === 3, "Original unaffected by clone mutation");
assert(copy.size === 4, "Clone updated independently");
console.log();


// ============================================================================
// 16. Edge Case: Remove Stability
// ============================================================================
console.log('--- Test 16: Remove Non-Existent Element ---');
const stableSet = new RecursiveSet(1, 2, 3);
const originalHash = (stableSet as any)._hash; // Access private hash for testing

stableSet.remove(999); // Should do nothing

assert(stableSet.size === 3, "Size remains unchanged");
assert((stableSet as any)._hash === originalHash, "Hash remains stable (no XOR corruption)");
console.log();


console.log("=== Functional Tests Passed ✓ ===");


console.log('\n=== RecursiveSet Performance Benchmarks ===\n');

// ---------------------------------------------------------
// Scenario 1: Idempotency (Duplicate suppression)
// ---------------------------------------------------------
console.log('--- Scenario 1: Idempotency (10k Duplicates) ---');
const setUnique = measure('Insert', () => {
    const s = new RecursiveSet();
    const element = "Endboss";
    for (let i = 0; i < 10000; i++) {
        s.add(element);
    }
    return s;
});
assert(setUnique.size === 1, 'Correctly collapsed to size 1');


// ---------------------------------------------------------
// Scenario 2: Flat Performance
// ---------------------------------------------------------
console.log('\n--- Scenario 2: Flat Insert (10k Random Primitives) ---');
const setRandom = measure('Insert', () => {
    const s = new RecursiveSet();
    for (let i = 0; i < 10000; i++) {
        s.add(Math.random());
    }
    return s;
});
assert(setRandom.size === 10000, 'Size correct');

const firstVal = setRandom[Symbol.iterator]().next().value;
const lookupFound = measure('Lookup (First Element)', () => {
    return setRandom.has(firstVal);
});
assert(lookupFound === true, 'Element found');


// ---------------------------------------------------------
// Scenario 3: Recursion Stress (Von Neumann)
// ---------------------------------------------------------
console.log('\n--- Scenario 3: Von Neumann Hierarchy (Recursion Stress) ---');
// We build natural numbers via ZFC: n = {0, 1, ..., n-1}
const limit = 2000; 

measure(`Constructing first ${limit} Ordinals`, () => {
    let currentOrdinal = new RecursiveSet();
    const allOrdinals = new Array(limit);

    for (let i = 0; i < limit; i++) {
        allOrdinals[i] = currentOrdinal;
        // Cloning + adding self creates the next ordinal
        const nextOrdinal = currentOrdinal.clone();
        nextOrdinal.add(currentOrdinal);
        currentOrdinal = nextOrdinal;
    }
    
    assert(currentOrdinal.size === limit, `Final size is ${limit}`);
    assert(currentOrdinal.has(allOrdinals[limit-1]), 'Contains predecessor');
});


// ---------------------------------------------------------
// Scenario 4: Lazy Iterator Verification
// ---------------------------------------------------------
console.log('\n--- Scenario 4: Lazy Iterator Proof ---');
const setC = new RecursiveSet();
const setD = new RecursiveSet();

console.log('Building large sets (50k elements)...');
for(let i=1000; i<51000; i++) {
    setC.add(i);
    setD.add(i);
}
// Difference at the very beginning
setC.add(0);
setD.add(1);

measure('Compare (Immediate Difference)', () => {
    // Lazy iterator should return immediately upon seeing 0 != 1
    const result = setC.equals(setD);
    assert(result === false, 'Sets are not equal');
});

console.log('\n✅ All Benchmarks Completed');