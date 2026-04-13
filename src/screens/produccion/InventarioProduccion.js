// ============================================
// InventarioProduccion.js
// Stock de productos terminados en fundas
// ============================================
import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabase';

export default function InventarioProduccion({ onVolver, onVolverMenu, userRol }) {

  const [stock,        setStock]        = useState([]);
  const [movimientos,  setMovimientos]  = useState([]);
  const [cargando,     setCargando]     = useState(true);
  const [tab,          setTab]          = useState('stock');
  const [filtroProd,   setFiltroProd]   = useState('');
  const [resumen,      setResumen]      = useState({
    totalFundas: 0, costoTotal: 0, valorVenta: 0
  });

  useEffect(() => { cargarTodo(); }, []);

  async function cargarTodo() {
    setCargando(true);
    const { data: inv } = await supabase
      .from('inventario_produccion')
      .select('*')
      .order('created_at', { ascending: false });

    const { data: configs } = await supabase
    .from('config_productos')
    .select('producto_nombre, precio_venta_kg, costo_total_kg, margen, fundas');

    const movs = inv || [];
    setMovimientos(movs);

    // Calcular stock actual por producto+funda
    const stockMap = {};
    movs.forEach(m => {
      const key = `${m.producto_nombre}||${m.nombre_funda}||${m.kg_por_funda}`;
      if (!stockMap[key]) {
        stockMap[key] = {
          producto_nombre: m.producto_nombre,
          nombre_funda:    m.nombre_funda,
          kg_por_funda:    m.kg_por_funda,
          cantidad:        0,
          kg_total:        0,
          costo_unitario:  0,
          precio_venta_unitario: 0,
        };
      }
      const delta = m.tipo === 'entrada' ? 1 : -1;
      stockMap[key].cantidad += delta * (parseInt(m.cantidad) || 0);
      stockMap[key].kg_total  = stockMap[key].cantidad * stockMap[key].kg_por_funda;
    });

    // Enriquecer con precios de config_productos
    const configMap = {};
    (configs || []).forEach(c => { configMap[c.producto_nombre] = c; });

    const stockArr = Object.values(stockMap).map(item => {
      const cfg = configMap[item.producto_nombre];
      const precioVentaKg  = parseFloat(cfg?.precio_venta_kg || 0);
        const fundaConfig = (cfg?.fundas || []).find(f =>
        f.nombre_funda === item.nombre_funda &&
        parseFloat(f.kg_por_funda) === parseFloat(item.kg_por_funda)
        );
        const costoFunda = parseFloat(fundaConfig?.precio_funda || 0);
        const margen = parseFloat(cfg?.margen || 0);
        const costoTotalKg = parseFloat(cfg?.costo_total_kg || 0);
        const precioVentaUnit = margen < 1
        ? (costoTotalKg * item.kg_por_funda + costoFunda) / (1 - margen)
        : precioVentaKg * item.kg_por_funda;
      return {
        ...item,
        precio_venta_unitario: precioVentaUnit,
        valor_venta_total:     precioVentaUnit * item.cantidad,
      };
    }).filter(i => i.cantidad > 0);

    setStock(stockArr);

    // Resumen
    const totalFundas = stockArr.reduce((s, i) => s + i.cantidad, 0);
    const valorVenta  = stockArr.reduce((s, i) => s + i.valor_venta_total, 0);
    setResumen({ totalFundas, costoTotal: 0, valorVenta });
    setCargando(false);
  }

  const stockFiltrado = stock.filter(i =>
    !filtroProd ||
    i.producto_nombre.toLowerCase().includes(filtroProd.toLowerCase())
  );

  // Agrupar por producto
  const porProducto = {};
  stockFiltrado.forEach(item => {
    if (!porProducto[item.producto_nombre])
      porProducto[item.producto_nombre] = [];
    porProducto[item.producto_nombre].push(item);
  });
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
            background:'rgba(255,200,0,0.25)', border:'1px solid rgba(255,200,0,0.4)',
            color:'#ffd700', padding:'8px 12px', borderRadius:'8px',
            cursor:'pointer', fontSize:'12px', fontWeight:'bold'
          }}>🏠 Menú</button>
          <button onClick={onVolver} style={{
            background:'rgba(255,255,255,0.15)', border:'none',
            color:'white', padding:'8px 14px', borderRadius:'8px',
            cursor:'pointer', fontSize:'13px'
          }}>← Volver</button>
          <div>
            <div style={{ color:'white', fontWeight:'bold', fontSize:'18px' }}>
              🏪 Inventario de Producción
            </div>
            <div style={{ color:'#aaa', fontSize:'12px' }}>
              Stock de productos terminados en fundas
            </div>
          </div>
        </div>
        <button onClick={cargarTodo} style={{
          background:'rgba(255,255,255,0.15)', border:'1px solid rgba(255,255,255,0.3)',
          color:'white', padding:'8px 14px', borderRadius:'8px',
          cursor:'pointer', fontSize:'13px'
        }}>🔄 Actualizar</button>
      </div>

      <div style={{ padding:'16px 24px' }}>

        {/* Resumen */}
        <div style={{
          display:'grid', gridTemplateColumns:'repeat(3,1fr)',
          gap:'10px', marginBottom:'14px'
        }}>
          {[
            ['Total fundas en stock', resumen.totalFundas + ' und',    '#155724', '#d4edda'],
            ['Valor venta estimado',  '$' + resumen.valorVenta.toFixed(2), '#1a5276', '#e8f4fd'],
            ['Productos distintos',   Object.keys(porProducto).length + ' productos', '#856404', '#fff3cd'],
          ].map(([l,v,c,bg]) => (
            <div key={l} style={{ background:bg, borderRadius:'10px', padding:'12px 16px' }}>
              <div style={{ fontSize:'10px', color:c, fontWeight:'700', marginBottom:'4px' }}>{l}</div>
              <div style={{ fontSize:'22px', fontWeight:'700', color:c }}>{v}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{
          display:'flex', background:'white', borderRadius:'10px',
          padding:'4px', marginBottom:'14px', gap:4,
          boxShadow:'0 1px 4px rgba(0,0,0,0.06)'
        }}>
          {[['stock','📦 Stock actual'],['movimientos','📋 Movimientos']].map(([key,label]) => (
            <button key={key} onClick={() => setTab(key)} style={{
              flex:1, padding:'9px 12px', border:'none', borderRadius:'7px',
              cursor:'pointer', fontSize:'13px', fontWeight:'bold',
              background: tab === key ? '#1a1a2e' : 'transparent',
              color:      tab === key ? 'white'   : '#666'
            }}>{label}</button>
          ))}
        </div>

        {/* Tab Stock */}
        {tab === 'stock' && (
          <>
            {/* Filtro */}
            <div style={{
              background:'white', borderRadius:'10px', padding:'12px 16px',
              marginBottom:'12px', border:'0.5px solid #e0e0e0'
            }}>
              <input
                placeholder="Buscar producto..."
                value={filtroProd}
                onChange={e => setFiltroProd(e.target.value)}
                style={{
                  width:'100%', padding:'8px 12px',
                  border:'0.5px solid #ddd', borderRadius:'8px', fontSize:'13px'
                }}
              />
            </div>

            {cargando ? (
              <div style={{ textAlign:'center', padding:'40px', color:'#aaa' }}>
                Cargando...
              </div>
            ) : stock.length === 0 ? (
              <div style={{
                textAlign:'center', padding:'60px', color:'#aaa',
                background:'white', borderRadius:'12px'
              }}>
                <div style={{ fontSize:'48px', marginBottom:'12px' }}>📦</div>
                <div>No hay stock de fundas registrado</div>
                <div style={{ fontSize:'12px', marginTop:'6px' }}>
                  Registra cierres de producción para ver el stock aquí
                </div>
              </div>
            ) : (
              Object.entries(porProducto).map(([producto, items]) => {
                const totalFundasProd = items.reduce((s,i) => s + i.cantidad, 0);
                const totalKgProd     = items.reduce((s,i) => s + i.kg_total, 0);
                const totalValorProd  = items.reduce((s,i) => s + i.valor_venta_total, 0);
                return (
                  <div key={producto} style={{
                    background:'white', borderRadius:'12px',
                    overflow:'hidden', marginBottom:'12px',
                    border:'0.5px solid #e0e0e0'
                  }}>
                    {/* Header producto */}
                    <div style={{
                      background:'#1a5276', padding:'10px 16px',
                      display:'flex', justifyContent:'space-between', alignItems:'center'
                    }}>
                      <span style={{ color:'white', fontWeight:'bold', fontSize:'13px' }}>
                        {producto}
                      </span>
                      <div style={{ display:'flex', gap:12 }}>
                        {[
                          [totalFundasProd + ' fundas', 'white'],
                          [totalKgProd.toFixed(1) + ' kg', '#aed6f1'],
                          ['$' + totalValorProd.toFixed(2), '#f9e79f'],
                        ].map(([v,c],i) => (
                          <span key={i} style={{ color:c, fontSize:'12px', fontWeight:'bold' }}>{v}</span>
                        ))}
                      </div>
                    </div>

                    {/* Filas fundas */}
                    <div style={{ overflowX:'auto' }}>
                      <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'12px' }}>
                        <thead>
                          <tr style={{ background:'#f8f9fa' }}>
                            {['Funda','Kg/funda','Stock','Kg total','Precio venta/und','Valor total'].map(h => (
                              <th key={h} style={{
                                padding:'8px 12px', textAlign: h==='Funda' ? 'left' : 'right',
                                color:'#888', fontWeight:'600', fontSize:'11px',
                                borderBottom:'0.5px solid #e0e0e0'
                              }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((item, i) => (
                            <tr key={i} style={{
                              borderBottom:'0.5px solid #f0f0f0',
                              background: i%2===0 ? 'white' : '#fafafa'
                            }}>
                              <td style={{ padding:'9px 12px', fontWeight:'500' }}>
                                {item.nombre_funda}
                              </td>
                              <td style={{ padding:'9px 12px', textAlign:'right', color:'#555' }}>
                                {item.kg_por_funda} kg
                              </td>
                              <td style={{ padding:'9px 12px', textAlign:'right' }}>
                                <span style={{
                                  background:'#EAF3DE', color:'#27500A',
                                  padding:'2px 10px', borderRadius:'20px',
                                  fontWeight:'bold'
                                }}>{item.cantidad} und</span>
                              </td>
                              <td style={{ padding:'9px 12px', textAlign:'right', color:'#185FA5', fontWeight:'bold' }}>
                                {item.kg_total.toFixed(1)} kg
                              </td>
                              <td style={{ padding:'9px 12px', textAlign:'right', color:'#27500A', fontWeight:'bold' }}>
                                ${item.precio_venta_unitario.toFixed(4)}
                              </td>
                              <td style={{ padding:'9px 12px', textAlign:'right', color:'#27500A', fontWeight:'bold' }}>
                                ${item.valor_venta_total.toFixed(2)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })
            )}
          </>
        )}

        {/* Tab Movimientos */}
        {tab === 'movimientos' && (
          <div style={{
            background:'white', borderRadius:'12px',
            overflow:'hidden', border:'0.5px solid #e0e0e0'
          }}>
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'12px' }}>
                <thead>
                  <tr style={{ background:'#1a1a2e' }}>
                    {['Fecha','Producto','Funda','Kg/funda','Cantidad','Kg total','Tipo','Origen'].map(h => (
                      <th key={h} style={{
                        padding:'10px 12px', textAlign:'left',
                        color:'white', fontWeight:'600', fontSize:'11px'
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {movimientos.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{
                        textAlign:'center', padding:'40px', color:'#aaa'
                      }}>Sin movimientos registrados</td>
                    </tr>
                  ) : (
                    movimientos.map((m, i) => (
                      <tr key={i} style={{
                        background: i%2===0 ? '#fafafa' : 'white',
                        borderBottom:'0.5px solid #f0f0f0'
                      }}>
                        <td style={{ padding:'8px 12px', color:'#555' }}>{m.fecha}</td>
                        <td style={{ padding:'8px 12px', fontWeight:'500' }}>{m.producto_nombre}</td>
                        <td style={{ padding:'8px 12px', color:'#555' }}>{m.nombre_funda}</td>
                        <td style={{ padding:'8px 12px', textAlign:'right' }}>{m.kg_por_funda} kg</td>
                        <td style={{ padding:'8px 12px', textAlign:'right' }}>
                          <span style={{
                            color: m.tipo === 'entrada' ? '#27500A' : '#A32D2D',
                            fontWeight:'bold'
                          }}>
                            {m.tipo === 'entrada' ? '+' : '-'}{m.cantidad}
                          </span>
                        </td>
                        <td style={{ padding:'8px 12px', textAlign:'right', color:'#185FA5' }}>
                          {parseFloat(m.kg_total||0).toFixed(1)} kg
                        </td>
                        <td style={{ padding:'8px 12px' }}>
                          <span style={{
                            background: m.tipo === 'entrada' ? '#EAF3DE' : '#FCEBEB',
                            color:      m.tipo === 'entrada' ? '#27500A' : '#A32D2D',
                            padding:'2px 8px', borderRadius:'20px', fontSize:'10px', fontWeight:'bold'
                          }}>{m.tipo}</span>
                        </td>
                        <td style={{ padding:'8px 12px', color:'#888', fontSize:'11px' }}>
                          {m.referencia}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}