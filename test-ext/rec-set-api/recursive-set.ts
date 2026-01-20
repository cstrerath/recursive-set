/**
 * @module recursive-set-pure-hash
 * @description
 * MAXIMUM PERFORMANCE EDITION.
 * - Engine: "Compact Layout" Hash Table (Lecturer's Logic).
 * - Iteration: Raw, unsorted (O(N)).
 * - Lookups: Amortized O(1).
 * - API: Full RecursiveValue Interface compatibility.
 */

// ============================================================================
// 1. TYPE DEFINITIONS
// ============================================================================

type Primitive = string | number;

type Value = 
    | Primitive 
    | RecursiveSet<Value> 
    | Tuple<Value[]> 
    | RecursiveMap<Value, Value> 
    | ReadonlyArray<Value>;

interface Structural {
    hashCode: number;
    equals(other: unknown): boolean;
}

// ============================================================================
// 2. HASH ENGINE (Bitwise Optimized)
// ============================================================================

function getHashCode(val: Value): number {
    if (typeof val === 'number') {
        let h = val | 0; 
        h = ((h >> 16) ^ h) * 0x45d9f3b;
        h = ((h >> 16) ^ h) * 0x45d9f3b;
        h = (h >> 16) ^ h;
        return h;
    }      
    if (typeof val === 'string') {
        let h = 0x811c9dc5;
        for (let i = 0; i < val.length; i++) {
            h ^= val.charCodeAt(i);
            h = Math.imul(h, 0x01000193);
        }
        return h;
    } 
    // Recursive Structures: Accessing .hashCode triggers Freeze!
    if (val && typeof val === 'object' && 'hashCode' in val) {
        return (val as any).hashCode;
    }
    // Array Fallback
    if (Array.isArray(val)) {
        let h = 0x811c9dc5;
        for (const item of val) {
            h = Math.imul(h, 31) + getHashCode(item);
        }
        return h;
    }
    return 0;
}

function areEqual(a: Value, b: Value): boolean {
    if (a === b) return true;
    if (typeof a !== typeof b) return false;
    
    // Primitives
    if (typeof a === 'number' || typeof a === 'string') return a === b;

    // Deep Check
    if (typeof a === 'object' && a !== null && b !== null) {
        if ('equals' in a) return (a as any).equals(b);
        if (Array.isArray(a) && Array.isArray(b)) {
            if (a.length !== b.length) return false;
            for(let i=0; i<a.length; i++) {
                if (!areEqual(a[i], b[i])) return false;
            }
            return true;
        }
    }
    return false;
}

/**
 * Global Comparator.
 * Necessary for strictly ordered output only when explicitly requested (e.g. toString),
 * or for resolving Hash Collisions deterministically.
 */
