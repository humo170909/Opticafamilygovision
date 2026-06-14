# 📋 DOCUMENTACIÓN — ÓPTICA LIMA
> Sistema de gestión para óptica: inventario, ventas, pacientes y administración de usuarios.
> Stack: HTML + CSS + JavaScript Vanilla + Supabase + GitHub Pages

---

## 🗂️ ESTRUCTURA GENERAL

```
optica-lima/
├── index.html                      # Entry point
├── assets/                         # Recursos estáticos
├── css/                            # Estilos globales
├── views/                          # Páginas HTML
│   ├── auth/login.html
│   ├── dashboard.html
│   ├── inventario/
│   ├── ventas/
│   ├── pacientes/
│   └── admin/
└── js/
    ├── config/supabase.js
    ├── core/                        # Lógica global
    ├── modules/                     # Lógica por sección
    └── utils/                       # Helpers reutilizables
```

---

## 🔗 ORDEN DE DESARROLLO RECOMENDADO

```
1. js/config/supabase.js         ← Primero. Todo depende de esto.
2. js/utils/formatters.js        ← Funciones que usa toda la app.
3. js/utils/validators.js        ← Validaciones reutilizables.
4. js/utils/alerts.js            ← Sistema de notificaciones.
5. css/main.css                  ← Variables y base visual.
6. css/layout.css                ← Sidebar y estructura de pantallas.
7. css/components.css            ← Botones, tablas, modales.
8. css/responsive.css            ← Mobile last.
9. js/core/auth.js               ← Guard de sesión y roles.
10. js/core/ui.js                ← Sidebar activo, loader global.
11. js/core/router.js            ← Redirección por rol.
12. views/auth/login.html        ← Primera pantalla visible.
13. js/modules/auth/login.js     ← Lógica del login.
14. index.html                   ← Entry point con guard.
15. views/dashboard.html         ← Panel principal.
16. --- MÓDULO INVENTARIO ---
17. js/modules/inventario/categorias.js
18. views/inventario/categorias.html
19. js/modules/inventario/productos.js
20. views/inventario/productos.html
21. js/modules/inventario/stock.js
22. views/inventario/index.html
23. --- MÓDULO VENTAS ---
24. js/modules/ventas/pos.js
25. views/ventas/pos.html
26. js/modules/ventas/historial.js
27. views/ventas/historial.html
28. js/modules/ventas/reportes.js
29. views/ventas/reportes.html
30. --- MÓDULO PACIENTES ---
31. js/modules/pacientes/pacientes.js
32. views/pacientes/index.html
33. js/modules/pacientes/historial.js
34. views/pacientes/historial.html
35. js/modules/pacientes/citas.js
36. views/pacientes/citas.html
37. --- MÓDULO ADMIN ---
38. js/modules/admin/usuarios.js
39. views/admin/usuarios.html
40. js/modules/admin/configuracion.js
41. views/admin/configuracion.html
```

---

## 📁 DETALLE DE CADA ARCHIVO

---

### `/index.html`
**Qué es:** Punto de entrada de la app. El usuario siempre llega aquí primero.
**Qué debe hacer:** Verificar si hay sesión activa en Supabase. Si hay sesión → redirigir a `views/dashboard.html`. Si no hay sesión → redirigir a `views/auth/login.html`. No muestra ningún contenido visual, solo un loader mientras verifica.
**Depende de:** `js/config/supabase.js`, `js/core/auth.js`

**PROMPT PARA GENERARLO:**
```
Crea el archivo index.html para una app de gestión de óptica (HTML/CSS/JS vanilla + Supabase).
Este archivo es solo el entry point: debe mostrar un loader centrado en pantalla mientras
verifica si el usuario tiene sesión activa usando supabase.auth.getSession().
Si tiene sesión → redirigir a views/dashboard.html
Si no tiene → redirigir a views/auth/login.html
Importa los scripts: js/config/supabase.js y js/core/auth.js (type module).
El loader visual debe ser un spinner simple con el logo de la óptica.
No uses frameworks. Solo HTML, CSS inline mínimo y JS vanilla.
```

---

### `/assets/logo.svg`
**Qué es:** Logo vectorial de la óptica.
**Qué debe hacer:** Ser un SVG limpio, escalable, que funcione en fondos claros y oscuros.
**Depende de:** Nada.

**PROMPT PARA GENERARLO:**
```
Crea un logo SVG para una óptica llamada "Óptica Lima".
Diseño minimalista con un ícono de lentes/montura y el texto "Óptica Lima".
Colores: azul marino (#1a2e4a) y dorado (#c9a84c). Tamaño viewBox 200x60.
Que se vea profesional y moderno. Solo el SVG, sin HTML alrededor.
```

---

## 📁 CSS/

---

### `css/main.css`
**Qué es:** La base visual de toda la app. Se importa en todas las páginas.
**Qué debe hacer:** Definir las variables CSS globales (colores, tipografía, espaciado, sombras, bordes), reset básico de estilos, clase `.hidden`, `.loading`, utilidades básicas de texto.
**Variables clave a definir:** `--color-primary`, `--color-secondary`, `--color-bg`, `--color-surface`, `--color-text`, `--color-danger`, `--color-success`, `--color-warning`, `--shadow-sm`, `--shadow-md`, `--radius-sm`, `--radius-md`, `--font-base`, `--font-display`.

**PROMPT PARA GENERARLO:**
```
Crea css/main.css para un sistema de gestión de óptica (HTML/CSS vanilla, sin frameworks).
Debe contener:
1. Variables CSS: paleta de colores (azul marino primario, dorado acento, grises neutros),
   tipografía (usa Google Fonts: Outfit para display, Inter para body), espaciado (--space-xs a --space-xl),
   sombras y bordes redondeados.
2. Reset CSS moderno (box-sizing, margin 0, padding 0).
3. Estilos base para body, html, h1-h6, p, a.
4. Clases utilitarias: .hidden (display:none), .sr-only (accesibilidad), .text-center,
   .text-success, .text-danger, .text-warning, .flex, .flex-center, .gap-sm/md/lg.
5. Un spinner de carga: clase .spinner con animación CSS pura.
No incluyas estilos de layout ni de componentes, eso va en otros archivos.
```

---

### `css/layout.css`
**Qué es:** La estructura de las pantallas con sidebar.
**Qué debe hacer:** Definir el layout principal (sidebar fijo izquierda + área de contenido derecha), la navbar superior dentro del contenido, el menú del sidebar con sus ítems y estados activo/hover, el header de cada sección.
**Clases principales:** `.app-layout`, `.sidebar`, `.sidebar-nav`, `.sidebar-item`, `.sidebar-item.active`, `.main-content`, `.page-header`, `.topbar`.

