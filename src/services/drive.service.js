const { google } = require('googleapis');
const { Readable } = require('stream');
const { GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY, GOOGLE_DRIVE_FOLDER_ID } = require('../config/google');

class DriveService {

    constructor() {
        const auth = new google.auth.JWT({
            email: GOOGLE_CLIENT_EMAIL,
            key:   GOOGLE_PRIVATE_KEY,
            scopes: ['https://www.googleapis.com/auth/drive.file']
        });

        this.drive = google.drive({ version: 'v3', auth });
    }

    /**
     * Sube un buffer de imagen a Google Drive dentro de la carpeta configurada.
     * Devuelve la URL pública (webViewLink) del archivo creado.
     */
    async uploadImage(imageBuffer, fileName, mimeType) {
        console.log(`   ☁️  Subiendo imagen a Drive: ${fileName}`);

        const stream = Readable.from(imageBuffer);

        const createRes = await this.drive.files.create({
            requestBody: {
                name:    fileName,
                parents: [GOOGLE_DRIVE_FOLDER_ID]
            },
            media: {
                mimeType,
                body: stream
            },
            fields: 'id, webViewLink'
        });

        const fileId = createRes.data.id;

        // Hacer el archivo accesible para cualquiera con el enlace
        await this.drive.permissions.create({
            fileId,
            requestBody: {
                role: 'reader',
                type: 'anyone'
            }
        });

        console.log(`   ✅ Imagen subida. ID: ${fileId}`);
        return createRes.data.webViewLink;
    }
}

module.exports = new DriveService();
