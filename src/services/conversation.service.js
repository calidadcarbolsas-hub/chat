const { getPool } = require('../config/database');
const whatsappService = require('./whatsapp.service');
const driveService = require('./drive.service');
const { PREGUNTAS, PREGUNTAS_EXTRA, MENSAJES } = require('../utils/questions');

class ConversationService {

    // ==================== METODOS DE BASE DE DATOS ====================

    async getOrCreateUser(telefono) {
        console.log('   🔍 Buscando usuario con telefono:', telefono);
        const pool = getPool();

        const [rows] = await pool.execute(
            'SELECT * FROM usuarios WHERE telefono = ?',
            [telefono]
        );

        if (rows.length > 0) {
            console.log('   ✅ Usuario existente encontrado, ID:', rows[0].id);
            return rows[0];
        }

        console.log('   🆕 Usuario no existe, creando nuevo...');
        const [result] = await pool.execute(
            'INSERT INTO usuarios (telefono, estado_conversacion) VALUES (?, ?)',
            [telefono, 'inicio']
        );

        console.log('   ✅ Nuevo usuario creado, ID:', result.insertId);
        return {
            id: result.insertId,
            telefono: telefono,
            estado_conversacion: 'inicio'
        };
    }

    async updateUserState(userId, estado) {
        const pool = getPool();
        // Se fuerza fecha_actualizacion = NOW() explícitamente para que el check de
        // inactividad funcione correctamente incluso si el estado no cambia de valor.
        await pool.execute(
            'UPDATE usuarios SET estado_conversacion = ?, fecha_actualizacion = NOW() WHERE id = ?',
            [estado, userId]
        );
    }

    async createReporteNC(userId) {
        const pool = getPool();
        const [result] = await pool.execute(
            'INSERT INTO reportes_nc (usuario_id) VALUES (?)',
            [userId]
        );
        return result.insertId;
    }

    async getReporteActivo(userId) {
        const pool = getPool();
        const [rows] = await pool.execute(
            `SELECT * FROM reportes_nc WHERE usuario_id = ? ORDER BY fecha_reporte DESC LIMIT 1`,
            [userId]
        );
        return rows.length > 0 ? rows[0] : null;
    }

    async updateReporte(reporteId, campo, valor) {
        const pool = getPool();
        const camposPermitidos = [
            'area', 'area_otro', 'empresa_cliente', 'orden_produccion',
            'referencia', 'precio_caja', 'cantidad_cajas',
            'cantidad_nc', 'cantidad_total', 'descripcion_nc',
            'fecha_evento', 'nivel_impacto', 'descripcion_impacto',
            'accion_inmediata', 'descripcion_accion',
            'evidencia_url'
        ];

        if (!camposPermitidos.includes(campo)) {
            throw new Error(`Campo no permitido: ${campo}`);
        }

        await pool.execute(
            `UPDATE reportes_nc SET ${campo} = ? WHERE id = ?`,
            [valor, reporteId]
        );
    }

    async marcarReporteCompletado(reporteId) {
        const pool = getPool();
        await pool.execute(
            `UPDATE reportes_nc SET estado = 'pendiente' WHERE id = ?`,
            [reporteId]
        );
    }

    async marcarReporteAbandonado(userId) {
        const pool = getPool();
        // Marca como abandonado el reporte más reciente que aún esté incompleto (estado = 'pendiente' sin confirmación)
        // Se usa subquery para compatibilidad con MySQL al combinar UPDATE + ORDER BY + LIMIT
        await pool.execute(
            `UPDATE reportes_nc SET estado = 'abandonado'
             WHERE id = (
                 SELECT id FROM (
                     SELECT id FROM reportes_nc
                     WHERE usuario_id = ? AND estado = 'pendiente'
                     ORDER BY fecha_reporte DESC
                     LIMIT 1
                 ) AS t
             )`,
            [userId]
        );
    }

    async resetConversacion(user, telefono) {
        // Solo abandona el reporte si hay uno en curso (no aplica para completado ni inicio)
        const tieneReporteEnCurso = !['inicio', 'completado'].includes(user.estado_conversacion);
        if (tieneReporteEnCurso) {
            await this.marcarReporteAbandonado(user.id);
        }
        await this.sendWelcome(telefono, user.id);
    }

    // ==================== HANDLER PRINCIPAL ====================

    async handleMessage(telefono, mensaje, messageId, messageType, interactiveId, mediaId = null) {
        console.log('');
        console.log('🤖 CONVERSATION SERVICE - handleMessage');
        console.log('   Telefono:', telefono);
        console.log('   Mensaje:', mensaje);
        console.log('   MessageId:', messageId);
        console.log('   MessageType:', messageType);
        console.log('   InteractiveId:', interactiveId);
        console.log('   MediaId:', mediaId);

        try {
            console.log('   📖 Marcando mensaje como leído...');
            await whatsappService.markAsRead(messageId);

            console.log('   👤 Obteniendo/creando usuario...');
            const user = await this.getOrCreateUser(telefono);
            console.log('   ✅ Usuario:', JSON.stringify(user));

            console.log('   🔄 Procesando estado...');
            await this.processState(user, mensaje, telefono, messageType, interactiveId, mediaId);

        } catch (error) {
            console.log('');
            console.log('   ❌❌❌ ERROR EN handleMessage ❌❌❌');
            console.error('   Mensaje:', error.message);
            console.error('   Stack:', error.stack);

            try {
                await whatsappService.sendTextMessage(
                    telefono,
                    'Lo sentimos, ocurrió un error. Por favor intente nuevamente.'
                );
            } catch (sendError) {
                console.error('   Error enviando mensaje de error:', sendError.message);
            }
        }
    }