function compare(a: Value, b: Value): number {
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

    // HASH SHORTCUT (O(1)) - The Performance Saver
    const h1 = getHashCode(a);
    const h2 = getHashCode(b);
    if (h1 !== h2) return h1 - h2;

    // COLLISION RESOLUTION (Slow, but rare)
    if (a instanceof RecursiveSet && b instanceof RecursiveSet) return a.compare(b);
    if (a instanceof Tuple && b instanceof Tuple) return compareSequences(a.raw, b.raw);
    if (Array.isArray(a) && Array.isArray(b)) return compareSequences(a, b);

        // Type Grouping
    const getScore = (v: Value) => {
        if (Array.isArray(v)) return 1;
        if (v instanceof Tuple) return 2;
        if (v instanceof RecursiveSet) return 3;
        if (v instanceof RecursiveMap) return 4;
        return 99;
    };
    
    const scoreA = getScore(a);
    const scoreB = getScore(b);
    return scoreA - scoreB;
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
// 3. TUPLE (Immutable)
// ============================================================================

class Tuple<T extends Value[]> implements Structural {
    readonly #elements: T;
    readonly #hashCode: number;

    constructor(...elements: T) {
        // Defensive copy & Freeze
        this.#elements = elements.slice() as T;
        Object.freeze(this.#elements); 

        // Compute Hash once
        let h = 1;
        for (const e of this.#elements) {
            h = Math.imul(h, 31) + getHashCode(e);
        }
        this.#hashCode = h;
    }

    get length() { return this.#elements.length; }
    get raw() { return this.#elements; }
    get hashCode() { return this.#hashCode; }

    get(index: number): Value | undefined { return this.#elements[index]; }

    equals(other: unknown): boolean {
        if (this === other) return true;
        if (!(other instanceof Tuple)) return false;
        if (this.hashCode !== other.hashCode) return false;
        if (this.length !== other.length) return false;
        
        // Fast structural check
        for (let i = 0; i < this.length; i++) {
            if (!areEqual(this.#elements[i], other.get(i)!)) return false;
        }
        return true;
    }

    toString(): string {
        return `(${this.#elements.map(e => typeof e === 'object' ? e.toString() : String(e)).join(', ')})`;
    }
    [Symbol.for('nodejs.util.inspect.custom')]() { return this.toString(); }
}

// ============================================================================
// 4. RECURSIVE MAP (Fixed with DELETE & CLONE)
// ============================================================================

class RecursiveMap<K extends Value, V extends Value> implements Structural, Iterable<[K, V]> {
    
    private _keys: K[] = [];
    private _values: V[] = [];
    private _indices: Int32Array;
    private _bucketCount = 16;
    private _mask = 15;
    
    private _isFrozen = false;
    private _cachedHash: number | null = null;

    constructor() {
        this._indices = new Int32Array(16).fill(-1);
    }

    get size() { return this._keys.length; }
    get isFrozen() { return this._isFrozen; }
    isEmpty(): boolean { return this._keys.length === 0; }

    // --- Cloning (Scenario 4) ---
    mutableCopy(): RecursiveMap<K, V> {
        const copy = new RecursiveMap<K, V>();
        for (let i = 0; i < this._keys.length; i++) {
            copy.set(this._keys[i], this._values[i]);
        }
        return copy;
    }

    get hashCode(): number {
        if (this._cachedHash !== null) return this._cachedHash;
        let h = 0;
        for (let i = 0; i < this._keys.length; i++) {
            // Recurse hash on Key and Value -> Freezes them if they are Sets/Maps
            const hk = getHashCode(this._keys[i]);
            const hv = getHashCode(this._values[i]);
            const entryH = Math.imul(hk, 31) ^ hv;
            h ^= entryH;
        }
        this._cachedHash = h;
        this._isFrozen = true;
        return h;
    }

    private resize() {
        const oldKeys = this._keys;
        this._bucketCount *= 2;
        this._mask = this._bucketCount - 1;
        this._indices = new Int32Array(this._bucketCount).fill(-1);

        for (let i = 0; i < oldKeys.length; i++) {
            const h = getHashCode(oldKeys[i]);
            let idx = h & this._mask;
            while (this._indices[idx] !== -1) idx = (idx + 1) & this._mask;
            this._indices[idx] = i;
        }
    }

    set(key: K, value: V): void {
        if (this._isFrozen) throw new Error("Frozen Map");
        if (this._keys.length >= this._bucketCount * 0.75) this.resize();

        const h = getHashCode(key);
        let idx = h & this._mask;

        while (true) {
            const ptr = this._indices[idx];
            if (ptr === -1) {
                this._indices[idx] = this._keys.length;
                this._keys.push(key);
                this._values.push(value);
                this._cachedHash = null;
                return;
            }
            if (areEqual(this._keys[ptr], key)) {
                this._values[ptr] = value;
                this._cachedHash = null;
                return;
            }
            idx = (idx + 1) & this._mask;
        }
    }

    get(key: K): V | undefined {
        const h = getHashCode(key);
        let idx = h & this._mask;
        while (true) {
            const ptr = this._indices[idx];
            if (ptr === -1) return undefined;
            if (areEqual(this._keys[ptr], key)) return this._values[ptr];
            idx = (idx + 1) & this._mask;
        }
    }

    // --- DELETE IMPLEMENTATION ---
    delete(key: K): boolean {
        if (this._isFrozen) throw new Error("Frozen Map");
        if (this.size === 0) return false;

        const h = getHashCode(key);
        let idx = h & this._mask;

        while (true) {
            const ptr = this._indices[idx];
            if (ptr === -1) return false;

            if (areEqual(this._keys[ptr], key)) {
                this._cachedHash = null;
                
                this.removeIndex(idx);

                const lastKey = this._keys.pop()!;
                const lastVal = this._values.pop()!;

                if (ptr < this._keys.length) {
                    this._keys[ptr] = lastKey;
                    this._values[ptr] = lastVal;
                    this.updateIndexForKey(lastKey, this._keys.length, ptr);
                }
                return true;
            }
            idx = (idx + 1) & this._mask;
        }
    }

    private updateIndexForKey(key: K, oldLoc: number, newLoc: number) {
        let idx = getHashCode(key) & this._mask;
        while(true) {
            if (this._indices[idx] === oldLoc) {
                this._indices[idx] = newLoc;
                return;
            }
            idx = (idx + 1) & this._mask;
        }
    }

    private removeIndex(holeIdx: number): void {
        let i = (holeIdx + 1) & this._mask;
        while (this._indices[i] !== -1) {
            const ptr = this._indices[i];
            const k = this._keys[ptr];
            const h = getHashCode(k);
            const ideal = h & this._mask;
            const distHole = (holeIdx - ideal + this._bucketCount) & this._mask;
            const distI = (i - ideal + this._bucketCount) & this._mask;
            
            if (distHole < distI) {
                this._indices[holeIdx] = ptr;
                holeIdx = i;
            }
            i = (i + 1) & this._mask;
        }
        this._indices[holeIdx] = -1;
    }

    equals(other: unknown): boolean {
        if (this === other) return true;
        if (!(other instanceof RecursiveMap)) return false;
        if (this.size !== other.size) return false;
        if (this.hashCode !== other.hashCode) return false;
        
        for(let i=0; i<this._keys.length; i++) {
            const val = other.get(this._keys[i]);
            if (val === undefined || !areEqual(this._values[i], val)) return false;
        }
        return true;
    }

    compare(other: RecursiveMap<Value, Value>): number {
        return this.hashCode - other.hashCode; 
    }

    *[Symbol.iterator](): Iterator<[K, V]> {
        for(let i=0; i<this._keys.length; i++) {
            yield [this._keys[i], this._values[i]];
        }
    }

    toString() {
        return `Map{${this.size}}`;
    }
    [Symbol.for('nodejs.util.inspect.custom')]() { return this.toString(); }
}


// ============================================================================
// 5. RECURSIVE SET (High Performance Hash Table)
// ============================================================================

class RecursiveSet<T extends Value> implements Structural, Iterable<T> {
    
    private _values: T[] = [];
    private _indices: Int32Array;
    private _bucketCount: number;
    private _mask: number;
    private _xorHash: number = 0;
    
    private _isFrozen: boolean = false;
    private readonly LOAD_FACTOR = 0.75;
    private readonly MIN_BUCKETS = 16;

    constructor(...initialData: T[]) {
        this._bucketCount = this.MIN_BUCKETS;
        if (initialData.length > 0) {
            const target = Math.ceil(initialData.length / this.LOAD_FACTOR);
            while (this._bucketCount < target) this._bucketCount <<= 1;
        }
        this._mask = this._bucketCount - 1;
        this._indices = new Int32Array(this._bucketCount).fill(-1);

        for (const item of initialData) this.add(item);
    }

    static compare(a: Value, b: Value) { return compare(a, b); }

    get size(): number { return this._values.length; }
    get isFrozen(): boolean { return this._isFrozen; }
    isEmpty(): boolean { return this._values.length === 0; }

    get hashCode(): number {
        this._isFrozen = true;
        return this._xorHash;
    }

    private resize(): void {
        const oldValues = this._values;
        this._bucketCount *= 2;
        this._mask = this._bucketCount - 1;
        this._indices = new Int32Array(this._bucketCount).fill(-1);

        for (let i = 0; i < oldValues.length; i++) {
            const val = oldValues[i];
            const h = getHashCode(val);
            let idx = h & this._mask;
            while (this._indices[idx] !== -1) idx = (idx + 1) & this._mask;
            this._indices[idx] = i; 
        }
    }

    private updateIndexForValue(val: T, oldLoc: number, newLoc: number): void {
        const h = getHashCode(val);
        let idx = h & this._mask;
        while (true) {
            if (this._indices[idx] === oldLoc) {
                this._indices[idx] = newLoc;
                return;
            }
            idx = (idx + 1) & this._mask;
        }
    }

    private removeIndex(holeIdx: number): void {
        let i = (holeIdx + 1) & this._mask;
        while (this._indices[i] !== -1) {
            const valPtr = this._indices[i];
            const val = this._values[valPtr];
            const h = getHashCode(val);
            const idealIdx = h & this._mask;
            const distToHole = (holeIdx - idealIdx + this._bucketCount) & this._mask;
            const distToI = (i - idealIdx + this._bucketCount) & this._mask;
            if (distToHole < distToI) {
                this._indices[holeIdx] = valPtr;
                holeIdx = i;
            }
            i = (i + 1) & this._mask;
        }
        this._indices[holeIdx] = -1;
    }

    add(e: T): void {
        if (this._isFrozen) throw new Error("Frozen Set modified.");
        if (this._values.length >= this._bucketCount * this.LOAD_FACTOR) this.resize();

        const h = getHashCode(e);
        let idx = h & this._mask;

        while (true) {
            const valIndex = this._indices[idx];
            if (valIndex === -1) {
                this._indices[idx] = this._values.length;
                this._values.push(e);
                this._xorHash ^= h;
                return;
            }
            if (areEqual(this._values[valIndex], e)) return; 
            idx = (idx + 1) & this._mask;
        }
    }

    has(element: T): boolean {
        const h = getHashCode(element);
        let idx = h & this._mask;
        while (true) {
            const valIndex = this._indices[idx];
            if (valIndex === -1) return false;
            if (areEqual(this._values[valIndex], element)) return true;
            idx = (idx + 1) & this._mask;
        }
    }

    remove(e: T): void {
        if (this._isFrozen) throw new Error("Frozen Set modified.");
        if (this._values.length === 0) return;

        const h = getHashCode(e);
        let idx = h & this._mask;

        while (true) {
            const valIndex = this._indices[idx];
            if (valIndex === -1) return;

            if (areEqual(this._values[valIndex], e)) {
                this._xorHash ^= h;
                this.removeIndex(idx);
                const lastVal = this._values.pop()!;
                if (valIndex < this._values.length) {
                    this._values[valIndex] = lastVal;
                    this.updateIndexForValue(lastVal, this._values.length, valIndex);
                }
                return;
            }
            idx = (idx + 1) & this._mask;
        }
    }

    clone(): RecursiveSet<T> {
        const s = new RecursiveSet<T>();
        for (const v of this._values) s.add(v);
        return s;
    }

    union(other: RecursiveSet<T>): RecursiveSet<T> {
        const res = this.clone();
        for (const item of other) res.add(item);
        return res;
    }

    intersection(other: RecursiveSet<T>): RecursiveSet<T> {
        const res = new RecursiveSet<T>();
        const [small, large] = this.size < other.size ? [this, other] : [other, this];
        for (const item of small) {
            if (large.has(item)) res.add(item);
        }
        return res;
    }

    symmetricDifference(other: RecursiveSet<T>): RecursiveSet<T> {
        const res = new RecursiveSet<T>();
        for (const item of this) {
            if (!other.has(item)) res.add(item);
        }
        for (const item of other) {
            if (!this.has(item)) res.add(item);
        }
        return res;
    }

    cartesianProduct<U extends Value>(other: RecursiveSet<U>): RecursiveSet<Tuple<[T, U]>> {
        const result = new RecursiveSet<Tuple<[T, U]>>();
        for (const a of this) {
            for (const b of other) {
                result.add(new Tuple(a, b));
            }
        }
        return result;
    }

    powerset(): RecursiveSet<RecursiveSet<T>> {
        const n = this._values.length;
        const result = new RecursiveSet<RecursiveSet<T>>();
        const max = 1 << n;
        
        for (let i = 0; i < max; i++) {
            const subset = new RecursiveSet<T>();
            for (let j = 0; j < n; j++) {
                if ((i & (1 << j)) !== 0) {
                    subset.add(this._values[j]);
                }
            }
            result.add(subset);
        }
        return result;
    }

    pickRandom(): T | undefined {
        if (this._values.length === 0) return undefined;
        const idx = Math.floor(Math.random() * this._values.length);
        return this._values[idx];
    }

    [Symbol.iterator](): Iterator<T> {
        return this._values[Symbol.iterator]();
    }

    compare(other: RecursiveSet<Value>): number {
        if (this === other) return 0;
        const h1 = this.hashCode; 
        const h2 = other.hashCode;
        if (h1 !== h2) return h1 - h2;

        const sortFn = (a: Value, b: Value) => compare(a, b);
        const arrA = [...this._values].sort(sortFn);
        const arrB = [...(other as RecursiveSet<Value>)._values].sort(sortFn);
        
        return compareSequences(arrA, arrB);
    }

    equals(other: unknown): boolean {
        if (this === other) return true;
        if (!(other instanceof RecursiveSet)) return false;
        if (this.size !== other.size) return false;
        if (this.hashCode !== other.hashCode) return false;
        
        for(const v of this._values) {
            if (!other.has(v)) return false;
        }
        return true;
    }

    toString(): string {
        const sorted = [...this._values].sort((a,b) => compare(a,b));
        return `{${sorted.map(String).join(', ')}}`;
    }
    [Symbol.for('nodejs.util.inspect.custom')]() { return this.toString(); }
}

// ============================================================================
// 6. PUBLIC EXPORTS
// ============================================================================

function emptySet<T extends Value>() { return new RecursiveSet<T>(); }
function singleton<T extends Value>(el: T) { return new RecursiveSet<T>(el); }

// Alias for public use
const hashValue = getHashCode; 

export {
    RecursiveSet,
    RecursiveMap,
    Tuple,
    Value,
    Primitive,
    Structural,
    emptySet,
    singleton,
    hashValue, // Needed for Test Suite
    compare,   // Optional, but good for diagnostics
    getHashCode
};