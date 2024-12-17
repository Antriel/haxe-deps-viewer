import GUI from 'lil-gui';

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
config.smartLabelsStd ??= true;
config.smartLabelsSrc ??= true;
config.smartLabelsHaxelib ??= true;
config.smartLabelsPrefix ??= true;
config.smartLabelsShowMacro ??= true;
config.smartLabelsCustom ??= [];

const gui = new GUI({ title: 'Config/Data' });
gui.close();
gui.domElement.style.left = '0px';

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
function addCustomStringValues(root, folderName, arr) {
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
            const custom = { reg: '.+foobar.+', enabled: true };
            arr.push(custom);
            addCustom(custom);
        }
    }, 'add');
    for (const custom of arr) addCustom(custom);
}
addCustomStringValues(exclusions, 'Custom RegEx Exclusions', config.hideCustom);

const labels = gui.addFolder('Smart Labels').close();
labels.add(config, 'smartLabelsStd').name('extract Haxe Std lib');
labels.add(config, 'smartLabelsSrc').name('extract after src/');
labels.add(config, 'smartLabelsHaxelib').name('try extract haxelib paths')
labels.add(config, 'smartLabelsPrefix').name('remove common prefix');
labels.add(config, 'smartLabelsShowMacro').name('mark macros in labels');
addCustomStringValues(labels, 'Custom Smart Labels (Use Capture Group)', config.smartLabelsCustom);

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
layout.open().parent.open();

// TODO load state of the GUI?
