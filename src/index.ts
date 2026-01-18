/**
 * @module recursive-set
 * @version 7.2.0
 * @description
 * **High-Performance ZFC Set Implementation.**
 * This library sacrifices runtime safety checks for raw speed.
 * * **Strict Contract:**
 * 1. **Finite Numbers Only:** No `NaN`, no `Infinity`.
 * 2. **No Mutation:** Do not mutate arrays/tuples/objects after insertion.
 * 3. **Type Consistency:** Avoid mixing distinct types (Array vs Tuple) that might hash collide.
 */

export type Primitive = number | string;
export type Value = Primitive | RecursiveSet<Value> | Tuple<Value[]> | RecursiveMap<Value,Value> | ReadonlyArray<Value>;

// ============================================================================
// FAST HASHING (Optimized FNV-1a)
// ============================================================================
const FNV_PRIME = 16777619;
const FNV_OFFSET = 2166136261;
const floatBuffer = new ArrayBuffer(8);
const view = new DataView(floatBuffer);

/**
 * Hashes a number using FNV-1a.
 * Optimizes for 32-bit integers to avoid Float64 processing overhead.
 */
function hashNumber(val: number): number {
    // Integer optimization: Skip float logic if it's a 32-bit int
    if ((val | 0) === val) return val | 0;
    
    view.setFloat64(0, val, true); // Little Endian
    let h = FNV_OFFSET;
    h ^= view.getInt32(0, true);
    h = Math.imul(h, FNV_PRIME);
    h ^= view.getInt32(4, true);
    h = Math.imul(h, FNV_PRIME);
    return h >>> 0;
}

function hashString(str: string): number {
    let h = FNV_OFFSET;
    const len = str.length;
    for (let i = 0; i < len; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, FNV_PRIME);
    }
    return h >>> 0;
}

