# RecursiveSet

> High-performance, mutable set implementation for TypeScript – modeled after ZFC set theory.

Supports recursive nesting, strict structural equality, and includes all classic set operations (union, intersection, difference, powerset, cartesian product). **Designed for Theoretical Computer Science, Graphs, and FSMs.**

[![MIT License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![npm version](https://img.shields.io/npm/v/recursive-set.svg)](https://www.npmjs.com/package/recursive-set)

---

## Features

* **Strict Value Equality:** Mathematical sets behave mathematically. `{a, b}` is equal to `{b, a}`.
* **Tuples First:** Includes a strongly typed `Tuple` class for ordered pairs (e.g., edges, transitions), solving JS Array reference pitfalls.
* **Homogeneous by Default:** Generic typing (`RecursiveSet<T>`) enforces clean data structures.
* **Recursive:** Sets can contain sets (of sets...). Ideal for Power Sets and Von Neumann Ordinals.
* **Copy-on-Write:** **O(1) cloning** via structural sharing (powered by persistent Red-Black Trees).
* **Lean \& Mean:** No implicit overhead. Cycle checking is left to the user to allow maximum performance.

---

## Implementation Details

This library enforces **Strict ZFC Semantics**, differing from native JavaScript `Set`:

- **Extensionality:** Two sets are equal if they contain the same elements.
  - `new RecursiveSet(new RecursiveSet(1)).equals(new RecursiveSet(new RecursiveSet(1)))` is `true`.
- **No Hidden References:** Plain JavaScript Arrays and Objects are **rejected** to prevent reference-equality confusion.
  - Use `Tuple` for ordered sequences.
  - Use `RecursiveSet` for collections.
- **Performance:** Powered by **Functional Red-Black Trees**.
  - Insertion/Lookup: **O(log n)**.
  - Cloning: **O(1)**.

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
const partition = new RecursiveSet<RecursiveSet<string>>();
partition.add(states); // {{q0, q1}}

// 3. Tuples (Ordered Pairs / Edges)
const edge = new Tuple("q0", "q1"); // (q0, q1)
const transitions = new RecursiveSet<Tuple<[string, string]>>();
transitions.add(edge);

console.log(partition.toString());    // {{q0, q1}}
console.log(transitions.toString());  // {(q0, q1)}
```

---

## API Reference

### Constructor

```typescript
// T must be explicit or inferred. No default 'unknown'.
new RecursiveSet<T>(...elements: Array<T | RecursiveSet<T>>)
```

### Methods

**Mutation:**
* `add(element: T | RecursiveSet<T>): this` – Add element. **Throws on NaN or plain Object/Array.**
* `remove(element: T | RecursiveSet<T>): this` – Remove element.
* `clear(): this` – Remove all elements.

**Snapshot:**
- `clone(): RecursiveSet<T>` – Creates a shallow copy in **O(1)** time (Copy-on-Write).

**Set Operations:**
- `union(other: RecursiveSet<T>): RecursiveSet<T>` – A ∪ B
- `intersection(other: RecursiveSet<T>): RecursiveSet<T>` – A ∩ B
- `difference(other: RecursiveSet<T>): RecursiveSet<T>` – A \ B
- `symmetricDifference(other: RecursiveSet<T>): RecursiveSet<T>` – A △ B

**Advanced Operations:**
- `powerset(): RecursiveSet<RecursiveSet<T>>` – 𝒫(A)
- `cartesianProduct<U>(other: RecursiveSet<U>): RecursiveSet<Tuple<[T, U]>>` – A × B (Returns Tuples!)

**Predicates:**
- `has(element: T | RecursiveSet<T>): boolean` – Check membership
- `isSubset(other: RecursiveSet<T>): boolean` – Check if ⊆
- `isSuperset(other: RecursiveSet<T>): boolean` – Check if ⊇
- `equals(other: RecursiveSet<T>): boolean` – Structural equality
- `isEmpty(): boolean` – Check if set is empty

**Properties:**
- `size: number` – Cardinality |A|
- `toString(): string` – Pretty print with ∅ and {}

### Tuple Class

Helper for structural value equality of sequences.

```typescript
const t1 = new Tuple(1, 2);
const t2 = new Tuple(1, 2);
// In JS: [1,2] !== [1,2]
// In RecursiveSet: t1 equals t2 (Structural Equality)
```
---

## Examples

### Basic Usage

```typescript
const s1 = new RecursiveSet(1, 2, 3);
const s2 = new RecursiveSet(2, 3, 4);

console.log(s1.union(s2));        // {1, 2, 3, 4}
console.log(s1.intersection(s2)); // {2, 3}
console.log(s1.difference(s2));   // {1}
```

### Backtracking with O(1) Clone

```typescript
const state = new RecursiveSet("init");
// ... perform some operations ...

// Create a checkpoint (O(1))
const checkpoint = state.clone();

state.add("newState");
// If this path fails, simply revert:
// state = checkpoint; (conceptually)
```

### Power Set

```typescript
const set = new RecursiveSet(1, 2);
const power = set.powerset();

console.log(power.toString()); // {∅, {1}, {2}, {1, 2}}
```

### Cartesian Product \& Tuples

```typescript
const A = new RecursiveSet(1, 2);
const B = new RecursiveSet("x", "y");

// A × B = {(1, x), (1, y), (2, x), (2, y)}
const product = A.cartesianProduct(B);

// Result contains strongly typed Tuples
for (const tuple of product) {
    console.log(tuple.get(0), tuple.get(1)); // 1 "x"
}
```


### Strictness (Breaking Changes in V3)

```typescript
const s = new RecursiveSet<number>();

// ❌ Error: Plain Arrays not supported (Reference Ambiguity)
// s.add([1, 2]); 

// ✅ Correct: Use Tuple
s.add(new Tuple(1, 2));

// ❌ Error: NaN is not supported
// s.add(NaN);
```


---

## Use Cases

* **Finite State Machine (FSM):** States as Sets, Transitions as Tuples.
* **Graph Theory:** Edges as Tuples `(u, v)`, Nodes as Sets.
* **Formal Languages:** Alphabets, Grammars, Power Sets.

---

## Contributing

Contributions are welcome!

```bash
git clone https://github.com/cstrerath/recursive-set.git
npm install
npm run build
npx tsx test.ts
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
* Powered by [functional-red-black-tree](https://github.com/mikolalysenko/functional-red-black-tree)