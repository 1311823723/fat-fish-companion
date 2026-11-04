export function displayCaption(caption, place) {
  const text = String(caption || "").trim();
  return /想象|虚拟|AI生成|人工智能|生成的插画|旅行插画/.test(text)
    ? "我去" + String(place || "外面").slice(0, 60) + "逛了一圈，给你看看照片。"
    : text.slice(0, 200);
}
