import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';
import { computePasos } from './utils/excelDinamico';

const isMobile = () => window.innerWidth < 700;

export default function ResumenPrecios({ onVolver, onVolverMenu, onAbrirProducto }) {
  const [resumen, setResumen]   = useState([]);
  const [cargando, setCargando] = useState(true);
  const [buscar, setBuscar]     = useState('');
  const [mobile, setMobile]     = useState(isMobile());
  const [globalModCif, setGlobalModCif] = useState(0);
  const [sincronizando, setSincronizando] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');

  useEffect(() => {
    cargar();
    const onResize = () => setMobile(isMobile());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  async function cargar() {
    setCargando(true);

    const [
      { data: prods },
      { data: mps },
      { data: forms },
      { data: cfgs },
      { data: cfg_modcif },
      { data: mod_d },
      { data: mod_i },
      { data: cif_i },
      { data: vhcRows },
      { data: deshRows },
    ] = await Promise.all([
      supabase.from('productos').select('*').eq('eliminado', false).order('categoria').order('nombre'),
      supabase.from('materias_primas').select('*'),
      supabase.from('formulaciones').select('*'),
      supabase.from('config_productos').select('*'),
      supabase.from('costos_mod_cif').select('*').single(),
      supabase.from('mod_directa').select('*'),
      supabase.from('mod_indirecta').select('*'),
      supabase.from('cif_items').select('*'),
      supabase.from('vista_horneado_config').select('*'),
      supabase.from('deshuese_config').select('corte_padre,corte_hijo'),
    ]);

    /* MOD+CIF global real */
    const produccionKg = cfg_modcif?.produccion_kg || 13600;
    const totalMO  = [...(mod_d||[]), ...(mod_i||[])].reduce((s,r)=>s+(parseFloat(r.sueldo_mes)||0),0);
    const totalCIF = (cif_i||[]).reduce((s,r)=>s+(parseFloat(r.valor_mes)||0),0);
    const modCifGlobal = produccionKg>0?(totalMO+totalCIF)/produccionKg:0;
    setGlobalModCif(modCifGlobal);

    /* Mapa precios por ID */
    const mpMap = {};
    (mps||[]).forEach(m => { mpMap[m.id] = parseFloat(m.precio_kg)||0; });

    /* Normalización idéntica a Formulacion.js */
    const norm = s => (s||'').toLowerCase().trim()
      .replace(/[áà]/g,'a').replace(/[éè]/g,'e').replace(/[íì]/g,'i')
      .replace(/[óò]/g,'o').replace(/[úù]/g,'u').replace(/ñ/g,'n')
      .replace(/\s+/g,' ').replace(/[\/\-\.]/g,'').replace(/[()]/g,'').trim();

    /* Obtener precio de un ingrediente — idéntico a obtenerPrecioLive() */
    function getPrecio(fila) {
      if (fila.materia_prima_id && mpMap[fila.materia_prima_id])
        return mpMap[fila.materia_prima_id];
      const n = norm(fila.ingrediente_nombre);
      if (!n) return 0;
      const mpList = mps||[];
      let mp = mpList.find(m => norm(m.nombre_producto)===n); if (mp) return parseFloat(mp.precio_kg)||0;
          mp = mpList.find(m => norm(m.nombre)===n);          if (mp) return parseFloat(mp.precio_kg)||0;
          mp = mpList.find(m => norm(m.nombre_producto)&&n.includes(norm(m.nombre_producto))&&norm(m.nombre_producto).length>4); if (mp) return parseFloat(mp.precio_kg)||0;
          mp = mpList.find(m => norm(m.nombre)&&n.includes(norm(m.nombre))&&norm(m.nombre).length>4); if (mp) return parseFloat(mp.precio_kg)||0;
      return 0;
    }

    /* Mapa vista_horneado_config por nombre */
    const vhcMap = {};
    (vhcRows||[]).forEach(r => { if (r.producto_nombre) vhcMap[r.producto_nombre] = r; });

    /* Mapa hijo → padre desde deshuese_config */
    const padreDeHijoMap = {};
    (deshRows||[]).forEach(r => { if (r.corte_hijo && r.corte_padre) padreDeHijoMap[r.corte_hijo] = r.corte_padre; });

    /* Detecta categorías de flujo dinámico (usan vista_horneado_config) */
    function esCatEspecial(cat) {
      const c = (cat||'').toUpperCase()
        .replace(/Á/g,'A').replace(/É/g,'E').replace(/Í/g,'I').replace(/Ó/g,'O').replace(/Ú/g,'U');
      return c.includes('CORTES') || c.includes('INMERSION') || c.includes('MARINAD') || c.includes('AHUMADOS');
    }

    const resultado = (prods||[]).map(prod => {
      let precioPrincipal = 0, gananciaPorc = 15, fundas = [];

      if (esCatEspecial(prod.categoria)) {
        /* ── Producto de flujo dinámico (Cortes, Inmersión, Marinados, Ahumados) ── */
        const vhc   = vhcMap[prod.nombre];
        const cfg   = vhc?.config || {};
        const tipo  = cfg.tipo || 'independiente';
        const margenPct = tipo === 'hijo'
          ? parseFloat(cfg.margen_hijo  || 15)
          : parseFloat(cfg.margen_padre || 15);
        /* Versión prueba más reciente (para fundas y fallback de costo) */
        const pruebaVer = (vhc?.versiones || []).find(v => v.tipo === 'prueba');

        /* Costo/kg: config guardado → live desde padre → c_base de prueba */
        let cMadReal = parseFloat(cfg.c_mad_real || 0);
        if (tipo === 'hijo' && cMadReal === 0) {
          const padreNombre = padreDeHijoMap[prod.nombre];
          const padreVhc    = padreNombre ? vhcMap[padreNombre] : null;
          const padreCMad   = parseFloat(padreVhc?.config?.c_mad_real || 0);
          if (padreCMad > 0) {
            const bloques = (cfg.bloques_hijo || []).filter(b => b.activo !== false);
            const kgIni   = parseFloat(cfg.kg_para_hijo || 1);
            if (bloques.length > 0) {
              const pasos = computePasos(bloques, kgIni, padreCMad);
              if (pasos.length > 0) {
                const last = pasos[pasos.length - 1];
                const kgFin = parseFloat(last.kg || 0);
                cMadReal = kgFin > 0 ? parseFloat(last.costoAcum || 0) / kgFin : padreCMad;
              } else { cMadReal = padreCMad; }
            } else { cMadReal = padreCMad; }
          }
          if (cMadReal === 0) cMadReal = parseFloat(pruebaVer?.c_base || 0);
        }

        gananciaPorc    = margenPct;
        precioPrincipal = margenPct < 100 && cMadReal > 0
          ? cMadReal / (1 - margenPct / 100)
          : 0;

        if (pruebaVer) {
          const mPct = parseFloat(pruebaVer.margen_prueba || margenPct);
          fundas = (pruebaVer.fundas || []).map(f => ({
            nombre:   f.emp_nombre || 'Sin nombre',
            precio:   mPct < 100 ? f.c_total / (1 - mPct / 100) : 0,
            ganancia: mPct,
          }));
        }
      } else {
        /* ── Producto normal (Chorizos, Salchichas, etc.) ── */
        const cfg          = (cfgs||[]).find(c=>c.producto_nombre===prod.nombre)||{};
        const ingredientes = (forms||[]).filter(f=>f.producto_nombre===prod.nombre);

        const merma  = parseFloat(cfg.merma)  || 0.07;
        const margen = parseFloat(cfg.margen) || 0.15;

        let costoTotalKgParaFundas;

        if (parseFloat(cfg.precio_venta_kg) > 0) {
          precioPrincipal        = parseFloat(cfg.precio_venta_kg);
          costoTotalKgParaFundas = parseFloat(cfg.costo_total_kg) > 0
            ? parseFloat(cfg.costo_total_kg)
            : precioPrincipal * (1 - margen);
        } else {
          const totalCrudoG  = ingredientes.reduce((s,f)=>s+(parseFloat(f.gramos)||0),0);
          const totalCrudoKg = totalCrudoG/1000;
          const totalCostoMP = ingredientes.reduce((s,f)=>s+(parseFloat(f.gramos)/1000)*getPrecio(f),0);
          const costoMPkg     = totalCrudoKg>0?totalCostoMP/totalCrudoKg:0;
          const modCif        = parseFloat(cfg.mod_cif_kg)>0?parseFloat(cfg.mod_cif_kg):modCifGlobal;
          const costoConMerma = (1-merma)>0?costoMPkg/(1-merma):0;
          const empPrecio     = parseFloat(cfg.empaque_precio_kg)||0;
          const empCantidad   = parseFloat(cfg.empaque_cantidad)||0;
          const costoEmpKg    = totalCrudoKg>0?(empPrecio*empCantidad)/totalCrudoKg:0;
          const hiloPrecio    = parseFloat(cfg.hilo_precio_kg)||0;
          const hiloKg        = parseFloat(cfg.hilo_kg)||0;
          const costoHiloKg   = totalCrudoKg>0?(hiloPrecio*hiloKg)/totalCrudoKg:0;
          costoTotalKgParaFundas = costoConMerma+modCif+costoEmpKg+costoHiloKg;
          precioPrincipal        = margen < 1 ? costoTotalKgParaFundas / (1 - margen) : 0;
        }

        gananciaPorc = margen * 100;
        fundas = (cfg.fundas||[]).map(f=>({
          nombre:   f.nombre_funda||'Sin nombre',
          precio:   margen < 1
            ? (costoTotalKgParaFundas*(parseFloat(f.kg_por_funda)||1)+
               (parseFloat(f.precio_funda)||0)+
               (parseFloat(f.precio_etiqueta)||0)) / (1 - margen)
            : 0,
          ganancia: margen*100,
        }));
      }

      return { ...prod, precioPrincipal, gananciaPorc, fundas };
    });

    setResumen(resultado);
    setCargando(false);

    // Guardar precio exacto de productos normales en config_productos
    setSincronizando(true);
    setSyncMsg('Sincronizando precios...');
    const normales = resultado.filter(p => !esCatEspecial(p.categoria));
    for (const prod of normales) {
      const costoTotalKg = prod.precioPrincipal * (1 - prod.gananciaPorc/100);
      await supabase.from('config_productos').update({
        precio_venta_kg: prod.precioPrincipal,
        costo_total_kg: costoTotalKg
      }).eq('producto_nombre', prod.nombre);
    }
    setSincronizando(false);
    setSyncMsg('✅ ' + resultado.length + ' precios actualizados');
    setTimeout(() => setSyncMsg(''), 4000);
  }

  const filtrado = resumen.filter(p =>
    !buscar ||
    p.nombre?.toLowerCase().includes(buscar.toLowerCase()) ||
    p.categoria?.toLowerCase().includes(buscar.toLowerCase())
  );

  if (cargando) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#f0f2f5' }}>
      <div style={{ textAlign:'center', color:'#888' }}>
        <div style={{ fontSize:40, marginBottom:12 }}>⏳</div>
        <div style={{ fontSize:16, fontWeight:'bold' }}>Calculando precios en tiempo real...</div>
      </div>
    </div>
  );

  const BG_HEADER='#1a2744', BG_PAR='#d6e8ff', BG_IMPAR='#ffffff';
  const BG_NUM_PAR='#a8c8e8', BG_NUM_IMP='#d0d0d0';
  const BG_GREEN='#27ae60', BG_DGREEN='#1e8449';

  const NavBtn = ({ onClick, children, style }) => (
    <button onClick={onClick} style={{ border:'none', borderRadius:8, cursor:'pointer', fontWeight:'bold', fontSize:mobile?12:13, padding:mobile?'8px 10px':'8px 16px', whiteSpace:'nowrap', flexShrink:0, ...style }}>{children}</button>
  );

  return (
    <div style={{ minHeight:'100vh', background:'#f0f2f5', fontFamily:'Arial, sans-serif' }}>

      <div style={{ background:'linear-gradient(135deg,#1a1a2e,#16213e)', padding:mobile?'10px 12px':'14px 24px', position:'sticky', top:0, zIndex:100, boxShadow:'0 2px 10px rgba(0,0,0,0.3)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8, flexWrap:'nowrap' }}>
          <NavBtn onClick={onVolverMenu} style={{ background:'rgba(255,200,0,0.25)', color:'#ffd700', border:'1px solid rgba(255,200,0,0.5)' }}>🏠{mobile?'':' Menú'}</NavBtn>
          <NavBtn onClick={onVolver} style={{ background:'rgba(255,255,255,0.15)', color:'white', border:'1px solid rgba(255,255,255,0.3)' }}>←{mobile?'':' Volver'}</NavBtn>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ color:'white', fontWeight:'bold', fontSize:mobile?13:17, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>💰 Resumen de Precios</div>
            {!mobile&&<div style={{ color:'#aaa', fontSize:11 }}>Tiempo real · {filtrado.length} productos · MOD+CIF: ${globalModCif.toFixed(4)}/kg</div>}
          </div>
          <NavBtn onClick={cargar} disabled={sincronizando} style={{ background: sincronizando?'#555':'rgba(255,255,255,0.15)', color:'white', border:'1px solid rgba(255,255,255,0.3)' }}>
            {sincronizando ? (mobile?'⏳':'⏳ Sincronizando...') : (mobile?'🔄':'🔄 Actualizar')}
          </NavBtn>
        </div>
        <input placeholder="🔍 Buscar producto o categoría..." value={buscar} onChange={e=>setBuscar(e.target.value)}
          style={{ width:'100%', padding:'9px 12px', borderRadius:8, border:'none', fontSize:mobile?13:14, boxSizing:'border-box' }}/>
      </div>

      {syncMsg && <div style={{ background: syncMsg.startsWith('✅')?'#d4edda':'#cce5ff', color: syncMsg.startsWith('✅')?'#155724':'#004085', padding:'10px 20px', fontWeight:'bold', fontSize:'13px', textAlign:'center' }}>{syncMsg}</div>}
      <div style={{ padding:mobile?'8px':'20px 24px' }}>
        <div style={{ background:BG_HEADER, color:'white', padding:mobile?'10px 12px':'12px 20px', borderRadius:'10px 10px 0 0', fontWeight:'bold', fontSize:mobile?12:14, letterSpacing:'0.4px', textAlign:'center' }}>
          RESUMEN DE PRODUCTOS | EMBUTIDOS Y JAMONES CANDELARIA
        </div>

        <div style={{ background:'white', borderRadius:'0 0 10px 10px', boxShadow:'0 2px 12px rgba(0,0,0,0.10)', overflow:'hidden' }}>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', minWidth:mobile?320:560 }}>
              <thead>
                <tr>
                  <th style={{ background:BG_HEADER, color:'white', padding:mobile?'8px 6px':'10px 10px', textAlign:'center', fontSize:mobile?11:12, fontWeight:'bold', borderRight:'2px solid #2d3f6e', width:mobile?32:44 }}>N°</th>
                  <th style={{ background:BG_HEADER, color:'white', padding:mobile?'8px 8px':'10px 14px', fontSize:mobile?11:12, fontWeight:'bold', borderRight:'1px solid #2d3f6e', minWidth:mobile?110:200 }}>PRODUCTO {!mobile&&<span style={{fontSize:10,opacity:0.8}}>(clic para abrir)</span>}</th>
                  <th style={{ background:BG_HEADER, color:'white', padding:mobile?'8px 8px':'10px 14px', fontSize:mobile?11:12, fontWeight:'bold', borderRight:'1px solid #2d3f6e', minWidth:mobile?90:170 }}>TIPO / FUNDA</th>
                  <th style={{ background:BG_HEADER, color:'white', padding:mobile?'8px 8px':'10px 14px', fontSize:mobile?11:12, fontWeight:'bold', textAlign:'right', borderRight:'1px solid #2d3f6e', minWidth:mobile?90:140 }}>PRECIO SUGERIDO (USD/kg)</th>
                  <th style={{ background:BG_HEADER, color:'white', padding:mobile?'8px 8px':'10px 14px', fontSize:mobile?11:12, fontWeight:'bold', textAlign:'right', minWidth:mobile?60:90 }}>% GANANCIA</th>
                </tr>
              </thead>
              <tbody>
                {filtrado.map((prod,gi) => {
                  const esPar=gi%2===0, bgFila=esPar?BG_PAR:BG_IMPAR, bgNum=esPar?BG_NUM_PAR:BG_NUM_IMP, borderC=esPar?'#b8cfea':'#d8d8d8';
                  return (
                    <React.Fragment key={prod.id}>
                      <tr style={{ borderBottom:`1px solid ${borderC}` }}>
                        <td style={{ background:bgNum, padding:mobile?'9px 4px':'10px 8px', textAlign:'center', fontWeight:'bold', color:'#1a2744', fontSize:mobile?12:13, borderRight:'2px solid #9ab8d8' }}>{gi+1}</td>
                        <td style={{ background:bgFila, padding:mobile?'9px 8px':'10px 14px', borderRight:`1px solid ${borderC}` }}>
                          <span onClick={()=>onAbrirProducto(prod)} style={{ color:'#0563c1', fontWeight:'bold', fontSize:mobile?12:13, cursor:'pointer', textDecoration:'underline', display:'block' }}>{prod.nombre}</span>
                          <span style={{ fontSize:10, color:'#888' }}>{prod.categoria}</span>
                        </td>
                        <td style={{ background:bgFila, padding:mobile?'9px 8px':'10px 14px', color:'#444', fontSize:mobile?11:12, borderRight:`1px solid ${borderC}` }}>Precio principal (sin funda)</td>
                        <td style={{ padding:0, borderRight:`1px solid ${borderC}` }}>
                          <div style={{ background:BG_GREEN, color:'white', fontWeight:'bold', fontSize:mobile?13:14, textAlign:'right', padding:mobile?'9px 8px':'10px 14px' }}>${prod.precioPrincipal.toFixed(4)}</div>
                        </td>
                        <td style={{ background:bgFila, padding:mobile?'9px 6px':'10px 14px', textAlign:'right', color:'#333', fontSize:mobile?11:13, fontWeight:'500' }}>{prod.gananciaPorc.toFixed(2)}%</td>
                      </tr>
                      {(prod.fundas||[]).map((funda,fi) => (
                        <tr key={`f${fi}`} style={{ borderBottom:`1px solid ${borderC}` }}>
                          <td style={{ background:bgNum, borderRight:'2px solid #9ab8d8' }}></td>
                          <td style={{ background:bgFila, borderRight:`1px solid ${borderC}` }}></td>
                          <td style={{ background:bgFila, padding:mobile?'7px 8px':'8px 14px', color:'#555', fontStyle:'italic', fontSize:mobile?11:12, borderRight:`1px solid ${borderC}` }}>📦 {funda.nombre}</td>
                          <td style={{ padding:0, borderRight:`1px solid ${borderC}` }}>
                            <div style={{ background:BG_DGREEN, color:'white', fontWeight:'bold', fontSize:mobile?12:13, textAlign:'right', padding:mobile?'7px 8px':'8px 14px' }}>${funda.precio.toFixed(4)}</div>
                          </td>
                          <td style={{ background:bgFila, padding:mobile?'7px 6px':'8px 14px', textAlign:'right', color:'#555', fontSize:mobile?11:12 }}>{funda.ganancia.toFixed(2)}%</td>
                        </tr>
                      ))}
                      <tr><td colSpan={5} style={{ height:4, background:'#7fa8d0', padding:0 }}></td></tr>
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
            {filtrado.length===0&&<div style={{ textAlign:'center', padding:50, color:'#aaa' }}><div style={{ fontSize:36, marginBottom:10 }}>💰</div><div>No se encontraron productos</div></div>}
          </div>
        </div>
        <div style={{ marginTop:10, fontSize:11, color:'#888', textAlign:'center', padding:'0 8px' }}>
          💡 Toca el nombre del producto para abrir su fórmula · Precios exactos guardados desde cada fórmula
        </div>
      </div>
    </div>
  );
}
