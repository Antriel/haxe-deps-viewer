import Graph from "graphology";
import forceAtlas2 from "graphology-layout-forceatlas2";
import Sigma from "sigma";
import { parse } from "./parser.mjs";
import depsData from './dependencies.txt';
import randomColor from "randomcolor";
const searchInput = document.getElementById("search-input");
const searchSuggestions = document.getElementById("suggestions");
const deps = parse(depsData);

// Filter out std.
const haxeReg = /.+haxe[\\\/].+[\\\/]std[\\\/](.+).hx$/;
function shouldRemove(/** @type{import("./parser.mjs").DepData} */ data) {
    return haxeReg.test(data.path);
}
for (const [root, children] of deps.entries()) {
    if (shouldRemove(root)) deps.delete(root);
    else for (const ch of children) if (shouldRemove(ch)) children.delete(ch);
}

const graph = new Graph({ multi: true });

const maxSize = [...deps.keys()].reduce((max, dep) => Math.max(max, dep.size), 0);

function add(node) {
    if (!graph.hasNode(node.path))
        graph.addNode(node.path, {
            label: node.label,
            size: 1 + (node.size / maxSize) * 15,
        });
}
for (const [key, children] of deps) {
    add(key);
    for (const child of children) {
        add(child);
        const weight = (deps.get(child)?.size ?? 0) + 1;
        graph.addDirectedEdge(key.path, child.path, { type: 'arrow', weight });
    }
}

searchSuggestions.innerHTML = graph
    .nodes()
    .map((node) => `<option value="${graph.getNodeAttribute(node, "label")}"></option>`)
    .join("\n");

// circular.assign(graph);
for (const node of deps.keys()) {
    const atts = graph.getNodeAttributes(node.path);
    atts.y = node.size * 60;
    // TOOD x based on packs?
    atts.x = 10;
}

// Let's try adding edges between types within the same pack.
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
const packToColors = {
    sub: new Map()
};
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
function setColors(color) {
    for (const node of color.nodes) {
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
            edges.push(graph.addUndirectedEdge(arr[i].path, arr[j + 1].path, { weight: 1.5 }));
        }
    }
}

const settings = forceAtlas2.inferSettings(graph);
settings.outboundAttractionDistribution = true;
settings.edgeWeightInfluence = 0.5;
settings.slowDown = 2;
forceAtlas2.assign(graph, { settings, iterations: 1000 });

// Drop pack edges.
for (const edge of edges) graph.dropEdge(edge);

const sigma = new Sigma(graph, document.getElementById("container"));
const state = {};
function setHoveredNode(node) {
    if (node) {
        state.hoveredNode = node;
        state.hoveredNeighbors = new Set(graph.outNeighbors(node));
    } else {
        state.hoveredNode = undefined;
        state.hoveredNeighbors = undefined;
    }

    sigma.refresh({ skipIndexation: true });
}
sigma.setSetting('nodeReducer', (node, data) => {
    const res = { ...data };
    const mainNode = state.hoveredNode ?? state.selectedNode;
    const neighbors = state.hoveredNeighbors ?? state.selectedNeighbors;
    if (neighbors && !neighbors.has(node) && mainNode !== node) {
        res.label = "";
        res.color = "#f6f6f6";
    }
    if (state.selectedNode === node) {
        res.highlighted = true;
    } else if (state.suggestions) {
        if (state.suggestions.has(node)) {
            res.forceLabel = true;
        } else {
            res.label = "";
            res.color = "#f6f6f6";
        }
    }
    return res;
});

sigma.setSetting("edgeReducer", (edge, data) => {
    const res = { ...data };
    const mainNode = state.hoveredNode ?? state.selectedNode;
    if (
        mainNode &&
        !graph.extremities(edge).every((n) => n === mainNode || graph.areInboundNeighbors(n, mainNode))
    ) {
        res.hidden = true;
    }

    if (
        state.suggestions &&
        (!state.suggestions.has(graph.source(edge)) || !state.suggestions.has(graph.target(edge)))
    ) {
        res.hidden = true;
    }

    return res;
});
sigma.on('enterNode', ({ node }) => setHoveredNode(node));
sigma.on('leaveNode', () => setHoveredNode(undefined));
sigma.on('clickNode', ({ node }) => {
    state.selectedNode = node;
    state.selectedNeighbors = new Set(graph.outNeighbors(node));
    sigma.refresh({ skipIndexation: true });
});
sigma.on('clickStage', () => {
    state.selectedNode = undefined;
    state.selectedNeighbors = undefined;
    sigma.refresh({ skipIndexation: true });
});

function setSearchQuery(query) {
    state.searchQuery = query;
    if (searchInput.value !== query) searchInput.value = query;
    if (query) {
        const lcQuery = query.toLowerCase();
        const nodes = graph.nodes().map(id => ({ id, label: graph.getNodeAttribute(id, 'label') }));
        const suggestions = nodes.filter(({ label }) => label.toLowerCase().includes(lcQuery));

        if (suggestions.length === 1 && suggestions[0].label === query) {
            state.selectedNode = suggestions[0].id;
            state.suggestions = undefined;

            const nodePosition = sigma.getNodeDisplayData(state.selectedNode);
            sigma.getCamera().animate(nodePosition, {
                duration: 500,
            });
        } else {
            state.selectedNode = undefined;
            state.suggestions = new Set(suggestions.map(({ id }) => id));
        }
    } else {
        state.selectedNode = undefined;
        state.suggestions = undefined;
    }

    sigma.refresh({ skipIndexation: true });
}

searchInput.addEventListener("input", () => {
    setSearchQuery(searchInput.value || "");
});
