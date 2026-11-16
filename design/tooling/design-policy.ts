import ts from "typescript";

export type DesignFinding = { rule: string; file: string; line: number; message: string };
const utilityRules = [
  ["DG001", /(?:^|\s|:)bg-clip-text(?:\s|$)/, "Use a solid text color."],
  ["DG002", /(?:^|\s|:)glass-panel(?:\s|$)/, "Use an opaque semantic surface."],
  ["DG003", /(?:^|\s|:)animate-(?:bounce|ping)(?:\s|$)/, "Remove idle decorative motion."],
  ["DG006", /(?:^|\s|:)shadow-\[/, "Use shared elevation tokens on floating overlays."],
] as const;

/** Structural lint catches specific defects; it does not score taste or infer user intent. */
export function inspectDesignSource(source: string, file: string): DesignFinding[] {
  const tree = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  const findings: DesignFinding[] = [];
  const add = (rule: string, node: ts.Node, message: string) =>
    findings.push({
      rule,
      file,
      line: tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1,
      message,
    });
  const imports = new Map<string, string>();
  const anchors = new Set(["a"]);
  for (const statement of tree.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !statement.importClause?.namedBindings ||
      !ts.isNamedImports(statement.importClause.namedBindings)
    )
      continue;
    for (const specifier of statement.importClause.namedBindings.elements) {
      imports.set(specifier.name.text, specifier.propertyName?.text ?? specifier.name.text);
      if (
        ts.isStringLiteral(statement.moduleSpecifier) &&
        statement.moduleSpecifier.text === "@tanstack/react-router" &&
        (specifier.propertyName?.text ?? specifier.name.text) === "Link"
      )
        anchors.add(specifier.name.text);
      if ((specifier.propertyName?.text ?? specifier.name.text) === "Sparkles")
        add("DG005", specifier, "Represent agents without a magic metaphor.");
    }
  }
  function isTrue(attribute: ts.JsxAttribute): boolean {
    if (!attribute.initializer) return true;
    return !(
      ts.isJsxExpression(attribute.initializer) &&
      attribute.initializer.expression?.kind === ts.SyntaxKind.FalseKeyword
    );
  }
  function visit(node: ts.Node) {
    if (ts.isStringLiteralLike(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      for (const [rule, pattern, message] of utilityRules)
        if (pattern.test(node.text)) add(rule, node, message);
    }
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(tree);
      if (tag === "video") {
        const auto = node.attributes.properties.find(
          (a) => ts.isJsxAttribute(a) && a.name.getText(tree) === "autoPlay"
        );
        const controls = node.attributes.properties.find(
          (a) => ts.isJsxAttribute(a) && a.name.getText(tree) === "controls"
        );
        if (auto && ts.isJsxAttribute(auto) && isTrue(auto))
          add("DG004", auto, "Video must start paused.");
        // A direct source URL identifies an authored playback surface, not a generated user attachment.
        const source = node.attributes.properties.some(
          (a) => ts.isJsxAttribute(a) && a.name.getText(tree) === "src"
        );
        if (source && (!controls || !ts.isJsxAttribute(controls) || !isTrue(controls)))
          add("DG004", node, "Provide playback controls, or a narrowly documented exception.");
      }
      if (anchors.has(tag) || tag === "button" || imports.get(tag) === "Button") {
        let ancestor: ts.Node | undefined = node.parent;
        // The opening element's own JSXElement is not an interactive ancestor.
        if (ancestor && ts.isJsxElement(ancestor) && ancestor.openingElement === node)
          ancestor = ancestor.parent;
        while (ancestor) {
          // A render prop replaces the host element; it is not a DOM child.
          if (ts.isJsxAttribute(ancestor) && ancestor.name.getText(tree) === "render") break;
          if (ts.isJsxElement(ancestor)) {
            const parentTag = ancestor.openingElement.tagName.getText(tree);
            const childButton = tag === "button" || imports.get(tag) === "Button";
            const parentButton = parentTag === "button" || imports.get(parentTag) === "Button";
            if ((childButton && anchors.has(parentTag)) || (anchors.has(tag) && parentButton)) {
              add("DG007", node, "Compose a single interactive element with the render prop.");
              break;
            }
          }
          ancestor = ancestor.parent;
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
  return findings;
}

export function contrastRatio(foreground: string, background: string): number {
  function luminance(color: string) {
    if (!/^#[0-9a-f]{6}$/i.test(color))
      throw new Error(`Contrast checks require an opaque sRGB hex color: ${color}`);
    const values = [1, 3, 5]
      .map((offset) => parseInt(color.slice(offset, offset + 2), 16) / 255)
      .map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
    return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
  }
  const a = luminance(foreground),
    b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
