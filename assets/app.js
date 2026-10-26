/* TRENCADÍS Fondos · interfaz
   ----------------------------------------------------------------------------
   Este archivo arma la interfaz y conecta los controles con el motor
   (assets/engine.js). La misma interfaz sirve para la página publicada y para
   la vista previa, así que el marcado vive aquí una sola vez.

   Dos modos, un solo motor:
     · Degradado (Fase 1): el color sale de la paleta y la dirección.
     · Foto (Fase 2): el color sale de la imagen que sube la persona.

   Tres decisiones que sostienen los requerimientos del PRD:

   · Rapidez. La geometría de las piezas se guarda en memoria y solo se vuelve
     a calcular cuando cambia algo que la afecta (variación, tamaño,
     irregularidad, junta o medida del lienzo). Mover colores, dirección,
     dispersión, tono, bordes o brillo solo repinta.
   · Calidad de salida. La vista previa se pinta a la resolución de la
     pantalla; el PNG se pinta aparte en la medida exacta. Es el mismo mosaico
     porque la geometría se calcula en píxeles de salida.
   · Privacidad. La imagen se lee con FileReader y se dibuja en un canvas de
     esta misma página: nunca se sube a ningún lado. */

(function () {
  'use strict';

  /* ---------- Datos ---------- */

  var PALETTES = {
    'Mar y sol': ['#F6A523', '#A6D8CC', '#3AAFC3', '#1C6F9C'],
    'Azulejo':   ['#F3F6FB', '#9BB7E9', '#2C59D1', '#13226A'],
    'Desierto':  ['#F3D5A2', '#E2995A', '#B4523A', '#5A2A2F'],
    'Jade':      ['#E7F1C8', '#8BC59F', '#2D8971', '#0F3C3D'],
    'Coral':     ['#FFE4D4', '#FF9D88', '#E5556B', '#682C6F']
  };

  var FORMATS = {
    square:  { name: 'Cuadrado',   w: 1080, h: 1080 },
    story:   { name: 'Historia',   w: 1080, h: 1920 },
    desktop: { name: 'Escritorio', w: 1920, h: 1080 }
  };

  /* Resolución de salida. El mosaico no cambia: las mismas piezas se pintan
     más grandes, así que los bordes salen igual de limpios a cualquier
     medida. `long` es el lado mayor del PNG. */
  var RESOLUTIONS = {
    base: { name: 'Original', long: 0 },
    '2k': { name: '2K', long: 2560 },
    '4k': { name: '4K', long: 3840 },
    '8k': { name: '8K', long: 7680 }
  };

  var MIN_COLORS = 2, MAX_COLORS = 5;
  var MAX_SIDE = 2400;          // las fotos grandes se reducen a este lado mayor
  var MIN_PIECE = { gradient: 12, photo: 8 };

  // El control de saturación se quitó de la interfaz: no hacía nada con "Mi
  // paleta", porque ahí el color lo pone la paleta y no la foto. El motor lo
  // sigue admitiendo; aquí queda fijo en el valor que traía por omisión.
  var PHOTO_SATURATION = 110;

  var state = {
    mode: 'gradient',
    palette: 'Mar y sol',
    colors: PALETTES['Mar y sol'].slice(),
    dir: 'vertical',
    dispersion: 38,
    variation: 45,
    size: 26,
    irregular: 85,
    round: 30,
    glaze: true,
    grout: 2.5,
    groutColor: '#F5F1EB',
    format: 'square',
    resolution: 'base',
    seed: 48213,
    // Modo Foto
    img: null,
    imgName: '',
    imgScale: 100,
    contrast: 115,
    colorMode: 'original'
  };

  var clamp = Trencadis.utils.clamp;

  /* ---------- Interfaz ---------- */

  var MARKUP = [
    '<aside class="panel" aria-label="Controles del fondo">',
    '  <div class="panel-scroll">',
    '    <div class="brand">',
    '      <div class="brand-top">',
    '        <h1 class="wordmark">',
    '          <span class="isotipo" aria-hidden="true"><i></i><i></i><i></i><i></i></span>',
    '          TRENCADÍS',
    '        </h1>',
    '        <span class="chip">Fondos</span>',
    '      </div>',
    '      <p class="tagline">Mosaicos de degradado o de tu propia foto.</p>',
    '    </div>',

    '    <div class="seg keep-row modes" id="mode" role="group" aria-label="Modo">',
    '      <button type="button" data-v="gradient">Degradado</button>',
    '      <button type="button" data-v="photo">Foto</button>',
    '    </div>',

    '    <section class="group" data-mode="gradient" aria-labelledby="h-formato">',
    '      <h2 id="h-formato">Formato</h2>',
    '      <div class="seg keep-row" id="format" role="group" aria-labelledby="h-formato">',
    '        <button type="button" data-v="square">Cuadrado</button>',
    '        <button type="button" data-v="story">Historia</button>',
    '        <button type="button" data-v="desktop">Escritorio</button>',
    '      </div>',
    '      <p class="hint">La proporción del fondo.</p>',
    '    </section>',

    '    <section class="group" data-mode="photo" aria-labelledby="h-imagen">',
    '      <h2 id="h-imagen">Imagen</h2>',
    '      <div class="upload">',
    '        <input type="file" id="file" accept="image/jpeg,image/png,image/webp">',
    '        <label class="btn" for="file" id="uploadEmpty">Subir imagen</label>',
    '        <div class="file-card" id="uploadLoaded" hidden>',
    '          <img class="file-thumb" id="fileThumb" alt="">',
    '          <div class="file-info">',
    '            <span class="file-name" id="fileName"></span>',
    '            <span class="file-dims" id="fileDims"></span>',
    '          </div>',
    '          <div class="file-actions">',
    '            <label class="btn" for="file">Cambiar imagen</label>',
    '            <button class="btn btn-quiet-danger" id="removeImg" type="button">Quitar</button>',
    '          </div>',
    '        </div>',
    '        <p class="hint" id="uploadHint"></p>',
    '      </div>',
    '      <div class="field">',
    '        <label class="field-label" for="imgScale"><span>Escala de imagen</span><span class="val" id="imgScaleV"></span></label>',
    '        <input type="range" id="imgScale" min="100" max="300" step="5">',
    '        <p class="hint">Acerca la foto desde el centro, sin cambiar la medida final.</p>',
    '      </div>',
    '      <div class="field">',
    '        <label class="field-label" for="contrast"><span>Contraste</span><span class="val" id="contrastV"></span></label>',
    '        <input type="range" id="contrast" min="50" max="200" step="5">',
    '        <p class="hint">Separa más las zonas claras y oscuras.</p>',
    '      </div>',
    '    </section>',

    '    <section class="group" data-mode="photo" aria-labelledby="h-colorpieza">',
    '      <h2 id="h-colorpieza">Color de las piezas</h2>',
    '      <div class="seg keep-row" id="colorMode" role="group" aria-labelledby="h-colorpieza">',
    '        <button type="button" data-v="original">Original</button>',
    '        <button type="button" data-v="palette">Mi paleta</button>',
    '      </div>',
    '      <p class="hint" id="paletteHint">Las zonas oscuras de la foto toman el último color de tu paleta y las claras el primero.</p>',
    '    </section>',

    '    <section class="group" aria-labelledby="h-resolucion">',
    '      <h2 id="h-resolucion">Resolución</h2>',
    '      <div class="seg keep-row" id="resolution" role="group" aria-labelledby="h-resolucion">',
    '        <button type="button" data-v="base">Original</button>',
    '        <button type="button" data-v="2k">2K</button>',
    '        <button type="button" data-v="4k">4K</button>',
    '        <button type="button" data-v="8k">8K</button>',
    '      </div>',
    '      <p class="hint" id="resHint"></p>',
    '    </section>',

    '    <section class="group" id="colorsGroup" aria-labelledby="h-colores">',
    '      <h2 id="h-colores">Colores</h2>',
    '      <div class="presets" id="presets"></div>',
    '      <div class="colors" id="colors"></div>',
    '      <div class="btn-row">',
    '        <button class="btn" id="addColor" type="button">Agregar color</button>',
    '        <button class="btn" id="reverse" type="button">Invertir orden</button>',
    '      </div>',
    '    </section>',

    '    <section class="group" data-mode="gradient" aria-labelledby="h-degradado">',
    '      <h2 id="h-degradado">Degradado</h2>',
    '      <div class="field">',
    '        <span class="field-label" id="l-dir">Dirección</span>',
    '        <div class="seg wrap" id="dir" role="group" aria-labelledby="l-dir">',
    '          <button type="button" data-v="vertical">Vertical</button>',
    '          <button type="button" data-v="horizontal">Horizontal</button>',
    '          <button type="button" data-v="diagonal">Diagonal</button>',
    '          <button type="button" data-v="radial">Circular</button>',
    '        </div>',
    '      </div>',
    '      <div class="field">',
    '        <label class="field-label" for="dispersion"><span>Dispersión</span><span class="val" id="dispersionV"></span></label>',
    '        <input type="range" id="dispersion" min="0" max="100" step="1">',
    '        <p class="hint">Qué tanto se salpican los colores entre sí.</p>',
    '      </div>',
    '    </section>',

    '    <section class="group" aria-labelledby="h-piezas">',
    '      <h2 id="h-piezas">Piezas</h2>',
    '      <div class="field">',
    '        <label class="field-label" for="size"><span>Tamaño</span><span class="val" id="sizeV"></span></label>',
    '        <input type="range" id="size" min="12" max="90" step="1">',
    '      </div>',
    '      <div class="field">',
    '        <label class="field-label" for="irregular"><span>Irregularidad</span><span class="val" id="irregularV"></span></label>',
    '        <input type="range" id="irregular" min="0" max="100" step="1">',
    '        <p class="hint">En 0 las piezas son casi hexágonos; en 100, pedazos rotos.</p>',
    '      </div>',
    '      <div class="field">',
    '        <label class="field-label" for="variation"><span>Variación de tono</span><span class="val" id="variationV"></span></label>',
    '        <input type="range" id="variation" min="0" max="100" step="1">',
    '        <p class="hint">Cada pieza cambia un poco de tono, como cerámica real.</p>',
    '      </div>',
    '      <div class="field">',
    '        <label class="field-label" for="round"><span>Bordes suaves</span><span class="val" id="roundV"></span></label>',
    '        <input type="range" id="round" min="0" max="100" step="1">',
    '      </div>',
    '      <label class="switch" for="glaze"><span>Brillo cerámico</span><input type="checkbox" id="glaze"></label>',
    '    </section>',

    '    <section class="group" aria-labelledby="h-junta">',
    '      <h2 id="h-junta">Junta</h2>',
    '      <div class="grout-row">',
    '        <div class="field">',
    '          <label class="field-label" for="grout"><span>Grosor</span><span class="val" id="groutV"></span></label>',
    '          <input type="range" id="grout" min="0" max="12" step="0.5">',
    '        </div>',
    '        <input type="color" id="groutColor" aria-label="Color de la junta">',
    '      </div>',
    '      <p class="hint">La línea entre piezas.</p>',
    '    </section>',
    '  </div>',

    '  <div class="panel-foot">',
    '    <button class="btn btn-primary" id="download" type="button">Descargar PNG</button>',
    '  </div>',
    '</aside>',

    '<main class="stage" id="stage">',
    '  <div class="canvas-wrap" id="canvasWrap">',
    '    <canvas id="canvas" aria-label="Vista previa del mosaico"></canvas>',
    '  </div>',
    '  <p class="meta" id="meta" role="status" aria-live="polite"></p>',
    '  <div class="toast" id="toast" hidden></div>',
    '</main>',

    '<div class="overlay" id="exportOverlay" hidden>',
    '  <div class="sheet" id="exportSheet" role="dialog" aria-modal="true" aria-labelledby="exTitle" aria-describedby="exText" tabindex="-1">',
    '    <div class="lottie" id="lottieBox" aria-hidden="true"></div>',
    '    <h3 id="exTitle">Espera un momento</h3>',
    '    <p id="exText"></p>',
    '    <div class="progress" id="exProgress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" aria-labelledby="exTitle">',
    '      <span class="progress-fill" id="exBar"></span>',
    '    </div>',
    '    <p class="progress-step" id="exStep"></p>',
    '  </div>',
    '</div>'
  ].join('\n');

  var root = document.getElementById('app');
  root.innerHTML = MARKUP;

  function $(id) { return document.getElementById(id); }

  var canvas = $('canvas');
  var ctx = canvas.getContext('2d');
  var wrap = $('canvasWrap');
  var stage = $('stage');

  /* ---------- Imagen de ejemplo ----------
     El modo Foto abre con un atardecer dibujado aquí mismo, para que se vea
     qué hace antes de subir nada. Se reemplaza con la primera imagen. */

  function makeSample() {
    var c = document.createElement('canvas');
    c.width = 1400; c.height = 1000;
    var g = c.getContext('2d');
    var sky = g.createLinearGradient(0, 0, 0, 560);
    sky.addColorStop(0, '#F7B24A'); sky.addColorStop(0.55, '#F6D68C'); sky.addColorStop(1, '#BFE3DE');
    g.fillStyle = sky; g.fillRect(0, 0, 1400, 560);
    var sun = g.createRadialGradient(860, 380, 10, 860, 380, 170);
    sun.addColorStop(0, '#FFF4C2'); sun.addColorStop(0.55, '#FFC53A'); sun.addColorStop(1, 'rgba(255,197,58,0)');
    g.fillStyle = sun; g.beginPath(); g.arc(860, 380, 170, 0, Math.PI * 2); g.fill();
    var sea = g.createLinearGradient(0, 560, 0, 1000);
    sea.addColorStop(0, '#3FB3C1'); sea.addColorStop(1, '#14527A');
    g.fillStyle = sea; g.fillRect(0, 560, 1400, 440);
    g.fillStyle = 'rgba(255,226,140,0.55)';
    for (var i = 0; i < 9; i++) {
      var y = 590 + i * 34, w = 260 - i * 18;
      g.fillRect(860 - w / 2, y, w, 8);
    }
    g.fillStyle = '#2B3A2F';
    g.beginPath(); g.moveTo(0, 520); g.quadraticCurveTo(200, 400, 420, 560); g.lineTo(0, 560); g.fill();
    g.fillStyle = '#C8643A';
    g.beginPath(); g.moveTo(0, 1000); g.quadraticCurveTo(380, 760, 760, 1000); g.fill();
    return c;
  }
  var sample = makeSample();

  /* ---------- Medidas y píxeles de la foto ---------- */

  function photoSize() {
    var img = state.img || sample;
    var w = img.naturalWidth || img.width;
    var h = img.naturalHeight || img.height;
    var k = Math.min(1, MAX_SIDE / Math.max(w, h));
    return { w: Math.round(w * k), h: Math.round(h * k), ow: w, oh: h, reduced: k < 1 };
  }

  var photoCache = { key: '', data: null };

  function photoData(W, H) {
    var img = state.img || sample;
    var key = [W, H, state.imgScale, state.imgName].join('|');
    if (photoCache.key === key) return photoCache.data;
    var c = document.createElement('canvas');
    c.width = W; c.height = H;
    var g = c.getContext('2d');
    var iw = img.naturalWidth || img.width;
    var ih = img.naturalHeight || img.height;
    var z = state.imgScale / 100;
    var sw = iw / z, sh = ih / z;
    g.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, 0, 0, W, H);
    photoCache = { key: key, data: g.getImageData(0, 0, W, H).data };
    return photoCache.data;
  }

  /* ---------- Dibujo ---------- */

  var cache = { key: '', pieces: null };

  function outputSize() {
    if (state.mode === 'photo') {
      var p = photoSize();
      return { w: p.w, h: p.h, name: 'Foto', photo: p };
    }
    var f = FORMATS[state.format];
    return { w: f.w, h: f.h, name: f.name };
  }

  /* Medida del PNG: la del lienzo, o la que pida la resolución elegida. El
     mosaico es el mismo; solo se pinta a otra escala. */
  function exportSize() {
    var out = outputSize();
    var r = RESOLUTIONS[state.resolution];
    if (!r.long) return { w: out.w, h: out.h, base: out };
    var k = r.long / Math.max(out.w, out.h);
    return {
      w: Math.round(out.w * k),
      h: Math.round(out.h * k),
      base: out
    };
  }

  function pieces(W, H) {
    var key = [W, H, state.seed, state.size, state.irregular, state.grout].join('|');
    if (cache.key !== key) {
      cache.pieces = Trencadis.buildPieces(W, H, {
        seed: state.seed,
        size: state.size,
        irregular: state.irregular,
        grout: state.grout
      });
      cache.key = key;
    }
    return cache.pieces;
  }

  function colorize(list, W, H) {
    if (state.mode === 'photo') {
      Trencadis.colorFromPhoto(list, W, H, {
        data: photoData(W, H),
        contrast: state.contrast,
        saturation: PHOTO_SATURATION,
        colorMode: state.colorMode,
        colors: state.colors.slice()
      });
    } else {
      Trencadis.colorFromGradient(list, W, H, {
        colors: state.colors.slice(),
        dir: state.dir,
        dispersion: state.dispersion
      });
    }
  }

  function lookOpts() {
    return {
      groutColor: state.groutColor,
      variation: state.variation,
      round: state.round,
      glaze: state.glaze,
      size: state.size
    };
  }

  // Resolución de la vista previa: la que de verdad se ve en pantalla. En
  // pantallas grandes el lienzo se pinta por encima de su medida de salida
  // para que llene el espacio sin verse borroso, con un techo de píxeles
  // para que siga siendo instantáneo.
  var PREVIEW_BUDGET = 4.5e6;

  function previewScale(W, H) {
    var availW = wrap.clientWidth || 600;
    var availH = wrap.clientHeight || availW;
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var scale = clamp(Math.min(availW / W, availH / H) * dpr, 0.2, 2);
    var px = W * H * scale * scale;
    if (px > PREVIEW_BUDGET) scale *= Math.sqrt(PREVIEW_BUDGET / px);
    return scale;
  }

  function draw() {
    var out = outputSize();
    var list = pieces(out.w, out.h);
    colorize(list, out.w, out.h);

    var scale = previewScale(out.w, out.h);
    var cw = Math.max(1, Math.round(out.w * scale));
    var ch = Math.max(1, Math.round(out.h * scale));
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
    }
    Trencadis.paint(ctx, list, out.w, out.h, lookOpts(), cw / out.w);

    var medida = out.w + ' × ' + out.h + ' px';
    if (out.photo && out.photo.reduced) {
      medida += ' (reducida de ' + out.photo.ow + ' × ' + out.photo.oh + ')';
    }
    $('meta').innerHTML =
      '<span><b>' + list.length.toLocaleString('es-MX') + '</b> piezas</span>' +
      '<span>' + (state.mode === 'photo' ? '' : out.name + ' · ') + '<b>' + medida + '</b></span>' +
      (state.mode === 'photo' && !state.img ? '<span class="tag">Imagen de ejemplo</span>' : '');

    updateResHint();
  }

  function updateResHint() {
    var ex = exportSize();
    var txt = 'El PNG se descarga en ' + ex.w + ' × ' + ex.h + ' px.';
    if (state.resolution === '8k') txt += ' A 8K pesa bastante y tarda unos segundos.';
    $('resHint').textContent = txt;
  }

  var queued = false;
  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(function () { queued = false; draw(); });
  }

  /* ---------- Estado de la imagen ----------
     Sin imagen: una zona para subir y el mosaico de ejemplo en el lienzo.
     Con imagen: su miniatura, su nombre, su medida y dos salidas claras,
     cambiarla o quitarla. Nadie se queda atorado con una foto que subió por
     accidente. */

  function renderUpload() {
    var has = !!state.img;
    $('uploadEmpty').hidden = has;
    $('uploadLoaded').hidden = !has;
    $('uploadHint').textContent = has
      ? 'Para reemplazarla, usa Cambiar imagen o arrastra otra al lienzo.'
      : 'JPG, PNG o WebP. También puedes arrastrarla al lienzo. La imagen nunca sale de tu dispositivo.';

    if (!has) return;
    var p = photoSize();
    $('fileThumb').src = state.img.src;
    $('fileThumb').alt = 'Miniatura de ' + state.imgName;
    $('fileName').textContent = state.imgName;
    $('fileDims').textContent = p.reduced
      ? p.ow + ' × ' + p.oh + ' px · se usa a ' + p.w + ' × ' + p.h
      : p.ow + ' × ' + p.oh + ' px';
  }

  function clearImage() {
    if (!state.img) return;
    state.img = null;
    state.imgName = '';
    photoCache.key = '';
    cache.key = '';
    syncMode();
    schedule();
    toast('info', 'Quitamos la imagen. Vuelve el mosaico de ejemplo.');
  }

  /* ---------- Qué se ve en cada modo ---------- */

  function syncMode() {
    var photo = state.mode === 'photo';

    Array.prototype.forEach.call(document.querySelectorAll('[data-mode]'), function (el) {
      el.hidden = el.dataset.mode !== state.mode;
    });

    // En modo Foto la paleta solo importa si las piezas la usan.
    $('colorsGroup').hidden = photo && state.colorMode !== 'palette';
    $('paletteHint').hidden = state.colorMode !== 'palette';
    renderUpload();

    // La Fase 2 admite piezas más chicas que la Fase 1.
    var min = MIN_PIECE[state.mode];
    var sizeEl = $('size');
    sizeEl.min = min;
    if (state.size < min) state.size = min;
    sizeEl.value = state.size;
    syncSlider('size');

    // El primer grupo visible no lleva línea arriba.
    var groups = document.querySelectorAll('.group');
    var first = true;
    Array.prototype.forEach.call(groups, function (g) {
      var visible = !g.hidden;
      g.classList.toggle('first-group', visible && first);
      if (visible) first = false;
    });
  }

  /* ---------- Paletas y colores ---------- */

  function buildPresets() {
    var box = $('presets');
    box.innerHTML = '';
    Object.keys(PALETTES).forEach(function (name) {
      var cols = PALETTES[name];
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'preset';
      b.title = name;
      b.setAttribute('aria-pressed', String(state.palette === name));
      var sw = document.createElement('span');
      sw.className = 'swatch';
      sw.style.background = 'linear-gradient(180deg,' + cols.join(',') + ')';
      var label = document.createElement('span');
      label.textContent = name;
      b.append(sw, label);
      b.addEventListener('click', function () {
        state.palette = name;
        state.colors = cols.slice();
        buildPresets();
        buildColors();
        schedule();
      });
      box.appendChild(b);
    });
  }

  function dropPreset() {
    if (state.palette) {
      state.palette = null;
      buildPresets();
    }
  }

  function buildColors() {
    var box = $('colors');
    box.innerHTML = '';
    state.colors.forEach(function (hex, i) {
      var row = document.createElement('div');
      row.className = 'color-row';

      var pick = document.createElement('input');
      pick.type = 'color';
      pick.id = 'color-' + i;
      pick.value = hex;
      pick.setAttribute('aria-label', 'Color ' + (i + 1));

      var text = document.createElement('input');
      text.type = 'text';
      text.className = 'hex';
      text.id = 'hex-' + i;
      text.value = hex.toUpperCase();
      text.maxLength = 7;
      text.spellcheck = false;
      text.autocomplete = 'off';
      text.setAttribute('aria-label', 'Código del color ' + (i + 1));

      var del = document.createElement('button');
      del.type = 'button';
      del.className = 'icon-btn';
      del.textContent = '×';
      del.setAttribute('aria-label', 'Quitar el color ' + (i + 1));
      del.disabled = state.colors.length <= MIN_COLORS;

      pick.addEventListener('input', function () {
        state.colors[i] = pick.value;
        text.value = pick.value.toUpperCase();
        text.removeAttribute('aria-invalid');
        dropPreset();
        schedule();
      });

      text.addEventListener('input', function () {
        var v = text.value.trim();
        if (v && v[0] !== '#') v = '#' + v;
        if (/^#[0-9a-fA-F]{6}$/.test(v)) {
          state.colors[i] = v;
          pick.value = v;
          text.removeAttribute('aria-invalid');
          dropPreset();
          schedule();
        } else {
          text.setAttribute('aria-invalid', 'true');
        }
      });

      text.addEventListener('blur', function () {
        text.value = state.colors[i].toUpperCase();
        text.removeAttribute('aria-invalid');
      });

      del.addEventListener('click', function () {
        state.colors.splice(i, 1);
        dropPreset();
        buildColors();
        schedule();
      });

      row.append(pick, text, del);
      box.appendChild(row);
    });
    $('addColor').disabled = state.colors.length >= MAX_COLORS;
  }

  $('addColor').addEventListener('click', function () {
    if (state.colors.length >= MAX_COLORS) return;
    var last = state.colors[state.colors.length - 1];
    var lab = Trencadis.utils.rgbToOklab(Trencadis.utils.hexToRgb(last));
    lab[0] = clamp(lab[0] * 0.75, 0, 1);
    state.colors.push(Trencadis.utils.rgbToHex(Trencadis.utils.oklabToRgb(lab)));
    dropPreset();
    buildColors();
    schedule();
  });

  $('reverse').addEventListener('click', function () {
    state.colors.reverse();
    buildColors();
    schedule();
  });

  /* ---------- Controles segmentados y deslizadores ---------- */

  function bindSeg(id, key, after) {
    var box = $(id);
    function sync() {
      Array.prototype.forEach.call(box.querySelectorAll('button'), function (b) {
        b.setAttribute('aria-pressed', String(b.dataset.v === state[key]));
      });
    }
    box.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      state[key] = b.dataset.v;
      sync();
      if (after) after();
      schedule();
    });
    sync();
  }
  bindSeg('mode', 'mode', syncMode);
  bindSeg('dir', 'dir');
  bindSeg('format', 'format');
  bindSeg('resolution', 'resolution', updateResHint);
  bindSeg('colorMode', 'colorMode', syncMode);

  var SLIDERS = {
    dispersion: function (v) { return v + '%'; },
    variation:  function (v) { return v + '%'; },
    size:       function (v) { return v + ' px'; },
    irregular:  function (v) { return v + '%'; },
    round:      function (v) { return v + '%'; },
    grout:      function (v) { return v + ' px'; },
    imgScale:   function (v) { return v + '%'; },
    contrast:   function (v) { return v + '%'; }
  };

  function syncSlider(key) {
    var el = $(key), out = $(key + 'V');
    var min = parseFloat(el.min), max = parseFloat(el.max);
    el.style.setProperty('--fill', ((state[key] - min) / (max - min) * 100) + '%');
    out.textContent = SLIDERS[key](state[key]);
  }

  Object.keys(SLIDERS).forEach(function (key) {
    var el = $(key);
    el.value = state[key];
    syncSlider(key);
    el.addEventListener('input', function () {
      state[key] = parseFloat(el.value);
      syncSlider(key);
      schedule();
    });
  });

  $('glaze').checked = state.glaze;
  $('glaze').addEventListener('change', function (e) {
    state.glaze = e.target.checked;
    schedule();
  });

  $('groutColor').value = state.groutColor;
  $('groutColor').addEventListener('input', function (e) {
    state.groutColor = e.target.value;
    schedule();
  });

  /* ---------- Avisos ---------- */

  var toastTimer = null;
  function toast(kind, text) {
    var el = $('toast');
    el.dataset.kind = kind;
    el.textContent = text;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 4000);
  }

  /* ---------- Subir imagen ----------
     La imagen se queda en esta página: se lee con FileReader y se dibuja en
     un canvas. No hay servidor al cual mandarla. */

  function loadFile(file) {
    if (!file) return;
    if (!/^image\//.test(file.type)) {
      toast('error', 'Ese archivo no es una imagen. Usa JPG, PNG o WebP.');
      return;
    }
    var reader = new FileReader();
    reader.onerror = function () {
      toast('error', 'No se pudo leer el archivo. Intenta con otro.');
    };
    reader.onload = function () {
      var img = new Image();
      img.onload = function () {
        state.img = img;
        state.imgName = file.name;
        photoCache.key = '';
        cache.key = '';
        if (state.mode !== 'photo') {
          state.mode = 'photo';
          Array.prototype.forEach.call($('mode').querySelectorAll('button'), function (b) {
            b.setAttribute('aria-pressed', String(b.dataset.v === 'photo'));
          });
        }
        syncMode();
        schedule();
        toast('ok', 'Imagen lista: ' + file.name);
      };
      img.onerror = function () {
        toast('error', 'No se pudo abrir esa imagen. Prueba con otro archivo.');
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  $('file').addEventListener('change', function (e) {
    loadFile(e.target.files[0]);
    e.target.value = '';   // así se puede volver a elegir el mismo archivo
  });

  $('removeImg').addEventListener('click', clearImage);

  var dragDepth = 0;
  stage.addEventListener('dragenter', function (e) {
    e.preventDefault();
    dragDepth++;
    stage.classList.add('drag');
  });
  stage.addEventListener('dragover', function (e) { e.preventDefault(); });
  stage.addEventListener('dragleave', function () {
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) stage.classList.remove('drag');
  });
  stage.addEventListener('drop', function (e) {
    e.preventDefault();
    dragDepth = 0;
    stage.classList.remove('drag');
    loadFile(e.dataTransfer.files[0]);
  });

  /* ---------- Descargar PNG ----------
     En la página publicada (GitHub Pages) basta un enlace de descarga. Dentro
     del visor de artifacts los enlaces de descarga no funcionan, así que ahí
     se usa la capacidad `downloads`. Se intenta primero esa y se cae al
     enlace cuando no está. */

  function fileName(out) {
    var base = state.mode === 'photo' ? 'trencadis-mosaico-' : 'trencadis-fondo-';
    return base + out.w + 'x' + out.h + '.png';
  }

  function saveWithLink(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
  }

  function saveBlob(blob, name) {
    var viewer = (window.claude && window.claude.use)
      ? window.claude.use('downloads').catch(function () { return null; })
      : Promise.resolve(null);

    return viewer.then(function (downloads) {
      if (!downloads) {
        saveWithLink(blob, name);
        return 'guardado';
      }
      return downloads.save({ filename: name, data: blob }).then(
        function () { return 'guardado'; },
        function (err) {
          if (err && err.code === 'declined') return 'cancelado';
          saveWithLink(blob, name);
          return 'guardado';
        }
      );
    });
  }

  /* ---------- Modal de espera ----------
     Pintar y guardar un PNG grande bloquea la página unos segundos. En lugar
     de dejar a la persona mirando un botón congelado, se abre un modal con el
     perrito, la medida que se está exportando y una barra que avanza con cada
     paso real: armar las piezas, pintarlas y guardar el archivo.

     El último paso, codificar el PNG, no avisa de su avance: ahí la barra
     sube sola, despacio, hasta 94% y salta a 100% cuando el archivo está. */

  var LOTTIE_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/bodymovin/5.12.2/lottie.min.js';
  var lottieAnim = null;
  var lottiePromise = null;

  function quietMotion() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function loadLottie() {
    if (window.lottie) return Promise.resolve(window.lottie);
    if (lottiePromise) return lottiePromise;
    lottiePromise = new Promise(function (resolve) {
      var s = document.createElement('script');
      s.src = LOTTIE_SRC;
      s.async = true;
      // Si la librería no carga, el modal funciona igual: solo se queda sin
      // animación.
      s.onload = function () { resolve(window.lottie || null); };
      s.onerror = function () { resolve(null); };
      document.head.appendChild(s);
    });
    return lottiePromise;
  }

  function playLottie() {
    if (lottieAnim) {
      if (!quietMotion()) lottieAnim.goToAndPlay(0, true);
      return;
    }
    loadLottie().then(function (lottie) {
      if (!lottie || !window.TRENCADIS_LOTTIE || lottieAnim) return;
      lottieAnim = lottie.loadAnimation({
        container: $('lottieBox'),
        renderer: 'svg',
        loop: true,
        autoplay: !quietMotion(),
        animationData: window.TRENCADIS_LOTTIE
      });
      if (quietMotion()) lottieAnim.goToAndStop(45, true);
    });
  }

  var creepTimer = null;

  function setProgress(pct, step) {
    $('exBar').style.width = pct + '%';
    $('exProgress').setAttribute('aria-valuenow', Math.round(pct));
    if (step) $('exStep').textContent = step;
  }

  function creep(from, to, ms) {
    var start = Date.now();
    clearInterval(creepTimer);
    creepTimer = setInterval(function () {
      var t = Math.min(1, (Date.now() - start) / ms);
      setProgress(from + (to - from) * t);
      if (t === 1) { clearInterval(creepTimer); creepTimer = null; }
    }, 120);
  }

  function openWait(ex) {
    $('exText').textContent = 'Estamos pintando tu mosaico en ' + ex.w + ' × ' + ex.h + ' px.';
    setProgress(8, 'Armando las piezas…');
    $('exportOverlay').hidden = false;
    $('exportSheet').focus();
    playLottie();
  }

  function closeWait() {
    clearInterval(creepTimer);
    creepTimer = null;
    if (!$('exportOverlay').hidden) {
      $('exportOverlay').hidden = true;
      if (lottieAnim) lottieAnim.pause();
      downloadBtn.focus();
    }
  }

  // Cede el control al navegador para que alcance a pintar el modal y la barra
  // antes del siguiente paso pesado.
  function nextFrame() {
    return new Promise(function (resolve) {
      requestAnimationFrame(function () { setTimeout(resolve, 0); });
    });
  }

  /* ---------- Descargar ---------- */

  var downloadBtn = $('download');
  var exporting = false;

  downloadBtn.addEventListener('click', function () {
    if (exporting) return;
    exporting = true;

    var ex = exportSize();
    var base = ex.base;
    var label = downloadBtn.textContent;
    var pesado = ex.w * ex.h > 3e6;   // de 2K para arriba

    downloadBtn.disabled = true;
    downloadBtn.textContent = 'Preparando…';
    if (pesado) openWait(ex);

    var finish = function () {
      exporting = false;
      downloadBtn.disabled = false;
      downloadBtn.textContent = label;
      closeWait();
    };

    nextFrame()
      .then(function () {
        var list = pieces(base.w, base.h);
        colorize(list, base.w, base.h);
        setProgress(40, 'Pintando el mosaico…');
        return nextFrame().then(function () { return list; });
      })
      .then(function (list) {
        var c = document.createElement('canvas');
        c.width = ex.w;
        c.height = ex.h;
        Trencadis.paint(c.getContext('2d'), list, base.w, base.h, lookOpts(), ex.w / base.w);
        setProgress(66, 'Guardando el PNG…');
        creep(66, 94, 8000);
        return nextFrame().then(function () { return c; });
      })
      .then(function (c) {
        return new Promise(function (resolve) { c.toBlob(resolve, 'image/png'); });
      })
      .then(function (blob) {
        if (!blob) throw new Error('El lienzo es demasiado grande para exportarlo.');
        setProgress(100, 'Listo');
        closeWait();
        return saveBlob(blob, fileName(ex)).then(function (estado) {
          finish();
          if (estado === 'cancelado') toast('info', 'Descarga cancelada.');
          else toast('ok', 'Descargado · ' + ex.w + ' × ' + ex.h + ' px');
        });
      })
      .catch(function () {
        finish();
        toast('error', 'No se pudo generar el PNG. Prueba con una resolución menor.');
      });
  });

  /* ---------- Arranque ---------- */

  var resizeTimer = null;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(schedule, 160);
  });

  buildPresets();
  buildColors();
  syncMode();
  draw();
})();
