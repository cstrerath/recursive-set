import { RecursiveMap, RecursiveSet, Tuple, Value } from '../src/hash';

// --- Simple Test Runner ---
let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
    try {
        process.stdout.write(`Testing: ${name.padEnd(50)} `);
        fn();
        console.log("✅ PASS");
        passed++;
    } catch (e : any) {
        console.log("❌ FAIL");
        console.error("   Error:", e.message);
        failed++;
    }
}

function assert(condition: boolean, msg: string) {
    if (!condition) throw new Error(msg);
}

function assertEquals(actual: any, expected: any, msg: string) {
    // Einfacher String-Vergleich für diesen Test
    if (String(actual) !== String(expected)) {
        throw new Error(`${msg} | Expected: ${expected}, Got: ${actual}`);
    }
}

console.log("🔥 STARTING EXTENSIVE AUTOMATA MAP TESTS 🔥\n");

// =========================================================
// SCENARIO 1: The Standard DFA (Tuple Keys)
// Delta: (q, c) -> q'
// =========================================================
test("Standard DFA Transitions (Tuple Keys)", () => {
    // Map<[State, Char], State>
    const delta = new RecursiveMap<Tuple<[number, string]>, number>();

    // States: 0, 1, 2
    // Transitions: (0, 'a') -> 1, (0, 'b') -> 2
    const k1 = new Tuple(0, 'a');
    const k2 = new Tuple(0, 'b');

    delta.set(k1, 1);
    delta.set(k2, 2);

    // Assert Size
    assert(delta.size === 2, "Map should have 2 transitions");

    // Assert Lookup with FRESH instances (Value Equality)
    assert(delta.get(new Tuple(0, 'a')) === 1, "Lookup (0, 'a') failed");
    assert(delta.get(new Tuple(0, 'b')) === 2, "Lookup (0, 'b') failed");
    
    // Assert Miss
    assert(delta.get(new Tuple(0, 'c')) === undefined, "Lookup (0, 'c') should be undefined");
});

// =========================================================
// SCENARIO 1b: The Standard DFA (Array Keys)
// Delta: [q, c] -> q'
// =========================================================
test("Standard DFA Transitions (Array Keys)", () => {
    // Map<[State, Char], State>
    // Beachte: Wir nutzen hier ReadonlyArray bzw. einfach Array im Generischen Typ
    const delta = new RecursiveMap<ReadonlyArray<number | string>, number>();

    // States: 0, 1, 2
    // Transitions: [0, 'a'] -> 1, [0, 'b'] -> 2

    // WICHTIG: Das sind ganz normale JS Arrays!
    const k1 = [0, 'a'];
    const k2 = [0, 'b'];

    delta.set(k1, 1);
    delta.set(k2, 2);

    // Assert Size
    assert(delta.size === 2, "Map should have 2 transitions");

    // Assert Lookup with FRESH instances (Value Equality)
    // Hier erstellen wir neue Array-Literale [0, 'a'] - neue Referenz im Speicher!
    // Die Map muss per Hash/Deep-Compare erkennen, dass es "dasselbe" ist.
    assert(delta.get([0, 'a']) === 1, "Lookup [0, 'a'] failed");
    assert(delta.get([0, 'b']) === 2, "Lookup [0, 'b'] failed");

    // Assert Miss
    assert(delta.get([0, 'c']) === undefined, "Lookup [0, 'c'] should be undefined");
});

// =========================================================
// SCENARIO 2: NFA to DFA Conversion (Set Keys)
// The keys of the DFA transition table are SETS of NFA states.
// Delta: (Set<q_nfa>, c) -> Set<q_nfa>
// =========================================================
test("Powerset Construction (Set Keys)", () => {
    // Map<RecursiveSet<State>, string>
    // We map a Set of states to a descriptive name
    const dfaStates = new RecursiveMap<RecursiveSet<number>, string>();

    const q0 = new RecursiveSet(0);
    const q0q1 = new RecursiveSet(0, 1);
    const qDead = new RecursiveSet<number>(); // Empty Set

    dfaStates.set(q0, "Start");
    dfaStates.set(q0q1, "Active");
    dfaStates.set(qDead, "Trap");

    // Lookup Re-creation
    // WICHTIG: Reihenfolge vertauscht! (1, 0) statt (0, 1)
    const lookupActive = new RecursiveSet(1, 0); 
    const lookupDead = new RecursiveSet<number>();

    assert(dfaStates.get(lookupActive) === "Active", "Set {1,0} should match Key {0,1}");
    assert(dfaStates.get(lookupDead) === "Trap", "Empty Set Key should work");
    
    // Ensure Distinctness
    assert(dfaStates.get(q0) !== dfaStates.get(lookupActive), "{0} and {0,1} must be distinct keys");
});