export function hashValue(v: Value): number {
    if (typeof v === 'number') return hashNumber(v);
    if (typeof v === 'string') return hashString(v);
    if (v instanceof RecursiveSet || v instanceof Tuple || v instanceof RecursiveMap) return v.hashCode;
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

// ============================================================================
// COMPARATOR (Optimized)
// ============================================================================

/**
 * Global comparator for Total Ordering.
 * * **WARNING: UNSAFE OPTIMIZATIONS**
 * - Uses `a - b` for numbers. **Precondition:** Only finite numbers allowed. 
 * Inputting `NaN` or `Infinity` results in undefined sorting behavior.
 * - **Hash Collisions:** If two distinct object types (e.g. Array vs Tuple) have the 
 * same hash, they may be treated as equal. Avoid mixing structure types in the same set.
 */
export function compare(a: Value, b: Value): number {
    // 1. Identity Check (Fastest)
    if (a === b) return 0;

    // 2. Primitive & Broad Type Separation
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    if (typeof a === 'string' && typeof b === 'string') return a < b ? -1 : 1;

    const typeA = typeof a;
    const typeB = typeof b;
    if (typeA !== typeB) {
        const scoreA = (typeA === 'number') ? 1 : (typeA === 'string' ? 2 : 3);
        const scoreB = (typeB === 'number') ? 1 : (typeB === 'string' ? 2 : 3);
        return scoreA - scoreB;
    }

    // --- OBJECT COMPARISON START ---

    // 3. Primary Sort Key: Hash Code (O(1))
    const h1 = hashValue(a);
    const h2 = hashValue(b);
    if (h1 !== h2) return h1 - h2;

    // 4. Same-Type Optimization (Hot Path)
    // Wenn Hash gleich ist (Kollision oder Gleichheit), prüfen wir zuerst den gleichen Typ.
    // Das deckt 99.9% der Fälle ab.
    if (a instanceof RecursiveSet && b instanceof RecursiveSet) return a.compare(b);
    if (a instanceof RecursiveMap && b instanceof RecursiveMap) return a.compare(b);
    if (a instanceof Tuple && b instanceof Tuple) return compareSequences(a.raw, b.raw);
    if (Array.isArray(a) && Array.isArray(b)) return compareSequences(a, b);

    // 5. Mixed-Type Collision Handling (Cold Path)
    // Dieser Code wird nur kompiliert/ausgeführt, wenn wir wirklich 
    // eine Hash-Kollision zwischen UNTERSCHIEDLICHEN Typen haben.
    const getTypeId = (v: Value): number => {
        if (Array.isArray(v)) return 1;
        if (v instanceof Tuple) return 2;
        if (v instanceof RecursiveSet) return 3;
        if (v instanceof RecursiveMap) return 4;
        return 99;
    };

    const tA = getTypeId(a);
    const tB = getTypeId(b);
    if (tA !== tB) return tA - tB;

    return 0;
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
// CLASSES
// ============================================================================

/**
 * Immutable Tuple container.
 * * **Contract:**
 * - Creates a defensive copy of the input array.
 * - Freezes the internal storage (`Object.freeze`).
 * - **Note:** Freezing is **shallow**. Do not mutate nested elements.
 * @template T - Array type of the tuple elements.
 */
export class Tuple<T extends Value[]> {
    readonly #values: ReadonlyArray<Value>;
    readonly hashCode: number;
    
    constructor(...values: T) {
        this.#values = values.slice(); // Defensive copy
        Object.freeze(this.#values);   // Freeze for safety
        this.hashCode = hashValue(this.#values);
    }
    
    /** * Returns the readonly internal array. 
     * **Warning:** Readonly is only enforced by TypeScript. 
     * Mutating the underlying array via `as any` breaks invariants.
     */
    get raw(): ReadonlyArray<Value> { return this.#values; }
    get length(): number { return this.#values.length; }
    /** Alias for compatibility. */
    get values(): ReadonlyArray<Value> { return this.#values; } 
    
    /** Iterates over tuple elements. */
    *[Symbol.iterator](): Iterator<Value> { yield* this.#values; }
    
    /** Returns string representation "(a, b)". */
    toString(): string { return `(${this.#values.join(', ')})`; }
    
    /** Custom inspection for Node.js console.log to print "(a, b)" cleanly. */
    [Symbol.for('nodejs.util.inspect.custom')]() { return this.toString(); }
}

/**
 * High-Performance Recursive Set.
 * * **Lifecycle & Safety:**
 * - **Freeze-on-Hash:** The set is effectively immutable once `hashCode` is accessed
 * (or it is added to another set/map).
 * - **Runtime Checks:** Mutation methods verify frozen state via a fast boolean check.
 * * @template T - Type of elements.
 */
export class RecursiveSet<T extends Value> {
    #elements: T[];
    #hashCode: number | null = null;
    #isFrozen: boolean = false; 

    // Static wrapper for compatibility
    static compare(a: unknown, b: unknown): number { return compare(a as Value, b as Value); }

    /**
     * Creates a new RecursiveSet.
     * Elements are sorted and deduplicated ($O(N \log N)$).
     * @param elements Initial elements.
     */
    constructor(...elements: T[]) {
        if (elements.length > 1) {
            elements.sort(compare);
            this.#elements = this.#unique(elements);
        } else {
            this.#elements = elements; 
        }
    }

    // === CRITICAL PERFORMANCE METHODS ===

    /** * **Bulk Load (O(N log N))**: Creates a set from a raw array.
     * Sorts and deduplicates. Much faster than iterative insertion.
     */
    static fromArray<T extends Value>(elements: T[]): RecursiveSet<T> {
        const s = new RecursiveSet<T>();
        if (elements.length > 1) {
            elements.sort(compare);
            s.#elements = s.#unique(elements);
        } else {
            s.#elements = elements;
        }
        return s;
    }

    /** * **UNSAFE (O(1))**: Bypasses all checks.
     * @param sortedUnique Input must be ALREADY sorted and deduplicated.
     * Use only if you strictly guarantee invariants.
     */
    static fromSortedUnsafe<T extends Value>(sortedUnique: T[]): RecursiveSet<T> {
        const s = new RecursiveSet<T>();
        s.#elements = sortedUnique;
        return s;
    }

    #unique(sorted: T[]): T[] {
        if (sorted.length < 2) return sorted;
        const out: T[] = [sorted[0]];
        let last = sorted[0];
        const len = sorted.length;
        for (let i = 1; i < len; i++) {
            const curr = sorted[i];
            if (compare(curr, last) !== 0) {
                out.push(curr);
                last = curr;
            }
        }
        return out;
    }

    #checkFrozen(op: string) {
        if (this.#isFrozen) {
            throw new Error(`InvalidOperation: Cannot ${op} a frozen RecursiveSet. Use mutableCopy().`);
        }
    }

    /** * Returns the internal sorted array (readonly). 
     * **Warning:** Readonly is only enforced by TypeScript. 
     * Mutating the underlying array via `as any` breaks invariants (Binary Search/Sort rely on strict ordering).
     */
    get raw(): readonly T[] { return this.#elements; }

    /** * Computes the hash code. 
     * **Side Effect**: Freezes the set to prevent hash corruption.
     */
    get hashCode(): number {
        if (this.#hashCode !== null) return this.#hashCode;
        let h = 0;
        const arr = this.#elements;
        const len = arr.length;
        for (let i = 0; i < len; i++) {
            h = (Math.imul(31, h) + hashValue(arr[i])) | 0;
        }
        this.#hashCode = h;
        this.#isFrozen = true; // Freeze on hash access
        return h;
    }

    get isFrozen(): boolean { return this.#isFrozen; }
    get size(): number { return this.#elements.length; }
    isEmpty(): boolean { return this.#elements.length === 0; }

    /**
     * Compares this set with another set for ordering.
     * Uses hash comparison first, then deep structural comparison.
     */
    compare(other: RecursiveSet<Value>): number {
        if (this === other) return 0;
        const h1 = this.hashCode;
        const h2 = other.hashCode;
        if (h1 !== h2) return h1 < h2 ? -1 : 1;
        const arrA = this.#elements;
        const arrB = other.#elements;
        const len = arrA.length;
        if (len !== arrB.length) return len - arrB.length;
        for (let i = 0; i < len; i++) {
            const diff = compare(arrA[i], arrB[i]);
            if (diff !== 0) return diff;
        }
        return 0;
    }

    equals(other: RecursiveSet<Value>): boolean { return this.compare(other) === 0; }

    /**
     * Checks if element exists.
     * Uses Binary Search ($O(\log N)$) for larger sets, linear scan for small sets.
     */
    has(element: T): boolean {
        const arr = this.#elements;
        const len = arr.length;
        if (len < 10) { // Linear scan optimization
            for (let i = 0; i < len; i++) {
                if (compare(arr[i], element) === 0) return true;
            }
            return false;
        }
        let low = 0, high = len - 1;
        while (low <= high) {
            const mid = (low + high) >>> 1;
            const cmp = compare(arr[mid], element);
            if (cmp === 0) return true;
            if (cmp < 0) low = mid + 1;
            else high = mid - 1;
        }
        return false;
    }

    /**
     * Adds an element. 
     * @throws if set is frozen.
     * Complexity: $O(N)$ (Array splice).
     */
    add(element: T): this {
        this.#checkFrozen('add() to');
        const arr = this.#elements;
        // Optimization: Check last element first (append is common)
        if (arr.length > 0) {
            const lastCmp = compare(arr[arr.length-1], element);
            if (lastCmp < 0) {
                arr.push(element);
                this.#hashCode = null;
                return this;
            }
            if (lastCmp === 0) return this;
        }

        let low = 0, high = arr.length - 1, idx = arr.length;
        while (low <= high) {
            const mid = (low + high) >>> 1;
            const cmp = compare(arr[mid], element);
            if (cmp === 0) return this;
            if (cmp < 0) low = mid + 1;
            else { idx = mid; high = mid - 1; }
        }
        arr.splice(idx, 0, element);
        this.#hashCode = null;
        return this;
    }

    /**
     * Removes an element.
     * @throws if set is frozen.
     * Complexity: $O(N)$.
     */
    remove(element: T): this {
        this.#checkFrozen('remove() from');
        const arr = this.#elements;
        let low = 0, high = arr.length - 1;
        while (low <= high) {
            const mid = (low + high) >>> 1;
            const cmp = compare(arr[mid], element);
            if (cmp === 0) {
                arr.splice(mid, 1);
                this.#hashCode = null;
                return this;
            }
            if (cmp < 0) low = mid + 1;
            else high = mid - 1;
        }
        return this;
    }

    clear(): this {
        this.#checkFrozen('clear()');
        this.#elements = [];
        this.#hashCode = 0;
        return this;
    }

    mutableCopy(): RecursiveSet<T> {
        const s = new RecursiveSet<T>();
        s.#elements = this.#elements.slice();
        return s;
    }
    
    clone(): RecursiveSet<T> { return this.mutableCopy(); }

    /**
     * Picks a random element in O(1).
     * **UNSAFE:** Assumes the set is NOT empty.
     * @returns The element of type T.
     * @throws (at runtime) or returns undefined if set is empty, but TS treats it as T.
     */
    pickRandom(): T {
        const arr = this.#elements;
        // Performance-Hack: Kein if-check.
        // Wir vertrauen darauf, dass der Caller vorher !isEmpty() geprüft hat.
        const idx = (Math.random() * arr.length) | 0;
        return arr[idx]!; // Force TS to accept this is defined
    }

    // === OPTIMIZED SET OPERATIONS (Merge Scan) ===

    /**
     * Computes Union $A \cup B$.
     * Implementation: Merge Scan.
     * Complexity: $O(|A| + |B|)$.
     */
    union<U extends Value>(other: RecursiveSet<U>): RecursiveSet<T | U> {
        const A = this.#elements;
        const B = other.raw; // Efficient access via getter
        const res: (T|U)[] = [];
        let i = 0, j = 0;
        const lenA = A.length, lenB = B.length;
        
        while (i < lenA && j < lenB) {
            const cmp = compare(A[i], B[j]);
            if (cmp < 0) res.push(A[i++]);
            else if (cmp > 0) res.push(B[j++]);
            else { res.push(A[i++]); j++; }
        }
        while (i < lenA) res.push(A[i++]);
        while (j < lenB) res.push(B[j++]);
        
        return RecursiveSet.fromSortedUnsafe(res as any);
    }

    /**
     * Computes Intersection $A \cap B$.
     * Implementation: Synchronous Scan.
     * Complexity: $O(|A| + |B|)$.
     */
    intersection(other: RecursiveSet<T>): RecursiveSet<T> {
        const A = this.#elements;
        const B = other.raw;
        const res: T[] = [];
        let i = 0, j = 0;
        const lenA = A.length, lenB = B.length;

        while (i < lenA && j < lenB) {
            const cmp = compare(A[i], B[j]);
            if (cmp < 0) i++;
            else if (cmp > 0) j++;
            else { res.push(A[i++]); j++; }
        }
        return RecursiveSet.fromSortedUnsafe(res);
    }

    /**
     * Computes Difference $A \setminus B$.
     * Complexity: $O(|A| + |B|)$.
     */
    difference(other: RecursiveSet<T>): RecursiveSet<T> {
        const A = this.#elements;
        const B = other.raw;
        const res: T[] = [];
        let i = 0, j = 0;
        const lenA = A.length, lenB = B.length;

        while (i < lenA && j < lenB) {
            const cmp = compare(A[i], B[j]);
            if (cmp < 0) res.push(A[i++]);
            else if (cmp > 0) j++;
            else { i++; j++; }
        }
        while (i < lenA) res.push(A[i++]);
        return RecursiveSet.fromSortedUnsafe(res);
    }

    /**
     * Computes Symmetric Difference $A \triangle B$.
     * Complexity: $O(|A| + |B|)$.
     */
    symmetricDifference(other: RecursiveSet<T>): RecursiveSet<T> {
        const A = this.#elements;
        const B = other.raw;
        const res: T[] = [];
        let i = 0, j = 0;
        const lenA = A.length, lenB = B.length;

        while (i < lenA && j < lenB) {
            const cmp = compare(A[i], B[j]);
            if (cmp < 0) res.push(A[i++]);
            else if (cmp > 0) res.push(B[j++]);
            else { i++; j++; }
        }
        while (i < lenA) res.push(A[i++]);
        while (j < lenB) res.push(B[j++]);
        return RecursiveSet.fromSortedUnsafe(res);
    }

    /**
     * Computes Cartesian Product $A \times B$.
     * Complexity: $O(|A| \cdot |B| \cdot \log(|A| \cdot |B|))$ (due to sorting).
     */
    cartesianProduct<U extends Value>(other: RecursiveSet<U>): RecursiveSet<Tuple<[T, U]>> {
        const result: Tuple<[T, U]>[] = [];
        const arrA = this.#elements;
        const arrB = other.raw;
        const lenA = arrA.length;
        const lenB = arrB.length;

        for (let i = 0; i < lenA; i++) {
            const a = arrA[i];
            for (let j = 0; j < lenB; j++) {
                result.push(new Tuple(a, arrB[j]));
            }
        }
        // Hashes are not monotonic, so we MUST sort. 
        result.sort(compare);
        // But uniqueness is guaranteed mathematically, so use unsafe create
        return RecursiveSet.fromSortedUnsafe(result);
    }

    /**
     * Computes the Power Set $\mathcal{P}(A)$.
     * Complexity: $O(2^N)$.
     * @throws if size > 20.
     */
    powerset(): RecursiveSet<RecursiveSet<T>> {
        const n = this.size;
        if (n > 20) throw new Error("Powerset too large");
        
        const subsets: RecursiveSet<T>[] = [];
        const max = 1 << n;
        for (let i = 0; i < max; i++) {
            const subsetElements: T[] = [];
            for (let j = 0; j < n; j++) {
                if (i & (1 << j)) subsetElements.push(this.#elements[j]);
            }
            // Elements inside subset are already sorted -> Unsafe
            subsets.push(RecursiveSet.fromSortedUnsafe(subsetElements));
        }
        // Subsets themselves need sorting
        return RecursiveSet.fromArray(subsets);
    }

    isSubset(other: RecursiveSet<T>): boolean {
        if (this.size > other.size) return false;
        let i = 0, j = 0;
        const A = this.#elements, B = other.raw;
        while (i < A.length && j < B.length) {
            const cmp = compare(A[i], B[j]);
            if (cmp < 0) return false;
            if (cmp > 0) j++;
            else { i++; j++; }
        }
        return i === A.length;
    }

    isSuperset(other: RecursiveSet<T>): boolean { return other.isSubset(this); }
    
    /** Iterates over set elements in sorted order. */
    *[Symbol.iterator](): Iterator<T> { yield* this.#elements; }
    
    /** Returns string representation e.g. "{1, 2, 3}". */
    toString(): string { return `{${this.#elements.join(', ')}}`; }
    
    /** Custom inspection for Node.js console to avoid printing internal state. */
    [Symbol.for('nodejs.util.inspect.custom')]() { return this.toString(); }
}

/**
 * Immutable Map based on RecursiveSet architecture.
 * Maps Keys to Values using Deep Value Equality for Keys.
 *
 * Storage: Sorted Array of {key, value} objects.
 * Lookup: Binary Search on Keys.
 */
export class RecursiveMap<K extends Value, V extends Value> {
    #entries: Array<{ key: K, value: V }>;
    #hashCode: number | null = null;
    #isFrozen: boolean = false;

    constructor(entries?: Iterable<[K, V]>) {
        this.#entries = [];
        if (entries) {
            for (const [k, v] of entries) {
                this.set(k, v);
            }
        }
    }

    // === CRITICAL INFRASTRUCTURE ===

    #checkFrozen(op: string) {
        if (this.#isFrozen) {
            throw new Error(`InvalidOperation: Cannot ${op} a frozen RecursiveMap. Use mutableCopy().`);
        }
    }

    get size(): number { return this.#entries.length; }

    isEmpty(): boolean { return this.#entries.length === 0; }

    get hashCode(): number {
        if (this.#hashCode !== null) return this.#hashCode;
        let h = 0;
        const len = this.#entries.length;
        // Map Hash: Combine Hash(Key) and Hash(Value)
        // We use the same accumulation strategy as Set, but including values.
        for (let i = 0; i < len; i++) {
            const entry = this.#entries[i];
            const hKey = hashValue(entry.key);
            const hVal = hashValue(entry.value);
            // Mix key and value hashes
            const entryHash = (Math.imul(hKey, 31) ^ hVal) | 0;
            h = (Math.imul(31, h) + entryHash) | 0;
        }
        this.#hashCode = h;
        this.#isFrozen = true;
        return h;
    }

    /**
     * Deep comparison of two maps.
     * Maps are equal if they have the same size and identical (key, value) pairs.
     */
    compare(other: RecursiveMap<Value, Value>): number {
        if (this === other) return 0;

        const lenA = this.#entries.length;
        const lenB = other.#entries.length;
        if (lenA !== lenB) return lenA - lenB;

        // Since entries are sorted by Key, we can iterate linearly.
        for (let i = 0; i < lenA; i++) {
            const entryA = this.#entries[i];
            const entryB = other.#entries[i];

            // 1. Compare Keys
            const cmpKey = compare(entryA.key, entryB.key);
            if (cmpKey !== 0) return cmpKey;

            // 2. If Keys are equal, compare Values
            const cmpVal = compare(entryA.value, entryB.value);
            if (cmpVal !== 0) return cmpVal;
        }
        return 0;
    }

    equals(other: RecursiveMap<Value, Value>): boolean { return this.compare(other) === 0; }

    // === DATA ACCESS ===

    /**
     * Binary Search for Key Index.
     * Returns index if found, or bitwise complement (~index) of insertion point if not found.
     */
    #indexOf(key: K): number {
        const arr = this.#entries;
        let low = 0, high = arr.length - 1;

        while (low <= high) {
            const mid = (low + high) >>> 1;
            const cmp = compare(arr[mid].key, key);
            if (cmp === 0) return mid;
            if (cmp < 0) low = mid + 1;
            else high = mid - 1;
        }
        return ~low; // Returns - (insertionPoint + 1)
    }

    has(key: K): boolean {
        return this.#indexOf(key) >= 0;
    }

    get(key: K): V | undefined {
        const idx = this.#indexOf(key);
        return idx >= 0 ? this.#entries[idx].value : undefined;
    }

    // === MUTATION ===

    set(key: K, value: V): this {
        this.#checkFrozen('set() on');
        const idx = this.#indexOf(key);

        if (idx >= 0) {
            // Update existing key
            // Optimization: If value is structurally equal, do nothing (preserve hash/immutability check cost)
            if (compare(this.#entries[idx].value, value) !== 0) {
                this.#entries[idx].value = value;
                this.#hashCode = null;
            }
        } else {
            // Insert new key at sorted position
            const insertPos = ~idx;
            this.#entries.splice(insertPos, 0, { key, value });
            this.#hashCode = null;
        }
        return this;
    }

    delete(key: K): boolean {
        this.#checkFrozen('delete() from');
        const idx = this.#indexOf(key);
        if (idx >= 0) {
            this.#entries.splice(idx, 1);
            this.#hashCode = null;
            return true;
        }
        return false;
    }

    clear(): this {
        this.#checkFrozen('clear()');
        this.#entries = [];
        this.#hashCode = null;
        return this;
    }

    mutableCopy(): RecursiveMap<K, V> {
        const map = new RecursiveMap<K, V>();
        // Shallow copy the array of objects (objects themselves are {key, value})
        // Since we treat K and V as immutable values in this library context, simple object spread or slice is ok for the array container
        map.#entries = this.#entries.map(e => ({ key: e.key, value: e.value }));
        return map;
    }

    clone(): RecursiveMap<K, V> { return this.mutableCopy(); }

    // === ITERATORS & UTILS ===

    keys(): K[] { return this.#entries.map(e => e.key); }
    values(): V[] { return this.#entries.map(e => e.value); }
    entries(): [K, V][] { return this.#entries.map(e => [e.key, e.value]); }

    *[Symbol.iterator](): Iterator<[K, V]> {
        for (const e of this.#entries) {
            yield [e.key, e.value];
        }
    }

    toString(): string {
        const body = this.#entries
            .map(e => `${String(e.key)} => ${String(e.value)}`)
            .join(', ');
        return `Map{${body}}`;
    }

    [Symbol.for('nodejs.util.inspect.custom')]() { return this.toString(); }
}

// Exports
/** Factory: Creates an empty RecursiveSet */
export function emptySet<T extends Value>(): RecursiveSet<T> { return new RecursiveSet<T>(); }
/** Factory: Creates a singleton RecursiveSet containing {element} */
export function singleton<T extends Value>(element: T): RecursiveSet<T> { return new RecursiveSet<T>(element); }
