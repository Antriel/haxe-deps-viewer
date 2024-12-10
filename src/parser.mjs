/**
 * @param {string} txt 
 */
export function parse(txt, isDependants = false) {
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
        let isMacro = false;
        if (path.startsWith('[macro] ')) {
            isMacro = true;
            path = path.substring('[macro] '.length);
        }
        let obj = objMap.get(path);
        if (obj) return obj;
        obj = { path, isMacro };
        objMap.set(path, obj);
        deps.set(obj, new Set());
        return obj;
    }
    let cur;
    for (const l of lines) if (l.length > 0) {
        if (l.charAt(0) !== '	') {
            cur = getData(l.substring(0, l.length - 1));
        } else {
            const sub = getData(l.substring(1));
            if (isDependants) { // `sub` is owner, `cur` is dependency.
                deps.get(sub).add(cur);
            } else { // `cur` is owner, `sub` is dependency.
                deps.get(cur).add(sub);
            }
        }
    }
    return deps;
}

/**
 * @typedef {Object} DepData
 * @property {string} path
 * @property {boolean} isMacro
 * @property {string} label
 */
