import { RecursiveSet } from './dist/esm/index.js';

// Helper function for assertions
function assert(condition: boolean, message: string) {
    if (!condition) {
        console.error(`❌ FAIL: ${message}`);
        process.exit(1);
    } else {
        console.log(`✅ PASS: ${message}`);
    }
}

console.log('=== RecursiveSet Enhanced Test Suite ===\n');

// ============================================================================
// 1. The "Bugfix" Test: Primitives with different references
// ============================================================================
console.log('--- Test 1: Primitive Value Equality (The Fix) ---');
const str1 = "hello";
const str2 = "hel" + "lo"; // New reference, same value

const setStrings = new RecursiveSet<string>();
setStrings.add(str1);

assert(setStrings.has(str2), "Set should find string by value, not reference");
assert(setStrings.size === 1, "Set should not add duplicate values");
console.log();

// ============================================================================
// 2. Mixed Types & Ordering
// ============================================================================
console.log('--- Test 2: Mixed Types (Primitives vs Sets) ---');
const mixedSet = new RecursiveSet<any>();
const innerSet = new RecursiveSet(1);

mixedSet.add(1);          // Primitive
mixedSet.add(innerSet);   // Set containing 1

assert(mixedSet.size === 2, "Set should contain both 1 and {1}");
assert(mixedSet.has(1), "Should have primitive 1");
assert(mixedSet.has(new RecursiveSet(1)), "Should have set {1}");

// Verify sort order (Primitives before Sets)
const it = mixedSet[Symbol.iterator]();
const first = it.next().value;
assert(typeof first === 'number', "Primitives should be ordered before Sets");
console.log();

// ============================================================================
// 3. Deep Structural Equality (The ZFC Core)
// ============================================================================
console.log('--- Test 3: Deep Structural Equality ---');
// A = {{1, 2}, {3}}
const A = new RecursiveSet(
    new RecursiveSet(1, 2),
    new RecursiveSet(3)
);

// B = {{3}, {2, 1}} (different internal insertion order)
const B = new RecursiveSet(
    new RecursiveSet(3),
    new RecursiveSet(2, 1)
);

assert(A.equals(B), "Sets should be equal regardless of insertion order");

const container = new RecursiveSet();
container.add(A);
assert(container.has(B), "Container should find B even if A was added");
console.log();

// ============================================================================
// 4. Cartesian Product (Kuratowski Pairs)
// ============================================================================
console.log('--- Test 4: Cartesian Product ---');
const setX = new RecursiveSet(1);
const setY = new RecursiveSet(2);
const product = setX.cartesianProduct(setY);

// Expected: { { {1}, {1, 2} } }
assert(product.size === 1, "Product size correct");

const pair = product.toSet().values().next().value as RecursiveSet<any>;
// The pair must have 2 elements: {1} and {1, 2}
assert(pair.size === 2, "Kuratowski pair must have 2 elements");
assert(pair.has(new RecursiveSet(1)), "Pair must contain singleton {a}");
assert(pair.has(new RecursiveSet(1, 2)), "Pair must contain {a, b}");
console.log();

// ============================================================================
// 5. Immutability of Operations
// ============================================================================
console.log('--- Test 5: Pure Operations Safety ---');
const base = new RecursiveSet(1);
const unionResult = base.union(new RecursiveSet(2));

assert(base.size === 1, "Original set must not be modified by union");
assert(unionResult.size === 2, "Result set must be modified");
console.log();

// ============================================================================
// 6. Foundation Axiom (Cycle Detection)
// ============================================================================
console.log('--- Test 6: Foundation Axiom ---');
const cycleSet = new RecursiveSet(1);
try {
    cycleSet.add(cycleSet);
    assert(false, "Should have thrown Error");
} catch (e: any) {
    assert(e.message.includes("Foundation axiom"), "Correct error message thrown");
}
console.log();

// ============================================================================
// 7. Performance / Stress (Mini Benchmark)
// ============================================================================
console.log('--- Test 7: Mini Stress Test (1000 items) ---');
const start = performance.now();
const stressSet = new RecursiveSet();
for(let i=0; i<1000; i++) {
    stressSet.add(i);
}
assert(stressSet.size === 1000, "Added 1000 items");
assert(stressSet.has(999), "Has last item");
const end = performance.now();
console.log(`Took ${(end - start).toFixed(2)}ms`);

// ============================================================================
// 8. Von Neumann Ordinals (Defining Numbers via Sets)
// ============================================================================
console.log('--- Test 8: Von Neumann Ordinals (0, 1, 2, 3) ---');
// 0 = ∅
const zero = new RecursiveSet();
// 1 = {0} = {∅}
const one = new RecursiveSet(zero);
// 2 = {0, 1} = {∅, {∅}}
const two = new RecursiveSet(zero, one);
// 3 = {0, 1, 2}
const three = new RecursiveSet(zero, one, two);

assert(zero.size === 0, "0 should be empty");
assert(one.size === 1 && one.has(zero), "1 should contain 0");
assert(two.size === 2 && two.has(zero) && two.has(one), "2 should contain 0 and 1");
assert(three.size === 3, "3 should contain 3 elements");

// Verify transitivity: 3 contains 2, 2 contains 1...
assert(three.has(two), "3 must contain 2");
assert(!two.has(three), "2 must not contain 3");
console.log("✓ Von Neumann construction holds");
console.log();

