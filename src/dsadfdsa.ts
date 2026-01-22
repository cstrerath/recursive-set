/**
 * @module recursive-set
 * @version 8.1.0 (Cleanup Edition)
 * @description
 * A specialized collection library supporting Value Semantics (Deep Equality)
 * and recursive structures.
 * Based on High-Performance Hashing (Open Addressing).
 */

// ============================================================================
// 1. TYPE DEFINITIONS
// ============================================================================

type Primitive = string | number;
type Value = Primitive | Structural;

interface Structural {
    readonly hashCode: number;
    equals(other: unknown): boolean;
    /** * Returns a human readable String.
     * Should use compareVisualLogic internally for deterministic output logic.
     */
    toString(): string;
}

// ============================================================================
// 2. VISUAL HELPERS (For toString only)
// ============================================================================

/**
 * Visual Comparator used strictly for human-readable, deterministic .toString() output.
 * Does NOT define a logical order for the data structures themselves.
 */
function compareVisualLogic(a: Value, b: Value): number {
    if (a === b) return 0;
    
    // Numbers: Mathematic sort (1, 2, 10)
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    
    // Strings: Lexicographic sort
    if (typeof a === 'string' && typeof b === 'string') return a.localeCompare(b);
    
    // Type separation for cleaner lists
    const typeA = getTypeId(a);
    const typeB = getTypeId(b);
    if (typeA !== typeB) return typeA - typeB;

    // Recursive Fallback: Compare the string representations
    return String(a).localeCompare(String(b));
}

function getTypeId(v: Value): number {
    if (typeof v === 'number') return 1;
    if (typeof v === 'string') return 2;
    // Objects come last, sorted by their string value
    return 3;
}

// ============================================================================
// 3. HASH ENGINE (Optimized)
// ============================================================================

// 1. Statische Allokation: Nur EINMALig Speicher reservieren.
// Das verhindert Garbage Collection Pausen komplett für Numbers.
const _buffer = new ArrayBuffer(8);
const _f64 = new Float64Array(_buffer);
const _i32 = new Int32Array(_buffer);

// Konstanten für den Mixer (MurmurHash3 Konstanten eignen sich gut)
const HASH_C1 = 0xcc9e2d51;
const HASH_C2 = 0x1b873593;

function getHashCode(val: Value): number {
    // --------------------------------------------------------
    // CASE A: NUMBER (Der optimierte Teil)
    // --------------------------------------------------------
    if (typeof val === 'number') {
        // Fast Path: 32-Bit Integers (Smis in V8)
        // (val | 0) === val ist der schnellste Weg zu prüfen, ob es ein sicherer Int ist.
        // Das fängt auch -0 ab (wird zu 0).
        if ((val | 0) === val) {
            let h = val | 0;
            // Avalanche Mixer: Verhindert, dass 1, 2, 3 nah beieinander liegen
            h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
            h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
            return (h ^ (h >>> 16)) >>> 0;
        }

        // Slow Path: Floats (Doubles)
        // Wir schreiben den Double in den Buffer...
        _f64[0] = val;
        
        // ... und lesen die rohen Bits als zwei 32-Bit Integers.
        // Keine Funktionsaufrufe, reiner Array-Zugriff!
        const low = _i32[0];
        const high = _i32[1];

        // Wir mischen die oberen und unteren Bits
        return (Math.imul(low, HASH_C1) ^ Math.imul(high, HASH_C2)) >>> 0;
    }

    // --------------------------------------------------------
    // CASE B: STRING (Jenkins One-at-a-Time oder FNV)
    // --------------------------------------------------------
    if (typeof val === 'string') {
        let h = 0x811c9dc5;
        const len = val.length;
        for (let i = 0; i < len; i++) {
            h ^= val.charCodeAt(i);
            h = Math.imul(h, 0x01000193);
        }
        return h >>> 0;
    }

    // --------------------------------------------------------
    // CASE C: STRUCTURAL
    // --------------------------------------------------------
    if (val && typeof val === 'object') {
        return val.hashCode;
    }
    
    return 0;
}

function areEqual(a: Value, b: Value): boolean {
    if (a === b) return true;
    if (typeof a !== typeof b) return false;
    
    if (typeof a === 'number' || typeof a === 'string') return a === b;

    if (typeof a === 'object' && a !== null && b !== null) {
        return a.equals(b);
    }
    return false;
}

// ============================================================================
// 4. TUPLE
// ============================================================================

class Tuple<T extends Value[]> implements Structural, Iterable<T[number]> {
    
    readonly #elements: T;
    readonly #hashCode: number;

