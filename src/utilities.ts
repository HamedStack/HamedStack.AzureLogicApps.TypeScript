export function groupBy<K, V>(
    items: Array<V>,
    selector: (input: V) => K
): Map<K, Array<V>> {
    const map = new Map<K, Array<V>>();
    items.forEach((item) => {
        const key = selector(item);
        const collection = map.get(key);
        if (!collection) {
            map.set(key, [item]);
        } else {
            collection.push(item);
        }
    });
    return map;
}