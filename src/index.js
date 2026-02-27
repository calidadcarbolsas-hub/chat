require('dotenv').config();

const express = require('express');
const webhookRoutes = require('./routes/webhook.routes');
const { initDatabase } = require('./config/database');

const app = express();
const PORT = process.env.PORT || 3000;

console.log('');
console.log('===========================================');
console.log('🤖 CHATBOT REGISTRO NC - CARBOLSAS');
console.log('===========================================');
console.log('');
console.log('📋 CONFIGURACIÓN:');
console.log('   PHONE_NUMBER_ID:', process.env.PHONE_NUMBER_ID);
console.log('   VERIFY_TOKEN:', process.env.VERIFY_TOKEN);
console.log('   WHATSAPP_TOKEN:', process.env.WHATSAPP_TOKEN ? '✅ Configurado (' + process.env.WHATSAPP_TOKEN.substring(0, 20) + '...)' : '❌ NO CONFIGURADO');
console.log('   DB_HOST:', process.env.DB_HOST);
console.log('   DB_NAME:', process.env.DB_NAME);
console.log('   PORT:', PORT);
console.log('');

// Middleware para parsear JSON
app.use(express.json());

// Middleware para loggear todas las requests
app.use((req, res, next) => {
    console.log(`📥 ${req.method} ${req.path}`);
    next();
});

// Rutas del webhook de WhatsApp
app.use('/webhook', webhookRoutes);

// Ruta de health check
app.get('/', (req, res) => {
    console.log('🏥 Health check solicitado');
    res.json({
        status: 'ok',
        message: 'Chatbot Registro NC - CARBOLSAS',
        timestamp: new Date().toISOString()
    });
});

// Iniciar servidor
async function startServer() {
    try {
        // Inicializar conexión a base de datos
        console.log('🔌 Conectando a base de datos...');
        await initDatabase();
        console.log('✅ Base de datos conectada correctamente');
        console.log('');

        app.listen(PORT, () => {
            console.log('===========================================');
            console.log(`🚀 SERVIDOR CARBOLSAS LISTO EN PUERTO ${PORT}`);
            console.log('===========================================');
            console.log('');
            console.log('📱 Webhook URL: http://localhost:' + PORT + '/webhook');
            console.log('');
            console.log('🔧 Para usar con ngrok:');
            console.log('   1. Ejecuta: ngrok http ' + PORT);
            console.log('   2. Copia la URL https://xxx.ngrok.io');
            console.log('   3. Configura en Meta: https://xxx.ngrok.io/webhook');
            console.log('');
            console.log('⏳ Esperando mensajes de WhatsApp...');
            console.log('');
        });
    } catch (error) {
        console.error('');
        console.error('❌❌❌ ERROR AL INICIAR ❌❌❌');
        console.error('Mensaje:', error.message);
        console.error('Stack:', error.stack);
        process.exit(1);
    }
}

startServer();
