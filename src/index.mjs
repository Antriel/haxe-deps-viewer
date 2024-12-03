import Graph from "graphology";
import circular from "graphology-layout/circular";
import forceAtlas2 from "graphology-layout-forceatlas2";
import Sigma from "sigma";
import { parse } from "./parser.mjs";
import { layout as runDagreLayout, graphlib } from "@dagrejs/dagre"

import depsData from './dependencies.txt';
import { quadraticOut } from "sigma/utils";
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

const graph = new Graph();

const maxSize = [...deps.keys()].reduce((max, dep) => Math.max(max, dep.size), 0);

function add(node) {
    if (!graph.hasNode(node.path))
        graph.addNode(node.path, { label: node.label, size: 1 + (node.size / maxSize) * 15 });
}
for (const [key, children] of deps) {
    add(key);
    for (const child of children) {
        add(child);
        graph.addDirectedEdge(key.path, child.path, { type: 'arrow' });
    }
}
searchSuggestions.innerHTML = graph
    .nodes()
    .map((node) => `<option value="${graph.getNodeAttribute(node, "label")}"></option>`)
    .join("\n");

circular.assign(graph);
//// dagre layout
// const dagreSettings = {
//     directed: true, // take edge direction into account
//     compound: false, //
// };

// var g = new graphlib.Graph(dagreSettings);
// g.setGraph({
//     rankdir: 'BT',
//     // nodesep: 1000,
//     // edgesep: 10,
//     // ranksep: 50,
//     // ranker: 'longest-path'
// });

// g.setDefaultEdgeLabel(function () { return {}; });

// for (const node of graph.nodeEntries()) g.setNode(node.node, { width: 50, height: 50 });
// for (const edge of graph.edgeEntries()) g.setEdge(edge.source, edge.target);
// runDagreLayout(g);

// // let dagrePositions = {}

// g.nodes().forEach(node => {
//     if (g.node(node) !== undefined) {
//         // dagrePositions[node] = { x: g.node(node).x, y: g.node(node).y }
//         const atts = graph.getNodeAttributes(node);
//         atts.x = g.node(node).x;
//         atts.y = g.node(node).y;
//     }
// });

// animateNodes(sigma.getGraph(), dagrePositions, { duration: 2000, easing: "linear" }, fit);
/// ~dagre layout

const settings = forceAtlas2.inferSettings(graph);
forceAtlas2.assign(graph, { settings, iterations: 600 });


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
    if (state.hoveredNeighbors && !state.hoveredNeighbors.has(node) && state.hoveredNode !== node) {
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
    if (
        state.hoveredNode &&
        !graph.extremities(edge).every((n) => n === state.hoveredNode || graph.areInboundNeighbors(n, state.hoveredNode))
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
searchInput.addEventListener("blur", () => {
    setSearchQuery("");
});
