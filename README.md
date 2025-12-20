# RecursiveSet

> **High-Performance ZFC Set Implementation for TypeScript**
> 
> Mutable, strictly typed, and optimized for cache locality.

[![MIT License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![npm version](https://img.shields.io/npm/v/recursive-set.svg)](https://www.npmjs.com/package/recursive-set)

---

## 🚀 What is this?

A mathematical set implementation designed for **Theoretical Computer Science**, **SAT-Solvers**, and **Graph Theory**. Unlike native JavaScript `Set`, `RecursiveSet` enforces **Structural Equality** (ZFC semantics) and supports deep nesting.

**v5.0.0 Update:** Now featuring **"Freeze-on-Hash"** lifecycle management.
*   **Safety First**: Sets automatically become **immutable** (frozen) once used as a key or member of another set. No more corrupted hash codes!
*   **High Performance**: Backed by **Sorted Arrays** and FNV-1a hashing. 5x - 10x faster than tree-based implementations for typical *N* < 1000.
*   **O(1) Equality Checks**: Aggressive caching allows for instant comparisons of deep structures.

---

## Features

*   **🔢 Strict Structural Equality:** `{1, 2}` is equal to `{2, 1}`.
*   **❄️ Freeze-on-Hash:** Mutable during construction, immutable during usage. Prevents subtle reference bugs.
*   **📦 Deeply Recursive:** Sets can contain Sets. Ideal for Power Sets.
*   **📐 Tuples & Arrays:** Native support for `Tuple` class or standard JS Arrays `[a, b]` as elements.
*   **🔒 Type Safe:** Fully strict TypeScript implementation. No `any` casts.
*   **🛡️ Deterministic:** Hashing is order-independent for Sets and order-dependent for Sequences.

---

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

**New in v5:** To ensure mathematical correctness, a set cannot be modified once it has been hashed (e.g., added to another set).

```typescript
const A = new RecursiveSet(1, 2);
const B = new RecursiveSet(A); 
// B hashes A to store it. 
// A is now FROZEN to ensure B's integrity.

console.log(B.has(A)); // true

try {
    A.add(3); // 💥 Throws Error: Cannot add() to a frozen RecursiveSet
} catch (e) {
    console.log("A is immutable now!");
}

// Fix: Create a mutable copy ("Forking")
const C = A.mutableCopy();
C.add(3); // Works!
```

---

## API Reference

### Constructor

```typescript
// Create empty or with initial elements
// Elements are automatically sorted and deduplicated.
new RecursiveSet<T>(...elements: T[])
```


### Methods

**Lifecycle Management:**
*   `mutableCopy(): RecursiveSet<T>` – Creates a fresh, mutable clone of the set (O(N)). Use this if you need to modify a frozen set.
*   `clone(): RecursiveSet<T>` – Alias for mutableCopy.

**Mutation:**
*   `add(element: T): this` – Insert element (O(N) worst case, O(1) append).
*   `remove(element: T): this` – Remove element.
*   `clear(): this` – Reset set.

**Set Operations (Immutable results):**
*   `union(other: RecursiveSet<T>): RecursiveSet<T>` – $A \cup B$
*   `intersection(other: RecursiveSet<T>): RecursiveSet<T>` – $A \cap B$
*   `difference(other: RecursiveSet<T>): RecursiveSet<T>` – $A \setminus B$
*   `symmetricDifference(other: RecursiveSet<T>): RecursiveSet<T>` – $A \triangle B$
*   `powerset(): RecursiveSet<RecursiveSet<T>>` – $\mathcal{P}(A)$
*   `cartesianProduct<U>(other: RecursiveSet<U>): RecursiveSet<Tuple<[T, U]>>` – $A \times B$

**Predicates (Fast):**
*   `has(element: T): boolean` – **O(log N)** lookup (Binary Search).
*   `equals(other: RecursiveSet<T>): boolean` – **O(1)** via Hash-Cache (usually).
*   `isSubset(other: RecursiveSet<T>): boolean` – Check if $A \subseteq B$.
*   `isSuperset(other: RecursiveSet<T>): boolean` – Check if $A \supseteq B$.
*   `isEmpty(): boolean` – Check if $|A| = 0$.

**Properties:**
*   `size: number` – Cardinality.
*   `hashCode: number` – The cached hash. Accessing this property freezes the set.
*   `isFrozen: boolean` – Check if the set is read-only.

---

## Performance Notes

**Why Sorted Arrays?**
For sets with $N < 1000$ (common in logic puzzles, N-Queens, graphs), the overhead of allocating tree nodes (v2/v3) dominates runtime. Sorted Arrays exploit **CPU Cache Lines**.

| Operation | Complexity | Real World (Small N) |
| :--- | :--- | :--- |
| **Lookup** | $O(\log N)$ | 🚀 Instant |
| **Equality** | $O(N)$ / $O(1)$* | ⚡ Instant (Hash Match) |
| **Insert** | $O(N)$ | Fast (Native `splice` / `memmove`) |
| **Iteration** | $O(N)$ | 🚀 Native Array Speed |

*\*Equality is O(1) if hashes differ (99% case), O(N) if hash collision occurs.*

---

## Breaking Changes in v5.0

1.  **Freeze-on-Hash Semantics:** To guarantee mathematical correctness, sets now transition to an **immutable state** once their `hashCode` is computed (which happens automatically when added to another `RecursiveSet` or used as a Map key).
    *   *Old Behavior:* Modifying a hashed set was possible but resulted in corrupted hash codes and lookup failures.
    *   *New Behavior:* Calling `add()`, `remove()` or `clear()` on a hashed set throws an `Error`.
    *   *Migration:* Use `mutableCopy()` to create a modifiable clone if you need to evolve a state that has already been stored.

---

## Contributing

Contributions are welcome!

```bash
git clone https://github.com/cstrerath/recursive-set.git
npm install
npm run build
npx tsx test/test.ts
npx tsx test/nqueens.ts
```

---

## License

MIT License  
© 2025 Christian Strerath

See [LICENSE](LICENSE) for details.

---

## Acknowledgments

Inspired by:
* Zermelo-Fraenkel set theory (ZFC)
* Formal Language Theory requirements