**PROMPT PARA GENERARLO:**
```
Crea css/layout.css para un sistema de gestión de óptica.
Diseña un layout profesional con:
1. .app-layout: grid con sidebar de 260px fijo a la izquierda y .main-content que ocupa el resto.
2. .sidebar: fondo azul marino oscuro, altura 100vh, posición fija. Incluye área de logo
   arriba y nav de ítems. Scroll interno si hay muchos ítems.
3. .sidebar-nav .nav-item: ítem de menú con ícono + texto, hover con fondo semitransparente,
   estado .active con color dorado y fondo resaltado.
4. .sidebar-section-title: título de grupo (ej: "VENTAS", "ADMIN") en mayúsculas, pequeño, gris.
5. .topbar: barra superior dentro de .main-content, con nombre de página a la izquierda
   y avatar/nombre de usuario a la derecha.
6. .page-header: título de sección + botón de acción principal.
7. .content-area: padding estándar para el contenido de cada página.
Usa las variables de css/main.css. Sin frameworks.
```

---

### `css/components.css`
**Qué es:** Todos los componentes UI reutilizables.
**Qué debe hacer:** Estilos de botones (primario, secundario, danger, ghost, tamaños sm/md/lg), tablas de datos, badges de estado, cards/paneles, modales, formularios (inputs, selects, labels, mensajes de error), pills/tags, paginación, KPI cards para el dashboard.

**PROMPT PARA GENERARLO:**
```
Crea css/components.css para un sistema de gestión de óptica. Sin frameworks CSS.
Incluye estos componentes completos con todos sus estados (hover, focus, disabled, loading):

BOTONES: .btn (base), .btn-primary, .btn-secondary, .btn-danger, .btn-ghost, .btn-sm, .btn-lg, .btn-icon.
TABLAS: .data-table con thead sticky, filas zebra, hover en filas, columnas de acción.
BADGES: .badge con variantes .badge-success, .badge-warning, .badge-danger, .badge-info, .badge-neutral.
CARDS: .card con header, body, footer. .card-stat para KPIs (número grande + etiqueta + icono).
MODALES: .modal-overlay, .modal, .modal-header, .modal-body, .modal-footer. Con animación de entrada.
FORMULARIOS: .form-group, .form-label, .form-input, .form-select, .form-textarea, .form-error, .form-hint.
ALERTAS: .alert con variantes success/warning/danger/info.
PAGINACIÓN: .pagination con botones anterior/siguiente y números.
EMPTY STATE: .empty-state para cuando no hay datos en una tabla.
Usa variables de css/main.css.
```

---

### `css/responsive.css`
**Qué es:** Adaptaciones para pantallas pequeñas.
**Qué debe hacer:** Colapsar el sidebar en móvil (hamburger menu), ajustar tablas para scroll horizontal, apilar cards en mobile, ajustar tipografía y espaciados.
**Breakpoints:** 1024px (tablet), 768px (mobile).

**PROMPT PARA GENERARLO:**
```
Crea css/responsive.css para un sistema de gestión de óptica.
El layout base tiene un sidebar fijo de 260px + contenido principal (definido en layout.css).
Breakpoints a manejar:

@media (max-width: 1024px) — tablet:
- Sidebar se reduce a 70px mostrando solo iconos.
- Textos del sidebar ocultos, solo iconos centrados.

@media (max-width: 768px) — mobile:
- Sidebar completamente oculto, se abre con un botón hamburguesa en el topbar.
- Sidebar en mobile: overlay lateral que aparece desde la izquierda (transform translateX).
- .data-table: contenedor con overflow-x: auto y tabla de ancho mínimo 600px.
- .card-stat: grid de 2 columnas en lugar de 4.
- .page-header: título y botón en columna, no en fila.
No uses JavaScript en este archivo, solo CSS con clases que JS agregará (.sidebar-open, .sidebar-collapsed).
```

---

## 📁 JS/CONFIG/

---

### `js/config/supabase.js`
**Qué es:** Inicialización del cliente Supabase. El archivo más crítico del proyecto.
**Qué debe hacer:** Importar el SDK de Supabase desde CDN (ESM), definir las variables `SUPABASE_URL` y `SUPABASE_ANON_KEY`, crear y exportar el cliente `supabaseClient`. También exportar constantes de roles (`ROLES = { ADMIN: 'admin', VENDEDOR: 'vendedor' }`).
**IMPORTANTE:** Solo usar la `anon key`. Nunca la `service_role key`.

**PROMPT PARA GENERARLO:**
```
Crea js/config/supabase.js para una app vanilla JS en GitHub Pages.
Debe:
1. Importar createClient desde el CDN ESM de Supabase:
   https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm
2. Definir SUPABASE_URL y SUPABASE_ANON_KEY como constantes (dejar placeholders 'TU_URL' y 'TU_KEY').
3. Crear el cliente: export const supabaseClient = createClient(URL, KEY)
4. Exportar constante ROLES = { ADMIN: 'admin', VENDEDOR: 'vendedor' }
5. Exportar constante TABLES con los nombres de todas las tablas:
   PRODUCTOS, CATEGORIAS, VENTAS, DETALLE_VENTAS, PACIENTES, RECETAS, CITAS, USUARIOS_PERFIL
6. Agregar un comentario explicando que la service_role key NUNCA debe usarse en frontend.
Solo ES modules, sin CommonJS. El archivo no debe tener lógica, solo configuración y exports.
```

---

## 📁 JS/CORE/

---

### `js/core/auth.js`
**Qué es:** El guard de autenticación. Corre en cada página.
**Qué debe hacer:** Exportar función `checkAuth()` que verifica sesión activa y redirige a login si no hay. Exportar `getUser()` para obtener el usuario actual con su rol (desde la tabla `usuarios_perfil`). Exportar `checkRole(rol)` para verificar si el usuario tiene permiso para ver cierta página. Exportar `logout()` para cerrar sesión y redirigir.

**PROMPT PARA GENERARLO:**
```
Crea js/core/auth.js para un sistema de gestión de óptica con Supabase y vanilla JS.
Importa supabaseClient y ROLES desde js/config/supabase.js.

Exporta estas funciones async:

1. checkAuth(redirectPath = '/views/auth/login.html'):
   Llama a supabaseClient.auth.getSession().
   Si no hay sesión, redirige a redirectPath.
   Retorna la sesión si existe.

2. getUser():
   Obtiene el usuario autenticado de Supabase Auth.
   Luego hace query a la tabla 'usuarios_perfil' por el user.id para obtener nombre, rol, foto.
   Retorna objeto { id, email, nombre, rol, foto_url }.

3. checkRole(rolesPermitidos = []):
   Llama a getUser(), verifica si user.rol está en rolesPermitidos.
   Si no tiene permiso, redirige a views/dashboard.html y retorna false.
   Retorna true si tiene permiso.

4. logout():
   Llama a supabaseClient.auth.signOut().
   Redirige a views/auth/login.html.

Maneja errores con try/catch. Usa ES modules.
```

