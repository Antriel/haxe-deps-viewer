/**
 * @param {string} txt 
 */
export function parse(txt) {
    const lines = txt.split(/\r?\n/);
    /** @type {Map<DepData,Set<DepData>>} */
    const deps = new Map();
    /** @type {Set<DepData>} */
    /** @type {Map<string,DepData>} */
    const objMap = new Map();
    /**
     * @param {string} path 
     * @returns {DepData}
     */
    function getData(path) {
        path = path.replaceAll('\\', '/'); // Normalize...
        let obj = objMap.get(path);
        if (obj) return obj;
        obj = { path };
        objMap.set(path, obj);
        deps.set(obj, new Set());
        return obj;
    }
    let cur;
    for (const l of lines) if (l.length > 0) {
        if (l.charAt(0) !== '	') {
            const obj = getData(l.substring(0, l.length - 1));
            cur = deps.get(obj);
        } else {
            cur.add(getData(l.substring(1)));
        }
    }
    return deps;
}

/**
 * @typedef {Object} DepData
 * @property {string} path
 * @property {string} label
 */
