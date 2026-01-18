/**
 * @module recursive-set-avl-final
 * @description
 * Mutable AVL Tree.
 * - Strict O(log N) operations.
 * - Strict Typing.
 * - Exclusive Ownership (No shared nodes, no public access to internal nodes).
 */

export type Primitive = number | string;

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

export function compare(a: Value, b: Value): number {
    if (a === b) return 0;
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    if (typeof a === 'string' && typeof b === 'string') return a < b ? -1 : 1;

    const typeA = typeof a;
    const typeB = typeof b;
    if (typeA !== typeB) {
        const scoreA = (typeA === 'number') ? 1 : (typeA === 'string' ? 2 : 3);
        const scoreB = (typeB === 'number') ? 1 : (typeB === 'string' ? 2 : 3);
        return scoreA - scoreB;
    }

    const h1 = hashValue(a);
    const h2 = hashValue(b);
    if (h1 !== h2) return h1 - h2;

    if (a instanceof RecursiveSet && b instanceof RecursiveSet) return a.compare(b);
    if (a instanceof RecursiveMap && b instanceof RecursiveMap) return a.compare(b);
    if (a instanceof Tuple && b instanceof Tuple) return compareSequences(a.raw, b.raw);
    if (Array.isArray(a) && Array.isArray(b)) return compareSequences(a, b);

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

class AVLNode<T extends Value> {
    constructor(
        public val: T,
        public left: AVLNode<T> | null = null,
        public right: AVLNode<T> | null = null,
        public height: number = 1,
        public size: number = 1
    ) {}
}

function getHeight<T extends Value>(n: AVLNode<T> | null): number { return n ? n.height : 0; }
function getSize<T extends Value>(n: AVLNode<T> | null): number { return n ? n.size : 0; }

function updateStats<T extends Value>(n: AVLNode<T>) {
    const lh = n.left ? n.left.height : 0;
    const rh = n.right ? n.right.height : 0;
    n.height = (lh > rh ? lh : rh) + 1;
    n.size = 1 + (n.left ? n.left.size : 0) + (n.right ? n.right.size : 0);
}

// Rotations are in-place, safe because we have Exclusive Ownership
function rotateRight<T extends Value>(y: AVLNode<T>): AVLNode<T> {
    const x = y.left!;
    const T2 = x.right;
    x.right = y;
    y.left = T2;
    updateStats(y);
    updateStats(x);
    return x;
}

function rotateLeft<T extends Value>(x: AVLNode<T>): AVLNode<T> {
    const y = x.right!;
    const T2 = y.left;
    y.left = x;
    x.right = T2;
    updateStats(x);
    updateStats(y);
    return y;
}

function getBalance<T extends Value>(n: AVLNode<T>): number {
    return n ? getHeight(n.left) - getHeight(n.right) : 0;
}

function insert<T extends Value>(node: AVLNode<T> | null, val: T): AVLNode<T> {
    if (!node) return new AVLNode(val);

    const cmp = compare(node.val, val);
    if (cmp === 0) return node;

    if (cmp > 0) node.left = insert(node.left, val);
    else node.right = insert(node.right, val);

    updateStats(node);

    const balance = getBalance(node);
    if (balance > 1 && compare(node.left!.val, val) > 0) return rotateRight(node);
    if (balance < -1 && compare(node.right!.val, val) < 0) return rotateLeft(node);
    if (balance > 1 && compare(node.left!.val, val) < 0) {
        node.left = rotateLeft(node.left!);
        return rotateRight(node);
    }
    if (balance < -1 && compare(node.right!.val, val) > 0) {
        node.right = rotateRight(node.right!);
        return rotateLeft(node);
    }
    return node;
}

function minValueNode<T extends Value>(node: AVLNode<T>): AVLNode<T> {
    let current = node;
    while (current.left) current = current.left;
    return current;
}

function deleteNode<T extends Value>(node: AVLNode<T> | null, val: T): AVLNode<T> | null {
    if (!node) return null;

    const cmp = compare(node.val, val);
    if (cmp > 0) {
        node.left = deleteNode(node.left, val);
    } else if (cmp < 0) {
        node.right = deleteNode(node.right, val);
    } else {
        if (!node.left || !node.right) {
            const temp = node.left ? node.left : node.right;
            if (!temp) return null;
            return temp;
        } else {
            const temp = minValueNode(node.right);
            node.val = temp.val;
            node.right = deleteNode(node.right, temp.val);
        }
    }

    updateStats(node);
    const balance = getBalance(node);

    if (balance > 1 && getBalance(node.left!) >= 0) return rotateRight(node);
    if (balance > 1 && getBalance(node.left!) < 0) {
        node.left = rotateLeft(node.left!);
        return rotateRight(node);
    }
    if (balance < -1 && getBalance(node.right!) <= 0) return rotateLeft(node);
    if (balance < -1 && getBalance(node.right!) > 0) {
        node.right = rotateRight(node.right!);
        return rotateLeft(node);
    }
    return node;
}

function copyTree<T extends Value>(node: AVLNode<T> | null): AVLNode<T> | null {
    if (!node) return null;
    const newNode = new AVLNode(node.val, null, null, node.height, node.size);
    newNode.left = copyTree(node.left);
    newNode.right = copyTree(node.right);
    return newNode;
}

function treeToArray<T extends Value>(node: AVLNode<T> | null, acc: T[]) {
    if (!node) return;
    treeToArray(node.left, acc);
    acc.push(node.val);
    treeToArray(node.right, acc);
}

// ============================================================================
// 3. PUBLIC CLASSES
// ============================================================================

export class Tuple<T extends Value[]> {
    readonly #values: ReadonlyArray<Value>;
    readonly hashCode: number;
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

export class RecursiveSet<T extends Value> {
    #root: AVLNode<T> | null = null;
    #hashCode: number | null = null;
    #isFrozen: boolean = false;

    static compare(a: unknown, b: unknown): number { return compare(a as Value, b as Value); }

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
    
    // Creates a new tree from sorted array. Safe because we create new nodes.
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

    #checkFrozen(op: string) {
        if (this.#isFrozen) throw new Error(`InvalidOperation: Cannot ${op} a frozen RecursiveSet.`);
    }

    get size(): number { return getSize(this.#root); }
    isEmpty(): boolean { return this.#root === null; }

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

    has(element: T): boolean {
        let curr = this.#root;
        while (curr) {
            const cmp = compare(curr.val, element);
            if (cmp === 0) return true;
            curr = cmp > 0 ? curr.left : curr.right;
        }
        return false;
    }

    add(element: T): this {
        this.#checkFrozen('add');
        this.#root = insert(this.#root, element);
        this.#hashCode = null;
        return this;
    }

    remove(element: T): this {
        this.#checkFrozen('remove');
        this.#root = deleteNode(this.#root, element);
        this.#hashCode = null;
        return this;
    }

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
    
    // Deep Clone: Copies the entire tree structure
    mutableCopy(): RecursiveSet<T> {
        const s = new RecursiveSet<T>();
        s.#root = copyTree(this.#root);
        return s;
    }
    clone(): RecursiveSet<T> { return this.mutableCopy(); }
    
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
        this.#hashCode = h >>> 0;
        this.#isFrozen = true;
        return this.#hashCode;
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
    toString() { return `Map{${this.#entries.map(e => `${String(e.key)} => ${String(e.value)}`).join(', ')}}`; }
    [Symbol.for('nodejs.util.inspect.custom')]() { return this.toString(); }
}

export function emptySet<T extends Value>() { return new RecursiveSet<T>(); }
export function singleton<T extends Value>(el: T) { return new RecursiveSet<T>(el); }