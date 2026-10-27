# TRENCADÍS Fondos · Fases 1 y 2

Mosaicos trencadís en tres modos: **Degradado** (Fase 1), que arma el fondo a
partir de una paleta; **Color sólido**, el mismo mosaico en un solo color; y
**Foto** (Fase 2), que convierte una imagen en mosaico. Todo ocurre en el navegador: no hay servidor, ni base de datos, ni
cuentas, y la imagen nunca sale del dispositivo de la persona.

## Archivos

| Archivo | Qué es |
| --- | --- |
| `index.html` | La página que se publica en GitHub Pages |
| `page.html` | La misma app como vista previa compartible (artifact) |
| `assets/tokens.css` | Tokens copiados del design system de TRENCADÍS |
| `assets/app.css` | Interfaz: estructura, controles, lienzo |
| `assets/engine.js` | El motor: rompe el lienzo en piezas y las pinta |
| `assets/app.js` | Marcado de la interfaz y conexión con el motor |

`index.html` y `page.html` son dos puertas a la misma app: el marcado y la
lógica viven una sola vez, en `assets/`.

## Publicar en GitHub Pages

1. Crea un repositorio y sube el contenido de esta carpeta a la raíz de la
   rama `main`.
2. En **Settings → Pages**, elige *Deploy from a branch*, rama `main`,
   carpeta `/ (root)`.
3. En unos minutos queda en `https://<usuario>.github.io/<repositorio>/`.

No hace falta `.nojekyll` porque ningún archivo empieza con guion bajo.

## Cómo está hecho el motor

El motor siempre hace lo mismo: rompe el lienzo en piezas irregulares y pinta
cada una. La fuente de color se pasa aparte:

```js
const piezas = Trencadis.buildPieces(W, H, { seed, size, irregular, grout });

// Fase 1 · el color sale de la paleta
Trencadis.colorFromGradient(piezas, W, H, { colors, dir, dispersion });
// Un solo color
Trencadis.colorFromSolid(piezas, W, H, { color });
// Fase 2 · el color sale de la foto
Trencadis.colorFromPhoto(piezas, W, H, { data, contrast, saturation, colorMode, colors });

Trencadis.paint(ctx, piezas, W, H, { groutColor, variation, round, glaze, size }, escala);
```

La geometría, la pintura y la descarga son las mismas en los dos modos: lo
único que cambia es de dónde sale el color. En el modo Foto cada pieza
promedia el color de su zona (el centro y un punto hacia cada esquina), la
imagen conserva su tamaño y proporción originales, y las fotos grandes se
reducen a 2400 px en su lado más largo.

Dos detalles que sostienen los requerimientos del PRD:

- **Rapidez.** La geometría se guarda en memoria y solo se recalcula cuando
  cambia algo que la afecta (variación, tamaño, irregularidad, junta o
  formato). Mover colores, dirección, dispersión, tono, bordes o brillo solo
  repinta. En el peor caso (1920×1080 con piezas de 12 px, casi 17 000 piezas)
  la geometría tarda ~170 ms y la pintura otros ~170 ms.
- **Un mismo valor, el mismo resultado.** El tamaño de pieza y el grosor de
  junta se definen sobre un lienzo de referencia de 1080 px y se ajustan a la
  medida real del lienzo (`pieceScale`). En píxeles absolutos, 8 daba piezas
  grandes en una foto de 690 px y diminutas en una de 2400, y cambiaba también
  entre Cuadrado e Historia. Con el ajuste, 8 da el mismo mosaico en cualquier
  foto: 21 352 piezas tanto en 690 × 690 como en 2400 × 2400.
- **Calidad de salida.** La vista previa se pinta a la resolución de la
  pantalla; el PNG se pinta aparte en la medida exacta del formato. Es el
  mismo mosaico porque la geometría se calcula en píxeles de salida.

## Descarga del PNG

En la página publicada, el botón descarga el archivo directamente
(`canvas.toBlob` + enlace de descarga). Dentro del visor de artifacts los
enlaces de descarga no funcionan, así que ahí la app usa la capacidad
`downloads` del visor; si no está disponible, vuelve al enlace.

Nombre del archivo: `trencadis-fondo-1080x1080.png` para el modo Degradado y
`trencadis-mosaico-2400x1600.png` para el modo Foto; la medida que lleva el
nombre es la del archivo.

**Mientras exporta.** De 2K para arriba (más de 3 millones de píxeles) se
abre un modal con la medida que se está exportando, una barra de progreso y
una animación Lottie del perrito mirando las nubes
(`assets/lottie-perrito.js`, dibujada con los colores de la marca). La barra
avanza con los pasos reales —armar las piezas, pintarlas, guardar—; como el
codificado del PNG no informa de su avance, en ese último tramo la barra sube
sola hasta 94% y salta a 100% al terminar. La librería `lottie-web` se carga
desde cdnjs solo en la primera exportación; si no carga, el modal funciona
igual sin animación.

**Resolución.** Además de la medida original, el PNG se puede descargar en 2K
(2560 px de lado mayor), 4K (3840) y 8K (7680), siempre con la proporción del
formato: Historia en 4K sale en 2160 × 3840. No se reescala una imagen: se
vuelve a pintar el mismo mosaico a otra escala, así que los bordes salen
igual de limpios. Medido en un cuadrado: 4K tarda ~0.4 s y pesa ~12 MB; 8K
tarda ~1.8 s y pesa ~45 MB.

## Design system

Los valores de color, tipografía, espaciado y radios salen del design system
de la marca y están copiados en `assets/tokens.css`. Si la marca cambia, se
vuelven a copiar desde ahí en lugar de editarlos a mano.

El design system todavía no incluye archivos de logotipo ni isotipo, así que
la app usa el nombre en Unbounded con una marca de cuatro teselas como
provisional. Cuando el logotipo esté en el design system, se reemplaza en
`.wordmark` (`assets/app.css` y el marcado de `assets/app.js`).