---

### `js/core/ui.js`
**Qué es:** Controlador de la interfaz global (sidebar, loader, topbar).
**Qué debe hacer:** Inicializar el sidebar marcando el ítem activo según la URL actual, mostrar el nombre y avatar del usuario en el topbar, controlar el toggle del sidebar en mobile, mostrar/ocultar el loader global, manejar el botón de logout en el sidebar.

**PROMPT PARA GENERARLO:**
```
Crea js/core/ui.js para un sistema de gestión de óptica. Vanilla JS, ES modules.
Importa getUser y logout desde js/core/auth.js.

Exporta estas funciones:

1. initUI():
   Función principal que llama a todas las demás. Se llama al cargar cada página.
   
2. initSidebar():
   Lee window.location.pathname, busca el nav-item del sidebar cuyo href coincide
   y le agrega la clase 'active'. También inicializa el toggle mobile.

3. initTopbar():
   Llama a getUser(), inyecta el nombre del usuario y su foto/avatar en el topbar.
   Si no hay foto, muestra las iniciales del nombre en un círculo de color.

4. showLoader() / hideLoader():
   Agrega/quita clase 'loading' al body, que muestra un overlay con spinner.

5. initMobileSidebar():
   Agrega evento al botón hamburguesa para togglear clase 'sidebar-open' en el sidebar.
   Cierra el sidebar al hacer click fuera de él.

6. initLogout():
   Busca elemento con id 'btn-logout' y le agrega el evento click que llama a logout().

No manipules el DOM antes de DOMContentLoaded. Maneja casos donde los elementos no existen.
```

---

### `js/core/router.js`
**Qué es:** Redirección inteligente según rol del usuario.
**Qué debe hacer:** Exportar `redirectByRole()` que según el rol del usuario (admin/vendedor) lo lleva a la página correcta. Los vendedores solo pueden acceder a ventas y pacientes. Los admin pueden acceder a todo. Exportar `protectRoute(rolesPermitidos)` que combina `checkAuth` y `checkRole`.

**PROMPT PARA GENERARLO:**
```
Crea js/core/router.js para un sistema de gestión de óptica. Vanilla JS, ES modules.
Importa checkAuth, checkRole, getUser desde js/core/auth.js.
Importa ROLES desde js/config/supabase.js.

Define rutas permitidas por rol:
- ADMIN: acceso a todo.
- VENDEDOR: solo /views/ventas/, /views/pacientes/, /views/dashboard.html

Exporta:

1. protectRoute(rolesPermitidos = []):
   Llama a checkAuth() primero.
   Luego llama a checkRole(rolesPermitidos).
   Si pasa ambos, retorna el usuario actual.
   Úsala al inicio de cada página protegida.

2. redirectByRole():
   Obtiene el usuario con getUser().
   Si es ADMIN → redirige a views/dashboard.html
   Si es VENDEDOR → redirige a views/ventas/pos.html

3. isCurrentRoute(path):
   Retorna true si window.location.pathname incluye el path dado.
   Útil para marcar el sidebar activo.

Maneja errores. Si algo falla, redirigir siempre a login.
```

---

## 📁 JS/MODULES/AUTH/

---

### `js/modules/auth/login.js`
**Qué es:** Lógica del formulario de login.
**Qué debe hacer:** Escuchar el submit del formulario, llamar a `supabaseClient.auth.signInWithPassword()`, manejar errores (credenciales incorrectas, usuario no existe), si el login es exitoso llamar a `redirectByRole()` para redirigir según el rol.

**PROMPT PARA GENERARLO:**
```
Crea js/modules/auth/login.js para un sistema de gestión de óptica. Vanilla JS, ES modules.
Importa supabaseClient desde js/config/supabase.js.
Importa redirectByRole desde js/core/router.js.
Importa showAlert desde js/utils/alerts.js.

Lógica:
1. Al hacer DOMContentLoaded, verificar si ya hay sesión (si la hay, llamar redirectByRole()).
2. Escuchar submit del formulario con id 'form-login'.
3. Obtener email y password del formulario.
4. Mostrar estado loading en el botón submit (deshabilitar + texto "Ingresando...").
5. Llamar supabaseClient.auth.signInWithPassword({ email, password }).
6. Si hay error: mostrar mensaje de error con showAlert('error', mensaje).
   Casos a manejar: 'Invalid login credentials' → "Email o contraseña incorrectos".
7. Si éxito: llamar redirectByRole().
8. Siempre restaurar el botón al estado normal en el bloque finally.

Sin hardcodear credenciales. Manejo de errores completo.
```

---

## 📁 JS/MODULES/INVENTARIO/

---

### `js/modules/inventario/categorias.js`
**Qué es:** CRUD de categorías de productos (monturas, lunas, accesorios, etc.).
**Qué debe hacer:** Cargar y renderizar la tabla de categorías, formulario para crear/editar categoría, eliminar categoría con confirmación.

**PROMPT PARA GENERARLO:**
```
Crea js/modules/inventario/categorias.js para un sistema de gestión de óptica. Vanilla JS, ES modules.
Importa supabaseClient, TABLES desde js/config/supabase.js.
Importa showAlert, confirmDialog desde js/utils/alerts.js.
Importa formatDate desde js/utils/formatters.js.

La tabla en Supabase se llama TABLES.CATEGORIAS con campos: id, nombre, descripcion, created_at.

Exporta estas funciones:

1. loadCategorias():
   Fetch a Supabase, ordena por nombre. Llama a renderTabla(categorias).

2. renderTabla(categorias):
   Inyecta filas en tbody con id 'tabla-categorias-body'.
   Cada fila: nombre, descripción, fecha creación, botones editar/eliminar.
   Si está vacío, muestra empty state.

3. openModal(categoria = null):
   Abre modal con id 'modal-categoria'. Si recibe data, es modo edición (pre-rellena el form).

4. saveCategoria(formData):
   Si tiene id → update. Si no → insert. Cierra modal y recarga tabla.

5. deleteCategoria(id):
   Llama a confirmDialog('¿Eliminar categoría?').
   Si confirma → delete en Supabase. Recarga tabla.

6. init():
   Llama a loadCategorias(), inicializa eventos de botones y formulario del modal.
   Exportar e llamar desde la vista.
```

---

### `js/modules/inventario/productos.js`
**Qué es:** CRUD completo de productos (monturas, lunas, accesorios).
**Qué debe hacer:** Listar productos con filtros por categoría y búsqueda por nombre, crear/editar producto con todos sus campos, eliminar producto, mostrar stock actual de cada producto.

