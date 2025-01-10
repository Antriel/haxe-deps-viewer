import { bidirectional, singleSourceLength } from 'graphology-shortest-path/unweighted';
import { edgePathFromNodePath } from "graphology-shortest-path";
import Sigma from "sigma";
import { parse } from "./parser.mjs";
import createGraph, { setGraphPositions } from "./createGraph.mjs";
import { config, dataVal, onConfigChanged, refresh, syncData } from './config.mjs';
const searchInput = document.getElementById("search-input");
const searchSuggestions = document.getElementById("suggestions");

let deps = new Map();
export function showNew(txt, isDependants) {
    let newDeps = parse(txt, isDependants);
    if (newDeps.size < 2) return; // In case of accidental paste that included `.hx`.
    deps = newDeps;
    config.visualDependencies = !isDependants;
    refresh();
    onConfigChanged.run();
}
function copyDeps() {
    const copy = new Map();
    for (const [key, set] of deps) copy.set(key, new Set(set));
    return copy;
}

let graph = createGraph(copyDeps(), config);
onConfigChanged.run = () => {
    graph = createGraph(copyDeps(), config);
    // Clear, otherwise Sigma can crash if the previously highlighted node does not exist.
    sigma.highlightedNodes.clear();
    sigma.setGraph(graph);
    sigma.setSetting('labelDensity', config.visualLabelsDensity);
    searchSuggestions.innerHTML = graph
        .nodes()
        .map((node) => `<option value="${graph.getNodeAttribute(node, "label")}"></option>`)
        .join("\n");
    setSelectedNode(state.selectedNode && graph.hasNode(state.selectedNode) ? state.selectedNode : undefined);
};
onConfigChanged.reset = () => {
    setGraphPositions(graph, config, true);
    sigma.refresh({ skipIndexation: true });
}


const sigma = new Sigma(graph, document.getElementById("container"), {
    labelDensity: config.visualLabelsDensity,
});
const state = {};
function setHoveredNode(node) {
    if (node) {
        state.hoveredNode = node;
        state.hoveredNeighbors = new Set(graph.outNeighbors(node));
        if (state.selectedNode) {
            const paths = bidirectional(graph, state.selectedNode, state.hoveredNode);
            if (paths) state.highlightEdges = edgePathFromNodePath(graph, paths);
        }
    } else {
        state.hoveredNode = undefined;
        state.hoveredNeighbors = undefined;
        state.highlightEdges = undefined;
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
        if ((!state.hoveredNode || state.hoveredNode === state.selectedNode) && state.distances && state.distances[node]) {
            let c = Math.floor(100 + (state.distances[node] / state.maxDist) * 120).toString(16);
            if (c.length == 1) c = '0' + c;
            res.color = '#' + c + c + c;
        }
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
    const target = graph.target(edge);
    const src = graph.source(edge);
    if (state.highlightEdges?.includes(edge)) {
        res.color = '#3333cc';
        res.size = 2.5;
    } else if (config.visualCycles && state.cycleEdges?.has(edge)) {
        res.color = '#cc3333';
    } else if (config.visualAllPaths && (!state.hoveredNode || state.hoveredNode === state.selectedNode)
        && state.distances && state.distances[src] != undefined && target != state.selectedNode) {
        const strength = 255 / (2 ** (state.distances[src]));
        let c = Math.floor(255 - strength).toString(16);
        if (c.length == 1) c = '0' + c;
        res.color = '#' + c + c + c;
    } else if (
        mainNode &&
        !graph.extremities(edge).every((n) => n === mainNode || graph.areInNeighbors(n, mainNode))
    ) {
        res.hidden = true;
    } else if (
        state.suggestions &&
        (!state.suggestions.has(graph.source(edge)) || !state.suggestions.has(target))
    ) {
        res.hidden = true;
    }

    return res;
});
sigma.on('enterNode', ({ node }) => setHoveredNode(node));
sigma.on('leaveNode', () => setHoveredNode(undefined));
sigma.on('clickNode', ({ node }) => {
    setSelectedNode(node);
});
sigma.on('clickStage', () => {
    state.selectedNeighbors = undefined;
    state.distances = undefined;
    state.cycleEdges = undefined;
    setSelectedNode(undefined);
});

function setSelectedNode(node) {
    state.selectedNode = node;
    if (node) {
        state.selectedNeighbors = new Set(graph.outNeighbors(node));
        state.distances = singleSourceLength(graph, node);
        state.maxDist = Object.values(state.distances).reduce((dist, length) => Math.max(dist, length), 0);
        state.cycleEdges = new Set();
        for (const neigh of state.selectedNeighbors.values()) {
            const path = bidirectional(graph, neigh, node);
            if (path) edgePathFromNodePath(graph, [node, ...path])
                .forEach(state.cycleEdges.add, state.cycleEdges);
        }
        let inCount = 0;
        let outCount = 0;
        let inCountTotal = 0;
        let outCountTotal = 0;
        for (const other of graph.nodes()) if (other != node) {
            const outPath = bidirectional(graph, node, other);
            const inPath = bidirectional(graph, other, node);
            if (outPath) ++outCountTotal;
            if (inPath) ++inCountTotal;
            if (outPath?.length == 2) ++outCount;
            if (inPath?.length == 2) ++inCount;
        }
        dataVal.directDependencies = config.visualDependencies ? outCount : inCount;
        dataVal.directDependants = config.visualDependencies ? inCount : outCount;
        dataVal.totalDependencies = config.visualDependencies ? outCountTotal : inCountTotal;
        dataVal.totalDependants = config.visualDependencies ? inCountTotal : outCountTotal;
    } else {
        dataVal.directDependencies = dataVal.directDependants = dataVal.totalDependencies = dataVal.totalDependants = Number.NaN;
    }
    sigma.refresh({ skipIndexation: true });
    syncData();
}

function setSearchQuery(query) {
    state.searchQuery = query;
    if (searchInput.value !== query) searchInput.value = query;
    if (query) {
        const lcQuery = query.toLowerCase();
        const nodes = graph.nodes().map(id => ({ id, label: graph.getNodeAttribute(id, 'label') }));
        const suggestions = nodes.filter(({ label }) => label.toLowerCase().includes(lcQuery));

        if (suggestions.length === 1 && suggestions[0].label === query) {
            state.suggestions = undefined;
            setSelectedNode(suggestions[0].id);

            const nodePosition = sigma.getNodeDisplayData(state.selectedNode);
            sigma.getCamera().animate(nodePosition, {
                duration: 500,
            });
        } else {
            state.suggestions = new Set(suggestions.map(({ id }) => id));
            setSelectedNode(undefined);
        }
    } else {
        state.suggestions = undefined;
        setSelectedNode(undefined);
    }
}

searchInput.addEventListener("input", () => {
    setSearchQuery(searchInput.value || "");
});
searchInput.addEventListener('keyup', () => {
    // Reapply the current value. This triggers even if it didn't change.
    setSearchQuery(searchInput.value || "");
});
