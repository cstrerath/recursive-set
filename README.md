# RecursiveSet

[![MIT License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![npm version](https://img.shields.io/npm/v/recursive-set.svg)](https://www.npmjs.com/package/recursive-set)

High-performance set implementation for TypeScript with **value semantics** (structural equality) and controlled mutability via “freeze-on-hash”.

## Overview

`RecursiveSet` is a mathematical set designed for workloads in theoretical computer science (SAT solvers, graph algorithms, ZFC-style constructions) where deep nesting and structural equality matter (e.g., `{1,2} = {2,1}`).

Key design points:

- Structural equality (ZFC-like semantics) for nested sets and sequences.
- Mutable during construction; becomes immutable once hashed (“freeze-on-hash”).
- Sorted-array backing for good cache locality on small to medium `N`.
- Bulk loading and merge-scan set operations for speed.

## Installation

```bash
npm install recursive-set
```


## Quickstart

### Efficient Construction (Bulk Loading)

Instead of adding elements one by one, use `fromArray` for maximum performance:

```ts
import { RecursiveSet, Tuple } from "recursive-set";

// Fast: Bulk load sorts and deduplicates in one go
const states = RecursiveSet.fromArray(["q0", "q1", "q2"]);

// Sets of Sets (partitioning)
const partition = new RecursiveSet<RecursiveSet<string>>();
partition.add(states); // {{q0, q1, q2}}

console.log(partition.toString()); // {{q0, q1, q2}}
```


### Working with Tuples \& Structures

```ts
// Tuples (ordered pairs / edges) represent structural values
// They are immutable and cached by default.
const edge = new Tuple("q0", "q1");

const transitions = new RecursiveSet<Tuple<[string, string]>>();
transitions.add(edge);
```


### Lifecycle (mutable → frozen)

Accessing `hashCode` freezes the set to prevent hash corruption.

```ts
const A = new RecursiveSet(1, 2);
const B = new RecursiveSet(A); // hashing B may hash A -> A becomes frozen

console.log(B.has(A)); // true

try {
  A.add(3); // throws after A is frozen
} catch {
  console.log("A is frozen and cannot be mutated.");
}

// “Fork” for mutation
const C = A.mutableCopy();
C.add(3);
```


## Contracts

This library optimizes for raw throughput. Using it correctly requires strict adherence to these rules:

1. **Finite numbers only:** Do not insert `NaN`, `Infinity`, or `-Infinity`. Comparison logic uses fast arithmetic (`a - b`).
2. **No mutation:** Do not mutate arrays/tuples/objects after insertion.
3. **Type consistency:** Avoid mixing distinct structure types (e.g., `Array` vs `Tuple`) in the same set for the same logical role, as hash-collision edge cases may treat them as equal for performance reasons.

Violating the contract can break sorted order invariants, hashing assumptions, and equality semantics (garbage in → garbage out).

### Freeze-on-hash rule

- A set is mutable until `hashCode` is accessed.
- After hashing, mutation methods throw; use `mutableCopy()` to continue editing.


### Tuple vs Array

- `Tuple` is an immutable container: it makes a defensive copy and freezes its internal storage via `Object.freeze()` (shallow immutability).
- Plain `Array` values are supported as ordered sequences, but they are not frozen by the library.

**Recommendation:** For hot loops (like SAT solvers), represent frequently compared “small composite values” as `Tuple` to benefit from cached hashing and immutability.

## API

### Types

```ts
export type Primitive = number | string;
export type Value =
  | Primitive
  | RecursiveSet<any>
  | Tuple<any>
  | ReadonlyArray<Value>;
```


### Construction

```ts
new RecursiveSet<T>(...elements: T[])
```

Elements are sorted and deduplicated on construction.

### Bulk loading

```ts
RecursiveSet.fromArray<T>(elements: T[]): RecursiveSet<T>
```

Sorts once and deduplicates (typically much faster than many `.add()` calls).

### Unsafe creation

```ts
RecursiveSet.fromSortedUnsafe<T>(sortedUnique: T[]): RecursiveSet<T>
```

**Trusted bypass:** Assumes the input array is already strictly sorted (by internal `compare`) and contains no duplicates. Use only when you can guarantee invariants externally.

### Mutation (only while unfrozen)

- `add(element: T): this`
- `remove(element: T): this`
- `clear(): this`


### Copying

- `mutableCopy(): RecursiveSet<T>` – mutable shallow copy (use after freezing)
- `clone(): RecursiveSet<T>` – alias for `mutableCopy()`


### Set operations (return new sets)

All operations below return new `RecursiveSet` instances:

- `union(other): RecursiveSet<T | U>`
- `intersection(other): RecursiveSet<T>`
- `difference(other): RecursiveSet<T>`
- `symmetricDifference(other): RecursiveSet<T>`
- `powerset(): RecursiveSet<RecursiveSet<T>>` (guarded; throws if too large)
- `cartesianProduct<U>(other): RecursiveSet<Tuple<[T, U]>>`


### Predicates \& properties

- `has(element: T): boolean`
- `equals(other: RecursiveSet<Value>): boolean`
- `compare(other: RecursiveSet<Value>): number`
- `isSubset(other): boolean`
- `isSuperset(other): boolean`
- `isEmpty(): boolean`
- `size: number`
- `hashCode: number` – computes and caches hash; freezes the set
- `isFrozen: boolean`


### Ordering rules

Internal ordering is deterministic by design:

- Type order: `number` < `string` < sequence (`Array`/`Tuple`) < `RecursiveSet`.
- Sequences compare by length first, then lexicographically element-by-element.
- Sets compare by cached hash first, then by structural comparison on collision.


## Credits

This library was developed as a student research project under the supervision of **[Karl Stroetmann](https://github.com/karlstroetmann/)**.

Special thanks for his architectural guidance towards homogeneous sets and for contributing the "Merge Scan" & "Bulk Loading" optimization concepts that form the high-performance core of this engine.

## Contributing

```bash
git clone https://github.com/cstrerath/recursive-set.git
npm install
npm run build
npx tsx test/test.ts
npx tsx test/nqueens.ts
```


## License

MIT License © 2025 Christian Strerath. See `LICENSE`
