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
        obj = {
            path,
            label: parseLabel(path),
        };
        objMap.set(path, obj);
        return obj;
    }
    let cur;
    for (const l of lines) if (l.length > 0) {
        if (l.charAt(0) !== '	') {
            const obj = getData(l.substring(0, l.length - 1));
            cur = deps.get(obj);
            if (cur === undefined) {
                cur = new Set();
                deps.set(obj, cur);
            }
        } else {
            cur.add(getData(l.substring(1)));
        }
    }
    for (const [dep, ch] of deps) dep.size = ch.size;
    let prefix = null;
    for (const dep of objMap.values()) {
        if (dep.label) continue;
        if (prefix === null) prefix = dep.path;
        else while (!dep.path.startsWith(prefix)) {
            const parts = prefix.split(/[\\\/]/);
            parts.pop();
            prefix = parts.join('/');
            if (prefix === "") break;
        }
        if (prefix === "") break;
    }
    if (prefix !== "") for (const dep of objMap.values()) {
        if (dep.label) continue;
        dep.label = dep.path.substring(prefix.length);
    }
    return deps;
}

// TODO make these regexes configurable.
const labelRegexes = [
    /.+haxe[\\\/].+[\\\/]std[\\\/](.+).hx$/,
    /.+src[\\\/](.+).hx$/,
    /.+haxe_libraries\/.+\/.+\/haxelib\/(.+).hx$/,
]
/**
 * @param {string} path
 * @returns {string}
 */
function parseLabel(path) {
    for (const r of labelRegexes) {
        const matches = r.exec(path);
        if (matches) return matches.at(1);
    }
    if (path.indexOf('/') == -1) return path;
}

/**
 * @typedef {Object} DepData
 * @property {string} path
 * @property {string} label
 * @property {number} size
 */
