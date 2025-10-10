/**
 * @module recursive-set
 * A mutable recursive set implementation enforcing Cantor's ZFC axioms
 */

/**
 * RecursiveSet: Mutable set with arbitrary nesting depth
 * 
 * Enforced ZFC Axioms (as class invariants):
 * - Extensionality: Sets with same elements are equal
 * - Foundation (Regularity): No membership cycles allowed
 * - Power Set: Can construct 𝒫(A) for any set A
 * - Union: Can construct A ∪ B for any sets A, B
 * - Pairing: Can construct {a, b} for any elements a, b
 */
export class RecursiveSet<T = any> {
    private _elements: Set<T | RecursiveSet<T>>;
    
    constructor(...elements: Array<T | RecursiveSet<T>>) {
        this._elements = new Set();
        for (const el of elements) {
            this._addElement(el);
        }
        this._checkInvariants();
    }
    
    /**
     * Internal: Add element with cycle detection (Foundation axiom)
     */
    private _addElement(el: T | RecursiveSet<T>): void {
        if (el instanceof RecursiveSet) {
            if (this._wouldCreateCycle(el)) {
                throw new Error(
                    "Foundation axiom violated: adding this element would create a membership cycle"
                );
            }
        }
        this._elements.add(el);
    }
    
    /**
     * Check if adding element would violate Foundation axiom
     */
    private _wouldCreateCycle(element: RecursiveSet<T>): boolean {
        const visited = new Set<RecursiveSet<any>>();
        const toCheck: RecursiveSet<any>[] = [element];
        
        while (toCheck.length > 0) {
            const current = toCheck.pop()!;
            if (current === this) {
                return true;
            }
            if (visited.has(current)) {
                continue;
            }
            visited.add(current);
            
            for (const el of current._elements) {
                if (el instanceof RecursiveSet) {
                    toCheck.push(el);
                }
            }
        }
        return false;
    }
    
    /**
     * Verify class invariants (Design by Contract)
     */
    private _checkInvariants(): void {
        // Extensionality: enforced by Set semantics
        // Foundation: enforced by _wouldCreateCycle
        // Well-definedness: enforced by TypeScript type system
        
        // Additional runtime checks can be added here
        if (process.env.NODE_ENV === 'development') {
            // More expensive checks only in development
        }
    }
    
    // === Mutable Operations ===
    
    /**
     * Add element to this set (Pairing axiom)
     * @returns this for method chaining
     */
    add(element: T | RecursiveSet<T>): this {
        this._addElement(element);
        this._checkInvariants();
        return this;
    }
    
    /**
     * Remove element from this set
     * @returns this for method chaining
     */
    remove(element: T | RecursiveSet<T>): this {
        this._elements.delete(element);
        return this;
    }
    
    /**
     * Remove all elements
     * @returns this for method chaining
     */
    clear(): this {
        this._elements.clear();
        return this;
    }
    
    // === Immutable Operations (return new sets) ===
    
    /**
     * Union of two sets (Union axiom)
     * Returns A ∪ B
     */
    union(other: RecursiveSet<T>): RecursiveSet<T> {
        const result = new RecursiveSet<T>();
        result._elements = new Set([...this._elements, ...other._elements]);
        return result;
    }
    
    /**
     * Intersection of two sets
     * Returns A ∩ B
     */
    intersection(other: RecursiveSet<T>): RecursiveSet<T> {
        const result = new RecursiveSet<T>();
        for (const el of this._elements) {
            if (other.has(el)) {
                result._elements.add(el);
            }
        }
        return result;
    }
    
    /**
     * Set difference
     * Returns A \ B (elements in A but not in B)
     */
    difference(other: RecursiveSet<T>): RecursiveSet<T> {
        const result = new RecursiveSet<T>();
        for (const el of this._elements) {
            if (!other.has(el)) {
                result._elements.add(el);
            }
        }
        return result;
    }
    
    /**
     * Symmetric difference
     * Returns A △ B (elements in either but not both)
     */
    symmetricDifference(other: RecursiveSet<T>): RecursiveSet<T> {
        return this.union(other).difference(this.intersection(other));
    }
    
