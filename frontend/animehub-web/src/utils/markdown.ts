function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function isSafeUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function renderMarkdown(value: string) {
  let html = escapeHtml(value.trim());

  html = html.replace(
    /\[spoiler\]([\s\S]*?)\[\/spoiler\]/gi,
    '<span class="mdSpoiler">$1</span>',
  );
  html = html.replace(
    /&gt;!([\s\S]*?)!&lt;/g,
    '<span class="mdSpoiler">$1</span>',
  );
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    (_match, label: string, url: string) => {
      if (!isSafeUrl(url.replaceAll("&amp;", "&"))) return label;
      return `<a href="${url}" target="_blank" rel="noreferrer">${label}</a>`;
    },
  );

  return html.replace(/\n/g, "<br />");
}