**PROMPT PARA GENERARLO:**
```
Crea js/modules/inventario/productos.js para un sistema de gestión de óptica. Vanilla JS, ES modules.
Importa supabaseClient, TABLES desde js/config/supabase.js.
Importa showAlert, confirmDialog desde js/utils/alerts.js.
Importa formatMoney, formatDate desde js/utils/formatters.js.

La tabla TABLES.PRODUCTOS tiene campos:
id, nombre, descripcion, categoria_id, precio_compra, precio_venta, stock_actual,
stock_minimo, codigo_barras, marca, modelo, imagen_url, activo, created_at.

Exporta:

1. loadProductos(filtros = {}):
   Query con join a categorias. Soporta filtro por categoria_id y búsqueda por nombre (ilike).
   Llama a renderTabla(productos).

2. renderTabla(productos):
   Tabla con: imagen thumbnail, nombre, marca, categoría, precio venta (formatMoney),
   stock actual con badge de color (verde si ok, rojo si <= stock_minimo), botones acción.

3. openModal(producto = null):
   Modal con formulario completo. Carga select de categorías desde Supabase.

4. saveProducto(formData):
   Upsert en Supabase. Valida que precio_venta > precio_compra. Cierra modal y recarga.

5. deleteProducto(id):
   Solo si stock_actual === 0, sino muestra error. Confirmación antes de eliminar.

6. initFiltros():
   Evento en input búsqueda (debounce 300ms) y select categoría → llama loadProductos con filtros.

7. init(): inicializa todo.
```

---

### `js/modules/inventario/stock.js`
**Qué es:** Control de entradas y salidas de stock (ajustes manuales, recepciones de mercadería).
**Qué debe hacer:** Registrar entrada de stock (compra/recepción), registrar salida manual, ver historial de movimientos de stock, alertas de productos con stock bajo.

**PROMPT PARA GENERARLO:**
```
Crea js/modules/inventario/stock.js para un sistema de gestión de óptica. Vanilla JS, ES modules.
Importa supabaseClient, TABLES desde js/config/supabase.js.
Importa showAlert desde js/utils/alerts.js.
Importa formatDate, formatMoney desde js/utils/formatters.js.

Tabla MOVIMIENTOS_STOCK: id, producto_id, tipo ('entrada'|'salida'|'ajuste'),
cantidad, motivo, usuario_id, created_at.

Exporta:

1. loadMovimientos(productoId = null):
   Carga historial de movimientos. Si recibe productoId, filtra por producto.
   Join con productos para mostrar nombre. Ordena por created_at desc.

2. registrarMovimiento({ productoId, tipo, cantidad, motivo }):
   Inserta en MOVIMIENTOS_STOCK.
   Luego actualiza stock_actual del producto: si entrada suma, si salida resta.
   Valida que salida no deje stock negativo.

3. loadStockBajo():
   Query productos donde stock_actual <= stock_minimo.
   Retorna array para mostrar alertas en el dashboard.

4. renderAlertasStock(productos):
   Inyecta en contenedor con id 'alertas-stock' cards de advertencia por cada producto
   con stock bajo. Muestra nombre, stock actual vs mínimo.

5. renderHistorial(movimientos):
   Tabla con: fecha, producto, tipo (badge), cantidad, motivo, usuario.

6. init(): carga movimientos recientes y alertas de stock bajo.
```

---

## 📁 JS/MODULES/VENTAS/

---

### `js/modules/ventas/pos.js`
**Qué es:** El punto de venta. El módulo más complejo del sistema.
**Qué debe hacer:** Buscar productos por nombre o código de barras, agregar al carrito, modificar cantidades, calcular subtotal + IGV (18%) + total, procesar la venta (crear registro en ventas + detalle_ventas + actualizar stock), emitir comprobante.

**PROMPT PARA GENERARLO:**
```
Crea js/modules/ventas/pos.js para un sistema de gestión de óptica. Vanilla JS, ES modules.
Importa supabaseClient, TABLES desde js/config/supabase.js.
Importa showAlert, confirmDialog desde js/utils/alerts.js.
Importa formatMoney desde js/utils/formatters.js.
Importa getUser desde js/core/auth.js.

IGV = 18%. El carrito se guarda en memoria (array local).

Exporta:

1. buscarProducto(query):
   Busca en PRODUCTOS por nombre (ilike) o codigo_barras. Stock > 0 solo.
   Renderiza resultados como lista clickeable para agregar al carrito.

2. agregarAlCarrito(producto):
   Si ya está en carrito, incrementa cantidad (respetando stock máximo).
   Si no, agrega con cantidad 1. Llama a renderCarrito().

3. actualizarCantidad(productoId, cantidad):
   Actualiza cantidad en el array del carrito. Valida stock disponible.

4. eliminarDelCarrito(productoId): elimina el ítem.

5. renderCarrito():
   Inyecta ítems en contenedor 'carrito-items'. Muestra cada ítem con nombre,
   cantidad (input number), precio unitario, subtotal. Botón eliminar.
   Actualiza totales: subtotal, IGV (18%), total.

6. procesarVenta({ pacienteId, metodoPago, observaciones }):
   Crea registro en VENTAS con: total, igv, subtotal, metodo_pago, usuario_id, paciente_id.
   Por cada ítem del carrito, inserta en DETALLE_VENTAS.
   Llama a registrarMovimiento() de stock.js para cada producto.
   Si todo ok: limpia carrito, muestra modal de venta exitosa con opción de imprimir.

7. init(): inicializa búsqueda y formulario de pago.
```

---

### `js/modules/ventas/historial.js`
**Qué es:** Listado de todas las ventas realizadas con filtros.
**Qué debe hacer:** Mostrar ventas con filtros por fecha, vendedor y método de pago, ver detalle de una venta (ítems), paginación.

**PROMPT PARA GENERARLO:**
```
Crea js/modules/ventas/historial.js para un sistema de gestión de óptica. Vanilla JS, ES modules.
Importa supabaseClient, TABLES desde js/config/supabase.js.
Importa formatMoney, formatDate, formatDateTime desde js/utils/formatters.js.

Tabla VENTAS: id, created_at, total, subtotal, igv, metodo_pago, usuario_id, paciente_id, anulada.
Tabla DETALLE_VENTAS: id, venta_id, producto_id, cantidad, precio_unitario, subtotal.

Exporta:

1. loadVentas(filtros = { fechaDesde, fechaHasta, metodoPago, page: 1 }):
   Query con filtros, join a usuarios_perfil para nombre vendedor, join a pacientes.
   Paginación de 20 registros. Retorna { ventas, total, paginas }.

2. renderTabla(ventas):
   Tabla: fecha/hora, # venta, paciente, vendedor, método pago (badge), total, estado (anulada badge), ver detalle.

3. openDetalleModal(ventaId):
   Fetch de DETALLE_VENTAS con join a productos para esa venta.
   Muestra modal con tabla de ítems + totales.

4. anularVenta(ventaId):
   Solo admin. Confirma, luego actualiza campo 'anulada = true'.
   No elimina, solo marca como anulada. Muestra en tabla con badge rojo.

5. initFiltros(): inicializa datepickers y select de método de pago con sus eventos.

6. renderPaginacion(pagActual, totalPaginas): controles de paginación.

7. init(): carga ventas de hoy por defecto.
```

