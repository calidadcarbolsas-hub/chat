const { google } = require('googleapis');
const { Readable } = require('stream');
const { GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY, GOOGLE_OWNER_EMAIL } = require('../config/google');

const FOLDER_NAME = 'Evidencias NC - CARBOLSAS';

class DriveService {

    constructor() {
        const auth = new google.auth.JWT({
            email: GOOGLE_CLIENT_EMAIL,
            key:   GOOGLE_PRIVATE_KEY,
            // Scope completo para que la service account pueda crear
            // y gestionar su propia carpeta sin depender de permisos externos
            scopes: ['https://www.googleapis.com/auth/drive']
        });

        this.drive    = google.drive({ version: 'v3', auth });
        this.folderId = null; // Cache para no buscar la carpeta en cada subida
    }

    /**
     * Busca la carpeta "Evidencias NC - CARBOLSAS" en el Drive de la service account.
     * Si no existe la crea. Guarda el ID en cache.
     */
    async getOrCreateFolder() {
        if (this.folderId) return this.folderId;

        // Buscar carpeta existente
        const searchRes = await this.drive.files.list({
            q:      `name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
            fields: 'files(id, name)',
            spaces: 'drive'
        });

        if (searchRes.data.files.length > 0) {
            this.folderId = searchRes.data.files[0].id;
            console.log(`   📁 Carpeta Drive encontrada: ${this.folderId}`);
            return this.folderId;
        }

        // No existe → crearla
        const folderRes = await this.drive.files.create({
            requestBody: {
                name:     FOLDER_NAME,
                mimeType: 'application/vnd.google-apps.folder'
            },
            fields: 'id'
        });

        this.folderId = folderRes.data.id;
        console.log(`   📁 Carpeta Drive creada: ${FOLDER_NAME} (${this.folderId})`);

        // Compartir la carpeta con el dueño real para que aparezca en su Drive
        if (GOOGLE_OWNER_EMAIL) {
            await this.drive.permissions.create({
                fileId: this.folderId,
                requestBody: {
                    role:         'writer',
                    type:         'user',
                    emailAddress: GOOGLE_OWNER_EMAIL
                },
                sendNotificationEmail: false
            });
            console.log(`   🔗 Carpeta compartida con: ${GOOGLE_OWNER_EMAIL}`);
        }

        return this.folderId;
    }

    /**
     * Sube un buffer de imagen al Drive de la service account.
     * Devuelve la URL pública (webViewLink) del archivo creado.
     */
    async uploadImage(imageBuffer, fileName, mimeType) {
        console.log(`   ☁️  Subiendo imagen a Drive: ${fileName}`);

        const folderId = await this.getOrCreateFolder();
        const stream   = Readable.from(imageBuffer);

        const createRes = await this.drive.files.create({
            requestBody: {
                name:    fileName,
                parents: [folderId]
            },
            media: {
                mimeType,
                body: stream
            },
            fields: 'id, webViewLink'
        });

        const fileId = createRes.data.id;

        // Acceso público con el enlace
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
