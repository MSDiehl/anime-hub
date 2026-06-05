const ALLOWED_TAGS = new Set([
  "a",
  "b",
  "br",
  "em",
  "i",
  "li",
  "ol",
  "p",
  "strong",
  "ul",
]);

const DROP_WITH_CONTENT = new Set(["embed", "iframe", "object", "script", "style"]);

export function sanitizeAniListHtml(html: string | null | undefined) {
  if (!html || typeof document === "undefined") return "";

  const template = document.createElement("template");
  template.innerHTML = html;
  sanitizeChildren(template.content);

  return template.innerHTML;
}

function sanitizeChildren(parent: ParentNode) {
  for (const child of Array.from(parent.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) continue;

    if (child.nodeType !== Node.ELEMENT_NODE) {
      child.remove();
      continue;
    }

    const element = child as HTMLElement;
    const tagName = element.tagName.toLowerCase();

    if (DROP_WITH_CONTENT.has(tagName)) {
      element.remove();
      continue;
    }

    sanitizeChildren(element);

    if (!ALLOWED_TAGS.has(tagName)) {
      element.replaceWith(...Array.from(element.childNodes));
      continue;
    }

    sanitizeAttributes(element, tagName);
  }
}

function sanitizeAttributes(element: HTMLElement, tagName: string) {
  const rawHref = tagName === "a" ? (element.getAttribute("href") ?? "") : "";

  for (const attribute of Array.from(element.attributes)) {
    element.removeAttribute(attribute.name);
  }

  if (tagName !== "a") return;

  if (!isSafeHref(rawHref)) return;

  element.setAttribute("href", rawHref);
  element.setAttribute("target", "_blank");
  element.setAttribute("rel", "noreferrer");
}

function isSafeHref(href: string) {
  if (!href) return false;

  try {
    const url = new URL(href, window.location.origin);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