---

### `js/modules/ventas/reportes.js`
**Qué es:** Dashboard de reportes y gráficos de ventas.
**Qué debe hacer:** Gráfico de ventas por día (últimos 30 días), ventas por categoría de producto (pie chart), top 5 productos más vendidos, KPIs: total vendido hoy, esta semana, este mes.

**PROMPT PARA GENERARLO:**
```
Crea js/modules/ventas/reportes.js para un sistema de gestión de óptica. Vanilla JS, ES modules.
Importa supabaseClient, TABLES desde js/config/supabase.js.
Importa formatMoney desde js/utils/formatters.js.
Usa Chart.js desde CDN (ya incluido en el HTML via script tag global).

Exporta:

1. loadKPIs():
   Queries a VENTAS para calcular: total de hoy, total semana actual, total mes actual,
   número de ventas del día. Inyecta en elementos con ids: kpi-hoy, kpi-semana, kpi-mes, kpi-num-ventas.

2. chartVentasPorDia():
   Agrupa VENTAS por día en los últimos 30 días (sum de total).
   Renderiza line chart en canvas con id 'chart-ventas-diarias'.

3. chartVentasPorCategoria():
   Join DETALLE_VENTAS → PRODUCTOS → CATEGORIAS, suma por categoría.
   Renderiza doughnut chart en canvas 'chart-por-categoria'.

4. topProductos():
   Agrupa DETALLE_VENTAS por producto, suma cantidad, top 5.
   Renderiza tabla simple en contenedor 'tabla-top-productos'.

5. initFiltroFecha():
   Select de período (hoy, semana, mes, personalizado). Al cambiar, recarga todos los datos.

6. init(): carga KPIs, inicializa los 3 charts y el filtro.
```

---

## 📁 JS/MODULES/PACIENTES/

---

### `js/modules/pacientes/pacientes.js`
**Qué es:** CRUD de pacientes de la óptica.
**Qué debe hacer:** Listar pacientes con búsqueda por nombre/DNI, crear y editar ficha de paciente, ver historial clínico de cada paciente.

**PROMPT PARA GENERARLO:**
```
Crea js/modules/pacientes/pacientes.js para un sistema de gestión de óptica. Vanilla JS, ES modules.
Importa supabaseClient, TABLES desde js/config/supabase.js.
Importa showAlert, confirmDialog desde js/utils/alerts.js.
Importa formatDate, formatDNI desde js/utils/formatters.js.
Importa validateDNI desde js/utils/validators.js.

Tabla PACIENTES: id, nombres, apellidos, dni, telefono, email, fecha_nacimiento,
direccion, created_at, activo.

Exporta:

1. loadPacientes(busqueda = ''):
   Busca por nombres, apellidos o dni (ilike). Ordena por apellidos.

2. renderTabla(pacientes):
   Tabla: nombre completo, DNI, teléfono, email, edad calculada, fecha registro,
   botones: ver historial, editar.

3. openModal(paciente = null):
   Formulario con todos los campos. Validación de DNI con validateDNI().

4. savePaciente(formData):
   Valida DNI único antes de insertar (query previo). Upsert en Supabase.

5. verHistorial(pacienteId):
   Redirige a views/pacientes/historial.html?id=pacienteId.

6. calcularEdad(fechaNacimiento): retorna edad en años.

7. init(): carga pacientes, inicializa búsqueda con debounce y formulario modal.
```

---

### `js/modules/pacientes/historial.js`
**Qué es:** Historia clínica del paciente: recetas de graduación visual.
**Qué debe hacer:** Mostrar todas las recetas/graduaciones del paciente ordenadas por fecha, agregar nueva receta con todos los campos oftalmológicos (esfera, cilindro, eje, adición para cada ojo), ver detalle de cada receta.

**PROMPT PARA GENERARLO:**
```
Crea js/modules/pacientes/historial.js para un sistema de gestión de óptica. Vanilla JS, ES modules.
Importa supabaseClient, TABLES desde js/config/supabase.js.
Importa showAlert desde js/utils/alerts.js.
Importa formatDate desde js/utils/formatters.js.

Tabla RECETAS: id, paciente_id, fecha, ojoD_esfera, ojoD_cilindro, ojoD_eje, ojoD_adicion,
ojoI_esfera, ojoI_cilindro, ojoI_eje, ojoI_adicion, observaciones, optometrista, created_at.

Lee el paciente_id desde URLSearchParams ('?id=...').

Exporta:

1. loadPaciente(id):
   Fetch datos del paciente, inyecta nombre completo y datos en el header de la página.

2. loadRecetas(pacienteId):
   Fetch de todas las recetas del paciente, orden por fecha desc.

3. renderRecetas(recetas):
   Cards o tabla mostrando fecha, graduación de cada ojo en formato oftalmológico,
   observaciones, optometrista. Botón para ver detalle/imprimir.

4. openModalReceta():
   Formulario con campos por ojo (OD y OI): esfera (-20 a +20), cilindro (-10 a 0),
   eje (0-180), adición (0 a +4). Observaciones y optometrista.

5. saveReceta(formData):
   Inserta receta vinculada al paciente. Recarga lista.

6. printReceta(recetaId):
   Abre ventana de impresión con la receta formateada.

7. init(): Lee id de URL, carga paciente y sus recetas.
```

---

### `js/modules/pacientes/citas.js`
**Qué es:** Agenda de citas de pacientes.
**Qué debe hacer:** Ver citas del día/semana, crear nueva cita, marcar cita como completada o cancelada, recordatorio visual de citas próximas.

**PROMPT PARA GENERARLO:**
```
Crea js/modules/pacientes/citas.js para un sistema de gestión de óptica. Vanilla JS, ES modules.
Importa supabaseClient, TABLES desde js/config/supabase.js.
Importa showAlert, confirmDialog desde js/utils/alerts.js.
Importa formatDate, formatTime desde js/utils/formatters.js.

Tabla CITAS: id, paciente_id, fecha, hora, motivo, estado ('pendiente'|'completada'|'cancelada'),
notas, created_at.

Exporta:

1. loadCitas(filtros = { fecha: hoy, estado: null }):
   Fetch citas con join a pacientes. Por defecto citas de hoy.

2. renderCitas(citas):
   Lista de citas agrupadas por hora. Cada cita muestra: hora, nombre paciente,
   motivo, estado (badge con color), botones: completar, cancelar.

3. openModal(cita = null):
   Formulario: buscar paciente (live search), fecha, hora, motivo, notas.

4. saveCita(formData):
   Valida que no haya otra cita a la misma hora. Inserta en Supabase.

5. cambiarEstado(citaId, nuevoEstado):
   Update del campo estado. Si completada → preguntar si abrir historial del paciente.

6. citasProximas():
   Citas de las próximas 24h que estén pendientes. Para mostrar en dashboard.

7. init(): carga citas de hoy, inicializa filtros de fecha y estado.
```

