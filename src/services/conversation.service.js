const { getPool } = require('../config/database');
const whatsappService = require('./whatsapp.service');
const { PREGUNTAS, MENSAJES } = require('../utils/questions');

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
        await pool.execute(
            'UPDATE usuarios SET estado_conversacion = ? WHERE id = ?',
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
            'referencia', 'descripcion_nc', 'fecha_evento',
            'nivel_impacto', 'accion_inmediata', 'descripcion_accion'
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

    // ==================== HANDLER PRINCIPAL ====================

    async handleMessage(telefono, mensaje, messageId, messageType, interactiveId) {
        console.log('');
        console.log('🤖 CONVERSATION SERVICE - handleMessage');
        console.log('   Telefono:', telefono);
        console.log('   Mensaje:', mensaje);
        console.log('   MessageId:', messageId);
        console.log('   MessageType:', messageType);
        console.log('   InteractiveId:', interactiveId);

        try {
            console.log('   📖 Marcando mensaje como leído...');
            await whatsappService.markAsRead(messageId);

            console.log('   👤 Obteniendo/creando usuario...');
            const user = await this.getOrCreateUser(telefono);
            console.log('   ✅ Usuario:', JSON.stringify(user));

            console.log('   🔄 Procesando estado...');
            await this.processState(user, mensaje, telefono, messageType, interactiveId);

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

    async processState(user, mensaje, telefono, messageType, interactiveId) {
        const estado = user.estado_conversacion;
        console.log('   📍 Estado actual:', estado);

        // Estados de corrección
        if (estado.startsWith('corregir_')) {
            await this.processCorreccion(user, mensaje, telefono, estado, messageType, interactiveId);
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
                await this.processQuestion(user, mensaje, telefono, estado, messageType, interactiveId);
                break;

            case 'pregunta_1_otro':
                await this.processAreaOtro(user, mensaje, telefono);
                break;

            case 'pregunta_8_descripcion':
                await this.processAccionDescripcion(user, mensaje, telefono);
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
        const pregunta = PREGUNTAS[numeroP];

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

        if (!this.validateOptionResponse(pregunta, mensaje, messageType)) {
            await whatsappService.sendTextMessage(
                telefono,
                'Por favor, selecciona una de las opciones disponibles para continuar.'
            );
            return;
        }

        const respuestaFinal = this.resolveResponse(pregunta, mensaje, messageType, interactiveId);

        // Validación especial para la fecha (pregunta 6)
        if (numeroP === 6) {
            const fechaMysql = this.parseDate(respuestaFinal);
            if (!fechaMysql) {
                await whatsappService.sendTextMessage(
                    telefono,
                    '⚠️ No pude entender esa fecha. Por favor escríbela así:\n\n• *15/03/2024*\n• *15-03-2024*\n• *15032024*\n\n📅 ¿Cuándo ocurrió?'
                );
                return;
            }
            const reporte = await this.getReporteActivo(user.id);
            const reporteActivo = reporte || await this.getReporteActivo(user.id);
            await this.updateReporte(reporteActivo.id, 'fecha_evento', fechaMysql);
            await this.updateUserState(user.id, 'pregunta_7');
            await this.delay(400);
            await this.sendQuestion(telefono, 7);
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
            5: 'descripcion_nc',
            6: 'fecha_evento',
            7: 'nivel_impacto',
            8: 'accion_inmediata'
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

        // Caso especial: Pregunta 8 "Sí" → pedir descripción de acción
        if (numeroP === 8 && respuestaFinal === 'Sí') {
            await this.updateUserState(user.id, 'pregunta_8_descripcion');
            await whatsappService.sendTextMessage(
                telefono,
                '📝 Describe brevemente la acción inmediata que se realizó:'
            );
            return;
        }

        // Avanzar a siguiente pregunta o ir a revisión
        if (numeroP < 8) {
            await this.updateUserState(user.id, `pregunta_${numeroP + 1}`);
            await this.delay(400);
            await this.sendQuestion(telefono, numeroP + 1);
        } else {
            await this.updateUserState(user.id, 'revision');
            await this.delay(400);
            await this.sendSummary(telefono, user.id);
        }
    }

    async processAreaOtro(user, mensaje, telefono) {
        const reporte = await this.getReporteActivo(user.id);
        await this.updateReporte(reporte.id, 'area_otro', mensaje);

        await this.updateUserState(user.id, 'pregunta_2');
        await this.delay(400);
        await this.sendQuestion(telefono, 2);
    }

    async processAccionDescripcion(user, mensaje, telefono) {
        const reporte = await this.getReporteActivo(user.id);
        await this.updateReporte(reporte.id, 'descripcion_accion', mensaje);

        await this.updateUserState(user.id, 'revision');
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

        let summary = '📋 *Resumen del reporte NC:*\n\n';
        summary += `*1.* Área: ${area || 'No registrada'}\n`;
        summary += `*2.* Empresa cliente: ${reporte.empresa_cliente || 'No registrada'}\n`;
        summary += `*3.* Orden de producción: ${reporte.orden_produccion || 'No registrada'}\n`;
        summary += `*4.* Referencia: ${reporte.referencia || 'No registrada'}\n`;
        summary += `*5.* Descripción NC: ${reporte.descripcion_nc || 'No registrada'}\n`;
        summary += `*6.* Fecha: ${this.formatDateForDisplay(reporte.fecha_evento) || 'No registrada'}\n`;
        summary += `*7.* Nivel de impacto: ${reporte.nivel_impacto || 'No registrado'}\n`;
        summary += `*8.* Acción inmediata: ${accion}\n`;

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
        const rows = [];
        for (let i = 1; i <= 8; i++) {
            const pregunta = PREGUNTAS[i];
            rows.push({
                id: `corregir_${i}`,
                title: `Paso ${i}`,
                description: pregunta.categoria.length > 72
                    ? pregunta.categoria.substring(0, 69) + '...'
                    : pregunta.categoria
            });
        }

        await whatsappService.sendInteractiveList(
            telefono,
            '¿Qué dato deseas corregir?',
            'Ver opciones',
            [{ title: 'Campos del reporte', rows }]
        );
    }

    async processSeleccionCorreccion(user, mensaje, telefono, messageType, interactiveId) {
        if (messageType === 'interactive' && interactiveId && interactiveId.startsWith('corregir_')) {
            const numeroP = parseInt(interactiveId.replace('corregir_', ''));
            if (numeroP >= 1 && numeroP <= 8) {
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

    async processCorreccion(user, mensaje, telefono, estado, messageType, interactiveId) {
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

        // Validación especial para la fecha (corrección pregunta 6)
        if (numeroP === 6) {
            const fechaMysql = this.parseDate(respuestaFinal);
            if (!fechaMysql) {
                await whatsappService.sendTextMessage(
                    telefono,
                    '⚠️ No pude entender esa fecha. Por favor escríbela así:\n\n• *15/03/2024*\n• *15-03-2024*\n• *15032024*\n\n📅 ¿Cuándo ocurrió?'
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
            5: 'descripcion_nc',
            6: 'fecha_evento',
            7: 'nivel_impacto',
            8: 'accion_inmediata'
        };

        const campo = campoMap[numeroP];
        if (campo) {
            await this.updateReporte(reporte.id, campo, respuestaFinal);
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

        // Caso especial: corrección de acción inmediata "Sí"
        if (numeroP === 8 && respuestaFinal === 'Sí') {
            await this.updateUserState(user.id, 'corregir_8_descripcion');
            await whatsappService.sendTextMessage(
                telefono,
                '📝 Describe brevemente la acción inmediata que se realizó:'
            );
            return;
        }

        // Limpiar descripcion_accion si corrigió a "No"
        if (numeroP === 8 && respuestaFinal === 'No') {
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
     * Convierte YYYY-MM-DD (MySQL) a DD/MM/AAAA para mostrar al usuario.
     */
    formatDateForDisplay(mysqlDate) {
        if (!mysqlDate) return null;
        const str = String(mysqlDate).substring(0, 10); // "2024-03-15"
        const [anio, mes, dia] = str.split('-');
        if (!anio || !mes || !dia) return mysqlDate;
        return `${dia}/${mes}/${anio}`;
    }
}

module.exports = new ConversationService();
