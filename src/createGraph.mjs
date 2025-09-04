import Graph from "graphology";
import circular from 'graphology-layout/circular';
import circlepack from 'graphology-layout/circlepack';
import forceAtlas2 from "graphology-layout-forceatlas2";
import FA2Layout from 'graphology-layout-forceatlas2/worker';
import randomColor from "randomcolor";

let layout;
let abort;
let idCounter = 0;
let lastLayoutInit;
const nodeIds = new Map();
const nodeAtts = new Map();
const edgeAtts = new Map();

const importReg = /.+\/import.hx$/;

const labelStd = /.+haxe[0-9a-f_]*(?:\/.+)?\/std\/(.+).hx$/;
const labelSrc = /.+src\/(.+).hx$/;
const labelHaxelib = [
    /.+haxe_libraries\/.+\/.+\/haxelib\/(.+).hx$/,
    /.+haxe_modules\/.+\/(.+).hx$/,
    /.+haxelib_system\/(.+).hx$/,
];

/**
 * @typedef {Object} GraphConfig
 * @property {boolean} visualDependencies
 * @property {'dependencies'|'dependenciesRec'|'dependants'|'dependantsRec'} visualSize
 * @property {number} visualSizeMin
 * @property {number} visualSizeMax
 * @property {boolean} visualAllPaths
 * @property {boolean} visualCycles
 * @property {number} visualLabelsDensity
 * @property {boolean} layoutEnable
 * @property {'bubble'|'circle'|'topdown'} layoutInit
 * @property {boolean} layoutForces
 * @property {boolean} layoutForcesRelative
 * @property {number} layoutPackageForces
 * @property {number} layoutForcePower
 * @property {number} layoutForceSlowdown
 * @property {boolean} hideStd
 * @property {boolean} hideImport
 * @property {{reg:string,enabled:boolean}[]} hideCustom
 * @property {number} hideMinDeps
 * @property {number} hideMinDependants
 * @property {boolean} showOnlyCircular
 * @property {boolean} smartLabelsStd
 * @property {boolean} smartLabelsSrc
 * @property {boolean} smartLabelsHaxelib
 * @property {boolean} smartLabelsPrefix
 * @property {boolean} smartLabelsShowMacro
 * @property {{reg:string,enabled:boolean}[]} smartLabelsCustom
 * 
 */

/**
 * Detects cycles in the dependency map using DFS
 * @param {Map<import('./parser.mjs').DepData, Set<import('./parser.mjs').DepData>>} deps
 * @returns {Set<import('./parser.mjs').DepData>} Set of nodes that are part of cycles
 */
function detectCycles(deps) {
    const WHITE = 0; // Unvisited
    const GRAY = 1;  // Visiting (in current path)
    const BLACK = 2; // Visited (completely processed)
    
    const colors = new Map();
    const cycleNodes = new Set();
    
    // Initialize all nodes as WHITE
    for (const [node, children] of deps) {
        colors.set(node, WHITE);
        for (const child of children) {
            if (!colors.has(child)) colors.set(child, WHITE);
        }
    }
    
    function dfs(node, path = []) {
        if (colors.get(node) === GRAY) {
            // Found a cycle - mark all nodes in the cycle path
            const cycleStartIndex = path.indexOf(node);
            for (let i = cycleStartIndex; i < path.length; i++) {
                cycleNodes.add(path[i]);
            }
            cycleNodes.add(node);
            return true;
        }
        
        if (colors.get(node) === BLACK) {
            return false; // Already processed
        }
        
        colors.set(node, GRAY);
        path.push(node);
        
        const children = deps.get(node);
        if (children) {
            for (const child of children) {
                if (dfs(child, path)) {
                    cycleNodes.add(node); // This node is also part of cycle path
                }
            }
        }
        
        path.pop();
        colors.set(node, BLACK);
        return false;
    }
    
    // Run DFS from each unvisited node
    for (const node of colors.keys()) {
        if (colors.get(node) === WHITE) {
            dfs(node);
        }
    }
    
    return cycleNodes;
}

/**
 * @param {Map<import('./parser.mjs').DepData, Set<import('./parser.mjs').DepData>>} deps
 * @param {GraphConfig} config
 */
