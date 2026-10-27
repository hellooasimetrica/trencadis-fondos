/* Motor TRENCADÍS
   ----------------------------------------------------------------------------
   El motor siempre hace lo mismo: rompe el lienzo en piezas irregulares y
   pinta cada una. La fuente de color se pasa aparte, así que la Fase 2 (foto a
   mosaico) solo tiene que aportar otra fuente, sin tocar nada de aquí.

     const pieces = Trencadis.buildPieces(W, H, geom);   // geometría
     Trencadis.colorFromGradient(pieces, W, H, grad);    // fuente de color
     Trencadis.paint(ctx, pieces, W, H, look, scale);    // pintura

   La geometría se construye siempre en píxeles de salida. `scale` solo afecta
   a la pintura, así que la vista previa y el PNG descargado son el mismo
   mosaico: uno a menor resolución y el otro en la medida exacta.

   Cada pieza guarda sus propios números al azar (`n`), de modo que recolorear
   o repintar no depende del orden en que se llame al generador. Eso permite
   reutilizar la geometría cuando solo cambian los colores. */

(function (global) {
  'use strict';

  /* ---------- Azar reproducible ---------- */
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  /* ---------- Color: sRGB <-> Oklab ----------
     Oklab mezcla colores sin los grises sucios del RGB: el degradado entre dos
     teselas pasa por tonos que sí existen en cerámica. */
  function hexToRgb(h) {
    h = String(h).replace('#', '');
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgbToHex(rgb) {
    return '#' + rgb.map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
  }
  const toLin = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const toSrgb = c => {
    const v = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(Math.max(c, 0), 1 / 2.4) - 0.055;
    return clamp(Math.round(v * 255), 0, 255);
  };
  function rgbToOklab(rgb) {
    const r = toLin(rgb[0]), g = toLin(rgb[1]), b = toLin(rgb[2]);
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [
      0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
      1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
      0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
    ];
  }
  function oklabToRgb(lab) {
    const L = lab[0], A = lab[1], B = lab[2];
    const l = Math.pow(L + 0.3963377774 * A + 0.2158037573 * B, 3);
    const m = Math.pow(L - 0.1055613458 * A - 0.0638541728 * B, 3);
    const s = Math.pow(L - 0.0894841775 * A - 1.2914855480 * B, 3);
    return [
      toSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
      toSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
      toSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s)
    ];
  }
  function sampleLab(stops, t) {
    if (stops.length === 1) return stops[0].slice();
    const x = clamp(t, 0, 1) * (stops.length - 1);
    const i = Math.min(stops.length - 2, Math.floor(x));
    const f = x - i, a = stops[i], b = stops[i + 1];
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
  }

  /* ---------- Geometría ---------- */

  // Recorta un polígono por la mediatriz entre dos centros: así nace la celda
  // de Voronoi, el pedazo de cerámica.
  function clipHalf(poly, px, py, qx, qy) {
    const dx = qx - px, dy = qy - py, mx = (px + qx) / 2, my = (py + qy) / 2;
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const da = (a[0] - mx) * dx + (a[1] - my) * dy;
      const db = (b[0] - mx) * dx + (b[1] - my) * dy;
      if (da <= 0) out.push(a);
      if ((da <= 0) !== (db <= 0)) {
        const t = da / (da - db);
        out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      }
    }
    return out;
  }

  /* Rompe el lienzo en piezas.
     geom: { seed, size, irregular (0-100), grout }
     Devuelve un arreglo de piezas: { poly, pts, gx, gy, n, lab } */
  function buildPieces(W, H, geom) {
    const rand = mulberry32(geom.seed | 0);
    const s = Math.max(4, geom.size);
    const irr = clamp(geom.irregular, 0, 100) / 100;
    const rowH = s * 0.866;                       // retícula hexagonal de partida
    const cols = Math.ceil(W / s) + 3;
    const rows = Math.ceil(H / rowH) + 3;

    const grid = [];
    for (let r = 0; r < rows; r++) {
      const row = [];
      for (let c = 0; c < cols; c++) {
        const bx = (c - 1) * s + (r % 2 ? s / 2 : 0);
        const by = (r - 1) * rowH;
        row.push([
          bx + (rand() - 0.5) * s * irr * 0.95,
          by + (rand() - 0.5) * rowH * irr * 0.95
        ]);
      }
      grid.push(row);
    }

    const gap = Math.max(0, geom.grout) / 2;
    const pieces = [];
    for (let r = 1; r < rows - 1; r++) {
      for (let c = 1; c < cols - 1; c++) {
        const px = grid[r][c][0], py = grid[r][c][1];
        let poly = [
          [px - 2.5 * s, py - 2.5 * s], [px + 2.5 * s, py - 2.5 * s],
          [px + 2.5 * s, py + 2.5 * s], [px - 2.5 * s, py + 2.5 * s]
        ];
        outer: for (let dr = -2; dr <= 2; dr++) {
          const rr = r + dr;
          if (rr < 0 || rr >= rows) continue;
          for (let dc = -2; dc <= 2; dc++) {
            const cc = c + dc;
            if ((dr === 0 && dc === 0) || cc < 0 || cc >= cols) continue;
            poly = clipHalf(poly, px, py, grid[rr][cc][0], grid[rr][cc][1]);
            if (poly.length < 3) break outer;
          }
        }
        if (poly.length < 3) continue;

        let gx = 0, gy = 0;
        for (let i = 0; i < poly.length; i++) { gx += poly[i][0]; gy += poly[i][1]; }
        gx /= poly.length; gy /= poly.length;
        if (gx < -s || gy < -s || gx > W + s || gy > H + s) continue;

        // La junta se abre encogiendo la pieza hacia su centro.
        const pts = poly.map(p => {
          const d = Math.hypot(p[0] - gx, p[1] - gy) || 1;
          const k = Math.max(0, 1 - gap / d);
          return [gx + (p[0] - gx) * k, gy + (p[1] - gy) * k];
        });

        const n = new Float32Array(8);
        for (let i = 0; i < 8; i++) n[i] = rand();
        pieces.push({ poly: poly, pts: pts, gx: gx, gy: gy, n: n, lab: null });
      }
    }
    return pieces;
  }

  /* ---------- Fuente de color · Fase 1: degradado ----------
     grad: { colors: ['#rrggbb', …], dir, dispersion (0-100) } */
  function colorFromGradient(pieces, W, H, grad) {
    const stops = grad.colors.map(c => rgbToOklab(hexToRgb(c)));
    const disp = clamp(grad.dispersion, 0, 100) / 100;
    const cx = W / 2, cy = H / 2, maxR = Math.hypot(W, H) / 2;

    for (let i = 0; i < pieces.length; i++) {
      const p = pieces[i];
      let t;
      if (grad.dir === 'vertical') t = p.gy / H;
      else if (grad.dir === 'horizontal') t = p.gx / W;
      else if (grad.dir === 'diagonal') t = (p.gx / W + p.gy / H) / 2;
      else t = Math.hypot(p.gx - cx, p.gy - cy) / maxR;   // circular

      // Dispersión: ruido normal alrededor de la posición + salpicaduras.
      const u = Math.max(p.n[0], 1e-6);
      const gauss = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * p.n[1]);
      t += gauss * disp * 0.16;
      if (p.n[2] < disp * 0.12) t += (p.n[3] - 0.5) * disp * 0.9;

      p.lab = sampleLab(stops, clamp(t, 0, 1));
    }
  }

  /* ---------- Fuente de color · un solo color ----------
     Todas las piezas parten del mismo color. La textura no viene del color
     sino de la variación de tono, el brillo y la junta, igual que en un
     mosaico real de una sola pieza de cerámica.
     solid: { color: '#rrggbb' } */
  function colorFromSolid(pieces, W, H, solid) {
    var lab = rgbToOklab(hexToRgb(solid.color));
    for (var i = 0; i < pieces.length; i++) pieces[i].lab = lab.slice();
  }

  /* ---------- Fuente de color · Fase 2: foto ----------
     photo: {
       data,        // píxeles RGBA de la foto ya dibujada en W × H
       contrast,    // 50 a 200
       saturation,  // 0 a 200
       colorMode,   // 'original' | 'palette'
       colors       // la paleta, cuando colorMode es 'palette'
     }
     Cada pieza promedia el color de su zona de la foto: el centro y un punto
     hacia cada esquina, para que una pieza grande no se quede con el color de
     un solo píxel. */
  function colorFromPhoto(pieces, W, H, photo) {
    var data = photo.data;
    var k = photo.contrast / 100;
    var sat = photo.saturation / 100;

    function read(x, y, out) {
      var xi = clamp(Math.round(x), 0, W - 1);
      var yi = clamp(Math.round(y), 0, H - 1);
      var i = (yi * W + xi) * 4;
      out[0] += data[i]; out[1] += data[i + 1]; out[2] += data[i + 2];
    }

    for (var p0 = 0; p0 < pieces.length; p0++) {
      var p = pieces[p0];
      var sum = [0, 0, 0], n = 1;
      read(p.gx, p.gy, sum);
      for (var j = 0; j < p.poly.length; j++) {
        read(p.gx + (p.poly[j][0] - p.gx) * 0.5, p.gy + (p.poly[j][1] - p.gy) * 0.5, sum);
        n++;
      }
      var rgb = [
        clamp((sum[0] / n - 128) * k + 128, 0, 255),
        clamp((sum[1] / n - 128) * k + 128, 0, 255),
        clamp((sum[2] / n - 128) * k + 128, 0, 255)
      ];
      var lab = rgbToOklab(rgb);
      lab[1] *= sat;
      lab[2] *= sat;
      p.lab = lab;
    }

    // Con "Mi paleta", la luz de la foto decide qué color de la paleta toca:
    // las zonas oscuras toman el último color y las claras el primero.
    if (photo.colorMode === 'palette' && photo.colors && photo.colors.length) {
      var stops = photo.colors.map(function (c) { return rgbToOklab(hexToRgb(c)); });
      var lo = 1, hi = 0;
      for (var a = 0; a < pieces.length; a++) {
        if (pieces[a].lab[0] < lo) lo = pieces[a].lab[0];
        if (pieces[a].lab[0] > hi) hi = pieces[a].lab[0];
      }
      var span = Math.max(hi - lo, 0.001);
      for (var b = 0; b < pieces.length; b++) {
        pieces[b].lab = sampleLab(stops, 1 - (pieces[b].lab[0] - lo) / span);
      }
    }
  }

  /* ---------- Pintura ----------
     look: { groutColor, variation (0-100), round (0-100), glaze, size }
     scale: 1 para el PNG final; < 1 para la vista previa. */
  function roundedPath(ctx, pts, r) {
    const n = pts.length;
    if (r <= 0) {
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < n; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.closePath();
      return;
    }
    const k = Math.min(r, 0.5);
    for (let i = 0; i < n; i++) {
      const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n];
      const a = [p1[0] + (p0[0] - p1[0]) * k, p1[1] + (p0[1] - p1[1]) * k];
      const b = [p1[0] + (p2[0] - p1[0]) * k, p1[1] + (p2[1] - p1[1]) * k];
      if (i === 0) ctx.moveTo(a[0], a[1]); else ctx.lineTo(a[0], a[1]);
      ctx.quadraticCurveTo(p1[0], p1[1], b[0], b[1]);
    }
    ctx.closePath();
  }

  function paint(ctx, pieces, W, H, look, scale) {
    const k = scale || 1;
    const vari = clamp(look.variation, 0, 100) / 100;
    const rnd = clamp(look.round, 0, 100) / 100;
    const s = look.size;

    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.fillStyle = look.groutColor;
    ctx.fillRect(0, 0, W, H);

    for (let i = 0; i < pieces.length; i++) {
      const p = pieces[i];
      if (!p.lab) continue;

      // Variación de tono: cada pieza se desvía un poco, como esmalte real.
      const lab = [
        clamp(p.lab[0] + (p.n[4] - 0.5) * vari * 0.11, 0, 1),
        p.lab[1] * (1 + (p.n[5] - 0.5) * vari * 0.35),
        p.lab[2] * (1 + (p.n[6] - 0.5) * vari * 0.35)
      ];
      const rgb = oklabToRgb(lab);

      ctx.beginPath();
      roundedPath(ctx, p.pts, rnd * 0.5);
      ctx.fillStyle = 'rgb(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ')';
      ctx.fill();

      if (look.glaze) {
        let minX = Infinity, minY = Infinity;
        for (let j = 0; j < p.pts.length; j++) {
          if (p.pts[j][0] < minX) minX = p.pts[j][0];
          if (p.pts[j][1] < minY) minY = p.pts[j][1];
        }
        const g = ctx.createLinearGradient(
          minX, minY,
          p.gx + (p.n[7] - 0.5) * s * 0.3, p.gy + s * 0.15
        );
        g.addColorStop(0, 'rgba(255,255,255,0.28)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.fill();
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  global.Trencadis = {
    buildPieces: buildPieces,
    colorFromGradient: colorFromGradient,
    colorFromSolid: colorFromSolid,
    colorFromPhoto: colorFromPhoto,
    paint: paint,
    utils: {
      mulberry32: mulberry32,
      clamp: clamp,
      hexToRgb: hexToRgb,
      rgbToHex: rgbToHex,
      rgbToOklab: rgbToOklab,
      oklabToRgb: oklabToRgb,
      sampleLab: sampleLab
    }
  };
})(window);
