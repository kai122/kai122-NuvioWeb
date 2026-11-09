import { h, fill } from "../dom.js";
import { store } from "../store.js";
import { posterCard, pageHeader, emptyState } from "../components.js";

export function renderLibrary() {
  const content = h("div");
  const root = h(
    "div.screen.screen-library",
    {},
    pageHeader("Library"),
    h("div.segmented", {}, h("button.segment.is-selected", { type: "button" }, "Saved")),
    content
  );
  return {
    el: root,
    onShow() {
      const items = store.library();
      fill(
        content,
        items.length
          ? h(
              "div.poster-grid",
              {},
              items.map((item) => posterCard(item))
            )
          : emptyState(
              "Your library is empty",
              "Saved titles will appear here when you tap + on a details screen."
            )
      );
    }
  };
}