export default function createGraph(deps, config) {
    // Set labels.
    const activeLabelRegs = config.smartLabelsCustom.filter(c => c.enabled)
        .map(c => {
            try { return new RegExp(c.reg); } catch (e) { return null; }
        });
    if (config.smartLabelsStd) activeLabelRegs.push(labelStd);
    if (config.smartLabelsSrc) activeLabelRegs.push(labelSrc);
    if (config.smartLabelsHaxelib) activeLabelRegs.push(...labelHaxelib);

    for (const d of deps.keys()) d.label = null; // Reset label in case config changed.
    function parseLabel(path) {
        for (const r of activeLabelRegs) if (r) {
            const matches = r.exec(path);
            if (matches && matches.at(1)?.length > 0) return matches.at(1);
        }
        if (path.indexOf('/') == -1) return path;
    }
    // Find most common prefix across all, and remove it, for unlabeled deps.
    let prefix = null;
    for (const dep of deps.keys()) {
        dep.label = parseLabel(dep.path);
        if (dep.label) continue;
        if (prefix === null) prefix = dep.path;
        else while (!dep.path.startsWith(prefix)) {
            const parts = prefix.match(/[^\/]+\/?|\//g); // Split by, but keep `/`.
            parts.pop();
            prefix = parts.join('');
            if (prefix === "") break;
        }
        if (prefix === "") break;
    }
    if (prefix !== "" && config.smartLabelsPrefix) for (const dep of deps.keys()) {
        if (dep.label) continue;
        dep.label = dep.path.substring(prefix.length);
        // Remove `.hx`.
        if (dep.label.endsWith('.hx')) dep.label = dep.label.substring(0, dep.label.length - 3);
    } else for (const dep of deps.keys()) dep.label ??= dep.path;
    // Init colors.
    const packToColors = { sub: new Map() };
    function getColorData(pack) {
        let colors = packToColors;
        for (const step of pack) {
            if (!colors.sub.has(step)) colors.sub.set(step, {
                sub: new Map(),
                nodes: [],
                color: 0,
            });
            colors = colors.sub.get(step);
        }
        return colors;
    }
    for (const node of deps.keys()) {
        const pack = node.label.split('/');
        pack.pop();
        // Consider no package as package, so colors are spread over.
        if (pack.length === 0) pack.push('');
        getColorData(pack).nodes.push(node);
    }

    const customRemoves = config.hideCustom.filter(c => c.enabled)
        .map(c => {
            try { return new RegExp(c.reg); } catch (e) { return null; }
        });

    function shouldRemove(/** @type{import("./parser.mjs").DepData} */ data) {
        let rem = false;
        if (config.hideStd) rem = rem || labelStd.test(data.path);
        if (config.hideImport) rem = rem || importReg.test(data.path);
        rem = rem || customRemoves.some(r => r?.test(data.path));

        return rem;
    }
    for (const [root, children] of deps.entries()) {
        if (shouldRemove(root)) deps.delete(root);
        else for (const ch of children) if (shouldRemove(ch)) children.delete(ch);
    }

    // Filter to show only circular dependencies if enabled
    if (config.showOnlyCircular) {
        const cycleNodes = detectCycles(deps);
        const nodesToRemove = [];
        
        // Collect nodes that are not part of any cycle
        for (const [root, children] of deps.entries()) {
            if (!cycleNodes.has(root)) {
                nodesToRemove.push(root);
            }
        }
        
        // Remove non-cycle nodes from deps map
        for (const node of nodesToRemove) {
            deps.delete(node);
        }
        
        // Also remove non-cycle children from remaining nodes
        for (const [root, children] of deps.entries()) {
            for (const child of children) {
                if (!cycleNodes.has(child)) {
                    children.delete(child);
                }
            }
        }
    }

    // Filter nodes based on minimum dependency/dependant count (before building graph)
    if (config.hideMinDeps > -1 || config.hideMinDependants > -1) {
        const allNodes = new Set();
        for (const [root, children] of deps.entries()) {
            allNodes.add(root);
            for (const child of children) allNodes.add(child);
        }

        // Efficient recursive dependency calculation with memoization
        const cache = new Map();
        
        const getAllReachable = (startNode, direction) => {
            const cacheKey = `${startNode.path}_${direction}`;
            if (cache.has(cacheKey)) return cache.get(cacheKey);
            
            const result = new Set();
            const toVisit = [startNode];
            const visited = new Set([startNode]); // Start node doesn't count as reachable from itself
            
            while (toVisit.length > 0) {
                const current = toVisit.shift();
                
                if (direction === 'deps') {
                    // Forward: find dependencies (children)
                    const children = deps.get(current);
                    if (children) {
                        for (const child of children) {
                            if (!visited.has(child)) {
                                visited.add(child);
                                result.add(child);
                                toVisit.push(child);
                            }
                        }
                    }
                } else {
                    // Backward: find dependants (parents)
                    for (const [root, children] of deps.entries()) {
                        if (children.has(current) && !visited.has(root)) {
                            visited.add(root);
                            result.add(root);
                            toVisit.push(root);
                        }
                    }
                }
            }
            
            cache.set(cacheKey, result);
            return result;
        };

        const nodesToRemove = [];
        for (const node of allNodes) {
            let shouldRemove = false;
            
            if (config.hideMinDeps > -1) {
                const totalDeps = getAllReachable(node, 'deps').size;
                if (totalDeps <= config.hideMinDeps) {
                    shouldRemove = true;
                }
            }
            
            if (config.hideMinDependants > -1 && !shouldRemove) {
                const totalDependants = getAllReachable(node, 'dependants').size;
                if (totalDependants <= config.hideMinDependants) {
                    shouldRemove = true;
                }
            }
            
            if (shouldRemove) {
                nodesToRemove.push(node);
            }
        }

        // Remove filtered nodes from deps map
        for (const node of nodesToRemove) {
            for (const [root, children] of deps.entries()) {
                if (root === node) {
                    deps.delete(root);
                } else {
                    children.delete(node);
                }
            }
        }
    }

    const graph = new Graph({ /* multi: true */ });
    const posGraph = new Graph({ multi: true });
    graph.setAttribute('posGraph', posGraph);

    function add(node) {
        if (!graph.hasNode(node.path)) {
            if (!nodeIds.has(node.path)) nodeIds.set(node.path, ++idCounter);
            if (!nodeAtts.has(node.path)) nodeAtts.set(node.path, {});
            const atts = nodeAtts.get(node.path);
            atts.label = node.label;
            if (config.smartLabelsShowMacro && node.isMacro)
                atts.label = '[macro] ' + atts.label;
            atts.degree = -1;
            graph.addNode(node.path, atts);
            posGraph.addNode(node.path, atts);
        }
    }
    let maxDeps = 0;
    for (const set of deps.values()) maxDeps = Math.max(set.size, maxDeps);
    for (const [key, children] of deps) {
        add(key);
        for (const child of children) {
            add(child);
            const from = config.visualDependencies ? key : child;
            const to = config.visualDependencies ? child : key;
            const edgeKey = nodeIds.get(from.path) + '_' + nodeIds.get(to.path);
            if (!edgeAtts.has(edgeKey)) edgeAtts.set(edgeKey, { type: 'arrow' });
            const atts = edgeAtts.get(edgeKey)
            atts.weight = config.layoutForces ? 100 : 0;
            if (config.layoutForcesRelative)
                atts.weight *= ((deps.get(to)?.size ?? 0) + 1) / (maxDeps + 1);

            graph.addDirectedEdgeWithKey(edgeKey, from.path, to.path, atts);
            posGraph.addDirectedEdgeWithKey(edgeKey, from.path, to.path, atts);
        }
    }

    const outbound = !(config.visualSize.startsWith('dependencies') != config.visualDependencies);
    for (const { node, attributes } of graph.nodeEntries())
        attributes.directDegree = outbound ? graph.outDegree(node) : graph.inDegree(node);
    const recursiveDegree = config.visualSize.endsWith('Rec');
    function getDegree(node) {
        const atts = graph.getNodeAttributes(node);
        if (!recursiveDegree) return atts.directDegree;
        if (atts.degree >= 0) return atts.degree;
        const visited = new Set();
        let total = 0;
        function add(node) {
            visited.add(node);
            total += graph.getNodeAttribute(node, 'directDegree');
            for (const neigh of (outbound ? graph.outNeighbors(node) : graph.inNeighbors(node))) {
                if (!visited.has(neigh)) add(neigh);
            }
        }
        add(node);
        return total;
    }
    for (const { node, attributes } of graph.nodeEntries()) attributes.degree = getDegree(node);
    
    const maxDegree = graph.reduceNodes((max, _, atts) => Math.max(max, atts.degree), 0);
    const minRadius = Math.min(config.visualSizeMin, config.visualSizeMax);
    const maxRadius = Math.max(config.visualSizeMin, config.visualSizeMax);
    for (const { attributes } of graph.nodeEntries())
        attributes.size = minRadius + (attributes.degree / maxDegree) * (maxRadius - minRadius);
    graph.setAttribute('maxDegree', maxDegree);
    graph.setAttribute('minRadius', minRadius);
    graph.setAttribute('maxRadius', maxRadius);

    // Add edges between types within the same pack, for better position grouping.
    const packToNodes = new Map();
    let maxPackCount = 0;
    for (const node of deps.keys()) {
        const pack = node.label.split('/');
        pack.pop();
        maxPackCount = Math.max(maxPackCount, pack.length);
        const atts = graph.getNodeAttributes(node.path);
        for (let i = 0; i < pack.length; i++) atts['pack' + i] = pack[i];
        node.packs = pack.slice();
        while (pack.length) {
            const packStr = pack.join('/');
            if (!packToNodes.has(packStr)) packToNodes.set(packStr, []);
            packToNodes.get(packStr).push(node);
            pack.pop();
        }
    }
    graph.setAttribute('maxPackCount', maxPackCount);
    function setColors(color) {
        for (const node of color.nodes) {
            if (graph.hasNode(node.path))
                graph.setNodeAttribute(node.path, 'color', color.color);
        }
        if (color.nodes.length == 0 && color.sub.size <= 1) {
            // Propagate the same color if this pack has nothing but single pack.
            for (const sub of color.sub.values()) {
                sub.color = color.color;
                setColors(sub);
            }
        } else {
            const colors = randomColor({
                hue: color.color,
                count: packToColors.sub.size,
                seed: 'consistencyplsthx',
            });
            for (const sub of color.sub.values()) {
                sub.color = colors.pop();
                setColors(sub);
            }
        }
    }
    // Main colors.
    const colors = randomColor({
        luminosity: 'dark',
        count: packToColors.sub.size,
        seed: 'consistencyplsthx',
    });
    for (const sub of packToColors.sub.values()) {
        sub.color = colors.pop();
        setColors(sub);
    }

    const edges = [];
    if (config.layoutPackageForces > 0) for (const arr of packToNodes.values()) {
        const weight = config.layoutPackageForces;
        for (let i = 0; i < arr.length - 1; i++) {
            // Limit to max 150 per node, otherwise we can crash on big datasets.
            for (let j = i; j < Math.min(arr.length - 1, 150 + i); j++) {
                edges.push(posGraph.addUndirectedEdge(arr[i].path, arr[j + 1].path, { weight }));
            }
        }
    }
    // // Drop pack edges.
    // for (const edge of edges) graph.dropEdge(edge);

    setGraphPositions(graph, config, lastLayoutInit != config.layoutInit);
    return graph;
}

export function setGraphPositions(graph, config, reset = false) {
    lastLayoutInit = config.layoutInit;
    const { maxDegree, minRadius, maxRadius, maxPackCount, posGraph } = graph.getAttributes();
    let pos;
    if (config.layoutInit === 'bubble') pos = circlepack(graph, {
        hierarchyAttributes: new Array(maxPackCount).fill(null).map((_, i) => 'pack' + i),
    });
    else if (config.layoutInit === 'circle') pos = circular(graph);
    for (const { attributes, node } of graph.nodeEntries()) {
        attributes.size = minRadius + (attributes.degree / maxDegree) * (maxRadius - minRadius);
        if (reset || (typeof attributes.y === 'undefined')) {
            const { x, y } = pos?.[node] ?? { x: 10, y: attributes.size * 60 };
            attributes.x = x;
            attributes.y = y;
            attributes.prevX = attributes.x
            attributes.prevY = attributes.y;
        }
    }

    const settings = forceAtlas2.inferSettings(posGraph);
    // settings.adjustSizes = true;
    // settings.barnesHutOptimize = true;
    settings.outboundAttractionDistribution = true;
    settings.edgeWeightInfluence = config.layoutForcePower;
    settings.slowDown = config.layoutForceSlowdown;
    settings.gravity = 0.15;
    // forceAtlas2.assign(graph, { settings, iterations: 1000 });
    if (layout) {
        abort.abort();
        layout.kill()
    }
    layout = new FA2Layout(posGraph, { settings, backgroundIterations: 10 });
    abort = new AbortController();
    // Hack to listen on changes.
    layout.worker.addEventListener('message', () => {
        let isIdle = true;
        if (layout.isRunning()) graph.updateEachNodeAttributes((key, attr) => {
            if (isIdle && (Math.abs(attr.prevX - attr.x) > 0.1 || Math.abs(attr.prevY - attr.y) > 0.1))
                isIdle = false;
            attr.prevX = attr.x;
            attr.prevY = attr.y;
            return attr;
        });
        if (isIdle) layout.stop();
    }, { signal: abort.signal });

    if (config.layoutEnable) layout.start();
}
