/**
 * @file RecursiveSet Library (Hybrid: Array + AVL Tree)
 * @description
 * High-performance immutable set implementation for TypeScript.
 * Uses a hybrid approach:
 * - Small sets (N < 32) are stored as sorted arrays (cache locality).
 * - Large sets (N >= 32) are upgraded to immutable AVL trees (scalability).
 */

// ============================================================================
// 1. TYPE DEFINITIONS
// ============================================================================

export type Primitive = number | string;

export type Value =
    | Primitive
    | RecursiveSet<Value>
    | Tuple<Value[]>
    | RecursiveMap<Value, Value>
    | ReadonlyArray<Value>;

// ============================================================================
// 2. COMPARATOR & HASHING (Optimized)
// ============================================================================

const FNV_PRIME = 16777619;
const FNV_OFFSET = 2166136261;
const floatBuffer = new ArrayBuffer(8);
const view = new DataView(floatBuffer);

function hashNumber(val: number): number {
    // Integer Fast Path
    if ((val | 0) === val) return val | 0;
    view.setFloat64(0, val, true);
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
    
    // Cached Hash for Containers
    if (v instanceof RecursiveSet || v instanceof Tuple || v instanceof RecursiveMap) {
        return v.hashCode;
    }

    // Recursive Hash for Arrays
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

    // 3. Primary Sort Key: Hash Code (O(1))
    const h1 = hashValue(a);
    const h2 = hashValue(b);
    if (h1 !== h2) return h1 - h2;

    // 4. Same-Type Optimization (Hot Path)
    if (a instanceof RecursiveSet && b instanceof RecursiveSet) return a.compare(b);
    if (a instanceof RecursiveMap && b instanceof RecursiveMap) return a.compare(b);
    if (a instanceof Tuple && b instanceof Tuple) return compareSequences(a.raw, b.raw);
    if (Array.isArray(a) && Array.isArray(b)) return compareSequences(a, b);

    // 5. Mixed-Type Collision Handling (Cold Path)
    // Ensures Total Ordering even if hashes collide across types
    const getTypeId = (v: Value): number => {
        if (Array.isArray(v)) return 1;
        if (v instanceof Tuple) return 2;
        if (v instanceof RecursiveSet) return 3;
        if (v instanceof RecursiveMap) return 4;
        return 99;
    };

    const tA = getTypeId(a);
    const tB = getTypeId(b);
    return tA - tB;
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
// 3. AVL TREE ENGINE (Optimized)
// ============================================================================

export class AVLNode<T extends Value> {
    readonly value: T;
    readonly left: AVLNode<T> | null;
    readonly right: AVLNode<T> | null;
    readonly height: number;
    readonly size: number;

    constructor(value: T, left: AVLNode<T> | null, right: AVLNode<T> | null) {
        this.value = value;
        this.left = left;
        this.right = right;
        const lh = left ? left.height : 0;
        const rh = right ? right.height : 0;
        this.height = (lh > rh ? lh : rh) + 1;
        const ls = left ? left.size : 0;
        const rs = right ? right.size : 0;
        this.size = 1 + ls + rs;
    }
}

function h<T extends Value>(n: AVLNode<T> | null): number { return n ? n.height : 0; }

function rebalance<T extends Value>(node: AVLNode<T>): AVLNode<T> {
    const lh = h(node.left);
    const rh = h(node.right);
    const balance = lh - rh;

    if (balance > 1) {
        const left = node.left!;
        const llh = h(left.left);
        const lrh = h(left.right);

        if (lrh > llh) {
            const y = left;
            const x = y.right!;
            const z = node;
            return new AVLNode(x.value, 
                new AVLNode(y.value, y.left, x.left), 
                new AVLNode(z.value, x.right, z.right));
        }
        return new AVLNode(left.value, left.left, new AVLNode(node.value, left.right, node.right));
    }

    if (balance < -1) {
        const right = node.right!;
        const rlh = h(right.left);
        const rrh = h(right.right);

        if (rlh > rrh) {
            const y = right;
            const x = y.left!;
            const z = node;
            return new AVLNode(x.value, 
                new AVLNode(z.value, z.left, x.left), 
                new AVLNode(y.value, x.right, y.right));
        }
        return new AVLNode(right.value, new AVLNode(node.value, node.left, right.left), right.right);
    }

    return node;
}

function treeAdd<T extends Value>(node: AVLNode<T> | null, value: T): AVLNode<T> {
    if (!node) return new AVLNode(value, null, null);
    
    // Inline number optimization
    if (typeof value === 'number' && typeof node.value === 'number') {
        const diff = (node.value as number) - value;
        if (diff === 0) return node;
        if (diff > 0) {
            const newLeft = treeAdd(node.left, value);
            return newLeft === node.left ? node : rebalance(new AVLNode(node.value, newLeft, node.right));
        } else {
            const newRight = treeAdd(node.right, value);
            return newRight === node.right ? node : rebalance(new AVLNode(node.value, node.left, newRight));
        }
    }

    const cmp = compare(node.value, value);
    if (cmp === 0) return node;
    if (cmp > 0) {
        const newLeft = treeAdd(node.left, value);
        return newLeft === node.left ? node : rebalance(new AVLNode(node.value, newLeft, node.right));
    } else {
        const newRight = treeAdd(node.right, value);
        return newRight === node.right ? node : rebalance(new AVLNode(node.value, node.left, newRight));
    }
}

function treeMin<T extends Value>(node: AVLNode<T>): AVLNode<T> {
    let current = node;
    while (current.left) current = current.left;
    return current;
}

function treeRemove<T extends Value>(node: AVLNode<T> | null, value: T): AVLNode<T> | null {
    if (!node) return null;
    const cmp = compare(node.value, value);
    if (cmp > 0) {
        const newLeft = treeRemove(node.left, value);
        return newLeft === node.left ? node : rebalance(new AVLNode(node.value, newLeft, node.right));
    } else if (cmp < 0) {
        const newRight = treeRemove(node.right, value);
        return newRight === node.right ? node : rebalance(new AVLNode(node.value, node.left, newRight));
    } else {
        if (!node.left) return node.right;
        if (!node.right) return node.left;
        const successor = treeMin(node.right);
        const newRight = treeRemove(node.right, successor.value);
        return rebalance(new AVLNode(successor.value, node.left, newRight));
    }
}

function treeHas<T extends Value>(root: AVLNode<T> | null, value: T): boolean {
    let current = root;
    while (current) {
        if (typeof value === 'number' && typeof current.value === 'number') {
            const diff = (current.value as number) - value;
            if (diff === 0) return true;
            current = diff > 0 ? current.left : current.right;
            continue;
        }
        const cmp = compare(current.value, value);
        if (cmp === 0) return true;
        current = cmp > 0 ? current.left : current.right;
    }
    return false;
}

function buildBalancedTree<T extends Value>(sorted: T[], start: number, end: number): AVLNode<T> | null {
    if (start > end) return null;
    const mid = (start + end) >>> 1;
    const left = buildBalancedTree(sorted, start, mid - 1);
    const right = buildBalancedTree(sorted, mid + 1, end);
    return new AVLNode(sorted[mid], left, right);
}

function fromSortedArray<T extends Value>(sorted: T[]): AVLNode<T> | null {
    return buildBalancedTree(sorted, 0, sorted.length - 1);
}

function toArray<T extends Value>(root: AVLNode<T> | null): T[] {
    const res: T[] = [];
    if (!root) return res;
    const stack: AVLNode<T>[] = [];
    let curr: AVLNode<T> | null = root;
    while (curr || stack.length) {
        while (curr) { stack.push(curr); curr = curr.left; }
        curr = stack.pop()!;
        res.push(curr.value);
        curr = curr.right;
    }
    return res;
}

// ============================================================================
// 4. SET ALGORITHMS (Merge Scan - O(N))
// ============================================================================

function computeUnique<T extends Value>(sorted: T[]): T[] {
    if (sorted.length < 2) return sorted;
    const out: T[] = [sorted[0]];
    let last = sorted[0];
    for (let i = 1; i < sorted.length; i++) {
        if (compare(sorted[i], last) !== 0) { out.push(sorted[i]); last = sorted[i]; }
    }
    return out;
}
function computeUnion<T extends Value, U extends Value>(A: readonly T[], B: readonly U[]): (T | U)[] {
    const res: (T | U)[] = [];
    let i = 0, j = 0;
    while (i < A.length && j < B.length) {
        const cmp = compare(A[i], B[j]);
        if (cmp < 0) res.push(A[i++]);
        else if (cmp > 0) res.push(B[j++]);
        else { res.push(A[i++]); j++; }
    }
    while (i < A.length) res.push(A[i++]);
    while (j < B.length) res.push(B[j++]);
    return res;
}
function computeIntersection<T extends Value>(A: readonly T[], B: readonly T[]): T[] {
    const res: T[] = [];
    let i = 0, j = 0;
    while (i < A.length && j < B.length) {
        const cmp = compare(A[i], B[j]);
        if (cmp < 0) i++;
        else if (cmp > 0) j++;
        else { res.push(A[i++]); j++; }
    }
    return res;
}
function computeDifference<T extends Value>(A: readonly T[], B: readonly T[]): T[] {
    const res: T[] = [];
    let i = 0, j = 0;
    while (i < A.length && j < B.length) {
        const cmp = compare(A[i], B[j]);
        if (cmp < 0) res.push(A[i++]);
        else if (cmp > 0) j++;
        else { i++; j++; }
    }
    while (i < A.length) res.push(A[i++]);
    return res;
}
function computeSymmetricDifference<T extends Value>(A: readonly T[], B: readonly T[]): T[] {
    const res: T[] = [];
    let i = 0, j = 0;
    while (i < A.length && j < B.length) {
        const cmp = compare(A[i], B[j]);
        if (cmp < 0) res.push(A[i++]);
        else if (cmp > 0) res.push(B[j++]);
        else { i++; j++; }
    }
    while (i < A.length) res.push(A[i++]);
    while (j < B.length) res.push(B[j++]);
    return res;
}

// ============================================================================
// 5. CLASSES (RecursiveSet Hybrid)
// ============================================================================

export class Tuple<T extends Value[]> {
    readonly #values: ReadonlyArray<Value>;
    readonly hashCode: number;
    constructor(...values: T) {
        this.#values = values.slice();
        Object.freeze(this.#values);
        let h = 0xDEF0;
        for (const v of this.#values) h = (Math.imul(31, h) + hashValue(v)) | 0;
        this.hashCode = h;
    }
    get raw() { return this.#values; }
    get length() { return this.#values.length; }
    *[Symbol.iterator]() { yield* this.#values; }
    toString() { return `(${this.#values.join(', ')})`; }
    [Symbol.for('nodejs.util.inspect.custom')]() { return this.toString(); }
}

const ARRAY_THRESHOLD = 32;

export class RecursiveSet<T extends Value> {
    readonly #data: ReadonlyArray<T> | AVLNode<T> | null;
    #hashCode: number | null = null;
    #isFrozen: boolean = false;

    static compare(a: unknown, b: unknown): number { return compare(a as Value, b as Value); }

    constructor(...elements: T[]) {
        if (elements.length === 0) {
            this.#data = null;
        } else if (elements.length === 1) {
            this.#data = elements; 
        } else {
            elements.sort(compare);
            const unique = computeUnique(elements);
            if (unique.length < ARRAY_THRESHOLD) {
                this.#data = unique;
                Object.freeze(this.#data);
            } else {
                // @ts-ignore
                this.#data = fromSortedArray(unique);
            }
        }
    }

    static fromSortedUnsafe<U extends Value>(sortedUnique: U[]): RecursiveSet<U> {
        const s = new RecursiveSet<U>();
        if (sortedUnique.length === 0) {
            // @ts-ignore
            s.#data = null;
        } else if (sortedUnique.length < ARRAY_THRESHOLD) {
            // @ts-ignore
            s.#data = sortedUnique;
            Object.freeze(s.#data);
        } else {
            // @ts-ignore
            s.#data = fromSortedArray(sortedUnique);
        }
        return s;
    }
    
    static fromArray<U extends Value>(elements: U[]): RecursiveSet<U> {
        return new RecursiveSet(...elements);
    }

    #checkFrozen(op: string) {
        if (this.#isFrozen) throw new Error(`InvalidOperation: Cannot ${op} a frozen RecursiveSet.`);
    }

    get size(): number {
        if (this.#data === null) return 0;
        if (Array.isArray(this.#data)) return this.#data.length;
        return (this.#data as AVLNode<T>).size;
    }

    isEmpty(): boolean { return this.#data === null; }

    get raw(): readonly T[] {
        if (this.#data === null) return [];
        if (Array.isArray(this.#data)) return this.#data;
        return toArray(this.#data as AVLNode<T>);
    }

    get hashCode(): number {
        if (this.#hashCode !== null) return this.#hashCode;
        let h = 0;
        // Deterministic Order Hashing
        for (const val of this) {
            h = (Math.imul(31, h) + hashValue(val)) | 0;
        }
        // Scramble against symmetry
        h = Math.imul(h ^ 0x4567, FNV_PRIME);
        this.#hashCode = h >>> 0;
        this.#isFrozen = true;
        return this.#hashCode;
    }

    compare(other: RecursiveSet<Value>): number {
        if (this === other) return 0;
        const h1 = this.hashCode;
        const h2 = other.hashCode;
        if (h1 !== h2) return h1 - h2;
        return compareSequences(this.raw, other.raw);
    }

    equals(other: RecursiveSet<Value>): boolean { return this.compare(other) === 0; }

    has(element: T): boolean {
        if (this.#data === null) return false;
        
        // Mode A: Array
        if (Array.isArray(this.#data)) {
            const arr = this.#data;
            const len = arr.length;
            for (let i = 0; i < len; i++) {
                if (compare(arr[i], element) === 0) return true;
            }
            return false;
        }
        
        // Mode B: Tree
        return treeHas(this.#data as AVLNode<T>, element);
    }

    add(element: T): this {
        this.#checkFrozen('add');
        if (this.#data === null) {
            // @ts-ignore
            this.#data = [element];
            this.#hashCode = null;
            return this;
        }

        if (Array.isArray(this.#data)) {
            const oldArr = this.#data as T[];
            for(let i=0; i<oldArr.length; i++) {
                if (compare(oldArr[i], element) === 0) return this;
            }
            // Insert Sorted
            const newArr = new Array(oldArr.length + 1);
            let inserted = false;
            let j = 0;
            for (let i = 0; i < oldArr.length; i++) {
                if (!inserted && compare(element, oldArr[i]) < 0) {
                    newArr[j++] = element;
                    inserted = true;
                }
                newArr[j++] = oldArr[i];
            }
            if (!inserted) newArr[j] = element;

            if (newArr.length >= ARRAY_THRESHOLD) {
                // @ts-ignore
                this.#data = fromSortedArray(newArr);
            } else {
                // @ts-ignore
                this.#data = newArr;
            }
            this.#hashCode = null;
            return this;
        }

        const newRoot = treeAdd(this.#data as AVLNode<T>, element);
        if (newRoot !== this.#data) {
            // @ts-ignore
            this.#data = newRoot;
            this.#hashCode = null;
        }
        return this;
    }

    remove(element: T): this {
        this.#checkFrozen('remove');
        if (this.#data === null) return this;

        if (Array.isArray(this.#data)) {
            const idx = this.#data.findIndex(e => compare(e, element) === 0);
            if (idx === -1) return this;
            
            const newArr = this.#data.slice();
            newArr.splice(idx, 1);
            
            if (newArr.length === 0) {
                // @ts-ignore
                this.#data = null;
            } else {
                // @ts-ignore
                this.#data = newArr;
            }
            this.#hashCode = null;
            return this;
        }

        const newRoot = treeRemove(this.#data as AVLNode<T>, element);
        // @ts-ignore
        this.#data = newRoot;
        this.#hashCode = null;
        return this;
    }

    union<U extends Value>(other: RecursiveSet<U>): RecursiveSet<T | U> {
        const merged = computeUnion(this.raw, other.raw);
        return RecursiveSet.fromSortedUnsafe(merged as any);
    }
    intersection(other: RecursiveSet<T>): RecursiveSet<T> {
        const merged = computeIntersection(this.raw, other.raw);
        return RecursiveSet.fromSortedUnsafe(merged);
    }
    difference(other: RecursiveSet<T>): RecursiveSet<T> {
        const merged = computeDifference(this.raw, other.raw);
        return RecursiveSet.fromSortedUnsafe(merged);
    }
    symmetricDifference(other: RecursiveSet<T>): RecursiveSet<T> {
        const merged = computeSymmetricDifference(this.raw, other.raw);
        return RecursiveSet.fromSortedUnsafe(merged);
    }
    cartesianProduct<U extends Value>(other: RecursiveSet<U>): RecursiveSet<Tuple<[T, U]>> {
        const result: Tuple<[T, U]>[] = [];
        const arrA = this.raw;
        const arrB = other.raw;
        for (const a of arrA) {
            for (const b of arrB) {
                result.push(new Tuple(a, b));
            }
        }
        result.sort(compare);
        return RecursiveSet.fromSortedUnsafe(result);
    }
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
        // @ts-ignore
        this.#data = null;
        this.#hashCode = 0;
        return this;
    }
    mutableCopy(): RecursiveSet<T> {
        const s = new RecursiveSet<T>();
        if (this.#data === null) {
            // @ts-ignore
            s.#data = null;
        } else if (Array.isArray(this.#data)) {
            // @ts-ignore
            s.#data = this.#data.slice();
        } else {
            // @ts-ignore
            s.#data = this.#data; 
        }
        return s;
    }
    clone(): RecursiveSet<T> { return this.mutableCopy(); }
    pickRandom(): T {
        const arr = this.raw;
        const idx = (Math.random() * arr.length) | 0;
        return arr[idx]!;
    }
    isSubset(other: RecursiveSet<T>): boolean {
        if (this.size > other.size) return false;
        let i = 0, j = 0;
        const A = this.raw, B = other.raw;
        while (i < A.length && j < B.length) {
            const cmp = compare(A[i], B[j]);
            if (cmp < 0) return false;
            if (cmp > 0) j++;
            else { i++; j++; }
        }
        return i === A.length;
    }
    isSuperset(other: RecursiveSet<T>): boolean { return other.isSubset(this); }
    *[Symbol.iterator](): Iterator<T> {
        if (this.#data === null) return;
        if (Array.isArray(this.#data)) {
            yield* this.#data;
        } else {
            const stack: AVLNode<T>[] = [];
            let curr: AVLNode<T> | null = this.#data as AVLNode<T>;
            while (curr !== null || stack.length > 0) {
                while (curr !== null) {
                    stack.push(curr);
                    curr = curr.left;
                }
                curr = stack.pop()!;
                yield curr.value;
                curr = curr.right;
            }
        }
    }
    toString(): string {
        // "Human Sort" für die Anzeige:
        // Wir holen die rohen Elemente und sortieren sie lexikographisch/numerisch neu,
        // ignorieren dabei die interne Hash-Sortierung des Baums.
        const sorted = this.raw.slice().sort((a, b) => {
            if (typeof a === 'number' && typeof b === 'number') return a - b;
            // String-Vergleich mit "Numeric Mode" (damit "10" nach "2" kommt)
            return String(a).localeCompare(String(b), undefined, { numeric: true });
        });
        return `{${sorted.join(', ')}}`;
    }
    [Symbol.for('nodejs.util.inspect.custom')]() { return this.toString(); }
}

export class RecursiveMap<K extends Value, V extends Value> {
    #entries: Array<{ key: K, value: V }>;
    #hashCode: number | null = null;
    #isFrozen: boolean = false;
    constructor(entries?: Iterable<[K, V]>) {
        this.#entries = [];
        if (entries) for (const [k, v] of entries) this.set(k, v);
    }
    #checkFrozen(op: string) { if (this.#isFrozen) throw new Error(`Frozen: ${op}`); }
    get size() { return this.#entries.length; }
    isEmpty() { return this.#entries.length === 0; }
    get hashCode(): number {
        if (this.#hashCode !== null) return this.#hashCode;
        let h = 0x9ABC;
        for (const e of this.#entries) {
            h = (Math.imul(31, h) + ((Math.imul(hashValue(e.key), 31) ^ hashValue(e.value)) | 0)) | 0;
        }
        this.#hashCode = h;
        this.#isFrozen = true;
        return h;
    }
    compare(other: RecursiveMap<Value, Value>): number {
        if (this === other) return 0;
        if (this.size !== other.size) return this.size - other.size;
        for (let i = 0; i < this.#entries.length; i++) {
            const cmpK = compare(this.#entries[i].key, other.#entries[i].key);
            if (cmpK !== 0) return cmpK;
            const cmpV = compare(this.#entries[i].value, other.#entries[i].value);
            if (cmpV !== 0) return cmpV;
        }
        return 0;
    }
    equals(other: RecursiveMap<Value, Value>) { return this.compare(other) === 0; }
    #indexOf(key: K): number {
        let low = 0, high = this.#entries.length - 1;
        while (low <= high) {
            const mid = (low + high) >>> 1;
            const cmp = compare(this.#entries[mid].key, key);
            if (cmp === 0) return mid;
            if (cmp < 0) low = mid + 1; else high = mid - 1;
        }
        return ~low;
    }
    has(key: K) { return this.#indexOf(key) >= 0; }
    get(key: K) { const idx = this.#indexOf(key); return idx >= 0 ? this.#entries[idx].value : undefined; }
    set(key: K, value: V): this {
        this.#checkFrozen('set');
        const idx = this.#indexOf(key);
        if (idx >= 0) {
            if (compare(this.#entries[idx].value, value) !== 0) {
                this.#entries[idx].value = value;
                this.#hashCode = null;
            }
        } else {
            this.#entries.splice(~idx, 0, { key, value });
            this.#hashCode = null;
        }
        return this;
    }
    delete(key: K): boolean {
        this.#checkFrozen('delete');
        const idx = this.#indexOf(key);
        if (idx >= 0) {
            this.#entries.splice(idx, 1);
            this.#hashCode = null;
            return true;
        }
        return false;
    }
    clear(): this { this.#checkFrozen('clear'); this.#entries = []; this.#hashCode = null; return this; }
    mutableCopy(): RecursiveMap<K, V> {
        const map = new RecursiveMap<K, V>();
        map.#entries = this.#entries.map(e => ({ key: e.key, value: e.value }));
        return map;
    }
    clone() { return this.mutableCopy(); }
    keys() { return this.#entries.map(e => e.key); }
    values() { return this.#entries.map(e => e.value); }
    entries() { return this.#entries.map(e => [e.key, e.value]); }
    *[Symbol.iterator]() { for (const e of this.#entries) yield [e.key, e.value]; }
    toString(): string {
        const sortedEntries = this.#entries.slice().sort((a, b) => {
            if (typeof a.key === 'number' && typeof b.key === 'number') return a.key - b.key;
            return String(a.key).localeCompare(String(b.key), undefined, { numeric: true });
        });
        
        return `Map{${sortedEntries.map(e => `${String(e.key)} => ${String(e.value)}`).join(', ')}}`;
    }
    [Symbol.for('nodejs.util.inspect.custom')]() { return this.toString(); }
}

export function emptySet<T extends Value>() { return new RecursiveSet<T>(); }
export function singleton<T extends Value>(el: T) { return new RecursiveSet<T>(el); }