    constructor(...elements: T) {
        this.#elements = [...elements] as T;
        Object.freeze(this.#elements);  

        let h = 1;
        for (const e of this.#elements) {
            h = Math.imul(h, 31) + getHashCode(e);
        }
        this.#hashCode = h;
    }

    get length() { return this.#elements.length; }
    get hashCode() { return this.#hashCode; }

    get<K extends number & keyof T>(index: K): T[K] { 
        return this.#elements[index]; 
    }

    equals(other: unknown): boolean {
        if (this === other) return true;
        if (!(other instanceof Tuple)) return false;
        
        if (this.hashCode !== other.hashCode) return false;
        if (this.length !== other.length) return false;
        
        const otherTuple = other as Tuple<Value[]>;
        for (let i = 0; i < this.length; i++) {
            if (!areEqual(this.#elements[i], otherTuple.#elements[i])) return false;
        }
        return true;
    }
    
    [Symbol.iterator](): Iterator<T[number]> {
        return this.#elements[Symbol.iterator]();
    }

    toString(): string {
        return `(${this.#elements.map(e => String(e)).join(', ')})`;
    }
    
    [Symbol.for('nodejs.util.inspect.custom')]() { return this.toString(); }
}

// ============================================================================
// 5. RECURSIVE MAP
// ============================================================================

class RecursiveMap<K extends Value, V extends Value> implements Structural, Iterable<[K, V]> {
    
    private _keys: K[] = [];
    private _values: V[] = [];
    private _hashes: number[] = []; 
    private _indices: Uint32Array;
    
    private _bucketCount = 16;
    private _mask = 15;
    
    private _isFrozen = false;
    private _cachedHash: number | null = null;

    constructor() {
        this._indices = new Uint32Array(16);
    }

    get size() { return this._keys.length; }
    get isFrozen() { return this._isFrozen; }
    isEmpty(): boolean { return this._keys.length === 0; }

    mutableCopy(): RecursiveMap<K, V> {
        const copy = new RecursiveMap<K, V>();
        copy.ensureCapacity(this.size);
        for (let i = 0; i < this._keys.length; i++) {
            copy.set(this._keys[i], this._values[i]);
        }
        return copy;
    }

    get hashCode(): number {
        if (this._cachedHash !== null) return this._cachedHash;
        
        let h = 0;
        for (let i = 0; i < this._keys.length; i++) {
            const hk = this._hashes[i];
            
            // Nested freeze trigger
            if (this._keys[i] && typeof this._keys[i] === 'object') {
                (this._keys[i] as any).hashCode; 
            }
            
            const hv = getHashCode(this._values[i]);
            h ^= Math.imul(hk, 31) ^ hv;
        }
        
        this._cachedHash = h;
        this._isFrozen = true;
        return h;
    }

    ensureCapacity(capacity: number) {
        if (capacity * 1.33 > this._bucketCount) {
            let target = this._bucketCount;
            while (target * 0.75 < capacity) target *= 2;
            
            this._bucketCount = target;
            this._mask = this._bucketCount - 1;
            
            const oldKeys = this._keys;
            const oldHashes = this._hashes;
            this._indices = new Uint32Array(this._bucketCount);
            
            for (let i = 0; i < oldKeys.length; i++) {
                const h = oldHashes[i];
                let idx = h & this._mask;
                while (this._indices[idx] !== 0) idx = (idx + 1) & this._mask;
                this._indices[idx] = i + 1;
            }
        }
    }

    private resize() {
        this.ensureCapacity(this._keys.length + 1);
    }

    set(key: K, value: V): void {
        if (this._isFrozen) throw new Error("Frozen Map");
        if (this._keys.length >= this._bucketCount * 0.75) this.resize();

        const h = getHashCode(key);
        let idx = h & this._mask;

        while (true) {
            const entry = this._indices[idx];
            
            if (entry === 0) {
                this._hashes.push(h);
                this._keys.push(key);
                this._values.push(value);
                this._indices[idx] = this._keys.length;
                this._cachedHash = null;
                return;
            }

            const ptr = entry - 1;
            if (this._hashes[ptr] === h && areEqual(this._keys[ptr], key)) {
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
            const entry = this._indices[idx];
            if (entry === 0) return undefined;
            
            const ptr = entry - 1;
            if (this._hashes[ptr] === h && areEqual(this._keys[ptr], key)) return this._values[ptr];
            
            idx = (idx + 1) & this._mask;
        }
    }

    delete(key: K): boolean {
        if (this._isFrozen) throw new Error("Frozen Map");
        if (this.size === 0) return false;

        const h = getHashCode(key);
        let idx = h & this._mask;

        while (true) {
            const entry = this._indices[idx];
            if (entry === 0) return false;

            const ptr = entry - 1;
            if (this._hashes[ptr] === h && areEqual(this._keys[ptr], key)) {
                this._cachedHash = null;
                
                this.removeIndex(idx);

                const lastKey = this._keys.pop()!;
                const lastVal = this._values.pop()!;
                const lastHash = this._hashes.pop()!;

                if (ptr < this._keys.length) {
                    this._keys[ptr] = lastKey;
                    this._values[ptr] = lastVal;
                    this._hashes[ptr] = lastHash;
                    this.updateIndexForKey(lastHash, this._keys.length + 1, ptr + 1);
                }
                return true;
            }
            idx = (idx + 1) & this._mask;
        }
    }

    private updateIndexForKey(hash: number, oldLoc: number, newLoc: number) {
        let idx = hash & this._mask;
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
        while (this._indices[i] !== 0) {
            const entry = this._indices[i];
            const ptr = entry - 1;
            const h = this._hashes[ptr]; 
            
            const ideal = h & this._mask;
            const distHole = (holeIdx - ideal + this._bucketCount) & this._mask;
            const distI = (i - ideal + this._bucketCount) & this._mask;
            
            if (distHole < distI) {
                this._indices[holeIdx] = entry;
                holeIdx = i;
            }
            i = (i + 1) & this._mask;
        }
        this._indices[holeIdx] = 0;
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

    *[Symbol.iterator](): Iterator<[K, V]> {
        for(let i=0; i<this._keys.length; i++) yield [this._keys[i], this._values[i]];
    }
    
    toString(): string {
        if (this.isEmpty()) return `RecursiveMap(0) {}`;

        // Only sort for visualization, using the visual comparator
        const entries = this._keys.map((k, i) => ({ key: k, value: this._values[i] }));
        entries.sort((a, b) => compareVisualLogic(a.key, b.key));

        const body = entries
            .map(e => `  ${String(e.key)} => ${String(e.value)}`)
            .join(',\n');

        return `RecursiveMap(${this.size}) {\n${body}\n}`;
    }
    [Symbol.for('nodejs.util.inspect.custom')]() { return this.toString(); }
}

// ============================================================================
// 6. RECURSIVE SET
// ============================================================================

class RecursiveSet<T extends Value> implements Structural, Iterable<T> {
    
    private _values: T[] = [];
    private _hashes: number[] = [];
    private _indices: Uint32Array; 
    
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
        this._indices = new Uint32Array(this._bucketCount);
        for (const item of initialData) this.add(item);
    }

    get size(): number { return this._values.length; }
    get isFrozen(): boolean { return this._isFrozen; }
    isEmpty(): boolean { return this._values.length === 0; }

    get hashCode(): number {
        this._isFrozen = true;
        return this._xorHash;
    }

    ensureCapacity(capacity: number) {
        if (capacity * 1.33 > this._bucketCount) {
            let target = this._bucketCount;
            while (target * 0.75 < capacity) target *= 2;
            
            this._bucketCount = target;
            this._mask = this._bucketCount - 1;
            
            const oldValues = this._values;
            const oldHashes = this._hashes;
            this._indices = new Uint32Array(this._bucketCount);
            
            for (let i = 0; i < oldValues.length; i++) {
                const h = oldHashes[i];
                let idx = h & this._mask;
                while (this._indices[idx] !== 0) idx = (idx + 1) & this._mask;
                this._indices[idx] = i + 1;
            }
        }
    }

    private resize(): void {
        this.ensureCapacity(this._values.length + 1);
    }

    private updateIndexForValue(hash: number, oldLoc: number, newLoc: number): void {
        let idx = hash & this._mask;
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
        while (this._indices[i] !== 0) {
            const entry = this._indices[i];
            const valPtr = entry - 1;
            const h = this._hashes[valPtr];
            
            const idealIdx = h & this._mask;
            const distToHole = (holeIdx - idealIdx + this._bucketCount) & this._mask;
            const distToI = (i - idealIdx + this._bucketCount) & this._mask;
            
            if (distToHole < distToI) {
                this._indices[holeIdx] = entry;
                holeIdx = i;
            }
            i = (i + 1) & this._mask;
        }
        this._indices[holeIdx] = 0;
    }
    
    static compareVisual(a: Value, b: Value): number {
        return compareVisualLogic(a, b);
    }

    add(e: T): void {
        if (this._isFrozen) throw new Error("Frozen Set modified.");
        if (this._values.length >= this._bucketCount * this.LOAD_FACTOR) this.resize();

        const h = getHashCode(e);
        let idx = h & this._mask;

        while (true) {
            const entry = this._indices[idx];
            if (entry === 0) {
                this._hashes.push(h);
                this._values.push(e);
                this._indices[idx] = this._values.length;
                this._xorHash ^= h; 
                return;
            }
            
            const valIndex = entry - 1;
            if (this._hashes[valIndex] === h && areEqual(this._values[valIndex], e)) return; 
            
            idx = (idx + 1) & this._mask;
        }
    }

    has(element: T): boolean {
        const h = getHashCode(element);
        let idx = h & this._mask;
        while (true) {
            const entry = this._indices[idx];
            if (entry === 0) return false;
            
            const valIndex = entry - 1;
            if (this._hashes[valIndex] === h && areEqual(this._values[valIndex], element)) return true;
            
            idx = (idx + 1) & this._mask;
        }
    }

    remove(e: T): void {
        if (this._isFrozen) throw new Error("Frozen Set modified.");
        if (this._values.length === 0) return;

        const h = getHashCode(e);
        let idx = h & this._mask;

        while (true) {
            const entry = this._indices[idx];
            if (entry === 0) return;

            const valIndex = entry - 1;
            if (this._hashes[valIndex] === h && areEqual(this._values[valIndex], e)) {
                this._xorHash ^= h;
                this.removeIndex(idx);
                
                const lastVal = this._values.pop()!;
                const lastHash = this._hashes.pop()!;

                if (valIndex < this._values.length) {
                    this._values[valIndex] = lastVal;
                    this._hashes[valIndex] = lastHash;
                    this.updateIndexForValue(lastHash, this._values.length + 1, valIndex + 1);
                }
                return;
            }
            idx = (idx + 1) & this._mask;
        }
    }

    clone(): RecursiveSet<T> {
        const s = new RecursiveSet<T>();
        if (s._bucketCount !== this._bucketCount) s.ensureCapacity(this.size);
        
        if (s._bucketCount === this._bucketCount) {
            s._indices.set(this._indices);
            s._values = this._values.slice();
            s._hashes = this._hashes.slice();
            s._xorHash = this._xorHash;
        } else {
             for(const v of this._values) s.add(v);
        }
        return s;
    }

    union(other: RecursiveSet<T>): RecursiveSet<T> {
        const res = this.clone();
        for (const v of other._values) res.add(v);
        return res;
    }

    intersection(other: RecursiveSet<T>): RecursiveSet<T> {
        const res = new RecursiveSet<T>();
        const [small, large] = this.size < other.size ? [this, other] : [other, this];
        for (const v of small._values) { if (large.has(v)) res.add(v); }
        return res;
    }

    difference(other: RecursiveSet<T>): RecursiveSet<T> {
        if (other.isEmpty()) return this.clone();
        const res = new RecursiveSet<T>();
        for (const v of this._values) { if (!other.has(v)) res.add(v); }
        return res;
    }

    symmetricDifference(other: RecursiveSet<T>): RecursiveSet<T> {
        const res = new RecursiveSet<T>();
        for (const v of this._values)  { if (!other.has(v)) res.add(v); }
        for (const v of other._values) { if (!this.has(v))  res.add(v); }
        return res;
    }
    
    cartesianProduct<U extends Value>(other: RecursiveSet<U>): RecursiveSet<Tuple<[T, U]>> {
        const result = new RecursiveSet<Tuple<[T, U]>>();
        result.ensureCapacity(this.size * other.size);
        for (const a of this) {
            for (const b of other) {
                result.add(new Tuple(a, b));
            }
        }
        return result;
    }

    powerset(): RecursiveSet<RecursiveSet<T>> {
        const n = this._values.length;
        const max = 1 << n;
        const result = new RecursiveSet<RecursiveSet<T>>();
        result.ensureCapacity(max);
        
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
        return this._values[Math.floor(Math.random() * this._values.length)];
    }
    
    isSubset(other: RecursiveSet<T>): boolean {
        if (this.size > other.size) return false;
        if (this === other) return true;
        for (const item of this._values) {
            if (!other.has(item)) return false;
        }
        return true;
    }

    isSuperset(other: RecursiveSet<T>): boolean {
        return other.isSubset(this);
    }
    
    [Symbol.iterator](): Iterator<T> { return this._values[Symbol.iterator](); }
    
    equals(other: unknown): boolean {
        if (this === other) return true;
        if (!(other instanceof RecursiveSet)) return false;
        if (this.size !== other.size) return false;
        if (this.hashCode !== other.hashCode) return false;
        for(const v of this._values) { if (!other.has(v)) return false; }
        return true;
    }
    
    toString(): string {
        // Use compareVisual exclusively for user-facing output
        const sorted = [...this._values].sort(compareVisualLogic);
        return `{${sorted.map(String).join(', ')}}`;
    }
    [Symbol.for('nodejs.util.inspect.custom')]() { return this.toString(); }
}

// ============================================================================
// 7. PUBLIC EXPORTS
// ============================================================================

function emptySet<T extends Value>() { return new RecursiveSet<T>(); }
function singleton<T extends Value>(el: T) { return new RecursiveSet<T>(el); }
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
    hashValue,
    getHashCode
};