    // ==================== MAQUINA DE ESTADOS ====================

    async processState(user, mensaje, telefono, messageType, interactiveId, mediaId = null) {
        const estado = user.estado_conversacion;
        console.log('   📍 Estado actual:', estado);

        // ── RESET POR INACTIVIDAD (24 horas) ────────────────────────────────
        const tieneReporteEnCurso = !['inicio', 'completado'].includes(estado);
        if (tieneReporteEnCurso && user.fecha_actualizacion) {
            const horasInactivo = (Date.now() - new Date(user.fecha_actualizacion).getTime()) / 3600000;
            if (horasInactivo >= 24) {
                console.log(`   ⏰ Usuario inactivo ${horasInactivo.toFixed(1)}h → marcando reporte como abandonado`);
                await whatsappService.sendTextMessage(
                    telefono,
                    '⏰ Tu registro anterior quedó incompleto y fue marcado como abandonado.\n\nVamos a iniciar uno nuevo.'
                );
                await this.resetConversacion(user, telefono);
                return;
            }
        }

        // ── PALABRAS CLAVE DE REINICIO ───────────────────────────────────────
        const mensajeLower = (mensaje || '').toLowerCase().trim();
        if (['nuevo', 'reiniciar'].includes(mensajeLower) && estado !== 'inicio') {
            const aviso = tieneReporteEnCurso
                ? '🔄 Registro anterior marcado como abandonado. Iniciando uno nuevo...'
                : '🔄 Iniciando un nuevo registro...';
            await whatsappService.sendTextMessage(telefono, aviso);
            await this.resetConversacion(user, telefono);
            return;
        }

        // Sub-estados de cantidad (deben ir antes del check genérico de correccion)
        if (estado === 'pregunta_5_cantidad_und' || estado === 'pregunta_5_cantidad_lam') {
            await this.processCantidadNcCantidad(user, mensaje, telefono, estado, false);
            return;
        }
        if (estado === 'pregunta_6_cantidad_und' || estado === 'pregunta_6_cantidad_lam') {
            await this.processCantidadTotalCantidad(user, mensaje, telefono, estado, false);
            return;
        }
        if (estado === 'corregir_5_cantidad_und' || estado === 'corregir_5_cantidad_lam') {
            await this.processCantidadNcCantidad(user, mensaje, telefono, estado, true);
            return;
        }
        if (estado === 'corregir_6_cantidad_und' || estado === 'corregir_6_cantidad_lam') {
            await this.processCantidadTotalCantidad(user, mensaje, telefono, estado, true);
            return;
        }
        if (estado === 'corregir_10_descripcion') {
            await this.processAccionDescripcion(user, mensaje, telefono);
            return;
        }
        if (estado === 'corregir_9_descripcion') {
            await this.processImpactoDescripcion(user, mensaje, telefono, true);
            return;
        }
        if (estado === 'corregir_precio_caja') {
            await this.processPrecioCaja(user, mensaje, telefono, true);
            return;
        }
        if (estado === 'corregir_cantidad_cajas') {
            await this.processCantidadCajas(user, mensaje, telefono, true);
            return;
        }

        // Estados de corrección
        if (estado.startsWith('corregir_')) {
            await this.processCorreccion(user, mensaje, telefono, estado, messageType, interactiveId, mediaId);
            return;
        }

        switch (estado) {
            case 'inicio':
                await this.sendWelcome(telefono, user.id);
                break;

            case 'pregunta_1':
            case 'pregunta_2':
            case 'pregunta_3':
            case 'pregunta_4':
            case 'pregunta_5':
            case 'pregunta_6':
            case 'pregunta_7':
            case 'pregunta_8':
            case 'pregunta_9':
            case 'pregunta_10':
            case 'pregunta_11':
                await this.processQuestion(user, mensaje, telefono, estado, messageType, interactiveId);
                break;

            case 'pregunta_1_otro':
                await this.processAreaOtro(user, mensaje, telefono);
                break;

            case 'pregunta_precio_caja':
                await this.processPrecioCaja(user, mensaje, telefono, false);
                break;

            case 'pregunta_cantidad_cajas':
                await this.processCantidadCajas(user, mensaje, telefono, false);
                break;

            case 'pregunta_9_descripcion':
                await this.processImpactoDescripcion(user, mensaje, telefono, false);
                break;

            case 'pregunta_10_descripcion':
                await this.processAccionDescripcion(user, mensaje, telefono);
                break;

            case 'esperando_imagen':
                await this.processEsperandoImagen(user, telefono, messageType, mediaId, mensaje);
                break;

            case 'revision':
                await this.processRevision(user, mensaje, telefono, messageType, interactiveId);
                break;

            case 'seleccionar_correccion':
                await this.processSeleccionCorreccion(user, mensaje, telefono, messageType, interactiveId);
                break;

            case 'completado':
                await whatsappService.sendTextMessage(
                    telefono,
                    '✅ Ya registraste una NC anteriormente. Si deseas registrar una nueva, escribe *nuevo* o cualquier mensaje para iniciar.'
                );
                // Permitir nuevo reporte
                await this.updateUserState(user.id, 'inicio');
                break;

            default:
                await this.sendWelcome(telefono, user.id);
        }
    }

