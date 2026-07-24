export interface QrCell {
  filled: boolean;
}

/**
 * Genera una grilla con aspecto de código QR puramente decorativo (no codifica
 * datos reales). Replica el patrón visual del diseño original: esquineros tipo
 * "finder", líneas de temporización y relleno pseudoaleatorio determinístico.
 */
export function buildQrGrid(size: number): QrCell[] {
  const grid: number[][] = Array.from({ length: size }, () => new Array(size).fill(0));

  const drawFinder = (originRow: number, originCol: number) => {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        const edge = r === 0 || r === 6 || c === 0 || c === 6;
        const inner = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        grid[originRow + r][originCol + c] = edge || inner ? 1 : 0;
      }
    }
  };

  drawFinder(0, 0);
  drawFinder(0, size - 7);
  drawFinder(size - 7, 0);

  for (let i = 8; i < size - 8; i++) {
    grid[6][i] = i % 2 === 0 ? 1 : 0;
    grid[i][6] = i % 2 === 0 ? 1 : 0;
  }

  const inFinderZone = (r: number, c: number) =>
    (r < 8 && c < 8) || (r < 8 && c >= size - 8) || (r >= size - 8 && c < 8);

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (inFinderZone(r, c)) continue;
      if (r === 6 || c === 6) continue;
      grid[r][c] = (r * 3 + c * 7 + ((r * c) % 5)) % 3 === 0 ? 1 : 0;
    }
  }

  const cells: QrCell[] = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      cells.push({ filled: grid[r][c] === 1 });
    }
  }
  return cells;
}
