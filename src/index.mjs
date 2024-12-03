import Graph from "graphology";
import circular from "graphology-layout/circular";
import forceAtlas2 from "graphology-layout-forceatlas2";
import Sigma from "sigma";
import { parse } from "./parser.mjs";

import depsData from './dependencies.txt';
import { quadraticOut } from "sigma/utils";
const searchInput = document.getElementById("search-input");
const searchSuggestions = document.getElementById("suggestions");
const deps = parse(depsData);
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
        console.log('highlihht!');
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
