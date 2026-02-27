const MENSAJES = {
    BIENVENIDA: `👋 Hola.
En este espacio podrás registrar cualquier situación presentada con respecto a la calidad en los procesos (errores, novedades, fallas o hallazgos).

¡Tu reporte nos ayuda a mejorar!
Vamos a iniciar.`,

    CIERRE: `✅ *Registro guardado con éxito.*

Gracias por reportar. Esto nos ayuda a mejorar continuamente 🙌
El área de calidad revisará el caso.`
};

const PREGUNTAS = {
    1: {
        numero: 1,
        categoria: 'ÁREA O PROCESO',
        texto: '📍 ¿En qué área ocurrió la situación?',
        tipo: 'opciones',
        titulos: [
            'Ventas',
            'Corte',
            'Troquelado',
            'Impresión',
            'Descatornado',
            'Pegado',
            'Otro'
        ],
        opciones: [
            'Ventas',
            'Corte',
            'Troquelado',
            'Impresión',
            'Descatornado',
            'Pegado',
            'Otro (Cuál)'
        ]
    },
    2: {
        numero: 2,
        categoria: 'EMPRESA DEL CLIENTE',
        texto: '🏢 Empresa del cliente relacionada con la eventualidad.\n\n(Escribe el nombre de la empresa)',
        tipo: 'texto'
    },
    3: {
        numero: 3,
        categoria: 'NO. ORDEN DE PRODUCCIÓN',
        texto: '🔢 Ingresa el número de orden de producción:',
        tipo: 'texto'
    },
    4: {
        numero: 4,
        categoria: 'NO. REFERENCIA',
        texto: '🔢 Ingresa el número de referencia:',
        tipo: 'texto'
    },
    5: {
        numero: 5,
        categoria: 'DESCRIPCIÓN DE NC',
        texto: `✍️ Describe brevemente lo ocurrido:

_Ej: Impresión corrida, faltante en pedido, daño en máquina, plancha desactualizada._`,
        tipo: 'texto'
    },
    6: {
        numero: 6,
        categoria: 'FECHA DE LA EVENTUALIDAD',
        texto: '📅 ¿Cuándo ocurrió?\n\nEscribe la fecha así:\n• *15/03/2024*\n• *15-03-2024*',
        tipo: 'texto'
    },
    7: {
        numero: 7,
        categoria: 'NIVEL DE IMPACTO',
        texto: '🚦 ¿Qué nivel de impacto tuvo la eventualidad?',
        tipo: 'opciones',
        titulos: [
            '🔴 Alto',
            '🟡 Medio',
            '🟢 Bajo'
        ],
        opciones: [
            'Alto (afecta cliente o detiene proceso)',
            'Medio (requiere corrección interna)',
            'Bajo (no afecta entrega)'
        ]
    },
    8: {
        numero: 8,
        categoria: 'ACCIÓN INMEDIATA',
        texto: '🛠️ ¿Se realizó alguna acción inmediata?',
        tipo: 'opciones',
        titulos: [
            'Sí',
            'No'
        ],
        opciones: [
            'Sí',
            'No'
        ]
    },
    9: {
        numero: 9,
        categoria: 'EVIDENCIA FOTOGRÁFICA',
        texto: '📷 ¿Deseas adjuntar una foto como evidencia de la NC?',
        tipo: 'opciones',
        titulos: [
            '📷 Sí, adjuntar',
            '⏭️ No, continuar'
        ],
        opciones: [
            'Sí',
            'No'
        ]
    }
};

module.exports = {
    MENSAJES,
    PREGUNTAS
};