    // ==================== BIENVENIDA ====================

    async sendWelcome(telefono, userId) {
        console.log('   🎉 Enviando BIENVENIDA a', telefono);

        await whatsappService.sendTextMessage(telefono, MENSAJES.BIENVENIDA);
        await this.delay(800);

        // Crear nuevo reporte NC en blanco
        await this.createReporteNC(userId);

        await this.updateUserState(userId, 'pregunta_1');
        await this.sendQuestion(telefono, 1);
    }

    // ==================== PREGUNTAS ====================

    async sendQuestion(telefono, numeroP) {
        // Soporte para preguntas extra con clave string
        const pregunta = typeof numeroP === 'string'
            ? PREGUNTAS_EXTRA[numeroP]
            : PREGUNTAS[numeroP];

        if (!pregunta) {
            console.error(`Pregunta ${numeroP} no encontrada`);
            return;
        }

        if (pregunta.tipo === 'opciones') {
            if (pregunta.opciones.length > 3) {
                const sections = [{
                    title: 'Opciones',
                    rows: pregunta.opciones.map((opcion, index) => ({
                        id: `opcion_${index}`,
                        title: pregunta.titulos[index].length > 24
                            ? pregunta.titulos[index].substring(0, 21) + '...'
                            : pregunta.titulos[index],
                        description: opcion.length > 72 ? opcion.substring(0, 69) + '...' : opcion
                    }))
                }];

                await whatsappService.sendInteractiveList(
                    telefono,
                    pregunta.texto,
                    'Ver opciones',
                    sections
                );
            } else {
                await whatsappService.sendInteractiveButtons(
                    telefono,
                    pregunta.texto,
                    pregunta.titulos
                );
            }
        } else {
            await whatsappService.sendTextMessage(telefono, pregunta.texto);
        }
    }

    resolveResponse(pregunta, mensaje, messageType, interactiveId) {
        if (pregunta.tipo !== 'opciones') return mensaje;

        if (messageType === 'interactive' && interactiveId) {
            const idPrefix = interactiveId.startsWith('opcion_') ? 'opcion_' : 'btn_';
            const index = parseInt(interactiveId.replace(idPrefix, ''));
            if (!isNaN(index) && pregunta.opciones[index] !== undefined) {
                return pregunta.opciones[index];
            }
        }

        return mensaje;
    }

    validateOptionResponse(pregunta, mensaje, messageType) {
        if (pregunta.tipo === 'texto') return true;
        if (messageType === 'interactive') return true;

        if (messageType === 'text' && pregunta.tipo === 'opciones') {
            const matchedOption = pregunta.opciones.find(
                op => op.toLowerCase().trim() === mensaje.toLowerCase().trim()
            );
            return !!matchedOption;
        }

        return true;
    }

