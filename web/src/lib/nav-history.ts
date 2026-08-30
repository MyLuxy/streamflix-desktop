// own back stack, history.back() gets polluted by player iframe redirects
const MAX = 50;
const stack: string[] = [];

let suppressNextPush = false;

const pathnameOf = (p: string) => p.split("?")[0];

const routeInfo = (p: string) => {
  const parts = pathnameOf(p).split("/").filter(Boolean);
  if (parts.length >= 3) {
    const slug = parts[2] || "";
    return { type: parts[1], id: slug.split("-")[0], slug };
  }
  return null;
};

export function recordPath(path: string) {
  if (suppressNextPush) {
    suppressNextPush = false;
    if (stack.length) stack[stack.length - 1] = path;
    else stack.push(path);
    return;
  }

  const top = stack[stack.length - 1];
  if (path === top) return;

  if (top && pathnameOf(top) === pathnameOf(path)) {
    stack[stack.length - 1] = path;
    return;
  }

  const cur = routeInfo(path);
  const prev = top ? routeInfo(top) : null;
  if (cur && prev && cur.type === prev.type && cur.id === prev.id && cur.slug !== prev.slug) {
    stack[stack.length - 1] = path;
    return;
  }

  if (stack.length >= 2 && pathnameOf(stack[stack.length - 2]) === pathnameOf(path)) {
    stack.pop();
    stack[stack.length - 1] = path;
    return;
  }

  stack.push(path);
  if (stack.length > MAX) stack.shift();
}

export function getPreviousPath(): string {
  return stack.length >= 2 ? stack[stack.length - 2] : "";
}

// sets suppressNextPush so the router.push this triggers doesnt push again (avoids A/B loops)
export function popPreviousPath(): string {
  if (stack.length >= 2) {
    stack.pop();
    suppressNextPush = true;
    return stack[stack.length - 1];
  }
  return "";
}