// ============================================================================
// 9. Power Set Logic
// ============================================================================
console.log('--- Test 9: Power Set Logic ---');
const baseSet = new RecursiveSet(1, 2, 3);
const pSet = baseSet.powerset();

// |P(S)| = 2^|S| -> 2^3 = 8
assert(pSet.size === 8, "Power set of 3 elements must have 8 elements");
// FIX: Specify generic type to match the power set's expected element type
assert(pSet.has(new RecursiveSet<number>()), "Power set must contain empty set");
assert(pSet.has(baseSet), "Power set must contain the original set itself");

// P(P(∅)) -> P({∅}) -> {∅, {∅}}
const empty = new RecursiveSet();
const pEmpty = empty.powerset(); // {∅}
const ppEmpty = pEmpty.powerset(); // {∅, {∅}}

assert(pEmpty.size === 1, "P(∅) size is 1");
assert(ppEmpty.size === 2, "P(P(∅)) size is 2");
console.log();

// ============================================================================
// 10. Graph Representation (G = (V, E))
// ============================================================================
console.log('--- Test 10: Graph as Sets (V, E) ---');
// Nodes V = {a, b, c}
const V = new RecursiveSet("a", "b", "c");

// Edge (a, b) as Kuratowski Pair {{a}, {a,b}}
// E = {(a,b), (b,c), (c,a)} -> Cycle
const edgeAB = new RecursiveSet(new RecursiveSet("a"), new RecursiveSet("a", "b"));
const edgeBC = new RecursiveSet(new RecursiveSet("b"), new RecursiveSet("b", "c"));
const edgeCA = new RecursiveSet(new RecursiveSet("c"), new RecursiveSet("c", "a"));

const E = new RecursiveSet(edgeAB, edgeBC, edgeCA);
const G = new RecursiveSet(V, E); // Graph G = {V, E}

assert(G.size === 2, "Graph consists of V and E");
// Check if E is conceptually a subset of V x V
assert(E.has(edgeAB), "Graph must define edge a->b");
console.log("✓ Graph structure valid");
console.log();

// ============================================================================
// 11. Complex Symmetric Difference
// ============================================================================
console.log('--- Test 11: Complex Symmetric Difference ---');
// A = { 1, {2}, {3,4} }
const setA = new RecursiveSet<any>(1, new RecursiveSet(2), new RecursiveSet(3, 4));
// B = { 1, {2}, {5} }
const setB = new RecursiveSet<any>(1, new RecursiveSet(2), new RecursiveSet(5));

// A ∆ B = (A \ B) U (B \ A)
// Expected: { {3,4}, {5} } -> 1 and {2} are removed
const symDiff = setA.symmetricDifference(setB);

assert(symDiff.size === 2, "Symmetric difference size correct");
assert(!symDiff.has(1), "Common element 1 removed");
assert(!symDiff.has(new RecursiveSet(2)), "Common element {2} removed");
assert(symDiff.has(new RecursiveSet(3, 4)), "Unique in A kept");
assert(symDiff.has(new RecursiveSet(5)), "Unique in B kept");
console.log();

// ============================================================================
// 12. The "Stress" Structure (Mixed Depth)
// ============================================================================
console.log('--- Test 12: Mixed Depth Stress ---');
const deepSet = new RecursiveSet();
let current = new RecursiveSet("bottom");

// Build onion layers: { "bottom", {"bottom"}, {{"bottom"}} ... }
// Throw everything into ONE set
const onionBag = new RecursiveSet();

for(let i=0; i<20; i++) {
    onionBag.add(current);
    current = new RecursiveSet(current); // Wrap it
}

assert(onionBag.size === 20, "Onion bag must strictly distinguish all recursion levels");
// Check if deepest element is present
const bottom = new RecursiveSet("bottom");
assert(onionBag.has(bottom), "Must contain level 0");
assert(onionBag.has(new RecursiveSet(bottom)), "Must contain level 1");
console.log();

// ============================================================================
// 13. The NaN Paradox
// ============================================================================
console.log('--- Test 13: NaN Handling ---');
const nanSet = new RecursiveSet<number>();

let threw = false;
try {
    nanSet.add(NaN);
} catch (e: any) {
    threw = true;
    console.log(`Caught expected error: ${e.message}`);
}

assert(threw, "Adding NaN should throw an explicit error");
console.log();

// ============================================================================
// 14. Iterator Snapshot Isolation (Concurrent Modification)
// ============================================================================
console.log('--- Test 14: Iterator Snapshot Isolation ---');
const modSet = new RecursiveSet(1, 2, 3);
const items: number[] = [];

// Iterate over the set... (Snapshot: Version A)
for (const item of modSet) {
    items.push(item as number);
    
    // ...and add concurrently! (Creates Version B)
    // Since the iterator runs on Version A, it must NOT see 99.
    modSet.add(99); 
}

// Assertion 1: Iterator ran on the old snapshot
assert(items.length === 3, "Iterator loop should finish based on initial snapshot (3 items)");
assert(!items.includes(99), "New element 99 should NOT appear in the current loop");

// Assertion 2: The set object itself is updated
console.log(modSet.toString());
assert(modSet.size === 4, "The set object itself should reflect the add() operation (size 4)");
assert(modSet.has(99), "The set object should contain 99");

console.log("✓ Snapshot isolation verified");
console.log();

console.log("=== All Tests Passed Successfully ✓ ===");
