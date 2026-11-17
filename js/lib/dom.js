// DOM 생성 헬퍼. 화면 요소는 문자열 HTML 이 아니라 이 함수로 만든다.
// 값은 텍스트 노드로 들어가므로 따로 이스케이프할 필요가 없다.
//   mk("td", { class: "num" }, 123)
//   mk("button", { type: "button", onclick: handler }, "불러오기")
export function mk(tag, attrs, ...children) {
  const node = document.createElement(tag);
  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (value == null || value === false) continue;
      if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
      else if (value === true) node.setAttribute(key, "");
      else node.setAttribute(key, value);
    }
  }
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}