---

## 📁 JS/MODULES/ADMIN/

---

### `js/modules/admin/usuarios.js`
**Qué es:** Gestión de usuarios del sistema (solo admin).
**Qué debe hacer:** Listar todos los usuarios con su rol, crear nuevo usuario (Supabase Auth + tabla perfil), editar rol de usuario, desactivar usuario sin eliminarlo.

**PROMPT PARA GENERARLO:**
```
Crea js/modules/admin/usuarios.js para un sistema de gestión de óptica. Vanilla JS, ES modules.
Solo accesible para usuarios con rol ADMIN (verificar con checkRole al inicio).
Importa supabaseClient, TABLES, ROLES desde js/config/supabase.js.
Importa showAlert, confirmDialog desde js/utils/alerts.js.
Importa formatDate desde js/utils/formatters.js.
Importa protectRoute desde js/core/router.js.

Tabla USUARIOS_PERFIL: id (= auth.users.id), email, nombre, rol, activo, created_at.

IMPORTANTE: Para crear usuarios usar supabaseClient.auth.admin — pero esto requiere service_role.
Alternativa para frontend: usar supabaseClient.auth.signUp() desde una función Edge de Supabase,
o crear usuarios directamente invitándolos. Documentar esta limitación claramente.

Exporta:

1. loadUsuarios():
   Fetch de USUARIOS_PERFIL, todos los registros. Renderiza tabla.

2. renderTabla(usuarios):
   Tabla: nombre, email, rol (badge), estado activo/inactivo, fecha creación, acciones.

3. openModal(usuario = null):
   Si es nuevo: campos email, nombre, rol, contraseña temporal.
   Si es editar: solo nombre y rol (el email no se cambia).

4. cambiarRol(usuarioId, nuevoRol):
   Update en USUARIOS_PERFIL. Confirmación previa.

5. toggleActivo(usuarioId, activo):
   Activa o desactiva usuario. Un admin no puede desactivarse a sí mismo.

6. init(): llama a protectRoute([ROLES.ADMIN]), luego carga usuarios.
```

---

### `js/modules/admin/configuracion.js`
**Qué es:** Configuración general del negocio.
**Qué debe hacer:** Datos de la óptica (nombre, RUC, dirección, teléfono, logo), configuración del IGV, datos para el comprobante de venta.

**PROMPT PARA GENERARLO:**
```
Crea js/modules/admin/configuracion.js para un sistema de gestión de óptica. Vanilla JS, ES modules.
Solo accesible para ADMIN.
Importa supabaseClient desde js/config/supabase.js.
Importa showAlert desde js/utils/alerts.js.
Importa validateRUC desde js/utils/validators.js.
Importa protectRoute desde js/core/router.js.

Tabla CONFIGURACION: id (siempre 1, solo hay 1 registro), nombre_negocio, ruc, direccion,
telefono, email_negocio, igv_porcentaje (default 18), logo_url, pie_comprobante.

Exporta:

1. loadConfig():
   Fetch del único registro de CONFIGURACION (id = 1).
   Pre-rellena el formulario con los datos actuales.

2. saveConfig(formData):
   Valida RUC con validateRUC().
   Si ya existe registro (id=1) → update. Si no → insert.
   showAlert de éxito al guardar.

3. uploadLogo(file):
   Sube la imagen a Supabase Storage bucket 'logos'.
   Actualiza logo_url en CONFIGURACION.
   Muestra preview de la imagen subida.

4. getConfig():
   Función utilitaria que retorna la config actual. Usada por pos.js para el comprobante.

5. init(): llama a protectRoute, luego loadConfig().
```

---

## 📁 JS/UTILS/

---

### `js/utils/formatters.js`
**Qué es:** Funciones de formato reutilizables en toda la app.

**PROMPT PARA GENERARLO:**
```
Crea js/utils/formatters.js para un sistema de gestión de óptica en Perú. Vanilla JS, ES modules.
Exporta estas funciones puras (sin efectos secundarios):

formatMoney(amount): 
  Retorna string con formato "S/ 1,250.00" (soles peruanos). Maneja null/undefined → "S/ 0.00".

formatDate(dateString):
  Recibe ISO string o Date. Retorna "15 ene 2025" en español peruano. Usa Intl.DateTimeFormat.

formatDateTime(dateString):
  Retorna "15 ene 2025, 14:30". Fecha y hora en español.

formatTime(timeString):
  Recibe "14:30:00" o "14:30". Retorna "2:30 PM".

formatDNI(dni):
  Asegura 8 dígitos con ceros a la izquierda si es necesario. Retorna string.

formatRUC(ruc):
  Valida longitud de 11. Retorna string formateado o el original.

formatPhoneNumber(phone):
  Formato peruano: "999 999 999" para celular, "(01) 999-9999" para fijo.

calcularEdad(fechaNacimiento):
  Recibe fecha string. Retorna número entero de años.

truncateText(text, maxLength = 50):
  Corta texto y agrega "..." si supera el límite.

formatGraduacion(valor):
  Para recetas oftalmológicas: convierte -2.5 a "-2.50" o +1.75 a "+1.75" (siempre con signo).
```

---

### `js/utils/validators.js`
**Qué es:** Funciones de validación para formularios.

**PROMPT PARA GENERARLO:**
```
Crea js/utils/validators.js para un sistema de gestión de óptica en Perú. Vanilla JS, ES modules.
Exporta estas funciones que retornan { valid: boolean, error: string }:

validateDNI(dni):
  Exactamente 8 dígitos numéricos. Error: "El DNI debe tener 8 dígitos".

validateRUC(ruc):
  Exactamente 11 dígitos. Comienza con 10 (persona natural) o 20 (empresa).
  Error descriptivo según el caso.

validateEmail(email):
  Regex estándar de email. Error: "Email inválido".

validatePhone(phone):
  9 dígitos para celular o 7 dígitos para fijo (Perú). Error: "Teléfono inválido".

validateRequired(value, fieldName = 'Campo'):
  Verifica que no esté vacío/null/undefined. Error: "{fieldName} es requerido".

validateNumber(value, { min, max, decimals } = {}):
  Es número, dentro del rango si se especifica. Para graduaciones oftalmológicas.

validatePrice(value):
  Número positivo con máximo 2 decimales. Error: "Precio inválido".

validateStockQuantity(value):
  Entero positivo mayor a 0. Error descriptivo.

validateForm(formElement):
  Recorre todos los inputs con atributo data-validate, aplica las validaciones
  correspondientes, agrega clase 'input-error' y muestra mensajes.
  Retorna true si todos pasan, false si hay errores.
```

---

### `js/utils/alerts.js`
**Qué es:** Sistema centralizado de notificaciones y diálogos.

