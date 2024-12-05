import GUI from 'lil-gui';

/** @type{import('./createGraph.mjs').GraphConfig} */
export const config = JSON.parse(localStorage?.getItem('haxeDepsCfg') ?? '{}');
export let onConfigChanged = {};
config.hideStd ??= true;
config.hideImport ??= true;
config.hideCustom ??= [];
config.smartLabelsStd ??= true;
config.smartLabelsSrc ??= true;
config.smartLabelsHaxelib ??= true;
config.smartLabelsPrefix ??= true;
config.smartLabelsCustom ??= [];

const gui = new GUI({ title: 'Config' });
gui.domElement.style.left = '0px';

gui.onFinishChange(() => {
    localStorage?.setItem('haxeDepsCfg', JSON.stringify(config));
    onConfigChanged.run?.();
    // TODO also save state of the GUI?
});

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
addCustomStringValues(labels, 'Custom Smart Labels (Use Capture Group)', config.smartLabelsCustom);

// TODO load state of the GUI?
