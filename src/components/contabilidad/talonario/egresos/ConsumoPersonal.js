// src/components/contabilidad/talonario/egresos/ConsumoPersonal.js
import React, { useEffect, useState } from 'react';
import { supabase } from '../../../../supabase';
import { useTalonario } from '../TalonarioContext';
import { TablaCrud } from '../shared/TablaCrud';
import SelectBuscable from '../../../shared/SelectBuscable';

const VACIO = { fecha: '', producto_nombre: '', cantidad: '', valor: '', detalle: '' };

export default function ConsumoPersonal() {
  const { mes, año, esAdminContador } = useTalonario();
  const [filas,     setFilas]     = useState([]);
  const [productos, setProductos] = useState([]);
  const [cargando,  setCargando]  = useState(false);
  const [form,      setForm]      = useState(null);
  const [guardando, setGuardando] = useState(false);

  async function cargar() {
    setCargando(true);
    const [{ data }, { data: prods }] = await Promise.all([
      supabase.from('talonario_consumo_personal')
        .select('*').eq('mes', mes).eq('año', año).order('fecha'),
      supabase.from('productos').select('id,nombre').eq('estado', 'ACTIVO').order('nombre'),
    ]);
    setFilas(data || []);
    setProductos(prods || []);
    setCargando(false);
  }

  useEffect(() => { cargar(); }, [mes, año]);

  async function guardar() {
    if (!form.producto_nombre || !form.valor) return alert('Producto y valor son requeridos');
    setGuardando(true);
    const payload = {
      mes, año, fecha: form.fecha || null, producto_nombre: form.producto_nombre,
      cantidad: parseFloat(form.cantidad) || 0, valor: parseFloat(form.valor),
      detalle: form.detalle || null,
    };
    if (form.id) {
      await supabase.from('talonario_consumo_personal').update(payload).eq('id', form.id);
    } else {
      await supabase.from('talonario_consumo_personal').insert(payload);
    }
    setGuardando(false);
    setForm(null);
    cargar();
  }

  async function eliminar(id) {
    await supabase.from('talonario_consumo_personal').delete().eq('id', id);
    cargar();
  }

  const columnas = [
    { key: 'fecha',           label: 'Fecha' },
    { key: 'producto_nombre', label: 'Producto' },
    { key: 'cantidad',        label: 'Cantidad', align: 'right' },
    { key: 'valor',           label: 'Valor', render: f => `$${parseFloat(f.valor || 0).toFixed(2)}`, align: 'right' },
    { key: 'detalle',         label: 'Detalle' },
  ];

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        background: '#8e44ad', color: 'white', borderRadius: '8px 8px 0 0',
        padding: '8px 14px', fontSize: 13, fontWeight: 'bold' }}>
        <span>🥓 Consumo Personal - Producto Casa</span>
        <span>TOTAL: ${filas.reduce((s, f) => s + parseFloat(f.valor || 0), 0).toFixed(2)}</span>
      </div>
      <div style={{ background: 'white', borderRadius: '0 0 8px 8px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
        <TablaCrud
          titulo=""
          filas={filas}
          columnas={columnas}
          campoMonto="valor"
          cargando={cargando}
          esAdminContador={esAdminContador}
          onAgregar={() => setForm({ ...VACIO })}
          onEditar={f => setForm({ ...f })}
          onEliminar={eliminar}
        />
      </div>

      {form && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', borderRadius: 12, padding: 24, width: 400, maxWidth: '95vw' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 15 }}>
              {form.id ? 'Editar consumo personal' : 'Nuevo consumo personal'}
            </h3>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, color: '#555', display: 'block', marginBottom: 4 }}>Fecha</label>
              <input type="date" value={form.fecha || ''} onChange={e => setForm(p => ({ ...p, fecha: e.target.value }))}
                style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #ddd',
                  fontSize: 13, boxSizing: 'border-box' }} />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, color: '#555', display: 'block', marginBottom: 4 }}>Producto</label>
              <SelectBuscable
                valor={form.producto_nombre}
                onChange={v => setForm(p => ({ ...p, producto_nombre: v }))}
                placeholder="Buscar producto..."
                opciones={productos.map(p => ({ value: p.nombre, label: p.nombre }))}
              />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, color: '#555', display: 'block', marginBottom: 4 }}>Cantidad</label>
              <input type="number" min="0" step="0.01" value={form.cantidad || ''}
                onChange={e => setForm(p => ({ ...p, cantidad: e.target.value }))}
                style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #ddd',
                  fontSize: 13, boxSizing: 'border-box' }} />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, color: '#555', display: 'block', marginBottom: 4 }}>Valor ($)</label>
              <input type="number" min="0" step="0.01" value={form.valor || ''}
                onChange={e => setForm(p => ({ ...p, valor: e.target.value }))}
                style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #ddd',
                  fontSize: 13, boxSizing: 'border-box' }} />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, color: '#555', display: 'block', marginBottom: 4 }}>Detalle (opcional)</label>
              <input type="text" value={form.detalle || ''} onChange={e => setForm(p => ({ ...p, detalle: e.target.value }))}
                style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #ddd',
                  fontSize: 13, boxSizing: 'border-box' }} />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setForm(null)}
                style={{ padding: '8px 20px', borderRadius: 6, border: '1px solid #ddd',
                  background: 'white', cursor: 'pointer', fontSize: 13 }}>Cancelar</button>
              <button onClick={guardar} disabled={guardando}
                style={{ padding: '8px 20px', borderRadius: 6, border: 'none',
                  background: '#27ae60', color: 'white', cursor: 'pointer', fontSize: 13 }}>
                {guardando ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
