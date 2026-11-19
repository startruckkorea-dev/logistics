// DOM 생성 헬퍼. 화면 요소는 문자열 HTML 이 아니라 이 함수로 만든다.
// 값은 텍스트 노드로 들어가므로 따로 이스케이프할 필요가 없다.
//   mk("td", { class: "num" }, 123)
//   mk("button", { type: "button", onclick: handler }, "불러오기")
//   mk("div", { style: "--c:var(--s1);width:40%" })
// style 은 속성이 아니라 스타일 객체(cssText)로 넣는다. CSP(style-src 'self')는 style 속성을 막지만
// 스크립트가 스타일 객체에 대입하는 것은 막지 않는다.
const SVG_NS = "http://www.w3.org/2000/svg";

function build(node, attrs, children) {
  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (value == null || value === false) continue;
      if (key === "style") node.style.cssText = value;
      else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
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

export function mk(tag, attrs, ...children) {
  return build(document.createElement(tag), attrs, children);
}

/** SVG 요소. 사용법은 mk 와 같다. */
export function mkSvg(tag, attrs, ...children) {
  return build(document.createElementNS(SVG_NS, tag), attrs, children);
}
