/**
 * @module recursive-set-avl-final
 * @description
 * Library for strict, recursive data structures (Set, Map, Tuple).
 * 
 * * Features:
 * - Strict O(log N) operations for Sets.
 * - Deterministic Hashing based on content.
 * - Exclusive Ownership (No shared nodes).
 * 
 * * Contracts (performance-first):
 * - Numbers: No NaN / ±Infinity (otherwise compare/sort order breaks). 
 * - No cycles: self-referential structures will overflow on hash/compare.
 * - Immutability-by-contract: after insertion, Values must not be mutated.
 *   (Note: `readonly T[]` is runtime-mutable in JS; use Tuple for stable sequences.)
 * - Only supported Value-universe: number|string|Tuple|RecursiveSet|RecursiveMap|Array.
 * - Invalid input => undefined behavior (no defensive checks).
 */


export type Primitive = number | string;

/**
 * Recursive definition of allowed values in the system.
 * This Union Type ensures the system is closed under nesting.
 */
export type Value = 
    | Primitive 
    | RecursiveSet<Value> 
    | Tuple<Value[]> 
    | RecursiveMap<Value, Value> 
    | ReadonlyArray<Value>;

// ============================================================================
// 1. FAST HASHING & COMPARATOR
// ============================================================================

const FNV_PRIME = 16777619;
const FNV_OFFSET = 2166136261;
const floatBuffer = new ArrayBuffer(8);
const view = new DataView(floatBuffer);

/**
 * Hashes a number using bitwise manipulation.
 * Handles both Integers (direct mix) and Floats (via DataView).
 */
function hashNumber(val: number): number {
    if ((val | 0) === val) return val | 0;
    view.setFloat64(0, val, true);
    let h = FNV_OFFSET;
    h ^= view.getInt32(0, true);
    h = Math.imul(h, FNV_PRIME);
    h ^= view.getInt32(4, true);
    h = Math.imul(h, FNV_PRIME);
    return h >>> 0;
}

/**
 * FNV-1a hash implementation for strings.
 */
function hashString(str: string): number {
    let h = FNV_OFFSET;
    const len = str.length;
    for (let i = 0; i < len; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, FNV_PRIME);
    }
    return h >>> 0;
}

/**
 * Computes a deterministic hash code for any valid `Value`.
 * Delegates to `.hashCode` for objects or recurses for arrays.
 * * @param v - The value to hash.
 * @returns A 32-bit integer hash code.
 */
export function hashValue(v: Value): number {
    if (typeof v === 'number') return hashNumber(v);
    if (typeof v === 'string') return hashString(v);
    
    if (v instanceof RecursiveSet) return v.hashCode;
    if (v instanceof Tuple) return v.hashCode;
    if (v instanceof RecursiveMap) return v.hashCode;
    
    if (Array.isArray(v)) {
        let h = FNV_OFFSET;
        for (let i = 0; i < v.length; i++) {
            h ^= hashValue(v[i]);
            h = Math.imul(h, FNV_PRIME);
        }
        return h >>> 0;
    }
    return 0;
}

/**
 * Polymorphic comparator function.
 * Establishes a total ordering across all types in the `Value` universe.
 * * Order of types:
 * 1. Numbers
 * 2. Strings
 * 3. Complex Objects (by Hash, then Structural)
 * * @param a - First value.
 * @param b - Second value.
 * @returns Negative if a < b, Positive if a > b, 0 if equal.
 */
export function compare(a: Value, b: Value): number {
    if (a === b) return 0;
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    if (typeof a === 'string' && typeof b === 'string') return a < b ? -1 : 1;

    // Type Segregation
    const typeA = typeof a;
    const typeB = typeof b;
    if (typeA !== typeB) {
        const scoreA = (typeA === 'number') ? 1 : (typeA === 'string' ? 2 : 3);
        const scoreB = (typeB === 'number') ? 1 : (typeB === 'string' ? 2 : 3);
        return scoreA - scoreB;
    }

    // Hash Optimization: If hashes differ, objects differ.
    const h1 = hashValue(a);
    const h2 = hashValue(b);
    if (h1 !== h2) return h1 - h2;

    // Deep Comparison Dispatch
    if (a instanceof RecursiveSet && b instanceof RecursiveSet) return a.compare(b);
    if (a instanceof RecursiveMap && b instanceof RecursiveMap) return a.compare(b);
    if (a instanceof Tuple && b instanceof Tuple) return compareSequences(a.raw, b.raw);
    if (Array.isArray(a) && Array.isArray(b)) return compareSequences(a, b);

    // Fallback Type Ordering for different object classes
    const getTypeId = (v: Value): number => {
        if (Array.isArray(v)) return 1;
        if (v instanceof Tuple) return 2;
        if (v instanceof RecursiveSet) return 3;
        if (v instanceof RecursiveMap) return 4;
        return 99;
    };
    return getTypeId(a) - getTypeId(b);
}

