class LinkedListNode<T> {
    prev: LinkedListNode<T> | null;
    next: LinkedListNode<T> | null;
    value: T;

    constructor(value: T) {
        this.prev = null;
        this.next = null;
        this.value = value;
    }
}

export class LinkedList<T> {
    head: LinkedListNode<T> | null;

    constructor() {
        this.head = null;
    }

    public insert(value: T) {
        const newNode = new LinkedListNode(value);
        newNode.next = this.head;
        this.head = newNode;
        return newNode;
    }

    public remove(node: LinkedListNode<T>) {
        if(node.next) {
            node.next.prev = node.prev;
        }
        if(node.prev) {
            node.prev.next = node.next;
        }
        if(this.head === node) {
            this.head = node.next;
        }
        node.prev = null;
        node.next = null;
    }

    [Symbol.iterator](): Iterator<T> {
        let current = this.head;

        return {
            next(): IteratorResult<T> {
                if (current) {
                    const value = current.value;
                    current = current.next;
                    return { value, done: false };
                }
                return { value: undefined, done: true };
            }
        };
    }
}

export type {
    LinkedListNode
}