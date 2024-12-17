import { showNew } from "./renderer.mjs";
import { buildDate, gitHash, version } from 'BUILD_METADATA';

const v = document.getElementById('version');
if (v) v.innerText = `v${version} built on ${buildDate} #${gitHash}`;

function handleText(text, filename) {
    if (text?.includes('.hx')) {
        hello.remove();
        const isDependants = filename ? filename.indexOf('dependants') >= 0 : false;
        showNew(text, isDependants);
    }
}

const el = document.getElementById('container');
const hello = document.getElementById('hello');
el.ondragover = () => { hello.classList.add('dragging'); return false; };
el.ondragleave = () => { hello.classList.remove('dragging'); return false; };
el.ondragend = () => { hello.classList.remove('dragging'); return false; };
el.ondrop = e => {
    e.preventDefault();
    hello.classList.remove('dragging');
    for (const file of e.dataTransfer.files) {
        const reader = new FileReader();
        reader.onload = event => handleText(event.target.result, file.name);
        reader.readAsText(file);
        return false;
    }
    return false;
}
document.addEventListener("paste", async (event) => {
    const items = event.clipboardData.items;
    for (const item of items) if (item.kind === "file") {
        const file = item.getAsFile();
        if (file) {
            handleText(await file.text(), file.name);
            return;
        }
    }
    // Check for straight text.
    handleText(event.clipboardData.getData("text"));
});