// =========================================================
// SCENARIO 3: Complex Transition Keys
// Key: Tuple(Set<State>, Char)
// Used when building the DFA transition table: delta( {q0,q1}, 'a' ) = ...
// =========================================================
test("Complex DFA Table Keys: ([Set], Char)", () => {
    // Map<Tuple<[Set<State>, Char]>, Set<State>>
    const transitionTable = new RecursiveMap<Tuple<[RecursiveSet<number>, string]>, RecursiveSet<number>>();

    const stateSet = new RecursiveSet(1, 2, 3);
    const char = 'a';
    const resultState = new RecursiveSet(4);

    const key = new Tuple(stateSet, char); // ({1,2,3}, 'a')
    transitionTable.set(key, resultState);

    // Reconstruct key completely from scratch
    const searchKey = new Tuple(new RecursiveSet(3, 1, 2), 'a');
    
    const found = transitionTable.get(searchKey);
    
    assert(found !== undefined, "Complex Lookup failed");
    assert(found!.equals(resultState), "Result value mismatch");
});


// =========================================================
// SCENARIO 4: The "Inception" Map
// Map inside a Map inside a Map
// =========================================================
test("Recursive Map-Inception", () => {
    const inner = new RecursiveMap<string, number>();
    inner.set("a", 1);

    const outer = new RecursiveMap<RecursiveMap<string, number>, string>();
    outer.set(inner, "Found Inner");

    // Recreate inner map
    const innerClone = new RecursiveMap<string, number>();
    innerClone.set("a", 1);

    assert(outer.get(innerClone) === "Found Inner", "Map as Key failed");

    // Modify clone -> Hash should change (logically different map)
    // Aber RecursiveMap ist semi-immutable. Wir müssen mutableCopy testen.
    const innerModified = innerClone.mutableCopy();
    innerModified.set("b", 2);

    assert(outer.get(innerModified) === undefined, "Modified Map should NOT be found");
});


// =========================================================
// SCENARIO 5: Stress & Collisions
// Many keys, potential hash collisions handled via deep compare
// =========================================================
test("Stress Test (1000 items)", () => {
    const map = new RecursiveMap<Tuple<[number]>, number>();
    const count = 1000;

    for (let i = 0; i < count; i++) {
        map.set(new Tuple(i), i * 2);
    }

    assert(map.size === count, `Size should be ${count}`);

    // Random Access Check
    assert(map.get(new Tuple(0)) === 0, "Index 0 check");
    assert(map.get(new Tuple(500)) === 1000, "Index 500 check");
    assert(map.get(new Tuple(999)) === 1998, "Index 999 check");
    assert(map.get(new Tuple(1000)) === undefined, "Out of bounds check");
});


// =========================================================
// SCENARIO 6: Immutability / Frozen State
// Once used as a key, objects should be frozen
// =========================================================
test("Immutability Contract", () => {
    const map = new RecursiveMap<RecursiveSet<number>, string>();
    const setKey = new RecursiveSet<number>(1);

    map.set(setKey, "Value");

    // Trigger Hash Calculation inside Map (happens during set/get internally usually, 
    // but definitely when the MAP itself is hashed or hashCode accessed)
    const h = map.hashCode; 

    // setKey is now part of the map structure. 
    // Standard RecursiveSet throws on mutation if it is frozen.
    // Check if adding to the set throws
    try {
        setKey.add(2);
        // Hinweis: Wenn setKey noch nicht explizit frozen ist (weil HashCode noch nicht gecached wurde), 
        // könnte es durchgehen, WENN wir nicht map.hashCode aufgerufen hätten.
        // Aber RecursiveSet friert sich ein, sobald sein eigener hashCode abgerufen wird.
        // Der Map.hashCode ruft Key.hashCode auf. Ergo: setKey MUSS frozen sein.
        throw new Error("Mutation succeeded but should have failed");
    } catch (e : any) {
        assert(e.message.includes("frozen"), "Error should be about frozen state");
    }
});


