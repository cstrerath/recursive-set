# RecursiveSet

> **High-Performance ZFC Set Implementation for TypeScript**
> 
> Mutable, strictly typed, and optimized for cache locality.

[![MIT License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![npm version](https://img.shields.io/npm/v/recursive-set.svg)](https://www.npmjs.com/package/recursive-set)

---

## 🚀 What is this?

A mathematical set implementation designed for **Theoretical Computer Science**, **SAT-Solvers**, and **Graph Theory**. Unlike native JavaScript `Set`, `RecursiveSet` enforces **Structural Equality** (ZFC semantics) and supports deep nesting.

**v4.0.0 Update:** Now powered by **Sorted Arrays** instead of Red-Black Trees.
*   **5x-10x Faster** than v3.0 (cache locality vs. pointer chasing).
*   **O(1) Equality Checks** via aggressive hash caching.
*   **Native Array Support** included.

---

## Features

*   **🔢 Strict Structural Equality:** `{1, 2}` is equal to `{2, 1}`.
*   **📦 Deeply Recursive:** Sets can contain Sets. Ideal for Power Sets.
*   **⚡ High Performance:** Optimized for V8 (Chrome/Node) using flat memory layouts and binary search.
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
```typescript
import { RecursiveSet, Tuple } from "recursive-set";

// 1. Sets of primitives
const states = new RecursiveSet<string>();
states.add("q0").add("q1");

// 2. Sets of Sets (Partitioning)
// Recursion requires explicit typing!
const partition = new RecursiveSet<RecursiveSet<string>>();
partition.add(states); // {{q0, q1}}

// 3. Tuples (Ordered Pairs / Edges)
const edge = new Tuple("q0", "q1"); // (q0, q1)
// or simply: const edge = ["q0", "q1"];

const transitions = new RecursiveSet<Tuple<[string, string]>>();
transitions.add(edge);

console.log(partition.toString()); // {{q0, q1}}
console.log(transitions.toString()); // {(q0, q1)}
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
*   `hashCode: number` – The cached hash of the set.

---

## Performance Notes (v4.0)

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

## Breaking Changes in v4.0

1.  **Engine Switch (Array Backend):** Iterators are now **live**. Modifying the set while iterating over it will reflect changes immediately (Standard JS Array behavior). In v3 (RBT), iterators were snapshots.
2.  **Arrays Supported:** Adding `[1, 2]` is now natively supported and treated as a `Tuple`.
3.  **Strict Generics (Maintained from v3):** `add()` requires explicit generic types for recursion.
4.  **Plain Objects Rejected (Maintained from v3):** `{a: 1}` throws an Error. Use `Tuple` or `RecursiveSet`.

---

## Contributing

Contributions are welcome!

```bash
git clone https://github.com/cstrerath/recursive-set.git
npm install
npm run build
npx tsx test/test.ts
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