    async processQuestion(user, mensaje, telefono, estado, messageType, interactiveId) {
        const numeroP = parseInt(estado.split('_')[1]);
        const pregunta = PREGUNTAS[numeroP];

        // Caso especial: Q1 con texto libre → área personalizada (no está en la lista)
        if (numeroP === 1 && messageType === 'text') {
            const esOpcionValida = pregunta.opciones.some(
                op => op.toLowerCase().trim() === mensaje.toLowerCase().trim()
            );
            if (!esOpcionValida) {
                const reporte = await this.getReporteActivo(user.id);
                const reporteActivo = reporte || await this.getReporteActivo(user.id);
                await this.updateReporte(reporteActivo.id, 'area', 'Otro');
                await this.updateReporte(reporteActivo.id, 'area_otro', mensaje.trim());
                await this.updateUserState(user.id, 'pregunta_precio_caja');
                await this.delay(400);
                await this.sendQuestion(telefono, 'precio_caja');
                return;
            }
        }

        if (!this.validateOptionResponse(pregunta, mensaje, messageType)) {
            await whatsappService.sendTextMessage(
                telefono,
                'Por favor, selecciona una de las opciones disponibles para continuar.'
            );
            return;
        }

        const respuestaFinal = this.resolveResponse(pregunta, mensaje, messageType, interactiveId);

        // Validación especial para la fecha (pregunta 8)
        if (numeroP === 8) {
            const fechaMysql = this.parseDate(respuestaFinal);
            if (!fechaMysql) {
                await whatsappService.sendTextMessage(
                    telefono,
                    '⚠️ No pude entender esa fecha. Por favor escríbela así:\n\n• *1/01/2026*\n• *1-03-2026*\n\n📅 ¿Cuándo ocurrió?'
                );
                return;
            }
            const reporte = await this.getReporteActivo(user.id);
            const reporteActivo = reporte || await this.getReporteActivo(user.id);
            await this.updateReporte(reporteActivo.id, 'fecha_evento', fechaMysql);
            await this.updateUserState(user.id, 'pregunta_9');
            await this.delay(400);
            await this.sendQuestion(telefono, 9);
            return;
        }

        const reporte = await this.getReporteActivo(user.id);

        if (!reporte) {
            await this.createReporteNC(user.id);
        }

        const reporteActivo = reporte || await this.getReporteActivo(user.id);

        // Mapa pregunta → campo de BD
        const campoMap = {
            1: 'area',
            2: 'empresa_cliente',
            3: 'orden_produccion',
            4: 'referencia',
            // 5 y 6 tienen sub-estado propio para cantidad
            7: 'descripcion_nc',
            8: 'fecha_evento',
            9: 'nivel_impacto',
            10: 'accion_inmediata'
        };

        const campo = campoMap[numeroP];
        if (campo) {
            await this.updateReporte(reporteActivo.id, campo, respuestaFinal);
        }

        // Caso especial: Pregunta 1 "Otro"
        if (numeroP === 1 && respuestaFinal.toLowerCase().includes('otro')) {
            await this.updateUserState(user.id, 'pregunta_1_otro');
            await whatsappService.sendTextMessage(
                telefono,
                '📍 Por favor, indique cuál es el área o proceso:'
            );
            return;
        }

        // Caso especial: Pregunta 1 selección normal → ir a precio_caja
        if (numeroP === 1) {
            await this.updateUserState(user.id, 'pregunta_precio_caja');
            await this.delay(400);
            await this.sendQuestion(telefono, 'precio_caja');
            return;
        }

        // Caso especial: Pregunta 5 → selección de unidad para cantidad NC
        if (numeroP === 5) {
            const sufijo = respuestaFinal === 'Unidades' ? '_und' : '_lam';
            await this.updateUserState(user.id, `pregunta_5_cantidad${sufijo}`);
            const unidadTexto = respuestaFinal === 'Unidades' ? 'unidades' : 'láminas';
            await whatsappService.sendTextMessage(
                telefono,
                `📦 Escribe la cantidad de No Conformes en ${unidadTexto}:\n\n_Ej: ${respuestaFinal === 'Unidades' ? '20' : '10'}_`
            );
            return;
        }

        // Caso especial: Pregunta 6 → selección de unidad para cantidad total
        if (numeroP === 6) {
            const sufijo = respuestaFinal === 'Unidades' ? '_und' : '_lam';
            await this.updateUserState(user.id, `pregunta_6_cantidad${sufijo}`);
            const unidadTexto = respuestaFinal === 'Unidades' ? 'unidades' : 'láminas';
            await whatsappService.sendTextMessage(
                telefono,
                `📦 Escribe la cantidad total producida en ${unidadTexto}:\n\n_Ej: ${respuestaFinal === 'Unidades' ? '200' : '1000'}_`
            );
            return;
        }

        // Caso especial: Pregunta 9 → pedir descripción del impacto
        if (numeroP === 9) {
            await this.updateUserState(user.id, 'pregunta_9_descripcion');
            await this.delay(400);
            await whatsappService.sendTextMessage(
                telefono,
                '📝 Describe brevemente el impacto de esta eventualidad:'
            );
            return;
        }

        // Caso especial: Pregunta 10 "Sí" → pedir descripción de acción
        if (numeroP === 10 && respuestaFinal === 'Sí') {
            await this.updateUserState(user.id, 'pregunta_10_descripcion');
            await whatsappService.sendTextMessage(
                telefono,
                '📝 Describe brevemente la acción inmediata que se realizó:'
            );
            return;
        }

        // Caso especial: Pregunta 11 → foto o saltar
        if (numeroP === 11) {
            if (respuestaFinal === 'Sí') {
                await this.updateUserState(user.id, 'esperando_imagen');
                await whatsappService.sendTextMessage(
                    telefono,
                    '📷 Perfecto. Envía la foto ahora:'
                );
            } else {
                await this.updateUserState(user.id, 'revision');
                await this.delay(400);
                await this.sendSummary(telefono, user.id);
            }
            return;
        }

        // Avanzar a siguiente pregunta
        if (numeroP < 10) {
            await this.updateUserState(user.id, `pregunta_${numeroP + 1}`);
            await this.delay(400);
            await this.sendQuestion(telefono, numeroP + 1);
        } else {
            await this.updateUserState(user.id, 'pregunta_11');
            await this.delay(400);
            await this.sendQuestion(telefono, 11);
        }
    }

