import GUI from 'lil-gui';
import { html } from 'DOCUMENTATION_HTML';

/** @type{import('./createGraph.mjs').GraphConfig} */
export const config = JSON.parse(localStorage?.getItem('haxeDepsCfg') ?? '{}');
export let onConfigChanged = {};
config.visualDependencies ??= true;
config.visualSize ??= 'dependencies';
config.visualSizeMin ??= 3;
config.visualSizeMax ??= 15;
config.visualAllPaths ??= true;
config.visualCycles ??= true;
config.visualLabelsDensity ??= 1;
config.layoutEnable ??= true;
config.layoutInit ??= 'bubble';
config.layoutForces ??= true;
config.layoutForcesRelative ??= true;
config.layoutPackageForces ??= 1;
config.layoutForcePower ??= 0.5;
config.layoutForceSlowdown ??= 20;

config.hideStd ??= true;
config.hideImport ??= true;
config.hideCustom ??= [];
config.showOnlyCircular ??= false;
config.hideMinDeps ??= -1;
config.hideMinDependants ??= -1;
config.smartLabelsStd ??= true;
config.smartLabelsSrc ??= true;
config.smartLabelsHaxelib ??= true;
config.smartLabelsPrefix ??= true;
config.smartLabelsShowMacro ??= true;
config.smartLabelsCustom ??= [];

const gui = new GUI({ title: 'Config/Data' });
gui.close();
gui.domElement.style.left = '0px';

// Add info button next to GUI using fixed positioning
const infoButton = document.createElement('button');
infoButton.innerHTML = '📖';
infoButton.title = 'Show documentation';
infoButton.style.cssText = `
    position: fixed;
    top: 0;
    left: 245px;
    background: #f0f0f0;
    border: 1px solid #ccc;
    color: #333;
    font-size: 20px;
    cursor: pointer;
    padding: 12px 14px;
    border-radius: 6px;
    transition: all 0.2s;
    z-index: 1000;
    height: 36px;
    width: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 3px 6px rgba(0,0,0,0.3);
`;
infoButton.onmouseover = () => {
    infoButton.style.backgroundColor = '#e0e0e0';
    infoButton.style.transform = 'translateY(-1px)';
    infoButton.style.boxShadow = '0 5px 10px rgba(0,0,0,0.4)';
};
infoButton.onmouseout = () => {
    infoButton.style.backgroundColor = '#f0f0f0';
    infoButton.style.transform = 'translateY(0)';
    infoButton.style.boxShadow = '0 3px 6px rgba(0,0,0,0.3)';
};
infoButton.onclick = showDocumentation;

// Add to document body
document.body.appendChild(infoButton);

gui.onFinishChange(() => {
    localStorage?.setItem('haxeDepsCfg', JSON.stringify(config));
    onConfigChanged.run?.();
    // TODO also save state of the GUI?
});

const data = gui.addFolder('Selected Node Dep Counts').close();
export const dataVal = {
    directDependencies: Number.NaN,
    directDependants: Number.NaN,
    totalDependencies: Number.NaN,
    totalDependants: Number.NaN,
};
data.add(dataVal, 'directDependencies').name('direct dependencies').disable();
data.add(dataVal, 'directDependants').name('direct dependants').disable();
data.add(dataVal, 'totalDependencies').name('total dependencies').disable();
data.add(dataVal, 'totalDependants').name('total dependants').disable();
export function syncData() {
    for (const c of data.controllersRecursive()) c.updateDisplay();
}

const visual = gui.addFolder('Visualization').close();
const dir = visual.add(config, 'visualDependencies', { dependencies: true, dependants: false }).name('point towards');
export function refresh() { dir.updateDisplay(); }
visual.add(config, 'visualSize', {
    'immediate dependencies': 'dependencies',
    'total dependencies': 'dependenciesRec',
    'immediate dependants': 'dependants',
    'total dependants': 'dependantsRec',
}).name('node size based on');
visual.add(config, 'visualSizeMin', 1, 25, 0.001).name('min radius');
visual.add(config, 'visualSizeMax', 1, 25, 0.001).name('max radius');
visual.add(config, 'visualAllPaths').name('show all possible paths of active node');
visual.add(config, 'visualCycles').name('show cyclic paths in red');
visual.add(config, 'visualLabelsDensity', 0.1, 3).name('labels density');

const exclusions = gui.addFolder('Exclusions').close();
exclusions.add(config, 'hideStd').name('hide Haxe Std library');
exclusions.add(config, 'hideImport').name('hide import.hx');
exclusions.add(config, 'showOnlyCircular').name('show only circular dependencies');
exclusions.add(config, 'hideMinDeps', -1, 30, 1).name('if <= N total dependencies');
exclusions.add(config, 'hideMinDependants', -1, 30, 1).name('if <= N total dependants');
function addCustomStringValues(root, folderName, arr, defaultRegex = '.+foobar.+') {
    const customFolder = root.addFolder(folderName);
    function addCustom(custom) {
        let controls = [
            customFolder.add(custom, 'enabled'),
            customFolder.add(custom, 'reg').name('regex').onChange(function (val) {
                try {
                    new RegExp(val);
                    this.domElement.classList.remove('error');
                } catch (e) {
                    this.domElement.classList.add('error');
                }
            }),
            customFolder.add({
                remove: () => {
                    arr.splice(arr.indexOf(custom), 1);
                    controls.forEach(c => c.destroy());
                }
            }, 'remove'),
        ];
    }
    customFolder.add({
        add: () => {
            const custom = { reg: defaultRegex, enabled: true };
            arr.push(custom);
            addCustom(custom);
        }
    }, 'add');
    for (const custom of arr) addCustom(custom);
}
addCustomStringValues(exclusions, 'Custom RegEx Exclusions', config.hideCustom, '.+library\\/.+');

