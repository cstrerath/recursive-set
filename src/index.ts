/**
 * @module recursive-set
 * @version 8.0.0
 * @description
 * High-Performance collection library supporting **Value Semantics** (Deep Equality)
 * and recursive structures.
 * * **CONTRACTS & INVARIANTS:**
 * 1. **Finite Numbers Only:** `NaN` and `Infinity` are **strictly forbidden**. They break strict equality checks and integer optimization paths.
 * 2. **Strict Value Semantics:** Plain JavaScript objects (`{}`) are **not supported**. Objects must implement the `Structural` interface.
 * 3. **Hash Quality:** The $O(1)$ performance guarantee relies on a good distribution. Returning a constant `hashCode` (e.g. `42`) forces all elements into a single bucket, degrading performance to $O(N)$.
 * 4. **Deterministic Visualization:** Custom `toString()` implementations **must** utilize `compareVisualLogic` for nested structures. Failing to do so results in cut/unstable string output.
 * 5. **Immutability:** Once an object is added to a collection, its `hashCode` **must not change**.
 * 6. **No Circular Dependencies:** A `RecursiveSet` cannot contain itself, directly or indirectly (e.g. A ∈ B ∈ A). Runtime checks are omitted for performance. Creating a cycle will cause a **Stack Overflow** during hashing or visualization.
 * * **Architecture:**
 * - **Storage:** Open Addressing with Linear Probing.
 * - **Hashing:** Zero-allocation FNV-1a / Murmur-inspired hybrid.
 * - **Memory:** Flattened arrays for cache locality (SoA - Structure of Arrays).
 */

// ============================================================================
// 1. TYPE DEFINITIONS
// ============================================================================

type Primitive = string | number;

/**
 * Represents any value that can be stored in the collection.
 * Can be a primitive or a complex object implementing the Structural interface.
 */
type Value = Primitive | Structural;

/**
 * Interface for objects that support deep equality checks and hashing.
 * Implementing this allows custom objects to be used as keys/values.
 */
interface Structural {
    /**
     * A stable hash code for the object. 
     * Accessing this property generally freezes the object's state in recursive structures.
     */
    readonly hashCode: number;

    /**
     * Checks structural equality with another object.
     */
    equals(other: unknown): boolean;

    /** * Returns a deterministic string representation.
     * @remarks
     * **Contract:** Implementations MUST use `RecursiveSet.compareVisual(a, b)` 
     * to sort nested collections before stringifying, otherwise output is non-deterministic.
     */
    toString(): string;
}

// ============================================================================
// 2. VISUAL HELPERS
// ============================================================================

/**
 * Visual Comparator used strictly for deterministic .toString() output.
 * * @remarks
 * This does NOT define the logical order for the Set/Map (which are unordered).
 * It ensures that `{a, b}` and `{b, a}` produce the same string output.
 */
function compareVisualLogic(a: Value, b: Value): number {
    if (a === b) return 0;
    
    // 1. Numbers: Mathematical sort
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    
    // 2. Strings: Lexicographic sort
    if (typeof a === 'string' && typeof b === 'string') return a < b ? -1 : 1;
    
    // 3. Type separation (Numbers < Strings < Objects)
    const typeA = getTypeId(a);
    const typeB = getTypeId(b);
    if (typeA !== typeB) return typeA - typeB;

    // 4. Recursive Fallback: Compare string representations
    return String(a) < String(b) ? -1 : 1;
}

function getTypeId(v: Value): number {
    if (typeof v === 'number') return 1;
    if (typeof v === 'string') return 2;
    return 3; // Objects / Structures
}

// ============================================================================
// 3. HASH ENGINE (Optimized)
// ============================================================================

// Static allocation to prevent GC pauses during number hashing.
// We treat numbers as raw bits to avoid FPU overhead.
const _buffer = new ArrayBuffer(8);
const _f64 = new Float64Array(_buffer);
const _i32 = new Int32Array(_buffer);

// Mixing constants (derived from MurmurHash3)
const HASH_C1 = 0xcc9e2d51;
const HASH_C2 = 0x1b873593;

/**
 * Computes a high-quality 32-bit hash code for any supported Value.
 * Optimized for V8's internal number representation (Smis vs Doubles).
 */
