// Browser script: fetches the JSON passed in the <script> tag's data-json attribute
// and fills the page with answer-key buttons. All fixed text lives in the HTML
// (see views/template.html); this script only fills in data.
//   <script src="/data/processing.js" data-json="/data/2026.json"></script>
(function () {
  const script = document.currentScript;
  const jsonUrl = script && script.dataset.json;

  const DAY1 = ["1", "2", "3", "4"];
  const DAY2 = ["5", "6", "7", "8"];
  const SECTIONS = ["lc", "ch", "cn", "mt"];

  const $ = (id) => document.getElementById(id);
  const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

  function el(tag, text, attrs) {
    const node = document.createElement(tag);
    if (text != null) node.textContent = text;
    if (attrs) for (const k in attrs) node.setAttribute(k, attrs[k]);
    return node;
  }

  function storage(key, value) {
    try {
      if (value === undefined) return localStorage.getItem(key);
      localStorage.setItem(key, value);
    } catch (e) {}
    return null;
  }

  // Per-button source details, shown in the popover.
  const details = new WeakMap();

  const FONTE_NOMES = { inep: "Inep (oficial)", estrategia: "Estratégia", aprovatotal: "Aprova Total", coc: "COC" };
  let fonteNomes = FONTE_NOMES;
  const fonteName = (k) => fonteNomes[k] || k;

  // "X" marks a question annulled by the official key.
  const ANULADA = "X";
  const letterText = (l) => (l === ANULADA ? "Anulada" : l);

  // ---- Popover (structure comes from <template id="popover-tpl">) ----
  let popover = null;
  let popoverFor = null;

  function hidePopover() {
    if (popover) popover.hidden = true;
    popoverFor = null;
  }

  function showPopover(btn) {
    const d = details.get(btn);
    if (!d) return;
    if (popoverFor === btn) return hidePopover();
    if (!popover) {
      const tpl = $("popover-tpl");
      if (!tpl) return;
      popover = document.body.appendChild(tpl.content.firstElementChild.cloneNode(true));
      popover.hidden = true;
    }
    popover.querySelector(".pop-q").textContent = d.q;
    popover.querySelector(".pop-caderno").textContent = d.caderno;
    popover.querySelector(".pop-igual").hidden = d.divergente;
    popover.querySelector(".pop-diverge").hidden = !d.divergente;
    popover.querySelector(".pop-letra").textContent = letterText(d.letter);
    const ul = popover.querySelector(".pop-votos");
    ul.replaceChildren();
    d.votos.forEach((v) => {
      const li = ul.appendChild(el("li", null, { class: v.letra === d.letter ? "" : "diferente" }));
      li.appendChild(el("span", fonteName(v.fonte)));
      li.appendChild(el("b", letterText(v.letra)));
    });

    popover.hidden = false;
    const r = btn.getBoundingClientRect();
    const w = popover.offsetWidth, h = popover.offsetHeight;
    const left = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), window.innerWidth - w - 8);
    let top = r.bottom + 8;
    if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 8);
    popover.style.left = `${left + window.scrollX}px`;
    popover.style.top = `${top + window.scrollY}px`;
    popoverFor = btn;
  }

  // Normal mode: click shows the sources. Marking mode: click marks;
  // right-click / long-press shows the sources.
  document.addEventListener("click", (e) => {
    const btn = e.target.closest && e.target.closest("button.ans");
    if (btn && !document.body.classList.contains("marking")) return showPopover(btn);
    if (popover && !popover.contains(e.target)) hidePopover();
  });
  document.addEventListener("contextmenu", (e) => {
    const btn = e.target.closest && e.target.closest("button.ans");
    if (!btn || !details.has(btn)) return;
    e.preventDefault();
    showPopover(btn);
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") hidePopover(); });
  window.addEventListener("resize", hidePopover);

  function render(data) {
    const cadernoName = (c) => (data._cadernos && data._cadernos[c]) || `Caderno ${c}`;
    if (data._fontes_nomes) fonteNomes = { ...FONTE_NOMES, ...data._fontes_nomes };

    // Answer for question q (1-180) in caderno c.
    // Day 1 strings may be 85 letters (questions 6-90, languages stored apart) or 90 (questions 1-90).
    function answer(c, q) {
      const s = data[c];
      if (!s) return "";
      if (DAY1.includes(c)) return (s.length === 90 ? s[q - 1] : s[q - 6]) || "";
      return s[q - 91] || "";
    }

    // Parses "estrategia:C / aprovatotal:D / coc:B" into [{ fonte, letra }].
    const parseVotes = (raw) => raw.split("/")
      .map((p) => p.split(":").map((s) => s.trim()))
      .filter(([fonte, letra]) => fonte && letra)
      .map(([fonte, letra]) => ({ fonte, letra }));

    // Sources that cover each caderno: taken from "_fontes_por_caderno" when present
    // (first = primary source), otherwise inferred from the divergence entries
    // (falling back to every source seen anywhere).
    const allSources = new Set();
    const cadernoSources = {};
    Object.entries(data.divergencias || {}).forEach(([c, qs]) => {
      cadernoSources[c] = new Set();
      Object.values(qs).forEach((raw) => parseVotes(raw).forEach(({ fonte }) => {
        cadernoSources[c].add(fonte);
        allSources.add(fonte);
      }));
    });
    const sourcesOf = (c) => {
      const listed = data._fontes_por_caderno && data._fontes_por_caderno[c];
      if (listed && listed.length) return listed;
      return [...(cadernoSources[c] && cadernoSources[c].size ? cadernoSources[c] : allSources)];
    };

    function votesFor(c, q, letter) {
      const d = data.divergencias && data.divergencias[c];
      const raw = d && d[String(q)];
      if (raw) {
        const votos = parseVotes(raw);
        if (votos.length) return { divergente: votos.some((v) => v.letra !== votos[0].letra), votos };
      }
      return { divergente: false, votos: sourcesOf(c).map((fonte) => ({ fonte, letra: letter })) };
    }

    // One group of answer buttons per caderno.
    function table(cadernos, questions, getAnswer) {
      const present = cadernos.filter((c) => getAnswer(c, questions[0]) !== undefined);
      const wrap = el("div", null, { class: "answers" });

      present.forEach((c) => {
        const group = wrap.appendChild(el("div", null, { class: "caderno-group", "data-caderno": c }));
        group.appendChild(el("h5", cadernoName(c)));
        const grid = group.appendChild(el("div", null, { class: "answer-grid" }));

        questions.forEach((q) => {
          const letter = getAnswer(c, q);
          const btn = grid.appendChild(el("button", null, { type: "button", class: "ans" }));
          btn.appendChild(el("span", String(q), { class: "q" }));
          btn.appendChild(el("span", letter || "-", { class: "l" }));
          if (!letter) {
            btn.disabled = true;
            btn.setAttribute("aria-label", `${q}: -`);
            return;
          }
          if (letter === ANULADA) btn.classList.add("anulada");
          const info = votesFor(c, q, letter);
          details.set(btn, { q, caderno: cadernoName(c), letter, ...info });
          if (info.divergente) btn.classList.add("divergente");
          const resumo = info.votos.map((v) => `${fonteName(v.fonte)}: ${letterText(v.letra)}`).join(" · ");
          btn.title = resumo;
          btn.setAttribute("aria-label", `${q}: ${letterText(letter)}. ${resumo}`);
        });
      });
      return wrap;
    }

    const areaTable = (cadernos, from, to) =>
      table(cadernos.filter((c) => data[c]), range(from, to), answer);

    // ---- Linguagens ----
    const linguas = [...document.querySelectorAll("[data-lingua]")]
      .filter((block) => data[block.dataset.lingua]);
    if (linguas.length) {
      $("lc-linguas").hidden = false;
      linguas.forEach((block) => {
        const lang = data[block.dataset.lingua];
        block.appendChild(table(DAY1.filter((c) => lang[c]), range(1, 5), (c, q) => lang[c][q - 1]));
      });

      const select = $("lingua");
      const keys = linguas.map((b) => b.dataset.lingua);
      [...select.options].forEach((o) => { if (!keys.includes(o.value)) o.remove(); });
      const show = () => {
        linguas.forEach((b) => { b.hidden = keys.length > 1 && b.dataset.lingua !== select.value; });
        storage("lingua", select.value);
      };
      if (keys.length > 1) {
        $("lingua-sel").hidden = false;
        const saved = storage("lingua");
        if (saved && keys.includes(saved)) select.value = saved;
        select.addEventListener("change", show);
      }
      show();
      $("lc-questoes").appendChild(areaTable(DAY1, 6, 45));
    } else {
      $("lc-questoes").appendChild(areaTable(DAY1, 1, 45));
    }

    $("ch").appendChild(areaTable(DAY1, 46, 90));
    $("cn").appendChild(areaTable(DAY2, 91, 135));
    $("mt").appendChild(areaTable(DAY2, 136, 180));

    // ---- Info / avisos (from the JSON) ----
    const info = $("info-dados");
    if (data._info) info.appendChild(el("p", data._info));
    if (data.avisos && data.avisos.length) {
      const ul = info.appendChild(el("ul"));
      data.avisos.forEach((a) => ul.appendChild(el("li", a)));
    }

    const marking = setupMarking();
    setupCadernoSelector(marking, cadernoName);

    // ---- Fontes ----
    const fontes = $("fontes");
    (data.fontes || []).forEach((f) => {
      const li = fontes.appendChild(el("li"));
      li.appendChild(el("a", f.nome, { href: f.url, target: "_blank", rel: "noopener" }));
    });
  }

  // Marking mode: clicking an answer cycles none -> correct -> wrong -> none.
  // Marks are saved per JSON file in localStorage; each section shows a counter.
  const STATES = ["", "certa", "errada"];
  const storeKey = () => `marcacoes:${jsonUrl}`;

  function loadMarks() {
    try { return JSON.parse(localStorage.getItem(storeKey())) || {}; } catch (e) { return {}; }
  }
  const saveMarks = (marks) => storage(storeKey(), JSON.stringify(marks));

  function setupMarking() {
    const marks = loadMarks();
    let active = false;
    const toggle = $("marcar");
    const clear = $("limpar");
    const cells = [];

    function applyState(btn) {
      btn.classList.remove("certa", "errada");
      const s = marks[btn.dataset.mark];
      if (s) btn.classList.add(s);
    }

    function fillCounter(counter, sec) {
      if (!counter) return;
      let ok = 0, bad = 0;
      // Only visible buttons count (see the notebook selector)
      cells.filter((b) => (!sec || b.dataset.section === sec) && !b.closest("[hidden]")).forEach((b) => {
        if (marks[b.dataset.mark] === "certa") ok++;
        else if (marks[b.dataset.mark] === "errada") bad++;
      });
      const total = ok + bad;
      counter.querySelector(".ok").textContent = ok;
      counter.querySelector(".bad").textContent = bad;
      counter.querySelector(".total").textContent = total;
      counter.querySelector(".pct").textContent = total ? Math.round((ok / total) * 100) : 0;
    }

    function updateCounter(sec) {
      const box = $(sec);
      fillCounter(box && box.querySelector(".counter"), sec);
      // Overall counter at the end of the page (all sections)
      fillCounter(document.querySelector("#geral .counter"), null);
    }

    SECTIONS.forEach((sec) => {
      const box = $(sec);
      if (!box) return;

      box.querySelectorAll(".answers").forEach((answers, ai) => {
        answers.querySelectorAll(".caderno-group").forEach((group) => {
          group.querySelectorAll("button.ans").forEach((btn) => {
            // Annulled questions can't be right or wrong, so they are not markable.
            if (btn.disabled || btn.classList.contains("anulada")) return;
            const q = btn.querySelector(".q").textContent;
            btn.dataset.mark = `${sec}-${ai}-${group.dataset.caderno}-${q}`;
            btn.dataset.section = sec;
            cells.push(btn);
            applyState(btn);
          });
        });
      });

      box.addEventListener("click", (e) => {
        if (!active) return;
        const btn = e.target.closest("button[data-mark]");
        if (!btn) return;
        const next = STATES[(STATES.indexOf(marks[btn.dataset.mark] || "") + 1) % STATES.length];
        if (next) marks[btn.dataset.mark] = next;
        else delete marks[btn.dataset.mark];
        applyState(btn);
        updateCounter(sec);
        saveMarks(marks);
      });

      updateCounter(sec);
    });

    toggle.addEventListener("click", () => {
      active = !active;
      toggle.textContent = active ? toggle.dataset.on : toggle.dataset.off;
      toggle.setAttribute("aria-pressed", String(active));
      document.body.classList.toggle("marking", active);
    });

    clear.addEventListener("click", () => {
      if (!confirm(clear.dataset.confirm)) return;
      Object.keys(marks).forEach((k) => delete marks[k]);
      cells.forEach(applyState);
      SECTIONS.forEach(updateCounter);
      saveMarks(marks);
    });

    return { refresh: () => SECTIONS.forEach(updateCounter) };
  }

  // Notebook (caderno) color selector: one per day, shows only the chosen notebook.
  function setupCadernoSelector(marking, cadernoName) {
    const days = [["dia1", DAY1, ["lc", "ch"]], ["dia2", DAY2, ["cn", "mt"]]];

    days.forEach(([id, cadernos, sections]) => {
      const boxes = sections.map($).filter(Boolean);
      const available = cadernos.filter((c) => boxes.some((b) => b.querySelector(`[data-caderno="${c}"]`)));
      const label = $(`sel-${id}`);
      const select = $(`caderno-${id}`);
      if (!label || !select || available.length < 2) return;

      label.hidden = false;
      available.forEach((c) => select.appendChild(el("option", cadernoName(c), { value: c })));

      const key = `caderno:${jsonUrl}:${id}`;
      const saved = storage(key);
      if (saved && available.includes(saved)) select.value = saved;

      const apply = () => {
        const chosen = select.value;
        boxes.forEach((b) => b.querySelectorAll("[data-caderno]").forEach((group) => {
          group.hidden = !!chosen && group.dataset.caderno !== chosen;
        }));
        storage(key, chosen);
        marking.refresh();
      };
      select.addEventListener("change", apply);
      apply();
    });
  }

  function start() {
    if (!jsonUrl) {
      console.error("processing.js: falta o atributo data-json na tag <script>.");
      return;
    }
    fetch(jsonUrl)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(render)
      .catch((err) => {
        const info = $("info-dados");
        if (info) info.appendChild(el("p", `${jsonUrl}: ${err.message}`, { class: "erro" }));
        console.error(err);
      });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
