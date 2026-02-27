const mysql = require('mysql2/promise');

let pool = null;

const dbPort = parseInt(process.env.DB_PORT, 10);

const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: isNaN(dbPort) ? 3306 : dbPort,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

async function initDatabase() {
    try {
        pool = mysql.createPool(dbConfig);

        const connection = await pool.getConnection();
        console.log('📊 Conexión a MySQL establecida - CARBOLSACHAT');
        connection.release();

        await createTables();

        return pool;
    } catch (error) {
        console.error('Error conectando a MySQL:', error.message);
        throw error;
    }
}

async function createTables() {
    const createUsuariosTable = `
        CREATE TABLE IF NOT EXISTS usuarios (
            id INT AUTO_INCREMENT PRIMARY KEY,
            telefono VARCHAR(20) UNIQUE NOT NULL COMMENT 'Número de WhatsApp del usuario',
            estado_conversacion VARCHAR(50) DEFAULT 'inicio' COMMENT 'Estado actual del flujo conversacional',
            fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_telefono (telefono),
            INDEX idx_estado (estado_conversacion)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `;

    const createReportesNCTable = `
        CREATE TABLE IF NOT EXISTS reportes_nc (
            id INT AUTO_INCREMENT PRIMARY KEY,
            usuario_id INT NOT NULL COMMENT 'Referencia al usuario que reporta',
            area VARCHAR(100) COMMENT 'Área o proceso donde ocurrió la NC',
            area_otro VARCHAR(255) COMMENT 'Descripción si el área fue Otro',
            empresa_cliente VARCHAR(255) COMMENT 'Empresa del cliente relacionada',
            orden_produccion VARCHAR(100) COMMENT 'Número de orden de producción',
            referencia VARCHAR(100) COMMENT 'Número de referencia',
            descripcion_nc TEXT COMMENT 'Descripción breve de lo ocurrido',
            fecha_evento DATE COMMENT 'Fecha en que ocurrió la eventualidad',
            nivel_impacto VARCHAR(50) COMMENT 'Alto / Medio / Bajo',
            accion_inmediata VARCHAR(10) COMMENT 'Sí / No',
            descripcion_accion TEXT COMMENT 'Descripción de la acción inmediata si aplica',
            estado VARCHAR(20) DEFAULT 'pendiente' COMMENT 'pendiente / revisado / cerrado',
            fecha_reporte TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
            INDEX idx_usuario (usuario_id),
            INDEX idx_area (area),
            INDEX idx_estado (estado),
            INDEX idx_fecha (fecha_reporte)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `;

    try {
        await pool.execute(createUsuariosTable);
        await pool.execute(createReportesNCTable);
        console.log('📋 Tablas CARBOLSAS verificadas/creadas correctamente');
    } catch (error) {
        console.error('Error creando tablas:', error.message);
        throw error;
    }
}

function getPool() {
    if (!pool) {
        throw new Error('Base de datos no inicializada. Llama a initDatabase() primero.');
    }
    return pool;
}

module.exports = {
    initDatabase,
    getPool
};
