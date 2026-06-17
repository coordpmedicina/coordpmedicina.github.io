# 🎓 MicroApp v2.0 - Gestor de Microcurrículos con Supabase

Sistema profesional de gestión de microcurrículos para el Programa de Medicina de la Universidad del Cauca, con integración Supabase para control de versiones y persistencia en la nube.

## ✨ Características Principales

### 📋 Formulario Completo (8 Secciones)
- **Identificación**: Datos básicos de la asignatura
- **Docentes**: Coordinador y equipo docente
- **Presentación**: Contexto y propósito académico
- **Competencias**: 4 dimensiones + Resultados de Aprendizaje
- **Metodología**: Temas, métodos, horas, recursos
- **Cronograma**: Programación semanal
- **Evaluación**: Diagnóstica, formativa, sumativa
- **Exportar**: PDF, Markdown, JSON

### 🔄 Gestión de Versiones
- ✅ Crear múltiples versiones de microcurrículos
- ✅ Historial completo con timestamps
- ✅ Estados: Borrador, Aprobado, Activo, Archivado
- ✅ Notas de cambios en cada versión
- ✅ Versionado automático (v1.0, v1.1, v2.0, etc)

### ☁️ Integración Supabase
- ✅ Almacenamiento en la nube
- ✅ Sincronización automática
- ✅ Acceso desde múltiples dispositivos
- ✅ Auditoría de cambios (quién, cuándo)
- ✅ Historial completo e inmutable
- ✅ Fallback a almacenamiento local

### ✅ Validación Automática
- Verificación en tiempo real
- Indicadores visuales (✓ verde, ✗ rojo, ⚠ amarillo)
- Porcentaje de completado
- Identificación de campos faltantes

### 🎨 Diseño Profesional
- Estilos coherentes con app "Informe"
- Interfaz responsiva (desktop/tablet/móvil)
- Paleta de colores corporativa
- Iconos descriptivos
- Animaciones suaves

## 🚀 Instalación Rápida

### 1. **Clonar/Descargar**
```bash
cd /Users/jacalvache/Claude\ projects/microcurriculo
```

### 2. **Configurar Supabase** (Recomendado)
Ver [SUPABASE_SETUP.md](SUPABASE_SETUP.md) para instrucciones detalladas.

Resumen:
1. Crear proyecto en supabase.com
2. Ejecutar script SQL
3. Copiar URL y API Key en `config.js`

### 3. **Iniciar**
```bash
python3 -m http.server 8000 --directory .
# Luego ir a http://localhost:8000
```

## 📖 Guía de Uso

### Workflow Recomendado

1. **Panel de Versiones** (Arriba)
   - Ver versiones existentes
   - Click en una para cargar
   - Botón "+ Nueva Versión" para crear

2. **Completar Tabs en Orden**
   - 📋 Identificación → datos básicos
   - 👨‍🏫 Docentes → equipo académico
   - 📝 Presentación → contexto
   - 🎯 Competencias → qué enseñar
   - 📚 Metodología → cómo enseñar
   - 📅 Cronograma → cuándo
   - ✅ Evaluación → cómo evaluar

3. **Validación**
   - Ir a tab **Exportar**
   - Revisar validación (marcas verdes/rojas)
   - Corregir campos faltantes

4. **Guardar y Exportar**
   - **💾 Guardar Progreso** → Supabase + LocalStorage
   - **📄 Descargar PDF** → para imprimir
   - **📝 Descargar Markdown** → para editar
   - **💾 Guardar JSON** → para integración

### Gestión de Versiones

#### Crear Nueva Versión
```
1. Click "+ Nueva Versión"
2. Ingresa nombre descriptivo (Ej: "v1.0 - Propuesta inicial")
3. (Opcional) Escribe notas de cambios
4. Click "Crear Versión"
5. Comienza a editar
```

#### Cargar Versión Anterior
```
1. Busca la tarjeta en panel "Gestión de Versiones"
2. Click en la tarjeta
3. Contenido se carga automáticamente
```

#### Actualizar Versión Actual
```
1. Edita los campos
2. Click "💾 Guardar Progreso"
3. Se actualiza en Supabase automáticamente
```

### Panel de Sincronización

En la esquina superior derecha ves:
- 🟢 **Verde "Conectado a Supabase"** = Guardando en la nube
- 🔴 **Rojo "Usando almacenamiento local"** = Sin conexión (fallback)

