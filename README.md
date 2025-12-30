# RecursiveSet

High-performance, strictly typed set implementation for TypeScript with **value semantics** (structural equality) and controlled mutability via “freeze-on-hash”.

## Overview

`RecursiveSet` is a mathematical set designed for workloads in theoretical computer science (e.g., SAT solvers, graph algorithms, ZFC-style constructions) where deep nesting and structural equality matter (e.g., `{1,2} = {2,1}`).

Key design points:

- Structural equality (ZFC-like semantics) for nested sets and sequences.
- Mutable during construction; becomes immutable once hashed (“freeze-on-hash”).
- Sorted-array backing for good cache locality on small to medium `N`.
- Deterministic hashing:
  - Numbers use safe-integer splitting and IEEE-754 bit hashing.
  - Float hashing enforces little-endian byte order via `DataView` for platform consistency.

## Installation

```bash
npm install recursive-set
```

---
## Quickstart

### 1. Basic Usage
```typescript
import { RecursiveSet, Tuple } from "recursive-set";

// Sets of primitives
const states = new RecursiveSet<string>();
states.add("q0").add("q1");

// Sets of Sets (Partitioning)
const partition = new RecursiveSet<RecursiveSet<string>>();
partition.add(states); // {{q0, q1}}

// Tuples (Ordered Pairs / Edges)
const edge = new Tuple("q0", "q1"); 
// or simply: const edge = ["q0", "q1"];

const transitions = new RecursiveSet<Tuple<[string, string]>>();
transitions.add(edge);

console.log(partition.toString()); // {{q0, q1}}
```

### 2. The Lifecycle (Mutable -> Frozen)

Accessing `hashCode` (directly or indirectly by inserting into another set) freezes the set to prevent hash corruption.

```typescript
const A = new RecursiveSet(1, 2);
const B = new RecursiveSet(A); // hashing B may hash A -> A becomes frozen

console.log(B.has(A)); // true

try {
A.add(3); // throws
} catch {
console.log("A is frozen and cannot be mutated.");
}

// “Fork” for mutation
const C = A.mutableCopy();
C.add(3);
```

---

## Supported element types

To keep value semantics predictable and prevent accidental mutation via arbitrary objects, `RecursiveSet` validates inputs and supports:

- `number` (excluding `NaN`)
- `string`
- `Tuple`
- plain `Array` (treated as an ordered sequence)
- `RecursiveSet`

## Tuple vs Array

- `Tuple` is an immutable container: it makes a defensive copy and freezes its internal storage via `Object.freeze()` (shallow immutability).
- Plain `Array` values are supported for performance and convenience, but they are not frozen by the library.

Recommendation for SAT / hot loops: represent frequently compared “small composite values” as `Tuple` to benefit from cached hashing and immutability.

---

## API (selected)

### Construction

```typescript
new RecursiveSet<T>(...elements: T[])
```
Elements are sorted and deduplicated on construction.

### Mutation (only while unfrozen)

- `add(element: T): this`
- `remove(element: T): this`
- `clear(): this`

### Copying

- `mutableCopy(): RecursiveSet<T>` – mutable shallow copy (use after freezing)
- `clone(): RecursiveSet<T>` – alias for `mutableCopy()`

### Set operations (return new sets)

- `union(other): RecursiveSet<T>`
- `intersection(other): RecursiveSet<T>`
- `difference(other): RecursiveSet<T>`
- `symmetricDifference(other): RecursiveSet<T>`
- `powerset(): RecursiveSet<RecursiveSet<T>>` (guarded; throws if too large)
- `cartesianProduct<U>(other): RecursiveSet<Tuple<[T, U]>>`

### Predicates & properties

- `has(element: T): boolean` – binary search for larger sets
- `equals(other: RecursiveSet<T>): boolean`
- `isSubset(other): boolean`
- `isSuperset(other): boolean`
- `isEmpty(): boolean`
- `size: number`
- `hashCode: number` – computes and caches hash; freezes the set
- `isFrozen: boolean`

## Determinism & ordering rules

The internal ordering is deterministic across platforms:

- Type order: `number` < `string` < sequence (`Array`/`Tuple`) < `RecursiveSet`.
- Sequences compare lexicographically (then by length).
- Sets compare by cached hash first, then by structural comparison on collision.

## Breaking changes in v6

- Internal storage uses private class fields (no external access to internal arrays).
- Hashing uses `DataView` little-endian float hashing; hashes are not compatible with older versions.
- `Tuple` is immutable via defensive copy + `Object.freeze()` (shallow).
- Comparator type ordering is now deterministic: number < string < sequence < set.

## Contributing

```bash
git clone https://github.com/cstrerath/recursive-set.git
npm install
npm run build
npx tsx test/test.ts
npx tsx test/nqueens.ts
```

---


## License

MIT License © 2025 Christian Strerath. See `LICENSE`.