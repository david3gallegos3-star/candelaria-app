// ============================================
// PANTALLA HISTORIAL — orquestador
// Une: HistorialFiltros + HistorialTabla
// Usado por: App.js
// ============================================

import React, { useState, useRef } from 'react';
import { supabase }        from '../../supabase';
import GeminiChat          from '../../GeminiChat';
import HistorialFiltros    from './HistorialFiltros';
import HistorialTabla      from './HistorialTabla';

function PantallaHistorial({ onVolver, onVolverMenu, mostrarExito }) {

  // ── Estado ───────────────────────────────────────────
  const [historial,         setHistorial]         = useState([]);
  const [histFechaDes,      setHistFechaDes]      = useState('');
  const [histFechaHas,      setHistFechaHas]      = useState('');
  const [histProducto,      setHistProducto]      = useState('');
  const [histSeccion,       setHistSeccion]       = useState('TODAS');
  const [histCargando,      setHistCargando]      = useState(false);
  const [histSeleccionados, setHistSeleccionados] = useState(new Set());
  const [histEditandoId,    setHistEditandoId]    = useState(null);
  const [histEditData,      setHistEditData]      = useState({});
  const fileRefHistorial = useRef();

  // ── Cargar con filtros ────────────────────────────────
  async function cargarHistorial() {
    setHistCargando(true);
    let q = supabase.from('historial_general').select('*')
      .order('created_at', { ascending: false });
    if (histFechaDes) q = q.gte('fecha', histFechaDes);
    if (histFechaHas) q = q.lte('fecha', histFechaHas);
    if (histProducto) q = q.ilike('producto_nombre', `%${histProducto}%`);
    if (histSeccion !== 'TODAS') q = q.eq('seccion', histSeccion);
    const { data } = await q.limit(1000);
    setHistorial(data || []);
    setHistSeleccionados(new Set());
    setHistCargando(false);
  }

  function limpiarFiltros() {
    setHistFechaDes(''); setHistFechaHas('');
    setHistProducto(''); setHistSeccion('TODAS');
    setHistorial([]);
  }

  // ── Selección ─────────────────────────────────────────
  function toggleHistSel(id) {
    setHistSeleccionados(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  function toggleHistTodos() {
    if (histSeleccionados.size === historial.length)
      setHistSeleccionados(new Set());
    else
      setHistSeleccionados(new Set(historial.map(h => h.id)));
  }

  // ── Eliminar seleccionados ────────────────────────────
  async function eliminarHistSeleccionados() {
    if (histSeleccionados.size === 0) return;
    if (!window.confirm(`¿Eliminar ${histSeleccionados.size} registros?`)) return;
    await supabase.from('historial_general')
      .delete().in('id', [...histSeleccionados]);
    mostrarExito(`🗑️ ${histSeleccionados.size} registros eliminados`);
    await cargarHistorial();
  }

  // ── Guardar edición inline ────────────────────────────
  async function guardarHistEdicion() {
    await supabase.from('historial_general').update({
      fecha:              histEditData.fecha,
      producto_nombre:    histEditData.producto_nombre,
      ingrediente_nombre: histEditData.ingrediente_nombre,
      gramos:             parseFloat(histEditData.gramos) || 0,
      kilos:              (parseFloat(histEditData.gramos) || 0) / 1000,
      nota_cambio:        histEditData.nota_cambio,
      seccion:            histEditData.seccion
    }).eq('id', histEditandoId);
    setHistEditandoId(null);
    mostrarExito('✅ Registro actualizado');
    await cargarHistorial();
  }

  // ── Excel ─────────────────────────────────────────────
  async function descargarHistExcel() {
    const XLSX  = await import('xlsx');
    const datos = historial.map(h => ({
      'Fecha':          h.fecha,
      'Producto':       h.producto_nombre,
      'Ingrediente':    h.ingrediente_nombre,
      'Gramos':         parseFloat(h.gramos || 0),
      'Kilos':          parseFloat(h.kilos  || 0).toFixed(3),
      'Nota de Cambio': h.nota_cambio,
      'Sección':        h.seccion
    }));
    const ws = XLSX.utils.json_to_sheet(datos);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Historial');
    XLSX.writeFile(wb, `historial_general_${new Date().toISOString().split('T')[0]}.xlsx`);
  }

    async function importarHistorialExcel(e) {
      const file = e.target.files[0]; if (!file) return;
      mostrarExito('⏳ Cargando archivo...');
      try {
        const XLSX = await import('xlsx');
        const data = await file.arrayBuffer();
        const wb   = XLSX.read(data);
        const nombreHoja = wb.SheetNames.find(s =>
          s === 'Historial_General' ||
          s.toUpperCase().includes('HISTORIAL')
        ) || wb.SheetNames[0];
        const ws   = wb.Sheets[nombreHoja];
        const rows = XLSX.utils.sheet_to_json(ws, { header:1, defval:null });
        let headerRow = 0;
        for (let i = 0; i < Math.min(rows.length, 15); i++) {
          const r = rows[i];
          if (r && r.some(c =>
            String(c||'').toUpperCase().includes('PRODUCTO') ||
            String(c||'').toUpperCase().includes('INGREDIENTE')
          )) { headerRow = i; break; }
        }
        const headers  = (rows[headerRow]||[]).map(h => String(h||'').toUpperCase().trim());
        const ci       = name => headers.findIndex(h => h.includes(name));
        const idxFecha   = ci('FECHA');
        const idxProd    = ci('PRODUCT');
        const idxIng     = ci('INGRED') >= 0 ? ci('INGRED') : ci('MATERIA');
        const idxGramos  = ci('GRAM');
        const idxNota    = ci('NOTA');
        const idxSeccion = ci('SECCI');

        function excelFecha(val) {
          if (!val) return new Date().toISOString().split('T')[0];
          if (typeof val === 'number') {
            const d = new Date((val - 25569) * 86400 * 1000);
            return d.toISOString().split('T')[0];
          }
          return String(val).trim();
        }

        const registros = [];
        for (let i = headerRow + 1; i < rows.length; i++) {
          const r    = rows[i]; if (!r) continue;
          const prod = idxProd >= 0 ? String(r[idxProd]||'').trim() : '';
          const ing  = idxIng  >= 0 ? String(r[idxIng] ||'').trim() : '';
          if (!prod && !ing) continue;
          const gramos  = idxGramos >= 0 ? parseFloat(r[idxGramos]) || 0 : 0;
          const seccion = idxSeccion >= 0
            ? String(r[idxSeccion]||'MATERIAS PRIMAS').trim()
            : 'MATERIAS PRIMAS';
          registros.push({
            fecha:              excelFecha(idxFecha >= 0 ? r[idxFecha] : null),
            producto_nombre:    prod,
            ingrediente_nombre: ing,
            gramos,
            kilos:       gramos / 1000,
            nota_cambio: idxNota >= 0 ? String(r[idxNota]||'').trim() : '',
            seccion:     seccion.toUpperCase().includes('CONDIMENTO') ||
                        seccion.toUpperCase().includes('ADITIVO')
                        ? 'CONDIMENTOS Y ADITIVOS' : 'MATERIAS PRIMAS'
          });
        }

        if (registros.length > 0) {
          mostrarExito(`⏳ Subiendo ${registros.length} registros...`);
          // Verificar cuántos son nuevos
          const { data: existentes } = await supabase
            .from('historial_general')
            .select('producto_nombre, ingrediente_nombre, fecha')
            .limit(5000);
          const existentesSet = new Set(
            (existentes||[]).map(e => `${e.fecha}|${e.producto_nombre}|${e.ingrediente_nombre}`)
          );
          const nuevos = registros.filter(r =>
            !existentesSet.has(`${r.fecha}|${r.producto_nombre}|${r.ingrediente_nombre}`)
          );
          const duplicados = registros.length - nuevos.length;

          if (nuevos.length > 0) {
            for (let i = 0; i < nuevos.length; i += 50)
              await supabase.from('historial_general')
                .insert(nuevos.slice(i, i + 50));
          }

          await cargarHistorial();
          mostrarExito(
            `✅ Completado — ${nuevos.length} nuevos agregados · ${duplicados} ya existían · ${registros.length} total en archivo`
          );
        } else {
          mostrarExito('⚠️ No se encontraron registros válidos en el archivo');
        }
      } catch(err) {
        mostrarExito('❌ Error: ' + err.message);
      }
      e.target.value = '';
    }

  // ── Informe HTML ──────────────────────────────────────
  function generarInforme() {
    if (historial.length === 0)
      return alert('No hay registros. Usa los filtros y busca primero.');
    const porProducto = {};
    historial.forEach(h => {
      if (!porProducto[h.producto_nombre]) porProducto[h.producto_nombre] = 0;
      porProducto[h.producto_nombre] += parseFloat(h.gramos) || 0;
    });
    const prodLabels = Object.keys(porProducto);
    const prodData   = Object.values(porProducto);
    const colores    = prodLabels.map((_,i) => `hsl(${(i*47)%360},65%,50%)`);
    const ventana    = window.open('','_blank');
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>Informe Historial Candelaria</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.0/chart.umd.min.js"><\/script>
<style>
body{font-family:Arial,sans-serif;margin:0;padding:20px}
h1{color:#1a1a2e;font-size:20px}
table{width:100%;border-collapse:collapse;font-size:12px;margin-top:20px}
th{background:#1a1a2e;color:white;padding:8px 10px;text-align:left}
td{padding:6px 10px;border-bottom:1px solid #eee}
tr:nth-child(even){background:#f9f9f9}
.mp{background:#dbeafe;color:#1e40af;padding:2px 7px;border-radius:8px;font-size:10px;font-weight:bold}
.ad{background:#f3e8ff;color:#7c3aed;padding:2px 7px;border-radius:8px;font-size:10px;font-weight:bold}
@media print{button{display:none!important}}
</style></head><body>
<div style="display:flex;justify-content:space-between;margin-bottom:8px">
<div>
  <h1>🏭 Embutidos y Jamones Candelaria</h1>
  <div style="font-size:12px;color:#666">
    Informe · ${new Date().toLocaleString()} · ${historial.length} registros
  </div>
</div>
<button onclick="window.print()"
  style="padding:10px 20px;background:#1a1a2e;color:white;border:none;border-radius:8px;cursor:pointer">
  🖨️ Imprimir
</button>
</div>
<div style="max-width:700px;margin:20px auto"><canvas id="chart"></canvas></div>
<table>
<thead><tr>
  <th>FECHA</th><th>PRODUCTO</th><th>INGREDIENTE</th>
  <th>GRAMOS</th><th>KILOS</th><th>NOTA</th><th>SECCIÓN</th>
</tr></thead>
<tbody>
${historial.map(h => `<tr>
  <td>${h.fecha||''}</td>
  <td><strong>${h.producto_nombre||''}</strong></td>
  <td>${h.ingrediente_nombre||''}</td>
  <td style="text-align:right">${parseFloat(h.gramos||0).toLocaleString()}</td>
  <td style="text-align:right">${parseFloat(h.kilos||0).toFixed(3)}</td>
  <td style="color:#888">${h.nota_cambio||''}</td>
  <td><span class="${h.seccion==='MATERIAS PRIMAS'?'mp':'ad'}">${h.seccion||''}</span></td>
</tr>`).join('')}
</tbody></table>
<script>
new Chart(document.getElementById('chart'),{
  type:'bar',
  data:{
    labels:${JSON.stringify(prodLabels)},
    datasets:[{
      label:'Total gramos',
      data:${JSON.stringify(prodData)},
      backgroundColor:${JSON.stringify(colores)},
      borderRadius:6
    }]
  },
  options:{
    responsive:true,
    plugins:{
      legend:{display:false},
      title:{display:true,text:'Gramos totales por producto',font:{size:14}}
    },
    scales:{y:{beginAtZero:true}}
  }
});
<\/script></body></html>`;
    ventana.document.write(html);
    ventana.document.close();
  }

  // ── RENDER ────────────────────────────────────────────
  return (
    <div style={{ minHeight:'100vh', background:'#f0f2f5', fontFamily:'Arial' }}>

      {/* Header */}
      <div style={{
        background:'linear-gradient(135deg,#1a1a2e,#16213e)',
        padding:'14px 24px',
        display:'flex', justifyContent:'space-between', alignItems:'center'
      }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <button onClick={onVolverMenu} style={{
            background:'rgba(255,200,0,0.25)',
            border:'1px solid rgba(255,200,0,0.4)',
            color:'#ffd700', padding:'8px 12px',
            borderRadius:'8px', cursor:'pointer',
            fontSize:'12px', fontWeight:'bold'
          }}>🏠 Menú</button>
          <button onClick={onVolver} style={{
            background:'rgba(255,255,255,0.2)', border:'none',
            color:'white', padding:'8px 14px',
            borderRadius:'8px', cursor:'pointer', fontSize:'13px'
          }}>← Volver</button>
          <div>
            <div style={{ color:'white', fontWeight:'bold', fontSize:'18px' }}>
              📋 Historial General
            </div>
            <div style={{ color:'#aaa', fontSize:'12px' }}>
              {historial.length} registros
            </div>
          </div>
        </div>

        {/* Botones header */}
        <div style={{ display:'flex', gap:10 }}>
          <button onClick={() => fileRefHistorial.current.click()} style={{
            padding:'8px 16px', background:'#8e44ad', color:'white',
            border:'none', borderRadius:'8px', cursor:'pointer',
            fontWeight:'bold', fontSize:'13px'
          }}>📤 Subir Excel</button>
          <input ref={fileRefHistorial} type="file"
            accept=".xlsx,.xlsm,.xls"
            style={{ display:'none' }}
            onChange={importarHistorialExcel}
          />
          <button onClick={generarInforme} style={{
            padding:'8px 16px', background:'#9b59b6', color:'white',
            border:'none', borderRadius:'8px', cursor:'pointer',
            fontWeight:'bold', fontSize:'13px'
          }}>📄 Informe</button>
          <button onClick={descargarHistExcel} style={{
            padding:'8px 16px', background:'#27ae60', color:'white',
            border:'none', borderRadius:'8px', cursor:'pointer',
            fontWeight:'bold', fontSize:'13px'
          }}>📥 Descargar Excel</button>
        </div>
      </div>

      {/* Contenido */}
      <div style={{ padding:'20px 24px' }}>

        {/* Filtros */}
        <HistorialFiltros
          histFechaDes={histFechaDes} setHistFechaDes={setHistFechaDes}
          histFechaHas={histFechaHas} setHistFechaHas={setHistFechaHas}
          histProducto={histProducto} setHistProducto={setHistProducto}
          histSeccion={histSeccion}   setHistSeccion={setHistSeccion}
          histCargando={histCargando}
          cargarHistorial={cargarHistorial}
          limpiarFiltros={limpiarFiltros}
        />

        {/* Tabla */}
        <HistorialTabla
          historial={historial}
          histSeleccionados={histSeleccionados}
          histEditandoId={histEditandoId}
          histEditData={histEditData}
          setHistEditandoId={setHistEditandoId}
          setHistEditData={setHistEditData}
          toggleHistSel={toggleHistSel}
          toggleHistTodos={toggleHistTodos}
          eliminarHistSeleccionados={eliminarHistSeleccionados}
          guardarHistEdicion={guardarHistEdicion}
          mostrarExito={mostrarExito}
          cargarHistorial={cargarHistorial}
        />
      </div>

      <GeminiChat />
    </div>
  );
}

export default PantallaHistorial;