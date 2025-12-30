/**
 * @module recursive-set
 * High-Performance Recursive Set with "Freeze-on-Hash" semantics.
 * Version: 6.0.0
 */

// ============================================================================
// HASHING ENGINE (FNV-1a with DataView & Safe Integer Split)
// ============================================================================

const FNV_PRIME = 16777619;
const FNV_OFFSET = 2166136261;

// Shared buffer to avoid allocation overhead (reused for all number hashing)
const floatBuffer = new ArrayBuffer(8);
const view = new DataView(floatBuffer);

/**
 * Hashes a number using FNV-1a.
 * Handles both safe integers (via high/low split) and floats (via IEEE 754 bits).
 * Ensures platform consistency by enforcing Little Endian byte order.
 */
function hashNumber(val: number): number {
    // Integer Path: Handle Safe Integers correctly (up to 2^53)
    if (Number.isSafeInteger(val)) {
        let h = FNV_OFFSET;
        
        const lowU = val >>> 0;
        const high = ((val - lowU) / 4294967296) | 0;

        h ^= lowU;
        h = Math.imul(h, FNV_PRIME);
        
        h ^= high;
        h = Math.imul(h, FNV_PRIME);
        
        return h >>> 0;
    }

    // Float Path: IEEE 754 Bit Pattern (Little Endian Enforced)
    view.setFloat64(0, val, true); 
    
    let h = FNV_OFFSET;
    const low = view.getInt32(0, true);
    const high = view.getInt32(4, true);

    h ^= low;
    h = Math.imul(h, FNV_PRIME);
    h ^= high;
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

/**
 * Computes a 32-bit hash code for a supported value.
 * @param val The value to hash (number, string, Tuple, RecursiveSet, or Array)
 */
function hashValue(val: unknown): number {
    if (typeof val === 'string') return hashString(val);
    if (typeof val === 'number') return hashNumber(val);
    
    // Strict Fast-Path: Only trust our own Primitives
    if (val instanceof RecursiveSet || val instanceof Tuple) {
        return val.hashCode;
    }
    
    if (Array.isArray(val)) {
        let h = FNV_OFFSET;
        const len = val.length;
        for (let i = 0; i < len; i++) {
            h ^= hashValue(val[i]);
            h = Math.imul(h, FNV_PRIME);
        }
        return h >>> 0;
    }
    return 0;
}

// ============================================================================
// STRICT COMPARATOR (Total Order)
// ============================================================================

/**
 * Determines the sort priority of a type.
 * Order: number (1) < string (2) < Sequence (3) < Set (4)
 */
function getTypeScore(a: unknown): number {
    if (typeof a === 'number') return 1;
    if (typeof a === 'string') return 2;
    if (Array.isArray(a) || a instanceof Tuple) return 3; 
    if (a instanceof RecursiveSet) return 4;
    return 0; 
}

/**
 * Compares two values for sorting.
 * Implements a strict total order:
 * 1. Semantic Type Score (Number < String < Seq < Set)
 * 2. Hash Code (Short-Circuit)
 * 3. Deep Structural Comparison
 */
function compare(a: unknown, b: unknown): number {
    if (a === b) return 0;

    // 1. Semantic Grouping
    const scoreA = getTypeScore(a);
    const scoreB = getTypeScore(b);
    
    if (scoreA !== scoreB) {
        return scoreA < scoreB ? -1 : 1;
    }

    // 2. PRIMITIVES: Value Sort (Human readable & Fast)
    if (scoreA === 1) return (a as number) < (b as number) ? -1 : 1;
    if (scoreA === 2) return (a as string) < (b as string) ? -1 : 1;

    // 3. OBJECTS: Hash Optimization (Performance Protection)
    const ha = hashValue(a);
    const hb = hashValue(b);
    
    if (ha !== hb) return ha < hb ? -1 : 1;

    // 3. Fallback / Structural Comparison
    if (scoreA === 4) {
        return (a as RecursiveSet<unknown>).compare(b as RecursiveSet<unknown>);
    }

    // Sequence Comparison (Arrays & Tuples)
    const valA = (a instanceof Tuple) ? a.values : (a as unknown[]);
    const valB = (b instanceof Tuple) ? b.values : (b as unknown[]);
    
    const len = valA.length;
    if (len !== valB.length) return len - valB.length;
    
    for (let i = 0; i < len; i++) {
        const diff = compare(valA[i], valB[i]);
        if (diff !== 0) return diff;
    }
    
    return 0;
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validates that an element is of a supported immutable-compatible type.
 * Throws if the type is mutable (plain object) or unsupported (function, symbol).
 * @throws {Error} if element type is invalid.
 */
function validateType(element: unknown) {
    if (typeof element === 'number') {
        if (Number.isNaN(element)) throw new Error("NaN is not supported");
        return;
    }
    if (typeof element === 'string') return;
    
    if (Array.isArray(element)) {
        for (const item of element) validateType(item);
        return;
    }

    if (typeof element === 'object' && element !== null) {
        if (element instanceof RecursiveSet || element instanceof Tuple) {
            return;
        }
    }
    throw new Error("Unsupported Type: Use number, string, Tuple, Array or RecursiveSet.");
}

// ============================================================================
// CLASSES
// ============================================================================

/**
 * Immutable Tuple container.
 * * Guarantees structural immutability by freezing the internal array storage.
 * Note: Immutability is shallow. If you store mutable Arrays inside a Tuple,
 * the Tuple logic remains correct, but the content inside the Array might change.
 * For strict value semantics, use Tuple<Primitive | RecursiveSet | Tuple>.
 * * @template T The tuple type.
 */
export class Tuple<T extends unknown[]> {
    #values: T;
    readonly hashCode: number;

    /**
     * Creates a new Tuple.
     * @param values Elements of the tuple.
     */
    constructor(...values: T) {
        for (const v of values) validateType(v);
        this.#values = [...values] as T; 
        Object.freeze(this.#values);
        this.hashCode = hashValue(this.#values);
    }
    
    /** Returns the read-only backing array. */
    get values(): T { return this.#values; }
    
    get length(): number { return this.#values.length; }
    
    get(i: number): T[number] { return this.#values[i]; }
    
    *[Symbol.iterator](): Iterator<T[number]> { yield* this.#values; }
    
    toString(): string { return `(${this.#values.join(', ')})`; }
    
    [Symbol.for('nodejs.util.inspect.custom')]() { return this.toString(); }
}

/**
 * A mathematical Set with Value Semantics.
 * * Features:
 * - **Strict Typing:** Supports number, string, Tuple, Array, RecursiveSet.
 * - **Sorted Storage:** Elements are internally sorted for O(1) equality checks via hash.
 * - **Freeze-on-Hash:** Once the hash code is accessed (e.g. when added to another Set),
 * this Set becomes immutable to prevent hash corruption.
 * * @template T The type of elements in the set.
 */
export class RecursiveSet<T> {
    #elements: T[] = [];
    #hashCode: number | null = null;
    #isFrozen: boolean = false;

    /**
     * Exposes the static compare function used internally.
     */
    static compare(a: unknown, b: unknown): number { return compare(a, b); }

    /**
     * Creates a new RecursiveSet.
     * @param elements Initial elements (will be sorted and deduplicated).
     */
    constructor(...elements: T[]) {
        if (elements.length > 0) {
            for (const el of elements) validateType(el);
            this.#elements = elements;
            this.#elements.sort(compare);
            this.#unique();
        }
    }

    #checkFrozen(op: string) {
        if (this.#isFrozen) {
            throw new Error(
                `InvalidOperation: Cannot ${op} a frozen RecursiveSet.\n` +
                `This Set has been hashed or used in a collection (Value Semantics).\n` +
                `Use .mutableCopy() to create a modifiable copy.`
            );
        }
    }
    
    #unique() {
        const arr = this.#elements;
        const len = arr.length;
        if (len < 2) return;
        
        let write = 1;
        for (let read = 1; read < len; read++) {
            if (compare(arr[read], arr[read-1]) !== 0) {
                arr[write++] = arr[read];
            }
        }
        arr.length = write;
    }

    /**
     * Calculates and caches the hash code.
     * Freezes the set to ensure the hash remains valid.
     */
    get hashCode(): number {
        if (this.#hashCode !== null) return this.#hashCode;
        
        let h = 0;
        const arr = this.#elements;
        const len = arr.length;
        for (let i = 0; i < len; i++) {
             // Wrap to 32-bit at each step for consistency
             h = (Math.imul(31, h) + hashValue(arr[i])) | 0;
        }
        this.#hashCode = h | 0;
        this.#isFrozen = true;
        return this.#hashCode;
    }
    
    /** Returns true if the set is frozen (hashed). */
    get isFrozen(): boolean { return this.#isFrozen; }

    /**
     * Compares this set with another for sorting.
     */
    compare(other: RecursiveSet<T>): number {
        if (this === other) return 0;
        
        const h1 = this.hashCode;
        const h2 = other.hashCode;
        if (h1 !== h2) return h1 < h2 ? -1 : 1;

        const arrA = this.#elements;
        const arrB = other.#elements;
        const len = arrA.length;
        
        if (len !== arrB.length) return len - arrB.length;
        
        for (let i = 0; i < len; i++) {
            const cmp = compare(arrA[i], arrB[i]);
            if (cmp !== 0) return cmp;
        }
        return 0;
    }

    get size(): number { return this.#elements.length; }
    isEmpty(): boolean { return this.#elements.length === 0; }

    /**
     * Checks if the set contains the given element.
     * Uses binary search for sets > 16 elements.
     */
    has(element: T): boolean {
        const arr = this.#elements;
        const len = arr.length;
        
        if (len < 16) {
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
     * Adds an element to the set.
     * Throws if the set is frozen.
     */
    add(element: T): this {
        this.#checkFrozen('add() to');
        validateType(element); 

        const arr = this.#elements;
        const len = arr.length;

        // Optimization: Append to end (common pattern)
        if (len > 0) {
            const lastCmp = compare(arr[len-1], element);
            if (lastCmp < 0) {
                arr.push(element);
                this.#hashCode = null;
                return this;
            }
            if (lastCmp === 0) return this;
        } else {
            arr.push(element);
            this.#hashCode = null;
            return this;
        }

        // Small Array: Linear Insert
        if (len < 16) {
            for (let i = 0; i < len; i++) {
                const cmp = compare(arr[i], element);
                if (cmp === 0) return this;
                if (cmp > 0) {
                    arr.splice(i, 0, element);
                    this.#hashCode = null;
                    return this;
                }
            }
            arr.push(element); 
            return this;
        }

        // Large Array: Binary Search Insert
        let low = 0, high = len - 1, idx = 0;
        while (low <= high) {
            const mid = (low + high) >>> 1;
            const cmp = compare(arr[mid], element);
            if (cmp === 0) return this;
            if (cmp < 0) {
                idx = mid + 1;
                low = mid + 1;
            } else {
                idx = mid;
                high = mid - 1;
            }
        }
        arr.splice(idx, 0, element);
        this.#hashCode = null;
        return this;
    }

    /**
     * Removes an element from the set.
     * Throws if the set is frozen.
     */
    remove(element: T): this {
        this.#checkFrozen('remove() from');
        
        const arr = this.#elements;
        const len = arr.length;

        if (len < 16) {
            for (let i = 0; i < len; i++) {
                if (compare(arr[i], element) === 0) {
                    arr.splice(i, 1);
                    this.#hashCode = null;
                    return this;
                }
            }
            return this;
        }
        
        let low = 0, high = len - 1;
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
    
    /**
     * Creates a mutable shallow copy of this set.
     * Useful for modifying a set after it has been frozen.
     */
    mutableCopy(): RecursiveSet<T> {
        const s = new RecursiveSet<T>();
        s.#elements = this.#elements.slice(); 
        return s;
    }
    
    clone(): RecursiveSet<T> { return this.mutableCopy(); }

    union(other: RecursiveSet<T>): RecursiveSet<T> {
        const s = new RecursiveSet<T>();
        const arrA = this.#elements;
        const arrB = other.#elements;
        
        if (arrA.length === 0) return other.clone();
        if (arrB.length === 0) return this.clone();

        const res: T[] = []; 
        let i = 0, j = 0;
        const lenA = arrA.length, lenB = arrB.length;
        
        while (i < lenA && j < lenB) {
            const cmp = compare(arrA[i], arrB[j]);
            if (cmp < 0) res.push(arrA[i++]);
            else if (cmp > 0) res.push(arrB[j++]);
            else { res.push(arrA[i++]); j++; }
        }
        while (i < lenA) res.push(arrA[i++]);
        while (j < lenB) res.push(arrB[j++]);
        
        s.#elements = res;
        return s;
    }

    intersection(other: RecursiveSet<T>): RecursiveSet<T> {
        const s = new RecursiveSet<T>();
        const arrA = this.#elements;
        const arrB = other.#elements;
        const res: T[] = [];
        let i = 0, j = 0;
        const lenA = arrA.length, lenB = arrB.length;
        
        while (i < lenA && j < lenB) {
            const cmp = compare(arrA[i], arrB[j]);
            if (cmp < 0) i++;
            else if (cmp > 0) j++;
            else { res.push(arrA[i++]); j++; }
        }
        s.#elements = res;
        return s;
    }

    difference(other: RecursiveSet<T>): RecursiveSet<T> {
        const s = new RecursiveSet<T>();
        const arrA = this.#elements;
        const arrB = other.#elements;
        const res: T[] = [];
        let i = 0, j = 0;
        const lenA = arrA.length, lenB = arrB.length;
        
        while (i < lenA && j < lenB) {
            const cmp = compare(arrA[i], arrB[j]);
            if (cmp < 0) res.push(arrA[i++]);
            else if (cmp > 0) j++;
            else { i++; j++; }
        }
        while (i < lenA) res.push(arrA[i++]);
        s.#elements = res;
        return s;
    }

    symmetricDifference(other: RecursiveSet<T>): RecursiveSet<T> {
        const s = new RecursiveSet<T>();
        const arrA = this.#elements;
        const arrB = other.#elements;
        const res: T[] = [];
        let i = 0, j = 0;
        const lenA = arrA.length, lenB = arrB.length;
        
        while (i < lenA && j < lenB) {
            const cmp = compare(arrA[i], arrB[j]);
            if (cmp < 0) res.push(arrA[i++]);
            else if (cmp > 0) res.push(arrB[j++]);
            else { i++; j++; }
        }
        while (i < lenA) res.push(arrA[i++]);
        while (j < lenB) res.push(arrB[j++]);
        s.#elements = res;
        return s;
    }

    powerset(): RecursiveSet<RecursiveSet<T>> {
        const n = this.size;
        if (n > 20) throw new Error("Powerset too large");
        
        const subsets: RecursiveSet<T>[] = [];
        const max = 1 << n;
        for (let i = 0; i < max; i++) {
            const subset = new RecursiveSet<T>();
            for (let j = 0; j < n; j++) {
                if (i & (1 << j)) subset.#elements.push(this.#elements[j]);
            }
            subsets.push(subset);
        }
        return new RecursiveSet<RecursiveSet<T>>(...subsets);
    }

    cartesianProduct<U>(other: RecursiveSet<U>): RecursiveSet<Tuple<[T, U]>> {
        const result = new RecursiveSet<Tuple<[T, U]>>();
        const arrA = this.#elements;
        const arrB = other.#elements;
        
        for (const x of arrA) {
            for (const y of arrB) {
                result.#elements.push(new Tuple(x, y));
            }
        }
        // Hash ordering is not monotonic, so we must resort
        result.#elements.sort(compare);
        result.#unique();
        
        return result;
    }

    isSubset(other: RecursiveSet<T>): boolean {
        if (this.size > other.size) return false;
        let i = 0, j = 0;
        const arrA = this.#elements, arrB = other.#elements;
        while (i < arrA.length && j < arrB.length) {
            const cmp = compare(arrA[i], arrB[j]);
            if (cmp < 0) return false;
            if (cmp > 0) j++;
            else { i++; j++; }
        }
        return i === arrA.length;
    }
    
    isSuperset(other: RecursiveSet<T>): boolean { return other.isSubset(this); }
    isProperSubset(other: RecursiveSet<T>): boolean { return this.isSubset(other) && this.size < other.size; }
    equals(other: RecursiveSet<T>): boolean { return this.compare(other) === 0; }
    
    toSet(): Set<T> { return new Set(this.#elements); }
    *[Symbol.iterator](): Iterator<T> { yield* this.#elements; }

    toString(): string {
        if (this.isEmpty()) return "∅";
        const elementsStr = this.#elements.map(el => {
            if (Array.isArray(el)) return `[${el.join(', ')}]`;
            return String(el);
        });
        return `{${elementsStr.join(', ')}}`;
    }
    
    [Symbol.for('nodejs.util.inspect.custom')]() { return this.toString(); }
}

// ============================================================================
// EXPORTS
// ============================================================================

export function emptySet<T>(): RecursiveSet<T> { return new RecursiveSet<T>(); }
export function singleton<T>(element: T): RecursiveSet<T> { return new RecursiveSet<T>(element); }
export function fromIterable<T>(iterable: Iterable<T>): RecursiveSet<T> { return new RecursiveSet<T>(...iterable); }