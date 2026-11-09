// Bottom sheet: a fixed-width panel centred at the bottom over a dimmed page.
import { h } from "./dom.js";

const openSheets = new Set();

// Route changes close any open sheet so it never covers the next screen.
export function closeAllSheets() {
  [...openSheets].forEach((sheet) => sheet.close());
}

export function openSheet({ title, content, onClose } = {}) {
  const panel = h(
    "div.sheet",
    { role: "dialog", "aria-modal": "true", "aria-label": title || "Sheet" },
    h("div.sheet-handle"),
    title ? h("div.sheet-title", {}, title) : null,
    h("div.sheet-body", {}, content)
  );
  const backdrop = h("div.sheet-backdrop", {}, panel);
  let closed = false;

  function close() {
    if (closed) return;
    closed = true;
    openSheets.delete(handle);
    backdrop.classList.remove("is-open");
    backdrop.classList.add("is-closing");
    setTimeout(() => backdrop.remove(), 260);
    onClose?.();
  }

  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) close();
  });

  // Drag the handle area down to dismiss.
  let startY = null;
  panel.addEventListener(
    "touchstart",
    (event) => {
      const body = panel.querySelector(".sheet-body");
      startY = body && body.scrollTop > 0 ? null : event.touches[0].clientY;
    },
    { passive: true }
  );
  panel.addEventListener(
    "touchmove",
    (event) => {
      if (startY === null) return;
      const dy = Math.max(0, event.touches[0].clientY - startY);
      panel.style.transform = `translateY(${dy}px)`;
    },
    { passive: true }
  );
  panel.addEventListener("touchend", (event) => {
    if (startY === null) return;
    const dy = (event.changedTouches[0]?.clientY || startY) - startY;
    panel.style.transform = "";
    startY = null;
    if (dy > 90) close();
  });

  const handle = { close, panel };
  openSheets.add(handle);
  document.body.append(backdrop);
  requestAnimationFrame(() => backdrop.classList.add("is-open"));
  return handle;
}

export function optionList(options, { selected, onSelect } = {}) {
  return h(
    "div.option-list",
    {},
    options.map((option) =>
      h(
        "button.option",
        {
          type: "button",
          class: option.value === selected ? "is-selected" : "",
          onclick: () => onSelect?.(option.value)
        },
        h("span", {}, option.label),
        option.value === selected ? h("span.option-check", { html: "&#10003;" }) : null
      )
    )
  );
}

export function toast(message) {
  const el = h("div.toast", { role: "status" }, message);
  document.body.append(el);
  requestAnimationFrame(() => el.classList.add("is-open"));
  setTimeout(() => {
    el.classList.remove("is-open");
    setTimeout(() => el.remove(), 300);
  }, 2600);
}
