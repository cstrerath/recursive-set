/**
 * @module recursive-set
 * High-Performance Mutable Recursive Set backed by Sorted Arrays.
 * Optimized for small sets, structural equality, and deterministic hashing.
 */

// === HASHING ENGINE ===

/**
 * FNV-1a Hash implementation for strings.
 * Constants inlined for V8 optimization.
 */
function hashString(str: string): number {
    let hash = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
        hash ^= str.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
}

/**
 * Universal Hash Function.
 * Calculates deterministic hashes for Primitives, Sequences (Order Dependent), and Sets.
 */
function hashValue(val: unknown): number {
    if (typeof val === 'string') return hashString(val);
    if (typeof val === 'number') return val | 0;
    
    // Fast Path: Objects with cached hash
    if (val instanceof RecursiveSet) return val.hashCode;
    if (val instanceof Tuple) return val.hashCode;
    
    // Arrays: Treated as sequences (Rolling Hash)
    if (Array.isArray(val)) {
        let h = 0;
        for (let i = 0; i < val.length; i++) {
            let v = val[i];
            let vh = 0;
            if (typeof v === 'string') vh = hashString(v);
            else vh = hashValue(v);
            
            h = Math.imul(31, h) + vh;
        }
        return h >>> 0;
    }
    return 0;
}

// === COMPARATOR ===

/**
 * High-performance comparator with hash short-circuiting.
 * Order: Primitives (0) < Sequences (1) < Sets (2)
 */
function compare(a: unknown, b: unknown): number {
    if (a === b) return 0;

    // 1. Hash Short-Circuit
    // Using interface casting avoids runtime overhead of 'in' operator checks
    const aH = (a as { hashCode?: number })?.hashCode;
    const bH = (b as { hashCode?: number })?.hashCode;
    
    const ha = (aH !== undefined) ? aH : hashValue(a);
    const hb = (bH !== undefined) ? bH : hashValue(b);
    
    if (ha !== hb) return ha < hb ? -1 : 1;

    // 2. Primitive Value Check
    const typeA = typeof a;
    const typeB = typeof b;
    
    if (typeA === 'string' && typeB === 'string') return (a as string) < (b as string) ? -1 : 1;
    if (typeA === 'number' && typeB === 'number') return (a as number) < (b as number) ? -1 : 1;

    // 3. Structural Type Check
    const isSetA = a instanceof RecursiveSet;
    const isSetB = b instanceof RecursiveSet;
    
    if (isSetA && isSetB) {
        return (a as RecursiveSet<unknown>).compare(b as RecursiveSet<unknown>);
    }

    const isArrA = Array.isArray(a);
    const isArrB = Array.isArray(b);
    const isTupA = a instanceof Tuple;
    const isTupB = b instanceof Tuple;

    const isSeqA = isArrA || isTupA;
    const isSeqB = isArrB || isTupB;

    // Sort by Type Group if types differ
    if (isSetA !== isSetB || isSeqA !== isSeqB) {
         const scoreA = isSetA ? 2 : isSeqA ? 1 : 0;
         const scoreB = isSetB ? 2 : isSeqB ? 1 : 0;
         return scoreA - scoreB;
    }

    // 4. Sequence Comparison (Array/Tuple)
    if (isSeqA && isSeqB) {
        const valA = isTupA ? (a as Tuple<unknown[]>).values : (a as unknown[]);
        const valB = isTupB ? (b as Tuple<unknown[]>).values : (b as unknown[]);
        
        const len = valA.length;
        if (len !== valB.length) return len - valB.length;
        
        for (let i = 0; i < len; i++) {
            const diff = compare(valA[i], valB[i]);
            if (diff !== 0) return diff;
        }
        return 0;
    }

    // Fallback for safe types
    return (a as number) < (b as number) ? -1 : 1;
}

// === CLASSES ===

/**
 * Immutable wrapper for sequence values.
 * Useful when strict typing for sequences is required.
 */
export class Tuple<T extends unknown[]> {
    readonly values: T;
    readonly hashCode: number;

