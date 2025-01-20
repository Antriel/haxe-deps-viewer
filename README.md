# Haxe Dependencies Viewer

Use this tool to visualize your [Haxe](https://haxe.org/) dependencies.  
[Try it out here.](https://antriel.github.io/haxe-deps-viewer/)

![image](https://github.com/user-attachments/assets/7037c9a5-96ff-4af7-b2df-93f0cad5aa39)

- Compile with `-D dump-dependencies`
- Copy/drag the `dump/dependencies.dump` to the web page.
- You can also drag `dependants.dump`, it just switches arrow directions. You can also switch that via UI at any time.
- You can:
  - Search for a node.
  - Activate a node by clicking on it.
  - See its direct/all dependencies/dependents and see the counts.
  - Change visualization parameters, like node sizes.
  - Rename nodes based on regexes, to lower the visual clutter.
  - Exclude nodes based on regexes.
  - For _very_ big files (or just for fun) you can fiddle with layout/simulation parameters to improve/speedup the layout.

Brought to you by [Antriel](https://antriel.com), inspired by <https://github.com/markknol/haxe-dependency-graph>.
