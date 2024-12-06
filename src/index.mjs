import { showNew } from "./renderer.mjs";

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
        reader.onload = event => {
            const text = event.target.result;
            if (text.includes('.hx')) {
                hello.remove();
                const isDependants = file.name.indexOf('dependants') >= 0;
                showNew(text, isDependants);
            }
        }
        reader.readAsText(file);
        return false;
    }
    return false;
}
