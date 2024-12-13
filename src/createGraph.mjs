import Graph from "graphology";
import { circular } from 'graphology-layout';
import forceAtlas2 from "graphology-layout-forceatlas2";
import FA2Layout from 'graphology-layout-forceatlas2/worker';
import randomColor from "randomcolor";

let layout;
let abort;
let idCounter = 0;
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
 * @property {boolean} layoutForces
 * @property {boolean} layoutForcesRelative
 * @property {number} layoutPackageForces
 * @property {number} layoutForcePower
 * @property {number} layoutForceSlowdown
 * @property {boolean} hideStd
 * @property {boolean} hideImport
 * @property {{reg:string,enabled:boolean}[]} hideCustom
 * @property {boolean} smartLabelsStd
 * @property {boolean} smartLabelsSrc
 * @property {boolean} smartLabelsHaxelib
 * @property {boolean} smartLabelsPrefix
 * @property {boolean} smartLabelsShowMacro
 * @property {{reg:string,enabled:boolean}[]} smartLabelsCustom
 * 
 */

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

    const graph = new Graph({ /* multi: true */ });
    const posGraph = new Graph({ multi: true });

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

    const pos = circular(graph);
    for (const { attributes, node } of graph.nodeEntries()) {
        attributes.size = minRadius + (attributes.degree / maxDegree) * (maxRadius - minRadius);
        if (typeof attributes.y === 'undefined') {
            // TODO x based on packs?
            const { x, y } = pos[node];
            attributes.x = x;
            attributes.y = y;
            attributes.prevX = attributes.x
            attributes.prevY = attributes.y;
        }
    }

    // Add edges between types within the same pack, for better position grouping.
    const packToNodes = new Map();
    for (const node of deps.keys()) {
        const pack = node.label.split('/');
        pack.pop();
        while (pack.length) {
            const packStr = pack.join('/');
            if (!packToNodes.has(packStr)) packToNodes.set(packStr, []);
            packToNodes.get(packStr).push(node);
            pack.pop();
        }
    }
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

    layout.start();
    // TODO also add a button toggle for starting stopping the thing.

    // // Drop pack edges.
    // for (const edge of edges) graph.dropEdge(edge);

    return graph;
}
