import { fetchState } from './net.js';
import { Renderer } from './renderer.js';
import { renderChronicle, renderEvents, updateChips, updateDivinePool, showInspector, wireDivineButtons } from './ui.js';

const POLL_MS = 30000;

let lastChronicleLen = 0;

function boot() {
  const renderer = new Renderer(document.getElementById('world'), document.getElementById('tooltip'));

  const divine = wireDivineButtons(
    (power) => { renderer.armedPower = power; },
    () => refresh(true)
  );

  renderer.onSelect = (cr) => showInspector(cr, () => refresh(true));
  renderer.onWorldClick = (power, x, y) => divine.fire(power, x, y);

  async function refresh(force = false) {
    try {
      const st = await fetchState();
      renderer.setState(st);
      updateChips(st);
      updateDivinePool(st.divine?.pool ?? 0);
      renderEvents(st.events || []);
      if (force || st.chronicle.length !== lastChronicleLen) {
        renderChronicle(st.chronicle || []);
        lastChronicleLength(st.chronicle.length);
      }
    } catch (e) {
      console.warn('state refresh failed:', e.message);
    }
  }

  function lastChronicleLength(n) { lastChronicleLen = n; }

  refresh();
  setInterval(refresh, POLL_MS);
}

boot();
