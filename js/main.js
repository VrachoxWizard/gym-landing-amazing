(() => {
  "use strict";
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------------------------------------------------------
     1. Split headings into words / chars
     --------------------------------------------------------- */
  function splitNode(node, mode, units) {
    [...node.childNodes].forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        const frag = document.createDocumentFragment();
        const parts = child.textContent.split(/(\s+)/);
        parts.forEach((part) => {
          if (!part) return;
          if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(" ")); return; }
          if (mode === "chars") {
            const word = document.createElement("span");
            word.style.display = "inline-block";
            word.style.whiteSpace = "nowrap";
            [...part].forEach((ch) => {
              const s = document.createElement("span");
              s.className = "split-u";
              s.textContent = ch;
              word.appendChild(s);
              units.push(s);
            });
            frag.appendChild(word);
          } else {
            const s = document.createElement("span");
            s.className = "split-u";
            s.textContent = part;
            frag.appendChild(s);
            units.push(s);
          }
        });
        child.replaceWith(frag);
      } else if (child.nodeType === Node.ELEMENT_NODE && child.tagName !== "BR") {
        splitNode(child, mode, units);
      }
    });
  }

  document.querySelectorAll("[data-split]").forEach((el) => {
    const mode = el.dataset.split;
    const units = [];
    splitNode(el, mode, units);
    // optional per-letter spacing fixes (px), measured against the reference
    el.querySelectorAll("[data-kern]").forEach((line) => {
      const k = line.dataset.kern.split(",").map(Number);
      line.querySelectorAll(".split-u").forEach((u, i) => { if (k[i]) u.style.marginLeft = `${k[i]}px`; });
    });
    // timings measured from the reference video
    const step = mode === "chars" ? 0.06 : 0.1;
    units.forEach((u, i) => { u.style.transitionDelay = `${(i * step).toFixed(3)}s`; });
  });

  /* ---------------------------------------------------------
     2. Reveal on scroll
     An element reveals ~0.95s after it (or its trigger) is fully
     in view — the same cadence as the reference video.
     --------------------------------------------------------- */
  const REVEAL_DELAY = 950;
  document.querySelectorAll(".card__media img, .guidance img, .plan-detail__img, .footer__imgs img")
    .forEach((img) => img.setAttribute("data-zoom", ""));

  const reveal = (el) => {
    if (el.classList.contains("in")) return;
    el.classList.add("in");
  };
  const triggers = new Map(); // trigger element -> [{el, delay}]
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      io.unobserve(e.target);
      (triggers.get(e.target) || []).forEach(({ el, delay }) => {
        setTimeout(() => reveal(el), reduce ? 0 : delay);
      });
    });
  }, { threshold: 0.99 });
  const watch = (el, trigger = el, delay = REVEAL_DELAY) => {
    if (!triggers.has(trigger)) { triggers.set(trigger, []); io.observe(trigger); }
    triggers.get(trigger).push({ el, delay });
  };

  document.querySelectorAll("[data-split]:not(.hero__title)").forEach((el) => watch(el));
  // images ease out of their zoom as soon as a good part of them is visible
  // (they are scaled inside overflow:hidden, so they never reach 99%)
  const zoomIO = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      zoomIO.unobserve(e.target);
      reveal(e.target);
    });
  }, { threshold: 0.3 });
  document.querySelectorAll("[data-zoom]").forEach((el) => zoomIO.observe(el));
  // counters: 10K+ follows its own box, the other three follow the
  // "years" box and come in 0.2s apart
  const members = document.querySelector(".stat--members .stat__num");
  if (members) watch(members, members.closest(".stat"), 950);
  const yearsBox = document.querySelector(".stat--years");
  [".stat--trainers", ".stat--programs", ".stat--years"].forEach((sel, i) => {
    const n = document.querySelector(`${sel} .stat__num`);
    if (n && yearsBox) watch(n, yearsBox, 850 + i * 200);
  });

  // hero headline animates as soon as the page (and its fonts) are ready
  const heroTitle = document.querySelector(".hero__title");
  const startHero = () => requestAnimationFrame(() => heroTitle.classList.add("in"));
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(startHero); else startHero();

  /* ---------------------------------------------------------
     3. Stat numbers (10K+, 25+, 15+, 16+)
     Each glyph sits in its own cell: digits get tabular cells
     like the reference, and "1" is widened to its wider flag.
     --------------------------------------------------------- */
  function buildCells(numEl) {
    const text = numEl.textContent;
    numEl.textContent = "";
    numEl.setAttribute("aria-label", text);
    [...text].forEach((ch) => {
      const cell = document.createElement("span");
      cell.className = "roll";
      cell.setAttribute("aria-hidden", "true");
      const inner = document.createElement("span");
      inner.textContent = ch;
      inner.dataset.ch = ch;
      cell.appendChild(inner);
      numEl.appendChild(cell);
    });
  }
  function sizeCells(numEl) {
    const probe = document.createElement("span");
    probe.style.cssText = "position:absolute;visibility:hidden;white-space:pre";
    numEl.appendChild(probe);
    let cell = 0;
    for (let d = 0; d < 10; d++) {
      probe.textContent = String(d);
      cell = Math.max(cell, probe.getBoundingClientRect().width);
    }
    numEl.querySelectorAll(".roll > span").forEach((inner) => {
      const ch = inner.dataset.ch;
      probe.textContent = ch;
      // cell widths kerned to the reference (narrow "1" and "0" cells)
      const em = parseFloat(getComputedStyle(numEl).fontSize) / 168;
      const trim = ch === "1" ? 3 : ch === "0" ? 2 : 0;
      const w = /\d/.test(ch) ? cell - trim * em : probe.getBoundingClientRect().width;
      inner.parentElement.style.width = `${w}px`;
      inner.parentElement.classList.toggle("is-one", ch === "1");
    });
    probe.remove();
  }
  document.querySelectorAll("[data-count] .num").forEach(buildCells);
  const sizeAll = () => document.querySelectorAll("[data-count] .num").forEach(sizeCells);
  sizeAll();
  if (document.fonts) document.fonts.ready.then(sizeAll);
  window.addEventListener("resize", sizeAll);

  /* ---------------------------------------------------------
     4. Travelling dots — hero grid
     --------------------------------------------------------- */
  const grid = document.querySelector("[data-grid]");
  const dotLayer = document.querySelector("[data-grid-dots]");
  if (grid && dotLayer) {
    const ys = [105, 398, 690];
    const xsFor = () => {
      const w = grid.clientWidth;
      const g = parseFloat(getComputedStyle(grid.parentElement).getPropertyValue("--gx1")) || 163;
      return [g, w / 2, w - g];
    };
    const dots = [];
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const d = document.createElement("i");
        d.className = "dot";
        dotLayer.appendChild(d);
        dots.push({ el: d, r, c });
      }
    }
    const place = () => {
      const xs = xsFor();
      dots.forEach((d) => { d.el.style.left = `${xs[d.c]}px`; d.el.style.top = `${ys[d.r]}px`; });
    };
    place();
    window.addEventListener("resize", place);
    if (!reduce) {
      // each dot slides to a neighbouring intersection and back, so at rest
      // every intersection is occupied (as in the reference)
      const home = dots.map((d) => ({ r: d.r, c: d.c }));
      let phase = 0;
      const out = () => {
        phase++;
        dots.forEach((d, i) => {
          const h = home[i];
          const horizontal = (i + phase) % 2 === 0;
          if (horizontal) d.c = h.c === 1 ? (i % 2 ? 0 : 2) : 1;
          else d.r = h.r === 1 ? (i % 2 ? 2 : 0) : 1;
        });
        place();
        setTimeout(() => { dots.forEach((d, i) => { d.r = home[i].r; d.c = home[i].c; }); place(); }, 1300);
      };
      setTimeout(() => { out(); setInterval(out, 4200); }, 900);
    }
  }

  /* ---------------------------------------------------------
     5. Travelling dots — bordered boxes (corners)
     --------------------------------------------------------- */
  const CORNERS = ["tl", "tr", "br", "bl"];
  const POS = { tl: [0, 0], tr: [100, 0], br: [100, 100], bl: [0, 100] };
  document.querySelectorAll("[data-dots]").forEach((box, bi) => {
    const list = box.dataset.dots.split(/\s+/);
    const dots = list.map((corner) => {
      const d = document.createElement("i");
      d.className = "dot";
      d.setAttribute("aria-hidden", "true");
      box.appendChild(d);
      return { el: d, k: CORNERS.indexOf(corner) };
    });
    const place = () => dots.forEach((d) => {
      const [x, y] = POS[CORNERS[d.k]];
      d.el.style.left = `calc(${x}% + ${x ? 0 : -1}px)`;
      d.el.style.top = `calc(${y}% + ${y ? 0 : -1}px)`;
    });
    place();
    if (!reduce) {
      const home = dots.map((d) => d.k);
      let n = 0;
      const out = () => {
        n++;
        dots.forEach((d, i) => { d.k = (home[i] + ((i + n + bi) % 2 ? 1 : 3)) % 4; });
        place();
        setTimeout(() => { dots.forEach((d, i) => { d.k = home[i]; }); place(); }, 1300);
      };
      setTimeout(() => { out(); setInterval(out, 4200 + bi * 300); }, 600 + bi * 200);
    }
  });

  /* ---------------------------------------------------------
     6. Marquees
     --------------------------------------------------------- */
  document.querySelectorAll("[data-marquee]").forEach((m) => {
    const track = m.querySelector(".marquee__track");
    const original = [...track.children];
    const speed = parseFloat(m.dataset.speed) || 50;
    // duplicate until the track is at least 2x the viewport
    const fill = () => {
      while (track.scrollWidth < m.clientWidth * 2 + 400) {
        original.forEach((n) => {
          const c = n.cloneNode(true);
          c.setAttribute("aria-hidden", "true");
          track.appendChild(c);
        });
      }
    };
    fill();
    let cycle = 0;
    const measure = () => {
      const first = original[0];
      const nextCopy = track.children[original.length];
      cycle = nextCopy ? nextCopy.offsetLeft - first.offsetLeft : track.scrollWidth / 2;
    };
    measure();
    window.addEventListener("resize", () => { fill(); measure(); });
    if (reduce) return;
    // phase: the anchor item sits at `anchor-x` (viewport px) `anchor-t` seconds after load
    const delay = parseFloat(m.dataset.delay) || 0;
    const anchor = track.children[parseInt(m.dataset.anchor, 10) || 0];
    const ax = parseFloat(m.dataset.anchorX) || 0;
    const at = parseFloat(m.dataset.anchorT) || 0;
    const t0 = 0; // time origin = navigation start
    let base = 0;
    const layout = () => {
      base = ax - m.getBoundingClientRect().left - (anchor.offsetLeft - track.children[0].offsetLeft);
    };
    layout();
    window.addEventListener("resize", layout);
    if (document.fonts) document.fonts.ready.then(() => { fill(); measure(); layout(); });
    const posAt = (sec) => {
      const moving = Math.max(0, sec - delay) - Math.max(0, at - delay);
      let x = base - speed * moving;
      if (cycle) { x %= cycle; if (x > 0) x -= cycle; }
      return x;
    };
    const tick = (t) => {
      track.style.transform = `translate3d(${posAt((t - t0) / 1000).toFixed(2)}px,0,0)`;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  /* ---------------------------------------------------------
     7. Trainers — active card shows socials
     --------------------------------------------------------- */
  const trainers = [...document.querySelectorAll(".trainer")];
  trainers.forEach((t) => {
    t.addEventListener("mouseenter", () => {
      trainers.forEach((o) => o.classList.toggle("is-active", o === t));
    });
  });

  /* ---------------------------------------------------------
     8. Pricing — period toggle + plan select
     --------------------------------------------------------- */
  const PLANS = {
    basic: { title: "For getting started:", items: ["Access to gym floor", "Locker room access", "2 group classes / month", "Fitness assessment", "Mobile app tracking", "Email support"] },
    pro: { title: "For consistent progress:", items: ["Everything in basic", "Access to all gym areas", "Group classes (unlimited)", "1 personal training session", "Nutrition guidance", "Priority support"] },
    elite: { title: "For maximum results:", items: ["Everything in pro", "Unlimited personal training", "Custom meal planning", "Recovery & spa access", "Quarterly body scans", "Dedicated coach"] },
  };
  const detail = document.querySelector(".plan-detail");
  const dTitle = document.querySelector("[data-detail-title]");
  const dList = document.querySelector("[data-detail-list]");
  const plans = [...document.querySelectorAll(".plan")];
  plans.forEach((p) => p.addEventListener("click", () => {
    if (p.classList.contains("is-on")) return;
    plans.forEach((o) => o.classList.toggle("is-on", o === p));
    const data = PLANS[p.dataset.plan];
    detail.classList.add("is-swapping");
    setTimeout(() => {
      dTitle.textContent = data.title;
      dList.innerHTML = data.items.map((i) => `<li>${i}</li>`).join("");
      detail.classList.remove("is-swapping");
    }, 260);
  }));

  const toggles = [...document.querySelectorAll(".toggle button")];
  toggles.forEach((b) => b.addEventListener("click", () => {
    const yearly = b.dataset.period === "yearly";
    toggles.forEach((o) => {
      o.classList.toggle("is-on", o === b);
      o.setAttribute("aria-selected", String(o === b));
    });
    document.querySelectorAll(".plan .amt").forEach((a) => { a.textContent = yearly ? a.dataset.y : a.dataset.m; });
    document.querySelectorAll("[data-per]").forEach((s) => { s.textContent = yearly ? "Per year" : "Per month"; });
  }));
})();
