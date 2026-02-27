-- ============================================
-- MIGRACIÓN: Añadir columna evidencia_url
-- Chatbot Registro NC - CARBOLSAS
-- Ejecutar una sola vez sobre la BD existente
-- ============================================

ALTER TABLE reportes_nc
    ADD COLUMN evidencia_url VARCHAR(500) NULL
        COMMENT 'URL pública del archivo en Google Drive'
    AFTER descripcion_accion;
