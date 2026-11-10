import { h, icon, prefersReducedMotion, fill } from "../dom.js";
import { store } from "../store.js";
import { avatarEl } from "../tabbar.js";
import { openSheet } from "../sheet.js";
import { account } from "../services/nuvioAccount.js";
import { openSignIn } from "../signin.js";

// "Who's watching?" gate. onChosen(profile) is called after the exit motion.
export function renderProfiles({ onChosen }) {
  let managing = false;
  const grid = h("div.picker-grid");
  const manage = h(
    "button.picker-manage",
    { type: "button", onclick: () => setManaging(!managing) },
    "Manage Profiles"
  );
  const root = h(
    "div.screen.screen-picker",
    {},
    h("div.picker-glow"),
    h(
      "div.picker-inner",
      {},
      h("img.picker-logo", { src: "../assets/brand/app_logo_wordmark.png", alt: "Nuvio" }),
      h("h1.picker-title", {}, "Who's watching?"),
      grid,
      manage,
      account()
        ? null
        : h(
            "button.picker-manage.is-signin",
            {
              type: "button",
              onclick: (event) => {
                const button = event.currentTarget;
                openSignIn({
                  onDone: () => {
                    button.hidden = true;
                    draw();
                  }
                });
              }
            },
            "Sign in with Nuvio"
          )
    )
  );

  function setManaging(value) {
    managing = value;
    manage.textContent = managing ? "Done" : "Manage Profiles";
    draw();
  }

  function addProfile() {
    const input = h("input.text-field", {
      type: "text",
      placeholder: "Name",
      maxlength: "20",
      autocomplete: "off"
    });
    const submit = h(
      "button.play-button.is-wide",
      { type: "button" },
      h("span", {}, "Create profile")
    );
    const sheet = openSheet({ title: "New profile", content: h("div.form", {}, input, submit) });
    const create = () => {
      const profile = store.addProfile(input.value);
      sheet.close();
      if (!managing && store.profiles().length === 1) choose(profile);
      else draw();
    };
    submit.addEventListener("click", create);
    input.addEventListener("keydown", (event) => event.key === "Enter" && create());
    setTimeout(() => input.focus(), 300);
  }

  function choose(profile, card) {
    if (managing) return;
    const finish = () => onChosen(profile);
    if (!card || prefersReducedMotion()) return finish();
    root.classList.add("is-choosing");
    card.classList.add("is-chosen");
    const box = card.getBoundingClientRect();
    const dx = window.innerWidth / 2 - (box.left + box.width / 2);
    card.animate(
      [{ transform: "translateX(0) scale(1)" }, { transform: `translateX(${dx}px) scale(1.08)` }],
      {
        duration: 450,
        easing: "cubic-bezier(0.2, 0, 0, 1)",
        fill: "forwards"
      }
    );
    setTimeout(
      () =>
        root
          .animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: "forwards" })
          .finished.then(finish),
      650
    );
  }

  function draw() {
    const profiles = store.profiles();
    fill(
      grid,
      ...profiles.map((profile) => {
        const card = h(
          "button.picker-card",
          { type: "button", onclick: () => choose(profile, card) },
          h("span.picker-avatar", {}, avatarEl(profile, 104)),
          h("span.picker-name", {}, profile.name),
          managing
            ? h(
                "span.picker-delete",
                {
                  role: "button",
                  "aria-label": `Delete ${profile.name}`,
                  onclick: (event) => {
                    event.stopPropagation();
                    if (
                      confirm(
                        `Delete ${profile.name}? Their library and progress on this device are removed.`
                      )
                    ) {
                      store.removeProfile(profile.id);
                      draw();
                    }
                  }
                },
                icon("close", 18)
              )
            : null
        );
        return card;
      }),
      managing || !profiles.length
        ? h(
            "button.picker-card.is-add",
            { type: "button", onclick: addProfile },
            h("span.picker-avatar.picker-add", {}, icon("add", 40)),
            h("span.picker-name", {}, "Add Profile")
          )
        : null
    );
    manage.classList.toggle("is-hidden", !profiles.length);
  }

  draw();
  return { el: root };
}

export function showSplash() {
  return new Promise((resolve) => {
    const splash = h(
      "div.splash",
      {},
      h("div.splash-glow"),
      h("img.splash-logo", { src: "../assets/brand/app_logo_wordmark.png", alt: "Nuvio" })
    );
    document.body.append(splash);
    const hold = prefersReducedMotion() ? 300 : 1200;
    setTimeout(() => {
      splash.classList.add("is-leaving");
      setTimeout(() => {
        splash.remove();
        resolve();
      }, 300);
    }, hold);
  });
}
