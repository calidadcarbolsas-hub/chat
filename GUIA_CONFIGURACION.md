# Guía de Configuración Completa
## Chatbot WhatsApp - Registro de NC | CARBOLSAS

---

## Índice

1. [Requisitos previos](#1-requisitos-previos)
2. [Configurar la base de datos MySQL local](#2-configurar-la-base-de-datos-mysql-local)
3. [Instalar y correr el proyecto localmente](#3-instalar-y-correr-el-proyecto-localmente)
4. [Exponer el servidor con ngrok](#4-exponer-el-servidor-con-ngrok)
5. [Crear la app en Meta for Developers](#5-crear-la-app-en-meta-for-developers)
6. [Obtener las credenciales de WhatsApp](#6-obtener-las-credenciales-de-whatsapp)
7. [Registrar el Webhook en Meta](#7-registrar-el-webhook-en-meta)
8. [Configurar el .env con las credenciales reales](#8-configurar-el-env-con-las-credenciales-reales)
9. [Probar el chatbot](#9-probar-el-chatbot)
10. [Verificar los datos en la base de datos](#10-verificar-los-datos-en-la-base-de-datos)
11. [Solución de errores comunes](#11-solución-de-errores-comunes)
12. [Estructura del proyecto](#12-estructura-del-proyecto)

---

## 1. Requisitos previos

Antes de comenzar asegúrate de tener instalado lo siguiente en tu computador:

### 1.1 Node.js
- Descarga desde: https://nodejs.org/
- Instala la versión **LTS** (la recomendada)
- Para verificar que quedó bien instalado, abre una terminal y escribe:
  ```
  node -v
  npm -v
  ```
  Deben mostrar un número de versión (ej: `v20.11.0`)

### 1.2 MySQL
- Descarga desde: https://dev.mysql.com/downloads/installer/
- Instala **MySQL Community Server** + **MySQL Workbench**
- Durante la instalación te pedirá crear una contraseña para el usuario `root`
- **Anota esa contraseña**, la necesitarás

### 1.3 Cuenta de Facebook/Meta
- Necesitas una cuenta de Facebook personal activa
- Desde esa cuenta crearás la app de WhatsApp Business

### 1.4 ngrok (para pruebas locales)
- Descarga desde: https://ngrok.com/download
- Crea una cuenta gratuita en ngrok.com
- Descarga el ejecutable y descomprímelo en una carpeta fácil de encontrar (ej: `C:\ngrok\`)

---

## 2. Configurar la base de datos MySQL local

### Paso 2.1: Abrir MySQL Workbench

1. Abre **MySQL Workbench** desde el menú de inicio
2. Verás una conexión llamada `Local instance MySQL` (o similar)
3. Haz doble clic en esa conexión
4. Te pedirá la contraseña que pusiste al instalar MySQL → ingrésala

### Paso 2.2: Crear la base de datos

1. En la barra superior haz clic en el ícono de **"Create a new schema"** (ícono de cilindro con un +) o usa el menú `Database → Create Schema`
2. En el campo **Name** escribe exactamente: `carbolsaschat`
3. En **Character Set** selecciona: `utf8mb4`
4. En **Collation** selecciona: `utf8mb4_unicode_ci`
5. Haz clic en **Apply** → **Apply** → **Finish**

### Paso 2.3: Ejecutar el schema del proyecto

1. En MySQL Workbench, ve al menú `File → Open SQL Script`
2. Navega hasta la carpeta del proyecto y abre el archivo:
   ```
   chatboot-carbolsas/database/schema.sql
   ```
3. Asegúrate de que en la barra superior esté seleccionada la base de datos `carbolsaschat`
   - Si no aparece, escribe esto al inicio del script: `USE carbolsaschat;`
4. Presiona el ícono del **rayo** (Execute) o `Ctrl + Shift + Enter`
5. Debes ver en la pestaña **Output** los mensajes en verde: tablas creadas correctamente

### Paso 2.4: Verificar que las tablas existen

En MySQL Workbench, en el panel izquierdo expande:
```
carbolsaschat → Tables
```
Deben aparecer:
- `usuarios`
- `reportes_nc`

---

## 3. Instalar y correr el proyecto localmente

### Paso 3.1: Abrir terminal en la carpeta del proyecto

1. Abre el Explorador de Windows
2. Navega hasta la carpeta `chatboot-carbolsas`
3. Haz clic en la barra de direcciones, escribe `cmd` y presiona Enter
   - Se abrirá una terminal ya ubicada en esa carpeta

### Paso 3.2: Instalar dependencias

En la terminal escribe:
```bash
npm install
```
Espera a que descargue todo. Al terminar verás una carpeta `node_modules` creada.

### Paso 3.3: Configurar el archivo .env

Abre el archivo `.env` que está en la raíz del proyecto y asegúrate de que tenga esto:
```env
# Base de datos MySQL
DB_HOST=localhost
DB_PORT=3306
DB_NAME=carbolsaschat
DB_USER=root
DB_PASSWORD=tu_contraseña_de_mysql

# Servidor
PORT=3000
NODE_ENV=development

# WhatsApp Business API (Meta) — se completan en el paso 8
PHONE_NUMBER_ID=tu_phone_number_id_aqui
VERIFY_TOKEN=chatbot_carbolsas_nc_2026
WHATSAPP_TOKEN=tu_whatsapp_token_aqui
```

> **Nota:** Si al instalar MySQL no pusiste contraseña, deja `DB_PASSWORD=` vacío (sin nada después del igual).

### Paso 3.4: Arrancar el servidor

```bash
npm run dev
```

Si todo está bien, verás en la terminal:
```
===========================================
🤖 CHATBOT REGISTRO NC - CARBOLSAS
===========================================

📊 Conexión a MySQL establecida - CARBOLSACHAT
📋 Tablas CARBOLSAS verificadas/creadas correctamente
✅ Base de datos conectada correctamente

🚀 SERVIDOR CARBOLSAS LISTO EN PUERTO 3000

📱 Webhook URL: http://localhost:3000/webhook
```

> Si ves ese mensaje, el servidor está corriendo correctamente de forma local.

---

## 4. Exponer el servidor con ngrok

Meta necesita una URL pública (https) para enviarle los mensajes. Como estamos en local, usamos **ngrok** para crear ese túnel.

### Paso 4.1: Autenticar ngrok (solo la primera vez)

1. Ve a https://ngrok.com y entra con tu cuenta
2. En el panel, copia tu **Authtoken** (está en `Getting Started → Your Authtoken`)
3. Abre una terminal **nueva** (deja el servidor corriendo en la otra)
4. Ejecuta:
   ```bash
   ngrok config add-authtoken TU_TOKEN_AQUI
   ```

### Paso 4.2: Crear el túnel

En la misma terminal nueva escribe:
```bash
ngrok http 3000
```

Verás algo así:
```
Session Status    online
Account           tu@correo.com (Plan: Free)
Forwarding        https://a1b2c3d4.ngrok-free.app -> http://localhost:3000
```

> **Copia esa URL `https://...ngrok-free.app`** — la necesitas en el siguiente paso.

> **Importante:** Cada vez que reinicies ngrok la URL cambia. Si la URL cambia, deberás volver a configurar el webhook en Meta (paso 7).

---

## 5. Crear la app en Meta for Developers

### Paso 5.1: Entrar al portal de Meta

1. Ve a: https://developers.facebook.com/
2. Haz clic en **"Mis aplicaciones"** (arriba a la derecha)
3. Inicia sesión con tu cuenta de Facebook si te lo pide

### Paso 5.2: Crear una nueva aplicación

1. Haz clic en **"Crear aplicación"**
2. Te preguntará para qué es la app — selecciona **"Otro"**
3. Haz clic en **Siguiente**
4. Selecciona el tipo **"Empresa"** (Business)
5. Haz clic en **Siguiente**
6. Completa el formulario:
   - **Nombre de la aplicación**: `Chatbot NC Carbolsas`
   - **Correo electrónico de contacto**: tu correo
   - **Cuenta de Business Manager**: si no tienes una, puedes crearla en ese momento haciendo clic en el enlace o seleccionar "No tengo una cuenta"
7. Haz clic en **"Crear aplicación"**
8. Puede pedirte confirmar tu contraseña de Facebook

### Paso 5.3: Agregar el producto WhatsApp

Una vez creada la app, llegas al **Panel de la aplicación**:

1. En la sección **"Agregar productos a tu aplicación"** busca **WhatsApp**
2. Haz clic en **"Configurar"** (el botón que aparece en la tarjeta de WhatsApp)
3. Acepta los términos de servicio de WhatsApp Business si te lo pide
4. WhatsApp quedará agregado al menú lateral izquierdo

---

## 6. Obtener las credenciales de WhatsApp

### Paso 6.1: Ir a la sección de WhatsApp

En el menú lateral izquierdo haz clic en **WhatsApp → Comenzar** (o "Getting Started")

### Paso 6.2: Número de prueba

Verás un panel con:
- **Número de teléfono de prueba**: es el número que usará el chatbot durante desarrollo (Meta te lo asigna automáticamente)
- **Phone Number ID**: el identificador de ese número

> **Copia el `Phone Number ID`** — lo necesitas en el `.env`

### Paso 6.3: Agregar tu número de WhatsApp para pruebas

Para poder enviarle mensajes al chatbot desde tu teléfono:

1. En la sección **"Enviar y recibir mensajes"**, en el campo **"Para:"** haz clic en **"Administrar lista de números de teléfono"**
2. Haz clic en **"Agregar número de teléfono"**
3. Ingresa tu número de WhatsApp personal con código de país (ej: `+57 300 123 4567`)
4. Meta te enviará un código de verificación por WhatsApp
5. Ingresa el código → verificado

> En la versión de prueba solo puedes enviar mensajes a los números que agregues aquí (máximo 5).

### Paso 6.4: Generar el Token de acceso temporal

1. En la misma sección **WhatsApp → Comenzar**
2. Busca la parte que dice **"Token de acceso temporal"**
3. Haz clic en **"Generar"** (o copia el que ya está generado)
4. **Copia ese token** — lo necesitas en el `.env`

> Este token dura **24 horas**. Para producción se usa un token permanente (ver sección más abajo).

### Paso 6.5: Crear Token Permanente (para cuando ya no sea prueba)

Cuando quieras pasar a producción:

1. Ve a **Configuración del negocio** (ícono de engranaje en el menú izquierdo, abajo)
2. En el menú: **Usuarios → Usuarios del sistema**
3. Haz clic en **"Agregar"**
4. Crea un usuario con rol **"Administrador"**
5. Con el usuario creado, haz clic en **"Generar token nuevo"**
6. Selecciona tu app (`Chatbot NC Carbolsas`)
7. Activa los permisos:
   - `whatsapp_business_management`
   - `whatsapp_business_messaging`
8. Haz clic en **"Generar token"**
9. **Copia y guarda el token en un lugar seguro** — solo se muestra una vez

---

## 7. Registrar el Webhook en Meta

El webhook le dice a Meta a qué URL enviar los mensajes que reciba el chatbot.

### Paso 7.1: Ir a la configuración del Webhook

1. En el menú lateral: **WhatsApp → Configuración** (o "Configuration")
2. Busca la sección **"Webhook"**
3. Haz clic en **"Editar"**

### Paso 7.2: Ingresar la URL y el token

Se abrirá un formulario con dos campos:

- **URL de devolución de llamada** (Callback URL):
  ```
  https://TU-URL-DE-NGROK.ngrok-free.app/webhook
  ```
  > Reemplaza con la URL que te dio ngrok en el paso 4.2, agregando `/webhook` al final.

  Ejemplo:
  ```
  https://a1b2c3d4.ngrok-free.app/webhook
  ```

- **Token de verificación** (Verify token):
  ```
  chatbot_carbolsas_nc_2026
  ```
  > Este debe ser **exactamente igual** al valor de `VERIFY_TOKEN` en tu archivo `.env`

### Paso 7.3: Verificar y guardar

1. Haz clic en **"Verificar y guardar"**
2. Meta hará una petición a tu servidor para verificar que responde correctamente
3. Si el servidor está corriendo y el token coincide, verás un **check verde ✅**
4. Si falla, revisa:
   - Que el servidor esté corriendo (`npm run dev`)
   - Que ngrok esté corriendo y la URL sea correcta
   - Que el `VERIFY_TOKEN` en `.env` coincida exactamente con lo que pusiste en Meta

### Paso 7.4: Suscribirse a eventos de mensajes

1. Después de guardar, en la misma sección del Webhook busca el botón **"Administrar"** (Manage)
2. Busca el campo **`messages`**
3. Activa el toggle para suscribirte a ese evento ✅
4. Guarda

---

## 8. Configurar el .env con las credenciales reales

Abre el archivo `.env` del proyecto y completa todos los campos:

```env
# Base de datos MySQL
DB_HOST=localhost
DB_PORT=3306
DB_NAME=carbolsaschat
DB_USER=root
DB_PASSWORD=tu_contraseña_de_mysql

# Servidor
PORT=3000
NODE_ENV=development

# WhatsApp Business API (Meta)
PHONE_NUMBER_ID=123456789012345
VERIFY_TOKEN=chatbot_carbolsas_nc_2026
WHATSAPP_TOKEN=EAAxxxxxxxxxxxxxxxxxxxxx
```

Dónde encontrar cada valor:

| Variable | Dónde encontrarla |
|---|---|
| `DB_PASSWORD` | La contraseña que pusiste al instalar MySQL |
| `PHONE_NUMBER_ID` | Meta → WhatsApp → Comenzar → "Phone Number ID" |
| `VERIFY_TOKEN` | Lo defines tú — debe coincidir con lo que pusiste en Meta |
| `WHATSAPP_TOKEN` | Meta → WhatsApp → Comenzar → "Token de acceso temporal" |

Después de editar el `.env`, **reinicia el servidor**:
1. En la terminal donde corre el servidor, presiona `Ctrl + C` para detenerlo
2. Escribe nuevamente `npm run dev`

---

## 9. Probar el chatbot

### Paso 9.1: Generar el link de WhatsApp

Para que alguien pueda iniciar la conversación con el bot, usa este formato de URL:

```
https://wa.me/NUMERO_SIN_SIGNOS?text=Hola
```

Para encontrar el número del chatbot:
- Ve a **Meta → WhatsApp → Comenzar**
- El número de prueba aparece en la sección superior (ej: `+1 555 019 5145`)
- Quítale el `+` y los espacios: `15550195145`

Ejemplo de link:
```
https://wa.me/15550195145?text=Hola
```

### Paso 9.2: Enviar el primer mensaje

1. Abre el link en tu teléfono (desde el número que agregaste en el paso 6.3)
2. Se abrirá WhatsApp con el mensaje "Hola" listo para enviar
3. Envíalo
4. El bot debe responder con el mensaje de bienvenida en pocos segundos

### Paso 9.3: Flujo esperado del chatbot

```
Bot: 👋 Hola. En este espacio podrás registrar...

  → Pregunta 1: ¿En qué área ocurrió la situación?
     Opciones: Ventas / Corte / Troquelado / Impresión / Descatornado / Pegado / Otro

  → Pregunta 2: Empresa del cliente

  → Pregunta 3: Número de orden de producción

  → Pregunta 4: Número de referencia

  → Pregunta 5: Descripción de la NC

  → Pregunta 6: Fecha (DD/MM/AAAA)

  → Pregunta 7: Nivel de impacto (Alto / Medio / Bajo)

  → Pregunta 8: Acción inmediata (Sí / No)
     Si responde Sí → pide descripción de la acción

  → Resumen de respuestas
     Opciones: ✅ Sí, confirmar | ✏️ Corregir dato

  → Bot: ✅ Registro guardado con éxito. Gracias por reportar...
```

---

## 10. Verificar los datos en la base de datos

### Ver todos los reportes registrados

Abre MySQL Workbench, conéctate a `carbolsaschat` y ejecuta:

```sql
SELECT * FROM reporte_nc_completo;
```

### Ver reportes por área

```sql
SELECT * FROM reporte_nc_completo WHERE area = 'Corte';
```

### Ver reportes de alto impacto

```sql
SELECT * FROM reporte_nc_completo WHERE nivel_impacto LIKE '%Alto%';
```

### Ver reportes pendientes

```sql
SELECT * FROM reporte_nc_completo WHERE estado = 'pendiente';
```

### Estadísticas por área

```sql
SELECT area, COUNT(*) AS total
FROM reportes_nc
GROUP BY area
ORDER BY total DESC;
```

---

## 11. Solución de errores comunes

### "Error: Database connection failed" o "ECONNREFUSED"
- Verifica que MySQL esté corriendo (en Windows: Servicios → MySQL → Iniciado)
- Verifica que `DB_USER`, `DB_PASSWORD` y `DB_NAME` en `.env` sean correctos
- Asegúrate de haber creado la base de datos `carbolsaschat`

### "Webhook verification failed" en Meta
- El servidor debe estar corriendo (`npm run dev`)
- ngrok debe estar corriendo y la URL debe ser la correcta
- El `VERIFY_TOKEN` en `.env` debe ser **idéntico** (mayúsculas, sin espacios) al que pusiste en Meta

### El bot no responde
- Verifica que te suscribiste al evento `messages` en Meta (paso 7.4)
- Verifica que tu número esté en la lista de prueba (paso 6.3)
- Revisa la terminal del servidor — debe mostrar los mensajes recibidos en tiempo real

### "Token expired" o error 401 en WhatsApp
- El token temporal de Meta dura 24 horas
- Ve a Meta → WhatsApp → Comenzar y genera uno nuevo
- Cópialo en el `.env` y reinicia el servidor

### La URL de ngrok cambió
- Cada vez que reinicias ngrok la URL cambia
- Debes volver al paso 7 y actualizar el webhook en Meta con la nueva URL

### "Cannot find module" al hacer npm run dev
- Ejecuta `npm install` de nuevo en la carpeta del proyecto

---

## 12. Estructura del proyecto

```
chatboot-carbolsas/
├── src/
│   ├── config/
│   │   ├── database.js          # Conexión a MySQL y creación de tablas
│   │   └── whatsapp.js          # Configuración del token de WhatsApp
│   ├── controllers/
│   │   └── webhook.controller.js  # Recibe y procesa eventos de Meta
│   ├── services/
│   │   ├── conversation.service.js  # Lógica del flujo del chatbot
│   │   └── whatsapp.service.js      # Envío de mensajes por la API
│   ├── routes/
│   │   └── webhook.routes.js    # Rutas GET y POST del webhook
│   ├── utils/
│   │   └── questions.js         # Preguntas y mensajes del chatbot NC
│   └── index.js                 # Punto de entrada del servidor
├── database/
│   └── schema.sql               # Esquema de la base de datos
├── .env                         # Variables de entorno (credenciales)
├── package.json
└── GUIA_CONFIGURACION.md        # Este documento
```

---

## Documentación oficial de referencia

- WhatsApp Cloud API: https://developers.facebook.com/docs/whatsapp/cloud-api
- Webhooks de WhatsApp: https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks
- ngrok: https://ngrok.com/docs

---

*Documento técnico — Chatbot Registro NC | CARBOLSAS*