    async processAreaOtro(user, mensaje, telefono) {
        const reporte = await this.getReporteActivo(user.id);
        await this.updateReporte(reporte.id, 'area_otro', mensaje);

        await this.updateUserState(user.id, 'pregunta_precio_caja');
        await this.delay(400);
        await this.sendQuestion(telefono, 'precio_caja');
    }

    async processAccionDescripcion(user, mensaje, telefono) {
        const reporte = await this.getReporteActivo(user.id);
        await this.updateReporte(reporte.id, 'descripcion_accion', mensaje);

        await this.updateUserState(user.id, 'pregunta_11');
        await this.delay(400);
        await this.sendQuestion(telefono, 11);
    }

    async processPrecioCaja(user, mensaje, telefono, esCorreccion) {
        const valor = this.parsePrice(mensaje);
        if (valor === null || valor <= 0) {
            await whatsappService.sendTextMessage(
                telefono,
                '⚠️ No pude entender ese valor. Escribe solo el número:\n\n_Ej: 2000 o 2.000_'
            );
            return;
        }
        const reporte = await this.getReporteActivo(user.id);
        await this.updateReporte(reporte.id, 'precio_caja', valor);

        if (esCorreccion) {
            await this.updateUserState(user.id, 'revision');
            await this.delay(400);
            await this.sendSummary(telefono, user.id);
        } else {
            await this.updateUserState(user.id, 'pregunta_cantidad_cajas');
            await this.delay(400);
            await this.sendQuestion(telefono, 'cantidad_cajas');
        }
    }

    async processCantidadCajas(user, mensaje, telefono, esCorreccion) {
        const cantidad = parseInt(mensaje.trim(), 10);
        if (isNaN(cantidad) || cantidad <= 0) {
            await whatsappService.sendTextMessage(
                telefono,
                '⚠️ Por favor escribe un número entero válido.\n\n_Ej: 150_'
            );
            return;
        }
        const reporte = await this.getReporteActivo(user.id);
        await this.updateReporte(reporte.id, 'cantidad_cajas', cantidad);

        if (esCorreccion) {
            await this.updateUserState(user.id, 'revision');
            await this.delay(400);
            await this.sendSummary(telefono, user.id);
        } else {
            await this.updateUserState(user.id, 'pregunta_2');
            await this.delay(400);
            await this.sendQuestion(telefono, 2);
        }
    }

    async processImpactoDescripcion(user, mensaje, telefono, esCorreccion) {
        const reporte = await this.getReporteActivo(user.id);
        await this.updateReporte(reporte.id, 'descripcion_impacto', mensaje);

        if (esCorreccion) {
            await this.updateUserState(user.id, 'revision');
            await this.delay(400);
            await this.sendSummary(telefono, user.id);
        } else {
            await this.updateUserState(user.id, 'pregunta_10');
            await this.delay(400);
            await this.sendQuestion(telefono, 10);
        }
    }

    async processCantidadNcCantidad(user, mensaje, telefono, estado, esCorreccion) {
        const esUnidades = estado.includes('_und');
        const unidad = esUnidades ? 'und' : 'láminas';
        const valor = `${mensaje.trim()} ${unidad}`;

        const reporte = await this.getReporteActivo(user.id);
        await this.updateReporte(reporte.id, 'cantidad_nc', valor);

        if (esCorreccion) {
            await this.updateUserState(user.id, 'revision');
            await this.delay(400);
            await this.sendSummary(telefono, user.id);
        } else {
            await this.updateUserState(user.id, 'pregunta_6');
            await this.delay(400);
            await this.sendQuestion(telefono, 6);
        }
    }

    async processCantidadTotalCantidad(user, mensaje, telefono, estado, esCorreccion) {
        const esUnidades = estado.includes('_und');
        const unidad = esUnidades ? 'und' : 'láminas';
        const valor = `${mensaje.trim()} ${unidad}`;

        const reporte = await this.getReporteActivo(user.id);
        await this.updateReporte(reporte.id, 'cantidad_total', valor);

        if (esCorreccion) {
            await this.updateUserState(user.id, 'revision');
            await this.delay(400);
            await this.sendSummary(telefono, user.id);
        } else {
            await this.updateUserState(user.id, 'pregunta_7');
            await this.delay(400);
            await this.sendQuestion(telefono, 7);
        }
    }

    async processEsperandoImagen(user, telefono, messageType, mediaId, mensaje = '') {
        // Permite saltar con texto "saltar"
        if (messageType === 'text' && mensaje.toLowerCase().trim() === 'saltar') {
            await this.updateUserState(user.id, 'revision');
            await this.delay(400);
            await this.sendSummary(telefono, user.id);
            return;
        }

        if (messageType !== 'image' || !mediaId) {
            await whatsappService.sendTextMessage(
                telefono,
                '📷 Por favor envía una *imagen*. Si no tienes foto disponible, escribe *saltar*.'
            );
            return;
        }

        await whatsappService.sendTextMessage(telefono, '⏳ Subiendo la foto, un momento...');

        const reporte = await this.getReporteActivo(user.id);

        // Descargar la imagen desde WhatsApp
        const { buffer, mimeType } = await whatsappService.downloadMedia(mediaId);

        // Generar nombre único para el archivo en Drive
        const ext      = mimeType.split('/')[1] || 'jpg';
        const fileName = `NC_${reporte.id}_${Date.now()}.${ext}`;

        // Subir a Google Drive y obtener URL pública
        const driveUrl = await driveService.uploadImage(buffer, fileName, mimeType);

        // Guardar URL en la BD
        await this.updateReporte(reporte.id, 'evidencia_url', driveUrl);

        await this.updateUserState(user.id, 'revision');
        await whatsappService.sendTextMessage(telefono, '✅ Foto guardada correctamente.');
        await this.delay(400);
        await this.sendSummary(telefono, user.id);
    }

