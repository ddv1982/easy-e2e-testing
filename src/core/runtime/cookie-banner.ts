import type { BrowserContext } from "playwright";
import {
  COOKIE_CONSENT_CMP_SELECTORS,
  COOKIE_CONSENT_DISMISS_TEXTS,
} from "./cookie-consent-patterns.js";

function escapeForRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildDismissScript(): string {
  const selectorsJson = JSON.stringify([...COOKIE_CONSENT_CMP_SELECTORS]);
  const pattern = COOKIE_CONSENT_DISMISS_TEXTS
    .map((text) => escapeForRegex(text))
    .join("|");

  return `
(function() {
  var SELECTORS = ${selectorsJson};

  var ACCEPT_PATTERNS = /^(${pattern})$/i;

  var dismissed = false;

  function tryDismiss() {
    if (dismissed) return true;
    for (var i = 0; i < SELECTORS.length; i++) {
      try {
        var el = document.querySelector(SELECTORS[i]);
        if (el && el.offsetParent !== null) {
          el.click();
          dismissed = true;
          return true;
        }
      } catch (e) { /* ignore */ }
    }
    // Fallback: text matching inside cookie/consent containers
    var containers = document.querySelectorAll(
      '[class*="cookie"], [class*="consent"], [id*="cookie"], [id*="consent"], [class*="gdpr"], [id*="gdpr"], [class*="cmp-"], [id*="cmp-"], [class*="cmp_"], [id*="cmp_"], [role="dialog"], [role="alertdialog"]'
    );
    for (var c = 0; c < containers.length; c++) {
      var buttons = containers[c].querySelectorAll('button, [role="button"], a');
      for (var b = 0; b < buttons.length; b++) {
        var text = (buttons[b].textContent || '').trim();
        if (ACCEPT_PATTERNS.test(text)) {
          buttons[b].click();
          dismissed = true;
          return true;
        }
      }
    }
    return false;
  }

  function init() { setTimeout(tryDismiss, 200); }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  var observer = new MutationObserver(function() {
    if (tryDismiss()) observer.disconnect();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  setTimeout(function() { observer.disconnect(); }, 10000);
})();
`;
}

const COOKIE_BANNER_DISMISS_SCRIPT = buildDismissScript();

export async function installCookieBannerDismisser(context: BrowserContext): Promise<void> {
  await context.addInitScript(COOKIE_BANNER_DISMISS_SCRIPT);
}
