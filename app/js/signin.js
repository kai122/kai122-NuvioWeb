// "Sign in with Nuvio" sheet, used by Settings and the profile picker.
import { h, icon, fill, safeHttpUrl } from "./dom.js";
import { openSheet, toast } from "./sheet.js";
import {
  startSignIn,
  downloadAccount,
  account,
  signOutEverywhere
} from "./services/nuvioAccount.js";

export function summaryText(sum) {
  if (!sum) return "";
  return `${sum.profiles} profile${sum.profiles === 1 ? "" : "s"} • ${sum.addons} add-ons • ${sum.progress} in progress • ${sum.watched} watched • ${sum.library} saved`;
}

export async function runDownload({ quiet = false } = {}) {
  if (!quiet) toast("Downloading your Nuvio account…");
  try {
    const sum = await downloadAccount();
    if (!quiet) toast(`Synced: ${summaryText(sum)}`);
    return sum;
  } catch (error) {
    toast(`Sync failed: ${error.message}`);
    return null;
  }
}

export function openSignIn({ onDone, onFail } = {}) {
  const status = h("div.signin-status", {}, h("span.spinner"), h("span", {}, "Starting sign-in…"));
  const body = h("div.signin-body", {}, status);
  let session = null;
  const sheet = openSheet({
    title: "Sign in with Nuvio",
    content: h(
      "div.form",
      {},
      h(
        "p.form-hint",
        {},
        "Approve this sign-in with your Nuvio account. Your profiles, add-ons, Continue Watching, watched history and library are then downloaded to this iPad."
      ),
      body
    ),
    onClose: () => session?.cancel()
  });
  startSignIn()
    .then(async (s) => {
      session = s;
      fill(
        body,
        h("div.signin-code", {}, s.code),
        h(
          "a.play-button.is-wide",
          {
            href: safeHttpUrl(s.url) || "https://nuvio.tv/tv-login",
            target: "_blank",
            rel: "noopener noreferrer"
          },
          icon("external", 20),
          h("span", {}, "Open nuvio.tv to approve")
        ),
        h(
          "p.form-hint",
          {},
          "Or open nuvio.tv/tv-login on your phone. Come back here once you've approved."
        ),
        status
      );
      fill(status, h("span.spinner"), h("span", {}, "Waiting for approval…"));
      const ok = await s.finish();
      if (!ok) {
        fill(status, h("span", {}, "The code expired. Close this and try again."));
        return;
      }
      fill(status, h("span.spinner"), h("span", {}, "Signed in. Downloading your account…"));
      const sum = await runDownload({ quiet: true });
      sheet.close();
      if (sum) {
        toast(`Synced: ${summaryText(sum)}`);
        onDone?.(sum);
      } else onFail?.();
    })
    .catch((error) => fill(status, h("span", {}, `Couldn't sign in: ${error.message}`)));
}

// "Sign Out" confirmation, used by Settings and the profile picker.
export function confirmSignOut({ onDone } = {}) {
  const acct = account();
  if (!acct) return;
  const sheet = openSheet({
    title: "Sign out of Nuvio?",
    content: h(
      "div.form",
      {},
      h(
        "p.form-hint",
        {},
        `Signed in as ${acct.email || "your Nuvio account"}. Your profiles, add-ons, library and progress stay safe in your account and are removed from this device. Sign in again any time to bring them back.`
      ),
      h(
        "div.form-actions",
        {},
        h("button.pill-button", { type: "button", onclick: () => sheet.close() }, "Cancel"),
        h(
          "button.play-button.is-danger",
          {
            type: "button",
            onclick: async (event) => {
              event.currentTarget.disabled = true;
              await signOutEverywhere();
              sheet.close();
              toast("Signed out");
              window.dispatchEvent(new Event("nuvio:addons-changed"));
              onDone?.();
            }
          },
          "Sign Out"
        )
      )
    )
  });
}
