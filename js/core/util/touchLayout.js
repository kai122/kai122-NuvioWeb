// True on touch-first devices such as iPad. Their CSS pixel is a real point
// (the same size as an Android dp), unlike the 1920px TV canvas this UI was
// designed for, so layout code uses this to pick native-app sizes.
export function prefersTouchLayout() {
  try {
    return Boolean(globalThis.matchMedia?.("(pointer: coarse)")?.matches);
  } catch (_) {
    return false;
  }
}
