const express = require('express');
const router = express.Router();
const webhookController = require('../controllers/webhook.controller');

// GET - Verificación del webhook por Meta
router.get('/', (req, res) => webhookController.verify(req, res));

// POST - Recibir mensajes de WhatsApp
router.post('/', (req, res) => webhookController.receiveMessage(req, res));

module.exports = router;