const labels = gui.addFolder('Smart Labels').close();
labels.add(config, 'smartLabelsStd').name('extract Haxe Std lib');
labels.add(config, 'smartLabelsSrc').name('extract after src/');
labels.add(config, 'smartLabelsHaxelib').name('try extract haxelib paths')
labels.add(config, 'smartLabelsPrefix').name('remove common prefix');
labels.add(config, 'smartLabelsShowMacro').name('mark macros in labels');
addCustomStringValues(labels, 'Custom Smart Labels (Use Capture Group)', config.smartLabelsCustom, 'src\\/(.+)');

const layout = gui.addFolder('Layout/Simulation (Quite Fiddly...)').close();
layout.add(config, 'layoutEnable').name('enable simulation');
layout.add(config, 'layoutInit', {
    'packages bubble chart': 'bubble',
    'circular chart': 'circle',
    'top-down': 'topdown',
}).name('initial position algorithm');
layout.add({
    reset: () => {
        onConfigChanged.reset?.();
    }
}, 'reset').name('reset initial positions');
layout.add(config, 'layoutForces').name('apply forces based on links');
layout.add(config, 'layoutForcesRelative').name('forces relative to link count');
layout.add(config, 'layoutPackageForces', 0, 3, 0.001).name('same package force');
layout.add(config, 'layoutForcePower', 0, 3, 0.001).name('force power');
layout.add(config, 'layoutForceSlowdown', 1, 100, 0.001).name('slowdown');
// layout.open().parent.open();

// TODO load state of the GUI?

// Documentation panel functionality
function showDocumentation() {
    // Remove existing panel if it exists
    const existingPanel = document.getElementById('documentation-panel');
    if (existingPanel) {
        existingPanel.remove();
        return;
    }

    // Create documentation panel
    const panel = document.createElement('div');
    panel.id = 'documentation-panel';
    panel.style.cssText = `
        position: fixed;
        top: 20px;
        left: 320px;
        width: 700px;
        max-height: calc(100vh - 40px);
        overflow-y: auto;
        background: white;
        border-radius: 8px;
        padding: 20px;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
        z-index: 5000;
        line-height: 1.4;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 14px;
    `;

    // Add close button - sticky positioned to stay visible when scrolling
    const closeButton = document.createElement('button');
    closeButton.innerHTML = '×';
    closeButton.title = 'Close documentation';
    closeButton.style.cssText = `
        position: sticky;
        top: 0;
        float: right;
        margin-bottom: 10px;
        background: #f0f0f0;
        border: 1px solid #ccc;
        font-size: 24px;
        cursor: pointer;
        color: #666;
        padding: 0;
        width: 30px;
        height: 30px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
        box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        z-index: 1;
    `;
    closeButton.onmouseover = () => {
        closeButton.style.backgroundColor = '#e0e0e0';
        closeButton.style.color = '#333';
        closeButton.style.boxShadow = '0 3px 6px rgba(0,0,0,0.3)';
    };
    closeButton.onmouseout = () => {
        closeButton.style.backgroundColor = '#f0f0f0';
        closeButton.style.color = '#666';
        closeButton.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
    };
    closeButton.onclick = () => panel.remove();

    // Add close button first, then documentation content
    panel.appendChild(closeButton);
    const docContent = document.createElement('div');
    docContent.innerHTML = html;
    panel.appendChild(docContent);

    // Style the documentation content - more compact
    const style = document.createElement('style');
    style.textContent = `
        #documentation-panel h1 { color: #333; margin: 0 0 15px 0; font-size: 24px; }
        #documentation-panel h2 { color: #444; margin: 20px 0 8px 0; font-size: 18px; border-bottom: 1px solid #eee; padding-bottom: 4px; }
        #documentation-panel h3 { color: #555; margin: 15px 0 6px 0; font-size: 16px; font-weight: 600; }
        #documentation-panel p { margin-bottom: 8px; color: #666; }
        #documentation-panel ul { margin: 8px 0; padding-left: 20px; }
        #documentation-panel li { margin-bottom: 3px; color: #666; }
        #documentation-panel code { background: #f5f5f5; padding: 1px 4px; border-radius: 2px; font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace; font-size: 13px; }
        #documentation-panel hr { border: none; border-top: 1px solid #ddd; margin: 15px 0; }
        #documentation-panel strong { color: #333; }
        #documentation-panel em { color: #666; font-style: italic; }
    `;
    document.head.appendChild(style);

    document.body.appendChild(panel);

    // Close on escape key
    function handleEscape(e) {
        if (e.key === 'Escape') {
            panel.remove();
            document.removeEventListener('keydown', handleEscape);
        }
    }
    document.addEventListener('keydown', handleEscape);
}
