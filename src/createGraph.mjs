import Graph from "graphology";
import forceAtlas2 from "graphology-layout-forceatlas2";
import FA2Layout from 'graphology-layout-forceatlas2/worker';
import randomColor from "randomcolor";

let layout;
let abort;
let idCounter = 0;
const nodeIds = new Map();
const nodeAtts = new Map();
const edgeAtts = new Map();

const haxeReg = /.+haxe\/.+\/std\/(.+).hx$/;
const importReg = /.+\/import.hx$/;

/**
 * @typedef {Object} GraphConfig
 * @property {boolean} hideStd
 * @property {boolean} hideImport
 */

/**
 * @param {Map<import('./parser.mjs').DepData, Set<import('./parser.mjs').DepData>>} deps
 * @param {GraphConfig} config
 */
export default function createGraph(deps, config) {
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

    function shouldRemove(/** @type{import("./parser.mjs").DepData} */ data) {
        let rem = false;
        if (config.hideStd) rem = rem || haxeReg.test(data.path);
        if (config.hideImport) rem = rem || importReg.test(data.path);
        return rem;
    }
    for (const [root, children] of deps.entries()) {
        if (shouldRemove(root)) deps.delete(root);
        else for (const ch of children) if (shouldRemove(ch)) children.delete(ch);
    }
    for (const [dep, ch] of deps) dep.size = ch.size;

    const graph = new Graph({ /* multi: true */ });
    const posGraph = new Graph({ multi: true });
    const maxSize = [...deps.keys()].reduce((max, dep) => Math.max(max, dep.size), 0);

    function add(node) {
        if (!graph.hasNode(node.path)) {
            if (!nodeIds.has(node.path)) nodeIds.set(node.path, ++idCounter);
            if (!nodeAtts.has(node.path)) nodeAtts.set(node.path, { label: node.label });
            const atts = nodeAtts.get(node.path);
            atts.size = 1 + (node.size / maxSize) * 15;
            graph.addNode(node.path, atts);
            posGraph.addNode(node.path, atts);
        }
    }
    for (const [key, children] of deps) {
        add(key);
        for (const child of children) {
            add(child);
            const edgeKey = nodeIds.get(key.path) + '_' + nodeIds.get(child.path);
            if (!edgeAtts.has(edgeKey)) edgeAtts.set(edgeKey, { type: 'arrow' });
            const atts = edgeAtts.get(edgeKey)
            atts.weight = (deps.get(child)?.size ?? 0) + 1;
            graph.addDirectedEdgeWithKey(edgeKey, key.path, child.path, atts);
            posGraph.addDirectedEdgeWithKey(edgeKey, key.path, child.path, atts);
        }
    }

    for (const node of deps.keys()) {
        const atts = graph.getNodeAttributes(node.path);
        if (typeof atts.y === 'undefined') {
            atts.y = node.size * 60;
            // TODO x based on packs?
            atts.x = 10;
            atts.prevX = atts.x
            atts.prevY = atts.y;
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
    for (const arr of packToNodes.values()) {
        for (let i = 0; i < arr.length - 1; i++) {
            for (let j = i; j < arr.length - 1; j++) {
                edges.push(posGraph.addUndirectedEdge(arr[i].path, arr[j + 1].path, { weight: 1.5 }));
                // TODO ^ configurable?
            }
        }
    }

    const settings = forceAtlas2.inferSettings(posGraph);
    // settings.adjustSizes = true;
    // settings.barnesHutOptimize = true;
    settings.outboundAttractionDistribution = true;
    settings.edgeWeightInfluence = 0.5;
    settings.slowDown = 20;
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