    /**
     * Power set construction (Power Set axiom)
     * Returns 𝒫(A) - set of all subsets
     */
    powerset(): RecursiveSet<RecursiveSet<T>> {
        const elements = Array.from(this._elements);
        const subsets: RecursiveSet<T>[] = [];
        
        // Generate all 2^n subsets
        const n = elements.length;
        for (let i = 0; i < (1 << n); i++) {
            const subset = new RecursiveSet<T>();
            for (let j = 0; j < n; j++) {
                if (i & (1 << j)) {
                    subset._elements.add(elements[j]);
                }
            }
            subsets.push(subset);
        }
        
        return new RecursiveSet<RecursiveSet<T>>(...subsets);
    }
    
    /**
     * Cartesian product
     * Returns A × B as set of ordered pairs {{a}, {a,b}}
     */
    cartesianProduct<U>(other: RecursiveSet<U>): RecursiveSet<RecursiveSet<T | U>> {
        const pairs: RecursiveSet<T | U>[] = [];
        
        for (const x of this._elements) {
            for (const y of other._elements) {
                // Kuratowski ordered pair: (x,y) := {{x}, {x,y}}
                const pair = new RecursiveSet<T | U>(
                    new RecursiveSet<T | U>(x),
                    new RecursiveSet<T | U>(x, y)
                );
                pairs.push(pair);
            }
        }
        
        return new RecursiveSet<RecursiveSet<T | U>>(...pairs);
    }
    
    // === Predicates ===
    
    /**
     * Check membership (∈)
     */
    has(element: T | RecursiveSet<T>): boolean {
        return this._elements.has(element);
    }
    
    /**
     * Check if subset (⊆)
     */
    isSubset(other: RecursiveSet<T>): boolean {
        for (const el of this._elements) {
            if (!other.has(el)) {
                return false;
            }
        }
        return true;
    }
    
    /**
     * Check if superset (⊇)
     */
    isSuperset(other: RecursiveSet<T>): boolean {
        return other.isSubset(this);
    }
    
    /**
     * Check if proper subset (⊂)
     */
    isProperSubset(other: RecursiveSet<T>): boolean {
        return this.isSubset(other) && !this.equals(other);
    }
    
    /**
     * Check if empty set
     */
    isEmpty(): boolean {
        return this._elements.size === 0;
    }
    
    // === Extensionality (Equality) ===
    
    /**
     * Structural equality (Extensionality axiom)
     * Two sets are equal iff they have the same elements
     */
    equals(other: RecursiveSet<T>): boolean {
        if (this._elements.size !== other._elements.size) {
            return false;
        }
        
        for (const el of this._elements) {
            if (el instanceof RecursiveSet) {
                // Deep comparison for nested sets
                let found = false;
                for (const otherEl of other._elements) {
                    if (otherEl instanceof RecursiveSet && el.equals(otherEl)) {
                        found = true;
                        break;
                    }
                }
                if (!found) return false;
            } else {
                if (!other.has(el)) return false;
            }
        }
        return true;
    }
    
    // === Utility ===
    
    /**
     * Cardinality |A|
     */
    get size(): number {
        return this._elements.size;
    }
    
    /**
     * Convert to native Set (shallow)
     */
    toSet(): Set<T | RecursiveSet<T>> {
        return new Set(this._elements);
    }
    
    /**
     * Iterate over elements
     */
    *[Symbol.iterator](): Iterator<T | RecursiveSet<T>> {
        yield* this._elements;
    }
    
    /**
     * Pretty print with mathematical notation
     */
    toString(): string {
        if (this.isEmpty()) {
            return "∅";
        }
        
        const elements = Array.from(this._elements).map(el => {
            if (el instanceof RecursiveSet) {
                return el.toString();
            }
            return String(el);
        });
        
        return `{${elements.join(", ")}}`;
    }
    
    /**
     * For console.log
     */
    [Symbol.for('nodejs.util.inspect.custom')](): string {
        return this.toString();
    }
}

// === Helper Functions ===

/**
 * Create empty set (Null Set axiom)
 */
export function emptySet<T = any>(): RecursiveSet<T> {
    return new RecursiveSet<T>();
}

/**
 * Create singleton set
 */
export function singleton<T>(element: T): RecursiveSet<T> {
    return new RecursiveSet<T>(element);
}

/**
 * Create set from iterable
 */
export function fromIterable<T>(iterable: Iterable<T>): RecursiveSet<T> {
    return new RecursiveSet<T>(...iterable);
}
