# RecursiveSet

[![MIT License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![npm version](https://img.shields.io/npm/v/recursive-set.svg)](https://www.npmjs.com/package/recursive-set)

High-performance collection library for TypeScript supporting **value semantics** (deep equality) and recursive structures. Version 8 introduces a new hash-based architecture optimized for high-throughput workloads like SAT solvers and graph algorithms.

## Overview

`RecursiveSet` provides mathematical sets and maps where equality is determined by structure/content rather than object reference (e.g., `{1, 2}` is equal to `{2, 1}`).

**Key Architectural Features:**

- **Open Addressing:** Uses linear probing with a load factor of 0.75 for cache-efficient lookups.
- **Backshift Deletion:** Maintains probe chain integrity without "tombstones," preventing performance degradation over time.
- **Zero-Allocation Hashing:** Uses static buffers and raw bitwise operations to hash numbers without triggering the Garbage Collector.
- **Structure of Arrays (SoA):** Data is stored in flat arrays to maximize CPU cache locality.

## Installation

```bash
npm install recursive-set
```

## Quickstart

### Working with Sets

Sets automatically deduplicate elements based on their value or structure.

```ts
import { RecursiveSet } from "recursive-set";

// Primitive values
const numbers = new RecursiveSet(1, 2, 3);
numbers.add(1); // No effect, 1 is already present

// Recursive structures (Sets of Sets)
const setA = new RecursiveSet(1, 2);
const setB = new RecursiveSet(2, 1);
const metaSet = new RecursiveSet<RecursiveSet<number>>();

metaSet.add(setA);
metaSet.add(setB);

console.log(metaSet.size); // 1, because setA equals setB
```

### Working with Maps

`RecursiveMap` allows using complex objects (like Tuples or Sets) as keys.

```ts
import { RecursiveMap, Tuple } from "recursive-set";

const transitions = new RecursiveMap<Tuple<[string, string]>, number>();
const edge = new Tuple("q0", "q1");

transitions.set(edge, 1);

// Retrieval using a new, structurally identical key
console.log(transitions.get(new Tuple("q0", "q1"))); // 1
```

### Lifecycle (Mutable → Frozen)

To guarantee hash stability, collections become **immutable** (frozen) once their hash code is computed or they are inserted into another collection.

```ts
const A = new RecursiveSet(1);
const B = new RecursiveSet(A); // Accessing A's hash to store it in B freezes A.

try {
  A.add(2); // Throws Error: Frozen Set modified.
} catch (e) {
  // Expected behavior
}

// Use mutableCopy to continue editing
const C = A.mutableCopy();
C.add(2);
```

## Contracts & Invariants

This library optimizes for raw speed and assumes strict adherence to the following contracts. Violating them leads to undefined behavior.

1. **Finite Numbers Only:** `NaN` and `Infinity` are **strictly forbidden**. They break strict equality checks and integer optimization paths.
2. **Strict Value Semantics:** Plain JavaScript objects (`{}`) are **not supported**. Keys must implement the `Structural` interface (provide `equals`, `hashCode`, and `toString`).
3. **Hash Quality:** The $O(1)$ performance guarantee relies on a good distribution. Returning a constant `hashCode` (e.g., `42`) forces all elements into a single bucket, degrading performance to $O(N)$.
4. **Deterministic Visualization:** Custom `toString()` implementations **must** utilize `compareVisualLogic` for nested structures. Failing to do so results in unstable string output.
5. **Immutability:** Once an object is added to a collection, its `hashCode` **must not change**.
6. **No Circular Dependencies:** A `RecursiveSet` cannot contain itself, directly or indirectly. Runtime checks are omitted for performance; creating a cycle will cause a Stack Overflow during hashing.

## API Reference

### Core Types

```ts
type Primitive = number | string;
type Value = Primitive | Structural;

interface Structural {
  readonly hashCode: number;
  equals(other: unknown): boolean;
  toString(): string;
}
```

### RecursiveSet

#### Construction

- `new RecursiveSet<T>(...elements: T[])`: Creates a set from the given arguments.

#### Basic Mutation (Unfrozen state only)

- `add(element: T): void`: Adds an element ($O(1)$ amortized).
- `remove(element: T): void`: Removes an element ($O(1)$ amortized).

#### Advanced In-Place Transformations

These methods allow for high-performance updates of the existing set without creating intermediate collection objects.

- `flatMap<U>(items: Iterable<U>, mapper: (element: U) => RecursiveSet<T>): this`
  - **Imperative Mutation:** Mutates the current set in-place.
  - **Efficiency:** Specifically designed for workloads like constraint generation where millions of items are aggregated iteratively.
  - **Chaining:** Returns `this` to allow for fluent API usage.

```typescript
import { RecursiveSet } from "recursive-set";

const mySet = new RecursiveSet<number>();
const inputs: number[] = [10, 20];

// Example: Iteratively expanding constraints
mySet.flatMap(inputs, (n: number) => new RecursiveSet(n + 1, n + 2));

console.log(mySet); // {11, 12, 21, 22}
```

#### Functional Methods (Zero-Allocation)

These methods iterate directly over internal storage, avoiding the memory overhead of spreading into a temporary Array (`[...set]`).

- `map<U>(fn: (v: T) => U): RecursiveSet<U>`
  - Returns a new set. Pre-allocates storage to prevent resizing during mapping.
- `filter(fn: (v: T) => boolean): RecursiveSet<T>`
  - Returns a new set containing only elements that satisfy the predicate.
- `filterMap<U>(predicate: (v: T) => boolean, mapper: (v: T) => U): RecursiveSet<U>`
  - **Fused Operation:** Computes `{ f(x) : x in M | p(x) }` in a single pass.
  - Significantly faster than chaining `.filter(...).map(...)` as it avoids creating an intermediate set.
- `reduce<U>(fn: (acc: U, v: T) => U, init: U): U`
  - Aggregates values without intermediate allocations.
- `every(fn: (v: T) => boolean): boolean`
  - **Fail-Fast:** Returns `false` immediately upon the first mismatch ($O(1)$ best case).
- `some(fn: (v: T) => boolean): boolean`
  - **Fail-Fast:** Returns `true` immediately upon the first match ($O(1)$ best case).

```typescript
// Example: High-Performance Check
const largeSet = new RecursiveSet(0, 1, 2, ...);

// Instead of: largeSet.filter(x => x % 2 === 0).map(x => x * x) <-- Creates intermediate Set
// Use:        largeSet.filterMap(x => x % 2 === 0, x => x * x)  <-- Single pass, zero overhead
```

#### Set Operations

All operations return a new `RecursiveSet` instance.

- `union(other): RecursiveSet<T>`
- `intersection(other): RecursiveSet<T>`
- `difference(other): RecursiveSet<T>` ($A \setminus B$)
- `symmetricDifference(other): RecursiveSet<T>`
- `cartesianProduct<U>(other): RecursiveSet<Tuple<[T, U]>>`
- `powerset(): RecursiveSet<RecursiveSet<T>>` (Throws if size > 20)

#### Properties

- `has(element: T): boolean`
- `equals(other: unknown): boolean`
- `isSubset(other): boolean`
- `isSuperset(other): boolean`
- `mutableCopy(): RecursiveSet<T>`: Returns a shallow mutable clone.
- `size: number`
- `hashCode: number`: Computes hash and freezes the set.

#### Utility Methods

- `pickRandom(): T | undefined`
  - Returns a genuinely random element from the set in O(1) time.
  - **Important:** Do *not* use `for (const item of set) { break; }` to get a random element. Because `RecursiveSet` uses a deterministic dense array under the hood, the iterator always starts at index 0 and will consistently yield the exact same element. `pickRandom()` uses internal index-based access to guarantee a uniform random distribution.

### RecursiveMap

A hash map supporting `Value` keys.

- `set(key: K, value: V): void`
- `get(key: K): V | undefined`
- `delete(key: K): boolean`
- `has(key: K): boolean`
- `mutableCopy(): RecursiveMap<K, V>`

### Tuple

An immutable, hashable sequence of values. Useful for composite keys.

- `new Tuple(...elements: T[])`
- `get(index: number): T[index]`
- `length: number`

## Credits

This library was developed as a student research project under the supervision of **[Karl Stroetmann](https://github.com/karlstroetmann/)**.

Special thanks for his architectural guidance on homogeneous sets and the theoretical foundations required for high-performance set engines.

## Contributing

```bash
git clone [https://github.com/cstrerath/recursive-set.git](https://github.com/cstrerath/recursive-set.git)
npm install
npm run build
npx tsx test/test.ts
npx tsx test/nqueens.ts
npx tsx test/random_test.ts
```

## License

MIT License © 2025 Christian Strerath. See `LICENSE`.
