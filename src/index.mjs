import Graph from "graphology";
import { cropToLargestConnectedComponent } from "graphology-components";
import circular from "graphology-layout/circular";
import forceAtlas2 from "graphology-layout-forceatlas2";
import Sigma from "sigma";
import { parse } from "./parser.mjs";

import depsData from './dependencies.txt';
import { quadraticOut } from "sigma/utils";
const deps = parse(depsData);
const graph = new Graph();

for (const [key, children] of deps) {
    if (!graph.hasNode(key.path)) graph.addNode(key.path, { label: key.label });
    for (const child of children) {
        if (!graph.hasNode(child.path)) graph.addNode(child.path, { label: child.label });
        graph.addDirectedEdge(key.path, child.path, { type: 'arrow' });
    }
    // cropToLargestConnectedComponent(graph); // What does this do?
}

circular.assign(graph);
const settings = forceAtlas2.inferSettings(graph);
forceAtlas2.assign(graph, { settings, iterations: 600 });


// Instantiate sigma.js and render the graph
const sigma = new Sigma(graph, document.getElementById("container"));
