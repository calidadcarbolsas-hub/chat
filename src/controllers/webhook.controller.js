const conversationService = require('../services/conversation.service');
const { VERIFY_TOKEN } = require('../config/whatsapp');

// Cache en memoria para deduplicación de mensajes
const processedMessages = new Set();
const MAX_CACHE_SIZE = 1000;
// Máxima antigüedad permitida para un mensaje (en segundos)
const MAX_MESSAGE_AGE_SECONDS = 120;

class WebhookController {

    // Verificación del webhook (GET)
    verify(req, res) {
        console.log('===========================================');
        console.log('🔔 VERIFICACION DE WEBHOOK RECIBIDA');
        console.log('===========================================');

        const mode = req.query['hub.mode'];
        const token = req.query['hub.verify_token'];
        const challenge = req.query['hub.challenge'];

        console.log('Mode:', mode);
        console.log('Token recibido:', token);
        console.log('Token esperado:', VERIFY_TOKEN);
        console.log('Challenge:', challenge);

        if (mode && token) {
            if (mode === 'subscribe' && token === VERIFY_TOKEN) {
                console.log('✅ Webhook verificado correctamente');
                return res.status(200).send(challenge);
            }
        }

        console.log('❌ Verificación de webhook fallida');
        return res.sendStatus(403);
    }

    // Recibir mensajes (POST)
    async receiveMessage(req, res) {
        console.log('');
        console.log('===========================================');
        console.log('📨 NUEVO MENSAJE RECIBIDO EN WEBHOOK');
        console.log('===========================================');
        console.log('Hora:', new Date().toLocaleString());

        try {
            const body = req.body;

            console.log('');
            console.log('📦 BODY COMPLETO:');
            console.log(JSON.stringify(body, null, 2));
            console.log('');

            // Verificar que es un evento de WhatsApp
            if (body.object !== 'whatsapp_business_account') {
                console.log('⚠️ No es un evento de WhatsApp Business, object:', body.object);
                return res.sendStatus(404);
            }

            console.log('✅ Es un evento de WhatsApp Business');

            // Responder inmediatamente a Meta (evitar timeout)
            res.sendStatus(200);
            console.log('✅ Respondido 200 a Meta');

            // Procesar el mensaje de forma asíncrona
            const entry = body.entry?.[0];
            const changes = entry?.changes?.[0];
            const value = changes?.value;

            console.log('');
            console.log('📋 VALUE:', JSON.stringify(value, null, 2));

            if (!value?.messages) {
                console.log('ℹ️ Evento sin mensajes (posible status update)');
                console.log('===========================================');
                return;
            }

            const message = value.messages[0];
            const from = message.from;
            const messageId = message.id;

            console.log('');
            console.log('👤 DE:', from);
            console.log('🆔 MESSAGE ID:', messageId);
            console.log('📝 TIPO:', message.type);

            // ============ PROTECCIÓN 1: Rechazar mensajes antiguos ============
            const messageTimestamp = parseInt(message.timestamp);
            const currentTimestamp = Math.floor(Date.now() / 1000);
            const messageAge = currentTimestamp - messageTimestamp;

            console.log(`⏱️ Antigüedad del mensaje: ${messageAge} segundos`);

            if (messageAge > MAX_MESSAGE_AGE_SECONDS) {
                console.log(`⛔ MENSAJE DESCARTADO - Demasiado antiguo (${messageAge}s > ${MAX_MESSAGE_AGE_SECONDS}s)`);
                console.log('   Probable reintento de Meta tras caída del servidor');
                console.log('===========================================');
                return;
            }

            // ============ PROTECCIÓN 2: Deduplicación por messageId ============
            if (processedMessages.has(messageId)) {
                console.log(`⛔ MENSAJE DESCARTADO - Duplicado: ${messageId}`);
                console.log('===========================================');
                return;
            }

            processedMessages.add(messageId);

            // Limpiar cache si crece demasiado (eliminar los más antiguos)
            if (processedMessages.size > MAX_CACHE_SIZE) {
                const idsToRemove = [...processedMessages].slice(0, MAX_CACHE_SIZE / 2);
                idsToRemove.forEach(id => processedMessages.delete(id));
                console.log(`🧹 Cache limpiada: eliminados ${idsToRemove.length} IDs antiguos`);
            }

            // Extraer el contenido del mensaje según su tipo
            let messageContent = '';
            const messageType = message.type;
            let interactiveId = null;

            switch (message.type) {
                case 'text':
                    messageContent = message.text.body;
                    break;

                case 'interactive':
                    if (message.interactive.type === 'button_reply') {
                        messageContent = message.interactive.button_reply.title;
                        interactiveId = message.interactive.button_reply.id;
                    } else if (message.interactive.type === 'list_reply') {
                        messageContent = message.interactive.list_reply.description ||
                                        message.interactive.list_reply.title;
                        interactiveId = message.interactive.list_reply.id;
                    }
                    break;

                case 'button':
                    messageContent = message.button.text;
                    break;

                default:
                    messageContent = '[Tipo de mensaje no soportado]';
            }

            console.log('💬 CONTENIDO:', messageContent);
            console.log('🔘 TIPO MENSAJE:', messageType);
            console.log('🆔 INTERACTIVE ID:', interactiveId);
            console.log('');
            console.log('🚀 Procesando mensaje con conversationService...');

            // Procesar el mensaje
            await conversationService.handleMessage(from, messageContent, messageId, messageType, interactiveId);

            console.log('✅ Mensaje procesado correctamente');
            console.log('===========================================');
            console.log('');

        } catch (error) {
            console.log('');
            console.log('❌❌❌ ERROR EN WEBHOOK ❌❌❌');
            console.error('Mensaje:', error.message);
            console.error('Stack:', error.stack);
            console.log('===========================================');
        }
    }
}

module.exports = new WebhookController();
