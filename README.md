# RecursiveSet

> Mutable, recursive set implementation for TypeScript – inspired by Cantor's and ZFC set theory.

Supports arbitrary nesting, detects cycles (Foundation axiom), and includes all classic set operations (union, intersection, difference, powerset etc.).

[![MIT License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![npm version](https://img.shields.io/npm/v/recursive-set.svg)](https://www.npmjs.com/package/recursive-set)

---

## Features

**Mutable, recursive sets** with arbitrary depth  
**Extensional equality** (two sets are equal iff their elements are equal)  
**Cycle detection** (Foundation Axiom): prevents self-containing sets  
**Copy-on-Write**: O(1) cloning via structural sharing  
**Classic set operations**: union, intersection, difference, symmetric difference  
**Power set and Cartesian product**  
**TypeScript generics**: works with strings, numbers, objects, states, even sets of sets  
**Ready for FSM**, mathematical, symbolic and practical use cases

---

## Implementation Details

This library enforces strict **ZFC Set Theory** semantics, differing from native JavaScript `Set`s:

- **Extensionality:** Two sets are considered equal if they contain the same elements, regardless of object reference identity.
  - Example: `new RecursiveSet(1).equals(new RecursiveSet(1))` is `true`.
  - Native `Set` would treat them as distinct objects.
- **Foundation Axiom:** The library performs cycle detection to prevent sets from containing themselves (recursively).
- **NaN Handling:** In strict ZFC semantics, `NaN` is not a valid element. Adding `NaN` will explicitly throw an error.
- **Performance:** Internally powered by **Functional Red-Black Trees** (via `functional-red-black-tree`).
  - Operations like insertion, deletion, and lookup are **O(log n)**.
  - **Cloning is O(1)** (Copy-on-Write), making it ideal for backtracking algorithms.

---

## Installation

```
npm install recursive-set
```

---
## Quickstart
```
import { RecursiveSet } from "recursive-set";

const q0 = "q0", q1 = "q1";
const eqClass = new RecursiveSet(q0, q1);    // {q0, q1}
const classes = new RecursiveSet(eqClass);

classes.add(new RecursiveSet("q2", "q3"));   // {{q0, q1}, {q2, q3}}

console.log(classes.toString());             // {{q0, q1}, {q2, q3}}
```

---

## API Reference

### Constructor

```
new RecursiveSet<T>(...elements: Array<T | RecursiveSet<T>>)
```

### Methods

**Mutation:**
- `add(element: T | RecursiveSet<T>): this` – Add element (chainable). **Throws if element is NaN.**
- `remove(element: T | RecursiveSet<T>): this` – Remove element (chainable)
- `clear(): this` – Remove all elements (chainable)

**Snapshot:**
- `clone(): RecursiveSet<T>` – Creates a shallow copy in **O(1)** time (Copy-on-Write).

**Set Operations:**
- `union(other: RecursiveSet<T>): RecursiveSet<T>` – A ∪ B
- `intersection(other: RecursiveSet<T>): RecursiveSet<T>` – A ∩ B
- `difference(other: RecursiveSet<T>): RecursiveSet<T>` – A \ B
- `symmetricDifference(other: RecursiveSet<T>): RecursiveSet<T>` – A △ B

**Advanced Operations:**
- `powerset(): RecursiveSet<RecursiveSet<T>>` – 𝒫(A)
- `cartesianProduct<U>(other: RecursiveSet<U>): RecursiveSet<RecursiveSet<T | U>>` – A × B

**Predicates:**
- `has(element: T | RecursiveSet<T>): boolean` – Check membership
- `isSubset(other: RecursiveSet<T>): boolean` – Check if ⊆
- `isSuperset(other: RecursiveSet<T>): boolean` – Check if ⊇
- `equals(other: RecursiveSet<T>): boolean` – Structural equality
- `isEmpty(): boolean` – Check if set is empty

**Properties:**
- `size: number` – Cardinality |A|
- `toString(): string` – Pretty print with ∅ and {}

---

## Examples

### Basic Usage

```
const s1 = new RecursiveSet(1, 2, 3);
const s2 = new RecursiveSet(2, 3, 4);

console.log(s1.union(s2));        // {1, 2, 3, 4}
console.log(s1.intersection(s2)); // {2, 3}
console.log(s1.difference(s2));   // {1}
```

### Backtracking with O(1) Clone

```
const state = new RecursiveSet("init");
// ... perform some operations ...

// Create a checkpoint (O(1))
const checkpoint = state.clone();

state.add("newState");
// If this path fails, simply revert:
// state = checkpoint; (conceptually)
```

### Power Set

```
const set = new RecursiveSet(1, 2);
const power = set.powerset();

console.log(power.toString()); // {∅, {1}, {2}, {1, 2}}
```

### Strictness: NaN and Cycles

```
const s = new RecursiveSet(1, 2);

// Cycle Detection
try {
s.add(s);
} catch (e) {
console.error(e.message); // "Foundation axiom violated..."
}

// NaN Rejection
try {
s.add(NaN);
} catch (e) {
console.error(e.message); // "NaN is not supported..."
}
```

---

## Use Cases

- **Finite State Machine (FSM) minimization**: Equivalence classes of states
- **Set theory algorithms**: Implement mathematical proofs and algorithms
- **Graph algorithms**: Represent node sets and partitions
- **Compiler design**: Symbol tables, scope analysis
- **Type systems**: Type inference and unification

---

## Development

```
# Clone repository
git clone https://github.com/cstrerath/recursive-set.git
cd recursive-set

# Install dependencies
npm install

# Build
npm run build

# Run tests
npx tsx test.ts
```

---

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

---

## License

MIT License  
© 2025 Christian Strerath

See [LICENSE](LICENSE) for details.

---

## Acknowledgments

Inspired by:
- Cantor's set theory
- Zermelo-Fraenkel set theory with the Axiom of Choice (ZFC)
- Practical needs in FSM algorithms and formal language theory
- Powered by [functional-red-black-tree](https://github.com/mikolalysenko/functional-red-black-tree) for O(log n) persistence