Los datos siempre se guardan localmente como respaldo.

## 🏗️ Estructura de Archivos

```
microcurriculo/
├── index.html              # Interfaz principal
├── app-supabase.js        # Lógica con Supabase
├── config.js              # Configuración Supabase
├── app.js                 # Versión sin Supabase (legacy)
├── README.md              # Este archivo
├── SUPABASE_SETUP.md      # Guía Supabase
└── .claude/
    └── launch.json        # Configuración servidor dev
```

## 🔐 Seguridad

- ✅ Row Level Security (RLS) en Supabase
- ✅ Datos encriptados en tránsito (HTTPS)
- ✅ Auditoría: Usuario, fecha, cambios
- ✅ Versiones inmutables para auditoría
- ✅ Tokens de sesión seguros
- ✅ Validación de entrada en cliente

## 💾 Persistencia de Datos

### Almacenamiento en Supabase
```
✅ Ventajas:
  - Acceso desde cualquier dispositivo
  - Historial completo
  - Backup automático
  - Colaboración potencial
  - Auditoría integrada
```

### Almacenamiento Local
```
✅ Ventajas:
  - Funciona sin internet
  - Más rápido
  - Privacidad local
  - Respaldo automático
```

**Nota**: MicroApp guarda AMBOS automáticamente.

## 📊 Datos del Formulario

Cada microcurrículo almacena estructura JSON completa con:
- Información de identificación
- Equipo docente
- Presentación y contexto
- Competencias en 4 dimensiones
- Resultados de aprendizaje
- Temas y metodología
- Cronograma semanal
- Evaluación diagnóstica/formativa/sumativa

## 🎯 Validación Requerida

### Campos Obligatorios (Rojo ✗)
- ✅ Nombre de asignatura
- ✅ Código de asignatura
- ✅ Semestre
- ✅ Módulo del programa
- ✅ Competencias en 4 dimensiones
- ✅ Evaluación diagnóstica y formativa
- ✅ Al menos un docente

### Recomendaciones (Amarillo ⚠)
- 🔹 Mínimo 3 Resultados de Aprendizaje
- 🔹 Temas/Metodología completa
- 🔹 Cronograma semanal

## 📱 Compatibilidad

✅ Chrome 90+
✅ Firefox 88+
✅ Safari 14+
✅ Edge 90+
✅ Responsive (Desktop, Tablet, Móvil)

## ⚙️ Configuración Avanzada

### Cambiar URL de Supabase
En `config.js`:
```javascript
const SUPABASE_URL = 'https://tu-proyecto.supabase.co';
const SUPABASE_KEY = 'tu-anon-key-aqui';
```

### Usar Sin Supabase
Simplemente carga `index.html`:
- Usa almacenamiento local
- Los datos no se sincronizan
- Funciona offline completamente

### Exportar Base de Datos
En Supabase, exporta como SQL o CSV:
```
Project Settings → Database → Exports
```

## 🐛 Troubleshooting

### "Conectando..." indefinidamente
- Verificar conexión a internet
- Verificar URL/KEY en `config.js`
- Revisar consola (F12 → Console)

### Los datos no se guardan
- Verificar que hay espacio en localStorage
- Probar incógnito (evita cachés)
- Revisar permiso de escritura

### Versión no carga
- Hacer refresh (Ctrl+R)
- Verificar estructura de datos
- Revisar en Supabase Dashboard

### "No hay versiones"
- Crear nueva versión
- Los datos anteriores se guardan en localStorage
- Puedes importarlos manualmente

## 📞 Soporte

Para reportar bugs:
1. Abre DevTools (F12)
2. Ve a Console tab
3. Copia errores
4. Documenta pasos para reproducir

Información útil:
- Navegador y versión
- URL de Supabase (sin API key)
- Screenshot de error

## 📈 Hoja de Ruta (Roadmap)

- [ ] Autenticación de usuarios
- [ ] Colaboración en tiempo real
- [ ] Comentarios y revisiones
- [ ] Plantillas predefinidas
- [ ] Integración con SIMCA
- [ ] Exportación a formatos adicionales
- [ ] App móvil nativa
- [ ] API REST pública

## 📄 Licencia

Uso interno - Universidad del Cauca

---

**MicroApp v2.0** | Programa de Medicina | Universidad del Cauca

Última actualización: Junio 2026