function compareSequences(a: ReadonlyArray<Value>, b: ReadonlyArray<Value>): number {
    const len = a.length;
    if (len !== b.length) return len - b.length;
    for (let i = 0; i < len; i++) {
        const diff = compare(a[i], b[i]);
        if (diff !== 0) return diff;
    }
    return 0;
}

// ============================================================================
// 2. MUTABLE AVL NODE
// ============================================================================

/**
 * Internal Node structure for the AVL Tree.
 *
 * This class represents a node in an Augmented AVL Tree.
 * Apart from standard pointers, it maintains:
 * - `height`: For calculating the Balance Factor ($O(1)$).
 * - `size`: For order statistic queries (Rank/Select) in $O(log N)$.
 *
 * @template T - The type of value stored, must satisfy the Value constraint.
 */
class AVLNode<T extends Value> {
    constructor(
        public val: T,
        public left: AVLNode<T> | null = null,
        public right: AVLNode<T> | null = null,
        /** Height of the node. Leaf = 1. Null = 0. */
        public height: number = 1,
        /** Total number of nodes in this subtree (including self). */
        public size: number = 1
    ) {}
}

/**
 * Safely retrieves height of a node (handles null pointers).
 * @returns Height $h \ge 0$.
 */
function getHeight<T extends Value>(n: AVLNode<T> | null): number { return n ? n.height : 0; }

/**
 * Safely retrieves subtree size of a node (handles null pointers).
 * @returns Size $N \ge 0$.
 */
function getSize<T extends Value>(n: AVLNode<T> | null): number { return n ? n.size : 0; }

/**
 * Re-calculates and updates the metadata (height and size) of a node.
 * Must be called whenever a child of 'n' changes (e.g., after rotation or insert).
 *
 * Math:
 * $$Height(n) = 1 + \max(Height(n.left), Height(n.right))$$
 * $$Size(n) = 1 + Size(n.left) + Size(n.right)$$
 */
function updateStats<T extends Value>(n: AVLNode<T>) {
    const lh = n.left ? n.left.height : 0;
    const rh = n.right ? n.right.height : 0;
    n.height = (lh > rh ? lh : rh) + 1;
    n.size = 1 + (n.left ? n.left.size : 0) + (n.right ? n.right.size : 0);
}

// --- AVL Rotations (In-Place) ---

/**
 * Performs a Right Rotation (used for Left-Left imbalance).
 *
 * Transformation:
 * y           x
 * / \         / \
 * x  T3  -->  T1  y
 * / \             / \
 * T1 T2           T2 T3
 *
 * @param y - The root of the unbalanced subtree (will become right child).
 * @returns The new root 'x' of this subtree.
 */
function rotateRight<T extends Value>(y: AVLNode<T>): AVLNode<T> {
    const x = y.left!;
    const T2 = x.right;

    // Perform rotation
    x.right = y;
    y.left = T2;

    // Update stats (Order matters! y is now child of x)
    updateStats(y);
    updateStats(x);

    return x;
}

/**
 * Performs a Left Rotation (used for Right-Right imbalance).
 *
 * Transformation:
 * x               y
 * / \             / \
 * T1  y    -->    x  T3
 * / \         / \
 * T2 T3       T1 T2
 *
 * @param x - The root of the unbalanced subtree (will become left child).
 * @returns The new root 'y' of this subtree.
 */
function rotateLeft<T extends Value>(x: AVLNode<T>): AVLNode<T> {
    const y = x.right!;
    const T2 = y.left;

    // Perform rotation
    y.left = x;
    x.right = T2;

    // Update stats (Order matters! x is now child of y)
    updateStats(x);
    updateStats(y);

    return y;
}

/**
 * Calculates the Balance Factor of a node.
 * Formula: $BF = Height(Left) - Height(Right)$.
 *
 * @returns
 * - $> 1$: Left Heavy
 * - $< -1$: Right Heavy
 * - $-1, 0, 1$: Balanced
 */
function getBalance<T extends Value>(n: AVLNode<T>): number {
    return n ? getHeight(n.left) - getHeight(n.right) : 0;
}

// --- Recursive Operations ---

/**
 * Recursively inserts a value into the subtree.
 * Automatically rebalances the tree on the way up (post-order).
 *
 * @param node - Current root of the subtree.
 * @param val - Value to insert.
 * @returns The new (potentially rotated) root of the subtree.
 */
