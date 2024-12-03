/**
 * @param {string} txt 
 */
export function parse(txt) {
    const lines = txt.split(/\r?\n/);
    /** @type {Map<DepData,Set<DepData>>} */
    const deps = new Map();
    /** @type {Set<DepData>} */
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
    return deps;
}

/** @type {Map<string,DepData>} */
const objMap = new Map();

/**
 * @param {string} path 
 * @returns {DepData}
 */
function getData(path) {
    let obj = objMap.get(path);
    if (obj) return obj;
    obj = {
        path,
        label: parseLabel(path),
    };
    objMap.set(path, obj);
    return obj;
}

// TODO make these regexes configurable.
const labelRegexes = [
    /.+haxe[\\\/].+[\\\/]std[\\\/](.+).hx$/,
    /.+src[\\\/](.+).hx$/
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
}

/**
 * @typedef {Object} DepData
 * @property {string} path
 * @property {string} label
 * @property {number} size
 */