// =========================================================
// SCENARIO 7: Edge Cases (Unicode, Empty)
// =========================================================
test("Edge Cases: Unicode & Empty", () => {
    const map = new RecursiveMap<string, string>();
    
    // Empty String Key
    map.set("", "Empty");
    assert(map.get("") === "Empty", "Empty string key failed");

    // Unicode Key (Automata often use Greek letters)
    map.set("ε", "Epsilon");
    map.set("δ", "Delta");
    
    assert(map.get("ε") === "Epsilon", "Unicode ε failed");
    assert(map.get("δ") === "Delta", "Unicode δ failed");

    // Delete
    map.delete("ε");
    assert(map.get("ε") === undefined, "Delete failed");
    assert(map.size === 2, "Size wrong after delete"); // "" and "δ" left
});

// =========================================================
// SCENARIO 8: Overwrite / Update Semantics
// set(k, v1) -> set(k, v2) must keep size constant and update value
// =========================================================
test("Overwrite Existing Key", () => {
    const map = new RecursiveMap<Tuple<[number]>, string>();
    const keyInstance1 = new Tuple(1);
    const keyInstance2 = new Tuple(1); // Same value, diff object

    // 1. Initial Set
    map.set(keyInstance1, "Version 1");
    assert(map.size === 1, "Size should be 1 after insert");
    assert(map.get(keyInstance1) === "Version 1", "Initial get failed");

    // 2. Overwrite with new value (using new key instance!)
    map.set(keyInstance2, "Version 2");
    
    // Checks
    assert(map.size === 1, "Size should REMAIN 1 after overwrite");
    assert(map.get(keyInstance1) === "Version 2", "Value should be updated");
});

// =========================================================
// SCENARIO 9: Delete & Reinsert (Splice Logic Check)
// Catches index calculation errors during array mutations
// =========================================================
test("Delete and Reinsert", () => {
    const map = new RecursiveMap<string, number>();
    const k = "test_key";

    // 1. Insert & Verify
    map.set(k, 1);
    assert(map.get(k) === 1, "Insert failed");

    // 2. Delete
    const deleted = map.delete(k);
    assert(deleted === true, "Delete returned false");
    assert(map.size === 0, "Map should be empty");
    assert(map.get(k) === undefined, "Key should be gone");

    // 3. Reinsert same key
    map.set(k, 2);
    assert(map.size === 1, "Map should have 1 item again");
    assert(map.get(k) === 2, "Reinsert failed or wrong value");
});

// =========================================================
// SCENARIO 10: DFA Key Robustness (Tuple([Set], Char))
// The "Gold Standard" for DFA Transition Tables
// =========================================================
test("DFA Table Key Robustness: Tuple([Set], Char)", () => {
    // Map<Key, TargetStateID>
    // Key = (Set of NFA States, Input Char)
    const delta = new RecursiveMap<Tuple<[RecursiveSet<number>, string]>, number>();

    // Case: Transition from {1, 2} reading 'a'
    const statesA = new RecursiveSet(1, 2);
    const keyA = new Tuple(statesA, 'a');

    delta.set(keyA, 99);

    // Lookup using:
    // 1. Different Set construction order {2, 1}
    // 2. Different Tuple instance
    const statesB = new RecursiveSet(2, 1); // Sorted internally -> same value
    const keyB = new Tuple(statesB, 'a');

    const result = delta.get(keyB);

    assert(result === 99, "Failed to retrieve DFA transition with re-ordered set key");
    assert(delta.size === 1, "Map should treat {1,2} and {2,1} as exact same key");
});

console.log(`\n-----------------------------------------`);
console.log(`Tests: ${passed + failed}`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(failed === 0 ? "✅ ALL SYSTEMS GO" : "❌ SYSTEM FAILURE");
process.exit(failed === 0 ? 0 : 1);