function insert<T extends Value>(node: AVLNode<T> | null, val: T): AVLNode<T> {
    // 1. Standard BST Insert
    if (!node) return new AVLNode(val);

    const cmp = compare(node.val, val);
    if (cmp === 0) return node; // No duplicates allowed in Set

    if (cmp > 0) node.left = insert(node.left, val);
    else node.right = insert(node.right, val);

    // 2. Update stats for the current node (as children might have grown)
    updateStats(node);

    // 3. Check Balance Factor
    const balance = getBalance(node);

    // 4. Balance the tree (4 Cases)

    // Case 1: Left Left (Parent > 1, Child Left-Heavy)
    if (balance > 1 && compare(node.left!.val, val) > 0) {
        return rotateRight(node);
    }

    // Case 2: Right Right (Parent < -1, Child Right-Heavy)
    if (balance < -1 && compare(node.right!.val, val) < 0) {
        return rotateLeft(node);
    }

    // Case 3: Left Right (Parent > 1, Child Right-Heavy)
    // Double Rotation: Left-Rotate Child, then Right-Rotate Parent
    if (balance > 1 && compare(node.left!.val, val) < 0) {
        node.left = rotateLeft(node.left!);
        return rotateRight(node);
    }

    // Case 4: Right Left (Parent < -1, Child Left-Heavy)
    // Double Rotation: Right-Rotate Child, then Left-Rotate Parent
    if (balance < -1 && compare(node.right!.val, val) > 0) {
        node.right = rotateRight(node.right!);
        return rotateLeft(node);
    }

    return node; // Node is balanced
}

/**
 * Helper: Finds the node with the smallest value in a subtree.
 * Used to find the inorder successor during deletion.
 */
function minValueNode<T extends Value>(node: AVLNode<T>): AVLNode<T> {
    let current = node;
    while (current.left) current = current.left;
    return current;
}

/**
 * Recursively deletes a value from the subtree.
 * Handles the 3 standard BST deletion cases + AVL rebalancing.
 *
 * @param node - Current root.
 * @param val - Value to delete.
 * @returns New root of the subtree or null.
 */
function deleteNode<T extends Value>(node: AVLNode<T> | null, val: T): AVLNode<T> | null {
    // 1. Standard BST Delete
    if (!node) return null;

    const cmp = compare(node.val, val);
    if (cmp > 0) {
        node.left = deleteNode(node.left, val);
    } else if (cmp < 0) {
        node.right = deleteNode(node.right, val);
    } else {
        // Node found: Handling deletion cases
        if (!node.left || !node.right) {
            // Case 1 & 2: No child or One child
            const temp = node.left ? node.left : node.right;
            if (!temp) return null; // No child case
            return temp;            // One child case
        } else {
            // Case 3: Two children
            // Find inorder successor (smallest in right subtree)
            const temp = minValueNode(node.right);
            node.val = temp.val; // Copy value
            // Delete the successor
            node.right = deleteNode(node.right, temp.val);
        }
    }

    // 2. Update stats (if we didn't return early)
    updateStats(node);

    // 3. Rebalance (similar to insert, but checks BF of children instead of value comparison)
    const balance = getBalance(node);

    // Left Heavy
    if (balance > 1 && getBalance(node.left!) >= 0) return rotateRight(node);
    if (balance > 1 && getBalance(node.left!) < 0) {
        node.left = rotateLeft(node.left!);
        return rotateRight(node);
    }

    // Right Heavy
    if (balance < -1 && getBalance(node.right!) <= 0) return rotateLeft(node);
    if (balance < -1 && getBalance(node.right!) > 0) {
        node.right = rotateRight(node.right!);
        return rotateLeft(node);
    }

    return node;
}

/**
 * Creates a structural deep copy of the tree.
 * Used for `mutableCopy()` to allow independent modifications.
 * Complexity: O(N)
 */
function copyTree<T extends Value>(node: AVLNode<T> | null): AVLNode<T> | null {
    if (!node) return null;
    const newNode = new AVLNode(node.val, null, null, node.height, node.size);
    newNode.left = copyTree(node.left);
    newNode.right = copyTree(node.right);
    return newNode;
}

/**
 * Flattens the tree into a sorted array via In-Order Traversal.
 * Complexity: O(N)
 */
function treeToArray<T extends Value>(node: AVLNode<T> | null, acc: T[]) {
    if (!node) return;
    treeToArray(node.left, acc);
    acc.push(node.val);
    treeToArray(node.right, acc);
}

// ============================================================================
// 3. PUBLIC CLASSES
// ============================================================================

/**
 * Immutable wrapper for an array of values.
 * Useful for composite keys in Sets/Maps.
 * * @template T - Array type extending Value[]
 */
export class Tuple<T extends Value[]> {
    readonly #values: ReadonlyArray<Value>;
    readonly hashCode: number;

