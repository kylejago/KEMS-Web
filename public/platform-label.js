const PLATFORM_LABEL = "Alpha7";

function refreshPlatformLabels(root = document) {
  const selectors = [".brand small", ".eyebrow", ".site-footer strong", ".site-footer span", ".page-heading p", ".strategy-content p", ".scenario-unavailable p"];
  root.querySelectorAll?.(selectors.join(",")).forEach((element) => {
    const current = element.textContent || "";
    const next = current
      .replace(/KEMS 0\.7\.0-alpha6/gi, "KEMS 0.7.0-alpha7")
      .replace(/KEMS alpha6/gi, `KEMS ${PLATFORM_LABEL}`)
      .replace(/alpha6 model/gi, "Alpha7 model")
      .replace(/alpha6 proposal/gi, "Alpha7 proposal");
    if (next !== current) element.textContent = next;
  });
}

refreshPlatformLabels();
new MutationObserver(() => refreshPlatformLabels()).observe(document.body, { childList: true, subtree: true });
