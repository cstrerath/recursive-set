import createTree, { Tree, Iterator as TreeIterator } from 'functional-red-black-tree';

/**
 * @module recursive-set
 * A mutable recursive set implementation.
 * Powered by functional Red-Black Trees for O(log n) operations and O(1) cloning.
 */

/**
 * A lightweight wrapper for Tuples to enable Value-Equality in RecursiveSet.
 * Immutable by design.
 */
export class Tuple<T extends unknown[]> {
    readonly values: T;

    constructor(...values: T) {
        this.values = values;
    }

    get length(): number {
        return this.values.length;
    }

    get<K extends keyof T>(index: K): T[K] {
        return this.values[index];
    }

    *[Symbol.iterator](): Iterator<T[number]> {
        for (const val of this.values) {
            yield val;
        }
    }

    toString(): string {
        return `(${this.values.map(v => String(v)).join(', ')})`;
    }
    
    [Symbol.for('nodejs.util.inspect.custom')](): string {
        return this.toString();
    }
}

    export class RecursiveSet<T> {
        private _tree: Tree<T | RecursiveSet<T>, boolean>;

        /**
         * Static comparator for Red-Black Tree ordering.
         * Supports Primitives, RecursiveSets and Tuples.
         * REJECTS plain JS Objects and Arrays to enforce strict semantics.
         */
        static compare(a: unknown, b: unknown): number {
        if (a === b) return 0;

        const isSetA = a instanceof RecursiveSet;
        const isSetB = b instanceof RecursiveSet;
        const isTupA = a instanceof Tuple;
        const isTupB = b instanceof Tuple;

        // Sort Order: Primitives (0) < Tuples (1) < Sets (2)
        const getTypeScore = (isSet: boolean, isTup: boolean) => {
            if (isSet) return 2;
            if (isTup) return 1;
            return 0;
        };
        
        const scoreA = getTypeScore(isSetA, isTupA);
        const scoreB = getTypeScore(isSetB, isTupB);

        if (scoreA !== scoreB) return scoreA < scoreB ? -1 : 1;

        // 1. Sets
        if (isSetA && isSetB) {
            const setA = a as RecursiveSet<unknown>;
            const setB = b as RecursiveSet<unknown>;
            
            if (setA.size !== setB.size) return setA.size < setB.size ? -1 : 1;

            let iterA = setA._tree.begin;
            let iterB = setB._tree.begin;

            while (iterA.valid && iterB.valid) {
                const cmp = RecursiveSet.compare(iterA.key, iterB.key);
                if (cmp !== 0) return cmp;
                iterA.next();
                iterB.next();
            }
            return 0;
        }

        // 2. Tuples
        if (isTupA && isTupB) {
            const tupA = a as Tuple<unknown[]>;
            const tupB = b as Tuple<unknown[]>;
            
            if (tupA.length !== tupB.length) return tupA.length < tupB.length ? -1 : 1;
            
            for (let i = 0; i < tupA.length; i++) {
                const cmp = RecursiveSet.compare(tupA.get(i), tupB.get(i));
                if (cmp !== 0) return cmp;
            }
            return 0;
        }

        // 3. Primitives (guaranteed by add() validation)
        const tA = typeof a;
        const tB = typeof b;
        if (tA !== tB) return tA > tB ? 1 : -1;
        
        // @ts-ignore
        if (a < b) return -1;
        // @ts-ignore
        if (a > b) return 1;
        return 0;
    }

    constructor(...elements: Array<T | RecursiveSet<T>>) {
        this._tree = createTree<T | RecursiveSet<T>, boolean>(RecursiveSet.compare);
        for (const el of elements) {
            this.add(el);
        }
    }

    // === Copy-on-Write Support ===

    /**
     * Creates a shallow copy of the set in O(1) time.
     */
    clone(): RecursiveSet<T> {
        const clone = new RecursiveSet<T>();
        clone._tree = this._tree;
        return clone;
    }

    // === Mutable Operations ===

    add(element: T | RecursiveSet<T>): this {
        // Validation
        if (typeof element === "number" && Number.isNaN(element)) {
            throw new Error("NaN is not supported");
        }
        
        const isSet = element instanceof RecursiveSet;
        const isTup = element instanceof Tuple;
        const isObject = element !== null && typeof element === 'object' && !isSet && !isTup;

        if (isObject) {
            throw new Error(
                "Plain Objects and Arrays are not supported. " +
                "Use Tuple for sequences or RecursiveSet for nested structures."
            );
        }

        // Idempotency
        if (this.has(element)) return this;
        
        this._tree = this._tree.insert(element, true);
        return this;
    }


    remove(element: T | RecursiveSet<T>): this {
        this._tree = this._tree.remove(element);
        return this;
    }

    clear(): this {
        this._tree = createTree<T | RecursiveSet<T>, boolean>(RecursiveSet.compare);
        return this;
    }

    // === Set Operations ===

    union(other: RecursiveSet<T>): RecursiveSet<T> {
        const result = this.clone(); 
        for (const el of other) result.add(el);
        return result;
    }

    intersection(other: RecursiveSet<T>): RecursiveSet<T> {
        const result = new RecursiveSet<T>();
        const [smaller, larger] = this.size < other.size ? [this, other] : [other, this];
        for (const el of smaller) {
            if (larger.has(el)) {
                result.add(el);
            }
        }
        return result;
    }

    difference(other: RecursiveSet<T>): RecursiveSet<T> {
        const result = new RecursiveSet<T>();
        for (const el of this) {
            if (!other.has(el)) {
                result.add(el);
            }
        }
        return result;
    }

    symmetricDifference(other: RecursiveSet<T>): RecursiveSet<T> {
        return this.difference(other).union(other.difference(this));
    }

    powerset(): RecursiveSet<RecursiveSet<T>> {
        const n = this.size;
        if (n > 30) throw new Error("Powerset size exceeds 32-bit integer limit");

        const elements: Array<T | RecursiveSet<T>> = [];
        this._tree.forEach((key: T | RecursiveSet<T>) => { elements.push(key); });
        
        const subsets: RecursiveSet<T>[] = [];
        
        for (let i = 0; i < (1 << n); i++) {
            const subset = new RecursiveSet<T>();
            for (let j = 0; j < n; j++) {
                if (i & (1 << j)) {
                    subset.add(elements[j]);
                }
            }
            subsets.push(subset);
        }
        return new RecursiveSet<RecursiveSet<T>>(...subsets);
    }

    /**
     * Returns the Cartesian product as a set of Tuples.
     * Uses the Tuple class to ensure structural equality.
     */
        cartesianProduct<U>(other: RecursiveSet<U>): RecursiveSet<Tuple<[T | RecursiveSet<T>, U | RecursiveSet<U>]>> {
        const result = new RecursiveSet<Tuple<[T | RecursiveSet<T>, U | RecursiveSet<U>]>>();
        
        for (const x of this) {
            for (const y of other) {
                result.add(new Tuple(x, y));
            }
        }
        return result;
    }

    // === Predicates ===

    has(element: T | RecursiveSet<T>): boolean {
        return this._tree.get(element) !== undefined;
    }

    isSubset(other: RecursiveSet<T>): boolean {
        if (this.size > other.size) return false;
        for (const el of this) {
            if (!other.has(el)) return false;
        }
        return true;
    }

    isSuperset(other: RecursiveSet<T>): boolean {
        return other.isSubset(this);
    }

    isProperSubset(other: RecursiveSet<T>): boolean {
        return this.isSubset(other) && !this.equals(other);
    }

    isEmpty(): boolean {
        return this.size === 0;
    }

    equals(other: RecursiveSet<T>): boolean {
        return RecursiveSet.compare(this, other) === 0;
    }

    // === Utility ===

    get size(): number {
        return this._tree.length;
    }

    toSet(): Set<T | RecursiveSet<T>> {
        const result = new Set<T | RecursiveSet<T>>();
        this._tree.forEach((key: T | RecursiveSet<T>) => { result.add(key); });
        return result;
    }

    // Lazy Iterator
    *[Symbol.iterator](): Iterator<T | RecursiveSet<T>> {
        let iter = this._tree.begin;
        while(iter.valid) {
            yield iter.key;
            iter.next();
        }
    }

    toString(): string {
        if (this.isEmpty()) return "∅";
        const elements: string[] = [];
        this._tree.forEach((key: unknown) => {
            if (key instanceof RecursiveSet) {
                elements.push(key.toString());
            } else if (key instanceof Tuple) {
                elements.push(key.toString());
            } else {
                elements.push(String(key));
            }
        });
        return `{${elements.join(", ")}}`;
    }

    [Symbol.for('nodejs.util.inspect.custom')](): string {
        return this.toString();
    }
}

// === Helpers ===

export function emptySet<T>(): RecursiveSet<T> {
    return new RecursiveSet<T>();
}

export function singleton<T>(element: T): RecursiveSet<T> {
    return new RecursiveSet<T>(element);
}

export function fromIterable<T>(iterable: Iterable<T>): RecursiveSet<T> {
    return new RecursiveSet<T>(...iterable);
}
