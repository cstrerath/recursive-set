declare module 'functional-red-black-tree' {
    export interface Iterator<K, V> {
        key: K;
        value: V;
        node: unknown;
        tree: Tree<K, V>;
        index: number;
        valid: boolean;
        next(): void;
        prev(): void;
        remove(): Tree<K, V>;
        update(value: V): Tree<K, V>;
    }

    export interface Tree<K, V> {
        root: unknown;
        length: number;
        begin: Iterator<K, V>;
        end: Iterator<K, V>;
        
        insert(key: K, value: V): Tree<K, V>;
        remove(key: K): Tree<K, V>;
        get(key: K): V | undefined;
        
        forEach(visitor: (key: K, value: V) => void): void;
        
        // Internal iterators (used in compare)
        ge(key: K): Iterator<K, V>;
        gt(key: K): Iterator<K, V>;
        lt(key: K): Iterator<K, V>;
        le(key: K): Iterator<K, V>;
        at(index: number): Iterator<K, V>;
        find(key: K): Iterator<K, V>;
    }

    export default function createTree<K, V>(compare?: (a: K, b: K) => number): Tree<K, V>;
}
