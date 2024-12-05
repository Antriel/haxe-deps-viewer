import GUI from 'lil-gui';

/** @type{import('./createGraph.mjs').GraphConfig} */
export const config = JSON.parse(localStorage?.getItem('haxeDepsCfg') ?? '{}');
export let onConfigChanged = {};
config.hideStd ??= true;
config.hideImport ??= true;
config.hideCustom ??= [];

const gui = new GUI({ title: 'Config' });
gui.domElement.style.left = '0px';

gui.onFinishChange(() => {
    localStorage?.setItem('haxeDepsCfg', JSON.stringify(config));
    onConfigChanged.run?.();
});

const exclusions = gui.addFolder('Exclusions');
exclusions.add(config, 'hideStd').name('hide Haxe Std library');
exclusions.add(config, 'hideImport').name('hide import.hx');
const customExclusions = exclusions.addFolder('Custom RegEx Exclusions');
function addHideCustom(custom) {
    let controls = [
        customExclusions.add(custom, 'enabled'),
        customExclusions.add(custom, 'reg').name('regex').onChange(function (val) {
            try {
                new RegExp(val);
                this.domElement.classList.remove('error');
            } catch (e) {
                this.domElement.classList.add('error');
            }
        }),
        customExclusions.add({
            remove: () => {
                config.hideCustom.splice(config.hideCustom.indexOf(custom), 1);
                controls.forEach(c => c.destroy());
            }
        }, 'remove'),
    ];
}
customExclusions.add({
    add: () => {
        const custom = { reg: '.+foobar.+', enabled: true };
        config.hideCustom.push(custom);
        addHideCustom(custom);
    }
}, 'add');
for (const custom of config.hideCustom) addHideCustom(custom);