    // ==================== REVISION Y CORRECCION ====================

    async sendSummary(telefono, userId) {
        const reporte = await this.getReporteActivo(userId);

        const area = reporte.area_otro
            ? `${reporte.area} → ${reporte.area_otro}`
            : reporte.area;

        const accion = reporte.accion_inmediata === 'Sí' && reporte.descripcion_accion
            ? `Sí → ${reporte.descripcion_accion}`
            : reporte.accion_inmediata || 'No registrada';

        const precioCaja = reporte.precio_caja != null
            ? '$' + Number(reporte.precio_caja).toLocaleString('es-CO')
            : 'No registrado';

        let summary = '📋 *Resumen del reporte NC:*\n\n';
        summary += `*1.* Área: ${area || 'No registrada'}\n`;
        summary += `*2.* Precio de la caja: ${precioCaja}\n`;
        summary += `*3.* Cantidad de cajas: ${reporte.cantidad_cajas || 'No registrada'}\n`;
        summary += `*4.* Empresa cliente: ${reporte.empresa_cliente || 'No registrada'}\n`;
        summary += `*5.* Orden de producción: ${reporte.orden_produccion || 'No registrada'}\n`;
        summary += `*6.* Referencia: ${reporte.referencia || 'No registrada'}\n`;
        summary += `*7.* Cantidad No Conformes: ${reporte.cantidad_nc || 'No registrada'}\n`;
        summary += `*8.* Cantidad total producida: ${reporte.cantidad_total || 'No registrada'}\n`;
        summary += `*9.* Descripción NC: ${reporte.descripcion_nc || 'No registrada'}\n`;
        summary += `*10.* Fecha: ${this.formatDateForDisplay(reporte.fecha_evento) || 'No registrada'}\n`;
        summary += `*11.* Nivel de impacto: ${reporte.nivel_impacto || 'No registrado'}\n`;
        summary += `*12.* Descripción del impacto: ${reporte.descripcion_impacto || 'No registrada'}\n`;
        summary += `*13.* Acción inmediata: ${accion}\n`;
        summary += `*14.* Evidencia: ${reporte.evidencia_url ? reporte.evidencia_url : 'Sin foto'}\n`;

        await whatsappService.sendTextMessage(telefono, summary);
        await this.delay(800);

        await whatsappService.sendInteractiveButtons(
            telefono,
            '¿La información es correcta?',
            ['✅ Sí, confirmar', '✏️ Corregir dato']
        );
    }

    async processRevision(user, mensaje, telefono, messageType, interactiveId) {
        if (messageType === 'interactive') {
            if (interactiveId === 'btn_0') {
                // Confirmar y guardar
                const reporte = await this.getReporteActivo(user.id);
                await this.marcarReporteCompletado(reporte.id);
                await this.updateUserState(user.id, 'completado');
                await whatsappService.sendTextMessage(telefono, MENSAJES.CIERRE);
            } else if (interactiveId === 'btn_1') {
                // Corregir
                await this.updateUserState(user.id, 'seleccionar_correccion');
                await this.sendCorrectionList(telefono);
            }
        } else {
            await whatsappService.sendTextMessage(
                telefono,
                'Por favor, selecciona una de las opciones disponibles.'
            );
        }
    }

    async sendCorrectionList(telefono) {
        // WhatsApp permite máximo 10 filas en total entre todas las secciones
        const sections = [
            {
                title: 'Datos del proceso',
                rows: [
                    { id: 'corregir_1',             title: 'Área',         description: 'ÁREA O PROCESO' },
                    { id: 'corregir_precio_caja',    title: 'Precio caja',  description: 'PRECIO DE LA CAJA' },
                    { id: 'corregir_cantidad_cajas', title: 'Cant. cajas',  description: 'CANTIDAD DE CAJAS' },
                    { id: 'corregir_2',             title: 'Empresa',      description: 'EMPRESA DEL CLIENTE' },
                    { id: 'corregir_3',             title: 'Orden prod.',  description: 'NO. ORDEN DE PRODUCCIÓN' }
                ]
            },
            {
                title: 'Detalles del evento',
                rows: [
                    { id: 'corregir_4',             title: 'Referencia',   description: 'NO. REFERENCIA' },
                    { id: 'corregir_5',             title: 'Cant. NC',     description: 'CANTIDAD DE NO CONFORMES' },
                    { id: 'corregir_7',             title: 'Descripción',  description: 'DESCRIPCIÓN DE NC' },
                    { id: 'corregir_9',             title: 'Impacto',      description: 'NIVEL DE IMPACTO' },
                    { id: 'corregir_9_descripcion', title: 'Desc. impacto',description: 'DESCRIPCIÓN DEL IMPACTO' }
                ]
            }
        ];

        await whatsappService.sendInteractiveList(
            telefono,
            '¿Qué dato deseas corregir?',
            'Ver opciones',
            sections
        );
    }

