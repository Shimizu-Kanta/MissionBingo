export function navigate(path: string, options: { replace?: boolean; state?: unknown } = {}) {
  if (options.replace) history.replaceState(options.state ?? null, "", path);
  else history.pushState(options.state ?? null, "", path);
  dispatchEvent(new PopStateEvent("popstate"));
}
