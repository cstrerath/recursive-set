/**
 * @module recursive-set
 * High-Performance Recursive Set with "Freeze-on-Hash" semantics.
 */

// === HASHING ENGINE (FNV-1a) ===

const FNV_PRIME = 16777619;
const FNV_OFFSET = 2166136261;

const floatBuffer = new ArrayBuffer(8);
const floatView = new Float64Array(floatBuffer);
const intView = new Int32Array(floatBuffer);

function hashNumber(val: number): number {
    if (Number.isInteger(val)) {
        let h = FNV_OFFSET;
        h ^= val;
        h = Math.imul(h, FNV_PRIME);
        return h >>> 0;
    }

    floatView[0] = val;
    let h = FNV_OFFSET;
    
    h ^= intView[0];
    h = Math.imul(h, FNV_PRIME);
    h ^= intView[1];
    h = Math.imul(h, FNV_PRIME);
    
    return h >>> 0;
}

function hashString(str: string): number {
    let hash = FNV_OFFSET;
    const len = str.length;
    for (let i = 0; i < len; i++) {
        hash ^= str.charCodeAt(i);
        hash = Math.imul(hash, FNV_PRIME);
    }
    return hash >>> 0;
}

function hashValue(val: unknown): number {
    if (typeof val === 'string') return hashString(val);
    if (typeof val === 'number') return hashNumber(val);
    
    // Fast Path: Objects with cached hash
    if (val && typeof val === 'object' && 'hashCode' in val) {
        return (val as any).hashCode;
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

// === COMPARATOR ===

function compare(a: unknown, b: unknown): number {
    if (a === b) return 0;

    // 1. Hash Short-Circuit (Optimization)
    const aH = (a as { hashCode?: number })?.hashCode;
    const bH = (b as { hashCode?: number })?.hashCode;
    
    const ha = (aH !== undefined) ? aH : hashValue(a);
    const hb = (bH !== undefined) ? bH : hashValue(b);
    
    if (ha !== hb) return ha < hb ? -1 : 1;

    // 2. Structural Type Check
    const typeA = typeof a;
    const typeB = typeof b;

    if (typeA === 'string' && typeB === 'string') return (a as string) < (b as string) ? -1 : 1;
    if (typeA === 'number' && typeB === 'number') return (a as number) < (b as number) ? -1 : 1;

    const isSetA = a instanceof RecursiveSet;
    const isSetB = b instanceof RecursiveSet;
    
    if (isSetA && isSetB) {
        return (a as RecursiveSet<unknown>).compare(b as RecursiveSet<unknown>);
    }

    const isSeqA = Array.isArray(a) || a instanceof Tuple;
    const isSeqB = Array.isArray(b) || b instanceof Tuple;

    // Sort Order: Primitives (0) < Sequences (1) < Sets (2)
    if (isSetA !== isSetB || isSeqA !== isSeqB) {
         const scoreA = isSetA ? 2 : isSeqA ? 1 : 0;
         const scoreB = isSetB ? 2 : isSeqB ? 1 : 0;
         return scoreA - scoreB;
    }

    // 3. Sequence Comparison
    if (isSeqA && isSeqB) {
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

    return (a as number) < (b as number) ? -1 : 1;
}

// === CLASSES ===

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

export class RecursiveSet<T> {
    public _elements: T[];
    private _hashCode: number | null = null;
    private _isFrozen: boolean = false;

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

    private _checkFrozen(op: string) {
        if (this._isFrozen) {
            throw new Error(
                `InvalidOperation: Cannot ${op} a frozen RecursiveSet.\n` +
                `This Set has been hashed or used in a collection (Value Semantics).\n` +
                `Use .mutableCopy() to create a modifiable copy.`
            );
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
     * Calculates/Caches hash code and FREEZES the set.
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
        this._isFrozen = true;
        return this._hashCode;
    }
    
    get isFrozen(): boolean { return this._isFrozen; }

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
        
        // Linear Scan (Prefetch-friendly for small sets)
        if (len < 16) {
            for (let i = 0; i < len; i++) {
                if (compare(arr[i], element) === 0) return true;
            }
            return false;
        }

        // Binary Search
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
        this._checkFrozen('add() to');

        // Validation (Inlined for Performance)
        if (typeof element === 'object' && element !== null) {
            if (!(element instanceof RecursiveSet || element instanceof Tuple || Array.isArray(element))) {
                throw new Error("Unsupported Type: Use Tuple, Array or RecursiveSet.");
            }
        } else if (Number.isNaN(element)) {
            throw new Error("NaN is not supported");
        }

        const arr = this._elements;
        const len = arr.length;

        // Optimization: Append to end (common in construction)
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

        // Small Array Strategy
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
            arr.push(element); // Should be unreachable given append check, but safe fallback
            return this;
        }

        // Large Array Strategy
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
        this._checkFrozen('remove() from');
        
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
        this._checkFrozen('clear()');
        this._elements = [];
        this._hashCode = 0;
        return this;
    }
    
    mutableCopy(): RecursiveSet<T> {
        const s = new RecursiveSet<T>();
        s._elements = this._elements.slice(); 
        return s;
    }
    
    clone(): RecursiveSet<T> { return this.mutableCopy(); }

    union(other: RecursiveSet<T>): RecursiveSet<T> {
        const s = new RecursiveSet<T>();
        const arrA = this._elements;
        const arrB = other._elements;
        
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
    
    [Symbol.for('nodejs.util.inspect.custom')]() { return this.toString(); }
}

export function emptySet<T>(): RecursiveSet<T> { return new RecursiveSet<T>(); }
export function singleton<T>(element: T): RecursiveSet<T> { return new RecursiveSet<T>(element); }
export function fromIterable<T>(iterable: Iterable<T>): RecursiveSet<T> { return new RecursiveSet<T>(...iterable); }