    async processSeleccionCorreccion(user, mensaje, telefono, messageType, interactiveId) {
        if (messageType === 'interactive' && interactiveId && interactiveId.startsWith('corregir_')) {
            const parte = interactiveId.replace('corregir_', '');

            if (parte === 'precio_caja') {
                await this.updateUserState(user.id, 'corregir_precio_caja');
                await this.sendQuestion(telefono, 'precio_caja');
                return;
            }
            if (parte === 'cantidad_cajas') {
                await this.updateUserState(user.id, 'corregir_cantidad_cajas');
                await this.sendQuestion(telefono, 'cantidad_cajas');
                return;
            }
            if (parte === '9_descripcion') {
                await this.updateUserState(user.id, 'corregir_9_descripcion');
                await whatsappService.sendTextMessage(
                    telefono,
                    '📝 Escribe la nueva descripción del impacto:'
                );
                return;
            }

            const numeroP = parseInt(parte);
            if (!isNaN(numeroP) && numeroP >= 1 && numeroP <= 11) {
                await this.updateUserState(user.id, `corregir_${numeroP}`);
                await this.sendQuestion(telefono, numeroP);
                return;
            }
        }

        await whatsappService.sendTextMessage(
            telefono,
            'Por favor, selecciona el dato que deseas corregir.'
        );
    }

    async processCorreccion(user, mensaje, telefono, estado, messageType, interactiveId, mediaId = null) {
        const numeroP = parseInt(estado.replace('corregir_', ''));
        const pregunta = PREGUNTAS[numeroP];

        if (!this.validateOptionResponse(pregunta, mensaje, messageType)) {
            await whatsappService.sendTextMessage(
                telefono,
                'Por favor, selecciona una de las opciones disponibles para continuar.'
            );
            return;
        }

        const respuestaFinal = this.resolveResponse(pregunta, mensaje, messageType, interactiveId);

        // Validación especial para la fecha (corrección pregunta 8)
        if (numeroP === 8) {
            const fechaMysql = this.parseDate(respuestaFinal);
            if (!fechaMysql) {
                await whatsappService.sendTextMessage(
                    telefono,
                    '⚠️ No pude entender esa fecha. Por favor escríbela así:\n\n• *1/01/2026*\n• *1-01-2025*\n\n📅 ¿Cuándo ocurrió?'
                );
                return;
            }
            const reporte = await this.getReporteActivo(user.id);
            await this.updateReporte(reporte.id, 'fecha_evento', fechaMysql);
            await this.updateUserState(user.id, 'revision');
            await this.delay(400);
            await this.sendSummary(telefono, user.id);
            return;
        }

        const reporte = await this.getReporteActivo(user.id);

        const campoMap = {
            1: 'area',
            2: 'empresa_cliente',
            3: 'orden_produccion',
            4: 'referencia',
            // 5 y 6 tienen sub-estado propio para cantidad
            7: 'descripcion_nc',
            8: 'fecha_evento',
            9: 'nivel_impacto',
            10: 'accion_inmediata'
        };

        const campo = campoMap[numeroP];
        if (campo) {
            await this.updateReporte(reporte.id, campo, respuestaFinal);
        }

        // Caso especial: corrección de foto (pregunta 11)
        if (numeroP === 11) {
            if (respuestaFinal === 'Sí') {
                await this.updateUserState(user.id, 'esperando_imagen');
                await whatsappService.sendTextMessage(
                    telefono,
                    '📷 Envía la nueva foto de evidencia:'
                );
            } else {
                // Borrar foto anterior
                await this.updateReporte(reporte.id, 'evidencia_url', null);
                await this.updateUserState(user.id, 'revision');
                await this.delay(400);
                await this.sendSummary(telefono, user.id);
            }
            return;
        }

        // Caso especial: corrección de área "Otro"
        if (numeroP === 1 && respuestaFinal.toLowerCase().includes('otro')) {
            await this.updateUserState(user.id, 'corregir_1_otro');
            await whatsappService.sendTextMessage(
                telefono,
                '📍 Por favor, indique cuál es el área o proceso:'
            );
            return;
        }

        // Caso especial: corrección de cantidad NC (pregunta 5)
        if (numeroP === 5) {
            const sufijo = respuestaFinal === 'Unidades' ? '_und' : '_lam';
            await this.updateUserState(user.id, `corregir_5_cantidad${sufijo}`);
            const unidadTexto = respuestaFinal === 'Unidades' ? 'unidades' : 'láminas';
            await whatsappService.sendTextMessage(
                telefono,
                `📦 Escribe la cantidad de No Conformes en ${unidadTexto}:\n\n_Ej: ${respuestaFinal === 'Unidades' ? '20' : '10'}_`
            );
            return;
        }

        // Caso especial: corrección de cantidad total (pregunta 6)
        if (numeroP === 6) {
            const sufijo = respuestaFinal === 'Unidades' ? '_und' : '_lam';
            await this.updateUserState(user.id, `corregir_6_cantidad${sufijo}`);
            const unidadTexto = respuestaFinal === 'Unidades' ? 'unidades' : 'láminas';
            await whatsappService.sendTextMessage(
                telefono,
                `📦 Escribe la cantidad total producida en ${unidadTexto}:\n\n_Ej: ${respuestaFinal === 'Unidades' ? '200' : '1000'}_`
            );
            return;
        }

        // Caso especial: corrección de acción inmediata "Sí" (pregunta 10)
        if (numeroP === 10 && respuestaFinal === 'Sí') {
            await this.updateUserState(user.id, 'corregir_10_descripcion');
            await whatsappService.sendTextMessage(
                telefono,
                '📝 Describe brevemente la acción inmediata que se realizó:'
            );
            return;
        }

        // Limpiar descripcion_accion si corrigió a "No"
        if (numeroP === 10 && respuestaFinal === 'No') {
            await this.updateReporte(reporte.id, 'descripcion_accion', null);
        }

        await this.updateUserState(user.id, 'revision');
        await this.delay(400);
        await this.sendSummary(telefono, user.id);
    }