    constructor(...values: T) {
        this.values = values;
        this.hashCode = hashValue(values);
    }
    
    get length() { return this.values.length; }
    get(i: number) { return this.values[i]; }
    *[Symbol.iterator]() { yield* this.values; }
    toString() { return `(${this.values.join(', ')})`; }
    [Symbol.for('nodejs.util.inspect.custom')]() { return this.toString(); }
}

/**
 * A Set implementation that supports deep structural equality and efficient hashing.
 * Internally backed by a sorted array for optimal CPU cache locality on small sets.
 */
export class RecursiveSet<T> {
    /**
     * Internal storage. Public for inlining access within the module, but treated as private API.
     */
    public _elements: T[];
    private _hashCode: number | null = null;

    static compare(a: unknown, b: unknown): number { return compare(a, b); }

    constructor(...elements: T[]) {
        if (elements.length === 0) {
            this._elements = [];
            this._hashCode = 0;
        } else {
            this._elements = elements;
            this._elements.sort(compare);
            this._unique();
        }
    }
    
    private _unique() {
        const arr = this._elements;
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
     * Calculates the hash code for the set.
     * Uses a rolling hash over sorted elements, ensuring determinstic results for equal sets.
     */
    get hashCode(): number {
        if (this._hashCode !== null) return this._hashCode;
        
        let h = 0;
        const arr = this._elements;
        const len = arr.length;
        for (let i = 0; i < len; i++) {
             h = Math.imul(31, h) + hashValue(arr[i]);
        }
        this._hashCode = h | 0;
        return this._hashCode;
    }
    
    // Backward compatibility alias
    getHashCode() { return this.hashCode; }

    compare(other: RecursiveSet<T>): number {
        if (this === other) return 0;
        
        const h1 = this.hashCode;
        const h2 = other.hashCode;
        if (h1 !== h2) return h1 < h2 ? -1 : 1;

        const arrA = this._elements;
        const arrB = other._elements;
        const len = arrA.length;
        
        if (len !== arrB.length) return len - arrB.length;
        
        for (let i = 0; i < len; i++) {
            const cmp = compare(arrA[i], arrB[i]);
            if (cmp !== 0) return cmp;
        }
        return 0;
    }

    get size(): number { return this._elements.length; }
    isEmpty(): boolean { return this._elements.length === 0; }

    has(element: T): boolean {
        const arr = this._elements;
        const len = arr.length;
        
        // Small Array Optimization: Linear Scan is faster than Binary Search overhead for N < 16
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

    add(element: T): this {
        // --- Validation Check ---
        if (typeof element === 'object' && element !== null) {
            const isSet = element instanceof RecursiveSet;
            const isTup = element instanceof Tuple;
            const isArr = Array.isArray(element);
            
            if (!isSet && !isTup && !isArr) {
                throw new Error("Plain Objects are not supported. Use Tuple, Array or RecursiveSet.");
            }
        } else if (typeof element === "number" && Number.isNaN(element)) {
            throw new Error("NaN is not supported");
        }
        // --- End Validation ---

        const arr = this._elements;
        const len = arr.length;

        // Common Case: Appending a larger element (during ordered construction)
        if (len > 0) {
            const lastCmp = compare(arr[len-1], element);
            if (lastCmp < 0) {
                arr.push(element);
                this._hashCode = null;
                return this;
            }
            if (lastCmp === 0) return this;
        } else {
            arr.push(element);
            this._hashCode = null;
            return this;
        }

        // Small Array Strategy: Linear Scan + Splice
        if (len < 16) {
            for (let i = 0; i < len; i++) {
                const cmp = compare(arr[i], element);
                if (cmp === 0) return this;
                if (cmp > 0) {
                    arr.splice(i, 0, element);
                    this._hashCode = null;
                    return this;
                }
            }
            return this;
        }

        // Large Array Strategy: Binary Search
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
        this._hashCode = null;
        return this;
    }

    remove(element: T): this {
        const arr = this._elements;
        const len = arr.length;

        if (len < 16) {
            for (let i = 0; i < len; i++) {
                if (compare(arr[i], element) === 0) {
                    arr.splice(i, 1);
                    this._hashCode = null;
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
                this._hashCode = null;
                return this;
            }
            if (cmp < 0) low = mid + 1;
            else high = mid - 1;
        }
        return this;
    }

    clear(): this {
        this._elements = [];
        this._hashCode = 0;
        return this;
    }
    
    clone(): RecursiveSet<T> {
        const s = new RecursiveSet<T>();
        s._elements = this._elements.slice();
        s._hashCode = this._hashCode;
        return s;
    }

    union(other: RecursiveSet<T>): RecursiveSet<T> {
        const s = new RecursiveSet<T>();
        const arrA = this._elements;
        const arrB = other._elements;
        
        if (arrA.length === 0) return other.clone();
        if (arrB.length === 0) return this.clone();

        const res: T[] = []; 
        let i = 0, j = 0;
        const lenA = arrA.length, lenB = arrB.length;
        
        // Merge Sort Algorithm O(N + M)
        while (i < lenA && j < lenB) {
            const cmp = compare(arrA[i], arrB[j]);
            if (cmp < 0) res.push(arrA[i++]);
            else if (cmp > 0) res.push(arrB[j++]);
            else { res.push(arrA[i++]); j++; }
        }
        while (i < lenA) res.push(arrA[i++]);
        while (j < lenB) res.push(arrB[j++]);
        
        s._elements = res;
        return s;
    }

    intersection(other: RecursiveSet<T>): RecursiveSet<T> {
        const s = new RecursiveSet<T>();
        const arrA = this._elements;
        const arrB = other._elements;
        const res: T[] = [];
        let i = 0, j = 0;
        const lenA = arrA.length, lenB = arrB.length;
        
        while (i < lenA && j < lenB) {
            const cmp = compare(arrA[i], arrB[j]);
            if (cmp < 0) i++;
            else if (cmp > 0) j++;
            else { res.push(arrA[i++]); j++; }
        }
        s._elements = res;
        return s;
    }

    difference(other: RecursiveSet<T>): RecursiveSet<T> {
        const s = new RecursiveSet<T>();
        const arrA = this._elements;
        const arrB = other._elements;
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
        s._elements = res;
        return s;
    }

    symmetricDifference(other: RecursiveSet<T>): RecursiveSet<T> {
        const s = new RecursiveSet<T>();
        const arrA = this._elements;
        const arrB = other._elements;
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
        s._elements = res;
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
                if (i & (1 << j)) subset._elements.push(this._elements[j]);
            }
            subsets.push(subset);
        }
        return new RecursiveSet<RecursiveSet<T>>(...subsets);
    }

    cartesianProduct<U>(other: RecursiveSet<U>): RecursiveSet<Tuple<[T, U]>> {
        const result = new RecursiveSet<Tuple<[T, U]>>();
        const arrA = this._elements;
        const arrB = other._elements;
        
        for (const x of arrA) {
            for (const y of arrB) {
                result._elements.push(new Tuple(x, y));
            }
        }
        return result;
    }

    // Standard Set methods
    isSubset(other: RecursiveSet<T>): boolean {
        if (this.size > other.size) return false;
        let i = 0, j = 0;
        const arrA = this._elements, arrB = other._elements;
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
    toSet(): Set<T> { return new Set(this._elements); }
    *[Symbol.iterator](): Iterator<T> { yield* this._elements; }

    toString(): string {
        if (this.isEmpty()) return "∅";
        const elementsStr = this._elements.map(el => {
            if (Array.isArray(el)) return `[${el.join(', ')}]`;
            return String(el);
        });
        return `{${elementsStr.join(', ')}}`;
    }
    
    [Symbol.for('nodejs.util.inspect.custom')](): string { return this.toString(); }
}

export function emptySet<T>(): RecursiveSet<T> { return new RecursiveSet<T>(); }
export function singleton<T>(element: T): RecursiveSet<T> { return new RecursiveSet<T>(element); }
export function fromIterable<T>(iterable: Iterable<T>): RecursiveSet<T> { return new RecursiveSet<T>(...iterable); }