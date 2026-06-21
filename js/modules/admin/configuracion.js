/* configuracion.js — Configuración del sistema con Supabase (solo admin) */
import { supabase }  from '../../config/supabase.js';
import { checkAuth } from '../../core/auth.js';
import { initUI }    from '../../core/ui.js';
import { showToast } from '../../utils/alerts.js';
import { ROLES }     from '../../config/supabase.js';

document.addEventListener('DOMContentLoaded', async () => {
  const _usuario = await checkAuth([ROLES.ADMIN]);
  await initUI(_usuario);

  const el = (id) => document.getElementById(id);

  // id real de la fila cargada; se establece en cargarConfig y se usa al guardar
  let _configRowId = null;

  // ── Cargar configuración ──────────────────────────────────────────────────────
  async function cargarConfig() {
    const { data, error } = await supabase
      .from('configuracion')
      .select('*')
      .order('id', { ascending: true })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') {
      showToast('Error al cargar configuración.', 'error'); return;
    }
    if (!data) return;

    // Guardar el id real para que guardarConfig use la fila correcta
    _configRowId = data.id;

    if (el('cfg-nombre'))             el('cfg-nombre').value              = data.nombre_empresa       || '';
    if (el('cfg-ruc'))                el('cfg-ruc').value                 = data.ruc                  || '';
    if (el('cfg-telefono'))           el('cfg-telefono').value            = data.telefono             || '';
    if (el('cfg-email'))              el('cfg-email').value               = data.email                || '';
    if (el('cfg-direccion'))          el('cfg-direccion').value           = data.direccion            || '';
    if (el('cfg-moneda'))             el('cfg-moneda').value              = data.moneda               || 'PEN';
    if (el('cfg-igv'))                el('cfg-igv').value                 = data.igv_porcentaje       ?? 18;
    if (el('cfg-stock-alerta'))       el('cfg-stock-alerta').value        = data.stock_alerta         ?? 5;
    if (el('cfg-stock-negativo'))     el('cfg-stock-negativo').checked    = data.permitir_stock_negativo === true;
    if (el('cfg-mensaje-recibo'))     el('cfg-mensaje-recibo').value      = data.mensaje_recibo       || '';
    if (el('cfg-asi-hora-entrada'))   el('cfg-asi-hora-entrada').value    = data.asistencia_hora_entrada  || '09:00';
    if (el('cfg-asi-hora-tardanza'))  el('cfg-asi-hora-tardanza').value   = data.asistencia_hora_tardanza || '09:30';
    if (el('cfg-asi-wsp-activo'))     el('cfg-asi-wsp-activo').checked    = data.asistencia_wsp_activo === true;
    if (el('cfg-asi-wsp-telefono'))   el('cfg-asi-wsp-telefono').value    = data.asistencia_wsp_telefono  || '';
    if (el('cfg-asi-wsp-apikey'))     el('cfg-asi-wsp-apikey').value      = data.asistencia_wsp_apikey    || '';
  }

  // ── Guardar configuración ─────────────────────────────────────────────────────
  el('btn-guardar-config')?.addEventListener('click', async () => {
    const nombre = el('cfg-nombre')?.value.trim();
    const errEl  = el('config-error');

    if (!nombre) {
      if (errEl) { errEl.textContent = 'El nombre de la empresa es obligatorio.'; errEl.hidden = false; } return;
    }
    if (errEl) errEl.hidden = true;

    // Usar el id real cargado desde la BD (no un valor hardcodeado)
    const payload = {
      id:                       _configRowId,
      nombre_empresa:           nombre,
      ruc:                      el('cfg-ruc')?.value.trim()             || null,
      telefono:                 el('cfg-telefono')?.value.trim()         || null,
      email:                    el('cfg-email')?.value.trim()            || null,
      direccion:                el('cfg-direccion')?.value.trim()        || null,
      moneda:                   el('cfg-moneda')?.value                  || 'PEN',
      igv_porcentaje:           parseFloat(el('cfg-igv')?.value)         || 18,
      stock_alerta:             parseInt(el('cfg-stock-alerta')?.value)   || 5,
      permitir_stock_negativo:  el('cfg-stock-negativo')?.checked === true,
      mensaje_recibo:           el('cfg-mensaje-recibo')?.value.trim()   || null,
      asistencia_hora_entrada:  el('cfg-asi-hora-entrada')?.value        || '09:00',
      asistencia_hora_tardanza: el('cfg-asi-hora-tardanza')?.value       || '09:30',
      asistencia_wsp_activo:    el('cfg-asi-wsp-activo')?.checked === true,
      asistencia_wsp_telefono:  el('cfg-asi-wsp-telefono')?.value.trim() || null,
      asistencia_wsp_apikey:    el('cfg-asi-wsp-apikey')?.value.trim()   || null,
    };

    console.log('[Configuración] id de fila:', _configRowId);
    console.log('[Configuración] nombre enviado:', nombre);
    console.log('[Configuración] payload completo:', payload);

    const btn = el('btn-guardar-config');
    if (btn) btn.disabled = true;

    let saveError = null;

    if (_configRowId !== null) {
      // La fila ya existe → UPDATE directo sobre la fila correcta
      const { error } = await supabase
        .from('configuracion')
        .update(payload)
        .eq('id', _configRowId);
      saveError = error;
    } else {
      // No se cargó ninguna fila (tabla vacía) → INSERT
      const { data: inserted, error } = await supabase
        .from('configuracion')
        .insert(payload)
        .select('id')
        .single();
      saveError = error;
      if (inserted?.id) _configRowId = inserted.id;
    }

    console.log('[Configuración] error:', saveError);

    if (btn) btn.disabled = false;

    if (saveError) {
      if (errEl) { errEl.textContent = 'Error al guardar: ' + saveError.message; errEl.hidden = false; }
      showToast('Error al guardar la configuración.', 'error');
      return;
    }

    showToast('Configuración guardada correctamente.', 'success');
  });

  // ── Respaldos y Exportaciones ─────────────────────────────────────────────────

  async function confirmarConPassword(descripcion) {
    return new Promise((resolve) => {
      const modal     = el('modal-seguridad');
      const subEl     = el('modal-seg-subtitulo');
      const errEl     = el('seg-error');
      const passInput = el('seg-password');
      const btnConf   = el('btn-seg-confirmar');
      const btnCanc   = el('btn-seg-cancelar');
      const btnClose  = el('btn-close-seguridad');

      if (subEl)     subEl.textContent = descripcion;
      if (errEl)     { errEl.hidden = true; errEl.textContent = ''; }
      if (passInput) passInput.value = '';
      modal?.classList.add('open');
      setTimeout(() => passInput?.focus(), 60);

      function cleanup(result) {
        modal?.classList.remove('open');
        btnConf?.removeEventListener('click',     onConfirmar);
        btnCanc?.removeEventListener('click',     onCancelar);
        btnClose?.removeEventListener('click',    onCancelar);
        passInput?.removeEventListener('keydown', onKeydown);
        resolve(result);
      }

      async function onConfirmar() {
        const password = passInput?.value;
        if (!password) {
          if (errEl) { errEl.textContent = 'Ingresa tu contraseña.'; errEl.hidden = false; }
          return;
        }
        if (btnConf) btnConf.disabled = true;
        const { data: { user } } = await supabase.auth.getUser();
        const { error } = await supabase.auth.signInWithPassword({ email: user.email, password });
        if (btnConf) btnConf.disabled = false;
        if (error) {
          if (errEl) { errEl.textContent = 'Contraseña incorrecta. Intenta nuevamente.'; errEl.hidden = false; }
          passInput?.select();
          return;
        }
        cleanup(true);
      }

      function onCancelar() { cleanup(false); }
      function onKeydown(e) { if (e.key === 'Enter') onConfirmar(); }

      btnConf?.addEventListener('click',     onConfirmar);
      btnCanc?.addEventListener('click',     onCancelar);
      btnClose?.addEventListener('click',    onCancelar);
      passInput?.addEventListener('keydown', onKeydown);
    });
  }

  function obtenerFiltroFechas() {
    const periodo = document.querySelector('input[name="exp-periodo"]:checked')?.value || 'hoy';
    const hoy = new Date();
    let desde, hasta;
    if (periodo === 'hoy') {
      desde = hoy.toISOString().split('T')[0];
      hasta = desde;
    } else if (periodo === 'mes') {
      desde = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().split('T')[0];
      hasta = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).toISOString().split('T')[0];
    } else {
      desde = el('exp-desde')?.value;
      hasta = el('exp-hasta')?.value;
      if (!desde || !hasta) { showToast('Selecciona el rango de fechas.', 'warning'); return null; }
    }
    return { desde, hasta };
  }

  function descargarXLSX(wb, nombre) {
    const XLSX = window.XLSX;
    if (!XLSX) { showToast('Librería XLSX no cargada. Verifica la conexión a internet.', 'error'); return; }
    XLSX.writeFile(wb, nombre);
  }

  async function exportarVentas() {
    const filtro = obtenerFiltroFechas();
    if (!filtro) return;
    const ok = await confirmarConPassword('Exportar Ventas a Excel');
    if (!ok) return;
    showToast('Generando reporte de ventas…', 'info');
    const { data, error } = await supabase.from('ventas')
      .select('id, total, descuento, metodo_pago, estado, created_at, pacientes(nombres, apellidos)')
      .gte('created_at', filtro.desde + 'T00:00:00')
      .lte('created_at', filtro.hasta + 'T23:59:59')
      .order('created_at', { ascending: false });
    if (error) { showToast('Error al obtener ventas.', 'error'); return; }
    const rows = (data || []).map(v => ({
      ID:            v.id,
      Fecha:         new Date(v.created_at).toLocaleDateString('es-PE'),
      Paciente:      v.pacientes ? `${v.pacientes.nombres} ${v.pacientes.apellidos}` : 'Sin paciente',
      Total_S:       v.total,
      Descuento_pct: ((v.descuento || 0) * 100).toFixed(0),
      Metodo_pago:   v.metodo_pago,
      Estado:        v.estado,
    }));
    const XLSX = window.XLSX;
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Ventas');
    descargarXLSX(wb, `ventas_${filtro.desde}_${filtro.hasta}.xlsx`);
    showToast('Ventas exportadas.', 'success');
  }

  async function exportarPacientes() {
    const ok = await confirmarConPassword('Exportar Pacientes a Excel');
    if (!ok) return;
    showToast('Generando reporte de pacientes…', 'info');
    const { data, error } = await supabase.from('pacientes')
      .select('id, nombres, apellidos, dni, telefono, email, fecha_nacimiento, direccion, activo, created_at')
      .order('apellidos');
    if (error) { showToast('Error al obtener pacientes.', 'error'); return; }
    const rows = (data || []).map(p => ({
      ID:               p.id,
      Nombres:          p.nombres,
      Apellidos:        p.apellidos,
      DNI:              p.dni              || '',
      Telefono:         p.telefono         || '',
      Email:            p.email            || '',
      Fecha_nacimiento: p.fecha_nacimiento || '',
      Direccion:        p.direccion        || '',
      Activo:           p.activo ? 'Sí' : 'No',
      Registrado:       new Date(p.created_at).toLocaleDateString('es-PE'),
    }));
    const XLSX = window.XLSX;
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Pacientes');
    descargarXLSX(wb, `pacientes_${new Date().toISOString().split('T')[0]}.xlsx`);
    showToast('Pacientes exportados.', 'success');
  }

  async function exportarHistorial() {
    const filtro = obtenerFiltroFechas();
    if (!filtro) return;
    const ok = await confirmarConPassword('Exportar Historial Clínico a Excel');
    if (!ok) return;
    showToast('Generando reporte de historial…', 'info');
    const { data, error } = await supabase.from('consultas')
      .select('id, fecha, motivo, diagnostico, graduaciones(*), pacientes(nombres, apellidos)')
      .gte('fecha', filtro.desde)
      .lte('fecha', filtro.hasta)
      .order('fecha', { ascending: false });
    if (error) { showToast('Error al obtener historial.', 'error'); return; }
    const rows = (data || []).map(c => {
      const g = c.graduaciones?.[0] || {};
      return {
        ID:           c.id,
        Fecha:        c.fecha,
        Paciente:     c.pacientes ? `${c.pacientes.nombres} ${c.pacientes.apellidos}` : '—',
        Motivo:       c.motivo      || '',
        Diagnostico:  c.diagnostico || '',
        OD_Esfera:    g.od_esfera   ?? '', OD_Cilindro: g.od_cilindro ?? '',
        OD_Eje:       g.od_eje      ?? '', OD_AV:       g.od_av       || '',
        OD_Adicion:   g.od_adicion  ?? '',
        OI_Esfera:    g.oi_esfera   ?? '', OI_Cilindro: g.oi_cilindro ?? '',
        OI_Eje:       g.oi_eje      ?? '', OI_AV:       g.oi_av       || '',
        OI_Adicion:   g.oi_adicion  ?? '', DP:          g.dp          ?? '',
        Observaciones: g.observaciones || '',
      };
    });
    const XLSX = window.XLSX;
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Historial Clinico');
    descargarXLSX(wb, `historial_${filtro.desde}_${filtro.hasta}.xlsx`);
    showToast('Historial exportado.', 'success');
  }

  async function exportarTodo() {
    const filtro = obtenerFiltroFechas();
    if (!filtro) return;
    const ok = await confirmarConPassword('Exportar todo el sistema a Excel');
    if (!ok) return;
    const XLSX = window.XLSX;
    if (!XLSX) { showToast('Librería XLSX no cargada.', 'error'); return; }
    showToast('Generando exportación completa…', 'info');
    const wb = XLSX.utils.book_new();

    const { data: ventas } = await supabase.from('ventas')
      .select('id, total, descuento, metodo_pago, estado, created_at, pacientes(nombres, apellidos)')
      .gte('created_at', filtro.desde + 'T00:00:00')
      .lte('created_at', filtro.hasta + 'T23:59:59')
      .order('created_at', { ascending: false });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet((ventas || []).map(v => ({
      ID: v.id, Fecha: new Date(v.created_at).toLocaleDateString('es-PE'),
      Paciente: v.pacientes ? `${v.pacientes.nombres} ${v.pacientes.apellidos}` : '—',
      Total: v.total, Descuento_pct: ((v.descuento || 0) * 100).toFixed(0),
      Metodo: v.metodo_pago, Estado: v.estado,
    }))), 'Ventas');

    const { data: pacientes } = await supabase.from('pacientes')
      .select('id, nombres, apellidos, dni, telefono, email, fecha_nacimiento, activo, created_at').order('apellidos');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet((pacientes || []).map(p => ({
      ID: p.id, Nombres: p.nombres, Apellidos: p.apellidos, DNI: p.dni || '',
      Telefono: p.telefono || '', Email: p.email || '', Fecha_nac: p.fecha_nacimiento || '',
      Activo: p.activo ? 'Sí' : 'No',
    }))), 'Pacientes');

    const { data: consultas } = await supabase.from('consultas')
      .select('id, fecha, motivo, diagnostico, graduaciones(*), pacientes(nombres, apellidos)')
      .gte('fecha', filtro.desde).lte('fecha', filtro.hasta).order('fecha', { ascending: false });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet((consultas || []).map(c => {
      const g = c.graduaciones?.[0] || {};
      return {
        ID: c.id, Fecha: c.fecha,
        Paciente: c.pacientes ? `${c.pacientes.nombres} ${c.pacientes.apellidos}` : '—',
        Motivo: c.motivo || '', Diagnostico: c.diagnostico || '',
        OD_Esfera: g.od_esfera ?? '', OD_Cilindro: g.od_cilindro ?? '', OD_Eje: g.od_eje ?? '',
        OD_AV: g.od_av || '', OD_Adicion: g.od_adicion ?? '',
        OI_Esfera: g.oi_esfera ?? '', OI_Cilindro: g.oi_cilindro ?? '', OI_Eje: g.oi_eje ?? '',
        OI_AV: g.oi_av || '', OI_Adicion: g.oi_adicion ?? '', DP: g.dp ?? '',
        Observaciones: g.observaciones || '',
      };
    })), 'Historial Clinico');

    descargarXLSX(wb, `exportacion_completa_${filtro.desde}_${filtro.hasta}.xlsx`);
    showToast('Exportación completa generada.', 'success');
  }

  async function backupManual() {
    const ok = await confirmarConPassword('Crear copia de seguridad completa del sistema');
    if (!ok) return;
    showToast('Generando backup del sistema…', 'info');
    const tablas = ['pacientes', 'consultas', 'recetas', 'ventas', 'detalle_ventas', 'productos', 'categorias', 'movimientos_stock', 'usuarios_perfil'];
    const backup = { version: 1, fecha: new Date().toISOString(), tablas: {} };
    for (const tabla of tablas) {
      const { data } = await supabase.from(tabla).select('*');
      backup.tablas[tabla] = data || [];
    }
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `backup_optica_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
    localStorage.setItem('optica_ultimo_backup', new Date().toISOString());
    actualizarTextoUltimoBackup();
    showToast('Backup generado y descargado.', 'success');
  }

  function toggleBackupAuto() {
    const activo = localStorage.getItem('optica_backup_auto') === '1';
    localStorage.setItem('optica_backup_auto', activo ? '0' : '1');
    actualizarBotonAutoBackup();
    showToast(activo
      ? 'Backup automático desactivado.'
      : 'Backup automático activado. Se ejecutará al abrir la app si han pasado +24 h.',
      'info');
  }

  async function verificarBackupAuto() {
    if (localStorage.getItem('optica_backup_auto') !== '1') return;
    const ultimo = localStorage.getItem('optica_ultimo_backup');
    if (!ultimo) { await backupManual(); return; }
    const horas = (new Date() - new Date(ultimo)) / 3_600_000;
    if (horas >= 24) await backupManual();
  }

  function actualizarBotonAutoBackup() {
    const btn    = el('btn-backup-auto-toggle');
    const activo = localStorage.getItem('optica_backup_auto') === '1';
    if (btn) { btn.textContent = `Backup Automático: ${activo ? 'ON' : 'OFF'}`; btn.className = activo ? 'btn-primary' : 'btn-secondary'; }
  }

  function actualizarTextoUltimoBackup() {
    const txtEl  = el('ultimo-backup-texto');
    const ultimo = localStorage.getItem('optica_ultimo_backup');
    if (txtEl) txtEl.textContent = ultimo
      ? `Último backup registrado: ${new Date(ultimo).toLocaleString('es-PE')}`
      : 'Sin backups registrados en este dispositivo.';
  }

  async function restaurarBackup() {
    const fileInput = el('input-restore-file');
    if (!fileInput) return;
    fileInput.value = '';
    fileInput.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const ok = await confirmarConPassword('Restaurar backup — los datos existentes serán actualizados');
      if (!ok) { fileInput.value = ''; return; }
      showToast('Procesando archivo de backup…', 'info');
      try {
        const text   = await file.text();
        const backup = JSON.parse(text);

        // Validar estructura del backup antes de restaurar
        if (!backup.version || typeof backup.tablas !== 'object' || backup.tablas === null) {
          showToast('Archivo de backup inválido o corrupto.', 'error'); return;
        }

        // Esquema esperado por tabla: solo se permiten estas tablas
        const ESQUEMA_PERMITIDO = {
          categorias:        ['id', 'nombre', 'descripcion', 'activo', 'created_at'],
          productos:         ['id', 'nombre', 'codigo', 'descripcion', 'precio_venta', 'precio_costo', 'stock_actual', 'stock_minimo', 'categoria_id', 'activo', 'created_at'],
          pacientes:         ['id', 'nombres', 'apellidos', 'dni', 'telefono', 'email', 'fecha_nacimiento', 'direccion', 'activo', 'created_at'],
          consultas:         ['id', 'paciente_id', 'fecha', 'motivo', 'diagnostico', 'created_by', 'created_at'],
          recetas:           ['id', 'consulta_id', 'paciente_id', 'od_esfera', 'od_cilindro', 'od_eje', 'oi_esfera', 'oi_cilindro', 'oi_eje', 'adicion', 'created_at'],
          ventas:            ['id', 'paciente_id', 'total', 'subtotal', 'descuento', 'metodo_pago', 'estado', 'created_by', 'created_at'],
          detalle_ventas:    ['id', 'venta_id', 'producto_id', 'cantidad', 'precio_unitario', 'subtotal', 'created_at'],
          movimientos_stock: ['id', 'producto_id', 'tipo', 'cantidad', 'referencia_id', 'notas', 'created_by', 'created_at'],
          usuarios_perfil:   ['id', 'nombre', 'email', 'rol', 'activo', 'created_at'],
        };

        const TABLAS_ORDEN = ['categorias', 'productos', 'pacientes', 'consultas', 'recetas', 'ventas', 'detalle_ventas', 'movimientos_stock', 'usuarios_perfil'];

        // Verificar que las tablas del backup son las esperadas
        const tablasEnBackup = Object.keys(backup.tablas);
        const tablasDesconocidas = tablasEnBackup.filter(t => !ESQUEMA_PERMITIDO[t]);
        if (tablasDesconocidas.length > 0) {
          showToast(`Backup con tablas no reconocidas: ${tablasDesconocidas.join(', ')}`, 'error'); return;
        }

        // Verificar columnas de cada tabla
        for (const tabla of tablasEnBackup) {
          const filas = backup.tablas[tabla];
          if (!Array.isArray(filas) || !filas.length) continue;
          const columnasPermitidas = new Set(ESQUEMA_PERMITIDO[tabla]);
          const columnasRecibidas  = Object.keys(filas[0]);
          const columnasExtra = columnasRecibidas.filter(c => !columnasPermitidas.has(c));
          if (columnasExtra.length > 0) {
            showToast(`Columnas no reconocidas en "${tabla}": ${columnasExtra.join(', ')}`, 'error'); return;
          }
        }

        let todoOk = true;
        for (const tabla of TABLAS_ORDEN) {
          const filas = backup.tablas[tabla];
          if (!filas?.length) continue;
          const { error } = await supabase.from(tabla).upsert(filas, { onConflict: 'id' });
          if (error) { showToast(`Error en tabla "${tabla}": ${error.message}`, 'error'); todoOk = false; }
        }
        if (todoOk) showToast('Backup restaurado correctamente.', 'success');
      } catch (err) {
        showToast('Error al leer el archivo: ' + err.message, 'error');
      }
      fileInput.value = '';
    };
    fileInput.click();
  }

  // Wiring exportaciones y backup
  el('btn-exp-ventas')?.addEventListener('click',         exportarVentas);
  el('btn-exp-pacientes')?.addEventListener('click',      exportarPacientes);
  el('btn-exp-historial')?.addEventListener('click',      exportarHistorial);
  el('btn-exp-todo')?.addEventListener('click',           exportarTodo);
  el('btn-backup-manual')?.addEventListener('click',      backupManual);
  el('btn-backup-auto-toggle')?.addEventListener('click', toggleBackupAuto);
  el('btn-restaurar')?.addEventListener('click',          restaurarBackup);

  document.querySelectorAll('input[name="exp-periodo"]').forEach(radio => {
    radio.addEventListener('change', () => {
      const rangoEl = el('exp-rango');
      if (rangoEl) rangoEl.style.display = radio.value === 'rango' ? 'flex' : 'none';
    });
  });

  actualizarBotonAutoBackup();
  actualizarTextoUltimoBackup();
  verificarBackupAuto();

  // ── Inicio ───────────────────────────────────────────────────────────────────
  await cargarConfig();
});