function getHashCode(val: Value): number {
    // --- CASE A: NUMBER ---
    if (typeof val === 'number') {
        // Fast Path: 32-Bit Integers (Smis)
        // (val | 0) === val checks if it's a safe integer.
        // This handles -0 correctly (converts to 0).
        if ((val | 0) === val) {
            let h = val | 0;
            // Avalanche Mixer: Spreads bits to prevent collisions on sequential numbers
            h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
            h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
            return (h ^ (h >>> 16)) >>> 0;
        }

        // Slow Path: Floats (Doubles)
        // Interpret the double's IEEE 754 bit pattern as two 32-bit integers.
        _f64[0] = val;
        const low = _i32[0];
        const high = _i32[1];

        return (Math.imul(low, HASH_C1) ^ Math.imul(high, HASH_C2)) >>> 0;
    }

    // --- CASE B: STRING ---
    // Jenkins One-at-a-Time variant
    if (typeof val === 'string') {
        let h = 0x811c9dc5;
        const len = val.length;
        for (let i = 0; i < len; i++) {
            h ^= val.charCodeAt(i);
            h = Math.imul(h, 0x01000193);
        }
        return h >>> 0;
    }

    // --- CASE C: STRUCTURAL ---
    if (val && typeof val === 'object') {
        return val.hashCode;
    }
    
    return 0;
}

/**
 * Deep equality check dispatcher.
 */
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

/**
 * An immutable, hashable sequence of values.
 * Useful as composite keys in Maps.
 */
class Tuple<T extends Value[]> implements Structural, Iterable<T[number]> {
    
    readonly #elements: readonly Value[];
    readonly #hashCode: number;

