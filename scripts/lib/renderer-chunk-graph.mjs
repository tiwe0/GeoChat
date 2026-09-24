const STATIC_IMPORT_PATTERN = /\b(?:import\s*(?:[\w*$\s{},]*\s+from\s*)?|export\s+(?:[\w*$\s{},]*\s+from\s*))['"]\.\/([^'"]+\.js)['"]/g;

export function collectStaticImportGraph(chunks) {
  const chunkNames = new Set(chunks.map(({ name }) => name));
  return new Map(chunks.map(({ name, source }) => {
    const dependencies = new Set();
    for (const match of source.matchAll(STATIC_IMPORT_PATTERN)) {
      if (chunkNames.has(match[1])) {
        dependencies.add(match[1]);
      }
    }
    return [name, [...dependencies].sort()];
  }));
}

export function findStaticImportCycles(graph) {
  let nextIndex = 0;
  const indexes = new Map();
  const lowLinks = new Map();
  const stack = [];
  const onStack = new Set();
  const cycles = [];

  const visit = (node) => {
    indexes.set(node, nextIndex);
    lowLinks.set(node, nextIndex);
    nextIndex += 1;
    stack.push(node);
    onStack.add(node);

    for (const dependency of graph.get(node) ?? []) {
      if (!indexes.has(dependency)) {
        visit(dependency);
        lowLinks.set(node, Math.min(lowLinks.get(node), lowLinks.get(dependency)));
      } else if (onStack.has(dependency)) {
        lowLinks.set(node, Math.min(lowLinks.get(node), indexes.get(dependency)));
      }
    }

    if (lowLinks.get(node) !== indexes.get(node)) {
      return;
    }

    const component = [];
    let member;
    do {
      member = stack.pop();
      onStack.delete(member);
      component.push(member);
    } while (member !== node);

    if (component.length > 1 || (graph.get(node) ?? []).includes(node)) {
      cycles.push(component.sort());
    }
  };

  for (const node of [...graph.keys()].sort()) {
    if (!indexes.has(node)) {
      visit(node);
    }
  }

  return cycles.sort((left, right) => left[0].localeCompare(right[0]));
}
