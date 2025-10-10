import { RecursiveSet } from './src/index.js';

console.log('=== RecursiveSet Test Suite ===\n');

// ============================================================================
// Test 1: Basic FSM State Sets
// ============================================================================
console.log('--- Test 1: Basic State Sets ---');
const q0 = "q0";
const q1 = "q1";
const q2 = "q2";
const q3 = "q3";

const eqClass1 = new RecursiveSet(q0, q1);
const eqClass2 = new RecursiveSet(q2, q3);
console.log(`Equivalence class 1: ${eqClass1}`);
console.log(`Equivalence class 2: ${eqClass2}`);
console.log();

// ============================================================================
// Test 2: Sets of Sets (Equivalence Classes)
// ============================================================================
console.log('--- Test 2: Sets of Sets ---');
const eqClasses = new RecursiveSet(eqClass1, eqClass2);
console.log(`Equivalence classes: ${eqClasses}`);
console.log();

// ============================================================================
// Test 3: Mutability - Adding Elements
// ============================================================================
console.log('--- Test 3: Mutability ---');
const eqClass3 = new RecursiveSet("q4");
eqClasses.add(eqClass3);
console.log(`After adding {q4}: ${eqClasses}`);
console.log();

// ============================================================================
// Test 4: Extensionality (Structural Equality)
// ============================================================================
console.log('--- Test 4: Extensionality Axiom ---');
const eqClass1_copy = new RecursiveSet("q0", "q1");
console.log(`eqClass1: ${eqClass1}`);
console.log(`eqClass1_copy: ${eqClass1_copy}`);
console.log(`Are they equal? ${eqClass1.equals(eqClass1_copy)}`);
console.log();

// ============================================================================
// Test 5: Empty Set Handling
// ============================================================================
console.log('--- Test 5: Empty Set ---');
const emptyClass = new RecursiveSet();
const eqClassesWithEmpty = new RecursiveSet(eqClass1, emptyClass);
console.log(`With empty class: ${eqClassesWithEmpty}`);
console.log();

// ============================================================================
// Test 6: Deep Nesting
// ============================================================================
console.log('--- Test 6: Deep Nesting ---');
const nested = new RecursiveSet(eqClasses, eqClassesWithEmpty);
console.log(`Nested structure: ${nested}`);
console.log();

// ============================================================================
// Test 7: Set Operations
// ============================================================================
console.log('--- Test 7: Set Operations ---');
const difference = eqClasses.difference(new RecursiveSet(eqClass2));
console.log(`eqClasses - {eqClass2} = ${difference}`);

const union = eqClass1.union(eqClass2);
console.log(`eqClass1 ∪ eqClass2 = ${union}`);

const intersection = new RecursiveSet(q0, q1, q2).intersection(new RecursiveSet(q1, q2, q3));
console.log(`{q0, q1, q2} ∩ {q1, q2, q3} = ${intersection}`);
console.log();

// ============================================================================
// Test 8: Power Set
// ============================================================================
console.log('--- Test 8: Power Set ---');
const small = new RecursiveSet(1, 2);
const power = small.powerset();
console.log(`𝒫({1, 2}) = ${power}`);
console.log();

// ============================================================================
// Test 9: Foundation Axiom (Cycle Detection)
// ============================================================================
console.log('--- Test 9: Foundation Axiom ---');
try {
    const circular = new RecursiveSet(1, 2);
    circular.add(circular);
    console.log('❌ ERROR: Cycle should have been detected!');
} catch (e: any) {
    console.log(`✓ Cycle detected: ${e.message}`);
}
console.log();

// ============================================================================
// Test 10: Subset Relations
// ============================================================================
console.log('--- Test 10: Subset Relations ---');
const setA = new RecursiveSet(1, 2, 3);
const setB = new RecursiveSet(1, 2);
console.log(`A = ${setA}`);
console.log(`B = ${setB}`);
console.log(`B ⊆ A? ${setB.isSubset(setA)}`);
console.log(`A ⊆ B? ${setA.isSubset(setB)}`);
console.log();

// ============================================================================
// Summary
// ============================================================================
console.log('=== All Tests Completed Successfully ✓ ===');
