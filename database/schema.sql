-- ============================================
-- ESQUEMA DE BASE DE DATOS
-- Chatbot Registro NC - CARBOLSAS
-- ============================================


-- ============================================
-- TABLA: usuarios
-- Controla el estado de la conversación
-- ============================================
CREATE TABLE IF NOT EXISTS usuarios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    telefono VARCHAR(20) UNIQUE NOT NULL COMMENT 'Número de WhatsApp del usuario',
    estado_conversacion VARCHAR(50) DEFAULT 'inicio' COMMENT 'Estado actual del flujo conversacional',
    fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'Fecha de primer contacto',
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_telefono (telefono),
    INDEX idx_estado (estado_conversacion)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================
-- TABLA: reportes_nc
-- Almacena cada reporte de No Conformidad
-- ============================================
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
    accion_inmediata VARCHAR(10) COMMENT 'Si / No',
    descripcion_accion TEXT COMMENT 'Descripción de la acción inmediata si aplica',
    estado VARCHAR(20) DEFAULT 'pendiente' COMMENT 'pendiente / revisado / cerrado',
    fecha_reporte TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'Fecha en que se registró el reporte',
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    INDEX idx_usuario (usuario_id),
    INDEX idx_area (area),
    INDEX idx_estado (estado),
    INDEX idx_fecha (fecha_reporte)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================
-- VISTA: reporte_nc_completo
-- Vista útil para consultar todos los reportes
-- ============================================
CREATE OR REPLACE VIEW reporte_nc_completo AS
SELECT
    r.id,
    u.telefono,
    r.area,
    COALESCE(r.area_otro, '') AS area_detalle,
    r.empresa_cliente,
    r.orden_produccion,
    r.referencia,
    r.descripcion_nc,
    r.fecha_evento,
    r.nivel_impacto,
    r.accion_inmediata,
    r.descripcion_accion,
    r.estado,
    r.fecha_reporte
FROM reportes_nc r
JOIN usuarios u ON r.usuario_id = u.id
ORDER BY r.fecha_reporte DESC;


-- ============================================
-- CONSULTAS ÚTILES
-- ============================================

-- Ver todos los reportes NC
-- SELECT * FROM reporte_nc_completo;

-- Ver reportes por área
-- SELECT * FROM reporte_nc_completo WHERE area = 'Corte';

-- Ver reportes de alto impacto
-- SELECT * FROM reporte_nc_completo WHERE nivel_impacto = 'Alto';

-- Ver reportes pendientes
-- SELECT * FROM reporte_nc_completo WHERE estado = 'pendiente';

-- Estadísticas por área
-- SELECT area, COUNT(*) as total FROM reportes_nc GROUP BY area ORDER BY total DESC;

-- Estadísticas por nivel de impacto
-- SELECT nivel_impacto, COUNT(*) as total FROM reportes_nc GROUP BY nivel_impacto;
