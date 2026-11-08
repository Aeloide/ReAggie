export const defaultDistributors = {
  shitstain: {
    name: "Random Scatter",
    code: `// Randomly scatters pieces in the given bounding box
function spread(groups, bound, pieceDim, imageDim, skipRects, force) {
  groups.forEach(g => {
    if (!force && g.x >= 0xdead0000) return;
    
    // Check against skipped rectangles
    let inSkip = false;
    for(let r of skipRects) {
      if (g.x >= r[0][0] && g.x <= r[1][0] && g.y >= r[0][1] && g.y <= r[1][1]) {
        inSkip = true; break;
      }
    }
    if (inSkip) return;

    g.x = bound[0][0] + Math.random() * (bound[1][0] - bound[0][0]);
    g.y = bound[0][1] + Math.random() * (bound[1][1] - bound[0][1]);
  });
}`
  },
  disk: {
    name: "Disk Scatter",
    code: `// Randomly scatters pieces within a disk area
function spread(groups, bound, pieceDim, imageDim, skipRects, force) {
  const midX = (bound[0][0] + bound[1][0]) * 0.5;
  const midY = (bound[0][1] + bound[1][1]) * 0.5;
  
  let radius = Math.min(
    bound[1][0] - bound[0][0],
    bound[1][1] - bound[0][1]
  ) * 0.75;

  groups.forEach(g => {
    if (!force && g.x >= 0xdead0000) return;
    
    const axis = (Math.random() * 2 - 1) * Math.PI;
    // Basic approximate normal distribution
    const rand = Math.random() + Math.random() + Math.random() + Math.random() - 2;
    const dist = radius * rand * 0.25; 
    
    g.x = midX + Math.sin(axis) * dist;
    g.y = midY + Math.cos(axis) * dist;
  });
}`
  },
  clearRect: {
    name: "Clear Rectangle",
    code: `// Scatters pieces leaving a clear rectangle in the middle
function spread(groups, bound, pieceDim, imageDim, skipRects, force) {
  const midX = (bound[0][0] + bound[1][0]) * 0.5;
  const midY = (bound[0][1] + bound[1][1]) * 0.5;
  const sprX = pieceDim[0] * 1.55;
  const sprY = pieceDim[1] * 1.55;

  let r0x = midX - imageDim[0] * 0.6;
  let r0y = midY - imageDim[1] * 0.6;
  let r1x = midX + imageDim[0] * 0.6;
  let r1y = midY + imageDim[1] * 0.6;

  function walk(x0, y0, x1, y1) {
    const pts = [];
    const w = x1 - x0;
    const h = y1 - y0;
    const nhor = Math.ceil(w / sprX) || 1;
    const nvert = Math.ceil(h / sprY) || 1;
    const stepX = w / nhor;
    const stepY = h / nvert;

    let cx = x0;
    let cy = y0;
    for (let i = 0; i < nhor; ++i) {
      cx += stepX;
      pts.push([cx, cy]);
    }
    for (let i = 0; i < nvert; ++i) {
      cy += stepY;
      pts.push([cx, cy]);
    }
    for (let i = 0; i < nhor; ++i) {
      cx -= stepX;
      pts.push([cx, cy]);
    }
    for (let i = 0; i < nvert; ++i) {
      cy -= stepY;
      pts.push([cx, cy]);
    }
    return pts;
  }

  let pts = walk(r0x, r0y, r1x, r1y);
  let ptIdx = 0;
  
  // Shuffle pieces before placing them
  const shuf = [...groups].map((g, i) => i);
  for (let i = shuf.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = shuf[i];
    shuf[i] = shuf[j];
    shuf[j] = tmp;
  }

  for (const idx of shuf) {
    const g = groups[idx];
    if (!g) continue;
    if (!force && g.x >= 0xdead0000) continue;

    let inSkip = false;
    for (let r of skipRects) {
      if (g.x >= r[0][0] && g.x <= r[1][0] && g.y >= r[0][1] && g.y <= r[1][1]) {
        inSkip = true; break;
      }
    }
    if (inSkip) continue;

    if (ptIdx >= pts.length) {
      r0x -= sprX;
      r0y -= sprY;
      r1x += sprX;
      r1y += sprY;
      pts = walk(r0x, r0y, r1x, r1y);
      ptIdx = 0;
    }

    const p = pts[ptIdx++];
    g.x = p[0];
    g.y = p[1];
  }

  return {
    regions: {
      center: [[r0x, r0y], [r1x, r1y]]
    }
  };
}`
  }
};

export const defaultVoronoiSites = {
  random: {
    name: "Random",
  code: `// Generate random points over the rectangle
function generateSites(width, height, count) {
  const sites = [];
  for (let i = 0; i < count; i++) {
    sites.push([Math.random() * width, Math.random() * height]);
  }
  return sites;
}`
  },
  grid: {
    name: "Grid (Squares)",
    code: `// Generate points in a perfect grid
function generateSites(width, height, count) {
  const sites = [];
  const ratio = width / height;
  const cols = Math.max(1, Math.round(Math.sqrt(count * ratio)));
  const rows = Math.max(1, Math.round(count / cols));
  
  const stepX = width / cols;
  const stepY = height / rows;
  
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      sites.push([
        (x + 0.5) * stepX,
        (y + 0.5) * stepY
      ]);
    }
  }
  return sites;
}`
  },
  hexagons: {
    name: "Hexagons",
    code: `// Generate points in an alternating grid for hex shapes
function generateSites(width, height, count) {
  const sites = [];
  const ratio = width / height;
  const cols = Math.max(1, Math.round(Math.sqrt(count * ratio)));
  const rows = Math.max(1, Math.round(count / cols));
  
  const stepX = width / cols;
  const stepY = height / rows;
  
  for (let y = 0; y < rows; y++) {
    const offset = (y % 2 === 0) ? 0 : (stepX * 0.5);
    for (let x = 0; x < cols; x++) {
      sites.push([
        (x * stepX) + offset,
        (y + 0.5) * stepY
      ]);
    }
  }
  return sites;
}`
  },
  triangles: {
    name: "Triangles",
    code: `// Generate points at the vertices of a hexagonal honeycomb tiling to produce triangular Voronoi cells
function generateSites(width, height, count) {
  const sites = [];
  const size = Math.sqrt((width * height) / (1.3 * count));
  const stepX = Math.sqrt(3) * size;
  const stepY = 1.5 * size;
  const cols = Math.ceil(width / stepX) + 1;
  const rows = Math.ceil(height / stepY) + 1;
  const seen = new Set();
  
  for (let r = -1; r <= rows; r++) {
    for (let c = -1; c <= cols; c++) {
      const cx = c * stepX + (r % 2 === 0 ? 0 : stepX * 0.5);
      const cy = r * stepY;
      for (let i = 0; i < 6; i++) {
        const angle = (i * Math.PI) / 3;
        const x = cx + size * Math.sin(angle);
        const y = cy + size * Math.cos(angle);
        const clampedX = Math.max(0.1, Math.min(width - 0.1, x));
        const clampedY = Math.max(0.1, Math.min(height - 0.1, y));
        const key = Math.round(clampedX * 100) + "," + Math.round(clampedY * 100);
        if (!seen.has(key)) {
          seen.add(key);
          sites.push([clampedX, clampedY]);
        }
      }
    }
  }
  return sites;
}`
  }
};