    // ==================== UTILIDADES ====================

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Interpreta un valor de precio ingresado por el usuario.
     * Acepta: "2000", "2.000", "2000.50", "2.000,50"
     * Retorna el número como float, o null si no es válido.
     */
    parsePrice(input) {
        const str = input.trim().replace(/\s/g, '');

        // Caso: separador de miles con punto y decimales con coma → "2.000,50"
        if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(str)) {
            return parseFloat(str.replace(/\./g, '').replace(',', '.'));
        }

        // Caso: separador de miles con punto sin decimales → "2.000"
        if (/^\d{1,3}(\.\d{3})+$/.test(str)) {
            return parseFloat(str.replace(/\./g, ''));
        }

        // Caso: número plano con decimales opcionales → "2000" o "2000.50"
        const valor = parseFloat(str.replace(',', '.'));
        return isNaN(valor) ? null : valor;
    }

    /**
     * Parsea una fecha escrita por el usuario y la convierte a YYYY-MM-DD para MySQL.
     * Acepta: DD/MM/AAAA, D/M/AAAA, DD-MM-AAAA, DDMMAAAA
     * Retorna null si el formato o la fecha no son válidos.
     */
    parseDate(input) {
        const str = input.trim();
        let dia, mes, anio;

        // Con separador: DD/MM/AAAA, D/M/AAAA, DD-MM-AAAA, D-M-AAAA
        const conSep = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
        if (conSep) {
            dia  = parseInt(conSep[1], 10);
            mes  = parseInt(conSep[2], 10);
            anio = parseInt(conSep[3], 10);
        }

        // Sin separador: DDMMAAAA (exactamente 8 dígitos)
        if (!conSep) {
            const sinSep = str.match(/^(\d{2})(\d{2})(\d{4})$/);
            if (sinSep) {
                dia  = parseInt(sinSep[1], 10);
                mes  = parseInt(sinSep[2], 10);
                anio = parseInt(sinSep[3], 10);
            }
        }

        if (!dia || !mes || !anio) return null;

        // Validar rangos básicos
        if (mes < 1 || mes > 12)   return null;
        if (dia < 1 || dia > 31)   return null;
        if (anio < 2000 || anio > 2100) return null;

        // Validar que la fecha realmente exista (ej: 30/02)
        const fechaObj = new Date(anio, mes - 1, dia);
        if (
            fechaObj.getFullYear() !== anio ||
            fechaObj.getMonth()    !== mes - 1 ||
            fechaObj.getDate()     !== dia
        ) return null;

        // Formato MySQL: YYYY-MM-DD
        return `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
    }

    /**
     * Convierte la fecha de MySQL (DATE → objeto Date o string) a DD/MM/AAAA.
     * mysql2 devuelve columnas DATE como objetos Date de JavaScript.
     */
    formatDateForDisplay(mysqlDate) {
        if (!mysqlDate) return null;

        // mysql2 devuelve DATE como objeto Date → usar métodos UTC para evitar desfase de zona horaria
        if (mysqlDate instanceof Date) {
            const dia  = String(mysqlDate.getUTCDate()).padStart(2, '0');
            const mes  = String(mysqlDate.getUTCMonth() + 1).padStart(2, '0');
            const anio = mysqlDate.getUTCFullYear();
            return `${dia}/${mes}/${anio}`;
        }

        // Si viene como string "YYYY-MM-DD"
        const str = String(mysqlDate).substring(0, 10);
        const [anio, mes, dia] = str.split('-');
        if (!anio || !mes || !dia) return String(mysqlDate);
        return `${dia}/${mes}/${anio}`;
    }
}

module.exports = new ConversationService();