    /**
     * Creates a new immutable Tuple.
     * Computes the hash immediately upon construction.
     */
    constructor(...values: T) {
        this.#values = values.slice();
        Object.freeze(this.#values);
        let h = 0xDEF0;
        for (const v of this.#values) h = (Math.imul(31, h) + hashValue(v)) | 0;
        this.hashCode = h >>> 0;
    }
    get raw() { return this.#values; }
    get length() { return this.#values.length; }
    
    *[Symbol.iterator]() { yield* this.#values; }
    
    toString() { return `(${this.#values.join(', ')})`; }
    [Symbol.for('nodejs.util.inspect.custom')]() { return this.toString(); }
}

/**
 * A sorted, unique collection of values implemented as an AVL Tree.
 * * Features:
 * - O(log N) Add/Remove/Contains.
 * - Deterministic Hashing based on content (not insertion order).
 * - "Frozen" state: Becomes immutable once hashCode is accessed.
 */
export class RecursiveSet<T extends Value> {
    #root: AVLNode<T> | null = null;
    #hashCode: number | null = null;
    #isFrozen: boolean = false;

    /** Static comparator delegate. */
    static compare(a: unknown, b: unknown): number { return compare(a as Value, b as Value); }

    /**
     * Constructs a new set.
     * @param elements - Initial elements. Complexity O(N log N).
     */
    constructor(...elements: T[]) {
        if (elements.length > 0) {
            for (const el of elements) {
                this.#root = insert(this.#root, el);
            }
        }
    }

    static fromArray<U extends Value>(elements: U[]): RecursiveSet<U> {
        return new RecursiveSet(...elements);
    }
    
    /**
     * Optimized construction from an ALREADY SORTED array.
     * Complexity: O(N) (Linear time).
     * @param elements - Sorted array of unique elements.
     */
    static fromSortedUnsafe<U extends Value>(elements: U[]): RecursiveSet<U> {
        function build(start: number, end: number): AVLNode<U> | null {
            if (start > end) return null;
            const mid = (start + end) >>> 1;
            const node = new AVLNode(elements[mid]);
            node.left = build(start, mid - 1);
            node.right = build(mid + 1, end);
            updateStats(node);
            return node;
        }
        const s = new RecursiveSet<U>();
        s.#root = build(0, elements.length - 1);
        return s;
    }

    /** Ensure the set is not frozen before modification. */
    #checkFrozen(op: string) {
        if (this.#isFrozen) throw new Error(`InvalidOperation: Cannot ${op} a frozen RecursiveSet.`);
    }

    get size(): number { return getSize(this.#root); }
    isEmpty(): boolean { return this.#root === null; }

    /**
     * Computes or returns cached hash code.
     * **Side Effect:** Freezes the set (makes it immutable).
     */
    get hashCode(): number {
        if (this.#hashCode !== null) return this.#hashCode;
        let h = 0x1234;
        const stack: AVLNode<T>[] = [];
        let curr = this.#root;
        while (curr || stack.length) {
            while (curr) { stack.push(curr); curr = curr.left; }
            curr = stack.pop()!;
            h = (Math.imul(31, h) + hashValue(curr.val)) | 0;
            curr = curr.right;
        }
        h = Math.imul(h ^ 0x4567, FNV_PRIME);
        this.#hashCode = h >>> 0;
        this.#isFrozen = true;
        return this.#hashCode;
    }

    /** Returns elements as a sorted array. */
    get raw(): T[] {
        const res: T[] = [];
        treeToArray(this.#root, res);
        return res;
    }

    compare(other: RecursiveSet<Value>): number {
        if (this === other) return 0;
        const h1 = this.hashCode;
        const h2 = other.hashCode;
        if (h1 !== h2) return h1 - h2;
        return compareSequences(this.raw, other.raw);
    }
    equals(other: RecursiveSet<Value>): boolean { return this.compare(other) === 0; }

    /** Check if element exists. Complexity: O(log N). */
    has(element: T): boolean {
        let curr = this.#root;
        while (curr) {
            const cmp = compare(curr.val, element);
            if (cmp === 0) return true;
            curr = cmp > 0 ? curr.left : curr.right;
        }
        return false;
    }

    /** Insert element. Complexity: O(log N). Throws if frozen. */
    add(element: T): this {
        this.#checkFrozen('add');
        this.#root = insert(this.#root, element);
        this.#hashCode = null;
        return this;
    }

    /** Remove element. Complexity: O(log N). Throws if frozen. */
    remove(element: T): this {
        this.#checkFrozen('remove');
        this.#root = deleteNode(this.#root, element);
        this.#hashCode = null;
        return this;
    }

    // --- Set Algebra Operations ---

    /** Union (A ∪ B). Complexity: O(N + M). */
    union<U extends Value>(other: RecursiveSet<U>): RecursiveSet<T | U> {
        const arrA = this.raw;
        const arrB = other.raw;
        const res: (T|U)[] = [];
        let i=0, j=0;
        while(i<arrA.length && j<arrB.length) {
            const cmp = compare(arrA[i], arrB[j]);
            if(cmp < 0) res.push(arrA[i++]);
            else if(cmp > 0) res.push(arrB[j++]);
            else { res.push(arrA[i++]); j++; }
        }
        while(i<arrA.length) res.push(arrA[i++]);
        while(j<arrB.length) res.push(arrB[j++]);
        return RecursiveSet.fromSortedUnsafe(res);
    }
    
    /** Intersection (A ∩ B). Complexity: O(N + M). */
    intersection(other: RecursiveSet<T>): RecursiveSet<T> {
        const res: T[] = [];
        const arrA = this.raw, arrB = other.raw;
        let i=0, j=0;
        while(i<arrA.length && j<arrB.length) {
            const cmp = compare(arrA[i], arrB[j]);
            if(cmp < 0) i++;
            else if(cmp > 0) j++;
            else { res.push(arrA[i++]); j++; }
        }
        return RecursiveSet.fromSortedUnsafe(res);
    }

    /** Difference (A \ B). Complexity: O(N + M). */
    difference(other: RecursiveSet<T>): RecursiveSet<T> {
        const res: T[] = [];
        const arrA = this.raw, arrB = other.raw;
        let i=0, j=0;
        while(i<arrA.length && j<arrB.length) {
            const cmp = compare(arrA[i], arrB[j]);
            if(cmp < 0) res.push(arrA[i++]);
            else if(cmp > 0) j++;
            else { i++; j++; }
        }
        while(i<arrA.length) res.push(arrA[i++]);
        return RecursiveSet.fromSortedUnsafe(res);
    }

    /** Symmetric Difference (A Δ B). Complexity: O(N + M). */
    symmetricDifference(other: RecursiveSet<T>): RecursiveSet<T> {
        const res: T[] = [];
        const arrA = this.raw, arrB = other.raw;
        let i=0, j=0;
        while(i<arrA.length && j<arrB.length) {
            const cmp = compare(arrA[i], arrB[j]);
            if(cmp < 0) res.push(arrA[i++]);
            else if(cmp > 0) res.push(arrB[j++]);
            else { i++; j++; }
        }
        while(i<arrA.length) res.push(arrA[i++]);
        while(j<arrB.length) res.push(arrB[j++]);
        return RecursiveSet.fromSortedUnsafe(res);
    }

    /** Cartesian Product (A × B). Complexity: O(N * M). */
    cartesianProduct<U extends Value>(other: RecursiveSet<U>): RecursiveSet<Tuple<[T, U]>> {
        const result: Tuple<[T, U]>[] = [];
        for (const a of this) {
            for (const b of other) {
                result.push(new Tuple(a, b));
            }
        }
        result.sort(compare);
        return RecursiveSet.fromSortedUnsafe(result);
    }
    
    /** * Generates the Powerset P(S).
     * Warning: Exponential Complexity O(2^N).
     * Throws if size > 20.
     */
    powerset(): RecursiveSet<RecursiveSet<T>> {
        const arr = this.raw;
        const n = arr.length;
        if (n > 20) throw new Error("Powerset too large");
        const subsets: RecursiveSet<T>[] = [];
        const max = 1 << n;
        for (let i = 0; i < max; i++) {
            const subsetElements: T[] = [];
            for (let j = 0; j < n; j++) {
                if (i & (1 << j)) subsetElements.push(arr[j]);
            }
            subsets.push(RecursiveSet.fromSortedUnsafe(subsetElements));
        }
        return RecursiveSet.fromArray(subsets);
    }

    clear(): this { 
        this.#checkFrozen('clear'); 
        this.#root = null; 
        this.#hashCode = 0; 
        return this; 
    }
    
    /** Creates a mutable deep copy of the tree structure. */
    mutableCopy(): RecursiveSet<T> {
        const s = new RecursiveSet<T>();
        s.#root = copyTree(this.#root);
        return s;
    }
    clone(): RecursiveSet<T> { return this.mutableCopy(); }
    
    /** Selects a random element in O(log N) using tree size stats. */
    pickRandom(): T { 
        if (this.isEmpty()) throw new Error("Empty Set");
        let idx = (Math.random() * this.size) | 0;
        let curr = this.#root;
        while (curr) {
            const leftSize = getSize(curr.left);
            if (idx === leftSize) return curr.val;
            if (idx < leftSize) {
                curr = curr.left;
            } else {
                idx -= (leftSize + 1);
                curr = curr.right;
            }
        }
        return this.#root!.val;
    }

    *[Symbol.iterator](): Iterator<T> {
        const stack: AVLNode<T>[] = [];
        let curr = this.#root;
        while (curr || stack.length) {
            while (curr) { stack.push(curr); curr = curr.left; }
            curr = stack.pop()!;
            yield curr.val;
            curr = curr.right;
        }
    }
    
    toString(): string { return `{${this.raw.join(', ')}}`; }
    [Symbol.for('nodejs.util.inspect.custom')]() { return this.toString(); }
    
    isSubset(other: RecursiveSet<T>): boolean {
        if (this.size > other.size) return false;
        const arrA = this.raw, arrB = other.raw;
        let i=0, j=0;
        while(i<arrA.length && j<arrB.length) {
            const cmp = compare(arrA[i], arrB[j]);
            if(cmp < 0) return false; 
            if(cmp > 0) j++;
            else { i++; j++; }
        }
        return i === arrA.length;
    }
    isSuperset(other: RecursiveSet<T>): boolean { return other.isSubset(this); }
}

// ============================================================================
// 4. AVL TREE IMPLEMENTATION FOR MAP (Key-Value)
// ============================================================================

/**
 * Internal Node structure for the Map's AVL Tree.
 * * Unlike the Set node, this holds a distinct `key` (for sorting/identity) 
 * and a `value` (payload).
 * * @template K - Type of the Key (must be a valid Value).
 * @template V - Type of the Value.
 */
class AVLMapNode<K extends Value, V extends Value> {
    constructor(
        public key: K,
        public value: V,
        public left: AVLMapNode<K, V> | null = null,
        public right: AVLMapNode<K, V> | null = null,
        /** Height of the node for balance factor calculation. Leaf = 1. */
        public height: number = 1,
        /** Size of the subtree rooted at this node. Used for rank queries. */
        public size: number = 1
    ) {}
}

/** Safely gets the height of a node (0 if null). O(1). */
function getMapHeight<K extends Value, V extends Value>(n: AVLMapNode<K, V> | null): number { return n ? n.height : 0; }

/** Safely gets the size of a subtree (0 if null). O(1). */
function getMapSize<K extends Value, V extends Value>(n: AVLMapNode<K, V> | null): number { return n ? n.size : 0; }

/** * Recalculates height and size based on children. 
 * Must be called after any structural change to children. O(1).
 */
function updateMapStats<K extends Value, V extends Value>(n: AVLMapNode<K, V>) {
    const lh = n.left ? n.left.height : 0;
    const rh = n.right ? n.right.height : 0;
    n.height = (lh > rh ? lh : rh) + 1;
    n.size = 1 + (n.left ? n.left.size : 0) + (n.right ? n.right.size : 0);
}

/**
 * Performs a Right Rotation to fix Left-Left imbalance.
 * Time Complexity: O(1).
 */
function rotateMapRight<K extends Value, V extends Value>(y: AVLMapNode<K, V>): AVLMapNode<K, V> {
    const x = y.left!;
    const T2 = x.right;
    
    // Rotation
    x.right = y;
    y.left = T2;
    
    // Update stats (Child first, then Parent)
    updateMapStats(y);
    updateMapStats(x);
    
    return x;
}

/**
 * Performs a Left Rotation to fix Right-Right imbalance.
 * Time Complexity: O(1).
 */
function rotateMapLeft<K extends Value, V extends Value>(x: AVLMapNode<K, V>): AVLMapNode<K, V> {
    const y = x.right!;
    const T2 = y.left;
    
    // Rotation
    y.left = x;
    x.right = T2;
    
    // Update stats
    updateMapStats(x);
    updateMapStats(y);
    
    return y;
}

/** Calculates the balance factor (Left Height - Right Height). */
function getMapBalance<K extends Value, V extends Value>(n: AVLMapNode<K, V>): number {
    return n ? getMapHeight(n.left) - getMapHeight(n.right) : 0;
}

/**
 * Recursive Insert or Update operation.
 * * - If key exists: Updates the value.
 * - If key missing: Inserts new node and rebalances the tree on the way up.
 * * Time Complexity: O(log N).
 * * @param node Current root of subtree.
 * @param key Key to insert/update.
 * @param value Value to set.
 * @param ctx Context object to track if a mutation actually occurred (for hash invalidation).
 */
function mapPut<K extends Value, V extends Value>(node: AVLMapNode<K, V> | null, key: K, value: V, ctx: { mutated: boolean }): AVLMapNode<K, V> {
    // 1. Standard BST Insert
    if (!node) {
        ctx.mutated = true; // New node created
        return new AVLMapNode(key, value);
    }

    const cmp = compare(node.key, key);
    
    if (cmp === 0) {
        // Key found: Update Value if different
        if (compare(node.value, value) !== 0) {
            node.value = value;
            ctx.mutated = true; 
        }
        return node;
    }

    if (cmp > 0) node.left = mapPut(node.left, key, value, ctx);
    else node.right = mapPut(node.right, key, value, ctx);

    // 2. Update Stats
    updateMapStats(node);

    // 3. Get Balance
    const balance = getMapBalance(node);

    // 4. Rebalance if needed (4 Cases)
    
    // Left Left Case
    if (balance > 1 && compare(node.left!.key, key) > 0) return rotateMapRight(node);
    
    // Right Right Case
    if (balance < -1 && compare(node.right!.key, key) < 0) return rotateMapLeft(node);
    
    // Left Right Case
    if (balance > 1 && compare(node.left!.key, key) < 0) {
        node.left = rotateMapLeft(node.left!);
        return rotateMapRight(node);
    }
    
    // Right Left Case
    if (balance < -1 && compare(node.right!.key, key) > 0) {
        node.right = rotateMapRight(node.right!);
        return rotateMapLeft(node);
    }

    return node;
}

/**
 * Finds the node with the minimum key in a subtree.
 * Used to find the inorder successor during deletion.
 */
function minMapNode<K extends Value, V extends Value>(node: AVLMapNode<K, V>): AVLMapNode<K, V> {
    let current = node;
    while (current.left) current = current.left;
    return current;
}

/**
 * Recursive Delete operation.
 * * Removes the key and rebalances the tree.
 * Time Complexity: O(log N).
 */
function mapDelete<K extends Value, V extends Value>(node: AVLMapNode<K, V> | null, key: K, ctx: { mutated: boolean }): AVLMapNode<K, V> | null {
    // 1. Standard BST Delete
    if (!node) return null;

    const cmp = compare(node.key, key);
    if (cmp > 0) {
        node.left = mapDelete(node.left, key, ctx);
    } else if (cmp < 0) {
        node.right = mapDelete(node.right, key, ctx);
    } else {
        // Node found
        ctx.mutated = true;
        
        // Case 1 & 2: No child or one child
        if (!node.left || !node.right) {
            const temp = node.left ? node.left : node.right;
            if (!temp) return null; // No child
            return temp;            // One child
        } else {
            // Case 3: Two children
            // Get inorder successor (smallest in right subtree)
            const temp = minMapNode(node.right);
            
            // Copy content
            node.key = temp.key;
            node.value = temp.value; 
            
            // Delete the successor
            node.right = mapDelete(node.right, temp.key, ctx); 
        }
    }

    // 2. Update Stats
    updateMapStats(node);

    // 3. Rebalance
    const balance = getMapBalance(node);

    // Left Heavy
    if (balance > 1 && getMapBalance(node.left!) >= 0) return rotateMapRight(node);
    if (balance > 1 && getMapBalance(node.left!) < 0) {
        node.left = rotateMapLeft(node.left!);
        return rotateMapRight(node);
    }
    // Right Heavy
    if (balance < -1 && getMapBalance(node.right!) <= 0) return rotateMapLeft(node);
    if (balance < -1 && getMapBalance(node.right!) > 0) {
        node.right = rotateMapRight(node.right!);
        return rotateMapLeft(node);
    }

    return node;
}

/**
 * Creates a structural deep copy of the tree nodes.
 * Used for O(N) cloning.
 */
function copyMapTree<K extends Value, V extends Value>(node: AVLMapNode<K, V> | null): AVLMapNode<K, V> | null {
    if (!node) return null;
    const newNode = new AVLMapNode(node.key, node.value, null, null, node.height, node.size);
    newNode.left = copyMapTree(node.left);
    newNode.right = copyMapTree(node.right);
    return newNode;
}

/**
 * Key-Value store based on an AVL Tree.
 * * * Performance Characteristics:
 * - Lookup: **O(log N)** (Binary Search)
 * - Insert/Update: **O(log N)** (AVL Insert + Rebalance)
 * - Delete: **O(log N)** (AVL Delete + Rebalance)
 * * * Features:
 * - Deterministic Hashing based on content.
 * - Total ordering of Keys.
 * - Exclusive ownership of nodes (no structural sharing to ensure safety).
 */
export class RecursiveMap<K extends Value, V extends Value> {
    #root: AVLMapNode<K, V> | null = null;
    #hashCode: number | null = null;
    #isFrozen: boolean = false;

    constructor(entries?: Iterable<[K, V]>) {
        if (entries) {
            for (const [k, v] of entries) this.set(k, v);
        }
    }

    #checkFrozen(op: string) { if (this.#isFrozen) throw new Error(`Frozen: ${op}`); }

    /** Returns the number of entries in the map. O(1). */
    get size() { return getMapSize(this.#root); }
    
    /** Returns true if the map contains no entries. O(1). */
    isEmpty() { return this.#root === null; }

    /**
     * Computes or returns the cached hash code.
     * * **Side Effect:** Freezes the map to ensure hash stability.
     * The hash is computed via an in-order traversal to be deterministic
     * regardless of insertion history.
     */
    get hashCode(): number {
        if (this.#hashCode !== null) return this.#hashCode;
        let h = 0x9ABC;
        // In-Order Traversal (Stack based to avoid recursion depth issues)
        const stack: AVLMapNode<K, V>[] = [];
        let curr = this.#root;
        while (curr || stack.length) {
            while (curr) { stack.push(curr); curr = curr.left; }
            curr = stack.pop()!;
            
            // Hash Mixing Logic: Combine Hash(Key) and Hash(Value)
            const entryHash = (Math.imul(hashValue(curr.key), 31) ^ hashValue(curr.value)) | 0;
            h = (Math.imul(31, h) + entryHash) | 0;
            
            curr = curr.right;
        }
        this.#hashCode = h >>> 0;
        this.#isFrozen = true;
        return this.#hashCode;
    }

    /**
     * Deep comparison with another RecursiveMap.
     * Two maps are equal if they contain the same key-value pairs.
     * Time Complexity: O(N) (Structural scan).
     */
    compare(other: RecursiveMap<Value, Value>): number {
        if (this === other) return 0;
        const h1 = this.hashCode;
        const h2 = other.hashCode;
        if (h1 !== h2) return h1 - h2;
        
        // Iterator compare (Linear Scan)
        const itA = this[Symbol.iterator]();
        const itB = other[Symbol.iterator]();
        
        while (true) {
            const a = itA.next();
            const b = itB.next();
            if (a.done && b.done) return 0;
            if (a.done) return -1;
            if (b.done) return 1;
            
            const [kA, vA] = a.value;
            const [kB, vB] = b.value;
            
            const cmpK = compare(kA, kB);
            if (cmpK !== 0) return cmpK;
            
            const cmpV = compare(vA, vB);
            if (cmpV !== 0) return cmpV;
        }
    }
    
    equals(other: RecursiveMap<Value, Value>) { return this.compare(other) === 0; }

    /** Checks if a key exists in the map. O(log N). */
    has(key: K): boolean {
        let curr = this.#root;
        while (curr) {
            const cmp = compare(curr.key, key);
            if (cmp === 0) return true;
            curr = cmp > 0 ? curr.left : curr.right;
        }
        return false;
    }
    
    /** Retrieves the value associated with the key. O(log N). */
    get(key: K): V | undefined {
        let curr = this.#root;
        while (curr) {
            const cmp = compare(curr.key, key);
            if (cmp === 0) return curr.value;
            curr = cmp > 0 ? curr.left : curr.right;
        }
        return undefined;
    }

    /** * Inserts or updates a key-value pair.
     * Time Complexity: O(log N).
     * @throws Error if map is frozen.
     */
    set(key: K, value: V): this {
        this.#checkFrozen('set');
        const ctx = { mutated: false };
        this.#root = mapPut(this.#root, key, value, ctx);
        if (ctx.mutated) this.#hashCode = null;
        return this;
    }

    /** * Removes the key from the map.
     * Time Complexity: O(log N).
     * @returns True if an element was removed, false otherwise.
     * @throws Error if map is frozen.
     */
    delete(key: K): boolean {
        this.#checkFrozen('delete');
        const ctx = { mutated: false };
        this.#root = mapDelete(this.#root, key, ctx);
        if (ctx.mutated) this.#hashCode = null;
        return ctx.mutated;
    }

    /** Clears the map. O(1) for GC, conceptually O(N). */
    clear(): this { 
        this.#checkFrozen('clear'); 
        this.#root = null; 
        this.#hashCode = null; 
        return this; 
    }
    
    /** Creates a mutable deep copy of the map structure. O(N). */
    mutableCopy(): RecursiveMap<K, V> {
        const map = new RecursiveMap<K, V>();
        map.#root = copyMapTree(this.#root);
        return map;
    }
    
    clone() { return this.mutableCopy(); }

    // --- Iterators (In-Order Traversal) ---
    
    /** Returns all keys in sorted order. */
    keys(): K[] {
        const res: K[] = [];
        const stack: AVLMapNode<K,V>[] = [];
        let curr = this.#root;
        while(curr || stack.length) {
            while(curr) { stack.push(curr); curr = curr.left; }
            curr = stack.pop()!;
            res.push(curr.key);
            curr = curr.right;
        }
        return res;
    }

    /** Returns all values in key-sorted order. */
    values(): V[] {
        const res: V[] = [];
        const stack: AVLMapNode<K,V>[] = [];
        let curr = this.#root;
        while(curr || stack.length) {
            while(curr) { stack.push(curr); curr = curr.left; }
            curr = stack.pop()!;
            res.push(curr.value);
            curr = curr.right;
        }
        return res;
    }

    /** Returns [key, value] pairs in sorted order. */
    entries(): [K, V][] {
        const res: [K, V][] = [];
        const stack: AVLMapNode<K,V>[] = [];
        let curr = this.#root;
        while(curr || stack.length) {
            while(curr) { stack.push(curr); curr = curr.left; }
            curr = stack.pop()!;
            res.push([curr.key, curr.value]);
            curr = curr.right;
        }
        return res;
    }

    *[Symbol.iterator](): Iterator<[K, V]> {
        const stack: AVLMapNode<K,V>[] = [];
        let curr = this.#root;
        while(curr || stack.length) {
            while(curr) { stack.push(curr); curr = curr.left; }
            curr = stack.pop()!;
            yield [curr.key, curr.value];
            curr = curr.right;
        }
    }
    
    toString() {
        // Efficient String build via array
        const entries = this.entries().map(([k, v]) => `${String(k)} => ${String(v)}`);
        return `Map{${entries.join(', ')}}`;
    }
    [Symbol.for('nodejs.util.inspect.custom')]() { return this.toString(); }
}

export function emptySet<T extends Value>() { return new RecursiveSet<T>(); }
export function singleton<T extends Value>(el: T) { return new RecursiveSet<T>(el); }