import createTree from 'functional-red-black-tree';

/**
 * @module recursive-set
 * A mutable recursive set implementation enforcing Cantor's ZFC axioms.
 * Powered by functional Red-Black Trees for O(log n) operations and O(1) cloning.
 */
export class RecursiveSet<T = any> {
    // Underlying persistent data structure
    private _tree: any; 
    // Internal XOR-based hash for O(1) inequality checks
    private _hash: number = 0;

    /**
     * Static comparator for Red-Black Tree ordering.
     * Handles primitives, RecursiveSets, and deep structural equality.
     */
    static compare(a: any, b: any): number {
        // 1. Identity optimization
        if (a === b) return 0;

        // 2. Type separation
        const isSetA = a instanceof RecursiveSet;
        const isSetB = b instanceof RecursiveSet;
        if (isSetA !== isSetB) return isSetA ? 1 : -1;

        // 3. Primitives
        if (!isSetA) {
            if (typeof a !== typeof b) return typeof a > typeof b ? 1 : -1;
            if (a < b) return -1;
            if (a > b) return 1;
            return 0;
        }

        // 4. Recursive Sets
        const sizeA = a.size;
        const sizeB = b.size;
        if (sizeA !== sizeB) return sizeA < sizeB ? -1 : 1;

        // Hash mismatch implies inequality (O(1))
        if (a._hash !== b._hash) return a._hash < b._hash ? -1 : 1;

        // Deep structural comparison using internal iterators (low-level optimization)
        let iterA = a._tree.begin;
        let iterB = b._tree.begin;

        while (iterA.valid && iterB.valid) {
            const cmp = RecursiveSet.compare(iterA.key, iterB.key);
            if (cmp !== 0) return cmp;

            iterA.next();
            iterB.next();
        }

        return 0;
    }

    constructor(...elements: Array<T | RecursiveSet<T>>) {
        this._tree = createTree(RecursiveSet.compare);
        
        for (const el of elements) {
            this.add(el);
        }
    }

    // === Copy-on-Write Support ===

    /**
     * Creates a shallow copy of the set in O(1) time.
     * Leveraging the persistent nature of the underlying tree.
     */
    clone(): RecursiveSet<T> {
        const clone = new RecursiveSet<T>();
        clone._tree = this._tree;
        clone._hash = this._hash;
        return clone;
    }

    // === Mutable Operations ===

    add(element: T | RecursiveSet<T>): this {
        if (typeof element === "number" && Number.isNaN(element)) {
            throw new Error("NaN is not supported as an element of RecursiveSet");
        }

        // Idempotency check prevents redundant hash updates and tree operations
        if (this.has(element)) {
            return this;
        }

        // Enforce Foundation Axiom (prevent cycles)
        if (element instanceof RecursiveSet) {
            if (this._wouldCreateCycle(element)) {
                throw new Error("Foundation axiom violated: membership cycle detected");
            }
        }

        // Update Hash (XOR)
        this._hash = (this._hash ^ this._computeHash(element)) | 0;

        // Insert into persistent tree
        this._tree = this._tree.insert(element, true);
        return this;
    }

    remove(element: T | RecursiveSet<T>): this {
        if (!this.has(element)) {
            return this;
        }

        // Update Hash (XOR removes the element from hash)
        this._hash = (this._hash ^ this._computeHash(element)) | 0;
        
        this._tree = this._tree.remove(element);
        return this;
    }

    clear(): this {
        this._tree = createTree(RecursiveSet.compare);
        this._hash = 0;
        return this;
    }

    private _computeHash(element: any): number {
        if (element instanceof RecursiveSet) return element._hash;
        if (typeof element === 'number') return element | 0;
        if (typeof element === 'string') {
            let h = 0;
            for (let i = 0; i < element.length; i++)
                h = Math.imul(31, h) + element.charCodeAt(i) | 0;
            return h;
        }
        return 0;
    }

    // === Immutable Operations ===

    union(other: RecursiveSet<T>): RecursiveSet<T> {
        const result = this.clone(); // Optimization: Start with clone of this
        for (const el of other) result.add(el);
        return result;
    }

    intersection(other: RecursiveSet<T>): RecursiveSet<T> {
        const result = new RecursiveSet<T>();
        // Iterate over smaller set for performance optimization
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
        // (A \ B) U (B \ A)
        return this.difference(other).union(other.difference(this));
    }

    powerset(): RecursiveSet<RecursiveSet<T>> {
        const n = this.size;
        if (n > 30) throw new Error("Powerset size exceeds 32-bit integer limit");

        const elements: Array<T | RecursiveSet<T>> = [];
        this._tree.forEach((key: any) => { elements.push(key); return undefined; });
        
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

    cartesianProduct<U>(other: RecursiveSet<U>): RecursiveSet<RecursiveSet<T | U>> {
        const pairs: RecursiveSet<T | U>[] = [];
        type TargetType = T | U | RecursiveSet<T | U>;

        for (const x of this) {
            for (const y of other) {
                const valX = x as TargetType;
                const valY = y as TargetType;

                // Kuratowski pair: (x, y) = {{x}, {x, y}}
                const pair = new RecursiveSet<T | U>(
                    new RecursiveSet<T | U>(valX),
                    new RecursiveSet<T | U>(valX, valY)
                );
                pairs.push(pair);
            }
        }
        return new RecursiveSet<RecursiveSet<T | U>>(...pairs);
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

    // === Internals ===

    private _wouldCreateCycle(element: RecursiveSet<T>): boolean {
        const visited = new Set<RecursiveSet<any>>();
        const stack = [element];
        
        while (stack.length > 0) {
            const current = stack.pop()!;
            if (current === this) return true;
            
            if (visited.has(current)) continue;
            visited.add(current);
            
            // Optimization: Direct internal tree traversal avoids iterator overhead
            current._tree.forEach((key: any) => {
                if (key instanceof RecursiveSet) {
                    stack.push(key);
                }
                return undefined;
            });
        }
        return false;
    }

    // === Utility ===

    get size(): number {
        return this._tree.length;
    }

    toSet(): Set<T | RecursiveSet<T>> {
        const result = new Set<T | RecursiveSet<T>>();
        this._tree.forEach((key: any) => { result.add(key); return undefined; });
        return result;
    }

    // Lazy Iterator (Critical for performance)
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
        this._tree.forEach((key: any) => {
            if (key instanceof RecursiveSet) {
                elements.push(key.toString());
            } else {
                elements.push(String(key));
            }
            return undefined;
        });
        return `{${elements.join(", ")}}`;
    }

    [Symbol.for('nodejs.util.inspect.custom')](): string {
        return this.toString();
    }
}

// === Helpers ===

export function emptySet<T = any>(): RecursiveSet<T> {
    return new RecursiveSet<T>();
}

export function singleton<T>(element: T): RecursiveSet<T> {
    return new RecursiveSet<T>(element);
}

export function fromIterable<T>(iterable: Iterable<T>): RecursiveSet<T> {
    return new RecursiveSet<T>(...iterable);
}