**PROMPT PARA GENERARLO:**
```
Crea js/utils/alerts.js para un sistema de gestión de óptica. Vanilla JS, ES modules.
NO uses librerías externas. Implementa todo con CSS y JS puro.

Exporta:

showAlert(type, message, duration = 3000):
  Tipos: 'success', 'error', 'warning', 'info'.
  Crea un toast notification en la esquina superior derecha.
  Animación de entrada (slide-in) y salida automática con fadeout.
  Múltiples toasts apilados verticalmente.
  Íconos SVG inline para cada tipo.

confirmDialog(message, { confirmText = 'Confirmar', cancelText = 'Cancelar', type = 'warning' } = {}):
  Retorna una Promise<boolean>.
  Muestra modal centrado con overlay oscuro.
  Botón confirmar y cancelar. Resolve(true) si confirma, resolve(false) si cancela.
  Animación de entrada del modal.

showLoading(message = 'Cargando...'):
  Overlay full screen con spinner y mensaje.

hideLoading():
  Remueve el overlay de loading.

Todos los elementos se crean dinámicamente en el DOM y se eliminan al cerrarse.
Incluye los estilos críticos inline en el JS para que funcione sin depender de CSS externo.
```

---

## 📁 VIEWS/

---

### `views/auth/login.html`

**PROMPT PARA GENERARLO:**
```
Crea views/auth/login.html para un sistema de gestión de óptica en Perú.
HTML5 completo (con doctype, head, body). Sin frameworks CSS, usa variables de css/main.css.

Diseño: página centrada en pantalla, card de login al centro.
- Logo de la óptica (assets/logo.svg) arriba del card.
- Título "Iniciar Sesión" y subtítulo "Sistema de Gestión".
- Formulario con id="form-login": input email, input password (con toggle mostrar/ocultar), botón submit.
- Mensaje de error con id="error-message" oculto por defecto.
- No incluir enlace de registro (los usuarios los crea el admin).
- Fondo con gradiente sutil o patrón geométrico acorde a la paleta de la óptica.
- Diseño responsivo y accesible (labels, aria).

Scripts a importar (type="module"):
- js/config/supabase.js
- js/modules/auth/login.js

Importar en head:
- css/main.css
- Google Fonts (Outfit + Inter)
```

---

### `views/dashboard.html`

**PROMPT PARA GENERARLO:**
```
Crea views/dashboard.html para un sistema de gestión de óptica.
HTML5 completo. Importa: css/main.css, css/layout.css, css/components.css, css/responsive.css.
Scripts (type="module"): js/config/supabase.js, js/core/auth.js, js/core/ui.js.
También importa Chart.js desde CDN (no module).

Estructura del layout con sidebar (usa clases de layout.css):
SIDEBAR:
- Logo en la parte superior.
- Grupos de navegación:
  PRINCIPAL: Dashboard (activo), 
  INVENTARIO: Productos, Categorías, Stock,
  VENTAS: Punto de Venta, Historial de Ventas, Reportes,
  PACIENTES: Pacientes, Historial Clínico, Citas,
  ADMINISTRACIÓN (solo visible para admin): Usuarios, Configuración.
- Abajo: nombre del usuario logueado y botón logout (id="btn-logout").

CONTENIDO PRINCIPAL:
- Topbar con título "Dashboard" y avatar de usuario.
- 4 cards KPI: Ventas Hoy, Ventas Semana, Pacientes del día, Alertas de Stock.
  Cada card con id para que reportes.js inyecte los datos.
- Gráfico de ventas últimos 30 días: canvas id="chart-ventas-diarias".
- Sección de citas de hoy: contenedor id="citas-hoy".
- Sección alertas de stock bajo: contenedor id="alertas-stock".

Script inline al final que importa y llama a init() de los módulos necesarios.
```

---

### `views/inventario/index.html`

**PROMPT PARA GENERARLO:**
```
Crea views/inventario/index.html (vista principal de inventario/stock) para una óptica.
HTML5 completo con mismo sidebar y layout que dashboard.html.
Importa los mismos CSS. Scripts module: supabase.js, auth.js, ui.js.

Contenido principal:
- Page header: "Control de Stock" + botón "Registrar Movimiento".
- Tabs o filtro: "Todos los productos" | "Stock Bajo" | "Sin Stock".
- Tabla con id="tabla-stock-body": producto, categoría, stock actual, stock mínimo,
  estado (badge), última actualización, botón "Ajustar Stock".
- Modal con id="modal-movimiento": formulario para registrar entrada/salida de stock.
  Campos: buscar producto, tipo (entrada/salida/ajuste), cantidad, motivo.
- Sección de alertas: contenedor id="alertas-stock" arriba de la tabla.

Script inline que importa init() de js/modules/inventario/stock.js.
Ítem activo del sidebar: "Stock".
```

---

### `views/inventario/productos.html`

**PROMPT PARA GENERARLO:**
```
Crea views/inventario/productos.html para un sistema de gestión de óptica.
HTML5 completo, mismo layout y sidebar que dashboard.html.

Contenido principal:
- Page header: "Productos" + botón "Nuevo Producto".
- Barra de filtros: input búsqueda (id="input-busqueda"), select categoría (id="select-categoria").
- Tabla con id="tabla-productos-body": thumbnail imagen, nombre, marca, categoría,
  precio compra, precio venta, stock actual (badge coloreado), acciones (editar/eliminar).
- Modal con id="modal-producto" para crear/editar:
  Campos: nombre*, marca, modelo, categoria_id* (select), codigo_barras, descripcion,
  precio_compra*, precio_venta*, stock_actual*, stock_minimo*, imagen_url.
  Botones: Cancelar, Guardar.
- Empty state cuando no hay productos.

Script inline que importa init() de js/modules/inventario/productos.js.
Ítem activo del sidebar: "Productos".
```

---

### `views/ventas/pos.html`

**PROMPT PARA GENERARLO:**
```
Crea views/ventas/pos.html (punto de venta) para un sistema de gestión de óptica.
HTML5 completo, mismo sidebar y layout general.

Este es el módulo más importante. Layout especial en 2 columnas dentro del contenido:
COLUMNA IZQUIERDA (60%): Búsqueda y catálogo de productos.
- Input de búsqueda grande (id="input-busqueda-producto") con placeholder "Buscar por nombre o código...".
- Contenedor de resultados de búsqueda (id="resultados-busqueda") tipo lista desplegable.
- Selector de paciente (id="select-paciente") con búsqueda live.

COLUMNA DERECHA (40%): Carrito y pago.
- Lista del carrito (id="carrito-items").
- Resumen: subtotal, IGV (18%), total (ids: total-subtotal, total-igv, total-final).
- Select método de pago: Efectivo, Tarjeta, Yape/Plin, Transferencia.
- Campo vuelto (aparece solo si pago es efectivo): input monto recibido, muestra vuelto.
- Botón "Procesar Venta" grande (id="btn-procesar-venta").
- Botón "Limpiar Carrito" pequeño.

Modal de venta exitosa (id="modal-venta-exitosa"): número de venta, total, botones imprimir/nuevo.

Script inline que importa init() de js/modules/ventas/pos.js.
```