    constructor(...elements: T) {
        this.#elements = [...elements]; // Defensive copy
        Object.freeze(this.#elements);      

        // Compute hash immediately (tuples are immutable)
        let h = 1;
        for (const e of this.#elements) {
            h = Math.imul(h, 31) + getHashCode(e);
        }
        this.#hashCode = h;
    }

    get length() { return this.#elements.length; }
    get hashCode() { return this.#hashCode; }

    /** Typesafe access to elements */
    get<K extends number & keyof T>(index: K): T[K] { 
        return this.#elements[index]; 
    }

    equals(other: unknown): boolean {
        if (this === other) return true;
        if (!(other instanceof Tuple)) return false;

        if (this.hashCode !== other.hashCode) return false;
        if (this.length !== other.length) return false;

        for (let i = 0; i < this.length; i++) {
        if (!areEqual(this.#elements[i], other.#elements[i])) return false;
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

/**
 * A Hash Map implementation supporting complex keys (Value Semantics).
 * * @template K Key Type
 * @template V Value Type
 */
class RecursiveMap<K extends Value, V extends Value> implements Structural, Iterable<[K, V]> {
    
    // Structure of Arrays (SoA) for cache locality
    private _keys: K[] = [];
    private _values: V[] = [];
    private _hashes: number[] = []; 
    
    // Open Addressing Index Table
    // Maps (Hash & Mask) -> Index in _keys/_values + 1 (0 means empty)
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

    /**
     * Creates a shallow mutable copy of the map.
     * Useful when the current map is frozen.
     */
    mutableCopy(): RecursiveMap<K, V> {
        const copy = new RecursiveMap<K, V>();
        copy.ensureCapacity(this.size);
        for (let i = 0; i < this._keys.length; i++) {
            copy.set(this._keys[i], this._values[i]);
        }
        return copy;
    }

    /**
     * Computes the hash code of the map.
     * Order-independent (XOR sum).
     * @remarks ACCESSING THIS FREEZES THE MAP.
     */
    get hashCode(): number {
        if (this._cachedHash !== null) return this._cachedHash;
        
        let h = 0;
        for (let i = 0; i < this._keys.length; i++) {
            const k = this._keys[i];
            const hk = this._hashes[i]; // Use cached hash for speed
            
            // Force freeze on the key if it's structural (nested freeze)
            if (k && typeof k === 'object') {
                k.hashCode; 
            }

            // Calculate value hash (freezes value if structural)
            const hv = getHashCode(this._values[i]);
            
            // Mix key hash and value hash
            h ^= Math.imul(hk, 31) ^ hv;
        }
        
        this._cachedHash = h;
        this._isFrozen = true;
        return h;
    }

    /**
     * Resizes the internal lookup table if load factor > 0.75.
     */
    ensureCapacity(capacity: number) {
        if (capacity * 1.33 > this._bucketCount) {
            let target = this._bucketCount;
            while (target * 0.75 < capacity) target *= 2;
            
            this._bucketCount = target;
            this._mask = this._bucketCount - 1;
            
            // Rehash all entries into new index table
            const oldKeys = this._keys;
            const oldHashes = this._hashes;
            this._indices = new Uint32Array(this._bucketCount);
            
            for (let i = 0; i < oldKeys.length; i++) {
                const h = oldHashes[i];
                let idx = h & this._mask;
                // Linear Probing
                while (this._indices[idx] !== 0) idx = (idx + 1) & this._mask;
                this._indices[idx] = i + 1;
            }
        }
    }

    private resize() {
        this.ensureCapacity(this._keys.length + 1);
    }

    /**
     * Associates the specified value with the specified key.
     * If the map previously contained a mapping for the key, the old value is replaced.
     */
    set(key: K, value: V): void {
        if (this._isFrozen) throw new Error("Frozen Map");
        if (this._keys.length >= this._bucketCount * 0.75) this.resize();

        const h = getHashCode(key);
        let idx = h & this._mask;

        while (true) {
            const entry = this._indices[idx];
            
            // Found empty slot -> Insert new
            if (entry === 0) {
                this._hashes.push(h);
                this._keys.push(key);
                this._values.push(value);
                this._indices[idx] = this._keys.length; // Store 1-based index
                this._cachedHash = null;
                return;
            }

            // Found existing key -> Update value
            const ptr = entry - 1;
            if (this._hashes[ptr] === h && areEqual(this._keys[ptr], key)) {
                this._values[ptr] = value;
                this._cachedHash = null;
                return;
            }
            
            // Collision -> Next slot
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
                
                // 1. Remove from index table (Backshift Deletion)
                this.removeIndex(idx);

                // 2. Remove from dense arrays (Swap with last element to keep arrays packed)
                const lastKey = this._keys.pop()!;
                const lastVal = this._values.pop()!;
                const lastHash = this._hashes.pop()!;

                if (ptr < this._keys.length) {
                    this._keys[ptr] = lastKey;
                    this._values[ptr] = lastVal;
                    this._hashes[ptr] = lastHash;
                    // Update index table to point to new location of the swapped element
                    this.updateIndexForKey(lastHash, this._keys.length + 1, ptr + 1);
                }
                return true;
            }
            idx = (idx + 1) & this._mask;
        }
    }

    /** Updates the index table when an element is moved in the dense arrays. */
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

    /**
     * Removes an entry from the hash table and repairs the probe chain.
     * Uses "Backshift Deletion" (Robin Hood style) to fill the hole.
     */
    private removeIndex(holeIdx: number): void {
        let i = (holeIdx + 1) & this._mask;
        while (this._indices[i] !== 0) {
            const entry = this._indices[i];
            const ptr = entry - 1;
            const h = this._hashes[ptr]; 
            
            const ideal = h & this._mask;
            const distHole = (holeIdx - ideal + this._bucketCount) & this._mask;
            const distI = (i - ideal + this._bucketCount) & this._mask;
            
            // If the element at 'i' belongs to a bucket logically before the hole,
            // or is further away from its ideal slot than the hole is, move it back.
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

        // Sort only for visual output stability
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

/**
 * A Hash Set implementation supporting Value Semantics.
 * * Features:
 * - O(1) amortized Add/Has/Remove.
 * - Deep equality for recursive structures.
 * - Frozen state protection after hashing.
 */
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
        if (this._isFrozen) return this._xorHash;

        // Deep-freeze trigger: touch child hashCodes once
        for (let i = 0; i < this._values.length; i++) {
            const v = this._values[i];
            if (v && typeof v === 'object') {
            v.hashCode; // triggers freeze of nested RecursiveSet/Map/Tuple/etc.
            }
        }

        this._isFrozen = true;
        return this._xorHash;
    }


    /**
     * Ensures the hash table has enough buckets to hold `capacity` elements
     * without exceeding the load factor.
     */
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

    /** Updates the index table when a value moves in the dense array */
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

    /** Repairs the probe chain after deletion (Backshifting) */
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

    /**
     * Adds an element to the set.
     * @returns void to signal no chaining (performance).
     * @throws if set is frozen.
     */
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

    // === SET OPERATIONS ===

    union(other: RecursiveSet<T>): RecursiveSet<T> {
        const res = this.clone();
        for (const v of other._values) res.add(v);
        return res;
    }

    intersection(other: RecursiveSet<T>): RecursiveSet<T> {
        const res = new RecursiveSet<T>();
        // Iterate over smaller set for O(min(N, M))
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

    /**
     * Computes the Power Set.
     * Warning: Complexity is O(2^N). Use only for small N.
     * @throws Error if size > 20 to prevent memory exhaustion and 32-bit shift overflow.
     */
    powerset(): RecursiveSet<RecursiveSet<T>> {
        const n = this._values.length;
        if (n > 20) {
            throw new Error(`Powerset size too large (N=${n}). Max supported is 20.`);
        }
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