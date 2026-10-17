export const slugify = (text) => {
  if (typeof text !== "string") return "";

  return text
    .toLowerCase()
    .replace(/c\+\+/g, "cpp")
    .replace(/c#/g, "csharp")
    .replace(/&/g, " and ")
    .trim()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80)
    .replace(/-$/, "");
};