---

### `views/admin/usuarios.html`

**PROMPT PARA GENERARLO:**
```
Crea views/admin/usuarios.html para el sistema de gestión de óptica.
HTML5 completo, mismo layout. Esta vista solo es accesible para administradores.

Contenido:
- Page header: "Gestión de Usuarios" + botón "Nuevo Usuario" (id="btn-nuevo-usuario").
- Tabla con id="tabla-usuarios-body": nombre, email, rol (badge: Admin=azul, Vendedor=verde),
  estado (Activo/Inactivo), fecha creación, acciones (editar rol, activar/desactivar).
- Modal id="modal-usuario": 
  Modo crear: nombre, email, contraseña temporal, rol (select: Admin/Vendedor).
  Modo editar: nombre, rol. (Sin contraseña ni email).
- Alerta informativa explicando que el usuario recibirá un email de Supabase para confirmar.
- No mostrar el usuario actual en la lista de opciones a desactivar.

Script inline que importa init() de js/modules/admin/usuarios.js.
Ítem activo del sidebar: "Usuarios". Solo visible en sidebar si el usuario es admin.
```

---

## 🗄️ TABLAS EN SUPABASE

Crea estas tablas en Supabase (SQL Editor):

```sql
-- Perfiles de usuario (extiende auth.users)
CREATE TABLE usuarios_perfil (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  email TEXT NOT NULL,
  nombre TEXT NOT NULL,
  rol TEXT NOT NULL DEFAULT 'vendedor' CHECK (rol IN ('admin', 'vendedor')),
  activo BOOLEAN DEFAULT true,
  foto_url TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Categorías de productos
CREATE TABLE categorias (
  id SERIAL PRIMARY KEY,
  nombre TEXT NOT NULL UNIQUE,
  descripcion TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Productos
CREATE TABLE productos (
  id SERIAL PRIMARY KEY,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  categoria_id INT REFERENCES categorias(id),
  precio_compra DECIMAL(10,2) NOT NULL DEFAULT 0,
  precio_venta DECIMAL(10,2) NOT NULL DEFAULT 0,
  stock_actual INT NOT NULL DEFAULT 0,
  stock_minimo INT NOT NULL DEFAULT 5,
  codigo_barras TEXT UNIQUE,
  marca TEXT, modelo TEXT, imagen_url TEXT,
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Pacientes
CREATE TABLE pacientes (
  id SERIAL PRIMARY KEY,
  nombres TEXT NOT NULL,
  apellidos TEXT NOT NULL,
  dni TEXT UNIQUE,
  telefono TEXT,
  email TEXT,
  fecha_nacimiento DATE,
  direccion TEXT,
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Recetas oftalmológicas
CREATE TABLE recetas (
  id SERIAL PRIMARY KEY,
  paciente_id INT REFERENCES pacientes(id) NOT NULL,
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  ojoD_esfera DECIMAL(4,2), ojoD_cilindro DECIMAL(4,2),
  ojoD_eje INT, ojoD_adicion DECIMAL(4,2),
  ojoI_esfera DECIMAL(4,2), ojoI_cilindro DECIMAL(4,2),
  ojoI_eje INT, ojoI_adicion DECIMAL(4,2),
  observaciones TEXT, optometrista TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Citas
CREATE TABLE citas (
  id SERIAL PRIMARY KEY,
  paciente_id INT REFERENCES pacientes(id) NOT NULL,
  fecha DATE NOT NULL,
  hora TIME NOT NULL,
  motivo TEXT,
  estado TEXT DEFAULT 'pendiente' CHECK (estado IN ('pendiente','completada','cancelada')),
  notas TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Ventas
CREATE TABLE ventas (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMP DEFAULT NOW(),
  subtotal DECIMAL(10,2) NOT NULL,
  igv DECIMAL(10,2) NOT NULL,
  total DECIMAL(10,2) NOT NULL,
  metodo_pago TEXT NOT NULL,
  usuario_id UUID REFERENCES auth.users(id),
  paciente_id INT REFERENCES pacientes(id),
  anulada BOOLEAN DEFAULT false,
  observaciones TEXT
);

-- Detalle de ventas
CREATE TABLE detalle_ventas (
  id SERIAL PRIMARY KEY,
  venta_id INT REFERENCES ventas(id) NOT NULL,
  producto_id INT REFERENCES productos(id) NOT NULL,
  cantidad INT NOT NULL,
  precio_unitario DECIMAL(10,2) NOT NULL,
  subtotal DECIMAL(10,2) NOT NULL
);

-- Movimientos de stock
CREATE TABLE movimientos_stock (
  id SERIAL PRIMARY KEY,
  producto_id INT REFERENCES productos(id) NOT NULL,
  tipo TEXT CHECK (tipo IN ('entrada','salida','ajuste')),
  cantidad INT NOT NULL,
  motivo TEXT,
  usuario_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Configuración del negocio
CREATE TABLE configuracion (
  id INT PRIMARY KEY DEFAULT 1,
  nombre_negocio TEXT DEFAULT 'Óptica Lima',
  ruc TEXT, direccion TEXT, telefono TEXT,
  email_negocio TEXT,
  igv_porcentaje DECIMAL(4,2) DEFAULT 18.00,
  logo_url TEXT,
  pie_comprobante TEXT
);
```

---

## 🔐 ROW LEVEL SECURITY (RLS) EN SUPABASE

```sql
-- Habilitar RLS en todas las tablas
ALTER TABLE usuarios_perfil ENABLE ROW LEVEL SECURITY;
ALTER TABLE productos ENABLE ROW LEVEL SECURITY;
ALTER TABLE ventas ENABLE ROW LEVEL SECURITY;
-- (repetir para todas las tablas)

-- Política: usuarios autenticados pueden leer/escribir todo
-- (ajustar según necesites más granularidad por rol)
CREATE POLICY "Autenticados pueden leer" ON productos
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Autenticados pueden escribir" ON productos
  FOR ALL USING (auth.role() = 'authenticated');
```

---

## 🚀 DEPLOY EN GITHUB PAGES

1. El repositorio debe ser público (o tener GitHub Pro para privado).
2. En Settings → Pages → Source: branch `main`, folder `/` (root).
3. La URL será: `https://tu-usuario.github.io/optica-lima/`
4. **Importante:** GitHub Pages sirve archivos estáticos. Supabase maneja toda la lógica de backend.
5. Actualizar `SUPABASE_URL` y `SUPABASE_ANON_KEY` en `js/config/supabase.js` antes de hacer push.

