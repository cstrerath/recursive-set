import createTree from 'functional-red-black-tree';

/**
 * @module recursive-set
 * A mutable recursive set implementation enforcing Cantor's ZFC axioms
 * Powered by Red-Black Trees for O(log n) operations
 */

/**
 * Comparator function for ZFC sets
 * Returns -1 if a < b, 1 if a > b, 0 if a == b (structural equality)
 */
function compare(a: any, b: any): number {
    // 1. Identity optimization
    if (a === b) return 0;

    // 2. Type separation: Sets are "greater" than primitives
    const isSetA = a instanceof RecursiveSet;
    const isSetB = b instanceof RecursiveSet;
    if (isSetA !== isSetB) return isSetA ? 1 : -1;

    // 3. Primitives
    if (!isSetA) {
        if (typeof a !== typeof b) {
            return typeof a > typeof b ? 1 : -1;
        }
        if (a < b) return -1;
        if (a > b) return 1;
        return 0;
    }

    // 4. Recursive Sets
    const sizeA = a.size;
    const sizeB = b.size;
    if (sizeA !== sizeB) return sizeA < sizeB ? -1 : 1;

    // Lexicographical comparison
    const itA = a[Symbol.iterator]();
    const itB = b[Symbol.iterator]();
    
    let nextA = itA.next();
    let nextB = itB.next();
    
    while (!nextA.done) {
        const cmp = compare(nextA.value, nextB.value);
        if (cmp !== 0) return cmp;
        nextA = itA.next();
        nextB = itB.next();
    }
    
    return 0;
}

export class RecursiveSet<T = any> {
    // Red-Black Tree (immutable structure, we replace on mutation)
    private _tree: any; // Type from functional-red-black-tree

    constructor(...elements: Array<T | RecursiveSet<T>>) {
        this._tree = createTree(compare);
        
        for (const el of elements) {
            this.add(el);
        }
    }

    // === Copy-on-Write Support ===

    /**
     * Creates a shallow copy of the set in O(1) time.
     * Due to the immutable nature of the underlying tree, 
     * this is extremely efficient (structural sharing).
     */
    clone(): RecursiveSet<T> {
        const clone = new RecursiveSet<T>();
        // We replace the empty tree directly with the reference to the current tree.
        // Since the tree is persistent/immutable, this is safe and instant.
        clone._tree = this._tree;
        return clone;
    }


    // === Mutable Operations ===

    add(element: T | RecursiveSet<T>): this {
        // 0. Guard: Explicitly ban NaN
        if (typeof element === "number" && Number.isNaN(element)) {
            throw new Error("NaN is not supported as an element of RecursiveSet");
        }

        // 1. Defensive: Idempotency Check
        // Avoid duplicate inserts if the element is already present.
        // This also mitigates race-condition-like issues with persistent tree structures during rapid mutations.
        if (this.has(element)) {
            return this;
        }

        // 2. Cycle Check (Foundation Axiom)
        if (element instanceof RecursiveSet) {
            if (this._wouldCreateCycle(element)) {
                throw new Error("Foundation axiom violated: membership cycle detected");
            }
        }

        // 3. Insert
        this._tree = this._tree.insert(element, true);
        return this;
    }

    remove(element: T | RecursiveSet<T>): this {
        this._tree = this._tree.remove(element);
        return this;
    }

    clear(): this {
        this._tree = createTree(compare);
        return this;
    }

    // === Immutable Operations ===

    union(other: RecursiveSet<T>): RecursiveSet<T> {
        const result = new RecursiveSet<T>();
        for (const el of this) result.add(el);
        for (const el of other) result.add(el);
        return result;
    }

    intersection(other: RecursiveSet<T>): RecursiveSet<T> {
        const result = new RecursiveSet<T>();
        for (const el of this) {
            if (other.has(el)) {
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
        return this.union(other).difference(this.intersection(other));
    }

    powerset(): RecursiveSet<RecursiveSet<T>> {
        const elements: Array<T | RecursiveSet<T>> = [];
        this._tree.forEach((key: any) => { elements.push(key); return undefined; });
        
        const subsets: RecursiveSet<T>[] = [];
        const n = elements.length;
        
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
        return compare(this, other) === 0;
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
            
            for (const child of current) {
                if (child instanceof RecursiveSet) {
                    stack.push(child);
                }
            }
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

    *[Symbol.iterator](): Iterator<T | RecursiveSet<T>> {
        const keys: Array<T | RecursiveSet<T>> = [];
        this._tree.forEach((key: any) => { keys.push(key); return undefined; });
        yield* keys;
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